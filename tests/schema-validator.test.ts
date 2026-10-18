import {describe, expect, it} from 'vitest';
import {validateAgainstSchema, validateSchemaDefinition} from '../src/schema-validator.js';

const schema = {
  type: 'object',
  properties: {
    name: {type: 'string', minLength: 1, maxLength: 5},
    age: {type: 'integer', minimum: 0, maximum: 150},
    tags: {type: 'array', items: {type: 'string'}, maxItems: 2},
    mode: {enum: ['a', 'b']},
    fixed: {const: 1},
    note: {type: ['string', 'null']}
  },
  required: ['name'],
  additionalProperties: false
};

describe('validateAgainstSchema', () => {
  it('accepts a valid value', () => {
    expect(validateAgainstSchema({name: 'Ada', age: 36, tags: ['x'], mode: 'a', fixed: 1, note: null}, schema)).toEqual([]);
  });

  it.each([
    [{}, '$.name is required'],
    [{name: ''}, '$.name must have at least 1 characters'],
    [{name: 'abcdef'}, '$.name must have at most 5 characters'],
    [{name: 'a', age: 1.5}, '$.age must be integer'],
    [{name: 'a', age: -1}, '$.age must be >= 0'],
    [{name: 'a', tags: ['x', 'y', 'z']}, '$.tags must have at most 2 items'],
    [{name: 'a', tags: [1]}, '$.tags[0] must be string'],
    [{name: 'a', mode: 'c'}, '$.mode must be one of "a", "b"'],
    [{name: 'a', fixed: 2}, '$.fixed must be 1'],
    [{name: 'a', note: 3}, '$.note must be string or null'],
    [{name: 'a', extra: true}, '$.extra is not allowed'],
    ['text', '$ must be object'],
    [[], '$ must be object']
  ])('reports %j', (value, message) => {
    expect(validateAgainstSchema(value, schema)).toContain(message);
  });

  it('counts characters, not UTF-16 units', () => {
    expect(validateAgainstSchema('😀😀', {type: 'string', maxLength: 2})).toEqual([]);
  });

  it('ignores unknown keywords but rejects non-object schemas', () => {
    expect(validateAgainstSchema(1, {description: 'x', format: 'email'})).toEqual([]);
    expect(() => validateAgainstSchema(1, null)).toThrow('must be a JSON Schema object');
  });

  it.each([
    [{type: 'object', properties: {name: 'string'}}, '$.properties.name'],
    [{type: 'object', properties: []}, '$.properties'],
    [{type: 'object', items: 'string'}, '$.items'],
    [{type: 'mystery'}, '$.type'],
    [{type: 'object', required: [1]}, '$.required'],
    [{type: 'string', minLength: -1}, '$.minLength'],
    [{type: 'number', minimum: 10, maximum: 1}, '$.minimum']
  ])('rejects malformed schema definitions %j', (definition, path) => {
    expect(() => validateSchemaDefinition(definition, '$')).toThrow(path);
  });

  it('uses a schema label by default and accepts valid nested definitions', () => {
    expect(() => validateSchemaDefinition({type: 'mystery'})).toThrow('schema.type');
    expect(() => validateSchemaDefinition(schema)).not.toThrow();
    expect(() => validateSchemaDefinition({type: ['string', 'null'], enum: ['value', null]})).not.toThrow();
  });

  it('does not treat inherited object properties as declared schema properties', () => {
    const prototypeName = JSON.parse('{"constructor":"unexpected"}') as {constructor: string};
    expect(validateAgainstSchema(prototypeName, {type: 'object', properties: {}, additionalProperties: false})).toContain(
      '$.constructor is not allowed'
    );
  });
});
