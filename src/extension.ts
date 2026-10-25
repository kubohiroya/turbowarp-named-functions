import {fixedInputEditorDefinitions, registerFixedInputEditors} from './fixed-input-editors.js';
import {extensionConfig} from './config';
import definitions from './block-definitions.json';
import {
  createNamedFunctions,
  parseJsonOrText,
  readArgumentPath,
  resolveSchemaReference,
  toScratchValue,
  type NamedFunctions,
  type NamedFunctionsOptions,
  type SchemaBlockOpcodes
} from './composition.js';
import type {BlockUtilityLike} from './runtime-types.js';

type BlockTypeName = 'COMMAND' | 'REPORTER' | 'BOOLEAN' | 'HAT';
type ArgumentTypeName = 'STRING' | 'NUMBER' | 'BOOLEAN';

interface DefinitionArgument {
  type: ArgumentTypeName;
  defaultValue: string;
  menu?: string;
}

interface BlockDefinition {
  opcode: string;
  blockType: BlockTypeName;
  text: string;
  arguments: Record<string, DefinitionArgument>;
}

interface MenuDefinition {
  acceptReporters: boolean;
  items: string[];
}

const blockDefinitions = definitions.blocks as readonly BlockDefinition[];
const menuDefinitions = definitions.menus as Record<string, MenuDefinition>;

export const DEFINE_FUNCTION_OPCODE = `${extensionConfig.id}_defineFunction`;
export const DEFINE_SCHEMA_OPCODE = `${extensionConfig.id}_defineSchema`;

/** Opcodes of the blocks that make up a `define schema` stack. */
export const SCHEMA_BLOCK_OPCODES: SchemaBlockOpcodes = {
  hat: DEFINE_SCHEMA_OPCODE,
  property: `${extensionConfig.id}_schemaProperty`,
  propertySchema: `${extensionConfig.id}_schemaPropertySchema`,
  propertyArraySchema: `${extensionConfig.id}_schemaPropertyArraySchema`,
  constraint: `${extensionConfig.id}_schemaConstraint`,
  allowedValues: `${extensionConfig.id}_schemaAllowedValues`,
  additionalProperties: `${extensionConfig.id}_schemaAdditionalProperties`
};

export type NamedFunctionsExtensionDependencies = Omit<NamedFunctionsOptions, 'functionHatOpcode'>;

type Args = Record<string, unknown>;
type Util = BlockUtilityLike & {stopThisScript?: () => void};

/** Block surface over the named-functions composition. */
export class NamedFunctionsExtension implements TurboWarpExtension {
  private lastErrorMessage = '';
  private readonly functions: NamedFunctions;
  private readonly unregisterFixedInputEditors: () => void;

