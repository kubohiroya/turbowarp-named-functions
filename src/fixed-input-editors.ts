import type {FixedInputBinding, FixedInputEditorOptions} from '@kubohiroya/turbowarp-extension-data-editor';
import {extensionConfig} from './config.js';
import {FUNCTION_NAME_PATTERN, MAX_DESCRIPTION_LENGTH, parseSchema, type FunctionScope} from './function-registry.js';
import {FIXED_INPUT_CONTRACT_REVISION, fixedInputSchemaBundle} from './fixed-input-schema.js';

const exportChoices: readonly string[] = ['none', 'tool'];
const scopeChoices: readonly string[] = ['global', 'sprite'];

/** The `define schema` hats a SCHEMA or RETURNS input can name. */
export interface SchemaNames {
  /** `Name`, or `Name@1.0.0` for each version when a name has several. */
  list(): readonly string[];
  /** Resolves a name the way a running project does; throws when it cannot. */
  resolve(reference: string, label: string): Record<string, unknown>;
}

/** Reports whether another `define function` hat already uses `name` within `scope`. */
export type NameConflictCheck = (where: {targetId: string; blockId: string}, name: string, scope: FunctionScope) => boolean;

const literalString = (value: unknown): string => {
  if (typeof value !== 'string') throw new TypeError('Expected literal text.');
  return value;
};

const choiceBinding = (argument: 'SCOPE' | 'EXPORT', choices: readonly string[],
  labels: Readonly<Record<string, string>>): FixedInputBinding => ({
  argument, schemaBundle: fixedInputSchemaBundle(argument),
  control: {kind: 'enum', label: argument, choices: choices.map((value) => ({value, label: labels[value] ?? value}))},
  read: literalString,
  encode(value) {
    if (typeof value !== 'string' || !choices.includes(value)) throw new TypeError(`Unsupported ${argument}.`);
    return value;
  },
  validateCandidate(value) {
    return typeof value === 'string' && choices.includes(value) ? []
      : [{path: `/inputs/${argument}`, message: `Unsupported ${argument}.`}];
  }
});

const literalAt = (snapshot: {arguments: Readonly<Record<string, {kind: string; value?: unknown}>>}, name: string): string => {
  const slot = snapshot.arguments[name];
  return slot?.kind === 'literal' ? String(slot.value) : '';
};

/** EXPORT `tool` needs a description and `all sprites`, as `readDefinition` requires. */
const exportBinding = (): FixedInputBinding => {
  const base = choiceBinding('EXPORT', exportChoices, {});
  return {...base, validateCandidate(value, context, snapshot) {
    const issues = base.validateCandidate!(value, context, snapshot);
    if (issues.length || value !== 'tool') return issues;
    if (snapshot.arguments.DESCRIPTION?.kind === 'literal' && literalAt(snapshot, 'DESCRIPTION').trim() === '') {
      return [{path: '/inputs/DESCRIPTION', message: 'A function exported as a tool needs a description.'}];
    }
    return literalAt(snapshot, 'SCOPE') === 'sprite'
      ? [{path: '/inputs/SCOPE', message: 'A function exported as a tool must be for all sprites.'}] : [];
  }};
};

const descriptionBinding = (): FixedInputBinding => ({
  argument: 'DESCRIPTION', schemaBundle: fixedInputSchemaBundle('DESCRIPTION'),
  control: {kind: 'text', label: 'DESCRIPTION'},
  read: literalString,
  encode(value) {
    if (typeof value !== 'string') throw new TypeError('Expected a description.');
    return value;
  },
  validateCandidate(value) {
    return typeof value === 'string' && value.trim().length <= MAX_DESCRIPTION_LENGTH ? []
      : [{path: '/inputs/DESCRIPTION', message: `Descriptions are at most ${MAX_DESCRIPTION_LENGTH} characters.`}];
  }
});

/**
 * SCHEMA and RETURNS hold JSON Schema text or a schema name. The dialog value is the parsed object
 * for JSON text and the text itself otherwise, so a string always means a name.
 */
