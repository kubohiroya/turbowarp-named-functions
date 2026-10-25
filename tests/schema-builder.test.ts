import {describe, expect, it} from 'vitest';
import {
  parseSchemaReference,
  resolveSchemaReference,
  scanSchemaDefinitions,
  type SchemaDefinition
} from '../src/schema-builder.js';
import {validateAgainstSchema, validateSchemaDefinition} from '../src/schema-validator.js';
import {targetWithSchemas, testSchemaOpcodes} from './helpers/fake-runtime.js';
import type {SchemaHatSpec} from './helpers/fake-runtime.js';

function scan(specs: readonly SchemaHatSpec[]) {
  return scanSchemaDefinitions([targetWithSchemas(specs)], testSchemaOpcodes);
}

function schemaOf(specs: readonly SchemaHatSpec[], name = specs[0]?.name ?? '') {
  const result = scan(specs);
  expect(result.errors).toEqual([]);
  return (result.schemas.find((candidate) => candidate.name === name) as SchemaDefinition).schema;
}

describe('scanSchemaDefinitions', () => {
  it('lowers the documented example to canonical JSON Schema', () => {
    const schema = schemaOf([
      {
        name: 'Player',
        body: [
          {kind: 'property', name: 'name', type: 'string'},
          {kind: 'property', name: 'score', type: 'number'},
          {kind: 'limit', keyword: 'minimum', value: '0'},
          {kind: 'property', name: 'tags', type: 'array of string', presence: 'optional'}
        ]
      }
    ]);

    expect(schema).toEqual({
      type: 'object',
      properties: {
        name: {type: 'string'},
        score: {type: 'number', minimum: 0},
        tags: {type: 'array', items: {type: 'string'}}
      },
      required: ['name', 'score']
    });
  });

  it('produces schemas the shared validator accepts and enforces', () => {
    const schema = schemaOf([
      {
        name: 'Player',
        body: [
          {kind: 'property', name: 'name', type: 'string'},
          {kind: 'limit', keyword: 'minLength', value: '1'}
        ]
      }
    ]);

    expect(() => validateSchemaDefinition(schema, 'schema Player')).not.toThrow();
    expect(validateAgainstSchema({name: 'ada'}, schema)).toEqual([]);
    expect(validateAgainstSchema({name: ''}, schema)).toEqual(['$.name must have at least 1 characters']);
    expect(validateAgainstSchema({}, schema)).toEqual(['$.name is required']);
  });

  it('records the name and version of each schema', () => {
    const result = scan([{name: 'Player', version: '2.1.0', body: [{kind: 'property', name: 'id', type: 'string'}]}]);
    expect(result.errors).toEqual([]);
    expect(result.schemas).toHaveLength(1);
    expect(result.schemas[0]).toMatchObject({name: 'Player', version: '2.1.0', targetName: 'Sprite1'});
  });

  it('supports every property type in the menu', () => {
    const schema = schemaOf([
      {
        name: 'Types',
        body: [
          {kind: 'property', name: 'a', type: 'string', presence: 'optional'},
          {kind: 'property', name: 'b', type: 'number', presence: 'optional'},
          {kind: 'property', name: 'c', type: 'integer', presence: 'optional'},
          {kind: 'property', name: 'd', type: 'boolean', presence: 'optional'},
          {kind: 'property', name: 'e', type: 'null', presence: 'optional'},
          {kind: 'property', name: 'f', type: 'object', presence: 'optional'},
          {kind: 'property', name: 'g', type: 'array', presence: 'optional'},
          {kind: 'property', name: 'h', type: 'array of object', presence: 'optional'}
        ]
      }
    ]);

    expect(schema.properties).toEqual({
      a: {type: 'string'},
      b: {type: 'number'},
      c: {type: 'integer'},
      d: {type: 'boolean'},
      e: {type: 'null'},
      f: {type: 'object'},
      g: {type: 'array'},
      h: {type: 'array', items: {type: 'object'}}
    });
    expect(schema.required).toBeUndefined();
  });

  it('puts item limits on the items and size limits on the array', () => {
    const schema = schemaOf([
      {
        name: 'Scores',
        body: [
          {kind: 'property', name: 'values', type: 'array of number'},
          {kind: 'limit', keyword: 'minimum', value: '0'},
          {kind: 'limit', keyword: 'maximum', value: '100'},
          {kind: 'limit', keyword: 'minItems', value: '1'},
          {kind: 'limit', keyword: 'maxItems', value: '3'}
        ]
      }
    ]);

    expect(schema.properties).toEqual({
      values: {type: 'array', items: {type: 'number', minimum: 0, maximum: 100}, minItems: 1, maxItems: 3}
    });
    expect(validateAgainstSchema({values: [1, 2]}, schema)).toEqual([]);
    expect(validateAgainstSchema({values: [-1]}, schema)).toEqual(['$.values[0] must be >= 0']);
    expect(validateAgainstSchema({values: []}, schema)).toEqual(['$.values must have at least 1 items']);
  });

  it('reads allowed values as a JSON array or a comma-separated list', () => {
    const fromList = schemaOf([
      {name: 'Colour', body: [{kind: 'property', name: 'hue', type: 'string'}, {kind: 'allowedValues', values: 'red, green, blue'}]}
    ]);
    expect(fromList.properties).toEqual({hue: {type: 'string', enum: ['red', 'green', 'blue']}});

    const fromJson = schemaOf([
      {name: 'Level', body: [{kind: 'property', name: 'rank', type: 'number'}, {kind: 'allowedValues', values: '[1, 2, 3]'}]}
    ]);
    expect(fromJson.properties).toEqual({rank: {type: 'number', enum: [1, 2, 3]}});
  });

  it('applies allowed values to each item of an array property', () => {
    const schema = schemaOf([
      {
        name: 'Tags',
        body: [
          {kind: 'property', name: 'tags', type: 'array of string'},
          {kind: 'allowedValues', values: 'a, b'}
        ]
      }
    ]);
    expect(schema.properties).toEqual({tags: {type: 'array', items: {type: 'string', enum: ['a', 'b']}}});
    expect(validateAgainstSchema({tags: ['a']}, schema)).toEqual([]);
    expect(validateAgainstSchema({tags: ['c']}, schema)).toEqual(['$.tags[0] must be one of "a", "b"']);
  });

  it('sets additionalProperties only when the block asks for it', () => {
    const open = schemaOf([{name: 'Open', body: [{kind: 'property', name: 'a', type: 'string'}]}]);
    expect(open.additionalProperties).toBeUndefined();

    const closed = schemaOf([
      {name: 'Closed', body: [{kind: 'property', name: 'a', type: 'string'}, {kind: 'allowUndeclared', allow: 'no'}]}
    ]);
    expect(closed.additionalProperties).toBe(false);
    expect(validateAgainstSchema({a: 'x', b: 1}, closed)).toEqual(['$.b is not allowed']);

    const explicit = schemaOf([
      {name: 'Any', body: [{kind: 'property', name: 'a', type: 'string'}, {kind: 'allowUndeclared', allow: 'yes'}]}
    ]);
    expect(explicit.additionalProperties).toBe(true);
  });

  it('inlines a referenced schema, as an object and as an array of objects', () => {
    const result = scan([
      {name: 'Profile', body: [{kind: 'property', name: 'city', type: 'string'}]},
      {
        name: 'Player',
        body: [
          {kind: 'schema', name: 'profile', schema: 'Profile'},
          {kind: 'schema', name: 'friends', schema: 'Profile', presence: 'optional', asArray: true}
        ]
      }
    ]);
    expect(result.errors).toEqual([]);

    const player = (result.schemas.find((candidate) => candidate.name === 'Player') as SchemaDefinition).schema;
    const profile = {type: 'object', properties: {city: {type: 'string'}}, required: ['city']};
    expect(player).toEqual({
      type: 'object',
      properties: {profile, friends: {type: 'array', items: profile}},
      required: ['profile']
    });
    expect(validateAgainstSchema({profile: {city: 'Kyoto'}}, player)).toEqual([]);
    expect(validateAgainstSchema({profile: {}}, player)).toEqual(['$.profile.city is required']);
  });

  it('resolves a reference pinned to a version and keeps versions apart', () => {
    const result = scan([
      {name: 'Profile', version: '1.0.0', body: [{kind: 'property', name: 'city', type: 'string'}]},
      {name: 'Profile', version: '2.0.0', body: [{kind: 'property', name: 'town', type: 'string'}]},
      {name: 'Player', body: [{kind: 'schema', name: 'profile', schema: 'Profile@2.0.0'}]}
    ]);
    expect(result.errors).toEqual([]);

    const player = (result.schemas.find((candidate) => candidate.name === 'Player') as SchemaDefinition).schema;
    expect(player).toEqual({
      type: 'object',
      properties: {profile: {type: 'object', properties: {town: {type: 'string'}}, required: ['town']}},
      required: ['profile']
    });
  });

  it('returns schemas sorted by name and version', () => {
    const result = scan([
      {name: 'Zebra'},
      {name: 'Apple', version: '2.0.0'},
      {name: 'Apple', version: '1.0.0'}
    ]);
    expect(result.errors).toEqual([]);
    expect(result.schemas.map((candidate) => `${candidate.name}@${candidate.version}`)).toEqual([
      'Apple@1.0.0',
      'Apple@2.0.0',
      'Zebra@1.0.0'
    ]);
  });

  it('lowers a schema with no properties to an empty object schema', () => {
    expect(schemaOf([{name: 'Empty'}])).toEqual({type: 'object', properties: {}});
  });

  it('ignores clones and other targets', () => {
    const clone = {...targetWithSchemas([{name: 'Player'}]), isOriginal: false};
    expect(scanSchemaDefinitions([clone], testSchemaOpcodes).schemas).toEqual([]);
  });
});

