import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createNamedFunctions} from '../src/composition.js';
import {DEFINE_FUNCTION_OPCODE, NamedFunctionsExtension} from '../src/extension.js';
import {
  resolveFunction,
  scanFunctionDefinitions,
  upgradeLegacyScopes,
  visibleFunctions
} from '../src/function-registry.js';
import type {RuntimeTarget, RuntimeThread} from '../src/runtime-types.js';
import {FakeRuntime, targetWithFunctions, type FunctionHatSpec} from './helpers/fake-runtime.js';

const OPCODE = 'ext_defineFunction';

const local = (name: string): FunctionHatSpec => ({name, scope: 'sprite', exportAs: 'none'});
const global = (name: string): FunctionHatSpec => ({name, scope: 'global', exportAs: 'none'});

/** A clone shares its sprite's blocks and `sprite`, but is a different target. */
function cloneOf(target: RuntimeTarget): RuntimeTarget {
  return {...target, id: `${target.id ?? 'sprite'}-clone`, isOriginal: false};
}

describe('function scopes in definitions', () => {
  it('keeps hats saved before SCOPE existed global', () => {
    const scan = scanFunctionDefinitions([targetWithFunctions(OPCODE, [{name: 'old'}])], OPCODE);
    expect(scan.functions[0]?.scope).toBe('global');
  });

  it('reads sprite and global scopes and rejects unknown ones', () => {
    const target = targetWithFunctions(OPCODE, [local('mine'), global('shared')]);
    target.blocks._blocks.hat0!.fields!.SCOPE = {value: 'galaxy'};
    const scan = scanFunctionDefinitions([target], OPCODE);
    expect(scan.functions.map((definition) => [definition.name, definition.scope])).toEqual([['shared', 'global']]);
    expect(scan.errors).toEqual(['Sprite1 (block hat0): unknown function scope "galaxy"']);
  });

  it('lets each sprite use the same name for its own function', () => {
    const scan = scanFunctionDefinitions(
      [targetWithFunctions(OPCODE, [local('jump')], 'Cat'), targetWithFunctions(OPCODE, [local('jump')], 'Dog')],
      OPCODE
    );
    expect(scan.errors).toEqual([]);
    expect(scan.functions.map((definition) => definition.targetName)).toEqual(['Cat', 'Dog']);
  });

  it('rejects a name used twice in one sprite or twice globally', () => {
    const scan = scanFunctionDefinitions(
      [
        targetWithFunctions(OPCODE, [local('jump'), local('jump')], 'Cat'),
        targetWithFunctions(OPCODE, [global('reset')], 'Dog'),
        targetWithFunctions(OPCODE, [global('reset')], 'Stage')
      ],
      OPCODE
    );
    expect(scan.errors).toEqual([
      'Stage (block hat0): function "reset" is already defined in Dog (block hat0)',
      'Cat (block hat1): function "jump" is already defined in Cat (block hat0)'
    ]);
  });

  it('rejects a sprite function that reuses a global name, wherever it is', () => {
    const scan = scanFunctionDefinitions(
      [targetWithFunctions(OPCODE, [local('reset')], 'Cat'), targetWithFunctions(OPCODE, [global('reset')], 'Stage')],
      OPCODE
    );
    expect(scan.functions.map((definition) => definition.targetName)).toEqual(['Stage']);
    expect(scan.errors).toEqual([
      'Cat (block hat0): function "reset" is already defined for all sprites in Stage (block hat0)'
    ]);
  });

  it('exports only global functions as tools', () => {
    const scan = scanFunctionDefinitions([targetWithFunctions(OPCODE, [{name: 'ask', scope: 'sprite'}])], OPCODE);
    expect(scan.errors).toEqual(['Sprite1 (block hat0): a function exported as a tool must be for all sprites']);
  });
});

