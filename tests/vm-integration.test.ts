// Runs named functions on a real headless TurboWarp VM.
// Skipped unless SCRATCH_VM_PATH points at a TurboWarp scratch-vm checkout, e.g.
//   SCRATCH_VM_PATH=/path/to/TurboWarp/scratch-vm pnpm test
import {createRequire} from 'node:module';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import type {RuntimeLike} from '../src/runtime-types.js';

const vmPath = process.env.SCRATCH_VM_PATH;
const ID = 'kubohiroyanamedfunctions';

interface VirtualMachineLike {
  runtime: RuntimeLike;
  extensionManager: {
    _registerInternalExtension(extension: unknown): string;
    _loadedExtensions: Map<string, string>;
  };
  setCompilerOptions(options: {enabled: boolean}): void;
  setFramerate(fps: number): void;
  loadProject(project: unknown): Promise<void>;
  start(): void;
  stop(): void;
}

type Block = Record<string, unknown>;

function buildProject() {
  const blocks: Record<string, Block> = {};
  const add = (id: string, block: Block) => {
    blocks[id] = {next: null, parent: null, inputs: {}, fields: {}, shadow: false, topLevel: false, ...block};
  };
  const define = (hatId: string, name: string, schema: string, next: string) =>
    add(hatId, {
      opcode: `${ID}_defineFunction`,
      topLevel: true,
      x: 0,
      y: 0,
      next,
      inputs: {NAME: [1, [10, name]], DESCRIPTION: [1, [10, name]], SCHEMA: [1, [10, schema]]},
      fields: {EXPORT: ['none', null]}
    });

  // add: return ((function argument a) + (function argument b))
  define('add', 'add', '{"type":"object","properties":{"a":{"type":"number"},"b":{"type":"number"}},"required":["a","b"]}', 'addReturn');
  add('argA', {opcode: `${ID}_functionArgument`, parent: 'sum', inputs: {PATH: [1, [10, 'a']]}});
  add('argB', {opcode: `${ID}_functionArgument`, parent: 'sum', inputs: {PATH: [1, [10, 'b']]}});
  add('sum', {opcode: 'operator_add', parent: 'addReturn', inputs: {NUM1: [3, 'argA', [4, '']], NUM2: [3, 'argB', [4, '']]}});
  add('addReturn', {opcode: `${ID}_returnValue`, parent: 'add', inputs: {VALUE: [3, 'sum', [10, '']]}});

  // outer: return (call function [add] with [{"a":40,"b":2}])
  define('outer', 'outer', '{"type":"object"}', 'outerReturn');
  add('outerCall', {
    opcode: `${ID}_callFunction`,
    parent: 'outerReturn',
    inputs: {NAME: [1, [10, 'add']], ARGS: [1, [10, '{"a":40,"b":2}']]}
  });
  add('outerReturn', {opcode: `${ID}_returnValue`, parent: 'outer', inputs: {VALUE: [3, 'outerCall', [10, '']]}});

  // loop: return (join (call function [loop] with [{}]) (last function error))
  define('loop', 'loop', '{"type":"object"}', 'loopReturn');
  add('loopCall', {opcode: `${ID}_callFunction`, parent: 'loopJoin', inputs: {NAME: [1, [10, 'loop']], ARGS: [1, [10, '{}']]}});
  add('loopError', {opcode: `${ID}_lastError`, parent: 'loopJoin'});
  add('loopJoin', {
    opcode: 'operator_join',
    parent: 'loopReturn',
    inputs: {STRING1: [3, 'loopCall', [10, '']], STRING2: [3, 'loopError', [10, '']]}
  });
  add('loopReturn', {opcode: `${ID}_returnValue`, parent: 'loop', inputs: {VALUE: [3, 'loopJoin', [10, '']]}});

  const base = {
    variables: {},
    lists: {},
    broadcasts: {},
    comments: {},
    currentCostume: 0,
    costumes: [{name: 'c', assetId: 'cd21514d0531fdffb22204e0ec5ed84a', md5ext: 'cd21514d0531fdffb22204e0ec5ed84a.svg', dataFormat: 'svg', rotationCenterX: 0, rotationCenterY: 0}],
    sounds: [],
    volume: 100,
    layerOrder: 0
  };
  return {
    targets: [
      {...base, isStage: true, name: 'Stage', blocks: {}, tempo: 60, videoTransparency: 50, videoState: 'off', textToSpeechLanguage: null},
      {...base, isStage: false, name: 'S', blocks, layerOrder: 1, visible: true, x: 0, y: 0, size: 100, direction: 90, draggable: false, rotationStyle: 'all around'}
    ],
    monitors: [],
    extensions: [ID],
    meta: {semver: '3.0.0', vm: '0.2.0', agent: 'test'}
  };
}

describe.skipIf(!vmPath)('named functions on a real TurboWarp VM', () => {
  let vm: VirtualMachineLike;
  let extension: {
    callFunction(args: Record<string, unknown>): Promise<unknown>;
    startFunction(args: Record<string, unknown>): string;
    awaitAll(args: Record<string, unknown>): Promise<string>;
  };

  beforeAll(async () => {
    vi.stubGlobal('Scratch', {
      BlockType: {COMMAND: 'command', REPORTER: 'reporter', BOOLEAN: 'Boolean', HAT: 'hat'},
      ArgumentType: {STRING: 'string', NUMBER: 'number', BOOLEAN: 'Boolean'},
      Cast: {toString: (value: unknown) => String(value), toNumber: (value: unknown) => Number(value)},
      translate: (message: string | {default: string}) => (typeof message === 'string' ? message : message.default)
    });
    const require = createRequire(import.meta.url);
    const VirtualMachine = require(vmPath as string) as new () => VirtualMachineLike;
    const {NamedFunctionsExtension} = await import('../src/extension.js');
    vm = new VirtualMachine();
    vm.setCompilerOptions({enabled: true});
    const instance = new NamedFunctionsExtension({runtime: vm.runtime});
    extension = instance as unknown as typeof extension;
    const serviceName = vm.extensionManager._registerInternalExtension(instance);
    vm.extensionManager._loadedExtensions.set(ID, serviceName);
    await vm.loadProject(buildProject());
    vm.setFramerate(250);
    vm.start();
  });

  afterAll(() => {
    vm?.stop();
    vi.unstubAllGlobals();
  });

  it('calls a function by name', async () => {
    await expect(extension.callFunction({NAME: 'add', ARGS: '{"a":1,"b":2}'})).resolves.toBe(3);
  });

  it('calls a function from inside another function with the call block', async () => {
    await expect(extension.callFunction({NAME: 'outer', ARGS: '{}'})).resolves.toBe(42);
  });

  it('reports reentrant calls instead of deadlocking', async () => {
    await expect(extension.callFunction({NAME: 'loop', ARGS: '{}'})).resolves.toContain('Reentrant call: loop -> loop');
  });

  it('starts several calls and awaits them all', async () => {
    const refs = [1, 2, 3].map((n) => extension.startFunction({NAME: 'add', ARGS: `{"a":${n},"b":10}`}));
    await expect(extension.awaitAll({PROMISES: `[${refs.join(',')}]`})).resolves.toBe('[11,12,13]');
  });
});
