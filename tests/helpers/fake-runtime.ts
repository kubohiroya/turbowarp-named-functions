import type {SchemaBlockOpcodes} from '../../src/schema-builder.js';
import type {RuntimeLike, RuntimeTarget, RuntimeThread, SerializedBlock} from '../../src/runtime-types.js';

/** Minimal stand-in for the TurboWarp runtime: records startHats calls and lets tests drive steps. */
export class FakeRuntime implements RuntimeLike {
  public targets: RuntimeTarget[] = [];
  public threads: RuntimeThread[] = [];
  public readonly startedHats: string[] = [];
  private readonly listeners = new Map<string, Array<(...args: unknown[]) => void>>();

  public startHats(opcode: string): RuntimeThread[] {
    this.startedHats.push(opcode);
    return [];
  }

  public on(event: string, listener: (...args: unknown[]) => void): void {
    const list = this.listeners.get(event) ?? [];
    list.push(listener);
    this.listeners.set(event, list);
  }

  public off(event: string, listener: (...args: unknown[]) => void): void {
    this.listeners.set(event, (this.listeners.get(event) ?? []).filter((candidate) => candidate !== listener));
  }

  public emit(event: string): void {
    for (const listener of this.listeners.get(event) ?? []) listener();
  }

  public step(): void {
    this.emit('AFTER_EXECUTE');
  }

  public spawnThread(): RuntimeThread {
    const thread: RuntimeThread = {topBlock: `thread-${this.threads.length}`};
    this.threads.push(thread);
    return thread;
  }

  public endThread(thread: RuntimeThread): void {
    this.threads = this.threads.filter((candidate) => candidate !== thread);
  }
}

export interface FunctionHatSpec {
  name: string;
  description?: string;
  schema?: string;
  returns?: string;
  exportAs?: 'tool' | 'none';
  /** Use a reporter block instead of literal text for this input. */
  reporterInput?: 'NAME' | 'DESCRIPTION' | 'SCHEMA' | 'RETURNS';
}

/** Builds a target whose blocks container holds `define function` hats as the VM serializes them. */
export function targetWithFunctions(
  opcode: string,
  specs: readonly FunctionHatSpec[],
  name = 'Sprite1'
): RuntimeTarget {
  const blocks: Record<string, SerializedBlock> = {};
  specs.forEach((spec, index) => {
    const hatId = `hat${index}`;
    const inputs: Record<string, {block: string; shadow: string}> = {};
    const values = {
      NAME: spec.name,
      DESCRIPTION: spec.description ?? `Description of ${spec.name}`,
      SCHEMA: spec.schema ?? '{"type":"object","properties":{}}'
    };
    if (spec.returns !== undefined) Object.assign(values, {RETURNS: spec.returns});
    for (const [inputName, value] of Object.entries(values)) {
      const shadowId = `${hatId}_${inputName}`;
      blocks[shadowId] = {id: shadowId, opcode: 'text', shadow: true, topLevel: false, fields: {TEXT: {value}}};
      if (spec.reporterInput === inputName) {
        const reporterId = `${shadowId}_reporter`;
        blocks[reporterId] = {id: reporterId, opcode: 'data_variable', topLevel: false};
        inputs[inputName] = {block: reporterId, shadow: shadowId};
      } else {
        inputs[inputName] = {block: shadowId, shadow: shadowId};
      }
    }
    blocks[hatId] = {
      id: hatId,
      opcode,
      topLevel: true,
      inputs,
      fields: {EXPORT: {value: spec.exportAs ?? 'tool'}}
    };
  });
  return {isOriginal: true, isStage: false, getName: () => name, blocks: {_blocks: blocks}};
}

/** Opcodes used by the schema-builder tests; shaped like a consumer extension's own opcodes. */
export const testSchemaOpcodes: SchemaBlockOpcodes = {
  hat: 'test_defineSchema',
  property: 'test_schemaProperty',
  propertySchema: 'test_schemaPropertySchema',
  propertyArraySchema: 'test_schemaPropertyArraySchema',
  constraint: 'test_schemaConstraint',
  allowedValues: 'test_schemaAllowedValues',
  additionalProperties: 'test_schemaAdditionalProperties'
};

