/**
 * Readers for the literal parts of a serialized block.
 *
 * Definitions are read before any script runs, so every field they use must be literal text typed
 * into the block. A reporter plugged into such an input is rejected instead of evaluated.
 */
import type {SerializedBlock} from './runtime-types.js';

export function readLiteralInput(
  block: SerializedBlock,
  blocks: Record<string, SerializedBlock>,
  inputName: string
): string {
  const input = block.inputs?.[inputName];
  if (!input) throw new Error(`${inputName} is missing`);
  if (input.block && input.block !== input.shadow) {
    throw new Error(`${inputName} must be literal text, not a reporter block`);
  }
  const shadowId = input.shadow ?? input.block;
  const shadow = shadowId ? blocks[shadowId] : undefined;
  const field = shadow?.fields ? Object.values(shadow.fields)[0] : undefined;
  if (!field) throw new Error(`${inputName} is missing`);
  return String(field.value ?? '');
}

export function readOptionalLiteralInput(
  block: SerializedBlock,
  blocks: Record<string, SerializedBlock>,
  inputName: string
): string | undefined {
  if (!block.inputs?.[inputName]) return undefined;
  return readLiteralInput(block, blocks, inputName);
}

/** Reads a dropdown that does not accept reporters; the VM stores it as a field on the block. */
export function readMenuField(block: SerializedBlock, fieldName: string): string {
  const field = block.fields?.[fieldName];
  if (!field) throw new Error(`${fieldName} is missing`);
  return String(field.value ?? '');
}

/**
 * The blocks stacked under `block`, in order. Shadow blocks are skipped, and a `next` chain that
 * loops or leaves the container stops the walk instead of hanging.
 */
export function stackBelow(
  block: SerializedBlock,
  blocks: Record<string, SerializedBlock>
): SerializedBlock[] {
  const stack: SerializedBlock[] = [];
  const seen = new Set<string>([block.id]);
  let nextId = block.next ?? null;
  while (nextId) {
    if (seen.has(nextId)) break;
    seen.add(nextId);
    const next = blocks[nextId];
    if (!next) break;
    if (next.shadow !== true) stack.push(next);
    nextId = next.next ?? null;
  }
  return stack;
}
