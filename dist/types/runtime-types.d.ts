/** The narrow slice of the TurboWarp VM runtime this extension depends on. */
export interface SerializedField {
    name?: string;
    value?: unknown;
}
export interface SerializedInput {
    block?: string | null;
    shadow?: string | null;
}
export interface SerializedBlock {
    id: string;
    opcode: string;
    topLevel?: boolean;
    shadow?: boolean;
    /** Id of the next block in the same stack, as the VM serializes a script. */
    next?: string | null;
    inputs?: Record<string, SerializedInput>;
    fields?: Record<string, SerializedField>;
}
export interface RuntimeTarget {
    id?: string;
    isOriginal?: boolean;
    isStage?: boolean;
    /** Shared by a sprite and its clones. */
    sprite?: unknown;
    getName?(): string;
    blocks: {
        _blocks: Record<string, SerializedBlock>;
    };
}
export interface RuntimeThread {
    topBlock?: string;
    /** The sprite, clone, or stage the thread runs as. */
    target?: RuntimeTarget;
}
/**
 * Version 1 of the thread execution port of the TurboWarp Plus VM (`kubohiroya/scratch-vm`).
 * Stock TurboWarp does not have it.
 */
export interface ThreadExecutionPort {
    version: number;
    /** Starts a new thread at the top of a script, even if the script is already running. */
    startScript(topBlockId: string, target: RuntimeTarget): RuntimeThread;
    /** Runs a thread inside the current block until it finishes, waits, or uses up the time limit. */
    runNow(thread: RuntimeThread, options?: {
        timeLimitMs?: number;
    }): 'done' | 'waiting' | 'yielded';
}
export interface RuntimeLike {
    targets: RuntimeTarget[];
    getTargetById?(id: string): RuntimeTarget | undefined;
    threads: RuntimeThread[];
    startHats(opcode: string, matchFields?: Record<string, string>): RuntimeThread[] | undefined;
    getThreadExecutionPort?(): ThreadExecutionPort;
    on(event: string, listener: (...args: unknown[]) => void): void;
    off?(event: string, listener: (...args: unknown[]) => void): void;
}
export interface BlockUtilityLike {
    thread?: RuntimeThread;
}
