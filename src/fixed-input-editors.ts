import type {FixedInputEditorOptions} from '@kubohiroya/turbowarp-extension-data-editor';
import {extensionConfig} from './config.js';
import {fixedInputSchemaBundle} from './fixed-input-schema.js';

const choices: readonly string[] = ["none", "tool"];

export const fixedInputEditorDefinitions: readonly FixedInputEditorOptions[] = [{
  apiVersion: 1, extensionId: extensionConfig.id, editorId: 'defineFunction-fixed-inputs',
  opcodes: [`${extensionConfig.id}_defineFunction`],
  contractId: 'turbowarp-named-functions:defineFunction.EXPORT', contractRevision: 'fixed-inputs-v1',
  bindings: [{argument: 'EXPORT', schemaBundle: fixedInputSchemaBundle,
    control: {kind: 'enum', label: 'EXPORT', choices: [{"value": "none", "label": "none"}, {"value": "tool", "label": "tool"}]},
    read(value) {
      if (typeof value !== 'string') throw new TypeError('Expected a literal export mode.');
      return value;
    },
    encode(value) {
      if (typeof value !== 'string' || !choices.includes(value)) throw new TypeError('Unsupported export mode.');
      return value;
    },
    validateCandidate(value) {
      return typeof value === 'string' && choices.includes(value) ? []
        : [{path: '/inputs/EXPORT', message: 'Unsupported export mode.'}];
    }
  }],
  validationContext: () => ({consumerId: extensionConfig.id, nowMs: Date.now(), settings: null})
}];

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
