import type { SchemaBundle } from '@kubohiroya/turbowarp-extension-data-editor/schema';
/** The `define function` inputs the fixed-input editor changes. */
export type FixedInputArgument = 'NAME' | 'SCOPE' | 'EXPORT' | 'DESCRIPTION' | 'SCHEMA' | 'RETURNS';
export declare const FIXED_INPUT_CONTRACT_REVISION = "fixed-inputs-v3";
/** The on-disk owner Schema is canonical; each bundle is its single-field projection. */
export declare function fixedInputSchemaBundle(argument: FixedInputArgument): SchemaBundle;
