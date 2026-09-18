/**
 * Composition API: named functions without TurboWarp block definitions.
 *
 * A consumer extension owns its `define function` hat (and its opcode) and forwards the hat
 * predicate and the argument/return blocks here. Importing this module does not register a
 * TurboWarp extension and does not touch the `Scratch` global.
 */
import {FunctionDispatcher} from './function-dispatcher.js';
import {
  scanFunctionDefinitions,
  toFunctionTools,
  type FunctionScan,
  type FunctionTool
} from './function-registry.js';
import type {RuntimeLike, RuntimeThread} from './runtime-types.js';
import {validateAgainstSchema} from './schema-validator.js';

export type {FunctionDefinition, FunctionScan, FunctionTool} from './function-registry.js';
export {FUNCTION_NAME_PATTERN, scanFunctionDefinitions, toFunctionTools} from './function-registry.js';
export type {RuntimeLike, RuntimeThread, BlockUtilityLike} from './runtime-types.js';
export {parseJsonOrText, readArgumentPath, toScratchValue} from './function-dispatcher.js';
export {validateAgainstSchema} from './schema-validator.js';

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

export function createNamedFunctions(options: NamedFunctionsOptions): NamedFunctions {
  return new NamedFunctionsImpl(options);
}

interface PromiseEntry {
  promise: Promise<unknown>;
  settled: boolean;
}

class NamedFunctionsImpl implements NamedFunctions {
  private readonly dispatcher: FunctionDispatcher;
  private readonly promises = new Map<string, PromiseEntry>();
  private readonly waiting: Array<() => void> = [];
  private inFlight = 0;
  private nextPromiseId = 1;
  private readonly maxInFlight: number;
  private readonly maxRetained: number;

  public constructor(private readonly options: NamedFunctionsOptions) {
    this.maxInFlight = Math.max(1, options.maxInFlight ?? 8);
    this.maxRetained = Math.max(1, options.maxRetainedPromises ?? 256);
    const dispatcherOptions = {
      hatOpcode: options.functionHatOpcode,
      knownNames: () => new Set(this.scan().functions.map((definition) => definition.name)),
      ...(options.timeoutMs === undefined ? {} : {timeoutMs: options.timeoutMs}),
      ...(options.setTimer ? {setTimer: options.setTimer} : {}),
      ...(options.clearTimer ? {clearTimer: options.clearTimer} : {})
    };
    this.dispatcher = new FunctionDispatcher(options.runtime, dispatcherOptions);
    options.runtime.on('PROJECT_STOP_ALL', () => this.promises.clear());
  }

  public scan(): FunctionScan {
    return scanFunctionDefinitions(this.options.runtime.targets, this.options.functionHatOpcode);
  }

  public tools(): FunctionTool[] {
    const scan = this.scan();
    if (scan.errors.length > 0) throw new Error(`Invalid function definitions: ${scan.errors.join('; ')}`);
    return toFunctionTools(scan.functions);
  }

  public isDefined(name: string): boolean {
    return this.scan().functions.some((definition) => definition.name === name.trim());
  }

  public call(name: string, args: unknown, options: CallOptions = {}): Promise<unknown> {
    const trimmed = name.trim();
    const definition = this.scan().functions.find((candidate) => candidate.name === trimmed);
    if (!definition) return Promise.reject(new Error(`Unknown function: ${trimmed}`));
    if (options.exportedOnly && definition.exportAs !== 'tool') {
      return Promise.reject(new Error(`Function ${trimmed} is not exported as a tool.`));
    }
    const errors = validateAgainstSchema(args, definition.parameters);
    if (errors.length > 0) {
      return Promise.reject(new Error(`Invalid arguments for ${trimmed}: ${errors.join('; ')}`));
    }
    return this.dispatcher.invoke(trimmed, args, options.caller);
  }

  public start(name: string, args: unknown, options: CallOptions = {}): PromiseRef {
    const id = `p_${this.nextPromiseId++}`;
    const promise = this.acquireSlot().then(() =>
      this.call(name, args, options).finally(() => this.releaseSlot())
    );
    const entry: PromiseEntry = {promise, settled: false};
    promise.then(
      () => (entry.settled = true),
      () => (entry.settled = true)
    );
    this.promises.set(id, entry);
    this.evictSettled();
    return {$promise: id};
  }

  public await(ref: unknown): Promise<unknown> {
    const entry = this.lookup(ref);
    return entry ? entry.promise : Promise.reject(new Error('Unknown or expired promise reference.'));
  }

  public async awaitAll(refs: unknown): Promise<unknown[]> {
    if (!Array.isArray(refs)) throw new Error('await all needs a JSON array of promise references.');
    const results = await Promise.allSettled(refs.map((ref) => this.await(ref)));
    return results.map((result) =>
      result.status === 'fulfilled' ? result.value : {$error: messageOf(result.reason)}
    );
  }

  public isSettled(ref: unknown): boolean {
    return this.lookup(ref)?.settled ?? false;
  }

  public matchHat(name: string, thread: RuntimeThread | undefined): boolean {
    return this.dispatcher.matchHat(name, thread);
  }

  public argumentsFor(thread: RuntimeThread | undefined): unknown {
    return this.dispatcher.argumentsFor(thread);
  }

  public returnFrom(thread: RuntimeThread | undefined, value: unknown): void {
    this.dispatcher.returnFrom(thread, value);
  }

  public cancelAll(reason: string): void {
    this.dispatcher.cancelAll(reason);
  }

  public release(): void {
    this.dispatcher.release();
    this.promises.clear();
  }

  private lookup(ref: unknown): PromiseEntry | undefined {
    const id =
      typeof ref === 'object' && ref !== null && typeof (ref as PromiseRef).$promise === 'string'
        ? (ref as PromiseRef).$promise
        : undefined;
    return id ? this.promises.get(id) : undefined;
  }

  private acquireSlot(): Promise<void> {
    if (this.inFlight < this.maxInFlight) {
      this.inFlight += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.waiting.push(() => {
      this.inFlight += 1;
      resolve();
    }));
  }

  private releaseSlot(): void {
    this.inFlight -= 1;
    this.waiting.shift()?.();
  }

  private evictSettled(): void {
    if (this.promises.size <= this.maxRetained) return;
    for (const [id, entry] of this.promises) {
      if (this.promises.size <= this.maxRetained) break;
      if (entry.settled) this.promises.delete(id);
    }
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
