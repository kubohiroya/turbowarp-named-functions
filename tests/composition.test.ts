import {describe, expect, it} from 'vitest';
import {createNamedFunctions} from '../src/composition.js';
import {FakeRuntime, targetWithFunctions} from './helpers/fake-runtime.js';

const OPCODE = 'consumer_defineFunction';
const ADD_SCHEMA = '{"type":"object","properties":{"a":{"type":"number"},"b":{"type":"number"}},"required":["a","b"]}';

function setup(maxInFlight?: number) {
  const runtime = new FakeRuntime();
  runtime.targets = [
    targetWithFunctions(OPCODE, [
      {name: 'add', schema: ADD_SCHEMA, exportAs: 'tool'},
      {name: 'secret', exportAs: 'none'},
      {name: 'slow'}
    ])
  ];
  const functions = createNamedFunctions({
    runtime,
    functionHatOpcode: OPCODE,
    ...(maxInFlight === undefined ? {} : {maxInFlight})
  });
  /** Simulates the VM: evaluates started hats for `name` and returns the bound thread. */
  const run = (name: string) => {
    const thread = runtime.spawnThread();
    if (!functions.matchHat(name, thread)) throw new Error(`hat ${name} did not match`);
    return thread;
  };
  return {runtime, functions, run};
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createNamedFunctions', () => {
  it('lists exported functions as tools', () => {
    const {functions} = setup();
    expect(functions.tools()).toEqual([
      {type: 'function', name: 'add', description: 'Description of add', parameters: JSON.parse(ADD_SCHEMA)},
      {type: 'function', name: 'slow', description: 'Description of slow', parameters: {type: 'object', properties: {}}}
    ]);
    expect(functions.isDefined('secret')).toBe(true);
    expect(functions.isDefined('missing')).toBe(false);
  });

  it('validates arguments before starting the hat', async () => {
    const {runtime, functions} = setup();
    await expect(functions.call('add', {a: 1})).rejects.toThrow('Invalid arguments for add: $.b is required');
    await expect(functions.call('add', {a: 1, b: 'x'})).rejects.toThrow('$.b must be number');
    expect(runtime.startedHats).toEqual([]);
  });

  it('calls a function and returns its value', async () => {
    const {functions, run} = setup();
    const result = functions.call('add', {a: 1, b: 2});
    const thread = run('add');
    expect(functions.argumentsFor(thread)).toEqual({a: 1, b: 2});
    functions.returnFrom(thread, 3);
    await expect(result).resolves.toBe(3);
  });

  it('refuses unexported functions when exportedOnly is set', async () => {
    const {functions} = setup();
    await expect(functions.call('secret', {}, {exportedOnly: true})).rejects.toThrow('not exported');
    await expect(functions.call('missing', {})).rejects.toThrow('Unknown function: missing');
  });

  it('starts, reports settlement, and awaits results', async () => {
    const {runtime, functions, run} = setup();
    const ref = functions.start('add', {a: 2, b: 3});
    expect(ref).toEqual({$promise: 'p_1'});
    await flush();
    expect(functions.isSettled(ref)).toBe(false);
    functions.returnFrom(run('add'), 5);
    await flush();
    expect(functions.isSettled(ref)).toBe(true);
    await expect(functions.await(ref)).resolves.toBe(5);
    await expect(functions.await({$promise: 'p_404'})).rejects.toThrow('Unknown or expired');
    runtime.emit('PROJECT_STOP_ALL');
    await expect(functions.await(ref)).rejects.toThrow('Unknown or expired');
  });

  it('awaits all, turning failures into $error entries in place', async () => {
    const {runtime, functions, run} = setup();
    const ok = functions.start('add', {a: 1, b: 1});
    const bad = functions.start('add', {a: 1});
    const all = functions.awaitAll([ok, bad, {$promise: 'nope'}]);
    await flush();
    functions.returnFrom(run('add'), 2);
    runtime.step();
    await expect(all).resolves.toEqual([
      2,
      {$error: 'Invalid arguments for add: $.b is required'},
      {$error: 'Unknown or expired promise reference.'}
    ]);
    await expect(functions.awaitAll('not an array')).rejects.toThrow('JSON array');
  });

  it('limits concurrently running starts', async () => {
    const {runtime, functions, run} = setup(1);
    const first = functions.start('slow', {});
    const second = functions.start('add', {a: 1, b: 1});
    await flush();
    // Only the first call has started its hat.
    expect(runtime.startedHats).toHaveLength(1);
    functions.returnFrom(run('slow'), 'slow');
    runtime.step();
    await flush();
    runtime.step();
    expect(runtime.startedHats).toHaveLength(2);
    functions.returnFrom(run('add'), 2);
    await expect(functions.awaitAll([first, second])).resolves.toEqual(['slow', 2]);
  });

  it('rejects reentrant calls made from inside a function', async () => {
    const {functions, run} = setup();
    const outer = functions.call('slow', {});
    const thread = run('slow');
    await expect(functions.call('slow', {}, {caller: thread})).rejects.toThrow('Reentrant call: slow -> slow');
    functions.returnFrom(thread, null);
    await expect(outer).resolves.toBeNull();
  });
});
