import type { RuntimeTarget } from './runtime-types.js';
/** A function exported as a tool, in the shape used by OpenAI function calling. */
export interface FunctionTool {
    type: 'function';
    name: string;
    description: string;
    parameters: Record<string, unknown>;
}
export declare const FUNCTION_NAME_PATTERN: RegExp;
export declare const MAX_DESCRIPTION_LENGTH = 1024;
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
export declare function scanFunctionDefinitions(targets: readonly RuntimeTarget[], hatOpcode: string, options?: FunctionScanOptions): FunctionScan;
export declare function toFunctionTools(functions: readonly FunctionDefinition[]): FunctionTool[];
