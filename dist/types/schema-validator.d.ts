/**
 * A small JSON Schema validator for function arguments and returns. It interprets the schema at run time and
 * never generates code, so it also works where `eval` is unavailable (for example Cloudflare Workers).
 *
 * Supported keywords: type, properties, required, additionalProperties (boolean), items, enum,
 * const, minimum, maximum, minLength, maxLength, minItems, maxItems. Other keywords, such as
 * description and title, are ignored.
 */
export declare function validateAgainstSchema(value: unknown, schema: unknown, path?: string): string[];
/** Reject malformed schemas before a function definition or call can use them. */
export declare function validateSchemaDefinition(schema: unknown, label?: string): void;
