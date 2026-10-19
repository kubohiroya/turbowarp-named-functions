import type { FixedInputEditorOptions } from '@kubohiroya/turbowarp-extension-data-editor';
export declare const fixedInputEditorDefinitions: readonly FixedInputEditorOptions[];
interface RuntimeLifetime {
    on?: (event: string, listener: () => void) => void;
    off?: (event: string, listener: () => void) => void;
}
/** Register metadata only; the GUI startup capability owns editor activation. */
export declare function registerFixedInputEditors(scratch: unknown, definitions: readonly FixedInputEditorOptions[], runtimeOverride?: RuntimeLifetime): () => void;
export {};