describe('scanSchemaDefinitions diagnostics', () => {
  it.each([
    [{name: 'bad name'} as SchemaHatSpec, 'schema name must be'],
    [{name: 'Player', version: '1.0'} as SchemaHatSpec, 'must be a complete SemVer value'],
    [{name: 'Player', version: ''} as SchemaHatSpec, 'must be a complete SemVer value'],
    [{name: 'Player', reporterInput: 'NAME'} as SchemaHatSpec, 'NAME must be literal text'],
    [
      {name: 'Player', body: [{kind: 'property', name: 'a', type: 'mystery'}]} as SchemaHatSpec,
      'unsupported type "mystery"'
    ],
    [
      {name: 'Player', body: [{kind: 'property', name: 'a', type: 'string'}, {kind: 'property', name: 'a', type: 'number'}]} as SchemaHatSpec,
      'declared more than once'
    ],
    [
      {name: 'Player', body: [{kind: 'property', name: '', type: 'string'}]} as SchemaHatSpec,
      'a property needs a name'
    ],
    [
      {name: 'Player', body: [{kind: 'limit', keyword: 'minimum', value: '0'}]} as SchemaHatSpec,
      'must come after a property block'
    ],
    [
      {name: 'Player', body: [{kind: 'allowedValues', values: 'a'}]} as SchemaHatSpec,
      '"allowed values" must come after a property block'
    ],
    [
      {name: 'Player', body: [{kind: 'schema', name: 'p', schema: 'Player'}, {kind: 'limit', keyword: 'minimum', value: '1'}]} as SchemaHatSpec,
      'cannot be used on property "p", which uses another schema'
    ],
    [
      {name: 'Player', body: [{kind: 'property', name: 'a', type: 'string'}, {kind: 'limit', keyword: 'minimum', value: 'x'}]} as SchemaHatSpec,
      'needs a number'
    ],
    [
      {name: 'Player', body: [{kind: 'property', name: 'a', type: 'string'}, {kind: 'limit', keyword: 'nonsense', value: '1'}]} as SchemaHatSpec,
      'unsupported limit "nonsense"'
    ],
    [
      {name: 'Player', body: [{kind: 'property', name: 'a', type: 'string'}, {kind: 'limit', keyword: 'minItems', value: '1'}]} as SchemaHatSpec,
      'can only be used on an array property'
    ],
    [
      {name: 'Player', body: [{kind: 'property', name: 'a', type: 'array'}, {kind: 'limit', keyword: 'minimum', value: '1'}]} as SchemaHatSpec,
      'declare an item type'
    ],
    [
      {name: 'Player', body: [{kind: 'property', name: 'a', type: 'string'}, {kind: 'limit', keyword: 'minLength', value: '1'}, {kind: 'limit', keyword: 'minLength', value: '2'}]} as SchemaHatSpec,
      'is set more than once'
    ],
    [
      {name: 'Player', body: [{kind: 'property', name: 'a', type: 'number'}, {kind: 'allowedValues', values: 'red'}]} as SchemaHatSpec,
      'does not match the declared type'
    ],
    [
      {name: 'Player', body: [{kind: 'property', name: 'a', type: 'string'}, {kind: 'allowedValues', values: ''}]} as SchemaHatSpec,
      'is empty'
    ],
    [
      {name: 'Player', body: [{kind: 'property', name: 'a', type: 'string'}, {kind: 'allowedValues', values: '[nope'}]} as SchemaHatSpec,
      'must be valid JSON'
    ],
    [
      {name: 'Player', body: [{kind: 'property', name: 'a', type: 'string'}, {kind: 'allowedValues', values: '[]'}]} as SchemaHatSpec,
      'non-empty JSON array'
    ],
    [
      {name: 'Player', body: [{kind: 'allowUndeclared', allow: 'no'}, {kind: 'allowUndeclared', allow: 'yes'}]} as SchemaHatSpec,
      'used more than once'
    ],
    [
      {name: 'Player', body: [{kind: 'foreign', opcode: 'motion_movesteps'}]} as SchemaHatSpec,
      'cannot be used inside a "define schema" stack'
    ],
    [
      {name: 'Player', body: [{kind: 'schema', name: 'p', schema: 'Missing'}]} as SchemaHatSpec,
      'unknown schema "Missing"'
    ],
    [
      {name: 'Player', body: [{kind: 'schema', name: 'p', schema: 'Missing@1.0.0'}]} as SchemaHatSpec,
      'unknown schema "Missing@1.0.0"'
    ],
    [
      {name: 'Player', body: [{kind: 'schema', name: 'p', schema: 'bad name'}]} as SchemaHatSpec,
      'must be 1-128 letters'
    ],
    [
      {name: 'Player', body: [{kind: 'property', name: 'a', type: 'string'}, {kind: 'schema', name: 'a', schema: 'Player'}]} as SchemaHatSpec,
      'declared more than once'
    ]
  ])('reports %#: %s', (spec, expected) => {
    const result = scan([spec]);
    expect(result.schemas).toEqual([]);
    expect(result.errors.join('\n')).toContain(expected);
  });

  it('names the sprite and block of a bad definition', () => {
    const result = scan([{name: 'bad name'}]);
    expect(result.errors[0]).toMatch(/^Sprite1 \(block schemaHat0\): /u);
  });

  it('rejects a duplicate name and version but keeps a different version', () => {
    const duplicate = scan([{name: 'Player'}, {name: 'Player'}]);
    expect(duplicate.errors.join('\n')).toContain('schema "Player@1.0.0" is already defined');
    expect(duplicate.schemas).toHaveLength(1);

    const versions = scan([{name: 'Player', version: '1.0.0'}, {name: 'Player', version: '1.1.0'}]);
    expect(versions.errors).toEqual([]);
    expect(versions.schemas).toHaveLength(2);
  });

  it('refuses an unpinned reference to a schema with several versions', () => {
    const result = scan([
      {name: 'Profile', version: '1.0.0'},
      {name: 'Profile', version: '2.0.0'},
      {name: 'Player', body: [{kind: 'schema', name: 'profile', schema: 'Profile'}]}
    ]);
    expect(result.errors.join('\n')).toContain('has several versions (1.0.0, 2.0.0)');
    expect(result.schemas.map((candidate) => candidate.name)).toEqual(['Profile', 'Profile']);
  });

  it('reports a reference cycle instead of recursing forever', () => {
    const result = scan([
      {name: 'A', body: [{kind: 'schema', name: 'b', schema: 'B'}]},
      {name: 'B', body: [{kind: 'schema', name: 'a', schema: 'A'}]}
    ]);
    expect(result.schemas).toEqual([]);
    expect(result.errors.join('\n')).toContain('schema reference cycle');
  });

  it('reports a schema that references itself', () => {
    const result = scan([{name: 'A', body: [{kind: 'schema', name: 'a', schema: 'A'}]}]);
    expect(result.errors.join('\n')).toContain('schema reference cycle: A@1.0.0 -> A@1.0.0');
  });

  it('keeps a valid schema when another one in the project is broken', () => {
    const result = scan([{name: 'Good', body: [{kind: 'property', name: 'a', type: 'string'}]}, {name: 'bad name'}]);
    expect(result.errors).toHaveLength(1);
    expect(result.schemas.map((candidate) => candidate.name)).toEqual(['Good']);
  });

  it('stops at a next chain that loops', () => {
    const target = targetWithSchemas([
      {name: 'Player', body: [{kind: 'property', name: 'a', type: 'string'}]}
    ]);
    const body = target.blocks._blocks.schemaHat0_body0;
    if (body) body.next = 'schemaHat0_body0';
    const result = scanSchemaDefinitions([target], testSchemaOpcodes);
    expect(result.errors).toEqual([]);
    expect(result.schemas[0]?.schema).toEqual({
      type: 'object',
      properties: {a: {type: 'string'}},
      required: ['a']
    });
  });
});

