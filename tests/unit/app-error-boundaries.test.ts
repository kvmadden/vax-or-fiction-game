import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const appSource = readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf8');

/** Every JSX tag reached while already inside an <ErrorBoundary>...</ErrorBoundary>. */
function boundaryChildren(source: string): Set<string> {
  const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const covered = new Set<string>();
  const visit = (node: ts.Node, insideBoundary = false) => {
    const tag = ts.isJsxElement(node) ? node.openingElement.tagName.getText(ast)
      : ts.isJsxSelfClosingElement(node) ? node.tagName.getText(ast) : null;
    if (insideBoundary && tag) covered.add(tag);
    ts.forEachChild(node, (child) => visit(child, insideBoundary || tag === 'ErrorBoundary'));
  };
  visit(ast);
  return covered;
}

test('Entry renders inside the shared ErrorBoundary like every other route (QA-ERR-01)', () => {
  const covered = boundaryChildren(appSource);
  assert.ok(covered.has('Entry'), 'Entry lacks its error boundary');
  // Control: the same check must be able to see a boundary that really is missing, so a pass above
  // means the source changed, not that this check is vacuous.
  const noBoundaryControl = boundaryChildren(appSource.replaceAll('ErrorBoundary>', 'div>'));
  assert.equal(noBoundaryControl.has('Entry'), false, 'control must see the removed boundary');
});
