import {readFileSync} from 'node:fs';
import {NamedFunctionsExtension, DEFINE_FUNCTION_OPCODE} from '../src/extension.js';
import {FakeRuntime, targetWithFunctions} from './helpers/fake-runtime.js';
import {scanFunctionDefinitions} from '../src/function-registry.js';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {createFixedInputEditor, EditorRegistry} from '@kubohiroya/turbowarp-extension-data-editor';
import type {BlockEditorHost, FixedBlockSnapshot, FixedInputDraft, JsonObject, JsonValue, LiteralArgumentChange} from '@kubohiroya/turbowarp-extension-data-editor';
import {compileSchemaBundle} from '@kubohiroya/turbowarp-extension-data-editor/schema';
import {fixedInputEditorDefinitions, registerFixedInputEditors} from '../src/fixed-input-editors.js';
import {fixedInputSchemaBundle} from '../src/fixed-input-schema.js';

const options = fixedInputEditorDefinitions[0]!;
const argument = 'EXPORT';
const opening = 'none';
const retainedArguments: Record<string, string> = {"NAME": " untouched ", "DESCRIPTION": " keep description ", "SCHEMA": "{ intentionally-not-parsed", "RETURNS": "[ untouched"};
const replacement = 'tool';
const definition = () => createFixedInputEditor(options);
afterEach(() => vi.unstubAllGlobals());

function fixture(raw = opening, reporter = false) {
  const registry = new EditorRegistry();
  const remove = registerFixedInputEditors({gui: {blockEditors: {apiVersion: 1,
    registerFixedInputEditor: (value: typeof options) => registry.registerFixed(createFixedInputEditor(value))}}}, fixedInputEditorDefinitions);
  const snapshot: FixedBlockSnapshot = {
    targetId: 'sprite', blockId: 'owner-block', opcode: options.opcodes[0]!, revision: '1',
    arguments: {[argument]: reporter ? {kind: 'reporter'} : {kind: 'literal', value: raw},
      UNBOUND: {kind: 'literal', value: '  untouched source  '},
      ...Object.fromEntries(Object.entries(retainedArguments).map(([name, value]) => [name, {kind: 'literal' as const, value}]))},
    fixedContext: {contractId: options.contractId, contractRevision: options.contractRevision,
      generation: 'generation-1', dependencies: [], readOnlyArguments: [], inputs: {
        [argument]: reporter ? {role: 'editable', source: 'reporter', identity: 'reporter-1'}
          : {role: 'editable', source: 'field', identity: 'literal-1',
            field: {blockId: 'literal-block', name: 'EXPORT', type: 'field_dropdown'}}
      }}
  };
  const commits: (readonly LiteralArgumentChange[])[] = [];
  const host: BlockEditorHost = {readBlock: () => snapshot, commit: () => {throw new Error('Legacy port was used.');},
    fixedInputs: {capability: 'fixed-inputs-v1', readBlock: () => snapshot, commit: request => {commits.push(request.changes);}}};
  const session = registry.open({targetId: 'sprite', blockId: 'owner-block'}, host)!;
  function edit(value: JsonValue, buffer?: string) {
    const draft = session.getDraft();
    (draft.inputs as JsonObject)[argument] = {value, changed: true, ...(buffer === undefined ? {} : {buffer})};
    session.setDraft(draft);
  }
  return {session, snapshot, commits, remove, edit};
}

