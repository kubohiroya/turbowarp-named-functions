import type { FixedInputEditorOptions } from '@kubohiroya/turbowarp-extension-data-editor';
import { type FunctionScope } from './function-registry.js';
/** The `define schema` hats a SCHEMA or RETURNS input can name. */
export interface SchemaNames {
    /** `Name`, or `Name@1.0.0` for each version when a name has several. */
    list(): readonly string[];
    /** Resolves a name the way a running project does; throws when it cannot. */
    resolve(reference: string, label: string): Record<string, unknown>;
}
/** Reports whether another `define function` hat already uses `name` within `scope`. */
export type NameConflictCheck = (where: {
    targetId: string;
    blockId: string;
}, name: string, scope: FunctionScope) => boolean;
/**
 * The `define function` dialog: every input in one save. NAME is validated against the scope chosen
 * in the dialog, so a name already used in that scope disables Save. SCHEMA and RETURNS are edited
 * by name, in a form, or as JSON text.
 */
export declare function createFixedInputEditorDefinitions(conflicts: NameConflictCheck, schemas: SchemaNames): readonly FixedInputEditorOptions[];
interface RuntimeLifetime {
    on?: (event: string, listener: () => void) => void;
    off?: (event: string, listener: () => void) => void;
}
/** Register metadata only; the GUI startup capability owns editor activation. */
export declare function registerFixedInputEditors(scratch: unknown, definitions: readonly FixedInputEditorOptions[], runtimeOverride?: RuntimeLifetime): () => void;
export {};
