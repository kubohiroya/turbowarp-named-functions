// Runs named functions on a real headless TurboWarp VM.
// Skipped unless SCRATCH_VM_PATH points at a TurboWarp scratch-vm checkout, e.g.
//   SCRATCH_VM_PATH=/path/to/TurboWarp/scratch-vm pnpm test
// With the TurboWarp Plus VM (kubohiroya/scratch-vm), which has the thread execution port, the suite
// runs twice: once through the port and once with the port hidden, as on stock TurboWarp.
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

  // sum: if (n < 1) return 0 else return (n + (call function [sum] with (join '{"n":' (join (n - 1) '}'))))
  define('sumFn', 'sum', '{"type":"object","properties":{"n":{"type":"number"}},"required":["n"]}', 'sumIf');
  add('sumIf', {
    opcode: 'control_if_else',
    parent: 'sumFn',
    inputs: {CONDITION: [2, 'sumLess'], SUBSTACK: [2, 'sumBase'], SUBSTACK2: [2, 'sumStep']}
  });
  add('sumArgCond', {opcode: `${ID}_functionArgument`, parent: 'sumLess', inputs: {PATH: [1, [10, 'n']]}});
  add('sumLess', {opcode: 'operator_lt', parent: 'sumIf', inputs: {OPERAND1: [3, 'sumArgCond', [10, '']], OPERAND2: [1, [10, '1']]}});
  add('sumBase', {opcode: `${ID}_returnValue`, parent: 'sumIf', inputs: {VALUE: [1, [10, '0']]}});
  add('sumArgNext', {opcode: `${ID}_functionArgument`, parent: 'sumMinus', inputs: {PATH: [1, [10, 'n']]}});
  add('sumMinus', {opcode: 'operator_subtract', parent: 'sumJoinTail', inputs: {NUM1: [3, 'sumArgNext', [4, '']], NUM2: [1, [4, '1']]}});
  add('sumJoinTail', {opcode: 'operator_join', parent: 'sumJoin', inputs: {STRING1: [3, 'sumMinus', [10, '']], STRING2: [1, [10, '}']]}});
  add('sumJoin', {opcode: 'operator_join', parent: 'sumCall', inputs: {STRING1: [1, [10, '{"n":']], STRING2: [3, 'sumJoinTail', [10, '']]}});
  add('sumCall', {opcode: `${ID}_callFunction`, parent: 'sumAdd', inputs: {NAME: [1, [10, 'sum']], ARGS: [3, 'sumJoin', [10, '']]}});
  add('sumArgSelf', {opcode: `${ID}_functionArgument`, parent: 'sumAdd', inputs: {PATH: [1, [10, 'n']]}});
  add('sumAdd', {opcode: 'operator_add', parent: 'sumStep', inputs: {NUM1: [3, 'sumArgSelf', [4, '']], NUM2: [3, 'sumCall', [4, '']]}});
  add('sumStep', {opcode: `${ID}_returnValue`, parent: 'sumIf', inputs: {VALUE: [3, 'sumAdd', [10, '']]}});

  // secret: for this sprite only; return 7. viaSprite: for all sprites; return (call function [secret])
  define('secretFn', 'secret', '{"type":"object"}', 'secretReturn');
  (blocks.secretFn!.fields as Record<string, unknown>).SCOPE = ['sprite', null];
  add('secretReturn', {opcode: `${ID}_returnValue`, parent: 'secretFn', inputs: {VALUE: [1, [10, '7']]}});
  define('viaSpriteFn', 'viaSprite', '{"type":"object"}', 'viaSpriteReturn');
  add('viaSpriteCall', {
    opcode: `${ID}_callFunction`,
    parent: 'viaSpriteReturn',
    inputs: {NAME: [1, [10, 'secret']], ARGS: [1, [10, '{}']]}
  });
  add('viaSpriteReturn', {opcode: `${ID}_returnValue`, parent: 'viaSpriteFn', inputs: {VALUE: [3, 'viaSpriteCall', [10, '']]}});

  // badReturn: return text against a numeric return schema
  define('badReturnFn', 'badReturn', '{"type":"object"}', 'badReturn');
  blocks.badReturnFn!.inputs = {...(blocks.badReturnFn!.inputs as Record<string, unknown>), RETURNS: [1, [10, '{"type":"number"}']]};
  add('badReturn', {opcode: `${ID}_returnValue`, parent: 'badReturnFn', inputs: {VALUE: [1, [10, 'wrong']]}});

  // define schema [Scored] version [1.0.0] / property [points] type [number] required / limit minimum to 0
  add('schemaHat', {
    opcode: `${ID}_defineSchema`,
    topLevel: true,
    x: 0,
    y: 400,
    next: 'schemaProp',
    inputs: {NAME: [1, [10, 'Scored']], VERSION: [1, [10, '1.0.0']]}
  });
  add('schemaProp', {
    opcode: `${ID}_schemaProperty`,
    parent: 'schemaHat',
    next: 'schemaLimit',
    inputs: {NAME: [1, [10, 'points']]},
    fields: {TYPE: ['number', null], PRESENCE: ['required', null]}
  });
  add('schemaLimit', {
    opcode: `${ID}_schemaConstraint`,
    parent: 'schemaProp',
    inputs: {VALUE: [1, [4, '0']]},
    fields: {KEYWORD: ['minimum', null]}
  });

  // scored: args come from the block-built schema; return (function argument points)
  define('scoredFn', 'scored', 'Scored', 'scoredReturn');
  add('scoredArg', {opcode: `${ID}_functionArgument`, parent: 'scoredReturn', inputs: {PATH: [1, [10, 'points']]}});
  add('scoredReturn', {opcode: `${ID}_returnValue`, parent: 'scoredFn', inputs: {VALUE: [3, 'scoredArg', [10, '']]}});

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

