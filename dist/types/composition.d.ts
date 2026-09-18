import { type FunctionScan, type FunctionTool } from './function-registry.js';
import type { RuntimeLike, RuntimeThread } from './runtime-types.js';
export type { FunctionDefinition, FunctionScan, FunctionTool } from './function-registry.js';
export { FUNCTION_NAME_PATTERN, scanFunctionDefinitions, toFunctionTools } from './function-registry.js';
export type { RuntimeLike, RuntimeThread, BlockUtilityLike } from './runtime-types.js';
export { parseJsonOrText, readArgumentPath, toScratchValue } from './function-dispatcher.js';
export { validateAgainstSchema } from './schema-validator.js';
export interface PromiseRef {
    $promise: string;
}
export interface CallOptions {
    /** Thread of the calling block, used to detect reentrant calls. */
    caller?: RuntimeThread;
    /** Refuse functions that are not exported as tools (for calls chosen by a model). */
    exportedOnly?: boolean;
}
export interface NamedFunctionsOptions {
    runtime: RuntimeLike;
    /** Opcode of the consumer extension's `define function` hat, e.g. `myextension_defineFunction`. */
    functionHatOpcode: string;
    timeoutMs?: number;
    /** Maximum concurrently running `start`ed calls; further starts wait for a slot. Default 8. */
    maxInFlight?: number;
    /** Settled promise results kept for `await`; the oldest settled ones are dropped first. Default 256. */
    maxRetainedPromises?: number;
    setTimer?: (callback: () => void, ms: number) => unknown;
    clearTimer?: (handle: unknown) => void;
}
export interface NamedFunctions {
    scan(): FunctionScan;
    /** Functions exported as tools, in OpenAI function-calling shape. Throws if any definition is invalid. */
    tools(): FunctionTool[];
    isDefined(name: string): boolean;
    /** Calls a function and waits for its result. Arguments are always validated against its schema. */
    call(name: string, args: unknown, options?: CallOptions): Promise<unknown>;
    /** Starts a function and returns a reference to await later. */
    start(name: string, args: unknown, options?: CallOptions): PromiseRef;
    await(ref: unknown): Promise<unknown>;
    /** Waits for every reference; failed ones become `{"$error": message}` in place. */
    awaitAll(refs: unknown): Promise<unknown[]>;
    isSettled(ref: unknown): boolean;
    /** Call from the `define function` hat predicate. */
    matchHat(name: string, thread: RuntimeThread | undefined): boolean;
    argumentsFor(thread: RuntimeThread | undefined): unknown;
    returnFrom(thread: RuntimeThread | undefined, value: unknown): void;
    cancelAll(reason: string): void;
    release(): void;
}
export declare function createNamedFunctions(options: NamedFunctionsOptions): NamedFunctions;