export type SchemaBodySpec =
  | {kind: 'property'; name: string; type: string; presence?: 'required' | 'optional'}
  | {kind: 'schema'; name: string; schema: string; presence?: 'required' | 'optional'; asArray?: boolean}
  | {kind: 'limit'; keyword: string; value: string}
  | {kind: 'allowedValues'; values: string}
  | {kind: 'allowUndeclared'; allow: 'yes' | 'no'}
  | {kind: 'foreign'; opcode: string};

export interface SchemaHatSpec {
  name: string;
  version?: string;
  body?: readonly SchemaBodySpec[];
  /** Use a reporter block instead of literal text for this hat input. */
  reporterInput?: 'NAME' | 'VERSION';
}

/** Builds a target whose blocks container holds `define schema` stacks as the VM serializes them. */
export function targetWithSchemas(
  specs: readonly SchemaHatSpec[],
  name = 'Sprite1',
  opcodes: SchemaBlockOpcodes = testSchemaOpcodes
): RuntimeTarget {
  const blocks: Record<string, SerializedBlock> = {};

  const addLiterals = (ownerId: string, values: Record<string, string>, reporterInput?: string) => {
    const inputs: Record<string, {block: string; shadow: string}> = {};
    for (const [inputName, value] of Object.entries(values)) {
      const shadowId = `${ownerId}_${inputName}`;
      blocks[shadowId] = {id: shadowId, opcode: 'text', shadow: true, topLevel: false, fields: {TEXT: {value}}};
      if (reporterInput === inputName) {
        const reporterId = `${shadowId}_reporter`;
        blocks[reporterId] = {id: reporterId, opcode: 'data_variable', topLevel: false};
        inputs[inputName] = {block: reporterId, shadow: shadowId};
      } else {
        inputs[inputName] = {block: shadowId, shadow: shadowId};
      }
    }
    return inputs;
  };

  specs.forEach((spec, hatIndex) => {
    const hatId = `schemaHat${hatIndex}`;
    const bodyIds = (spec.body ?? []).map((_, index) => `${hatId}_body${index}`);
    blocks[hatId] = {
      id: hatId,
      opcode: opcodes.hat,
      topLevel: true,
      next: bodyIds[0] ?? null,
      inputs: addLiterals(hatId, {NAME: spec.name, VERSION: spec.version ?? '1.0.0'}, spec.reporterInput)
    };

    (spec.body ?? []).forEach((body, index) => {
      const id = bodyIds[index] as string;
      const next = bodyIds[index + 1] ?? null;
      const block: SerializedBlock = {id, opcode: '', topLevel: false, next};
      switch (body.kind) {
        case 'property':
          block.opcode = opcodes.property;
          block.inputs = addLiterals(id, {NAME: body.name});
          block.fields = {TYPE: {value: body.type}, PRESENCE: {value: body.presence ?? 'required'}};
          break;
        case 'schema':
          block.opcode = body.asArray ? opcodes.propertyArraySchema : opcodes.propertySchema;
          block.inputs = addLiterals(id, {NAME: body.name, SCHEMA: body.schema});
          block.fields = {PRESENCE: {value: body.presence ?? 'required'}};
          break;
        case 'limit':
          block.opcode = opcodes.constraint;
          block.inputs = addLiterals(id, {VALUE: body.value});
          block.fields = {KEYWORD: {value: body.keyword}};
          break;
        case 'allowedValues':
          block.opcode = opcodes.allowedValues;
          block.inputs = addLiterals(id, {VALUES: body.values});
          break;
        case 'allowUndeclared':
          block.opcode = opcodes.additionalProperties;
          block.fields = {ALLOW: {value: body.allow}};
          break;
        case 'foreign':
          block.opcode = body.opcode;
          break;
      }
      blocks[id] = block;
    });
  });

  return {isOriginal: true, isStage: false, getName: () => name, blocks: {_blocks: blocks}};
}