const schemaBinding = (argument: 'SCHEMA' | 'RETURNS', schemas: SchemaNames): FixedInputBinding => {
  const label = argument === 'SCHEMA' ? 'args schema' : 'returns schema';
  return {
    argument, schemaBundle: fixedInputSchemaBundle(argument),
    control: {kind: 'json', label: argument, basic: 'json-schema'},
    read(value) {
      const text = literalString(value);
      try {
        const parsed = JSON.parse(text) as unknown;
        return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed as never : text;
      } catch {
        return text;
      }
    },
    encode(value) {
      if (typeof value === 'string') return value.trim();
      if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError(`Unsupported ${argument}.`);
      return JSON.stringify(value);
    },
    listNames: () => schemas.list(),
    validateCandidate(value) {
      if (argument === 'RETURNS' && value === '') return [];
      try {
        parseSchema(typeof value === 'string' ? value.trim() : JSON.stringify(value), label, argument === 'SCHEMA',
          {resolveSchema: schemas.resolve});
        return [];
      } catch (error) {
        return [{path: `/inputs/${argument}`, message: error instanceof Error ? error.message : String(error)}];
      }
    }
  };
};

/** NAME is checked against the other hats in the scope the dialog currently selects. */
const nameBinding = (scope: FunctionScope, conflicts: NameConflictCheck): FixedInputBinding => ({
  argument: 'NAME', schemaBundle: fixedInputSchemaBundle('NAME'),
  control: {kind: 'text', label: 'NAME'},
  read: literalString,
  encode(value) {
    if (typeof value !== 'string') throw new TypeError('Expected a function name.');
    return value.trim();
  },
  validateCandidate(value, _context, snapshot) {
    if (typeof value !== 'string' || !FUNCTION_NAME_PATTERN.test(value)) {
      return [{path: '/inputs/NAME', message: 'Function names are 1-64 letters, digits, "_" or "-".'}];
    }
    return conflicts({targetId: snapshot.targetId, blockId: snapshot.blockId}, value, scope)
      ? [{path: '/inputs/NAME', message: 'A function with this name already exists in this scope.'}]
      : [];
  }
});

/**
 * The `define function` dialog: every input in one save. NAME is validated against the scope chosen
 * in the dialog, so a name already used in that scope disables Save. SCHEMA and RETURNS are edited
 * by name, in a form, or as JSON text.
 */
export function createFixedInputEditorDefinitions(
  conflicts: NameConflictCheck, schemas: SchemaNames
): readonly FixedInputEditorOptions[] {
  return [{
    apiVersion: 1, extensionId: extensionConfig.id, editorId: 'defineFunction-fixed-inputs',
    opcodes: [`${extensionConfig.id}_defineFunction`],
    contractId: 'turbowarp-named-functions:defineFunction', contractRevision: FIXED_INPUT_CONTRACT_REVISION,
    bindings: [
      nameBinding('global', conflicts),
      choiceBinding('SCOPE', scopeChoices, {global: 'all sprites', sprite: 'this sprite only'}),
      descriptionBinding(),
      schemaBinding('SCHEMA', schemas),
      schemaBinding('RETURNS', schemas),
      exportBinding()
    ],
    dependencies: [{selector: 'SCOPE', dependents: ['NAME']}],
    branchPolicies: [{
      selector: 'SCOPE',
      cases: [
        {values: ['global'], activeDependents: ['NAME'], bindings: [nameBinding('global', conflicts)]},
        {values: ['sprite'], activeDependents: ['NAME'], bindings: [nameBinding('sprite', conflicts)]}
      ]
    }],
    validationContext: () => ({consumerId: extensionConfig.id, nowMs: Date.now(), settings: null})
  }];
}

interface RuntimeLifetime {
  on?: (event: string, listener: () => void) => void;
  off?: (event: string, listener: () => void) => void;
}

/** Register metadata only; the GUI startup capability owns editor activation. */
export function registerFixedInputEditors(
  scratch: unknown, definitions: readonly FixedInputEditorOptions[], runtimeOverride?: RuntimeLifetime
): () => void {
  const host = scratch as {gui?: {blockEditors?: {apiVersion?: number;
    registerFixedInputEditor?: (options: FixedInputEditorOptions) => () => void}};
    vm?: {runtime?: RuntimeLifetime}};
  const api = host.gui?.blockEditors;
  if (!definitions.length || api?.apiVersion !== 1 || typeof api.registerFixedInputEditor !== 'function') return () => {};
  const runtime = runtimeOverride ?? host.vm?.runtime;
  const removers: (() => void)[] = [];
  let active = true;
  const dispose = () => {
    if (!active) return;
    active = false;
    runtime?.off?.('RUNTIME_DISPOSED', dispose);
    for (const remove of removers.splice(0).reverse()) remove();
  };
  try {
    for (const definition of definitions) {
      const remove = api.registerFixedInputEditor.call(api, definition);
      if (typeof remove !== 'function') throw new TypeError('Invalid fixed input registration disposer.');
      removers.push(remove);
    }
    runtime?.on?.('RUNTIME_DISPOSED', dispose);
  } catch (error) {dispose(); throw error;}
  return dispose;
}
