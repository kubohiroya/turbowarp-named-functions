import type {SchemaBundleEditorOptions} from '@kubohiroya/turbowarp-extension-data-editor/rjsf';
import type {SchemaBundle, SchemaJsonObject} from '@kubohiroya/turbowarp-extension-data-editor/schema';
import type {BlockSnapshot, JsonValue, ValidationIssue} from '@kubohiroya/turbowarp-extension-data-editor';
import {extensionConfig} from './config.js';
import type {FunctionDefinition} from './function-registry.js';
import {validateAgainstSchema} from './schema-validator.js';

/**
 * JSON editors for the inputs that hold JSON text, opened from the block's editor icon.
 *
 * `define function` is not here: the editor registry allows one editor per opcode, and that block
 * already has the fixed-input editor for EXPORT.
 */

const PROMISE_REF_SCHEMA: SchemaJsonObject = {
  type: 'object',
  properties: {$promise: {type: 'string', pattern: '^p_[0-9]+$'}},
  required: ['$promise'],
  additionalProperties: false
};

const SCHEMAS = {
  args: {type: 'object'},
  promise: PROMISE_REF_SCHEMA,
  promises: {type: 'array', items: PROMISE_REF_SCHEMA}
} satisfies Record<string, SchemaJsonObject>;

type SchemaKey = keyof typeof SCHEMAS;

function bundle(key: SchemaKey): SchemaBundle {
  const source = {repository: 'turbowarp-named-functions', path: 'src/json-input-editors.ts', symbol: `SCHEMAS.${key}`};
  return {
    identity: {ownerId: 'turbowarp-named-functions', contractId: `json-input.${key}`, revision: 'json-inputs-v1', variantId: 'default'},
    dialect: '2020-12',
    root: {
      retrievalUri: `https://kubohiroya.github.io/turbowarp-named-functions/schemas/json-input-${key}.schema.json`,
      document: SCHEMAS[key],
      artifact: {role: 'canonical-schema', source}
    },
    resources: [],
    provenance: {canonicalSources: [source], generatedFiles: [], referenceSchemas: [], generationSources: []}
  };
}

/** Lists the functions the sprite with this id can call. */
export type FunctionLookup = (targetId: string) => readonly FunctionDefinition[];

/** Checks call arguments against the schema of the function named by the block's NAME (or FUNCTION) literal. */
export function validateCallArguments(
  data: JsonValue, snapshot: BlockSnapshot, functions: FunctionLookup
): ValidationIssue[] {
  const input = snapshot.arguments.FUNCTION ? 'FUNCTION' : 'NAME';
  const slot = snapshot.arguments[input];
  // A reporter in NAME is only known at run time.
  if (!slot || slot.kind !== 'literal') return [];
  const name = String(slot.value).trim();
  const definition = functions(snapshot.targetId).find((candidate) => candidate.name === name);
  if (!definition) return [{path: `/inputs/${input}`, message: `Unknown function: ${name}`}];
  return validateAgainstSchema(data, definition.parameters).map((message) => ({path: '/inputs/ARGS', message}));
}

export function jsonInputEditorDefinitions(functions: FunctionLookup): SchemaBundleEditorOptions[] {
  const common = {
    apiVersion: 1 as const,
    extensionId: extensionConfig.id,
    format: 'json' as const,
    validationContext: () => ({consumerId: extensionConfig.id, nowMs: Date.now(), settings: null})
  };
  const id = (opcode: string) => `${extensionConfig.id}_${opcode}`;
  return [
    {
      ...common,
      editorId: 'call-arguments',
      opcodes: [id('callFunction'), id('callFunctionFromMenu'), id('startFunction')],
      argument: 'ARGS',
      schemaBundle: bundle('args'),
      validateData: (data, snapshot) => validateCallArguments(data, snapshot, functions)
    },
    {...common, editorId: 'promise-reference', opcodes: [id('awaitResult'), id('isSettled')], argument: 'PROMISE', schemaBundle: bundle('promise')},
    {...common, editorId: 'promise-references', opcodes: [id('awaitAll')], argument: 'PROMISES', schemaBundle: bundle('promises')}
  ];
}

interface RuntimeLifetime {
  on?: (event: string, listener: () => void) => void;
  off?: (event: string, listener: () => void) => void;
}

/** Registers the editors when the GUI offers schema bundle editors; otherwise does nothing. */
export function registerJsonInputEditors(
  scratch: unknown, definitions: readonly SchemaBundleEditorOptions[], runtimeOverride?: RuntimeLifetime
): () => void {
  const host = scratch as {gui?: {blockEditors?: {apiVersion?: number;
    registerSchemaBundle?: (options: SchemaBundleEditorOptions) => () => void}};
    vm?: {runtime?: RuntimeLifetime}};
  const api = host.gui?.blockEditors;
  if (!definitions.length || api?.apiVersion !== 1 || typeof api.registerSchemaBundle !== 'function') return () => {};
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
      const remove = api.registerSchemaBundle.call(api, definition);
      if (typeof remove !== 'function') throw new TypeError('Invalid JSON input editor registration disposer.');
      removers.push(remove);
    }
    runtime?.on?.('RUNTIME_DISPOSED', dispose);
  } catch (error) {dispose(); throw error;}
  return dispose;
}
