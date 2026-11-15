import type { FixedInputEditorOptions } from '@kubohiroya/turbowarp-extension-data-editor';
import { type FunctionScope } from './function-registry.js';
/** Reports whether another `define function` hat already uses `name` within `scope`. */
export type NameConflictCheck = (where: {
    targetId: string;
    blockId: string;
}, name: string, scope: FunctionScope) => boolean;
/**
 * The `define function` dialog: NAME, SCOPE, and EXPORT. NAME is validated against the scope chosen
 * in the dialog, so a name already used in that scope disables Save. DESCRIPTION, SCHEMA, and RETURNS
 * are left to the block.
 */
export declare function createFixedInputEditorDefinitions(conflicts: NameConflictCheck): readonly FixedInputEditorOptions[];
interface RuntimeLifetime {
    on?: (event: string, listener: () => void) => void;
    off?: (event: string, listener: () => void) => void;
}
/** Register metadata only; the GUI startup capability owns editor activation. */
export declare function registerFixedInputEditors(scratch: unknown, definitions: readonly FixedInputEditorOptions[], runtimeOverride?: RuntimeLifetime): () => void;
export {};