describe('fixed input owner contract', () => {
  it('compiles the on-disk canonical field and registers exactly the planned argument', () => {
    expect(compileSchemaBundle(fixedInputSchemaBundle).kind).toBe('compiled');
    expect(definition().editableArguments).toEqual([argument]);
    expect(definition().readOnlyArguments).toEqual([]);
    expect(definition().opcodes).toEqual(options.opcodes);
    expect(fixedInputSchemaBundle.root.artifact.role).toBe('canonical-schema');
    expect(fixedInputSchemaBundle.provenance.canonicalSources[0]!.symbol).toContain(`/properties/${argument}`);
  });
  it('keeps no-op raw and unrelated arguments without a patch', async () => {
    const f = fixture();
    expect(await f.session.save()).toEqual({status: 'saved', changed: false});
    expect(f.commits).toEqual([]);
    expect(f.snapshot.arguments.UNBOUND).toEqual({kind: 'literal', value: '  untouched source  '});
    for (const [name, value] of Object.entries(retainedArguments)) expect(f.snapshot.arguments[name]).toEqual({kind: 'literal', value});
    f.remove();
  });
  it('commits only the explicitly selected literal through the fixed port', async () => {
    const f = fixture();
    f.edit(replacement);
    expect(await f.session.save()).toEqual({status: 'saved', changed: true});
    expect(f.commits).toEqual([[{argument, value: replacement}]]);
    expect(f.snapshot.arguments.UNBOUND).toEqual({kind: 'literal', value: '  untouched source  '});
    for (const [name, value] of Object.entries(retainedArguments)) expect(f.snapshot.arguments[name]).toEqual({kind: 'literal', value});
    f.remove();
  });
  it('rejects invalid changed values without a patch and retains the dialog draft', async () => {
    const f = fixture();
    f.edit('unknown-value');
    expect((await f.session.save()).status).toBe('invalid');
    expect(f.commits).toEqual([]);
    expect((f.session.getDraft() as FixedInputDraft).inputs[argument]).toMatchObject({changed: true});
    f.remove();
  });
  it('never evaluates or replaces a reporter-backed input', async () => {
    const f = fixture(opening, true);
    expect((f.session.getDraft() as FixedInputDraft).inputs[argument]).toEqual({readOnly: true});
    expect(f.session.getFixedInputView()!.inputs[argument]!.state).toBe('readonly');
    expect(await f.session.save()).toEqual({status: 'saved', changed: false});
    expect(f.commits).toEqual([]);f.remove();
  });
  it('fails closed for a forged reporter edit', async () => {
    const f = fixture(opening, true);f.edit(replacement);
    expect((await f.session.save()).status).toBe('invalid');expect(f.commits).toEqual([]);f.remove();
  });
  it('keeps optional capability absent or version mismatch inactive', () => {
    expect(() => registerFixedInputEditors({}, fixedInputEditorDefinitions)()).not.toThrow();
    const register = vi.fn();
    registerFixedInputEditors({gui: {blockEditors: {apiVersion: 2, registerFixedInputEditor: register}}}, fixedInputEditorDefinitions)();
    expect(register).not.toHaveBeenCalled();
  });
  it('unregisters once on runtime disposal and permits later re-registration', () => {
    const listeners = new Map<string, () => void>();const unregister = vi.fn();
    const scratch = {gui: {blockEditors: {apiVersion: 1, registerFixedInputEditor: vi.fn(() => unregister)}},
      vm: {runtime: {on: (event: string, fn: () => void) => listeners.set(event, fn),
        off: (event: string) => listeners.delete(event)}}};
    const dispose = registerFixedInputEditors(scratch, fixedInputEditorDefinitions);
    listeners.get('RUNTIME_DISPOSED')!();dispose();expect(unregister).toHaveBeenCalledTimes(1);expect(listeners.size).toBe(0);
    registerFixedInputEditors(scratch, fixedInputEditorDefinitions)();expect(unregister).toHaveBeenCalledTimes(2);
  });
  it('releases prior registrations if a later registration fails', () => {
    const unregister = vi.fn();let calls = 0;
    expect(() => registerFixedInputEditors({gui: {blockEditors: {apiVersion: 1, registerFixedInputEditor: () => {
      if (++calls === 2) throw new Error('registration failed');return unregister;
    }}}}, [options, options])).toThrow('registration failed');
    expect(unregister).toHaveBeenCalledTimes(1);
  });
  it('does not register inactive owner definitions or attach lifecycle listeners', () => {
    const register = vi.fn();const on = vi.fn();
    registerFixedInputEditors({gui: {blockEditors: {apiVersion: 1, registerFixedInputEditor: register}}, vm: {runtime: {on}}}, [])();
    expect(register).not.toHaveBeenCalled();expect(on).not.toHaveBeenCalled();
  });
  it('does not execute owner codecs while registering static metadata', () => {
    const binding = options.bindings[0]!;const read = vi.fn(binding.read);const encode = vi.fn(binding.encode);const validate = vi.fn(binding.validateCandidate);
    registerFixedInputEditors({gui: {blockEditors: {apiVersion: 1, registerFixedInputEditor: () => () => {}}}},
      [{...options, bindings: [{...binding, read, encode, validateCandidate: validate}]}])();
    expect(read).not.toHaveBeenCalled();expect(encode).not.toHaveBeenCalled();expect(validate).not.toHaveBeenCalled();
  });
});

describe('enum compatibility', () => {
  it('keeps unknown raw for repair without selecting the first item', async () => {
    const f = fixture('future-enum');
    expect((f.session.getDraft() as FixedInputDraft).inputs[argument]).toMatchObject({value: 'future-enum', changed: false});
    expect(await f.session.save()).toEqual({status: 'saved', changed: false});expect(f.commits).toEqual([]);f.remove();
  });
  it('repairs unknown raw only by an explicit canonical choice', async () => {
    const f = fixture('future-enum');f.edit(replacement);
    expect(await f.session.save()).toEqual({status: 'saved', changed: true});expect(f.commits).toEqual([[{argument, value: replacement}]]);f.remove();
  });
});

