// Name: TurboWarp-Named-Functions
// ID: kubohiroyanamedfunctions
// Description: Named JSON functions that scripts can call by name, synchronously or asynchronously.
// By: Hiroya Kubo
// License: MPL-2.0

(function (Scratch) {
  'use strict';

  //#region src/config.ts
  var extensionConfig = {
  	id: "kubohiroyanamedfunctions",
  	slug: "turbowarp-named-functions",
  	name: "TurboWarp-Named-Functions",
  	description: "Named JSON functions that scripts can call by name, synchronously or asynchronously.",
  	author: "Hiroya Kubo",
  	license: "MPL-2.0",
  	unsandboxed: true,
  	docsURI: "https://kubohiroya.github.io/turbowarp-named-functions/",
  	blockIconURI: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCI+PHJlY3QgeD0iNCIgeT0iOCIgd2lkdGg9IjQwIiBoZWlnaHQ9IjMyIiByeD0iNiIgZmlsbD0iIzhBNTVENyIvPjx0ZXh0IHg9IjI0IiB5PSIzMSIgZm9udC1mYW1pbHk9Im1vbm9zcGFjZSIgZm9udC1zaXplPSIxNiIgZm9udC13ZWlnaHQ9ImJvbGQiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiNmZmYiPmYoeCk8L3RleHQ+PC9zdmc+"
  };
  var block_editor_fixed_inputs_schema_default = {
  	$schema: "https://json-schema.org/draft/2020-12/schema",
  	$id: "https://kubohiroya.github.io/turbowarp-named-functions/schemas/block-editor-fixed-inputs.schema.json",
  	$defs: { "defineFunction": {
  		"type": "object",
  		"properties": { "EXPORT": {
  			"type": "string",
  			"enum": ["none", "tool"]
  		} },
  		"required": ["EXPORT"],
  		"additionalProperties": true
  	} }
  };
  //#endregion
  //#region src/fixed-input-schema.ts
  var source = {
  	repository: "turbowarp-named-functions",
  	path: "schemas/block-editor-fixed-inputs.schema.json",
  	symbol: "#/$defs/defineFunction/properties/EXPORT"
  };
  /** The on-disk owner Schema is canonical; this is its single-field projection. */
  var fixedInputSchemaBundle = {
  	identity: {
  		ownerId: "turbowarp-named-functions",
  		contractId: "defineFunction.EXPORT",
  		revision: "fixed-inputs-v1",
  		variantId: "default"
  	},
  	dialect: "2020-12",
  	root: {
  		retrievalUri: "https://kubohiroya.github.io/turbowarp-named-functions/schemas/defineFunction-EXPORT.schema.json",
  		document: block_editor_fixed_inputs_schema_default.$defs.defineFunction.properties.EXPORT,
  		artifact: {
  			role: "canonical-schema",
  			source
  		}
  	},
  	resources: [],
  	provenance: {
  		canonicalSources: [source, {
  			repository: "turbowarp-named-functions",
  			path: "src/function-registry.ts",
  			symbol: "readDefinition"
  		}],
  		generatedFiles: [{
  			repository: "turbowarp-named-functions",
  			path: "site/schemas/block-editor-fixed-inputs.schema.json"
  		}],
  		referenceSchemas: [],
  		generationSources: [{
  			repository: "turbowarp-named-functions",
  			path: "scripts/generate-fixed-input-docs.mjs"
  		}]
  	}
  };
  //#endregion
  //#region src/fixed-input-editors.ts
  var choices = ["none", "tool"];
  var fixedInputEditorDefinitions = [{
  	apiVersion: 1,
  	extensionId: extensionConfig.id,
  	editorId: "defineFunction-fixed-inputs",
  	opcodes: [`${extensionConfig.id}_defineFunction`],
  	contractId: "turbowarp-named-functions:defineFunction.EXPORT",
  	contractRevision: "fixed-inputs-v1",
  	bindings: [{
  		argument: "EXPORT",
  		schemaBundle: fixedInputSchemaBundle,
  		control: {
  			kind: "enum",
  			label: "EXPORT",
  			choices: [{
  				"value": "none",
  				"label": "none"
  			}, {
  				"value": "tool",
  				"label": "tool"
  			}]
  		},
  		read(value) {
  			if (typeof value !== "string") throw new TypeError("Expected a literal export mode.");
  			return value;
  		},
  		encode(value) {
  			if (typeof value !== "string" || !choices.includes(value)) throw new TypeError("Unsupported export mode.");
  			return value;
  		},
  		validateCandidate(value) {
  			return typeof value === "string" && choices.includes(value) ? [] : [{
  				path: "/inputs/EXPORT",
  				message: "Unsupported export mode."
  			}];
  		}
  	}],
  	validationContext: () => ({
  		consumerId: extensionConfig.id,
  		nowMs: Date.now(),
  		settings: null
  	})
  }];
  /** Register metadata only; the GUI startup capability owns editor activation. */
  function registerFixedInputEditors(scratch, definitions, runtimeOverride) {
  	const host = scratch;
  	const api = host.gui?.blockEditors;
  	if (!definitions.length || api?.apiVersion !== 1 || typeof api.registerFixedInputEditor !== "function") return () => {};
  	const runtime = runtimeOverride ?? host.vm?.runtime;
  	const removers = [];
  	let active = true;
  	const dispose = () => {
  		if (!active) return;
  		active = false;
  		runtime?.off?.("RUNTIME_DISPOSED", dispose);
  		for (const remove of removers.splice(0).reverse()) remove();
  	};
  	try {
  		for (const definition of definitions) {
  			const remove = api.registerFixedInputEditor.call(api, definition);
  			if (typeof remove !== "function") throw new TypeError("Invalid fixed input registration disposer.");
  			removers.push(remove);
  		}
  		runtime?.on?.("RUNTIME_DISPOSED", dispose);
  	} catch (error) {
  		dispose();
  		throw error;
  	}
  	return dispose;
  }
  var block_definitions_default = {
  	extensionName: "Named Functions",
  	blocks: [
  		{
  			"opcode": "defineFunction",
  			"blockType": "HAT",
  			"text": "define function [NAME] description [DESCRIPTION] args schema [SCHEMA] returns schema [RETURNS] export as [EXPORT]",
  			"description": "Defines a named function. NAME, DESCRIPTION, and SCHEMA must be literal text. SCHEMA and RETURNS each take JSON Schema text or the name of a `define schema` hat, optionally pinned as Name@1.0.0. RETURNS is optional; leave it blank to disable return validation.",
  			"descriptionJa": "名前を持つ関数を定義します。NAME、DESCRIPTION、SCHEMAには文字列を直接書く必要があります。SCHEMAとRETURNSには、JSON Schema文字列、または`define schema`ハットの名前（Name@1.0.0の形でバージョン固定も可）を書けます。RETURNSは任意で、空欄なら戻り値を検証しません。",
  			"arguments": {
  				"NAME": {
  					"type": "STRING",
  					"defaultValue": "add"
  				},
  				"DESCRIPTION": {
  					"type": "STRING",
  					"defaultValue": "Adds two numbers."
  				},
  				"SCHEMA": {
  					"type": "STRING",
  					"defaultValue": "{\"type\":\"object\",\"properties\":{\"a\":{\"type\":\"number\"},\"b\":{\"type\":\"number\"}},\"required\":[\"a\",\"b\"]}"
  				},
  				"RETURNS": {
  					"type": "STRING",
  					"defaultValue": ""
  				},
  				"EXPORT": {
  					"type": "STRING",
  					"defaultValue": "none",
  					"menu": "exportModes"
  				}
  			}
  		},
  		{
  			"opcode": "defineSchema",
  			"blockType": "HAT",
  			"text": "define schema [NAME] version [VERSION]",
  			"description": "Declares a named JSON Schema from the property blocks stacked under it. NAME and VERSION must be literal text, and VERSION must be a complete SemVer value. The stack is read as a declaration and never run; the result is the same canonical JSON Schema that schema text produces.",
  			"descriptionJa": "下に積まれたpropertyブロックから、名前付きJSON Schemaを宣言します。NAMEとVERSIONには文字列を直接書く必要があり、VERSIONは完全なSemVer値でなければなりません。この積み木は宣言として読まれるだけで実行されず、結果はSchema文字列と同じcanonical JSON Schemaになります。",
  			"arguments": {
  				"NAME": {
  					"type": "STRING",
  					"defaultValue": "Player"
  				},
  				"VERSION": {
  					"type": "STRING",
  					"defaultValue": "1.0.0"
  				}
  			}
  		},
  		{
  			"opcode": "schemaProperty",
  			"blockType": "COMMAND",
  			"text": "property [NAME] type [TYPE] [PRESENCE]",
  			"description": "Inside a `define schema` stack, declares one property of the schema.",
  			"descriptionJa": "`define schema`の積み木の中で、Schemaのプロパティを1つ宣言します。",
  			"arguments": {
  				"NAME": {
  					"type": "STRING",
  					"defaultValue": "name"
  				},
  				"TYPE": {
  					"type": "STRING",
  					"defaultValue": "string",
  					"menu": "propertyTypes"
  				},
  				"PRESENCE": {
  					"type": "STRING",
  					"defaultValue": "required",
  					"menu": "presenceModes"
  				}
  			}
  		},
  		{
  			"opcode": "schemaPropertySchema",
  			"blockType": "COMMAND",
  			"text": "property [NAME] schema [SCHEMA] [PRESENCE]",
  			"description": "Declares a property whose value follows another named schema. SCHEMA is a `define schema` name, optionally pinned as Name@1.0.0.",
  			"descriptionJa": "別の名前付きSchemaに従う値を持つプロパティを宣言します。SCHEMAには`define schema`の名前を書き、Name@1.0.0の形でバージョンを固定できます。",
  			"arguments": {
  				"NAME": {
  					"type": "STRING",
  					"defaultValue": "profile"
  				},
  				"SCHEMA": {
  					"type": "STRING",
  					"defaultValue": "Profile"
  				},
  				"PRESENCE": {
  					"type": "STRING",
  					"defaultValue": "required",
  					"menu": "presenceModes"
  				}
  			}
  		},
  		{
  			"opcode": "schemaPropertyArraySchema",
  			"blockType": "COMMAND",
  			"text": "property [NAME] array of schema [SCHEMA] [PRESENCE]",
  			"description": "Declares a property holding an array whose items follow another named schema.",
  			"descriptionJa": "項目が別の名前付きSchemaに従う配列を持つプロパティを宣言します。",
  			"arguments": {
  				"NAME": {
  					"type": "STRING",
  					"defaultValue": "items"
  				},
  				"SCHEMA": {
  					"type": "STRING",
  					"defaultValue": "Item"
  				},
  				"PRESENCE": {
  					"type": "STRING",
  					"defaultValue": "optional",
  					"menu": "presenceModes"
  				}
  			}
  		},
  		{
  			"opcode": "schemaConstraint",
  			"blockType": "COMMAND",
  			"text": "limit [KEYWORD] to [VALUE]",
  			"description": "Adds a limit to the property declared just above. `minItems` and `maxItems` apply to an array property itself; the other limits apply to each of its items.",
  			"descriptionJa": "すぐ上で宣言したプロパティに制約を加えます。`minItems`と`maxItems`は配列そのものに、その他の制約は配列の各項目に適用されます。",
  			"arguments": {
  				"KEYWORD": {
  					"type": "STRING",
  					"defaultValue": "minimum",
  					"menu": "constraintKeywords"
  				},
  				"VALUE": {
  					"type": "NUMBER",
  					"defaultValue": "0"
  				}
  			}
  		},
  		{
  			"opcode": "schemaAllowedValues",
  			"blockType": "COMMAND",
  			"text": "allowed values [VALUES]",
  			"description": "Restricts the property declared just above to an enum. VALUES is a JSON array, or a comma-separated list of strings.",
  			"descriptionJa": "すぐ上で宣言したプロパティの値をenumに制限します。VALUESにはJSON配列、またはカンマ区切りの文字列を書きます。",
  			"arguments": { "VALUES": {
  				"type": "STRING",
  				"defaultValue": "red, green, blue"
  			} }
  		},
  		{
  			"opcode": "schemaAdditionalProperties",
  			"blockType": "COMMAND",
  			"text": "allow undeclared properties [ALLOW]",
  			"description": "Sets whether the schema accepts properties it does not declare. Left out, undeclared properties are accepted, as in JSON Schema.",
  			"descriptionJa": "宣言していないプロパティをSchemaが受け入れるかどうかを設定します。省略した場合は、JSON Schemaと同じく受け入れます。",
  			"arguments": { "ALLOW": {
  				"type": "STRING",
  				"defaultValue": "no",
  				"menu": "allowModes"
  			} }
  		},
  		{
  			"opcode": "schemaJson",
  			"blockType": "REPORTER",
  			"text": "schema [NAME] JSON",
  			"description": "Reports the canonical JSON Schema a `define schema` hat lowers to, or an empty string if it is unknown or invalid.",
  			"descriptionJa": "`define schema`ハットが変換されたcanonical JSON Schemaを返します。未定義または不正な場合は空文字列を返します。",
  			"arguments": { "NAME": {
  				"type": "STRING",
  				"defaultValue": "Player"
  			} }
  		},
  		{
  			"opcode": "isSchemaDefined",
  			"blockType": "BOOLEAN",
  			"text": "schema [NAME] defined?",
  			"description": "True when a valid `define schema` hat has that name. A name may be pinned as Name@1.0.0.",
  			"descriptionJa": "その名前の正しい`define schema`ハットがあればtrueを返します。Name@1.0.0の形でバージョンを固定できます。",
  			"arguments": { "NAME": {
  				"type": "STRING",
  				"defaultValue": "Player"
  			} }
  		},
  		{
  			"opcode": "functionArgument",
  			"blockType": "REPORTER",
  			"text": "function argument [PATH]",
  			"description": "Inside a function, reports the argument at a dotted path such as a or items.0.name.",
  			"descriptionJa": "関数の中で、aやitems.0.nameのようなドット区切りのパスにある引数を返します。",
  			"arguments": { "PATH": {
  				"type": "STRING",
  				"defaultValue": "a"
  			} }
  		},
  		{
  			"opcode": "functionArgumentsJson",
  			"blockType": "REPORTER",
  			"text": "function arguments JSON",
  			"description": "Inside a function, reports all arguments as JSON text.",
  			"descriptionJa": "関数の中で、すべての引数をJSONテキストとして返します。",
  			"arguments": {}
  		},
  		{
  			"opcode": "returnValue",
  			"blockType": "COMMAND",
  			"text": "return [VALUE]",
  			"description": "Inside a function, returns a value and ends the script. JSON text is returned as JSON; other text is returned as a string.",
  			"descriptionJa": "関数の中で値を返し、スクリプトを終了します。JSONテキストはJSONとして、それ以外のテキストは文字列として返します。",
  			"arguments": { "VALUE": {
  				"type": "STRING",
  				"defaultValue": "0"
  			} }
  		},
  		{
  			"opcode": "callFunction",
  			"blockType": "REPORTER",
  			"text": "call function [NAME] with [ARGS]",
  			"description": "Calls a function and waits for its result. ARGS is JSON text and is checked against the args schema. Takes at least one frame.",
  			"descriptionJa": "関数を呼び出し、結果を待って返します。ARGSはJSONテキストで、args schemaで検査されます。少なくとも1フレームかかります。",
  			"arguments": {
  				"NAME": {
  					"type": "STRING",
  					"defaultValue": "add"
  				},
  				"ARGS": {
  					"type": "STRING",
  					"defaultValue": "{\"a\":1,\"b\":2}"
  				}
  			}
  		},
  		{
  			"opcode": "startFunction",
  			"blockType": "REPORTER",
  			"text": "start function [NAME] with [ARGS]",
  			"description": "Starts a function without waiting and reports a promise reference as JSON text.",
  			"descriptionJa": "関数を待たずに開始し、Promiseへの参照をJSONテキストで返します。",
  			"arguments": {
  				"NAME": {
  					"type": "STRING",
  					"defaultValue": "add"
  				},
  				"ARGS": {
  					"type": "STRING",
  					"defaultValue": "{\"a\":1,\"b\":2}"
  				}
  			}
  		},
  		{
  			"opcode": "awaitResult",
  			"blockType": "REPORTER",
  			"text": "await [PROMISE]",
  			"description": "Waits for a promise reference from start function and reports its result.",
  			"descriptionJa": "start functionが返したPromiseへの参照を待ち、その結果を返します。",
  			"arguments": { "PROMISE": {
  				"type": "STRING",
  				"defaultValue": "{\"$promise\":\"p_1\"}"
  			} }
  		},
  		{
  			"opcode": "awaitAll",
  			"blockType": "REPORTER",
  			"text": "await all [PROMISES]",
  			"description": "Waits for a JSON array of promise references and reports a JSON array of results. Failed calls become {\"$error\": message}.",
  			"descriptionJa": "Promiseへの参照のJSON配列をすべて待ち、結果のJSON配列を返します。失敗した呼び出しは{\"$error\": メッセージ}になります。",
  			"arguments": { "PROMISES": {
  				"type": "STRING",
  				"defaultValue": "[]"
  			} }
  		},
  		{
  			"opcode": "isSettled",
  			"blockType": "BOOLEAN",
  			"text": "[PROMISE] settled?",
  			"description": "Reports whether a started function has finished, without waiting.",
  			"descriptionJa": "開始した関数が終わったかを、待たずに返します。",
  			"arguments": { "PROMISE": {
  				"type": "STRING",
  				"defaultValue": "{\"$promise\":\"p_1\"}"
  			} }
  		},
  		{
  			"opcode": "isDefined",
  			"blockType": "BOOLEAN",
  			"text": "function [NAME] defined?",
  			"description": "Reports whether a valid define function hat with this name exists.",
  			"descriptionJa": "この名前の正しいdefine functionハットがあるかを返します。",
  			"arguments": { "NAME": {
  				"type": "STRING",
  				"defaultValue": "add"
  			} }
  		},
  		{
  			"opcode": "lastError",
  			"blockType": "REPORTER",
  			"text": "last function error",
  			"description": "Reports the most recent function error, or an empty string.",
  			"descriptionJa": "直近の関数のエラーを返します。エラーがなければ空文字列を返します。",
  			"arguments": {}
  		}
  	],
  	menus: {
  		"exportModes": {
  			"acceptReporters": false,
  			"items": ["none", "tool"]
  		},
  		"propertyTypes": {
  			"acceptReporters": false,
  			"items": [
  				"string",
  				"number",
  				"integer",
  				"boolean",
  				"null",
  				"object",
  				"array",
  				"array of string",
  				"array of number",
  				"array of integer",
  				"array of boolean",
  				"array of object"
  			]
  		},
  		"presenceModes": {
  			"acceptReporters": false,
  			"items": ["required", "optional"]
  		},
  		"constraintKeywords": {
  			"acceptReporters": false,
  			"items": [
  				"minimum",
  				"maximum",
  				"minLength",
  				"maxLength",
  				"minItems",
  				"maxItems"
  			]
  		},
  		"allowModes": {
  			"acceptReporters": false,
  			"items": ["no", "yes"]
  		}
  	}
  };
  //#endregion
  //#region src/schema-validator.ts
  /**
  * A small JSON Schema validator for function arguments and returns. It interprets the schema at run time and
  * never generates code, so it also works where `eval` is unavailable (for example Cloudflare Workers).
  *
  * Supported keywords: type, properties, required, additionalProperties (boolean), items, enum,
  * const, minimum, maximum, minLength, maxLength, minItems, maxItems. Other keywords, such as
  * description and title, are ignored.
  */
  function validateAgainstSchema(value, schema, path = "$") {
  	const rule = asRecord(schema);
  	if (!rule) throw new Error(`${path} must be a JSON Schema object`);
  	assertSchemaNode(rule, path);
  	return validateValue(value, rule, path);
  }
  /** Reject malformed schemas before a function definition or call can use them. */
  function validateSchemaDefinition(schema, label = "schema") {
  	const rule = asRecord(schema);
  	if (!rule) throw new Error(`${label} must be a JSON object`);
  	assertSchemaNode(rule, label);
  }
  function validateValue(value, rule, path) {
  	const errors = [];
  	if (rule.type !== void 0) {
  		const types = Array.isArray(rule.type) ? rule.type : [rule.type];
  		if (!types.some((type) => matchesType(value, type))) return [`${path} must be ${types.join(" or ")}`];
  	}
  	if (Array.isArray(rule.enum) && !rule.enum.some((candidate) => deepEqual(candidate, value))) errors.push(`${path} must be one of ${rule.enum.map((item) => JSON.stringify(item)).join(", ")}`);
  	if ("const" in rule && !deepEqual(rule.const, value)) errors.push(`${path} must be ${JSON.stringify(rule.const)}`);
  	if (typeof value === "number") {
  		if (typeof rule.minimum === "number" && value < rule.minimum) errors.push(`${path} must be >= ${rule.minimum}`);
  		if (typeof rule.maximum === "number" && value > rule.maximum) errors.push(`${path} must be <= ${rule.maximum}`);
  	}
  	if (typeof value === "string") {
  		const length = [...value].length;
  		if (typeof rule.minLength === "number" && length < rule.minLength) errors.push(`${path} must have at least ${rule.minLength} characters`);
  		if (typeof rule.maxLength === "number" && length > rule.maxLength) errors.push(`${path} must have at most ${rule.maxLength} characters`);
  	}
  	if (Array.isArray(value)) {
  		if (typeof rule.minItems === "number" && value.length < rule.minItems) errors.push(`${path} must have at least ${rule.minItems} items`);
  		if (typeof rule.maxItems === "number" && value.length > rule.maxItems) errors.push(`${path} must have at most ${rule.maxItems} items`);
  		if (rule.items !== void 0) value.forEach((item, index) => errors.push(...validateValue(item, rule.items, `${path}[${index}]`)));
  	}
  	const object = asRecord(value);
  	if (object) {
  		const properties = asRecord(rule.properties) ?? {};
  		if (Array.isArray(rule.required)) {
  			for (const name of rule.required) if (typeof name === "string" && !Object.hasOwn(object, name)) errors.push(`${path}.${name} is required`);
  		}
  		for (const [name, child] of Object.entries(object)) if (Object.hasOwn(properties, name)) errors.push(...validateValue(child, properties[name], `${path}.${name}`));
  		else if (rule.additionalProperties === false) errors.push(`${path}.${name} is not allowed`);
  	}
  	return errors;
  }
  function assertSchemaNode(rule, path) {
  	const validTypes = /* @__PURE__ */ new Set([
  		"object",
  		"array",
  		"string",
  		"number",
  		"integer",
  		"boolean",
  		"null"
  	]);
  	if (rule.type !== void 0) {
  		const types = Array.isArray(rule.type) ? rule.type : [rule.type];
  		if (types.length === 0 || types.some((type) => typeof type !== "string" || !validTypes.has(type))) throw new Error(`${path}.type must be a supported JSON Schema type or non-empty type array`);
  	}
  	if (rule.properties !== void 0) {
  		const properties = asRecord(rule.properties);
  		if (!properties) throw new Error(`${path}.properties must be an object`);
  		for (const [name, child] of Object.entries(properties)) {
  			const childRule = asRecord(child);
  			if (!childRule) throw new Error(`${path}.properties.${name} must be a JSON Schema object`);
  			assertSchemaNode(childRule, `${path}.properties.${name}`);
  		}
  	}
  	if (rule.required !== void 0 && (!Array.isArray(rule.required) || rule.required.some((name) => typeof name !== "string"))) throw new Error(`${path}.required must be an array of strings`);
  	if (rule.additionalProperties !== void 0 && typeof rule.additionalProperties !== "boolean") throw new Error(`${path}.additionalProperties must be a boolean`);
  	if (rule.items !== void 0) {
  		const items = asRecord(rule.items);
  		if (!items) throw new Error(`${path}.items must be a JSON Schema object`);
  		assertSchemaNode(items, `${path}.items`);
  	}
  	if (rule.enum !== void 0 && (!Array.isArray(rule.enum) || rule.enum.length === 0)) throw new Error(`${path}.enum must be a non-empty array`);
  	for (const keyword of ["minimum", "maximum"]) if (rule[keyword] !== void 0 && (typeof rule[keyword] !== "number" || !Number.isFinite(rule[keyword]))) throw new Error(`${path}.${keyword} must be a finite number`);
  	for (const keyword of [
  		"minLength",
  		"maxLength",
  		"minItems",
  		"maxItems"
  	]) {
  		const value = rule[keyword];
  		if (value !== void 0 && (typeof value !== "number" || !Number.isInteger(value) || value < 0)) throw new Error(`${path}.${keyword} must be a non-negative integer`);
  	}
  	if (typeof rule.minimum === "number" && typeof rule.maximum === "number" && rule.minimum > rule.maximum) throw new Error(`${path}.minimum cannot exceed maximum`);
  	if (typeof rule.minLength === "number" && typeof rule.maxLength === "number" && rule.minLength > rule.maxLength) throw new Error(`${path}.minLength cannot exceed maxLength`);
  	if (typeof rule.minItems === "number" && typeof rule.maxItems === "number" && rule.minItems > rule.maxItems) throw new Error(`${path}.minItems cannot exceed maxItems`);
  }
  function matchesType(value, type) {
  	switch (type) {
  		case "object": return asRecord(value) !== null;
  		case "array": return Array.isArray(value);
  		case "string": return typeof value === "string";
  		case "number": return typeof value === "number" && Number.isFinite(value);
  		case "integer": return typeof value === "number" && Number.isInteger(value);
  		case "boolean": return typeof value === "boolean";
  		case "null": return value === null;
  		default: return false;
  	}
  }
  function deepEqual(left, right) {
  	return JSON.stringify(left) === JSON.stringify(right);
  }
  function asRecord(value) {
  	return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
  }
  var FunctionDispatcher = class {
  	constructor(runtime, options) {
  		this.runtime = runtime;
  		this.options = options;
  		this.queue = [];
  		this.running = /* @__PURE__ */ new Map();
  		this.byThread = /* @__PURE__ */ new Map();
  		this.starting = null;
  		this.step = 0;
  		this.onAfterExecute = () => this.afterStep();
  		this.onStopAll = () => this.cancelAll("The project was stopped.");
  		this.timeoutMs = options.timeoutMs ?? 3e4;
  		this.setTimer = options.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
  		this.clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle));
  		runtime.on("AFTER_EXECUTE", this.onAfterExecute);
  		runtime.on("PROJECT_STOP_ALL", this.onStopAll);
  	}
  	/**
  	* Starts a named function. `caller` is the thread of the block making the call, if any; it is used
  	* to detect reentrant calls.
  	*/
  	invoke(name, args, caller, returnSchema) {
  		if (!this.options.knownNames().has(name)) return Promise.reject(/* @__PURE__ */ new Error(`Unknown function: ${name}`));
  		const parentChain = caller ? this.byThread.get(caller)?.chain ?? [] : [];
  		if (parentChain.includes(name)) return Promise.reject(/* @__PURE__ */ new Error(`Reentrant call: ${[...parentChain, name].join(" -> ")}. Use a custom block for recursion.`));
  		return new Promise((resolve, reject) => {
  			const invocation = {
  				name,
  				args,
  				...returnSchema === void 0 ? {} : { returnSchema },
  				chain: [...parentChain, name],
  				resolve,
  				reject,
  				thread: null,
  				startedAtStep: -1,
  				timer: null,
  				settled: false
  			};
  			invocation.timer = this.setTimer(() => this.settle(invocation, /* @__PURE__ */ new Error(`Function ${name} timed out.`)), this.timeoutMs);
  			this.queue.push(invocation);
  			this.pump();
  		});
  	}
  	/** Hat predicate: true only for the script that should run the invocation being started. */
  	matchHat(name, thread) {
  		const invocation = this.starting;
  		if (!invocation || !thread || invocation.name !== name.trim()) return false;
  		invocation.thread = thread;
  		this.byThread.set(thread, invocation);
  		this.starting = null;
  		return true;
  	}
  	argumentsFor(thread) {
  		const invocation = thread ? this.byThread.get(thread) : void 0;
  		if (!invocation) throw new Error("This block can only be used inside a running function.");
  		return invocation.args;
  	}
  	returnFrom(thread, value) {
  		const invocation = thread ? this.byThread.get(thread) : void 0;
  		if (!invocation) throw new Error("return can only be used inside a running function.");
  		this.settleWithValue(invocation, value);
  	}
  	cancelAll(reason) {
  		for (const invocation of [...this.queue, ...this.running.values()]) this.settle(invocation, new Error(reason));
  		if (this.starting) this.settle(this.starting, new Error(reason));
  	}
  	get pendingCount() {
  		return this.queue.length + this.running.size;
  	}
  	release() {
  		this.cancelAll("Named functions were released.");
  		this.runtime.off?.("AFTER_EXECUTE", this.onAfterExecute);
  		this.runtime.off?.("PROJECT_STOP_ALL", this.onStopAll);
  	}
  	pump() {
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
  	afterStep() {
  		this.step += 1;
  		const starting = this.starting;
  		if (starting && this.step - starting.startedAtStep > 2) this.settle(starting, /* @__PURE__ */ new Error(`Function ${starting.name} did not start. Is its script already running?`));
  		for (const invocation of this.running.values()) if (invocation.thread && !this.runtime.threads.includes(invocation.thread)) this.settleWithValue(invocation, null);
  		this.pump();
  	}
  	settle(invocation, error, value) {
  		if (invocation.settled) return;
  		invocation.settled = true;
  		this.clearTimer(invocation.timer);
  		const queued = this.queue.indexOf(invocation);
  		if (queued >= 0) this.queue.splice(queued, 1);
  		if (this.running.get(invocation.name) === invocation) this.running.delete(invocation.name);
  		if (invocation.thread) this.byThread.delete(invocation.thread);
  		if (this.starting === invocation) this.starting = null;
  		if (error) invocation.reject(error);
  		else invocation.resolve(value);
  	}
  	settleWithValue(invocation, value) {
  		if (invocation.returnSchema !== void 0) {
  			const errors = validateAgainstSchema(value, invocation.returnSchema);
  			if (errors.length > 0) {
  				this.settle(invocation, /* @__PURE__ */ new Error(`Invalid return value for ${invocation.name}: ${errors.join("; ")}`));
  				return;
  			}
  		}
  		this.settle(invocation, null, value);
  	}
  };
  /** Resolves a dotted path such as `items.0.name` inside parsed JSON arguments. */
  function readArgumentPath(args, path) {
  	const trimmed = path.trim();
  	if (trimmed.length === 0) return args;
  	let current = args;
  	for (const segment of trimmed.split(".")) {
  		if (current === null || typeof current !== "object") return void 0;
  		current = current[segment];
  	}
  	return current;
  }
  /** Converts a value for a Scratch reporter: objects and arrays become JSON text. */
  function toScratchValue(value) {
  	if (value === void 0 || value === null) return "";
  	if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  	return JSON.stringify(value);
  }
  /** Parses block text: JSON text becomes JSON, anything else stays a string. */
  function parseJsonOrText(text) {
  	const trimmed = text.trim();
  	if (trimmed.length === 0) return "";
  	try {
  		return JSON.parse(trimmed);
  	} catch {
  		return text;
  	}
  }
  //#endregion
  //#region src/block-literals.ts
  function readLiteralInput(block, blocks, inputName) {
  	const input = block.inputs?.[inputName];
  	if (!input) throw new Error(`${inputName} is missing`);
  	if (input.block && input.block !== input.shadow) throw new Error(`${inputName} must be literal text, not a reporter block`);
  	const shadowId = input.shadow ?? input.block;
  	const shadow = shadowId ? blocks[shadowId] : void 0;
  	const field = shadow?.fields ? Object.values(shadow.fields)[0] : void 0;
  	if (!field) throw new Error(`${inputName} is missing`);
  	return String(field.value ?? "");
  }
  function readOptionalLiteralInput(block, blocks, inputName) {
  	if (!block.inputs?.[inputName]) return void 0;
  	return readLiteralInput(block, blocks, inputName);
  }
  /** Reads a dropdown that does not accept reporters; the VM stores it as a field on the block. */
  function readMenuField(block, fieldName) {
  	const field = block.fields?.[fieldName];
  	if (!field) throw new Error(`${fieldName} is missing`);
  	return String(field.value ?? "");
  }
  /**
  * The blocks stacked under `block`, in order. Shadow blocks are skipped, and a `next` chain that
  * loops or leaves the container stops the walk instead of hanging.
  */
  function stackBelow(block, blocks) {
  	const stack = [];
  	const seen = /* @__PURE__ */ new Set([block.id]);
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
  //#endregion
  //#region src/function-registry.ts
  var FUNCTION_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/u;
  var MAX_DESCRIPTION_LENGTH = 1024;
  /**
  * Reads every `define function` hat in the project. NAME, DESCRIPTION, and SCHEMA are part of the
  * tool contract sent to the model before any script runs, so they must be literal text.
  */
  function scanFunctionDefinitions(targets, hatOpcode, options = {}) {
  	const functions = [];
  	const errors = [];
  	const seen = /* @__PURE__ */ new Map();
  	for (const target of targets) {
  		if (target.isOriginal === false) continue;
  		const targetName = target.getName?.() ?? (target.isStage ? "Stage" : "sprite");
  		const blocks = target.blocks._blocks;
  		for (const block of Object.values(blocks)) {
  			if (block.opcode !== hatOpcode || block.topLevel === false) continue;
  			const where = `${targetName} (block ${block.id})`;
  			try {
  				const definition = readDefinition(block, blocks, targetName, options);
  				const previous = seen.get(definition.name);
  				if (previous !== void 0) throw new Error(`function "${definition.name}" is already defined in ${previous}`);
  				seen.set(definition.name, where);
  				functions.push(definition);
  			} catch (error) {
  				errors.push(`${where}: ${error instanceof Error ? error.message : String(error)}`);
  			}
  		}
  	}
  	functions.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
  	return {
  		functions,
  		errors
  	};
  }
  function toFunctionTools(functions) {
  	return functions.filter((definition) => definition.exportAs === "tool").map((definition) => ({
  		type: "function",
  		name: definition.name,
  		description: definition.description,
  		parameters: definition.parameters
  	}));
  }
  function readDefinition(block, blocks, targetName, options) {
  	const name = readLiteralInput(block, blocks, "NAME").trim();
  	if (!FUNCTION_NAME_PATTERN.test(name)) throw new Error("function name must be 1-64 letters, digits, \"_\" or \"-\"");
  	const description = readLiteralInput(block, blocks, "DESCRIPTION").trim();
  	if (description.length > 1024) throw new Error(`description must be at most ${MAX_DESCRIPTION_LENGTH} characters`);
  	const parameters = parseSchema(readLiteralInput(block, blocks, "SCHEMA"), "args schema", true, options);
  	const returnsText = readOptionalLiteralInput(block, blocks, "RETURNS");
  	const returns = returnsText === void 0 || returnsText.trim() === "" ? void 0 : parseSchema(returnsText, "returns schema", false, options);
  	const exportAs = String(block.fields?.EXPORT?.value ?? "none") === "tool" ? "tool" : "none";
  	if (exportAs === "tool" && description.length === 0) throw new Error("a function exported as a tool needs a description");
  	return {
  		name,
  		description,
  		parameters,
  		...returns ? { returns } : {},
  		exportAs,
  		targetName,
  		blockId: block.id
  	};
  }
  /**
  * SCHEMA and RETURNS hold either JSON Schema text or, when the consumer supports it, the name of a
  * `define schema` hat. Text that is not JSON is treated as a name, so existing JSON projects are
  * unaffected.
  */
  function parseSchema(text, label, requireObjectType, options) {
  	let value;
  	try {
  		value = JSON.parse(text);
  	} catch {
  		if (options.resolveSchema) return resolveNamed(text, label, requireObjectType, options.resolveSchema);
  		throw new Error(`${label} must be valid JSON`);
  	}
  	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be a JSON object`);
  	const schema = value;
  	if (requireObjectType && schema.type !== "object") throw new Error("args schema must have \"type\": \"object\"");
  	validateSchemaDefinition(schema, label);
  	return schema;
  }
  function resolveNamed(text, label, requireObjectType, resolveSchema) {
  	const schema = resolveSchema(text, label);
  	if (requireObjectType && schema.type !== "object") throw new Error("args schema must have \"type\": \"object\"");
  	validateSchemaDefinition(schema, label);
  	return schema;
  }
  //#endregion
  //#region src/schema-builder.ts
  /**
  * Lowers `define schema` block stacks into the canonical JSON Schema objects consumed by
  * `validateAgainstSchema`.
  *
  * The builder is declarative: it reads literal block fields before any script runs and never
  * executes the blocks it reads. Every schema it produces is checked with `validateSchemaDefinition`,
  * so a block-built schema and a hand-written JSON one go through one validator and one diagnostic
  * format.
  */
  var SCHEMA_NAME_PATTERN = /^[A-Za-z0-9_.-]{1,128}$/u;
  /** Complete SemVer, as the named-data schema identity contract requires. */
  var SCHEMA_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
  var PROPERTY_TYPES = {
  	string: () => ({ type: "string" }),
  	number: () => ({ type: "number" }),
  	integer: () => ({ type: "integer" }),
  	boolean: () => ({ type: "boolean" }),
  	null: () => ({ type: "null" }),
  	object: () => ({ type: "object" }),
  	array: () => ({ type: "array" }),
  	"array of string": () => ({
  		type: "array",
  		items: { type: "string" }
  	}),
  	"array of number": () => ({
  		type: "array",
  		items: { type: "number" }
  	}),
  	"array of integer": () => ({
  		type: "array",
  		items: { type: "integer" }
  	}),
  	"array of boolean": () => ({
  		type: "array",
  		items: { type: "boolean" }
  	}),
  	"array of object": () => ({
  		type: "array",
  		items: { type: "object" }
  	})
  };
  var CONSTRAINT_KEYWORDS = /* @__PURE__ */ new Set([
  	"minimum",
  	"maximum",
  	"minLength",
  	"maxLength",
  	"minItems",
  	"maxItems"
  ]);
  /** Keywords that describe the array itself rather than each of its items. */
  var ARRAY_LEVEL_KEYWORDS = /* @__PURE__ */ new Set(["minItems", "maxItems"]);
  /**
  * Reads every `define schema` hat in the project and lowers it to a canonical JSON Schema.
  * A hat that cannot be read is reported in `errors` and left out of `schemas`.
  */
  function scanSchemaDefinitions(targets, opcodes) {
  	const drafts = [];
  	const errors = [];
  	const seen = /* @__PURE__ */ new Map();
  	for (const target of targets) {
  		if (target.isOriginal === false) continue;
  		const targetName = target.getName?.() ?? (target.isStage ? "Stage" : "sprite");
  		const blocks = target.blocks._blocks;
  		for (const block of Object.values(blocks)) {
  			if (block.opcode !== opcodes.hat || block.topLevel === false) continue;
  			const where = `${targetName} (block ${block.id})`;
  			try {
  				const draft = readDraft(block, blocks, opcodes, targetName);
  				const key = `${draft.name}@${draft.version}`;
  				const previous = seen.get(key);
  				if (previous !== void 0) throw new Error(`schema "${key}" is already defined in ${previous}`);
  				seen.set(key, where);
  				drafts.push(draft);
  			} catch (error) {
  				errors.push(`${where}: ${messageOf$2(error)}`);
  			}
  		}
  	}
  	const byKey = new Map(drafts.map((draft) => [`${draft.name}@${draft.version}`, draft]));
  	const schemas = [];
  	for (const draft of drafts) try {
  		const schema = lowerDraft(draft, byKey, []);
  		validateSchemaDefinition(schema, `schema ${draft.name}`);
  		schemas.push({
  			name: draft.name,
  			version: draft.version,
  			schema,
  			targetName: draft.targetName,
  			blockId: draft.blockId
  		});
  	} catch (error) {
  		errors.push(`${draft.targetName} (block ${draft.blockId}): ${messageOf$2(error)}`);
  	}
  	schemas.sort((left, right) => compare(`${left.name}@${left.version}`, `${right.name}@${right.version}`));
  	return {
  		schemas,
  		errors
  	};
  }
  /** Parses `Name` or `Name@1.2.3`. */
  function parseSchemaReference(text, label) {
  	const trimmed = text.trim();
  	const at = trimmed.lastIndexOf("@");
  	const name = at > 0 ? trimmed.slice(0, at) : trimmed;
  	const version = at > 0 ? trimmed.slice(at + 1) : void 0;
  	if (!SCHEMA_NAME_PATTERN.test(name)) throw new Error(`${label} must be 1-128 letters, digits, ".", "_" or "-"`);
  	if (version !== void 0 && !SCHEMA_VERSION_PATTERN.test(version)) throw new Error(`${label} version "${version}" must be a complete SemVer value such as 1.0.0`);
  	return version === void 0 ? { name } : {
  		name,
  		version
  	};
  }
  /**
  * Resolves a `Name` or `Name@1.2.3` reference against scanned schemas. An unknown name or version
  * fails; a name with several versions and no pinned version is ambiguous rather than guessed.
  */
  function resolveSchemaReference(schemas, text, label) {
  	const reference = parseSchemaReference(text, label);
  	const matches = schemas.filter((candidate) => candidate.name === reference.name);
  	if (matches.length === 0) throw new Error(`${label} refers to unknown schema "${reference.name}"`);
  	if (reference.version !== void 0) {
  		const exact = matches.find((candidate) => candidate.version === reference.version);
  		if (!exact) {
  			const available = matches.map((candidate) => candidate.version).join(", ");
  			throw new Error(`${label} refers to unknown version "${reference.version}" of schema "${reference.name}" (defined: ${available})`);
  		}
  		return exact.schema;
  	}
  	if (matches.length > 1) {
  		const available = matches.map((candidate) => candidate.version).join(", ");
  		throw new Error(`${label} refers to schema "${reference.name}", which has several versions (${available}); pin one as "${reference.name}@${matches[0]?.version}"`);
  	}
  	return matches[0].schema;
  }
  function readDraft(hat, blocks, opcodes, targetName) {
  	const name = readLiteralInput(hat, blocks, "NAME").trim();
  	if (!SCHEMA_NAME_PATTERN.test(name)) throw new Error("schema name must be 1-128 letters, digits, \".\", \"_\" or \"-\"");
  	const version = readLiteralInput(hat, blocks, "VERSION").trim();
  	if (!SCHEMA_VERSION_PATTERN.test(version)) throw new Error(`schema version "${version}" must be a complete SemVer value such as 1.0.0`);
  	const draft = {
  		name,
  		version,
  		properties: [],
  		targetName,
  		blockId: hat.id
  	};
  	const declared = /* @__PURE__ */ new Set();
  	for (const block of stackBelow(hat, blocks)) if (block.opcode === opcodes.property) draft.properties.push(readProperty(block, blocks, declared));
  	else if (block.opcode === opcodes.propertySchema || block.opcode === opcodes.propertyArraySchema) draft.properties.push(readReferenceProperty(block, blocks, declared, block.opcode === opcodes.propertyArraySchema));
  	else if (block.opcode === opcodes.constraint) applyConstraint(block, blocks, draft);
  	else if (block.opcode === opcodes.allowedValues) applyAllowedValues(block, blocks, draft);
  	else if (block.opcode === opcodes.additionalProperties) {
  		if (draft.additionalProperties !== void 0) throw new Error("\"allow undeclared properties\" is used more than once in this schema");
  		draft.additionalProperties = readMenuField(block, "ALLOW") === "yes";
  	} else throw new Error(`${block.opcode} cannot be used inside a "define schema" stack`);
  	return draft;
  }
  function readProperty(block, blocks, declared) {
  	const name = readPropertyName(block, blocks, declared);
  	const typeName = readMenuField(block, "TYPE");
  	const build = PROPERTY_TYPES[typeName];
  	if (!build) throw new Error(`property "${name}" has unsupported type "${typeName}"`);
  	return {
  		name,
  		required: readPresence(block),
  		schema: build()
  	};
  }
  function readReferenceProperty(block, blocks, declared, asArray) {
  	const name = readPropertyName(block, blocks, declared);
  	const reference = parseSchemaReference(readLiteralInput(block, blocks, "SCHEMA"), `property "${name}" schema`);
  	return {
  		name,
  		required: readPresence(block),
  		reference,
  		referenceIsArray: asArray
  	};
  }
  function readPropertyName(block, blocks, declared) {
  	const name = readLiteralInput(block, blocks, "NAME").trim();
  	if (name.length === 0) throw new Error("a property needs a name");
  	if (declared.has(name)) throw new Error(`property "${name}" is declared more than once`);
  	declared.add(name);
  	return name;
  }
  function readPresence(block) {
  	return readMenuField(block, "PRESENCE") === "required";
  }
  function applyConstraint(block, blocks, draft) {
  	const keyword = readMenuField(block, "KEYWORD");
  	if (!CONSTRAINT_KEYWORDS.has(keyword)) throw new Error(`unsupported limit "${keyword}"`);
  	const target = constraintTarget(draft, `limit "${keyword}"`, keyword);
  	const raw = readLiteralInput(block, blocks, "VALUE").trim();
  	const value = Number(raw);
  	if (raw.length === 0 || !Number.isFinite(value)) throw new Error(`limit "${keyword}" needs a number, not "${raw}"`);
  	if (target[keyword] !== void 0) throw new Error(`limit "${keyword}" is set more than once on property "${lastProperty(draft).name}"`);
  	target[keyword] = value;
  }
  function applyAllowedValues(block, blocks, draft) {
  	const target = constraintTarget(draft, "\"allowed values\"", "enum");
  	const property = lastProperty(draft);
  	if (target.enum !== void 0) throw new Error(`"allowed values" is set more than once on property "${property.name}"`);
  	const values = parseAllowedValues(readLiteralInput(block, blocks, "VALUES"), property.name);
  	const type = target.type;
  	if (type !== void 0) {
  		for (const value of values) if (validateAgainstSchema(value, { type }).length > 0) throw new Error(`allowed value ${JSON.stringify(value)} does not match the declared type of property "${property.name}"`);
  	}
  	target.enum = values;
  }
  /**
  * Where a limit or an allowed-values list belongs. For an array property the item keywords describe
  * each item, while `minItems`/`maxItems` describe the array.
  */
  function constraintTarget(draft, label, keyword) {
  	const property = lastProperty(draft, label);
  	if (!property.schema) throw new Error(`${label} cannot be used on property "${property.name}", which uses another schema`);
  	if (!(property.schema.type === "array")) {
  		if (ARRAY_LEVEL_KEYWORDS.has(keyword)) throw new Error(`${label} can only be used on an array property, not "${property.name}"`);
  		return property.schema;
  	}
  	if (ARRAY_LEVEL_KEYWORDS.has(keyword)) return property.schema;
  	const items = property.schema.items;
  	if (items === void 0 || typeof items !== "object" || items === null || Array.isArray(items)) throw new Error(`${label} needs property "${property.name}" to declare an item type, such as "array of number"`);
  	return items;
  }
  function lastProperty(draft, label = "this block") {
  	const property = draft.properties.at(-1);
  	if (!property) throw new Error(`${label} must come after a property block`);
  	return property;
  }
  /** JSON array text, or a comma-separated list of strings. */
  function parseAllowedValues(text, propertyName) {
  	const trimmed = text.trim();
  	if (trimmed.length === 0) throw new Error(`"allowed values" for property "${propertyName}" is empty`);
  	if (trimmed.startsWith("[")) {
  		let parsed;
  		try {
  			parsed = JSON.parse(trimmed);
  		} catch {
  			throw new Error(`"allowed values" for property "${propertyName}" must be valid JSON`);
  		}
  		if (!Array.isArray(parsed) || parsed.length === 0) throw new Error(`"allowed values" for property "${propertyName}" must be a non-empty JSON array`);
  		return parsed;
  	}
  	const values = trimmed.split(",").map((value) => value.trim()).filter((value) => value.length > 0);
  	if (values.length === 0) throw new Error(`"allowed values" for property "${propertyName}" is empty`);
  	return values;
  }
  function lowerDraft(draft, byKey, stack) {
  	const key = `${draft.name}@${draft.version}`;
  	if (stack.includes(key)) throw new Error(`schema reference cycle: ${[...stack, key].join(" -> ")}`);
  	if (stack.length >= 16) throw new Error(`schema references nest deeper than 16 levels`);
  	const nextStack = [...stack, key];
  	const properties = {};
  	const required = [];
  	for (const property of draft.properties) {
  		properties[property.name] = property.reference ? lowerReference(property, draft, byKey, nextStack) : property.schema;
  		if (property.required) required.push(property.name);
  	}
  	return {
  		type: "object",
  		properties,
  		...required.length > 0 ? { required } : {},
  		...draft.additionalProperties === void 0 ? {} : { additionalProperties: draft.additionalProperties }
  	};
  }
  function lowerReference(property, draft, byKey, stack) {
  	const reference = property.reference;
  	const lowered = lowerDraft(findDraft(byKey, reference, `property "${property.name}" of schema ${draft.name}`), byKey, stack);
  	return property.referenceIsArray ? {
  		type: "array",
  		items: lowered
  	} : lowered;
  }
  function findDraft(byKey, reference, label) {
  	if (reference.version !== void 0) {
  		const exact = byKey.get(`${reference.name}@${reference.version}`);
  		if (!exact) throw new Error(`${label} refers to unknown schema "${reference.name}@${reference.version}"`);
  		return exact;
  	}
  	const matches = [...byKey.values()].filter((candidate) => candidate.name === reference.name);
  	if (matches.length === 0) throw new Error(`${label} refers to unknown schema "${reference.name}"`);
  	if (matches.length > 1) {
  		const available = matches.map((candidate) => candidate.version).join(", ");
  		throw new Error(`${label} refers to schema "${reference.name}", which has several versions (${available}); pin one as "${reference.name}@${matches[0]?.version}"`);
  	}
  	return matches[0];
  }
  function compare(left, right) {
  	return left < right ? -1 : left > right ? 1 : 0;
  }
  function messageOf$2(error) {
  	return error instanceof Error ? error.message : String(error);
  }
  //#endregion
  //#region src/composition.ts
  /**
  * Composition API: named functions without TurboWarp block definitions.
  *
  * A consumer extension owns its `define function` hat (and its opcode) and forwards the hat
  * predicate and the argument/return blocks here. Importing this module does not register a
  * TurboWarp extension and does not touch the `Scratch` global.
  */
  function createNamedFunctions(options) {
  	return new NamedFunctionsImpl(options);
  }
  var NamedFunctionsImpl = class {
  	constructor(options) {
  		this.options = options;
  		this.promises = /* @__PURE__ */ new Map();
  		this.waiting = [];
  		this.inFlight = 0;
  		this.nextPromiseId = 1;
  		this.maxInFlight = Math.max(1, options.maxInFlight ?? 8);
  		this.maxRetained = Math.max(1, options.maxRetainedPromises ?? 256);
  		const dispatcherOptions = {
  			hatOpcode: options.functionHatOpcode,
  			knownNames: () => new Set(this.scan().functions.map((definition) => definition.name)),
  			...options.timeoutMs === void 0 ? {} : { timeoutMs: options.timeoutMs },
  			...options.setTimer ? { setTimer: options.setTimer } : {},
  			...options.clearTimer ? { clearTimer: options.clearTimer } : {}
  		};
  		this.dispatcher = new FunctionDispatcher(options.runtime, dispatcherOptions);
  		options.runtime.on("PROJECT_STOP_ALL", () => this.promises.clear());
  	}
  	scan() {
  		if (!this.options.schemaBlockOpcodes) return scanFunctionDefinitions(this.options.runtime.targets, this.options.functionHatOpcode);
  		const schemas = this.schemas().schemas;
  		return scanFunctionDefinitions(this.options.runtime.targets, this.options.functionHatOpcode, { resolveSchema: (reference, label) => resolveSchemaReference(schemas, reference, label) });
  	}
  	schemas() {
  		const opcodes = this.options.schemaBlockOpcodes;
  		if (!opcodes) return {
  			schemas: [],
  			errors: []
  		};
  		return scanSchemaDefinitions(this.options.runtime.targets, opcodes);
  	}
  	tools() {
  		const errors = [...this.schemas().errors, ...this.scan().errors];
  		if (errors.length > 0) throw new Error(`Invalid function definitions: ${errors.join("; ")}`);
  		return toFunctionTools(this.scan().functions);
  	}
  	isDefined(name) {
  		return this.scan().functions.some((definition) => definition.name === name.trim());
  	}
  	call(name, args, options = {}) {
  		const trimmed = name.trim();
  		const definition = this.scan().functions.find((candidate) => candidate.name === trimmed);
  		if (!definition) return Promise.reject(/* @__PURE__ */ new Error(`Unknown function: ${trimmed}`));
  		if (options.exportedOnly && definition.exportAs !== "tool") return Promise.reject(/* @__PURE__ */ new Error(`Function ${trimmed} is not exported as a tool.`));
  		const errors = validateAgainstSchema(args, definition.parameters);
  		if (errors.length > 0) return Promise.reject(/* @__PURE__ */ new Error(`Invalid arguments for ${trimmed}: ${errors.join("; ")}`));
  		return this.dispatcher.invoke(trimmed, args, options.caller, definition.returns);
  	}
  	start(name, args, options = {}) {
  		const id = `p_${this.nextPromiseId++}`;
  		const promise = this.acquireSlot().then(() => this.call(name, args, options).finally(() => this.releaseSlot()));
  		const entry = {
  			promise,
  			settled: false
  		};
  		promise.then(() => entry.settled = true, () => entry.settled = true);
  		this.promises.set(id, entry);
  		this.evictSettled();
  		return { $promise: id };
  	}
  	await(ref) {
  		const entry = this.lookup(ref);
  		return entry ? entry.promise : Promise.reject(/* @__PURE__ */ new Error("Unknown or expired promise reference."));
  	}
  	async awaitAll(refs) {
  		if (!Array.isArray(refs)) throw new Error("await all needs a JSON array of promise references.");
  		return (await Promise.allSettled(refs.map((ref) => this.await(ref)))).map((result) => result.status === "fulfilled" ? result.value : { $error: messageOf$1(result.reason) });
  	}
  	isSettled(ref) {
  		return this.lookup(ref)?.settled ?? false;
  	}
  	matchHat(name, thread) {
  		return this.dispatcher.matchHat(name, thread);
  	}
  	argumentsFor(thread) {
  		return this.dispatcher.argumentsFor(thread);
  	}
  	returnFrom(thread, value) {
  		this.dispatcher.returnFrom(thread, value);
  	}
  	cancelAll(reason) {
  		this.dispatcher.cancelAll(reason);
  	}
  	release() {
  		this.dispatcher.release();
  		this.promises.clear();
  	}
  	lookup(ref) {
  		const id = typeof ref === "object" && ref !== null && typeof ref.$promise === "string" ? ref.$promise : void 0;
  		return id ? this.promises.get(id) : void 0;
  	}
  	acquireSlot() {
  		if (this.inFlight < this.maxInFlight) {
  			this.inFlight += 1;
  			return Promise.resolve();
  		}
  		return new Promise((resolve) => this.waiting.push(() => {
  			this.inFlight += 1;
  			resolve();
  		}));
  	}
  	releaseSlot() {
  		this.inFlight -= 1;
  		this.waiting.shift()?.();
  	}
  	evictSettled() {
  		if (this.promises.size <= this.maxRetained) return;
  		for (const [id, entry] of this.promises) {
  			if (this.promises.size <= this.maxRetained) break;
  			if (entry.settled) this.promises.delete(id);
  		}
  	}
  };
  function messageOf$1(error) {
  	return error instanceof Error ? error.message : String(error);
  }
  //#endregion
  //#region src/extension.ts
  var blockDefinitions = block_definitions_default.blocks;
  var menuDefinitions = block_definitions_default.menus;
  var DEFINE_FUNCTION_OPCODE = `${extensionConfig.id}_defineFunction`;
  /** Opcodes of the blocks that make up a `define schema` stack. */
  var SCHEMA_BLOCK_OPCODES = {
  	hat: `${extensionConfig.id}_defineSchema`,
  	property: `${extensionConfig.id}_schemaProperty`,
  	propertySchema: `${extensionConfig.id}_schemaPropertySchema`,
  	propertyArraySchema: `${extensionConfig.id}_schemaPropertyArraySchema`,
  	constraint: `${extensionConfig.id}_schemaConstraint`,
  	allowedValues: `${extensionConfig.id}_schemaAllowedValues`,
  	additionalProperties: `${extensionConfig.id}_schemaAdditionalProperties`
  };
  /** Block surface over the named-functions composition. */
  var NamedFunctionsExtension = class {
  	constructor(deps) {
  		this.lastErrorMessage = "";
  		this.unregisterFixedInputEditors = registerFixedInputEditors(typeof Scratch === "undefined" ? {} : Scratch, fixedInputEditorDefinitions, deps.runtime);
  		try {
  			this.functions = createNamedFunctions({
  				...deps,
  				functionHatOpcode: DEFINE_FUNCTION_OPCODE,
  				schemaBlockOpcodes: SCHEMA_BLOCK_OPCODES
  			});
  		} catch (error) {
  			this.unregisterFixedInputEditors();
  			throw error;
  		}
  	}
  	dispose() {
  		this.unregisterFixedInputEditors();
  	}
  	getInfo() {
  		return {
  			id: extensionConfig.id,
  			name: Scratch.translate(block_definitions_default.extensionName),
  			docsURI: extensionConfig.docsURI,
  			blockIconURI: extensionConfig.blockIconURI,
  			blocks: blockDefinitions.map((block) => this.toScratchBlock(block)),
  			menus: Object.fromEntries(Object.entries(menuDefinitions).map(([id, menu]) => [id, {
  				acceptReporters: menu.acceptReporters,
  				items: [...menu.items]
  			}]))
  		};
  	}
  	defineFunction(args, util) {
  		return this.functions.matchHat(Scratch.Cast.toString(args.NAME), util?.thread);
  	}
  	/**
  	* A `define schema` stack is a declaration, not a script: the hat never activates, and the blocks
  	* under it do nothing if a user clicks the stack.
  	*/
  	defineSchema() {
  		return false;
  	}
  	schemaProperty() {}
  	schemaPropertySchema() {}
  	schemaPropertyArraySchema() {}
  	schemaConstraint() {}
  	schemaAllowedValues() {}
  	schemaAdditionalProperties() {}
  	schemaJson(args) {
  		return this.guard("", () => {
  			const scan = this.functions.schemas();
  			try {
  				return JSON.stringify(resolveSchemaReference(scan.schemas, Scratch.Cast.toString(args.NAME), "schema name"));
  			} catch (error) {
  				if (scan.errors.length === 0) throw error;
  				throw new Error(`${messageOf(error)} (invalid schema definitions: ${scan.errors.join("; ")})`);
  			}
  		});
  	}
  	isSchemaDefined(args) {
  		try {
  			resolveSchemaReference(this.functions.schemas().schemas, Scratch.Cast.toString(args.NAME), "schema name");
  			return true;
  		} catch {
  			return false;
  		}
  	}
  	functionArgument(args, util) {
  		return this.guard("", () => toScratchValue(readArgumentPath(this.functions.argumentsFor(util?.thread), Scratch.Cast.toString(args.PATH))));
  	}
  	functionArgumentsJson(_args, util) {
  		return this.guard("", () => JSON.stringify(this.functions.argumentsFor(util?.thread) ?? null));
  	}
  	returnValue(args, util) {
  		this.guard(void 0, () => {
  			this.functions.returnFrom(util?.thread, parseJsonOrText(Scratch.Cast.toString(args.VALUE)));
  			util?.stopThisScript?.();
  		});
  	}
  	async callFunction(args, util) {
  		try {
  			const result = await this.functions.call(Scratch.Cast.toString(args.NAME), parseArguments(Scratch.Cast.toString(args.ARGS)), util?.thread ? { caller: util.thread } : {});
  			this.lastErrorMessage = "";
  			return toScratchValue(result);
  		} catch (error) {
  			this.lastErrorMessage = messageOf(error);
  			return "";
  		}
  	}
  	startFunction(args, util) {
  		return this.guard("", () => {
  			const ref = this.functions.start(Scratch.Cast.toString(args.NAME), parseArguments(Scratch.Cast.toString(args.ARGS)), util?.thread ? { caller: util.thread } : {});
  			return JSON.stringify(ref);
  		});
  	}
  	async awaitResult(args) {
  		try {
  			const result = await this.functions.await(parseJsonOrText(Scratch.Cast.toString(args.PROMISE)));
  			this.lastErrorMessage = "";
  			return toScratchValue(result);
  		} catch (error) {
  			this.lastErrorMessage = messageOf(error);
  			return "";
  		}
  	}
  	async awaitAll(args) {
  		try {
  			const results = await this.functions.awaitAll(parseJsonOrText(Scratch.Cast.toString(args.PROMISES)));
  			this.lastErrorMessage = "";
  			return JSON.stringify(results);
  		} catch (error) {
  			this.lastErrorMessage = messageOf(error);
  			return "";
  		}
  	}
  	isSettled(args) {
  		return this.functions.isSettled(parseJsonOrText(Scratch.Cast.toString(args.PROMISE)));
  	}
  	isDefined(args) {
  		return this.functions.isDefined(Scratch.Cast.toString(args.NAME));
  	}
  	lastError() {
  		return this.lastErrorMessage;
  	}
  	guard(fallback, action) {
  		try {
  			const result = action();
  			this.lastErrorMessage = "";
  			return result;
  		} catch (error) {
  			this.lastErrorMessage = messageOf(error);
  			return fallback;
  		}
  	}
  	toScratchBlock(block) {
  		const scratchBlock = {
  			opcode: block.opcode,
  			blockType: Scratch.BlockType[block.blockType],
  			text: Scratch.translate(block.text),
  			arguments: Object.fromEntries(Object.entries(block.arguments).map(([name, argument]) => [name, {
  				type: Scratch.ArgumentType[argument.type],
  				defaultValue: argument.defaultValue,
  				...argument.menu ? { menu: argument.menu } : {}
  			}]))
  		};
  		if (block.blockType === "HAT") scratchBlock.isEdgeActivated = false;
  		return scratchBlock;
  	}
  };
  /** ARGS text: empty means `{}`; otherwise it must be JSON. */
  function parseArguments(text) {
  	if (text.trim().length === 0) return {};
  	try {
  		return JSON.parse(text);
  	} catch {
  		throw new Error("ARGS must be JSON text, for example {\"a\":1}.");
  	}
  }
  function messageOf(error) {
  	return error instanceof Error ? error.message : String(error);
  }
  //#endregion
  //#region src/index.ts
  if (extensionConfig.unsandboxed && !Scratch.extensions.unsandboxed) throw new Error(`${extensionConfig.name} must run unsandboxed.`);
  var runtime = Scratch.vm?.runtime;
  if (!runtime) throw new Error(`${extensionConfig.name} requires access to the TurboWarp VM runtime.`);
  Scratch.extensions.register(new NamedFunctionsExtension({ runtime }));
  //#endregion

})(Scratch);
