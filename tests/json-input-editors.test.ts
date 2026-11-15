import {describe, expect, it, vi} from 'vitest';
import {EditorRegistry, createFixedInputEditor} from '@kubohiroya/turbowarp-extension-data-editor';
import {createSchemaBundleEditor} from '@kubohiroya/turbowarp-extension-data-editor/rjsf';
import type {BlockSnapshot} from '@kubohiroya/turbowarp-extension-data-editor';
import {extensionConfig} from '../src/config.js';
import {createFixedInputEditorDefinitions} from '../src/fixed-input-editors.js';
import type {FunctionDefinition} from '../src/function-registry.js';
import {
  jsonInputEditorDefinitions,
  registerJsonInputEditors,
  validateCallArguments
} from '../src/json-input-editors.js';

const add: FunctionDefinition = {
  name: 'add',
  scope: 'global',
  description: '',
  parameters: {type: 'object', properties: {a: {type: 'number'}, b: {type: 'number'}}, required: ['a', 'b']},
  exportAs: 'none',
  targetName: 'Sprite1',
  blockId: 'hat',
  target: {blocks: {_blocks: {}}}
};
const functions = () => [add];

const snapshot = (args: BlockSnapshot['arguments']): BlockSnapshot => ({
  targetId: 't', blockId: 'b', opcode: `${extensionConfig.id}_callFunction`, revision: '1', arguments: args
} as BlockSnapshot);

describe('JSON input editors', () => {
  it('covers every JSON input except define function', () => {
    const covered = jsonInputEditorDefinitions(functions).flatMap((definition) =>
      definition.opcodes.map((opcode) => `${opcode.slice(extensionConfig.id.length + 1)}.${definition.argument}`)
    );
    expect(covered.sort()).toEqual([
      'awaitAll.PROMISES', 'awaitResult.PROMISE', 'callFunction.ARGS', 'callFunctionFromMenu.ARGS', 'isSettled.PROMISE', 'startFunction.ARGS'
    ]);
  });

  it('registers next to the fixed-input editor in a real registry', () => {
    const registry = new EditorRegistry();
    registry.registerFixed(createFixedInputEditor(createFixedInputEditorDefinitions(() => false)[0]!));
    for (const definition of jsonInputEditorDefinitions(functions)) {
      registry.register(createSchemaBundleEditor(definition));
    }
    expect(registry.resolve(`${extensionConfig.id}_callFunction`)).toBeDefined();
    expect(registry.resolve(`${extensionConfig.id}_awaitAll`)).toBeDefined();
  });

  it('checks call arguments against the named function', () => {
    const name = {kind: 'literal', value: 'add'} as const;
    expect(validateCallArguments({a: 1, b: 2}, snapshot({NAME: name}), functions)).toEqual([]);
    expect(validateCallArguments({a: 1}, snapshot({NAME: name}), functions)).toEqual([
      {path: '/inputs/ARGS', message: expect.stringContaining('b')}
    ]);
    expect(validateCallArguments({}, snapshot({NAME: {kind: 'literal', value: 'nope'}}), functions)).toEqual([
      {path: '/inputs/NAME', message: 'Unknown function: nope'}
    ]);
    expect(validateCallArguments({}, snapshot({NAME: {kind: 'reporter'}}), functions)).toEqual([]);
  });

  it('registers through the GUI API and unregisters on dispose', () => {
    const removers = [vi.fn(), vi.fn(), vi.fn()];
    let index = 0;
    const registerSchemaBundle = vi.fn(() => removers[index++]!);
    const dispose = registerJsonInputEditors(
      {gui: {blockEditors: {apiVersion: 1, registerSchemaBundle}}}, jsonInputEditorDefinitions(functions), {}
    );
    expect(registerSchemaBundle).toHaveBeenCalledTimes(3);
    dispose();
    for (const remove of removers) expect(remove).toHaveBeenCalledOnce();
  });

  it('does nothing without a GUI that offers schema bundle editors', () => {
    expect(() => registerJsonInputEditors({}, jsonInputEditorDefinitions(functions))()).not.toThrow();
  });
});
