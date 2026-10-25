import { type NamedFunctionsOptions, type SchemaBlockOpcodes } from './composition.js';
import type { BlockUtilityLike } from './runtime-types.js';
export declare const DEFINE_FUNCTION_OPCODE: string;
export declare const DEFINE_SCHEMA_OPCODE: string;
/** Opcodes of the blocks that make up a `define schema` stack. */
export declare const SCHEMA_BLOCK_OPCODES: SchemaBlockOpcodes;
export type NamedFunctionsExtensionDependencies = Omit<NamedFunctionsOptions, 'functionHatOpcode'>;
type Args = Record<string, unknown>;
type Util = BlockUtilityLike & {
    stopThisScript?: () => void;
};
/** Block surface over the named-functions composition. */
export declare class NamedFunctionsExtension implements TurboWarpExtension {
    private lastErrorMessage;
    private readonly functions;
    private readonly unregisterFixedInputEditors;
    constructor(deps: NamedFunctionsExtensionDependencies);
    dispose(): void;
    getInfo(): Record<string, unknown>;
    defineFunction(args: Args, util?: Util): boolean;
    /**
     * A `define schema` stack is a declaration, not a script: the hat never activates, and the blocks
     * under it do nothing if a user clicks the stack.
     */
    defineSchema(): boolean;
    schemaProperty(): void;
    schemaPropertySchema(): void;
    schemaPropertyArraySchema(): void;
    schemaConstraint(): void;
    schemaAllowedValues(): void;
    schemaAdditionalProperties(): void;
    schemaJson(args: Args): string;
    isSchemaDefined(args: Args): boolean;
    functionArgument(args: Args, util?: Util): string | number | boolean;
    functionArgumentsJson(_args: Args, util?: Util): string;
    returnValue(args: Args, util?: Util): void;
    callFunction(args: Args, util?: Util): Promise<string | number | boolean>;
    startFunction(args: Args, util?: Util): string;
    awaitResult(args: Args): Promise<string | number | boolean>;
    awaitAll(args: Args): Promise<string>;
    isSettled(args: Args): boolean;
    isDefined(args: Args): boolean;
    lastError(): string;
    private guard;
    private toScratchBlock;
}
export {};
