import type {SchemaBundle} from '@kubohiroya/turbowarp-extension-data-editor/schema';
import document from '../schemas/block-editor-fixed-inputs.schema.json';

const source = {repository: 'turbowarp-named-functions', path: 'schemas/block-editor-fixed-inputs.schema.json',
  symbol: '#/$defs/defineFunction/properties/EXPORT'};

/** The on-disk owner Schema is canonical; this is its single-field projection. */
export const fixedInputSchemaBundle: SchemaBundle = {
  identity: {ownerId: 'turbowarp-named-functions', contractId: 'defineFunction.EXPORT', revision: 'fixed-inputs-v1', variantId: 'default'},
  dialect: '2020-12',
  root: {retrievalUri: 'https://kubohiroya.github.io/turbowarp-named-functions/schemas/defineFunction-EXPORT.schema.json',
    document: document.$defs.defineFunction.properties.EXPORT, artifact: {role: 'canonical-schema', source}},
  resources: [],
  provenance: {canonicalSources: [source, {repository: 'turbowarp-named-functions', path: 'src/function-registry.ts', symbol: 'readDefinition'}],
    generatedFiles: [{repository: 'turbowarp-named-functions', path: 'site/schemas/block-editor-fixed-inputs.schema.json'}], referenceSchemas: [], generationSources: [{repository: 'turbowarp-named-functions', path: 'scripts/generate-fixed-input-docs.mjs'}]}
};