  public constructor(deps: NamedFunctionsExtensionDependencies) {
    this.unregisterFixedInputEditors = registerFixedInputEditors(
      typeof Scratch === 'undefined' ? {} : Scratch, fixedInputEditorDefinitions, deps.runtime
    );
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

  public dispose(): void {
    this.unregisterFixedInputEditors();
  }

  public getInfo(): Record<string, unknown> {
    return {
      id: extensionConfig.id,
      name: Scratch.translate(definitions.extensionName),
      docsURI: extensionConfig.docsURI,
      blockIconURI: extensionConfig.blockIconURI,
      blocks: blockDefinitions.map((block) => this.toScratchBlock(block)),
      menus: Object.fromEntries(
        Object.entries(menuDefinitions).map(([id, menu]) => [
          id,
          {acceptReporters: menu.acceptReporters, items: [...menu.items]}
        ])
      )
    };
  }

  // ---- definition ---------------------------------------------------------------------------

  public defineFunction(args: Args, util?: Util): boolean {
    return this.functions.matchHat(Scratch.Cast.toString(args.NAME), util?.thread);
  }

  /**
   * A `define schema` stack is a declaration, not a script: the hat never activates, and the blocks
   * under it do nothing if a user clicks the stack.
   */
  public defineSchema(): boolean {
    return false;
  }

  public schemaProperty(): void {}

  public schemaPropertySchema(): void {}

  public schemaPropertyArraySchema(): void {}

  public schemaConstraint(): void {}

  public schemaAllowedValues(): void {}

  public schemaAdditionalProperties(): void {}

  public schemaJson(args: Args): string {
    return this.guard('', () => {
      const scan = this.functions.schemas();
      try {
        return JSON.stringify(
          resolveSchemaReference(scan.schemas, Scratch.Cast.toString(args.NAME), 'schema name')
        );
      } catch (error) {
        // A schema that failed to load is simply absent, so name the definition errors as well.
        if (scan.errors.length === 0) throw error;
        throw new Error(`${messageOf(error)} (invalid schema definitions: ${scan.errors.join('; ')})`);
      }
    });
  }

  public isSchemaDefined(args: Args): boolean {
    try {
      resolveSchemaReference(this.functions.schemas().schemas, Scratch.Cast.toString(args.NAME), 'schema name');
      return true;
    } catch {
      return false;
    }
  }

  public functionArgument(args: Args, util?: Util): string | number | boolean {
    return this.guard('', () =>
      toScratchValue(readArgumentPath(this.functions.argumentsFor(util?.thread), Scratch.Cast.toString(args.PATH)))
    );
  }

  public functionArgumentsJson(_args: Args, util?: Util): string {
    return this.guard('', () => JSON.stringify(this.functions.argumentsFor(util?.thread) ?? null));
  }

  public returnValue(args: Args, util?: Util): void {
    this.guard(undefined, () => {
      this.functions.returnFrom(util?.thread, parseJsonOrText(Scratch.Cast.toString(args.VALUE)));
      util?.stopThisScript?.();
    });
  }

  // ---- calls --------------------------------------------------------------------------------

  public async callFunction(args: Args, util?: Util): Promise<string | number | boolean> {
    try {
      const result = await this.functions.call(
        Scratch.Cast.toString(args.NAME),
        parseArguments(Scratch.Cast.toString(args.ARGS)),
        util?.thread ? {caller: util.thread} : {}
      );
      this.lastErrorMessage = '';
      return toScratchValue(result);
    } catch (error) {
      this.lastErrorMessage = messageOf(error);
      return '';
    }
  }

  public startFunction(args: Args, util?: Util): string {
    return this.guard('', () => {
      const ref = this.functions.start(
        Scratch.Cast.toString(args.NAME),
        parseArguments(Scratch.Cast.toString(args.ARGS)),
        util?.thread ? {caller: util.thread} : {}
      );
      return JSON.stringify(ref);
    });
  }

  public async awaitResult(args: Args): Promise<string | number | boolean> {
    try {
      const result = await this.functions.await(parseJsonOrText(Scratch.Cast.toString(args.PROMISE)));
      this.lastErrorMessage = '';
      return toScratchValue(result);
    } catch (error) {
      this.lastErrorMessage = messageOf(error);
      return '';
    }
  }

  public async awaitAll(args: Args): Promise<string> {
    try {
      const results = await this.functions.awaitAll(parseJsonOrText(Scratch.Cast.toString(args.PROMISES)));
      this.lastErrorMessage = '';
      return JSON.stringify(results);
    } catch (error) {
      this.lastErrorMessage = messageOf(error);
      return '';
    }
  }

  public isSettled(args: Args): boolean {
    return this.functions.isSettled(parseJsonOrText(Scratch.Cast.toString(args.PROMISE)));
  }

  public isDefined(args: Args): boolean {
    return this.functions.isDefined(Scratch.Cast.toString(args.NAME));
  }

  public lastError(): string {
    return this.lastErrorMessage;
  }

  // ---- internals ----------------------------------------------------------------------------

  private guard<T>(fallback: T, action: () => T): T {
    try {
      const result = action();
      this.lastErrorMessage = '';
      return result;
    } catch (error) {
      this.lastErrorMessage = messageOf(error);
      return fallback;
    }
  }

  private toScratchBlock(block: BlockDefinition): Record<string, unknown> {
    const scratchBlock: Record<string, unknown> = {
      opcode: block.opcode,
      blockType: Scratch.BlockType[block.blockType],
      text: Scratch.translate(block.text),
      arguments: Object.fromEntries(
        Object.entries(block.arguments).map(([name, argument]) => [
          name,
          {
            type: Scratch.ArgumentType[argument.type],
            defaultValue: argument.defaultValue,
            ...(argument.menu ? {menu: argument.menu} : {})
          }
        ])
      )
    };
    if (block.blockType === 'HAT') scratchBlock.isEdgeActivated = false;
    return scratchBlock;
  }
}

/** ARGS text: empty means `{}`; otherwise it must be JSON. */
function parseArguments(text: string): unknown {
  if (text.trim().length === 0) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error('ARGS must be JSON text, for example {"a":1}.');
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
