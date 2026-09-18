import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import definitions from '../src/block-definitions.json';
import {DEFINE_FUNCTION_OPCODE, NamedFunctionsExtension} from '../src/extension.js';
import {FakeRuntime, targetWithFunctions} from './helpers/fake-runtime.js';

beforeEach(() => {
  vi.stubGlobal('Scratch', {
    BlockType: {COMMAND: 'command', REPORTER: 'reporter', BOOLEAN: 'Boolean', HAT: 'hat'},
    ArgumentType: {STRING: 'string', NUMBER: 'number', BOOLEAN: 'Boolean'},
    Cast: {toString: (value: unknown) => String(value), toNumber: (value: unknown) => Number(value)},
    translate: (message: string | {default: string}) => (typeof message === 'string' ? message : message.default)
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function setup() {
  const runtime = new FakeRuntime();
  runtime.targets = [
    targetWithFunctions(DEFINE_FUNCTION_OPCODE, [
      {name: 'add', schema: '{"type":"object","properties":{"a":{"type":"number"},"b":{"type":"number"}},"required":["a","b"]}'}
    ])
  ];
  const extension = new NamedFunctionsExtension({runtime});
  const run = () => {
    const thread = runtime.spawnThread();
    expect(extension.defineFunction({NAME: 'add'}, {thread})).toBe(true);
    return thread;
  };
  return {runtime, extension, run};
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('NamedFunctionsExtension', () => {
  it('describes every block and implements each opcode', () => {
    const {extension} = setup();
    const info = extension.getInfo() as {id: string; blocks: Array<{opcode: string; blockType: string; isEdgeActivated?: boolean}>};
    expect(info.id).toBe('kubohiroyanamedfunctions');
    expect(info.blocks).toHaveLength(definitions.blocks.length);
    for (const block of info.blocks) {
      expect(typeof (extension as unknown as Record<string, unknown>)[block.opcode]).toBe('function');
      if (block.blockType === 'hat') expect(block.isEdgeActivated).toBe(false);
    }
  });

  it('calls a function through the blocks', async () => {
    const {extension, run} = setup();
    const result = extension.callFunction({NAME: 'add', ARGS: '{"a":1,"b":2}'});
    const thread = run();
    expect(extension.functionArgument({PATH: 'b'}, {thread})).toBe(2);
    expect(extension.functionArgumentsJson({}, {thread})).toBe('{"a":1,"b":2}');
    const stopThisScript = vi.fn();
    extension.returnValue({VALUE: '{"sum":3}'}, {thread, stopThisScript});
    expect(stopThisScript).toHaveBeenCalled();
    await expect(result).resolves.toBe('{"sum":3}');
    expect(extension.lastError()).toBe('');
  });

  it('starts and awaits through promise references', async () => {
    const {extension, run} = setup();
    const ref = extension.startFunction({NAME: 'add', ARGS: '{"a":2,"b":2}'});
    expect(ref).toBe('{"$promise":"p_1"}');
    await flush();
    expect(extension.isSettled({PROMISE: ref})).toBe(false);
    extension.returnValue({VALUE: '4'}, {thread: run()});
    await expect(extension.awaitResult({PROMISE: ref})).resolves.toBe(4);
    await expect(extension.awaitAll({PROMISES: `[${ref}]`})).resolves.toBe('[4]');
  });

  it('records errors for bad JSON, unknown names, and invalid arguments', async () => {
    const {extension} = setup();
    await expect(extension.callFunction({NAME: 'add', ARGS: '{oops'})).resolves.toBe('');
    expect(extension.lastError()).toContain('ARGS must be JSON');
    await expect(extension.callFunction({NAME: 'nope', ARGS: ''})).resolves.toBe('');
    expect(extension.lastError()).toContain('Unknown function: nope');
    await expect(extension.callFunction({NAME: 'add', ARGS: '{"a":1}'})).resolves.toBe('');
    expect(extension.lastError()).toContain('$.b is required');
    expect(extension.isDefined({NAME: 'add'})).toBe(true);
  });
});
