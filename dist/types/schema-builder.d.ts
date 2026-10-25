import type { RuntimeTarget } from './runtime-types.js';
export declare const SCHEMA_NAME_PATTERN: RegExp;
/** Complete SemVer, as the named-data schema identity contract requires. */
export declare const SCHEMA_VERSION_PATTERN: RegExp;
/** How deep a chain of schema references may nest before it is reported as too deep. */
export declare const MAX_SCHEMA_REFERENCE_DEPTH = 16;
/** Opcodes of the consumer extension's schema-builder blocks. */
export interface SchemaBlockOpcodes {
    /** `define schema [NAME] version [VERSION]` */
    hat: string;
    /** `property [NAME] type [TYPE] [PRESENCE]` */
    property: string;
    /** `property [NAME] schema [SCHEMA] [PRESENCE]` */
    propertySchema: string;
    /** `property [NAME] array of schema [SCHEMA] [PRESENCE]` */
    propertyArraySchema: string;
    /** `limit [KEYWORD] to (VALUE)` */
    constraint: string;
    /** `allowed values [VALUES]` */
    allowedValues: string;
    /** `allow undeclared properties [ALLOW]` */
    additionalProperties: string;
}
export interface SchemaDefinition {
    name: string;
    version: string;
    /** Canonical JSON Schema with every schema reference already inlined. */
    schema: Record<string, unknown>;
    targetName: string;
    blockId: string;
}
export interface SchemaScan {
    schemas: SchemaDefinition[];
    errors: string[];
}
/** A `Name` or `Name@1.2.3` reference typed into a block field. */
export interface SchemaReference {
    name: string;
    version?: string;
}
/**
 * Reads every `define schema` hat in the project and lowers it to a canonical JSON Schema.
 * A hat that cannot be read is reported in `errors` and left out of `schemas`.
 */
export declare function scanSchemaDefinitions(targets: readonly RuntimeTarget[], opcodes: SchemaBlockOpcodes): SchemaScan;
/** Parses `Name` or `Name@1.2.3`. */
export declare function parseSchemaReference(text: string, label: string): SchemaReference;
/**
 * Resolves a `Name` or `Name@1.2.3` reference against scanned schemas. An unknown name or version
 * fails; a name with several versions and no pinned version is ambiguous rather than guessed.
 */
export declare function resolveSchemaReference(schemas: readonly SchemaDefinition[], text: string, label: string): Record<string, unknown>;
