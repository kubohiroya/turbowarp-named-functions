import type {RuntimeLike, RuntimeTarget, RuntimeThread, ThreadExecutionPort} from './runtime-types.js';
import {validateAgainstSchema} from './schema-validator.js';

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
export type CallOutcome =
  | {state: 'fulfilled'; value: unknown}
  | {state: 'rejected'; error: Error}
  | {state: 'pending'; promise: Promise<unknown>};

interface Invocation {
  name: string;
  args: unknown;
  returnSchema?: unknown;
  chain: readonly string[];
  script?: FunctionScript;
  promise: Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  thread: RuntimeThread | null;
  startedAtStep: number;
  timer: unknown;
  settled: boolean;
  outcome: CallOutcome | null;
}

export const DEFAULT_FUNCTION_TIMEOUT_MS = 30_000;

/**
 * Calls nested deeper than this run on later frames instead of inside the calling block, so deep
 * recursion cannot overflow the JavaScript stack.
 */
export const MAX_SYNC_DEPTH = 128;

export function outcomeToPromise(outcome: CallOutcome): Promise<unknown> {
  if (outcome.state === 'fulfilled') return Promise.resolve(outcome.value);
  if (outcome.state === 'rejected') return Promise.reject(outcome.error);
  return outcome.promise;
}

export class FunctionDispatcher {
  private readonly queue: Invocation[] = [];
  private readonly running = new Map<string, Invocation>();
  /** Invocations started through the port. Several may run the same function at once. */
  private readonly direct = new Set<Invocation>();
  private readonly byThread = new Map<RuntimeThread, Invocation>();
  private readonly port: ThreadExecutionPort | null;
  private starting: Invocation | null = null;
  private step = 0;
  private readonly timeoutMs: number;
  private readonly setTimer: (callback: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly onAfterExecute = () => this.afterStep();
  private readonly onStopAll = () => this.cancelAll('The project was stopped.');

  public constructor(
    private readonly runtime: RuntimeLike,
    private readonly options: FunctionDispatcherOptions
  ) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_FUNCTION_TIMEOUT_MS;
    this.setTimer = options.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
    this.clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    const port = runtime.getThreadExecutionPort?.();
    this.port = port?.version === 1 ? port : null;
    runtime.on('AFTER_EXECUTE', this.onAfterExecute);
    runtime.on('PROJECT_STOP_ALL', this.onStopAll);
  }

  /** True when calls run inside the calling block and may recurse. */
  public get runsSynchronously(): boolean {
    return this.port !== null;
  }

  /**
   * Starts a named function. `caller` is the thread of the block making the call, if any; it is used
   * to detect reentrant calls.
   */
  public invoke(name: string, args: unknown, caller?: RuntimeThread, returnSchema?: unknown): Promise<unknown> {
    return outcomeToPromise(this.invokeNow({name, args, caller, returnSchema}));
  }

  /**
   * Starts a named function and reports right away whether it already settled. With the port and a
   * `script`, a function that does not wait settles before this returns.
   */
  public invokeNow(request: InvokeRequest): CallOutcome {
    const {name, caller} = request;
    if (!this.options.knownNames().has(name)) {
      return {state: 'rejected', error: new Error(`Unknown function: ${name}`)};
    }
    const parentChain = caller ? (this.byThread.get(caller)?.chain ?? []) : [];
    const chain = [...parentChain, name];
    if (this.port && request.script) {
      return this.runDirect(this.port, request, chain);
    }
    if (parentChain.includes(name)) {
      return {
        state: 'rejected',
        error: new Error(
          `Reentrant call: ${chain.join(' -> ')}. Recursion needs the TurboWarp Plus runtime; ` +
            'use a custom block for recursion here.'
        )
      };
    }
    const invocation = this.createInvocation(request, chain);
    this.armTimer(invocation);
    this.queue.push(invocation);
    this.pump();
    return invocation.outcome ?? {state: 'pending', promise: invocation.promise};
  }

  /** Hat predicate: true only for the script that should run the invocation being started. */
  public matchHat(name: string, thread: RuntimeThread | undefined): boolean {
    if (!thread) return false;
    const bound = this.byThread.get(thread);
    // A script started through the port is bound before its hat runs.
    if (bound) return bound.name === name.trim();
    const invocation = this.starting;
    if (!invocation || invocation.name !== name.trim()) return false;
    // Several sprites may each have their own function of this name; only the resolved one runs.
    const script = invocation.script;
    if (script && (thread.topBlock !== script.blockId || (thread.target && thread.target !== script.target))) {
      return false;
    }
    invocation.thread = thread;
    this.byThread.set(thread, invocation);
    this.starting = null;
    return true;
  }

  public argumentsFor(thread: RuntimeThread | undefined): unknown {
    const invocation = thread ? this.byThread.get(thread) : undefined;
    if (!invocation) throw new Error('This block can only be used inside a running function.');
    return invocation.args;
  }

  public returnFrom(thread: RuntimeThread | undefined, value: unknown): void {
    const invocation = thread ? this.byThread.get(thread) : undefined;
    if (!invocation) throw new Error('return can only be used inside a running function.');
    this.settleWithValue(invocation, value);
  }

