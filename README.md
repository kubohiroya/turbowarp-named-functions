# TurboWarp-Named-Functions

[English](README.md) | [日本語](README.ja.md)

A TurboWarp extension for defining named functions that take JSON arguments and return JSON results. Scripts can call them by name, wait for the result, or start several calls and await them later. Functions can be marked for export as tools so that other extensions, such as AI tool calling, can use them.

**User guide:** [English](https://kubohiroya.github.io/turbowarp-named-functions/)

## What it does

- Defines functions with a `define function` hat: a name, a description, and a JSON Schema for the arguments.
- Calls a function by name and waits for its result (`call function`), or starts it and awaits it later (`start function`, `await`, `await all`).
- Checks arguments against the schema before the function runs, without generating code.
- Detects reentrant calls (a function that calls itself directly or indirectly) and reports an error instead of waiting forever.
- Provides a Composition API so other extensions can bundle the same capability with their own blocks.

## Requirements and safety

- TurboWarp Desktop or TurboWarp Web with custom extensions enabled.

> [!IMPORTANT]
> This extension must run unsandboxed because it starts `define function` scripts through the VM runtime.
> Load extensions only from sources you trust.

- NAME, DESCRIPTION, and SCHEMA in `define function` must be literal text. The hat is read before any script runs.
- A function exported as a tool may be called with arguments chosen by another program, such as an AI model. Treat arguments as untrusted input even though they match the schema.

## Installation

### Built JavaScript

1. Download [`dist/turbowarp-named-functions.js`](dist/turbowarp-named-functions.js?raw=1).
2. Open **Extensions** in TurboWarp.
3. Choose **Custom Extension** and load the file.
4. Enable **Run without sandbox**.

### npm package

```bash
pnpm add --save-exact @kubohiroya/turbowarp-named-functions@0.1.0
```

Standalone bundle:

```text
node_modules/@kubohiroya/turbowarp-named-functions/dist/turbowarp-named-functions.js
```

## Quick start

```text
define function [add] description [Adds two numbers.] args schema [{"type":"object","properties":{"a":{"type":"number"},"b":{"type":"number"}},"required":["a","b"]}] export as [none]
return ((function argument [a]) + (function argument [b]))

when green flag clicked
say (call function [add] with [{"a":1,"b":2}])
```

## Block reference

The block reference is generated from
[`src/block-definitions.json`](src/block-definitions.json). Do not edit the
generated section manually.

<!-- BEGIN GENERATED BLOCKS -->

### `define function [NAME] description [DESCRIPTION] args schema [SCHEMA] export as [EXPORT]`

Defines a named function. NAME, DESCRIPTION, and SCHEMA must be literal text. export as tool marks it for consumers such as AI tool calling.

| Property | Value |
|---|---|
| Type | Hat |
| Opcode | `defineFunction` |
| `NAME` | String, default: `add` |
| `DESCRIPTION` | String, default: `Adds two numbers.` |
| `SCHEMA` | String, default: `{"type":"object","properties":{"a":{"type":"number"},"b":{"type":"number"}},"required":["a","b"]}` |
| `EXPORT` | String, default: `none`, choices: `none`, `tool` |

### `function argument [PATH]`

Inside a function, reports the argument at a dotted path such as a or items.0.name.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `functionArgument` |
| `PATH` | String, default: `a` |

### `function arguments JSON`

Inside a function, reports all arguments as JSON text.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `functionArgumentsJson` |

### `return [VALUE]`

Inside a function, returns a value and ends the script. JSON text is returned as JSON; other text is returned as a string.

| Property | Value |
|---|---|
| Type | Command |
| Opcode | `returnValue` |
| `VALUE` | String, default: `0` |

### `call function [NAME] with [ARGS]`

Calls a function and waits for its result. ARGS is JSON text and is checked against the args schema. Takes at least one frame.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `callFunction` |
| `NAME` | String, default: `add` |
| `ARGS` | String, default: `{"a":1,"b":2}` |

### `start function [NAME] with [ARGS]`

Starts a function without waiting and reports a promise reference as JSON text.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `startFunction` |
| `NAME` | String, default: `add` |
| `ARGS` | String, default: `{"a":1,"b":2}` |

### `await [PROMISE]`

Waits for a promise reference from start function and reports its result.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `awaitResult` |
| `PROMISE` | String, default: `{"$promise":"p_1"}` |

### `await all [PROMISES]`

Waits for a JSON array of promise references and reports a JSON array of results. Failed calls become {"$error": message}.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `awaitAll` |
| `PROMISES` | String, default: `[]` |

### `[PROMISE] settled?`

Reports whether a started function has finished, without waiting.

| Property | Value |
|---|---|
| Type | Boolean |
| Opcode | `isSettled` |
| `PROMISE` | String, default: `{"$promise":"p_1"}` |

### `function [NAME] defined?`

Reports whether a valid define function hat with this name exists.

| Property | Value |
|---|---|
| Type | Boolean |
| Opcode | `isDefined` |
| `NAME` | String, default: `add` |

### `last function error`

Reports the most recent function error, or an empty string.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `lastError` |

<!-- END GENERATED BLOCKS -->

## Important behavior

| Situation | Behavior |
|---|---|
| A call starts | Every `define function` hat is started; only the one whose NAME matches continues. |
| Timing | Each call takes at least one frame, because the function runs as its own script. Use custom blocks for tight loops and recursion. |
| Several calls to the same function | They run one at a time in order. Different functions run concurrently. |
| A function calls itself, directly or through other functions | The call fails with `Reentrant call: a -> b -> a`. Use a custom block for recursion. |
| Arguments do not match the schema | The call fails before the script starts; `last function error` explains which field. |
| The script ends without `return` | The result is empty (`null`). |
| A function takes longer than 30 seconds | The call fails with a timeout. |
| More than 8 started calls at once | Further `start function` calls wait for a free slot. |
| Project stop | Running calls fail and promise references are cleared. |
| Invalid `define function` hats (non-literal inputs, invalid schema, duplicate names) | The function is not defined; `function [NAME] defined?` reports false. |

## Composition API

Importing the Composition API does not register the standalone TurboWarp extension. The consumer
owns its blocks and its `define function` hat opcode, and forwards the hat predicate and the
argument/return blocks.

```ts
import {createNamedFunctions} from '@kubohiroya/turbowarp-named-functions/composition';

const functions = createNamedFunctions({
  runtime: Scratch.vm.runtime,
  functionHatOpcode: 'myextension_defineFunction'
});

// In the consumer's blocks:
//   defineFunction(args, util)   -> functions.matchHat(args.NAME, util.thread)
//   functionArgument(args, util) -> functions.argumentsFor(util.thread)
//   returnValue(args, util)      -> functions.returnFrom(util.thread, value)

const tools = functions.tools(); // functions exported as tools, OpenAI function-calling shape
const result = await functions.call('get_score', {}, {exportedOnly: true});

functions.release();
```

| Member | Purpose |
|---|---|
| `scan()` / `tools()` / `isDefined(name)` | Read and validate `define function` hats |
| `call(name, args, {caller, exportedOnly})` | Validate arguments, run the function, and resolve with its return value |
| `start(...)` / `await(ref)` / `awaitAll(refs)` / `isSettled(ref)` | Asynchronous calls through `{"$promise": id}` references |
| `matchHat` / `argumentsFor` / `returnFrom` | Bridge from the consumer's blocks |
| `cancelAll(reason)` / `release()` | Fail pending calls; `release` also detaches runtime listeners |

## Compatibility

| Identifier | Value | Stability |
|---|---|---|
| Product name | `TurboWarp-Named-Functions` | Human-facing |
| Repository | `kubohiroya/turbowarp-named-functions` | Current source location |
| npm package | `@kubohiroya/turbowarp-named-functions` | Public package contract |
| Extension ID | `kubohiroyanamedfunctions` | Stored in SB3; migration required to change |
| Composition API | `@kubohiroya/turbowarp-named-functions/composition` | Public package contract |

## Development

Use Node.js 22.18.0 or newer and the pnpm version declared by `packageManager`.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm check
```

To also run the integration test on a real headless TurboWarp VM:

```bash
SCRATCH_VM_PATH=/path/to/TurboWarp/scratch-vm pnpm test
```

## License

[Mozilla Public License 2.0](LICENSE) (SPDX: `MPL-2.0`).