describe('upgrading hats saved before SCOPE', () => {
  it('writes SCOPE = global once per sprite and leaves explicit scopes alone', () => {
    const target = targetWithFunctions(OPCODE, [{name: 'old'}, local('mine')]);
    const checked = new WeakSet<RuntimeTarget>();
    expect(upgradeLegacyScopes([target], OPCODE, checked)).toBe(1);
    expect(target.blocks._blocks.hat0?.fields?.SCOPE).toEqual({name: 'SCOPE', value: 'global'});
    expect(target.blocks._blocks.hat1?.fields?.SCOPE).toEqual({value: 'sprite'});
    delete target.blocks._blocks.hat0!.fields!.SCOPE;
    expect(upgradeLegacyScopes([target], OPCODE, checked)).toBe(0);
  });

  it('skips clones, which share their sprite blocks', () => {
    const target = targetWithFunctions(OPCODE, [{name: 'old'}]);
    expect(upgradeLegacyScopes([cloneOf(target)], OPCODE, new WeakSet())).toBe(0);
  });
});

describe('resolving a call by the caller sprite', () => {
  const cat = targetWithFunctions(OPCODE, [local('jump')], 'Cat');
  const stage = targetWithFunctions(OPCODE, [global('reset')], 'Stage');
  const dog = targetWithFunctions(OPCODE, [], 'Dog');
  const {functions} = scanFunctionDefinitions([cat, stage, dog], OPCODE);

  it('runs a sprite function as the caller, including a clone', () => {
    expect(resolveFunction(functions, 'jump', cat)?.runAs).toBe(cat);
    const clone = cloneOf(cat);
    expect(resolveFunction(functions, 'jump', clone)?.runAs).toBe(clone);
  });

  it('runs a global function as the sprite or stage that defines it', () => {
    expect(resolveFunction(functions, 'reset', dog)?.runAs).toBe(stage);
    expect(resolveFunction(functions, 'reset')?.runAs).toBe(stage);
  });

  it('hides another sprite function, and every sprite function from outside', () => {
    expect(resolveFunction(functions, 'jump', dog)).toBeUndefined();
    expect(resolveFunction(functions, 'jump')).toBeUndefined();
  });

  it('lists the functions a sprite can call', () => {
    expect(visibleFunctions(functions, cat).map((definition) => definition.name)).toEqual(['jump', 'reset']);
    expect(visibleFunctions(functions, dog).map((definition) => definition.name)).toEqual(['reset']);
    expect(visibleFunctions(functions).map((definition) => definition.name)).toEqual(['reset']);
  });
});

describe('scoped calls', () => {
  function setup() {
    const runtime = new FakeRuntime();
    const cat = targetWithFunctions(OPCODE, [local('jump')], 'Cat');
    const dog = targetWithFunctions(OPCODE, [local('jump')], 'Dog');
    const stage = targetWithFunctions(OPCODE, [global('reset')], 'Stage');
    runtime.targets = [cat, dog, stage];
    const functions = createNamedFunctions({runtime, functionHatOpcode: OPCODE});
    return {runtime, functions, cat, dog, stage};
  }

  const callerIn = (target: RuntimeTarget): RuntimeThread => ({topBlock: 'caller', target});

  it('explains why another sprite function cannot be called', async () => {
    const {functions, cat, dog} = setup();
    expect(functions.isDefined('jump', cat)).toBe(true);
    expect(functions.isDefined('jump')).toBe(false);
    await expect(functions.call('jump', {})).rejects.toThrow(
      'Function jump belongs to Cat; only functions for all sprites can be called from outside.'
    );
    expect(functions.isDefined('reset', dog)).toBe(true);
  });

  it('binds only the caller sprite hat when several sprites share a name (stock TurboWarp)', async () => {
    const {runtime, functions, cat, dog} = setup();
    const result = functions.call('jump', {}, {caller: callerIn(dog)});
    // The VM starts every define function hat; only Dog's may run this call.
    expect(functions.matchHat('jump', runtime.spawnHatThread(OPCODE, 'jump', cat))).toBe(false);
    const dogThread = runtime.spawnHatThread(OPCODE, 'jump', dog);
    expect(functions.matchHat('jump', dogThread)).toBe(true);
    functions.returnFrom(dogThread, 'dog jumped');
    await expect(result).resolves.toBe('dog jumped');
  });

  it('runs through the port as the clone that calls, or as the global owner', () => {
    const runtime = new FakeRuntime();
    const cat = targetWithFunctions(OPCODE, [local('jump')], 'Cat');
    const stage = targetWithFunctions(OPCODE, [global('reset')], 'Stage');
    runtime.targets = [cat, stage];
    const started: RuntimeTarget[] = [];
    Object.assign(runtime, {
      getThreadExecutionPort: () => ({
        version: 1,
        startScript: (_blockId: string, target: RuntimeTarget) => {
          started.push(target);
          return runtime.spawnThread('hat0', target);
        },
        runNow: () => 'done' as const
      })
    });
    const functions = createNamedFunctions({runtime, functionHatOpcode: OPCODE});
    const clone = cloneOf(cat);
    expect(functions.callNow('jump', {}, {caller: callerIn(clone)}).state).toBe('fulfilled');
    expect(functions.callNow('reset', {}, {caller: callerIn(clone)}).state).toBe('fulfilled');
    expect(started).toEqual([clone, stage]);
  });
});

