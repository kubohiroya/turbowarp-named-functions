# TurboWarp-Named-Functions

<img src="assets/block-icon.svg" alt="" width="48" height="48">

[English](README.md) | [日本語](README.ja.md)

A TurboWarp extension for defining named functions that take JSON arguments and return JSON results. Scripts can call them by name, wait for the result, or start several calls and await them later. Functions can be marked for export as tools so that other extensions, such as AI tool calling, can use them.

**User guide:** [English](https://kubohiroya.github.io/turbowarp-named-functions/) | [日本語](https://kubohiroya.github.io/turbowarp-named-functions/ja/)

## What it does

- Defines functions with a `define function` hat: a name, a description, and a JSON Schema for the arguments.
- Calls a function by name and waits for its result (`call function`), or starts it and awaits it later (`start function`, `await`, `await all`).
- Checks arguments against the schema before the function runs, without generating code.
- Optionally checks returned values against the same JSON Schema subset.
- Detects reentrant calls (a function that calls itself directly or indirectly) and reports an error instead of waiting forever.
- Provides a Composition API so other extensions can bundle the same capability with their own blocks.

## Requirements and safety

- TurboWarp Desktop or TurboWarp Web with custom extensions enabled.

> [!IMPORTANT]
> This extension must run unsandboxed because it starts `define function` scripts through the VM runtime.
> Load extensions only from sources you trust.

- NAME, DESCRIPTION, SCHEMA, and a non-empty RETURNS value in `define function` must be literal text. The hat is read before any script runs.
- A function exported as a tool may be called with arguments chosen by another program, such as an AI model. Treat arguments as untrusted input even though they match the schema.

## Installation

### Built JavaScript

1. Download [`dist/turbowarp-named-functions.js`](dist/turbowarp-named-functions.js?raw=1).
2. Open **Extensions** in TurboWarp.
3. Choose **Custom Extension** and load the file.
4. Enable **Run without sandbox**.

### npm package

```bash
pnpm add --save-exact @kubohiroya/turbowarp-named-functions@0.2.0
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

### `define function [NAME] description [DESCRIPTION] args schema [SCHEMA] returns schema [RETURNS] export as [EXPORT]`

Defines a named function. NAME, DESCRIPTION, and SCHEMA must be literal text. SCHEMA and RETURNS each take JSON Schema text or the name of a `define schema` hat, optionally pinned as Name@1.0.0. RETURNS is optional; leave it blank to disable return validation.

| Property | Value |
|---|---|
| Type | Hat |
| Opcode | `defineFunction` |
| `NAME` | String, default: `add` |
| `DESCRIPTION` | String, default: `Adds two numbers.` |
| `SCHEMA` | String, default: `{"type":"object","properties":{"a":{"type":"number"},"b":{"type":"number"}},"required":["a","b"]}` |
| `RETURNS` | String, default: `` |
| `EXPORT` | String, default: `none`, choices: `none`, `tool` |

### `define schema [NAME] version [VERSION]`

Declares a named JSON Schema from the property blocks stacked under it. NAME and VERSION must be literal text, and VERSION must be a complete SemVer value. The stack is read as a declaration and never run; the result is the same canonical JSON Schema that schema text produces.

| Property | Value |
|---|---|
| Type | Hat |
| Opcode | `defineSchema` |
| `NAME` | String, default: `Player` |
| `VERSION` | String, default: `1.0.0` |

### `property [NAME] type [TYPE] [PRESENCE]`

Inside a `define schema` stack, declares one property of the schema.

| Property | Value |
|---|---|
| Type | Command |
| Opcode | `schemaProperty` |
| `NAME` | String, default: `name` |
| `TYPE` | String, default: `string`, choices: `string`, `number`, `integer`, `boolean`, `null`, `object`, `array`, `array of string`, `array of number`, `array of integer`, `array of boolean`, `array of object` |
| `PRESENCE` | String, default: `required`, choices: `required`, `optional` |

### `property [NAME] schema [SCHEMA] [PRESENCE]`

Declares a property whose value follows another named schema. SCHEMA is a `define schema` name, optionally pinned as Name@1.0.0.

| Property | Value |
|---|---|
| Type | Command |
| Opcode | `schemaPropertySchema` |
| `NAME` | String, default: `profile` |
| `SCHEMA` | String, default: `Profile` |
| `PRESENCE` | String, default: `required`, choices: `required`, `optional` |

### `property [NAME] array of schema [SCHEMA] [PRESENCE]`

Declares a property holding an array whose items follow another named schema.

| Property | Value |
|---|---|
| Type | Command |
| Opcode | `schemaPropertyArraySchema` |
| `NAME` | String, default: `items` |
| `SCHEMA` | String, default: `Item` |
| `PRESENCE` | String, default: `optional`, choices: `required`, `optional` |

### `limit [KEYWORD] to [VALUE]`

Adds a limit to the property declared just above. `minItems` and `maxItems` apply to an array property itself; the other limits apply to each of its items.

| Property | Value |
|---|---|
| Type | Command |
| Opcode | `schemaConstraint` |
| `KEYWORD` | String, default: `minimum`, choices: `minimum`, `maximum`, `minLength`, `maxLength`, `minItems`, `maxItems` |
| `VALUE` | Number, default: `0` |

### `allowed values [VALUES]`

Restricts the property declared just above to an enum. VALUES is a JSON array, or a comma-separated list of strings.

| Property | Value |
|---|---|
| Type | Command |
| Opcode | `schemaAllowedValues` |
| `VALUES` | String, default: `red, green, blue` |

### `allow undeclared properties [ALLOW]`

Sets whether the schema accepts properties it does not declare. Left out, undeclared properties are accepted, as in JSON Schema.

| Property | Value |
|---|---|
| Type | Command |
| Opcode | `schemaAdditionalProperties` |
| `ALLOW` | String, default: `no`, choices: `no`, `yes` |

### `schema [NAME] JSON`

Reports the canonical JSON Schema a `define schema` hat lowers to, or an empty string if it is unknown or invalid.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `schemaJson` |
| `NAME` | String, default: `Player` |

### `schema [NAME] defined?`

True when a valid `define schema` hat has that name. A name may be pinned as Name@1.0.0.

| Property | Value |
|---|---|
| Type | Boolean |
| Opcode | `isSchemaDefined` |
| `NAME` | String, default: `Player` |

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
| A return value does not match RETURNS | The call fails; `last function error` reports the expected type and JSON path. Ending without `return` is checked as `null`. |
| The script ends without `return` | The result is empty (`null`). |
| A function takes longer than 30 seconds | The call fails with a timeout. |
| More than 8 started calls at once | Further `start function` calls wait for a free slot. |
| Project stop | Running calls fail and promise references are cleared. |
| Invalid `define function` hats (non-literal inputs, invalid schema, duplicate names) | The function is not defined; `function [NAME] defined?` reports false. |

## Building a schema from blocks

Schemas can be written as JSON text, as before, or built from blocks. A `define schema` hat with
property blocks stacked under it declares a named schema:

```text
define schema [Player] version [1.0.0]
  property [name] type [string] required
  property [score] type [number] required
  limit [minimum] to (0)
  property [tags] type [array of string] optional
```

That stack lowers to exactly the JSON Schema the text form would produce:

```json
{
  "type": "object",
  "properties": {
    "name": {"type": "string"},
    "score": {"type": "number", "minimum": 0},
    "tags": {"type": "array", "items": {"type": "string"}}
  },
  "required": ["name", "score"]
}
```

`schema [NAME] JSON` reports that canonical schema, so the lowering is visible in the project.

A `define schema` stack is a declaration, not a script. It is read before anything runs, its hat
never activates, and the blocks under it do nothing if the stack is clicked. Every field it reads
must be literal text; a reporter plugged into one is rejected rather than evaluated.

### Using a named schema in a function

`args schema` and `returns schema` take either JSON text or the name of a `define schema` hat, so
`args schema [Player]` validates calls against the schema above. A name may be pinned to a version
as `Player@1.0.0`. Text that is not JSON is read as a name, so projects that hold JSON text keep
working unchanged, and a name is resolved through the same `validateAgainstSchema` subset as text.

### Which blocks build what

| Block | Lowers to |
|---|---|
| `property [NAME] type [TYPE] [PRESENCE]` | A property of that type; `required` adds it to `required`. |
| `property [NAME] schema [SCHEMA] [PRESENCE]` | A property holding the named schema, inlined. |
| `property [NAME] array of schema [SCHEMA] [PRESENCE]` | `{"type": "array", "items": <named schema>}`. |
| `limit [KEYWORD] to (VALUE)` | `minimum`, `maximum`, `minLength`, `maxLength`, `minItems` or `maxItems` on the property above. |
| `allowed values [VALUES]` | `enum`, from a JSON array or a comma-separated list. |
| `allow undeclared properties [ALLOW]` | `additionalProperties`; left out, undeclared properties are accepted. |

`minItems` and `maxItems` describe an array property itself; the other limits describe each of its
items, so `array of number` with `limit minimum to 0` requires every item to be at least 0. An
`allowed values` list must match the property's declared type.

### Schema diagnostics

A schema that cannot be read is reported with the sprite and block that holds it, and is left
undefined; `schema [NAME] defined?` then reports false and other schemas keep working. Duplicate
property names, duplicate `name@version` pairs, a limit or an allowed-values list with no property
above it, a block that does not belong in the stack, an unknown schema name, and a reference cycle
are all definition errors. A name with several versions and no pinned version is ambiguous rather
than guessed, and an unknown version fails instead of falling back to a different one.

Editor block mutation and a nested-schema editing UX remain separate work; nesting is expressed
today by referring to another named schema.

### Schema identity with named data

Named-data carries only a structured value's `{id, version}` schema identity; IDs must match
`^[a-z][a-z0-9.-]{0,127}$` and versions must be complete SemVer values. The consumer owns the
schema catalog. Resolve the exact identity before validating the returned JSON value with
`validateAgainstSchema`. An unknown ID or version must fail explicitly, with no fallback to a
different version. Within this package, `define schema` names follow the same `name@version`
identity and the same complete-SemVer rule, and function arguments and returns use the canonical
JSON Schema those names and the text form both produce. Its supported subset is `type`,
`properties`, `required`,
`additionalProperties` (boolean), `items`, `enum`, `const`, `minimum`, `maximum`, `minLength`,
`maxLength`, `minItems`, and `maxItems`; other keywords do not add validation behavior.

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
| `schemas()` | `define schema` hats lowered to canonical JSON Schema, with their definition errors |
| `call(name, args, {caller, exportedOnly})` | Validate arguments, run the function, and resolve with its return value |
| `start(...)` / `await(ref)` / `awaitAll(refs)` / `isSettled(ref)` | Asynchronous calls through `{"$promise": id}` references |
| `matchHat` / `argumentsFor` / `returnFrom` | Bridge from the consumer's blocks |
| `cancelAll(reason)` / `release()` | Fail pending calls; `release` also detaches runtime listeners |

The visual schema builder is opt-in. A consumer that owns schema blocks of its own passes their
opcodes as `schemaBlockOpcodes`, and `args schema` and `returns schema` then accept a schema name
as well as JSON text. Left out, those inputs accept JSON text only, exactly as before.

```ts
const functions = createNamedFunctions({
  runtime: Scratch.vm.runtime,
  functionHatOpcode: 'myextension_defineFunction',
  schemaBlockOpcodes: {
    hat: 'myextension_defineSchema',
    property: 'myextension_schemaProperty',
    propertySchema: 'myextension_schemaPropertySchema',
    propertyArraySchema: 'myextension_schemaPropertyArraySchema',
    constraint: 'myextension_schemaConstraint',
    allowedValues: 'myextension_schemaAllowedValues',
    additionalProperties: 'myextension_schemaAdditionalProperties'
  }
});
```

`scanSchemaDefinitions(targets, opcodes)` and `resolveSchemaReference(schemas, name, label)` are
exported for consumers that resolve schemas themselves, and `scanFunctionDefinitions` takes a
`resolveSchema` callback for any other schema catalog.

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

## Fixed-input editing form

When the shared editor's `blockEditorFixedInputs` startup flag and Dialogs are both ON in the GUI, only the `EXPORT` input of `defineFunction` is registered as a fixed-input form. An older GUI, or a GUI with the flag OFF, registers nothing extra. The canonical Schema is `schemas/block-editor-fixed-inputs.schema.json#/$defs/defineFunction/properties/EXPORT`; the codec and registration live in `src/fixed-input-editors.ts`. Existing raw values, unchanged aliases, and unknown enum values are not rewritten by a save without edits, and reporters are not evaluated. Only explicit changes are validated, and other arguments, block declarations, and the saved format are left unchanged.

The hat's inline EXPORT dropdown stores `none` or `tool`. The form does not edit or run NAME, DESCRIPTION, SCHEMA, or RETURNS, and its validation never scans functions, starts hats, or publishes tools.

Registration is limited to the optional API (`apiVersion: 1`) and is removed on `RUNTIME_DISPOSED` or an explicit dispose. Turning the startup flag OFF and reloading restores the previous path. To roll back the dependency, restore the manifest, the lockfile, and the actual resolution together. This does not include npm publishing or the dynamic candidates planned for later stages.

The contract described by the Schema is grounded in the real `getInfo` declarations and the existing pure runtime conversion. The SchemaBundle `retrievalUri` identifies this local document only; it does not mean the Schema is served from that URL or that `$ref`s are resolved over HTTP. The Schema compiles from the bundled documents alone.

Registration uses the optional editor API available when the extension instance is constructed. Adding or replacing that API later is not followed automatically; reload the GUI and reconstruct the extension instance after changing the startup configuration.
