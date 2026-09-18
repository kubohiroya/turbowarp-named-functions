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
	invoke(name, args, caller) {
		if (!this.options.knownNames().has(name)) return Promise.reject(/* @__PURE__ */ new Error(`Unknown function: ${name}`));
		const parentChain = caller ? this.byThread.get(caller)?.chain ?? [] : [];
		if (parentChain.includes(name)) return Promise.reject(/* @__PURE__ */ new Error(`Reentrant call: ${[...parentChain, name].join(" -> ")}. Use a custom block for recursion.`));
		return new Promise((resolve, reject) => {
			const invocation = {
				name,
				args,
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
		this.settle(invocation, null, value);
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
		for (const invocation of this.running.values()) if (invocation.thread && !this.runtime.threads.includes(invocation.thread)) this.settle(invocation, null, null);
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
//#region src/function-registry.ts
var FUNCTION_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/u;
var MAX_DESCRIPTION_LENGTH = 1024;
/**
* Reads every `define function` hat in the project. NAME, DESCRIPTION, and SCHEMA are part of the
* tool contract sent to the model before any script runs, so they must be literal text.
*/
function scanFunctionDefinitions(targets, hatOpcode) {
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
				const definition = readDefinition(block, blocks, targetName);
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
function readDefinition(block, blocks, targetName) {
	const name = readLiteralInput(block, blocks, "NAME").trim();
	if (!FUNCTION_NAME_PATTERN.test(name)) throw new Error("function name must be 1-64 letters, digits, \"_\" or \"-\"");
	const description = readLiteralInput(block, blocks, "DESCRIPTION").trim();
	if (description.length > 1024) throw new Error(`description must be at most ${MAX_DESCRIPTION_LENGTH} characters`);
	const parameters = parseSchema(readLiteralInput(block, blocks, "SCHEMA"));
	const exportAs = String(block.fields?.EXPORT?.value ?? "none") === "tool" ? "tool" : "none";
	if (exportAs === "tool" && description.length === 0) throw new Error("a function exported as a tool needs a description");
	return {
		name,
		description,
		parameters,
		exportAs,
		targetName,
		blockId: block.id
	};
}
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
function parseSchema(text) {
	let value;
	try {
		value = JSON.parse(text);
	} catch {
		throw new Error("args schema must be valid JSON");
	}
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("args schema must be a JSON object");
	const schema = value;
	if (schema.type !== "object") throw new Error("args schema must have \"type\": \"object\"");
	return schema;
}
//#endregion
//#region src/schema-validator.ts
/**
* A small JSON Schema validator for function arguments. It interprets the schema at run time and
* never generates code, so it also works where `eval` is unavailable (for example Cloudflare Workers).
*
* Supported keywords: type, properties, required, additionalProperties (boolean), items, enum,
* const, minimum, maximum, minLength, maxLength, minItems, maxItems. Other keywords, such as
* description and title, are ignored.
*/
function validateAgainstSchema(value, schema, path = "$") {
	const rule = asRecord(schema);
	if (!rule) return [];
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
		if (rule.items !== void 0) value.forEach((item, index) => errors.push(...validateAgainstSchema(item, rule.items, `${path}[${index}]`)));
	}
	const object = asRecord(value);
	if (object) {
		const properties = asRecord(rule.properties) ?? {};
		if (Array.isArray(rule.required)) {
			for (const name of rule.required) if (typeof name === "string" && !(name in object)) errors.push(`${path}.${name} is required`);
		}
		for (const [name, child] of Object.entries(object)) if (name in properties) errors.push(...validateAgainstSchema(child, properties[name], `${path}.${name}`));
		else if (rule.additionalProperties === false) errors.push(`${path}.${name} is not allowed`);
	}
	return errors;
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
		return scanFunctionDefinitions(this.options.runtime.targets, this.options.functionHatOpcode);
	}
	tools() {
		const scan = this.scan();
		if (scan.errors.length > 0) throw new Error(`Invalid function definitions: ${scan.errors.join("; ")}`);
		return toFunctionTools(scan.functions);
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
		return this.dispatcher.invoke(trimmed, args, options.caller);
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
		return (await Promise.allSettled(refs.map((ref) => this.await(ref)))).map((result) => result.status === "fulfilled" ? result.value : { $error: messageOf(result.reason) });
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
function messageOf(error) {
	return error instanceof Error ? error.message : String(error);
}
//#endregion
export { FUNCTION_NAME_PATTERN, createNamedFunctions, parseJsonOrText, readArgumentPath, scanFunctionDefinitions, toFunctionTools, toScratchValue, validateAgainstSchema };
