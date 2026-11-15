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
/**
 * `sprite`: callable only from scripts of the sprite (or the stage) that defines it, and its clones.
 * `global`: callable from every sprite and the stage, and from outside the project (tools).
 */
export type FunctionScope = 'sprite' | 'global';
export interface FunctionDefinition {
    name: string;
    /** Hats saved before scopes existed have no SCOPE field and stay `global`. */
    scope: FunctionScope;
    description: string;
    parameters: Record<string, unknown>;
    /** Omitted on older projects and when RETURNS is left blank. */
    returns?: Record<string, unknown>;
    exportAs: 'tool' | 'none';
    targetName: string;
    /** The sprite (never a clone) or the stage that defines the function. */
    target: RuntimeTarget;
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
/**
 * Writes `SCOPE = global` into `define function` hats saved before SCOPE existed, so the stored
 * value matches what the block shows (the menu's first choice) and a change made on the block is
 * kept: the VM ignores a change to a field the block does not have. Each sprite is checked once;
 * pass the same `checked` set every time.
 */
export declare function upgradeLegacyScopes(targets: readonly RuntimeTarget[], hatOpcode: string, checked: WeakSet<RuntimeTarget>): number;
/**
 * Whether naming the hat `blockId` of `target` as `name` with `scope` would clash with another
 * `define function` hat, under the same rules as `scanFunctionDefinitions`: a global name is unique
 * in the project, and a sprite name is unique in its sprite and differs from every global name.
 * Hats whose NAME is not literal text are not compared.
 */
export declare function hasNameConflict(targets: readonly RuntimeTarget[], hatOpcode: string, candidate: {
    target: RuntimeTarget;
    blockId: string;
    name: string;
    scope: FunctionScope;
}): boolean;
/** A function a script can call, and the sprite, clone, or stage it runs as. */
export interface ResolvedFunction {
    definition: FunctionDefinition;
    runAs: RuntimeTarget;
}
/** True when both are the same sprite: the original, one of its clones, or the stage itself. */
export declare function sameSprite(left: RuntimeTarget, right: RuntimeTarget): boolean;
/**
 * Finds the function a call names. A caller's own sprite function runs as the caller (a clone runs it
 * as itself, as with a custom block); a global function runs as the sprite or stage that defines it.
 * Without a caller (a call from outside the project), only global functions are visible.
 */
export declare function resolveFunction(functions: readonly FunctionDefinition[], name: string, caller?: RuntimeTarget): ResolvedFunction | undefined;
/** Functions a script of `caller` can call: its sprite's own functions, then the global ones. */
export declare function visibleFunctions(functions: readonly FunctionDefinition[], caller?: RuntimeTarget): FunctionDefinition[];
export declare function toFunctionTools(functions: readonly FunctionDefinition[]): FunctionTool[];
