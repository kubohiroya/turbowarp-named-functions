import {describe, expect, it} from 'vitest';
import {
  FunctionDispatcher,
  MAX_SYNC_DEPTH,
  type CallOutcome,
  parseJsonOrText,
  readArgumentPath,
  toScratchValue
} from '../src/function-dispatcher.js';
import {FakeRuntime} from './helpers/fake-runtime.js';
import type {RuntimeTarget, RuntimeThread} from '../src/runtime-types.js';

const OPCODE = 'ext_defineFunction';

function setup(names = ['f', 'g'], timeoutMs = 30_000, runtime = new FakeRuntime()) {
  const timers: Array<{callback: () => void; ms: number; cleared: boolean}> = [];
  const dispatcher = new FunctionDispatcher(runtime, {
    hatOpcode: OPCODE,
    knownNames: () => new Set(names),
    timeoutMs,
    setTimer: (callback, ms) => {
      const timer = {callback, ms, cleared: false};
      timers.push(timer);
      return timer;
    },
    clearTimer: (handle) => {
      (handle as {cleared: boolean}).cleared = true;
    }
  });
  return {runtime, dispatcher, timers};
}

/** Simulates the VM evaluating the started hats: the one named `name` matches. */
function runHat(runtime: FakeRuntime, dispatcher: FunctionDispatcher, name: string) {
  const thread = runtime.spawnThread();
  const matched = dispatcher.matchHat(name, thread);
  return {thread, matched};
}

describe('FunctionDispatcher', () => {
  it('starts the hats, binds the matching thread, and resolves on return', async () => {
    const {runtime, dispatcher} = setup();
    const result = dispatcher.invoke('f', {x: 1});
    expect(runtime.startedHats).toEqual([OPCODE]);
    expect(dispatcher.matchHat('g', runtime.spawnThread())).toBe(false);
    const {thread, matched} = runHat(runtime, dispatcher, 'f');
    expect(matched).toBe(true);
    expect(dispatcher.argumentsFor(thread)).toEqual({x: 1});
    dispatcher.returnFrom(thread, {ok: true});
    await expect(result).resolves.toEqual({ok: true});
  });

  it('resolves null when the script ends without return', async () => {
    const {runtime, dispatcher} = setup();
    const result = dispatcher.invoke('f', {});
    const {thread} = runHat(runtime, dispatcher, 'f');
    runtime.endThread(thread);
    runtime.step();
    await expect(result).resolves.toBeNull();
  });

  it('queues calls to the same name and runs different names concurrently', async () => {
    const {runtime, dispatcher} = setup();
    const first = dispatcher.invoke('f', 1);
    const second = dispatcher.invoke('f', 2);
    const other = dispatcher.invoke('g', 3);
    const f1 = runHat(runtime, dispatcher, 'f');
    // The next invocation starts only after the step ends.
    expect(runtime.startedHats).toHaveLength(1);
    runtime.step();
    // f is running, so the next invocation started is g, not the second f.
    expect(runtime.startedHats).toHaveLength(2);
    const g1 = runHat(runtime, dispatcher, 'g');
    expect(dispatcher.argumentsFor(g1.thread)).toBe(3);
    runtime.step();
    expect(runtime.startedHats).toHaveLength(2);
    dispatcher.returnFrom(f1.thread, 'one');
    expect(runtime.startedHats).toHaveLength(2);
    runtime.step();
    expect(runtime.startedHats).toHaveLength(3);
    const f2 = runHat(runtime, dispatcher, 'f');
    expect(dispatcher.argumentsFor(f2.thread)).toBe(2);
    dispatcher.returnFrom(f2.thread, 'two');
    dispatcher.returnFrom(g1.thread, 'three');
    await expect(Promise.all([first, second, other])).resolves.toEqual(['one', 'two', 'three']);
  });

  it('rejects unknown names without starting hats', async () => {
    const {runtime, dispatcher} = setup();
    await expect(dispatcher.invoke('missing', {})).rejects.toThrow('Unknown function');
    expect(runtime.startedHats).toEqual([]);
  });

  it('fails an invocation whose hat never starts', async () => {
    const {runtime, dispatcher} = setup();
    const result = dispatcher.invoke('f', {});
    runtime.step();
    runtime.step();
    runtime.step();
    await expect(result).rejects.toThrow('did not start');
  });

  it('times out and clears timers on settle', async () => {
    const {runtime, dispatcher, timers} = setup(['f'], 5);
    const result = dispatcher.invoke('f', {});
    runHat(runtime, dispatcher, 'f');
    timers[0]?.callback();
    await expect(result).rejects.toThrow('timed out');
    runtime.step();
    const second = dispatcher.invoke('f', {});
    const {thread} = runHat(runtime, dispatcher, 'f');
    dispatcher.returnFrom(thread, 1);
    await second;
    expect(timers[1]?.cleared).toBe(true);
  });

  it('cancels everything when the project stops', async () => {
    const {runtime, dispatcher} = setup();
    const running = dispatcher.invoke('f', {});
    const queued = dispatcher.invoke('f', {});
    runHat(runtime, dispatcher, 'f');
    runtime.emit('PROJECT_STOP_ALL');
    await expect(running).rejects.toThrow('stopped');
    await expect(queued).rejects.toThrow('stopped');
    expect(dispatcher.pendingCount).toBe(0);
  });

  it('rejects reentrant calls through the caller chain', async () => {
    const {runtime, dispatcher} = setup();
    const outer = dispatcher.invoke('f', {});
    const fThread = runHat(runtime, dispatcher, 'f').thread;
    await expect(dispatcher.invoke('f', {}, fThread)).rejects.toThrow('Reentrant call: f -> f');
    runtime.step();
    const inner = dispatcher.invoke('g', {}, fThread);
    runtime.step();
    const gThread = runHat(runtime, dispatcher, 'g').thread;
    await expect(dispatcher.invoke('f', {}, gThread)).rejects.toThrow('Reentrant call: f -> g -> f');
    dispatcher.returnFrom(gThread, 'g done');
    await expect(inner).resolves.toBe('g done');
    dispatcher.returnFrom(fThread, 'f done');
    await expect(outer).resolves.toBe('f done');
  });

  it('releases runtime listeners', async () => {
    const {dispatcher} = setup();
    const pending = dispatcher.invoke('f', {});
    dispatcher.release();
    await expect(pending).rejects.toThrow('released');
  });

  it('throws when argument blocks are used outside a function', () => {
    const {runtime, dispatcher} = setup();
    expect(() => dispatcher.argumentsFor(runtime.spawnThread())).toThrow('inside a running function');
    expect(() => dispatcher.returnFrom(undefined, 1)).toThrow('inside a running function');
  });
});

