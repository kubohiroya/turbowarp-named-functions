import type { RuntimeLike, RuntimeTarget, RuntimeThread } from './runtime-types.js';
/**
 * Runs `define function` hats as named functions.
 *
 * With the thread execution port of the TurboWarp Plus VM, a call starts the function's own script
 * directly and runs it to completion inside the calling block, like a custom block that runs without
 * screen refresh. A function may call itself. The script returns to the sequencer only when it waits
 * (for a promise or a timer) or when calls nest deeper than `MAX_SYNC_DEPTH`; the call then settles
 * later. Beyond that depth calls keep working, one frame at a time.
 *
 * Without the port (stock TurboWarp), a call starts every `define function` hat; the hat predicate lets
 * only the script whose NAME matches the invocation being started continue, and binds that thread to
 * the invocation. Extension hats are not restarted while running, so calls to the same name are queued
 * and run one at a time. The next invocation is started only between steps (or directly from outside a
 * step). Inside a step, the hats that failed their predicate and the script that just returned still
 * count as running threads, so starting hats there would silently skip them.
 *
 * Each invocation records the chain of function names that led to it. Without the port, calling a name
 * that is already in the chain would wait for itself in the per-name queue, so it fails immediately as
 * reentrant.
 */
export interface FunctionDispatcherOptions {
    hatOpcode: string;
    /** Names that have a `define function` hat. Used to fail fast on unknown names. */
    knownNames: () => ReadonlySet<string>;
    timeoutMs?: number;
    setTimer?: (callback: () => void, ms: number) => unknown;
    clearTimer?: (handle: unknown) => void;
}
/** Where a function's `define function` script is. Needed to run it through the port. */
export interface FunctionScript {
    target: RuntimeTarget;
    blockId: string;
}
export interface InvokeRequest {
    name: string;
    args: unknown;
    /** Thread of the calling block, if any. */
    caller?: RuntimeThread | undefined;
    returnSchema?: unknown;
    script?: FunctionScript | undefined;
}
/** A call that settled while it was made, or the promise of one that settles later. */
export type CallOutcome = {
    state: 'fulfilled';
    value: unknown;
} | {
    state: 'rejected';
    error: Error;
} | {
    state: 'pending';
    promise: Promise<unknown>;
};
export declare const DEFAULT_FUNCTION_TIMEOUT_MS = 30000;
/**
 * Calls nested deeper than this run on later frames instead of inside the calling block, so deep
 * recursion cannot overflow the JavaScript stack.
 */
export declare const MAX_SYNC_DEPTH = 128;
export declare function outcomeToPromise(outcome: CallOutcome): Promise<unknown>;
export declare class FunctionDispatcher {
    private readonly runtime;
    private readonly options;
    private readonly queue;
    private readonly running;
    /** Invocations started through the port. Several may run the same function at once. */
    private readonly direct;
    private readonly byThread;
    private readonly port;
    private starting;
    private step;
    private readonly timeoutMs;
    private readonly setTimer;
    private readonly clearTimer;
    private readonly onAfterExecute;
    private readonly onStopAll;
    constructor(runtime: RuntimeLike, options: FunctionDispatcherOptions);
    /** True when calls run inside the calling block and may recurse. */
    get runsSynchronously(): boolean;
    /**
     * Starts a named function. `caller` is the thread of the block making the call, if any; it is used
     * to detect reentrant calls.
     */
    invoke(name: string, args: unknown, caller?: RuntimeThread, returnSchema?: unknown): Promise<unknown>;
    /**
     * Starts a named function and reports right away whether it already settled. With the port and a
     * `script`, a function that does not wait settles before this returns.
     */
    invokeNow(request: InvokeRequest): CallOutcome;
    /** Hat predicate: true only for the script that should run the invocation being started. */
    matchHat(name: string, thread: RuntimeThread | undefined): boolean;
    argumentsFor(thread: RuntimeThread | undefined): unknown;
    returnFrom(thread: RuntimeThread | undefined, value: unknown): void;
    cancelAll(reason: string): void;
    get pendingCount(): number;
    release(): void;
    private runDirect;
    private createInvocation;
    private armTimer;
    private pump;
    private afterStep;
    private settle;
    private settleWithValue;
}
/** Resolves a dotted path such as `items.0.name` inside parsed JSON arguments. */
export declare function readArgumentPath(args: unknown, path: string): unknown;
/** Converts a value for a Scratch reporter: objects and arrays become JSON text. */
export declare function toScratchValue(value: unknown): string | number | boolean;
/** Parses block text: JSON text becomes JSON, anything else stays a string. */
export declare function parseJsonOrText(text: string): unknown;