describe('real Named Functions HAT metadata and registry parity', () => {
  it('registers the direct HAT dropdown without starting hats or changing metadata', () => {
    const runtime = new FakeRuntime();const start = vi.spyOn(runtime, 'startHats');const remove = vi.fn();const register = vi.fn(() => remove);
    vi.stubGlobal('Scratch', {gui: {blockEditors: {apiVersion: 1, registerFixedInputEditor: register}},
      BlockType: {COMMAND: 'command', REPORTER: 'reporter', BOOLEAN: 'boolean', HAT: 'hat'},
      ArgumentType: {STRING: 'string', NUMBER: 'number', BOOLEAN: 'boolean'}, translate: (value: string) => value});
    const extension = new NamedFunctionsExtension({runtime});const before = extension.getInfo();expect(extension.getInfo()).toEqual(before);
    expect(register).toHaveBeenCalledTimes(1);expect(start).not.toHaveBeenCalled();
    const hat = (before.blocks as {opcode: string; blockType: string; isEdgeActivated?: boolean}[]).find(block => block.opcode === 'defineFunction')!;
    expect(hat.blockType).toBe('hat');expect(hat.isEdgeActivated).toBe(false);
    expect((before.menus as {exportModes: unknown}).exportModes).toEqual({acceptReporters: false, items: ['none', 'tool']});
    extension.dispose();extension.dispose();expect(remove).toHaveBeenCalledTimes(1);
  });
  it.each(['none', 'tool', ' TOOL ', 'future'])('preserves unchanged direct field %s while leaving registry runtime unchanged', async raw => {
    const target = targetWithFunctions(DEFINE_FUNCTION_OPCODE, [{name: 'sample'}]);
    const hat = Object.values(target.blocks._blocks).find(block => block.opcode === DEFINE_FUNCTION_OPCODE)!;
    hat.fields!.EXPORT!.value = raw;
    const scan = scanFunctionDefinitions([target], DEFINE_FUNCTION_OPCODE);
    expect(scan.errors).toEqual([]);expect(scan.functions[0]!.exportAs).toBe(raw === 'tool' ? 'tool' : 'none');
    const f = fixture(raw);expect((f.session.getDraft() as FixedInputDraft).inputs[argument]).toMatchObject({value: raw, changed: false});
    expect(await f.session.save()).toEqual({status: 'saved', changed: false});expect(f.commits).toEqual([]);f.remove();
  });
});

it('rejects duplicate registrations without removing the first owner registration', () => {
  const registry = new EditorRegistry();
  const scratch = {gui: {blockEditors: {apiVersion: 1,
    registerFixedInputEditor: (value: typeof options) => registry.registerFixed(createFixedInputEditor(value))}}};
  const dispose = registerFixedInputEditors(scratch, fixedInputEditorDefinitions);
  expect(() => registerFixedInputEditors(scratch, fixedInputEditorDefinitions)).toThrow();
  expect(registry.resolveFixed(options.opcodes[0]!)).toMatchObject({contractId: options.contractId});
  dispose();expect(registry.resolveFixed(options.opcodes[0]!)).toBeUndefined();
});

it('does not construct function execution state if fixed registration fails', () => {
  const runtime = new FakeRuntime();const on = vi.spyOn(runtime, 'on');
  vi.stubGlobal('Scratch', {gui: {blockEditors: {apiVersion: 1, registerFixedInputEditor() {throw new Error('fixed registration failure');}}}});
  expect(() => new NamedFunctionsExtension({runtime})).toThrow('fixed registration failure');expect(on).not.toHaveBeenCalled();
});
it('rolls back fixed registration if the existing function composition constructor fails', () => {
  const runtime = new FakeRuntime();const remove = vi.fn();const original = runtime.on.bind(runtime);
  vi.spyOn(runtime, 'on').mockImplementation((event, listener) => {
    if (event === 'PROJECT_STOP_ALL') throw new Error('composition constructor failure');original(event, listener);
  });
  vi.stubGlobal('Scratch', {gui: {blockEditors: {apiVersion: 1, registerFixedInputEditor: () => remove}}});
  expect(() => new NamedFunctionsExtension({runtime})).toThrow('composition constructor failure');
  expect(remove).toHaveBeenCalledTimes(1);runtime.emit('RUNTIME_DISPOSED');expect(remove).toHaveBeenCalledTimes(1);
});

it('keeps the docsURI landing-page block anchor linked to generated fixed-form help and the canonical Schema copy', () => {
  const html = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
  expect(html).toContain('href="#block-defineFunction"');
  const article = html.match(/<article id="block-defineFunction"[^>]*>[\s\S]*?<\/article>/)![0];
  expect(article).toContain('id="fixed-input-defineFunction-EXPORT"');expect(article).toContain('FixedInputs');expect(article).toContain('EXPORT');
  expect(readFileSync(new URL('../site/schemas/block-editor-fixed-inputs.schema.json', import.meta.url), 'utf8'))
    .toBe(readFileSync(new URL('../schemas/block-editor-fixed-inputs.schema.json', import.meta.url), 'utf8'));
});
