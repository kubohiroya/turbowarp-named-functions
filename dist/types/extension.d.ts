import { type NamedFunctionsOptions } from './composition.js';
import type { BlockUtilityLike } from './runtime-types.js';
export declare const DEFINE_FUNCTION_OPCODE: string;
export type NamedFunctionsExtensionDependencies = Omit<NamedFunctionsOptions, 'functionHatOpcode'>;
type Args = Record<string, unknown>;
type Util = BlockUtilityLike & {
    stopThisScript?: () => void;
};
/** Block surface over the named-functions composition. */
export declare class NamedFunctionsExtension implements TurboWarpExtension {
    private lastErrorMessage;
    private readonly functions;
    constructor(deps: NamedFunctionsExtensionDependencies);
    getInfo(): Record<string, unknown>;
    defineFunction(args: Args, util?: Util): boolean;
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
