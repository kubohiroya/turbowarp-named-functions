import type {SchemaBundle} from '@kubohiroya/turbowarp-extension-data-editor/schema';
import document from '../schemas/block-editor-fixed-inputs.schema.json';

/** The `define function` inputs the fixed-input editor changes. */
export type FixedInputArgument = 'NAME' | 'SCOPE' | 'EXPORT' | 'DESCRIPTION' | 'SCHEMA' | 'RETURNS';

export const FIXED_INPUT_CONTRACT_REVISION = 'fixed-inputs-v3';

/** The on-disk owner Schema is canonical; each bundle is its single-field projection. */
export function fixedInputSchemaBundle(argument: FixedInputArgument): SchemaBundle {
  const source = {repository: 'turbowarp-named-functions', path: 'schemas/block-editor-fixed-inputs.schema.json',
    symbol: `#/$defs/defineFunction/properties/${argument}`};
  return {
    identity: {ownerId: 'turbowarp-named-functions', contractId: `defineFunction.${argument}`,
      revision: FIXED_INPUT_CONTRACT_REVISION, variantId: 'default'},
    dialect: '2020-12',
    root: {retrievalUri: `https://kubohiroya.github.io/turbowarp-named-functions/schemas/defineFunction-${argument}.schema.json`,
      document: document.$defs.defineFunction.properties[argument], artifact: {role: 'canonical-schema', source}},
    resources: [],
    provenance: {canonicalSources: [source, {repository: 'turbowarp-named-functions', path: 'src/function-registry.ts', symbol: 'readDefinition'}],
      generatedFiles: [{repository: 'turbowarp-named-functions', path: 'site/schemas/block-editor-fixed-inputs.schema.json'}], referenceSchemas: [], generationSources: [{repository: 'turbowarp-named-functions', path: 'scripts/generate-fixed-input-docs.mjs'}]}
  };
}
