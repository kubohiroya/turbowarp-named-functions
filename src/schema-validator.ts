/**
 * A small JSON Schema validator for function arguments and returns. It interprets the schema at run time and
 * never generates code, so it also works where `eval` is unavailable (for example Cloudflare Workers).
 *
 * Supported keywords: type, properties, required, additionalProperties (boolean), items, enum,
 * const, minimum, maximum, minLength, maxLength, minItems, maxItems. Other keywords, such as
 * description and title, are ignored.
 */

export function validateAgainstSchema(value: unknown, schema: unknown, path = '$'): string[] {
  const rule = asRecord(schema);
  if (!rule) throw new Error(`${path} must be a JSON Schema object`);
  assertSchemaNode(rule, path);
  return validateValue(value, rule, path);
}

/** Reject malformed schemas before a function definition or call can use them. */
export function validateSchemaDefinition(schema: unknown, label = 'schema'): void {
  const rule = asRecord(schema);
  if (!rule) throw new Error(`${label} must be a JSON object`);
  assertSchemaNode(rule, label);
}

function validateValue(value: unknown, rule: Record<string, unknown>, path: string): string[] {
  const errors: string[] = [];

  if (rule.type !== undefined) {
    const types = Array.isArray(rule.type) ? rule.type : [rule.type];
    if (!types.some((type) => matchesType(value, type))) {
      return [`${path} must be ${types.join(' or ')}`];
    }
  }
  if (Array.isArray(rule.enum) && !rule.enum.some((candidate) => deepEqual(candidate, value))) {
    errors.push(`${path} must be one of ${rule.enum.map((item) => JSON.stringify(item)).join(', ')}`);
  }
  if ('const' in rule && !deepEqual(rule.const, value)) {
    errors.push(`${path} must be ${JSON.stringify(rule.const)}`);
  }

  if (typeof value === 'number') {
    if (typeof rule.minimum === 'number' && value < rule.minimum) errors.push(`${path} must be >= ${rule.minimum}`);
    if (typeof rule.maximum === 'number' && value > rule.maximum) errors.push(`${path} must be <= ${rule.maximum}`);
  }
  if (typeof value === 'string') {
    const length = [...value].length;
    if (typeof rule.minLength === 'number' && length < rule.minLength) {
      errors.push(`${path} must have at least ${rule.minLength} characters`);
    }
    if (typeof rule.maxLength === 'number' && length > rule.maxLength) {
      errors.push(`${path} must have at most ${rule.maxLength} characters`);
    }
  }
  if (Array.isArray(value)) {
    if (typeof rule.minItems === 'number' && value.length < rule.minItems) {
      errors.push(`${path} must have at least ${rule.minItems} items`);
    }
    if (typeof rule.maxItems === 'number' && value.length > rule.maxItems) {
      errors.push(`${path} must have at most ${rule.maxItems} items`);
    }
    if (rule.items !== undefined) {
      value.forEach((item, index) => errors.push(...validateValue(item, rule.items as Record<string, unknown>, `${path}[${index}]`)));
    }
  }

  const object = asRecord(value);
  if (object) {
    const properties = asRecord(rule.properties) ?? {};
    if (Array.isArray(rule.required)) {
      for (const name of rule.required) {
        if (typeof name === 'string' && !Object.hasOwn(object, name)) errors.push(`${path}.${name} is required`);
      }
    }
    for (const [name, child] of Object.entries(object)) {
      if (Object.hasOwn(properties, name)) {
        errors.push(...validateValue(child, properties[name] as Record<string, unknown>, `${path}.${name}`));
      } else if (rule.additionalProperties === false) {
        errors.push(`${path}.${name} is not allowed`);
      }
    }
  }
  return errors;
}

function assertSchemaNode(rule: Record<string, unknown>, path: string): void {
  const validTypes = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']);
  if (rule.type !== undefined) {
    const types = Array.isArray(rule.type) ? rule.type : [rule.type];
    if (types.length === 0 || types.some((type) => typeof type !== 'string' || !validTypes.has(type))) {
      throw new Error(`${path}.type must be a supported JSON Schema type or non-empty type array`);
    }
  }
  if (rule.properties !== undefined) {
    const properties = asRecord(rule.properties);
    if (!properties) throw new Error(`${path}.properties must be an object`);
    for (const [name, child] of Object.entries(properties)) {
      const childRule = asRecord(child);
      if (!childRule) throw new Error(`${path}.properties.${name} must be a JSON Schema object`);
      assertSchemaNode(childRule, `${path}.properties.${name}`);
    }
  }
  if (rule.required !== undefined && (!Array.isArray(rule.required) || rule.required.some((name) => typeof name !== 'string'))) {
    throw new Error(`${path}.required must be an array of strings`);
  }
  if (rule.additionalProperties !== undefined && typeof rule.additionalProperties !== 'boolean') {
    throw new Error(`${path}.additionalProperties must be a boolean`);
  }
  if (rule.items !== undefined) {
    const items = asRecord(rule.items);
    if (!items) throw new Error(`${path}.items must be a JSON Schema object`);
    assertSchemaNode(items, `${path}.items`);
  }
  if (rule.enum !== undefined && (!Array.isArray(rule.enum) || rule.enum.length === 0)) {
    throw new Error(`${path}.enum must be a non-empty array`);
  }
  for (const keyword of ['minimum', 'maximum'] as const) {
    if (rule[keyword] !== undefined && (typeof rule[keyword] !== 'number' || !Number.isFinite(rule[keyword]))) {
      throw new Error(`${path}.${keyword} must be a finite number`);
    }
  }
  for (const keyword of ['minLength', 'maxLength', 'minItems', 'maxItems'] as const) {
    const value = rule[keyword];
    if (value !== undefined && (typeof value !== 'number' || !Number.isInteger(value) || value < 0)) {
      throw new Error(`${path}.${keyword} must be a non-negative integer`);
    }
  }
  if (typeof rule.minimum === 'number' && typeof rule.maximum === 'number' && rule.minimum > rule.maximum) {
    throw new Error(`${path}.minimum cannot exceed maximum`);
  }
  if (typeof rule.minLength === 'number' && typeof rule.maxLength === 'number' && rule.minLength > rule.maxLength) {
    throw new Error(`${path}.minLength cannot exceed maxLength`);
  }
  if (typeof rule.minItems === 'number' && typeof rule.maxItems === 'number' && rule.minItems > rule.maxItems) {
    throw new Error(`${path}.minItems cannot exceed maxItems`);
  }
}

function matchesType(value: unknown, type: unknown): boolean {
  switch (type) {
    case 'object':
      return asRecord(value) !== null;
    case 'array':
      return Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'null':
      return value === null;
    default:
      return false;
  }
}

function deepEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
