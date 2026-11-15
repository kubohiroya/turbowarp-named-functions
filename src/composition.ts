/**
 * Composition API: named functions without TurboWarp block definitions.
 *
 * A consumer extension owns its `define function` hat (and its opcode) and forwards the hat
 * predicate and the argument/return blocks here. Importing this module does not register a
 * TurboWarp extension and does not touch the `Scratch` global.
 */
import {FunctionDispatcher, outcomeToPromise, type CallOutcome} from './function-dispatcher.js';
import {
  resolveFunction,
  scanFunctionDefinitions,
  toFunctionTools,
  visibleFunctions,
  type FunctionDefinition,
  type FunctionScan,
  type FunctionTool
} from './function-registry.js';
import {
  resolveSchemaReference,
  scanSchemaDefinitions,
  type SchemaBlockOpcodes,
  type SchemaScan
} from './schema-builder.js';
import type {RuntimeLike, RuntimeTarget, RuntimeThread} from './runtime-types.js';
import {validateAgainstSchema} from './schema-validator.js';

export type {
  FunctionDefinition,
  FunctionScan,
  FunctionScanOptions,
  FunctionScope,
  FunctionTool,
  ResolvedFunction
} from './function-registry.js';
export {
  FUNCTION_NAME_PATTERN,
  resolveFunction,
  sameSprite,
  scanFunctionDefinitions,
  toFunctionTools,
  upgradeLegacyScopes,
  visibleFunctions
} from './function-registry.js';
export type {SchemaBlockOpcodes, SchemaDefinition, SchemaReference, SchemaScan} from './schema-builder.js';
export {
  MAX_SCHEMA_REFERENCE_DEPTH,
  SCHEMA_NAME_PATTERN,
  SCHEMA_VERSION_PATTERN,
  parseSchemaReference,
  resolveSchemaReference,
  scanSchemaDefinitions
} from './schema-builder.js';
export type {RuntimeLike, RuntimeThread, BlockUtilityLike, ThreadExecutionPort} from './runtime-types.js';
export type {CallOutcome} from './function-dispatcher.js';
export {MAX_SYNC_DEPTH} from './function-dispatcher.js';
export {parseJsonOrText, readArgumentPath, toScratchValue} from './function-dispatcher.js';
export {validateAgainstSchema, validateSchemaDefinition} from './schema-validator.js';

export interface PromiseRef {
  $promise: string;
}

export interface CallOptions {
  /**
   * Thread of the calling block. Its sprite decides which functions are visible: its own sprite
   * functions and every global one. Without it, only global functions are visible. It also links
   * nested calls and detects reentrant ones.
   */
  caller?: RuntimeThread;
  /** Refuse functions that are not exported as tools (for calls chosen by a model). */
  exportedOnly?: boolean;
}

export interface NamedFunctionsOptions {
  runtime: RuntimeLike;
  /** Opcode of the consumer extension's `define function` hat, e.g. `myextension_defineFunction`. */
  functionHatOpcode: string;
  /**
   * Opcodes of the consumer extension's visual schema-builder blocks. When omitted, SCHEMA and
   * RETURNS accept JSON text only, exactly as before.
   */
  schemaBlockOpcodes?: SchemaBlockOpcodes;
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
  /** `define schema` hats lowered to canonical JSON Schema. Empty without `schemaBlockOpcodes`. */
  schemas(): SchemaScan;
  /** Functions exported as tools, in OpenAI function-calling shape. Throws if any definition is invalid. */
  tools(): FunctionTool[];
  /** Whether a script running as `caller` can call `name`. Without a caller, global functions only. */
  isDefined(name: string, caller?: RuntimeTarget): boolean;
  /** Functions a script running as `caller` can call, sprite functions first. */
  visible(caller?: RuntimeTarget): FunctionDefinition[];

  /** Calls a function and waits for its result. Arguments are always validated against its schema. */
  call(name: string, args: unknown, options?: CallOptions): Promise<unknown>;
  /**
   * Calls a function and reports at once whether it already settled. On the TurboWarp Plus VM, a
   * function that does not wait settles before this returns, so a block can report its result in
   * the same step.
   */
  callNow(name: string, args: unknown, options?: CallOptions): CallOutcome;
  /** True when calls run inside the calling block and may recurse (TurboWarp Plus VM). */
  readonly runsSynchronously: boolean;
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
    const opcodes = this.options.schemaBlockOpcodes;
    if (!opcodes) {
      return scanFunctionDefinitions(this.options.runtime.targets, this.options.functionHatOpcode);
    }
    const schemas = this.schemas().schemas;
    return scanFunctionDefinitions(this.options.runtime.targets, this.options.functionHatOpcode, {
      resolveSchema: (reference, label) => resolveSchemaReference(schemas, reference, label)
    });
  }

  public schemas(): SchemaScan {
    const opcodes = this.options.schemaBlockOpcodes;
    if (!opcodes) return {schemas: [], errors: []};
    return scanSchemaDefinitions(this.options.runtime.targets, opcodes);
  }

  public tools(): FunctionTool[] {
    const errors = [...this.schemas().errors, ...this.scan().errors];
    if (errors.length > 0) throw new Error(`Invalid function definitions: ${errors.join('; ')}`);
    return toFunctionTools(this.scan().functions);
  }

  public isDefined(name: string, caller?: RuntimeTarget): boolean {
    return resolveFunction(this.scan().functions, name.trim(), caller) !== undefined;
  }

  public visible(caller?: RuntimeTarget): FunctionDefinition[] {
    const functions = visibleFunctions(this.scan().functions, caller);
    return [
      ...functions.filter((definition) => definition.scope === 'sprite'),
      ...functions.filter((definition) => definition.scope === 'global')
    ];
  }

  public get runsSynchronously(): boolean {
    return this.dispatcher.runsSynchronously;
  }

  public call(name: string, args: unknown, options: CallOptions = {}): Promise<unknown> {
    return outcomeToPromise(this.callNow(name, args, options));
  }

  public callNow(name: string, args: unknown, options: CallOptions = {}): CallOutcome {
    const trimmed = name.trim();
    const scan = this.scan();
    const caller = options.caller?.target;
    const resolved = resolveFunction(scan.functions, trimmed, caller);
    if (!resolved) return rejected(unknownFunctionMessage(scan.functions, trimmed, caller));
    const {definition, runAs} = resolved;
    if (options.exportedOnly && definition.exportAs !== 'tool') {
      return rejected(`Function ${trimmed} is not exported as a tool.`);
    }
    const errors = validateAgainstSchema(args, definition.parameters);
    if (errors.length > 0) {
      return rejected(`Invalid arguments for ${trimmed}: ${errors.join('; ')}`);
    }
    return this.dispatcher.invokeNow({
      name: trimmed,
      args,
      caller: options.caller,
      returnSchema: definition.returns,
      script: {target: runAs, blockId: definition.blockId}
    });
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

/** Names the sprite that owns a function the caller cannot see, so the fix is obvious. */
function unknownFunctionMessage(
  functions: readonly FunctionDefinition[],
  name: string,
  caller: RuntimeTarget | undefined
): string {
  const elsewhere = functions.find((definition) => definition.name === name);
  if (!elsewhere) return `Unknown function: ${name}`;
  return caller
    ? `Function ${name} belongs to ${elsewhere.targetName}; make it for all sprites to call it from here.`
    : `Function ${name} belongs to ${elsewhere.targetName}; only functions for all sprites can be called from outside.`;
}

function rejected(message: string): CallOutcome {
  return {state: 'rejected', error: new Error(message)};
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
