/**
 * A small JSON Schema validator for function arguments. It interprets the schema at run time and
 * never generates code, so it also works where `eval` is unavailable (for example Cloudflare Workers).
 *
 * Supported keywords: type, properties, required, additionalProperties (boolean), items, enum,
 * const, minimum, maximum, minLength, maxLength, minItems, maxItems. Other keywords, such as
 * description and title, are ignored.
 */

export function validateAgainstSchema(value: unknown, schema: unknown, path = '$'): string[] {
  const rule = asRecord(schema);
  if (!rule) return [];
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
      value.forEach((item, index) => errors.push(...validateAgainstSchema(item, rule.items, `${path}[${index}]`)));
    }
  }

  const object = asRecord(value);
  if (object) {
    const properties = asRecord(rule.properties) ?? {};
    if (Array.isArray(rule.required)) {
      for (const name of rule.required) {
        if (typeof name === 'string' && !(name in object)) errors.push(`${path}.${name} is required`);
      }
    }
    for (const [name, child] of Object.entries(object)) {
      if (name in properties) {
        errors.push(...validateAgainstSchema(child, properties[name], `${path}.${name}`));
      } else if (rule.additionalProperties === false) {
        errors.push(`${path}.${name} is not allowed`);
      }
    }
  }
  return errors;
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
