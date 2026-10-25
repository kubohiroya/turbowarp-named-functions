/**
 * Readers for the literal parts of a serialized block.
 *
 * Definitions are read before any script runs, so every field they use must be literal text typed
 * into the block. A reporter plugged into such an input is rejected instead of evaluated.
 */
import type { SerializedBlock } from './runtime-types.js';
export declare function readLiteralInput(block: SerializedBlock, blocks: Record<string, SerializedBlock>, inputName: string): string;
export declare function readOptionalLiteralInput(block: SerializedBlock, blocks: Record<string, SerializedBlock>, inputName: string): string | undefined;
/** Reads a dropdown that does not accept reporters; the VM stores it as a field on the block. */
export declare function readMenuField(block: SerializedBlock, fieldName: string): string;
/**
 * The blocks stacked under `block`, in order. Shadow blocks are skipped, and a `next` chain that
 * loops or leaves the container stops the walk instead of hanging.
 */
export declare function stackBelow(block: SerializedBlock, blocks: Record<string, SerializedBlock>): SerializedBlock[];
