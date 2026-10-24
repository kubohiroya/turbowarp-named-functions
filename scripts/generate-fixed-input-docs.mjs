import {URL} from 'node:url';
import process from 'node:process';
import {readFile, writeFile, mkdir} from 'node:fs/promises';

// Owner documentation source; regenerating the README cannot erase this block help.
const opcode = "defineFunction";
const argument = "EXPORT";
const pages = ["site/index.html"];
const help = "In the fixed-input editor, EXPORT is chosen from none or tool. The editor changes only this stored value; it does not run the function or the hat, and it leaves NAME, DESCRIPTION, SCHEMA, and RETURNS unchanged.";
const root = new URL('../', import.meta.url);
const check = process.argv.includes('--check');
const start = '<!-- BEGIN FIXED INPUT HELP -->';
const end = '<!-- END FIXED INPUT HELP -->';
const body = `${start}<p id="fixed-input-${opcode}-${argument}" class="fixed-input-editor">${help} The GUI Dialogs and FixedInputs startup flags are OFF by default; enable both and reload to use the form. Unchanged raw values are not rewritten, and connected reporters are not evaluated.</p>${end}`;
for (const page of pages) {
  const target = new URL(page, root);
  const current = await readFile(target, 'utf8');
  const article = new RegExp(`(<article id="block-${opcode}"[^>]*>)([\\s\\S]*?)(</article>)`);
  if (!article.test(current)) throw new Error(`Missing block anchor: ${page}#block-${opcode}`);
  const next = current.replace(article, (_whole, opening, text, closing) => {
    const existing = new RegExp(`${start}[\\s\\S]*?${end}`);
    return opening + text.replace(existing, '') + body + closing;
  });
  if (check) {
    if (current !== next) throw new Error(`${page}: fixed-input help is out of date.`);
  } else await writeFile(target, next);
}
const siteRoot = pages[0].split('/')[0];
const canonical = await readFile(new URL('schemas/block-editor-fixed-inputs.schema.json', root));
const generated = new URL(`${siteRoot}/schemas/block-editor-fixed-inputs.schema.json`, root);
if (check) {
  if (!(await readFile(generated)).equals(canonical)) throw new Error('Published Schema copy differs from the canonical owner Schema.');
} else {
  await mkdir(new URL(`${siteRoot}/schemas/`, root), {recursive: true});
  await writeFile(generated, canonical);
}
