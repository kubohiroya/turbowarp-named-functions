import {readLiteralInput, readOptionalLiteralInput} from './block-literals.js';
import type {RuntimeTarget, SerializedBlock} from './runtime-types.js';
import {validateSchemaDefinition} from './schema-validator.js';

/** A function exported as a tool, in the shape used by OpenAI function calling. */
export interface FunctionTool {
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export const FUNCTION_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/u;
export const MAX_DESCRIPTION_LENGTH = 1024;

/**
 * `sprite`: callable only from scripts of the sprite (or the stage) that defines it, and its clones.
 * `global`: callable from every sprite and the stage, and from outside the project (tools).
 */
export type FunctionScope = 'sprite' | 'global';

export interface FunctionDefinition {
  name: string;
  /** Hats saved before scopes existed have no SCOPE field and stay `global`. */
  scope: FunctionScope;
  description: string;
  parameters: Record<string, unknown>;
  /** Omitted on older projects and when RETURNS is left blank. */
  returns?: Record<string, unknown>;
  exportAs: 'tool' | 'none';
  targetName: string;
  /** The sprite (never a clone) or the stage that defines the function. */
  target: RuntimeTarget;
  blockId: string;
}

export interface FunctionScan {
  functions: FunctionDefinition[];
  errors: string[];
}

export interface FunctionScanOptions {
  /**
   * Resolves a schema name typed into SCHEMA or RETURNS instead of JSON text, such as a
   * `define schema` hat's name. Without it, those inputs must be JSON.
   */
  resolveSchema?: (reference: string, label: string) => Record<string, unknown>;
}

/**
 * Reads every `define function` hat in the project. NAME, DESCRIPTION, and SCHEMA are part of the
 * tool contract sent to the model before any script runs, so they must be literal text.
 */
export function scanFunctionDefinitions(
  targets: readonly RuntimeTarget[],
  hatOpcode: string,
  options: FunctionScanOptions = {}
): FunctionScan {
  const scanned: Array<{definition: FunctionDefinition; where: string}> = [];
  const errors: string[] = [];

  for (const target of targets) {
    if (target.isOriginal === false) continue;
    const targetName = target.getName?.() ?? (target.isStage ? 'Stage' : 'sprite');
    const blocks = target.blocks._blocks;
    for (const block of Object.values(blocks)) {
      if (block.opcode !== hatOpcode || block.topLevel === false) continue;
      const where = `${targetName} (block ${block.id})`;
      try {
        scanned.push({definition: readDefinition(block, blocks, targetName, target, options), where});
      } catch (error) {
        errors.push(`${where}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  // A name is unique among the global functions, unique within each sprite, and a sprite's own
  // function may not reuse a global name, so a call by name never depends on which sprite makes it.
  const functions: FunctionDefinition[] = [];
  const globals = new Map<string, string>();
  for (const {definition, where} of scanned) {
    if (definition.scope !== 'global') continue;
    const previous = globals.get(definition.name);
    if (previous !== undefined) {
      errors.push(`${where}: function "${definition.name}" is already defined in ${previous}`);
      continue;
    }
    globals.set(definition.name, where);
    functions.push(definition);
  }
  const locals = new Map<RuntimeTarget, Map<string, string>>();
  for (const {definition, where} of scanned) {
    if (definition.scope !== 'sprite') continue;
    const global = globals.get(definition.name);
    if (global !== undefined) {
      errors.push(`${where}: function "${definition.name}" is already defined for all sprites in ${global}`);
      continue;
    }
    const own = locals.get(definition.target) ?? new Map<string, string>();
    locals.set(definition.target, own);
    const previous = own.get(definition.name);
    if (previous !== undefined) {
      errors.push(`${where}: function "${definition.name}" is already defined in ${previous}`);
      continue;
    }
    own.set(definition.name, where);
    functions.push(definition);
  }
  functions.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
  return {functions, errors};
}

/**
 * Writes `SCOPE = global` into `define function` hats saved before SCOPE existed, so the stored
 * value matches what the block shows (the menu's first choice) and a change made on the block is
 * kept: the VM ignores a change to a field the block does not have. Each sprite is checked once;
 * pass the same `checked` set every time.
 */
export function upgradeLegacyScopes(
  targets: readonly RuntimeTarget[],
  hatOpcode: string,
  checked: WeakSet<RuntimeTarget>
): number {
  let upgraded = 0;
  for (const target of targets) {
    if (target.isOriginal === false || checked.has(target)) continue;
    checked.add(target);
    for (const block of Object.values(target.blocks._blocks)) {
      if (block.opcode !== hatOpcode || block.topLevel === false || block.fields?.SCOPE) continue;
      block.fields = {...block.fields, SCOPE: {name: 'SCOPE', value: 'global'}};
      upgraded += 1;
    }
  }
  return upgraded;
}

/**
 * Whether naming the hat `blockId` of `target` as `name` with `scope` would clash with another
 * `define function` hat, under the same rules as `scanFunctionDefinitions`: a global name is unique
 * in the project, and a sprite name is unique in its sprite and differs from every global name.
 * Hats whose NAME is not literal text are not compared.
 */
export function hasNameConflict(
  targets: readonly RuntimeTarget[],
  hatOpcode: string,
  candidate: {target: RuntimeTarget; blockId: string; name: string; scope: FunctionScope}
): boolean {
  const name = candidate.name.trim();
  for (const target of targets) {
    if (target.isOriginal === false) continue;
    const blocks = target.blocks._blocks;
    for (const block of Object.values(blocks)) {
      if (block.opcode !== hatOpcode || block.topLevel === false || block.id === candidate.blockId) continue;
      let other: string;
      let otherScope: FunctionScope;
      try {
        other = readLiteralInput(block, blocks, 'NAME').trim();
        otherScope = readScope(block);
      } catch {
        continue;
      }
      if (other !== name) continue;
      if (candidate.scope === 'global' || otherScope === 'global' || sameSprite(target, candidate.target)) return true;
    }
  }
  return false;
}

/** A function a script can call, and the sprite, clone, or stage it runs as. */
export interface ResolvedFunction {
  definition: FunctionDefinition;
  runAs: RuntimeTarget;
}

/** True when both are the same sprite: the original, one of its clones, or the stage itself. */
export function sameSprite(left: RuntimeTarget, right: RuntimeTarget): boolean {
  return left === right || (left.sprite !== undefined && left.sprite === right.sprite);
}

/**
 * Finds the function a call names. A caller's own sprite function runs as the caller (a clone runs it
 * as itself, as with a custom block); a global function runs as the sprite or stage that defines it.
 * Without a caller (a call from outside the project), only global functions are visible.
 */
export function resolveFunction(
  functions: readonly FunctionDefinition[],
  name: string,
  caller?: RuntimeTarget
): ResolvedFunction | undefined {
  if (caller) {
    const own = functions.find(
      (definition) => definition.scope === 'sprite' && definition.name === name && sameSprite(definition.target, caller)
    );
    if (own) return {definition: own, runAs: caller};
  }
  const global = functions.find((definition) => definition.scope === 'global' && definition.name === name);
  return global ? {definition: global, runAs: global.target} : undefined;
}

/** Functions a script of `caller` can call: its sprite's own functions, then the global ones. */
export function visibleFunctions(
  functions: readonly FunctionDefinition[],
  caller?: RuntimeTarget
): FunctionDefinition[] {
  return functions.filter(
    (definition) => definition.scope === 'global' || (caller !== undefined && sameSprite(definition.target, caller))
  );
}

export function toFunctionTools(functions: readonly FunctionDefinition[]): FunctionTool[] {
  return functions
    .filter((definition) => definition.exportAs === 'tool')
    .map((definition) => ({
      type: 'function',
      name: definition.name,
      description: definition.description,
      parameters: definition.parameters
    }));
}

function readDefinition(
  block: SerializedBlock,
  blocks: Record<string, SerializedBlock>,
  targetName: string,
  target: RuntimeTarget,
  options: FunctionScanOptions
): FunctionDefinition {
  const name = readLiteralInput(block, blocks, 'NAME').trim();
  if (!FUNCTION_NAME_PATTERN.test(name)) {
    throw new Error('function name must be 1-64 letters, digits, "_" or "-"');
  }
  const description = readLiteralInput(block, blocks, 'DESCRIPTION').trim();
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new Error(`description must be at most ${MAX_DESCRIPTION_LENGTH} characters`);
  }
  const parameters = parseSchema(readLiteralInput(block, blocks, 'SCHEMA'), 'args schema', true, options);
  const returnsText = readOptionalLiteralInput(block, blocks, 'RETURNS');
  const returns = returnsText === undefined || returnsText.trim() === ''
    ? undefined
    : parseSchema(returnsText, 'returns schema', false, options);
  const exportValue = String(block.fields?.EXPORT?.value ?? 'none');
  const exportAs = exportValue === 'tool' ? 'tool' : 'none';
  if (exportAs === 'tool' && description.length === 0) {
    throw new Error('a function exported as a tool needs a description');
  }
  const scope = readScope(block);
  if (exportAs === 'tool' && scope !== 'global') {
    throw new Error('a function exported as a tool must be for all sprites');
  }
  return {
    name,
    scope,
    description,
    parameters,
    ...(returns ? {returns} : {}),
    exportAs,
    targetName,
    target,
    blockId: block.id
  };
}

/** SCOPE is a menu field. Hats saved before it existed have none and keep their global meaning. */
function readScope(block: SerializedBlock): FunctionScope {
  const value = block.fields?.SCOPE?.value;
  if (value === undefined || value === null || value === 'global') return 'global';
  if (value === 'sprite') return 'sprite';
  throw new Error(`unknown function scope "${String(value)}"`);
}

/**
 * SCHEMA and RETURNS hold either JSON Schema text or, when the consumer supports it, the name of a
 * `define schema` hat. Text that is not JSON is treated as a name, so existing JSON projects are
 * unaffected.
 */
function parseSchema(
  text: string,
  label: string,
  requireObjectType: boolean,
  options: FunctionScanOptions
): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    if (options.resolveSchema) return resolveNamed(text, label, requireObjectType, options.resolveSchema);
    throw new Error(`${label} must be valid JSON`);
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  const schema = value as Record<string, unknown>;
  if (requireObjectType && schema.type !== 'object') throw new Error('args schema must have "type": "object"');
  validateSchemaDefinition(schema, label);
  return schema;
}

function resolveNamed(
  text: string,
  label: string,
  requireObjectType: boolean,
  resolveSchema: (reference: string, label: string) => Record<string, unknown>
): Record<string, unknown> {
  const schema = resolveSchema(text, label);
  if (requireObjectType && schema.type !== 'object') throw new Error('args schema must have "type": "object"');
  validateSchemaDefinition(schema, label);
  return schema;
}