function hasPort(): boolean {
  if (!vmPath) return false;
  const require = createRequire(import.meta.url);
  const VirtualMachine = require(vmPath) as new () => VirtualMachineLike;
  return typeof (new VirtualMachine().runtime as {getThreadExecutionPort?: unknown}).getThreadExecutionPort === 'function';
}

const modes = hasPort() ? (['port', 'stock'] as const) : (['stock'] as const);

describe.skipIf(!vmPath).each(modes)('named functions on a real TurboWarp VM (%s)', (mode) => {
  let vm: VirtualMachineLike;
  let extension: {
    callFunction(args: Record<string, unknown>): unknown;
    startFunction(args: Record<string, unknown>): string;
    awaitAll(args: Record<string, unknown>): Promise<string>;
    schemaJson(args: Record<string, unknown>): string;
    isSchemaDefined(args: Record<string, unknown>): boolean;
    lastError(): string;
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
    if (mode === 'stock') {
      // Hide the port, as on stock TurboWarp.
      (vm.runtime as {getThreadExecutionPort?: unknown}).getThreadExecutionPort = undefined;
    }
    const instance = new NamedFunctionsExtension({runtime: vm.runtime});
    extension = instance as unknown as typeof extension;
    const serviceName = vm.extensionManager._registerInternalExtension(instance);
    vm.extensionManager._loadedExtensions.set(ID, serviceName);
    await vm.loadProject(buildProject());
    vm.setFramerate(250);
    vm.start();
  });

  /** The call block's result, whether it settled during the call or later. */
  const call = (args: Record<string, unknown>) => Promise.resolve(extension.callFunction(args));

  afterAll(() => {
    vm?.stop();
    vi.unstubAllGlobals();
  });

  it('calls a function by name', async () => {
    await expect(call({NAME: 'add', ARGS: '{"a":1,"b":2}'})).resolves.toBe(3);
  });

  it('calls a function from inside another function with the call block', async () => {
    await expect(call({NAME: 'outer', ARGS: '{}'})).resolves.toBe(42);
  });

  it.runIf(mode === 'port')('returns results in the same step through the port', () => {
    expect(extension.callFunction({NAME: 'add', ARGS: '{"a":1,"b":2}'})).toBe(3);
    expect(extension.callFunction({NAME: 'outer', ARGS: '{}'})).toBe(42);
  });

  it.runIf(mode === 'port')('runs recursive functions through the port', () => {
    expect(extension.callFunction({NAME: 'sum', ARGS: '{"n":10}'})).toBe(55);
  });

  it.runIf(mode === 'port')('continues recursion deeper than the synchronous limit on later frames', async () => {
    const result = extension.callFunction({NAME: 'sum', ARGS: '{"n":200}'});
    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toBe(20100);
  });

  it.runIf(mode === 'stock')('waits for the function script on stock TurboWarp', async () => {
    const result = extension.callFunction({NAME: 'add', ARGS: '{"a":1,"b":2}'});
    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toBe(3);
  });

  it.runIf(mode === 'stock')('reports recursion as a runtime error on stock TurboWarp', async () => {
    const result = await call({NAME: 'loop', ARGS: '{}'});
    expect(result).toContain('Reentrant call: loop -> loop');
    expect(result).toContain('Recursion needs the TurboWarp Plus runtime');
  });

  it('calls a sprite function only from that sprite', async () => {
    await expect(call({NAME: 'viaSprite', ARGS: '{}'})).resolves.toBe(7);
    await expect(call({NAME: 'secret', ARGS: '{}'})).resolves.toBe('');
    expect(extension.lastError()).toContain('Function secret belongs to S');
  });

  it('rejects a return value that does not match its return schema', async () => {
    await expect(call({NAME: 'badReturn', ARGS: '{}'})).resolves.toBe('');
    expect(extension.lastError()).toContain('Invalid return value for badReturn: $ must be number');
  });

  it('lowers a define schema stack as the VM serializes it', () => {
    expect(extension.isSchemaDefined({NAME: 'Scored'})).toBe(true);
    expect(extension.isSchemaDefined({NAME: 'Scored@1.0.0'})).toBe(true);
    expect(extension.isSchemaDefined({NAME: 'Missing'})).toBe(false);
    expect(JSON.parse(extension.schemaJson({NAME: 'Scored'}))).toEqual({
      type: 'object',
      properties: {points: {type: 'number', minimum: 0}},
      required: ['points']
    });
  });

  it('validates arguments against a block-built schema named by a function', async () => {
    await expect(call({NAME: 'scored', ARGS: '{"points":7}'})).resolves.toBe(7);

    await expect(call({NAME: 'scored', ARGS: '{"points":-1}'})).resolves.toBe('');
    expect(extension.lastError()).toContain('Invalid arguments for scored: $.points must be >= 0');

    await expect(call({NAME: 'scored', ARGS: '{}'})).resolves.toBe('');
    expect(extension.lastError()).toContain('$.points is required');
  });

  it('starts several calls and awaits them all', async () => {
    const refs = [1, 2, 3].map((n) => extension.startFunction({NAME: 'add', ARGS: `{"a":${n},"b":10}`}));
    await expect(extension.awaitAll({PROMISES: `[${refs.join(',')}]`})).resolves.toBe('[11,12,13]');
  });
});
