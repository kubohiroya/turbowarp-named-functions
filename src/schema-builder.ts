/**
 * Lowers `define schema` block stacks into the canonical JSON Schema objects consumed by
 * `validateAgainstSchema`.
 *
 * The builder is declarative: it reads literal block fields before any script runs and never
 * executes the blocks it reads. Every schema it produces is checked with `validateSchemaDefinition`,
 * so a block-built schema and a hand-written JSON one go through one validator and one diagnostic
 * format.
 */
import {readLiteralInput, readMenuField, stackBelow} from './block-literals.js';
import type {RuntimeTarget, SerializedBlock} from './runtime-types.js';
import {validateAgainstSchema, validateSchemaDefinition} from './schema-validator.js';

export const SCHEMA_NAME_PATTERN = /^[A-Za-z0-9_.-]{1,128}$/u;

/** Complete SemVer, as the named-data schema identity contract requires. */
export const SCHEMA_VERSION_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;

/** How deep a chain of schema references may nest before it is reported as too deep. */
export const MAX_SCHEMA_REFERENCE_DEPTH = 16;

/** Opcodes of the consumer extension's schema-builder blocks. */
export interface SchemaBlockOpcodes {
  /** `define schema [NAME] version [VERSION]` */
  hat: string;
  /** `property [NAME] type [TYPE] [PRESENCE]` */
  property: string;
  /** `property [NAME] schema [SCHEMA] [PRESENCE]` */
  propertySchema: string;
  /** `property [NAME] array of schema [SCHEMA] [PRESENCE]` */
  propertyArraySchema: string;
  /** `limit [KEYWORD] to (VALUE)` */
  constraint: string;
  /** `allowed values [VALUES]` */
  allowedValues: string;
  /** `allow undeclared properties [ALLOW]` */
  additionalProperties: string;
}

export interface SchemaDefinition {
  name: string;
  version: string;
  /** Canonical JSON Schema with every schema reference already inlined. */
  schema: Record<string, unknown>;
  targetName: string;
  blockId: string;
}

export interface SchemaScan {
  schemas: SchemaDefinition[];
  errors: string[];
}

/** A `Name` or `Name@1.2.3` reference typed into a block field. */
export interface SchemaReference {
  name: string;
  version?: string;
}

const PROPERTY_TYPES: Record<string, () => Record<string, unknown>> = {
  string: () => ({type: 'string'}),
  number: () => ({type: 'number'}),
  integer: () => ({type: 'integer'}),
  boolean: () => ({type: 'boolean'}),
  null: () => ({type: 'null'}),
  object: () => ({type: 'object'}),
  array: () => ({type: 'array'}),
  'array of string': () => ({type: 'array', items: {type: 'string'}}),
  'array of number': () => ({type: 'array', items: {type: 'number'}}),
  'array of integer': () => ({type: 'array', items: {type: 'integer'}}),
  'array of boolean': () => ({type: 'array', items: {type: 'boolean'}}),
  'array of object': () => ({type: 'array', items: {type: 'object'}})
};

const CONSTRAINT_KEYWORDS = new Set(['minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems']);

/** Keywords that describe the array itself rather than each of its items. */
const ARRAY_LEVEL_KEYWORDS = new Set(['minItems', 'maxItems']);

interface DraftProperty {
  name: string;
  required: boolean;
  /** Set unless the property points at another named schema. */
  schema?: Record<string, unknown>;
  reference?: SchemaReference;
  /** True when the reference stands for an array of the referenced schema. */
  referenceIsArray?: boolean;
}

interface DraftSchema {
  name: string;
  version: string;
  properties: DraftProperty[];
  additionalProperties?: boolean;
  targetName: string;
  blockId: string;
}

/**
 * Reads every `define schema` hat in the project and lowers it to a canonical JSON Schema.
 * A hat that cannot be read is reported in `errors` and left out of `schemas`.
 */
