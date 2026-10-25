import {describe, expect, it} from 'vitest';
import {createNamedFunctions, scanFunctionDefinitions} from '../src/composition.js';
import {
  FakeRuntime,
  targetWithFunctions,
  targetWithSchemas,
  testSchemaOpcodes,
  type FunctionHatSpec,
  type SchemaHatSpec
} from './helpers/fake-runtime.js';

const OPCODE = 'consumer_defineFunction';

const PLAYER: SchemaHatSpec = {
  name: 'Player',
  body: [
    {kind: 'property', name: 'name', type: 'string'},
    {kind: 'property', name: 'score', type: 'number', presence: 'optional'}
  ]
};

const PLAYER_SCHEMA = {
  type: 'object',
  properties: {name: {type: 'string'}, score: {type: 'number'}},
  required: ['name']
};

/** A consumer that wires both the function hat and the schema-builder blocks. */
function setup(functionSpecs: readonly FunctionHatSpec[], schemaSpecs: readonly SchemaHatSpec[] = [PLAYER]) {
  const runtime = new FakeRuntime();
  runtime.targets = [targetWithFunctions(OPCODE, functionSpecs), targetWithSchemas(schemaSpecs, 'Stage')];
  const functions = createNamedFunctions({
    runtime,
    functionHatOpcode: OPCODE,
    schemaBlockOpcodes: testSchemaOpcodes
  });
  const run = (name: string) => {
    const thread = runtime.spawnThread();
    if (!functions.matchHat(name, thread)) throw new Error(`hat ${name} did not match`);
    return thread;
  };
  return {runtime, functions, run};
}

