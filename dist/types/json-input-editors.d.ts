import type { SchemaBundleEditorOptions } from '@kubohiroya/turbowarp-extension-data-editor/rjsf';
import type { BlockSnapshot, JsonValue, ValidationIssue } from '@kubohiroya/turbowarp-extension-data-editor';
import type { FunctionDefinition } from './function-registry.js';
/** Lists the functions the sprite with this id can call. */
export type FunctionLookup = (targetId: string) => readonly FunctionDefinition[];
/** Checks call arguments against the schema of the function named by the block's NAME (or FUNCTION) literal. */
export declare function validateCallArguments(data: JsonValue, snapshot: BlockSnapshot, functions: FunctionLookup): ValidationIssue[];
export declare function jsonInputEditorDefinitions(functions: FunctionLookup): SchemaBundleEditorOptions[];
interface RuntimeLifetime {
    on?: (event: string, listener: () => void) => void;
    off?: (event: string, listener: () => void) => void;
}
/** Registers the editors when the GUI offers schema bundle editors; otherwise does nothing. */
export declare function registerJsonInputEditors(scratch: unknown, definitions: readonly SchemaBundleEditorOptions[], runtimeOverride?: RuntimeLifetime): () => void;
export {};