describe('parseSchemaReference', () => {
  it('reads a bare name and a pinned version', () => {
    expect(parseSchemaReference('Player', 'ref')).toEqual({name: 'Player'});
    expect(parseSchemaReference(' Player@1.2.3 ', 'ref')).toEqual({name: 'Player', version: '1.2.3'});
    expect(parseSchemaReference('a.b-c_d', 'ref')).toEqual({name: 'a.b-c_d'});
  });

  it('rejects a bad name or version', () => {
    expect(() => parseSchemaReference('', 'ref')).toThrow('ref must be 1-128 letters');
    expect(() => parseSchemaReference('Player@1.0', 'ref')).toThrow('must be a complete SemVer value');
    expect(() => parseSchemaReference('Player@', 'ref')).toThrow('must be a complete SemVer value');
  });
});

describe('resolveSchemaReference', () => {
  const schemas = scan([
    {name: 'Player', version: '1.0.0', body: [{kind: 'property', name: 'a', type: 'string'}]},
    {name: 'Player', version: '2.0.0', body: [{kind: 'property', name: 'b', type: 'string'}]},
    {name: 'Solo', body: [{kind: 'property', name: 'c', type: 'string'}]}
  ]).schemas;

  it('resolves an unambiguous name and a pinned version', () => {
    expect(resolveSchemaReference(schemas, 'Solo', 'args schema')).toEqual({
      type: 'object',
      properties: {c: {type: 'string'}},
      required: ['c']
    });
    expect(resolveSchemaReference(schemas, 'Player@1.0.0', 'args schema').properties).toEqual({a: {type: 'string'}});
  });

  it('fails explicitly rather than falling back to another version', () => {
    expect(() => resolveSchemaReference(schemas, 'Player', 'args schema')).toThrow('has several versions');
    expect(() => resolveSchemaReference(schemas, 'Player@3.0.0', 'args schema')).toThrow(
      'unknown version "3.0.0" of schema "Player" (defined: 1.0.0, 2.0.0)'
    );
    expect(() => resolveSchemaReference(schemas, 'Nobody', 'args schema')).toThrow('unknown schema "Nobody"');
  });
});