describe('scoped call blocks', () => {
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
    const cat = targetWithFunctions(DEFINE_FUNCTION_OPCODE, [local('jump'), local('spin')], 'Cat');
    const stage = targetWithFunctions(DEFINE_FUNCTION_OPCODE, [global('reset')], 'Stage');
    const dog = targetWithFunctions(DEFINE_FUNCTION_OPCODE, [], 'Dog');
    runtime.targets = [cat, stage, dog];
    return {runtime, extension: new NamedFunctionsExtension({runtime}), cat, dog};
  }

  it('lists the edited sprite functions first, then the global ones', () => {
    const {extension} = setup();
    expect(extension.functionMenu('Cat').map((item) => item.value)).toEqual(['jump', 'spin', 'reset']);
    expect(extension.functionMenu('Dog').map((item) => item.value)).toEqual(['reset']);
  });

  it('offers a placeholder when nothing can be called', () => {
    const runtime = new FakeRuntime();
    runtime.targets = [targetWithFunctions(DEFINE_FUNCTION_OPCODE, [], 'Cat')];
    const extension = new NamedFunctionsExtension({runtime});
    expect(extension.functionMenu('Cat')).toEqual([{text: '(no functions)', value: ''}]);
  });

  it('declares the scope menu with global first, so hats without SCOPE show their meaning', () => {
    const {extension} = setup();
    const info = extension.getInfo() as {
      blocks: Array<{opcode: string; arguments: Record<string, {defaultValue: string; menu?: string}>}>;
      menus: Record<string, {items: unknown}>;
    };
    const hat = info.blocks.find((block) => block.opcode === 'defineFunction');
    expect(hat?.arguments.SCOPE).toMatchObject({defaultValue: 'sprite', menu: 'functionScopes'});
    expect(info.menus.functionScopes?.items).toEqual([
      {text: 'all sprites', value: 'global'},
      {text: 'this sprite only', value: 'sprite'}
    ]);
    expect(info.menus.functionNames?.items).toBe('functionMenu');
  });

  it('upgrades old hats when added, and again for sprites that arrive later', () => {
    const runtime = new FakeRuntime();
    runtime.targets = [targetWithFunctions(DEFINE_FUNCTION_OPCODE, [{name: 'old'}], 'Cat')];
    new NamedFunctionsExtension({runtime});
    expect(runtime.targets[0]?.blocks._blocks.hat0?.fields?.SCOPE?.value).toBe('global');
    runtime.targets.push(targetWithFunctions(DEFINE_FUNCTION_OPCODE, [{name: 'older'}], 'Dog'));
    runtime.emit('PROJECT_CHANGED');
    expect(runtime.targets[1]?.blocks._blocks.hat0?.fields?.SCOPE?.value).toBe('global');
  });

  it('calls a chosen function and checks what the calling sprite can see', () => {
    const {extension, runtime, cat, dog} = setup();
    const result = extension.callFunctionFromMenu({FUNCTION: 'jump', ARGS: '{}'}, {thread: {target: dog}});
    expect(result).toBe('');
    expect(extension.lastError()).toBe('Function jump belongs to Cat; make it for all sprites to call it from here.');
    expect(extension.isDefined({NAME: 'jump'}, {thread: {target: cat}})).toBe(true);
    expect(extension.isDefined({NAME: 'jump'}, {thread: {target: dog}})).toBe(false);
    expect(runtime.startedHats).toEqual([]);
  });
});