describe('named schemas in function definitions', () => {
  it('uses a named schema for the arguments', () => {
    const {functions} = setup([{name: 'greet', schema: 'Player', exportAs: 'tool'}]);
    const scan = functions.scan();
    expect(scan.errors).toEqual([]);
    expect(scan.functions[0]?.parameters).toEqual(PLAYER_SCHEMA);
    expect(functions.tools()[0]?.parameters).toEqual(PLAYER_SCHEMA);
  });

  it('validates arguments against the named schema', async () => {
    const {functions, runtime} = setup([{name: 'greet', schema: 'Player', exportAs: 'none'}]);
    await expect(functions.call('greet', {score: 1})).rejects.toThrow('Invalid arguments for greet: $.name is required');
    expect(runtime.startedHats).toEqual([]);
  });

  it('uses a named schema for the return value', async () => {
    const {functions, run} = setup([{name: 'find', schema: '{"type":"object","properties":{}}', returns: 'Player'}]);
    expect(functions.scan().functions[0]?.returns).toEqual(PLAYER_SCHEMA);

    const good = functions.call('find', {});
    functions.returnFrom(run('find'), {name: 'ada'});
    await expect(good).resolves.toEqual({name: 'ada'});

    const bad = functions.call('find', {});
    functions.returnFrom(run('find'), {score: 1});
    await expect(bad).rejects.toThrow('Invalid return value for find: $.name is required');
  });

  it('resolves a reference pinned to a version', () => {
    const {functions} = setup(
      [{name: 'greet', schema: 'Player@2.0.0'}],
      [
        {name: 'Player', version: '1.0.0', body: [{kind: 'property', name: 'old', type: 'string'}]},
        {name: 'Player', version: '2.0.0', body: [{kind: 'property', name: 'fresh', type: 'string'}]}
      ]
    );
    expect(functions.scan().functions[0]?.parameters).toEqual({
      type: 'object',
      properties: {fresh: {type: 'string'}},
      required: ['fresh']
    });
  });

  it('reports an unknown schema name as a definition error', () => {
    const {functions} = setup([{name: 'greet', schema: 'Missing'}]);
    const scan = functions.scan();
    expect(scan.functions).toEqual([]);
    expect(scan.errors.join('\n')).toContain('args schema refers to unknown schema "Missing"');
  });

  it('reports an ambiguous schema name instead of guessing a version', () => {
    const {functions} = setup([{name: 'greet', schema: 'Player'}], [
      {name: 'Player', version: '1.0.0'},
      {name: 'Player', version: '2.0.0'}
    ]);
    expect(functions.scan().errors.join('\n')).toContain('args schema refers to schema "Player", which has several versions');
  });

  it('surfaces a broken schema definition from tools()', () => {
    const {functions} = setup([{name: 'greet', schema: '{"type":"object","properties":{}}'}], [
      {name: 'Player'},
      {name: 'bad name'}
    ]);
    expect(functions.schemas().errors).toHaveLength(1);
    expect(() => functions.tools()).toThrow('schema name must be');
  });

  it('exposes the lowered schemas', () => {
    const {functions} = setup([{name: 'greet', schema: 'Player'}]);
    const scan = functions.schemas();
    expect(scan.errors).toEqual([]);
    expect(scan.schemas).toEqual([
      {name: 'Player', version: '1.0.0', schema: PLAYER_SCHEMA, targetName: 'Stage', blockId: 'schemaHat0'}
    ]);
  });

  it('still accepts JSON schema text when the schema blocks are wired', () => {
    const json = '{"type":"object","properties":{"a":{"type":"number"}},"required":["a"]}';
    const {functions} = setup([{name: 'add', schema: json, returns: '{"type":"integer"}'}]);
    const scan = functions.scan();
    expect(scan.errors).toEqual([]);
    expect(scan.functions[0]?.parameters).toEqual(JSON.parse(json));
    expect(scan.functions[0]?.returns).toEqual({type: 'integer'});
  });

  it('rejects a named schema that is not an object schema for the arguments', () => {
    // Every lowered schema is an object schema, so the args rule is enforced through the resolver.
    const scan = scanFunctionDefinitions([targetWithFunctions(OPCODE, [{name: 'greet', schema: 'Scalar'}])], OPCODE, {
      resolveSchema: () => ({type: 'string'})
    });
    expect(scan.errors.join('\n')).toContain('args schema must have "type": "object"');
  });

  it('rejects a named schema the resolver reports as malformed', () => {
    const scan = scanFunctionDefinitions([targetWithFunctions(OPCODE, [{name: 'greet', schema: 'Broken'}])], OPCODE, {
      resolveSchema: () => ({type: 'object', properties: {a: 'string'}})
    });
    expect(scan.errors.join('\n')).toContain('args schema.properties.a must be a JSON Schema object');
  });
});

describe('without the schema blocks wired', () => {
  it('keeps the existing JSON-only behaviour', () => {
    const runtime = new FakeRuntime();
    runtime.targets = [
      targetWithFunctions(OPCODE, [{name: 'greet', schema: 'Player'}]),
      targetWithSchemas([PLAYER], 'Stage')
    ];
    const functions = createNamedFunctions({runtime, functionHatOpcode: OPCODE});

    expect(functions.schemas()).toEqual({schemas: [], errors: []});
    const scan = functions.scan();
    expect(scan.functions).toEqual([]);
    expect(scan.errors.join('\n')).toContain('args schema must be valid JSON');
  });

  it('leaves a JSON-text project unchanged', () => {
    const json = '{"type":"object","properties":{"a":{"type":"number"}},"required":["a"]}';
    const runtime = new FakeRuntime();
    runtime.targets = [targetWithFunctions(OPCODE, [{name: 'add', schema: json, returns: '{"type":"integer"}'}])];
    const functions = createNamedFunctions({runtime, functionHatOpcode: OPCODE});

    const scan = functions.scan();
    expect(scan.errors).toEqual([]);
    expect(scan.functions[0]?.parameters).toEqual(JSON.parse(json));
    expect(scan.functions[0]?.returns).toEqual({type: 'integer'});
  });
});
