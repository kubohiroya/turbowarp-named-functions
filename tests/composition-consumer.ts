// Type-checks the published composition API the way a downstream package imports it.
import {
  createNamedFunctions,
  resolveSchemaReference,
  scanSchemaDefinitions,
  type FunctionTool,
  type NamedFunctions,
  type PromiseRef,
  type RuntimeLike,
  type SchemaBlockOpcodes,
  type SchemaScan
} from '../dist/types/composition.js';

declare const runtime: RuntimeLike;

const functions: NamedFunctions = createNamedFunctions({runtime, functionHatOpcode: 'consumer_defineFunction'});
const tools: FunctionTool[] = functions.tools();
const ref: PromiseRef = functions.start('add', {a: 1, b: 2}, {exportedOnly: true});
void functions.await(ref);
void tools;
functions.release();

// The visual schema builder is opt-in: a consumer that owns the blocks passes their opcodes.
const schemaBlockOpcodes: SchemaBlockOpcodes = {
  hat: 'consumer_defineSchema',
  property: 'consumer_schemaProperty',
  propertySchema: 'consumer_schemaPropertySchema',
  propertyArraySchema: 'consumer_schemaPropertyArraySchema',
  constraint: 'consumer_schemaConstraint',
  allowedValues: 'consumer_schemaAllowedValues',
  additionalProperties: 'consumer_schemaAdditionalProperties'
};
const withSchemas: NamedFunctions = createNamedFunctions({
  runtime,
  functionHatOpcode: 'consumer_defineFunction',
  schemaBlockOpcodes
});
const schemas: SchemaScan = withSchemas.schemas();
const standalone: SchemaScan = scanSchemaDefinitions(runtime.targets, schemaBlockOpcodes);
const resolved: Record<string, unknown> = resolveSchemaReference(schemas.schemas, 'Player@1.0.0', 'args schema');
void standalone;
void resolved;
withSchemas.release();
