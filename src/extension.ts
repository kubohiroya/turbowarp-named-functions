import {extensionConfig} from './config';
import definitions from './block-definitions.json';
import {
  createNamedFunctions,
  parseJsonOrText,
  readArgumentPath,
  toScratchValue,
  type NamedFunctions,
  type NamedFunctionsOptions
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

export type NamedFunctionsExtensionDependencies = Omit<NamedFunctionsOptions, 'functionHatOpcode'>;

type Args = Record<string, unknown>;
type Util = BlockUtilityLike & {stopThisScript?: () => void};

/** Block surface over the named-functions composition. */
export class NamedFunctionsExtension implements TurboWarpExtension {
  private lastErrorMessage = '';
  private readonly functions: NamedFunctions;

  public constructor(deps: NamedFunctionsExtensionDependencies) {
    this.functions = createNamedFunctions({...deps, functionHatOpcode: DEFINE_FUNCTION_OPCODE});
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
