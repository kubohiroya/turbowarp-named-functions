import {readLiteralInput, readOptionalLiteralInput} from './block-literals.js';
import type {RuntimeTarget, SerializedBlock} from './runtime-types.js';
import {validateSchemaDefinition} from './schema-validator.js';

/** A function exported as a tool, in the shape used by OpenAI function calling. */
export interface FunctionTool {
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export const FUNCTION_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/u;
export const MAX_DESCRIPTION_LENGTH = 1024;

export interface FunctionDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  /** Omitted on older projects and when RETURNS is left blank. */
  returns?: Record<string, unknown>;
  exportAs: 'tool' | 'none';
  targetName: string;
  blockId: string;
}

export interface FunctionScan {
  functions: FunctionDefinition[];
  errors: string[];
}

export interface FunctionScanOptions {
  /**
   * Resolves a schema name typed into SCHEMA or RETURNS instead of JSON text, such as a
   * `define schema` hat's name. Without it, those inputs must be JSON.
   */
  resolveSchema?: (reference: string, label: string) => Record<string, unknown>;
}

/**
 * Reads every `define function` hat in the project. NAME, DESCRIPTION, and SCHEMA are part of the
 * tool contract sent to the model before any script runs, so they must be literal text.
 */
export function scanFunctionDefinitions(
  targets: readonly RuntimeTarget[],
  hatOpcode: string,
  options: FunctionScanOptions = {}
): FunctionScan {
  const functions: FunctionDefinition[] = [];
  const errors: string[] = [];
  const seen = new Map<string, string>();

  for (const target of targets) {
    if (target.isOriginal === false) continue;
    const targetName = target.getName?.() ?? (target.isStage ? 'Stage' : 'sprite');
    const blocks = target.blocks._blocks;
    for (const block of Object.values(blocks)) {
      if (block.opcode !== hatOpcode || block.topLevel === false) continue;
      const where = `${targetName} (block ${block.id})`;
      try {
        const definition = readDefinition(block, blocks, targetName, options);
        const previous = seen.get(definition.name);
        if (previous !== undefined) {
          throw new Error(`function "${definition.name}" is already defined in ${previous}`);
        }
        seen.set(definition.name, where);
        functions.push(definition);
      } catch (error) {
        errors.push(`${where}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  functions.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
  return {functions, errors};
}

export function toFunctionTools(functions: readonly FunctionDefinition[]): FunctionTool[] {
  return functions
    .filter((definition) => definition.exportAs === 'tool')
    .map((definition) => ({
      type: 'function',
      name: definition.name,
      description: definition.description,
      parameters: definition.parameters
    }));
}

function readDefinition(
  block: SerializedBlock,
  blocks: Record<string, SerializedBlock>,
  targetName: string,
  options: FunctionScanOptions
): FunctionDefinition {
  const name = readLiteralInput(block, blocks, 'NAME').trim();
  if (!FUNCTION_NAME_PATTERN.test(name)) {
    throw new Error('function name must be 1-64 letters, digits, "_" or "-"');
  }
  const description = readLiteralInput(block, blocks, 'DESCRIPTION').trim();
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new Error(`description must be at most ${MAX_DESCRIPTION_LENGTH} characters`);
  }
  const parameters = parseSchema(readLiteralInput(block, blocks, 'SCHEMA'), 'args schema', true, options);
  const returnsText = readOptionalLiteralInput(block, blocks, 'RETURNS');
  const returns = returnsText === undefined || returnsText.trim() === ''
    ? undefined
    : parseSchema(returnsText, 'returns schema', false, options);
  const exportValue = String(block.fields?.EXPORT?.value ?? 'none');
  const exportAs = exportValue === 'tool' ? 'tool' : 'none';
  if (exportAs === 'tool' && description.length === 0) {
    throw new Error('a function exported as a tool needs a description');
  }
  return {name, description, parameters, ...(returns ? {returns} : {}), exportAs, targetName, blockId: block.id};
}

/**
 * SCHEMA and RETURNS hold either JSON Schema text or, when the consumer supports it, the name of a
 * `define schema` hat. Text that is not JSON is treated as a name, so existing JSON projects are
 * unaffected.
 */
function parseSchema(
  text: string,
  label: string,
  requireObjectType: boolean,
  options: FunctionScanOptions
): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    if (options.resolveSchema) return resolveNamed(text, label, requireObjectType, options.resolveSchema);
    throw new Error(`${label} must be valid JSON`);
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  const schema = value as Record<string, unknown>;
  if (requireObjectType && schema.type !== 'object') throw new Error('args schema must have "type": "object"');
  validateSchemaDefinition(schema, label);
  return schema;
}

function resolveNamed(
  text: string,
  label: string,
  requireObjectType: boolean,
  resolveSchema: (reference: string, label: string) => Record<string, unknown>
): Record<string, unknown> {
  const schema = resolveSchema(text, label);
  if (requireObjectType && schema.type !== 'object') throw new Error('args schema must have "type": "object"');
  validateSchemaDefinition(schema, label);
  return schema;
}