export function scanSchemaDefinitions(
  targets: readonly RuntimeTarget[],
  opcodes: SchemaBlockOpcodes
): SchemaScan {
  const drafts: DraftSchema[] = [];
  const errors: string[] = [];
  const seen = new Map<string, string>();

  for (const target of targets) {
    if (target.isOriginal === false) continue;
    const targetName = target.getName?.() ?? (target.isStage ? 'Stage' : 'sprite');
    const blocks = target.blocks._blocks;
    for (const block of Object.values(blocks)) {
      if (block.opcode !== opcodes.hat || block.topLevel === false) continue;
      const where = `${targetName} (block ${block.id})`;
      try {
        const draft = readDraft(block, blocks, opcodes, targetName);
        const key = `${draft.name}@${draft.version}`;
        const previous = seen.get(key);
        if (previous !== undefined) {
          throw new Error(`schema "${key}" is already defined in ${previous}`);
        }
        seen.set(key, where);
        drafts.push(draft);
      } catch (error) {
        errors.push(`${where}: ${messageOf(error)}`);
      }
    }
  }

  const byKey = new Map(drafts.map((draft) => [`${draft.name}@${draft.version}`, draft]));
  const schemas: SchemaDefinition[] = [];
  for (const draft of drafts) {
    try {
      const schema = lowerDraft(draft, byKey, []);
      validateSchemaDefinition(schema, `schema ${draft.name}`);
      schemas.push({
        name: draft.name,
        version: draft.version,
        schema,
        targetName: draft.targetName,
        blockId: draft.blockId
      });
    } catch (error) {
      errors.push(`${draft.targetName} (block ${draft.blockId}): ${messageOf(error)}`);
    }
  }

  schemas.sort((left, right) => compare(`${left.name}@${left.version}`, `${right.name}@${right.version}`));
  return {schemas, errors};
}

/** Parses `Name` or `Name@1.2.3`. */
export function parseSchemaReference(text: string, label: string): SchemaReference {
  const trimmed = text.trim();
  const at = trimmed.lastIndexOf('@');
  const name = at > 0 ? trimmed.slice(0, at) : trimmed;
  const version = at > 0 ? trimmed.slice(at + 1) : undefined;
  if (!SCHEMA_NAME_PATTERN.test(name)) {
    throw new Error(`${label} must be 1-128 letters, digits, ".", "_" or "-"`);
  }
  if (version !== undefined && !SCHEMA_VERSION_PATTERN.test(version)) {
    throw new Error(`${label} version "${version}" must be a complete SemVer value such as 1.0.0`);
  }
  return version === undefined ? {name} : {name, version};
}

/**
 * Resolves a `Name` or `Name@1.2.3` reference against scanned schemas. An unknown name or version
 * fails; a name with several versions and no pinned version is ambiguous rather than guessed.
 */
export function resolveSchemaReference(
  schemas: readonly SchemaDefinition[],
  text: string,
  label: string
): Record<string, unknown> {
  const reference = parseSchemaReference(text, label);
  const matches = schemas.filter((candidate) => candidate.name === reference.name);
  if (matches.length === 0) {
    throw new Error(`${label} refers to unknown schema "${reference.name}"`);
  }
  if (reference.version !== undefined) {
    const exact = matches.find((candidate) => candidate.version === reference.version);
    if (!exact) {
      const available = matches.map((candidate) => candidate.version).join(', ');
      throw new Error(
        `${label} refers to unknown version "${reference.version}" of schema "${reference.name}" (defined: ${available})`
      );
    }
    return exact.schema;
  }
  if (matches.length > 1) {
    const available = matches.map((candidate) => candidate.version).join(', ');
    throw new Error(
      `${label} refers to schema "${reference.name}", which has several versions (${available}); pin one as "${reference.name}@${matches[0]?.version}"`
    );
  }
  return (matches[0] as SchemaDefinition).schema;
}

