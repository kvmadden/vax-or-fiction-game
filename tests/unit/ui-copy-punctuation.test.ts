// VOF-43 (2026-09-15): no semicolons and no em-dashes in on-screen text, aria-labels included.
// Parses every source file so comments and code syntax never count, only strings and JSX text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const ROOT = new URL('../../src/', import.meta.url).pathname;
const SKIP = [/\/data\/decks\//];
const files: string[] = [];
const walk = (dir: string): void => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts') && !SKIP.some((pattern) => pattern.test(path))) files.push(path);
  }
};
walk(ROOT);

const ENTITY = /&(?:[a-z]+|#\d+);/gi;
const CSS_DECLARATIONS = /(^|;)\s*[-a-z]+\s*:\s*[^;]+;/i;
// A prose semicolon either continues into more text in the same literal, or closes the
// literal outright (a sung or spoken line broken across array entries, like a lyric couplet,
// still ends its own sentence with a semicolon that this scan must see).
const PROSE_SEMICOLON = /[\p{L}\p{N})'"’”]\s*;\s*(?:\p{L}|$)/u;
export function offends(text: string): boolean {
  const plain = text.replace(ENTITY, ' ').trimEnd();
  if (plain.includes('—')) return true;
  return PROSE_SEMICOLON.test(plain) && !CSS_DECLARATIONS.test(plain);
}

test('the offense rule itself: prose semicolons and em-dashes count, entities and CSS do not', () => {
  assert.equal(offends('No network needed; use hands-up voting'), true);
  assert.equal(offends('Something went wrong — press Space'), true);
  assert.equal(offends('Details &amp; sources'), false);
  assert.equal(offends('color: red; font-size: 12px;'), false);
  assert.equal(offends('data:image/svg+xml;utf8,<svg/>'), false);
  assert.equal(offends('Bring what you know, then test your view;'), true);
});

test('no on-screen string or JSX text carries a prose semicolon or an em-dash (VOF-43)', () => {
  const hits: string[] = [];
  let literals = 0;
  for (const file of files) {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (node: ts.Node): void => {
      let text: string | undefined;
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) text = node.text;
      else if (ts.isJsxText(node)) text = node.getText(source);
      if (text !== undefined) {
        literals += 1;
        if (offends(text)) hits.push(`${relative(ROOT, file)}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1} ${text.trim().slice(0, 100)}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  assert.ok(files.length > 50 && literals > 1000, `the scan must see the app source, it saw ${files.length} files and ${literals} strings`);
  assert.deepEqual(hits, []);
});
