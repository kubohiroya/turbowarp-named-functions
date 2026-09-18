import type { RuntimeLike, RuntimeThread } from './runtime-types.js';
/**
 * Runs `define function` hats as named functions.
 *
 * A call starts every `define function` hat; the hat predicate lets only the script whose NAME
 * matches the invocation being started continue, and binds that thread to the invocation. Extension
 * hats are not restarted while running, so calls to the same name are queued and run one at a time.
 *
 * The next invocation is started only between steps (or directly from outside a step). Inside a step,
 * the hats that failed their predicate and the script that just returned still count as running
 * threads, so starting hats there would silently skip them.
 *
 * Each invocation records the chain of function names that led to it. Calling a name that is already
 * in the chain would wait for itself in the per-name queue, so it fails immediately as reentrant.
 */
export interface FunctionDispatcherOptions {
    hatOpcode: string;
    /** Names that have a `define function` hat. Used to fail fast on unknown names. */
    knownNames: () => ReadonlySet<string>;
    timeoutMs?: number;
    setTimer?: (callback: () => void, ms: number) => unknown;
    clearTimer?: (handle: unknown) => void;
}
export declare const DEFAULT_FUNCTION_TIMEOUT_MS = 30000;
export declare class FunctionDispatcher {
    private readonly runtime;
    private readonly options;
    private readonly queue;
    private readonly running;
    private readonly byThread;
    private starting;
    private step;
    private readonly timeoutMs;
    private readonly setTimer;
    private readonly clearTimer;
    private readonly onAfterExecute;
    private readonly onStopAll;
    constructor(runtime: RuntimeLike, options: FunctionDispatcherOptions);
    /**
     * Starts a named function. `caller` is the thread of the block making the call, if any; it is used
     * to detect reentrant calls.
     */
    invoke(name: string, args: unknown, caller?: RuntimeThread): Promise<unknown>;
    /** Hat predicate: true only for the script that should run the invocation being started. */
    matchHat(name: string, thread: RuntimeThread | undefined): boolean;
    argumentsFor(thread: RuntimeThread | undefined): unknown;
    returnFrom(thread: RuntimeThread | undefined, value: unknown): void;
    cancelAll(reason: string): void;
    get pendingCount(): number;
    release(): void;
    private pump;
    private afterStep;
    private settle;
}
/** Resolves a dotted path such as `items.0.name` inside parsed JSON arguments. */
export declare function readArgumentPath(args: unknown, path: string): unknown;
/** Converts a value for a Scratch reporter: objects and arrays become JSON text. */
export declare function toScratchValue(value: unknown): string | number | boolean;
/** Parses block text: JSON text becomes JSON, anything else stays a string. */
export declare function parseJsonOrText(text: string): unknown;
