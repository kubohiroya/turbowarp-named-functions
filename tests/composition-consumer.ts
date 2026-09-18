// Type-checks the published composition API the way a downstream package imports it.
import {
  createNamedFunctions,
  type FunctionTool,
  type NamedFunctions,
  type PromiseRef,
  type RuntimeLike
} from '../dist/types/composition.js';

declare const runtime: RuntimeLike;

const functions: NamedFunctions = createNamedFunctions({runtime, functionHatOpcode: 'consumer_defineFunction'});
const tools: FunctionTool[] = functions.tools();
const ref: PromiseRef = functions.start('add', {a: 1, b: 2}, {exportedOnly: true});
void functions.await(ref);
void tools;
functions.release();