  public cancelAll(reason: string): void {
    for (const invocation of [...this.queue, ...this.running.values(), ...this.direct]) {
      this.settle(invocation, new Error(reason));
    }
    if (this.starting) this.settle(this.starting, new Error(reason));
  }

  public get pendingCount(): number {
    return this.queue.length + this.running.size + this.direct.size;
  }

  public release(): void {
    this.cancelAll('Named functions were released.');
    this.runtime.off?.('AFTER_EXECUTE', this.onAfterExecute);
    this.runtime.off?.('PROJECT_STOP_ALL', this.onStopAll);
  }

  private runDirect(port: ThreadExecutionPort, request: InvokeRequest, chain: readonly string[]): CallOutcome {
    const invocation = this.createInvocation(request, chain);
    // A call that settles now is reported through the returned outcome, not the promise.
    invocation.promise.catch(() => undefined);
    const script = request.script as FunctionScript;
    try {
      const thread = port.startScript(script.blockId, script.target);
      invocation.thread = thread;
      this.byThread.set(thread, invocation);
      this.direct.add(invocation);
      if (chain.length <= MAX_SYNC_DEPTH && port.runNow(thread) === 'done') {
        // The script ended without `return`.
        this.settleWithValue(invocation, null);
      }
    } catch (error) {
      this.settle(invocation, error instanceof Error ? error : new Error(String(error)));
    }
    if (invocation.outcome) return invocation.outcome;
    this.armTimer(invocation);
    return {state: 'pending', promise: invocation.promise};
  }

  private createInvocation(request: InvokeRequest, chain: readonly string[]): Invocation {
    let resolve: (value: unknown) => void = () => undefined;
    let reject: (error: Error) => void = () => undefined;
    const promise = new Promise<unknown>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    return {
      name: request.name,
      args: request.args,
      ...(request.returnSchema === undefined ? {} : {returnSchema: request.returnSchema}),
      chain,
      ...(request.script ? {script: request.script} : {}),
      promise,
      resolve,
      reject,
      thread: null,
      startedAtStep: -1,
      timer: null,
      settled: false,
      outcome: null
    };
  }

  private armTimer(invocation: Invocation): void {
    if (invocation.settled) return;
    invocation.timer = this.setTimer(
      () => this.settle(invocation, new Error(`Function ${invocation.name} timed out.`)),
      this.timeoutMs
    );
  }

  private pump(): void {
    if (this.starting) return;
    const index = this.queue.findIndex((invocation) => !this.running.has(invocation.name));
    if (index < 0) return;
    const [invocation] = this.queue.splice(index, 1);
    if (!invocation) return;
    this.running.set(invocation.name, invocation);
    this.starting = invocation;
    invocation.startedAtStep = this.step;
    this.runtime.startHats(this.options.hatOpcode);
  }

  private afterStep(): void {
    this.step += 1;
    const starting = this.starting;
    // A started hat is evaluated within the current or the next step.
    if (starting && this.step - starting.startedAtStep > 2) {
      this.settle(starting, new Error(`Function ${starting.name} did not start. Is its script already running?`));
    }
    for (const invocation of [...this.running.values(), ...this.direct]) {
      if (invocation.thread && !this.runtime.threads.includes(invocation.thread)) {
        // The script ended without `return`.
        this.settleWithValue(invocation, null);
      }
    }
    this.pump();
  }

  private settle(invocation: Invocation, error: Error | null, value?: unknown): void {
    if (invocation.settled) return;
    invocation.settled = true;
    if (invocation.timer !== null) this.clearTimer(invocation.timer);
    const queued = this.queue.indexOf(invocation);
    if (queued >= 0) this.queue.splice(queued, 1);
    if (this.running.get(invocation.name) === invocation) this.running.delete(invocation.name);
    this.direct.delete(invocation);
    if (invocation.thread) this.byThread.delete(invocation.thread);
    if (this.starting === invocation) this.starting = null;
    if (error) {
      invocation.outcome = {state: 'rejected', error};
      invocation.reject(error);
    } else {
      invocation.outcome = {state: 'fulfilled', value};
      invocation.resolve(value);
    }
  }

  private settleWithValue(invocation: Invocation, value: unknown): void {
    if (invocation.returnSchema !== undefined) {
      const errors = validateAgainstSchema(value, invocation.returnSchema);
      if (errors.length > 0) {
        this.settle(invocation, new Error(`Invalid return value for ${invocation.name}: ${errors.join('; ')}`));
        return;
      }
    }
    this.settle(invocation, null, value);
  }
}

/** Resolves a dotted path such as `items.0.name` inside parsed JSON arguments. */
export function readArgumentPath(args: unknown, path: string): unknown {
  const trimmed = path.trim();
  if (trimmed.length === 0) return args;
  let current: unknown = args;
  for (const segment of trimmed.split('.')) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/** Converts a value for a Scratch reporter: objects and arrays become JSON text. */
export function toScratchValue(value: unknown): string | number | boolean {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return JSON.stringify(value);
}

/** Parses block text: JSON text becomes JSON, anything else stays a string. */
export function parseJsonOrText(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.length === 0) return '';
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return text;
  }
}