function readDraft(
  hat: SerializedBlock,
  blocks: Record<string, SerializedBlock>,
  opcodes: SchemaBlockOpcodes,
  targetName: string
): DraftSchema {
  const name = readLiteralInput(hat, blocks, 'NAME').trim();
  if (!SCHEMA_NAME_PATTERN.test(name)) {
    throw new Error('schema name must be 1-128 letters, digits, ".", "_" or "-"');
  }
  const version = readLiteralInput(hat, blocks, 'VERSION').trim();
  if (!SCHEMA_VERSION_PATTERN.test(version)) {
    throw new Error(`schema version "${version}" must be a complete SemVer value such as 1.0.0`);
  }

  const draft: DraftSchema = {name, version, properties: [], targetName, blockId: hat.id};
  const declared = new Set<string>();

  for (const block of stackBelow(hat, blocks)) {
    if (block.opcode === opcodes.property) {
      draft.properties.push(readProperty(block, blocks, declared));
    } else if (block.opcode === opcodes.propertySchema || block.opcode === opcodes.propertyArraySchema) {
      draft.properties.push(
        readReferenceProperty(block, blocks, declared, block.opcode === opcodes.propertyArraySchema)
      );
    } else if (block.opcode === opcodes.constraint) {
      applyConstraint(block, blocks, draft);
    } else if (block.opcode === opcodes.allowedValues) {
      applyAllowedValues(block, blocks, draft);
    } else if (block.opcode === opcodes.additionalProperties) {
      if (draft.additionalProperties !== undefined) {
        throw new Error('"allow undeclared properties" is used more than once in this schema');
      }
      draft.additionalProperties = readMenuField(block, 'ALLOW') === 'yes';
    } else {
      throw new Error(`${block.opcode} cannot be used inside a "define schema" stack`);
    }
  }
  return draft;
}

function readProperty(
  block: SerializedBlock,
  blocks: Record<string, SerializedBlock>,
  declared: Set<string>
): DraftProperty {
  const name = readPropertyName(block, blocks, declared);
  const typeName = readMenuField(block, 'TYPE');
  const build = PROPERTY_TYPES[typeName];
  if (!build) throw new Error(`property "${name}" has unsupported type "${typeName}"`);
  return {name, required: readPresence(block), schema: build()};
}

function readReferenceProperty(
  block: SerializedBlock,
  blocks: Record<string, SerializedBlock>,
  declared: Set<string>,
  asArray: boolean
): DraftProperty {
  const name = readPropertyName(block, blocks, declared);
  const reference = parseSchemaReference(
    readLiteralInput(block, blocks, 'SCHEMA'),
    `property "${name}" schema`
  );
  return {name, required: readPresence(block), reference, referenceIsArray: asArray};
}

function readPropertyName(
  block: SerializedBlock,
  blocks: Record<string, SerializedBlock>,
  declared: Set<string>
): string {
  const name = readLiteralInput(block, blocks, 'NAME').trim();
  if (name.length === 0) throw new Error('a property needs a name');
  if (declared.has(name)) throw new Error(`property "${name}" is declared more than once`);
  declared.add(name);
  return name;
}

function readPresence(block: SerializedBlock): boolean {
  return readMenuField(block, 'PRESENCE') === 'required';
}

function applyConstraint(
  block: SerializedBlock,
  blocks: Record<string, SerializedBlock>,
  draft: DraftSchema
): void {
  const keyword = readMenuField(block, 'KEYWORD');
  if (!CONSTRAINT_KEYWORDS.has(keyword)) throw new Error(`unsupported limit "${keyword}"`);
  const target = constraintTarget(draft, `limit "${keyword}"`, keyword);
  const raw = readLiteralInput(block, blocks, 'VALUE').trim();
  const value = Number(raw);
  if (raw.length === 0 || !Number.isFinite(value)) {
    throw new Error(`limit "${keyword}" needs a number, not "${raw}"`);
  }
  if (target[keyword] !== undefined) {
    throw new Error(`limit "${keyword}" is set more than once on property "${lastProperty(draft).name}"`);
  }
  target[keyword] = value;
}

function applyAllowedValues(
  block: SerializedBlock,
  blocks: Record<string, SerializedBlock>,
  draft: DraftSchema
): void {
  const target = constraintTarget(draft, '"allowed values"', 'enum');
  const property = lastProperty(draft);
  if (target.enum !== undefined) {
    throw new Error(`"allowed values" is set more than once on property "${property.name}"`);
  }
  const values = parseAllowedValues(readLiteralInput(block, blocks, 'VALUES'), property.name);
  // The declared type and the allowed values must agree, or every value would fail at call time.
  const type = target.type;
  if (type !== undefined) {
    for (const value of values) {
      const errors = validateAgainstSchema(value, {type});
      if (errors.length > 0) {
        throw new Error(
          `allowed value ${JSON.stringify(value)} does not match the declared type of property "${property.name}"`
        );
      }
    }
  }
  target.enum = values;
}