type Body = (thread: RuntimeThread) => 'done' | 'waiting';

/**
 * Gives the fake runtime a thread execution port. `bodies` stands in for the function scripts: runNow
 * calls the body of the script the thread was started at.
 */
function setupWithPort(bodies: Record<string, Body>, names = ['f', 'g']) {
  const runtime = new FakeRuntime();
  const scripts = new Map<RuntimeThread, string>();
  const ran: string[] = [];
  const port = {
    version: 1,
    startScript: (blockId: string) => {
      if (!bodies[blockId]) throw new Error('Block is not the top of a script');
      const thread = runtime.spawnThread();
      scripts.set(thread, blockId);
      return thread;
    },
    runNow: (thread: RuntimeThread) => {
      const blockId = scripts.get(thread) as string;
      ran.push(blockId);
      const status = (bodies[blockId] as Body)(thread);
      if (status === 'done') runtime.endThread(thread);
      return status;
    }
  };
  Object.assign(runtime, {getThreadExecutionPort: () => port});
  return {...setup(names, 30_000, runtime), ran};
}

const target = {blocks: {_blocks: {}}} as RuntimeTarget;
const script = (blockId: string) => ({target, blockId});

describe('FunctionDispatcher with the thread execution port', () => {
  it('runs the script inside the call and settles before returning', () => {
    let seenArgs: unknown;
    const {runtime, dispatcher, timers} = setupWithPort({
      fHat: (thread) => {
        expect(dispatcher.matchHat('f', thread)).toBe(true);
        expect(dispatcher.matchHat('g', thread)).toBe(false);
        seenArgs = dispatcher.argumentsFor(thread);
        dispatcher.returnFrom(thread, 42);
        return 'done';
      }
    });
    expect(dispatcher.runsSynchronously).toBe(true);
    expect(dispatcher.invokeNow({name: 'f', args: {x: 1}, script: script('fHat')})).toEqual({state: 'fulfilled', value: 42});
    expect(seenArgs).toEqual({x: 1});
    expect(runtime.startedHats).toEqual([]);
    expect(timers).toEqual([]);
    expect(dispatcher.pendingCount).toBe(0);
  });

  it('settles with null when the script ends without return', () => {
    const {dispatcher} = setupWithPort({fHat: () => 'done'});
    expect(dispatcher.invokeNow({name: 'f', args: {}, script: script('fHat')})).toEqual({state: 'fulfilled', value: null});
  });

  it('checks the return schema of a call that settles at once', () => {
    const {dispatcher} = setupWithPort({
      fHat: (thread) => {
        dispatcher.returnFrom(thread, 'text');
        return 'done';
      }
    });
    const outcome = dispatcher.invokeNow({name: 'f', args: {}, returnSchema: {type: 'number'}, script: script('fHat')});
    expect(outcome.state).toBe('rejected');
    expect((outcome as {error: Error}).error.message).toContain('Invalid return value for f');
  });

  it('lets a function call itself', () => {
    const depths: number[] = [];
    const {dispatcher} = setupWithPort({
      fHat: (thread) => {
        const n = (dispatcher.argumentsFor(thread) as {n: number}).n;
        depths.push(n);
        if (n === 0) {
          dispatcher.returnFrom(thread, 0);
          return 'done';
        }
        const inner = dispatcher.invokeNow({name: 'f', args: {n: n - 1}, caller: thread, script: script('fHat')});
        dispatcher.returnFrom(thread, n + (inner as {value: number}).value);
        return 'done';
      }
    });
    expect(dispatcher.invokeNow({name: 'f', args: {n: 3}, script: script('fHat')})).toEqual({state: 'fulfilled', value: 6});
    expect(depths).toEqual([3, 2, 1, 0]);
  });

  it('hands a waiting script to the sequencer and settles when it returns', async () => {
    let waiting: RuntimeThread | undefined;
    const {dispatcher, timers} = setupWithPort({
      fHat: (thread) => {
        waiting = thread;
        return 'waiting';
      }
    });
    const outcome = dispatcher.invokeNow({name: 'f', args: {}, script: script('fHat')});
    expect(outcome.state).toBe('pending');
    expect(timers).toHaveLength(1);
    dispatcher.returnFrom(waiting, 'later');
    await expect((outcome as {promise: Promise<unknown>}).promise).resolves.toBe('later');
    expect(timers[0]?.cleared).toBe(true);
  });

  it('settles with null when a waiting script ends without return', async () => {
    let waiting: RuntimeThread | undefined;
    const {runtime, dispatcher} = setupWithPort({
      fHat: (thread) => {
        waiting = thread;
        return 'waiting';
      }
    });
    const outcome = dispatcher.invokeNow({name: 'f', args: {}, script: script('fHat')}) as {promise: Promise<unknown>};
    runtime.endThread(waiting as RuntimeThread);
    runtime.step();
    await expect(outcome.promise).resolves.toBeNull();
  });

  it('starts calls deeper than the synchronous limit without running them', () => {
    // Every call waits, so each one becomes the caller of the next and the chain grows by one.
    let caller: RuntimeThread | undefined;
    const {runtime, dispatcher, ran} = setupWithPort({
      fHat: (thread) => {
        caller = thread;
        return 'waiting';
      }
    });
    for (let depth = 1; depth <= MAX_SYNC_DEPTH; depth++) {
      expect(dispatcher.invokeNow({name: 'f', args: {}, caller, script: script('fHat')}).state).toBe('pending');
    }
    expect(ran).toHaveLength(MAX_SYNC_DEPTH);
    const deep: CallOutcome = dispatcher.invokeNow({name: 'f', args: {}, caller, script: script('fHat')});
    expect(deep.state).toBe('pending');
    expect(ran).toHaveLength(MAX_SYNC_DEPTH);
    expect(runtime.threads).toHaveLength(MAX_SYNC_DEPTH + 1);
    dispatcher.cancelAll('stopped');
  });

  it('reports a script that cannot be started', () => {
    const {dispatcher} = setupWithPort({});
    const outcome = dispatcher.invokeNow({name: 'f', args: {}, script: script('gone')});
    expect(outcome.state).toBe('rejected');
    expect((outcome as {error: Error}).error.message).toBe('Block is not the top of a script');
    expect(dispatcher.pendingCount).toBe(0);
  });

  it('cancels waiting calls when the project stops', async () => {
    const {runtime, dispatcher} = setupWithPort({fHat: () => 'waiting'});
    const outcome = dispatcher.invokeNow({name: 'f', args: {}, script: script('fHat')}) as {promise: Promise<unknown>};
    runtime.emit('PROJECT_STOP_ALL');
    await expect(outcome.promise).rejects.toThrow('stopped');
    expect(dispatcher.pendingCount).toBe(0);
  });

  it('falls back to starting hats when the script is not known', async () => {
    const {runtime, dispatcher} = setupWithPort({});
    const result = dispatcher.invoke('f', {});
    expect(runtime.startedHats).toEqual([OPCODE]);
    const {thread} = runHat(runtime, dispatcher, 'f');
    dispatcher.returnFrom(thread, 1);
    await expect(result).resolves.toBe(1);
  });

  it('ignores a port of another version', () => {
    const runtime = new FakeRuntime();
    Object.assign(runtime, {getThreadExecutionPort: () => ({version: 2})});
    expect(setup(['f'], 30_000, runtime).dispatcher.runsSynchronously).toBe(false);
  });
});

describe('helpers', () => {
  it('reads dotted argument paths', () => {
    const args = {city: 'Tokyo', items: [{name: 'a'}]};
    expect(readArgumentPath(args, 'city')).toBe('Tokyo');
    expect(readArgumentPath(args, 'items.0.name')).toBe('a');
    expect(readArgumentPath(args, 'missing.x')).toBeUndefined();
    expect(readArgumentPath(args, '')).toBe(args);
  });

  it('converts values for reporters', () => {
    expect(toScratchValue(undefined)).toBe('');
    expect(toScratchValue(3)).toBe(3);
    expect(toScratchValue({a: 1})).toBe('{"a":1}');
  });

  it('parses JSON or keeps text', () => {
    expect(parseJsonOrText('{"score":10}')).toEqual({score: 10});
    expect(parseJsonOrText('42')).toBe(42);
    expect(parseJsonOrText('hello')).toBe('hello');
    expect(parseJsonOrText('  ')).toBe('');
  });
});