/**
 * Where a limit or an allowed-values list belongs. For an array property the item keywords describe
 * each item, while `minItems`/`maxItems` describe the array.
 */
function constraintTarget(draft: DraftSchema, label: string, keyword: string): Record<string, unknown> {
  const property = lastProperty(draft, label);
  if (!property.schema) {
    throw new Error(`${label} cannot be used on property "${property.name}", which uses another schema`);
  }
  const isArray = property.schema.type === 'array';
  if (!isArray) {
    if (ARRAY_LEVEL_KEYWORDS.has(keyword)) {
      throw new Error(`${label} can only be used on an array property, not "${property.name}"`);
    }
    return property.schema;
  }
  if (ARRAY_LEVEL_KEYWORDS.has(keyword)) return property.schema;
  const items = property.schema.items;
  if (items === undefined || typeof items !== 'object' || items === null || Array.isArray(items)) {
    throw new Error(
      `${label} needs property "${property.name}" to declare an item type, such as "array of number"`
    );
  }
  return items as Record<string, unknown>;
}

function lastProperty(draft: DraftSchema, label = 'this block'): DraftProperty {
  const property = draft.properties.at(-1);
  if (!property) throw new Error(`${label} must come after a property block`);
  return property;
}

/** JSON array text, or a comma-separated list of strings. */
function parseAllowedValues(text: string, propertyName: string): unknown[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) throw new Error(`"allowed values" for property "${propertyName}" is empty`);
  if (trimmed.startsWith('[')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch {
      throw new Error(`"allowed values" for property "${propertyName}" must be valid JSON`);
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error(`"allowed values" for property "${propertyName}" must be a non-empty JSON array`);
    }
    return parsed;
  }
  const values = trimmed.split(',').map((value) => value.trim()).filter((value) => value.length > 0);
  if (values.length === 0) throw new Error(`"allowed values" for property "${propertyName}" is empty`);
  return values;
}

function lowerDraft(
  draft: DraftSchema,
  byKey: ReadonlyMap<string, DraftSchema>,
  stack: readonly string[]
): Record<string, unknown> {
  const key = `${draft.name}@${draft.version}`;
  if (stack.includes(key)) {
    throw new Error(`schema reference cycle: ${[...stack, key].join(' -> ')}`);
  }
  if (stack.length >= MAX_SCHEMA_REFERENCE_DEPTH) {
    throw new Error(`schema references nest deeper than ${MAX_SCHEMA_REFERENCE_DEPTH} levels`);
  }
  const nextStack = [...stack, key];

  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const property of draft.properties) {
    properties[property.name] = property.reference
      ? lowerReference(property, draft, byKey, nextStack)
      : (property.schema as Record<string, unknown>);
    if (property.required) required.push(property.name);
  }

  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? {required} : {}),
    ...(draft.additionalProperties === undefined ? {} : {additionalProperties: draft.additionalProperties})
  };
}

function lowerReference(
  property: DraftProperty,
  draft: DraftSchema,
  byKey: ReadonlyMap<string, DraftSchema>,
  stack: readonly string[]
): Record<string, unknown> {
  const reference = property.reference as SchemaReference;
  const label = `property "${property.name}" of schema ${draft.name}`;
  const target = findDraft(byKey, reference, label);
  const lowered = lowerDraft(target, byKey, stack);
  return property.referenceIsArray ? {type: 'array', items: lowered} : lowered;
}

function findDraft(
  byKey: ReadonlyMap<string, DraftSchema>,
  reference: SchemaReference,
  label: string
): DraftSchema {
  if (reference.version !== undefined) {
    const exact = byKey.get(`${reference.name}@${reference.version}`);
    if (!exact) {
      throw new Error(`${label} refers to unknown schema "${reference.name}@${reference.version}"`);
    }
    return exact;
  }
  const matches = [...byKey.values()].filter((candidate) => candidate.name === reference.name);
  if (matches.length === 0) throw new Error(`${label} refers to unknown schema "${reference.name}"`);
  if (matches.length > 1) {
    const available = matches.map((candidate) => candidate.version).join(', ');
    throw new Error(
      `${label} refers to schema "${reference.name}", which has several versions (${available}); pin one as "${reference.name}@${matches[0]?.version}"`
    );
  }
  return matches[0] as DraftSchema;
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
