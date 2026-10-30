import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import React from 'react';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import { ErrorBoundary, SlideErrorBoundary } from '../../src/components/ErrorBoundary';

const repoRoot = path.resolve(import.meta.dirname, '../..');
// The direct tsx test transform retains React.createElement for this legacy class component.
(globalThis as { React?: typeof React }).React = React;

test('the current app and presentation suite mount their intended error boundaries', async () => {
  const [appSource, presentationSource] = await Promise.all([
    readFile(path.join(repoRoot, 'src/App.tsx'), 'utf8'),
    readFile(path.join(repoRoot, 'src/presentation/PresentationSuite.tsx'), 'utf8'),
  ]);
  const boundaryChildren = (source: string) => {
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
  };
  const suites = ['PresentationSuite', 'PhoneSuite', 'RemoteSuite', 'SoloSuite', 'Admin'];
  const covered = boundaryChildren(appSource);
  for (const suite of suites) assert.ok(covered.has(suite), `${suite} lacks its error boundary`);
  const noBoundaryControl = boundaryChildren(appSource.replaceAll('ErrorBoundary>', 'div>'));
  assert.equal(suites.filter((suite) => noBoundaryControl.has(suite)).length, 0, 'control must see removed boundaries');
  assert.match(presentationSource, /<SlideErrorBoundary\b/);
  assert.match(presentationSource, /onSkip=\{\(\) => dispatch\(\{type: 'SKIP'\}\)\}/);
  console.log(`coverage: ${suites.length} lazy suites inside root boundaries, slide boundary, and removed-boundary control`);
});

test('ErrorBoundary renders its recovery surface from an actual captured state', () => {
  const boundary = new ErrorBoundary({ children: React.createElement('div', null, 'child') });
  boundary.state = ErrorBoundary.getDerivedStateFromError(new Error('synthetic root failure')) as typeof boundary.state;
  const html = renderToStaticMarkup(boundary.render() as React.ReactElement);
  assert.match(html, /Something went wrong\./);
  assert.match(html, /synthetic root failure/);
  assert.match(html, /Reload the page/);
  assert.doesNotMatch(html, />child</);
});

test('ErrorBoundary derives a clean state when its reset key changes', () => {
  const reset = (ErrorBoundary as unknown as {
    getDerivedStateFromProps?: (props: { resetKey: string }, state: { hasError: boolean; error: Error | null; resetKey: string }) => unknown;
  }).getDerivedStateFromProps;
  assert.equal(typeof reset, 'function');
  assert.deepEqual(
    reset?.({ resetKey: 'next' }, { hasError: true, error: new Error('synthetic root failure'), resetKey: 'previous' }),
    { hasError: false, error: null, resetKey: 'next' },
  );
});

test('SlideErrorBoundary renders scoped skip recovery from an actual captured state', () => {
  const boundary = new SlideErrorBoundary({ children: React.createElement('div', null, 'slide') });
  boundary.state = SlideErrorBoundary.getDerivedStateFromError(new Error('synthetic slide failure')) as typeof boundary.state;
  const html = renderToStaticMarkup(boundary.render() as React.ReactElement);
  assert.match(html, /data-role="slide-error-boundary"/);
  assert.match(html, /synthetic slide failure/);
  assert.match(html, /Skip this slide/);
  assert.match(html, /Press S to skip this slide/);
  assert.doesNotMatch(html, /Press Space to skip/);
  assert.doesNotMatch(html, />slide</);
});

test.skip('malformed question props are outside the typed runtime contract; ingress validation is covered by network-projection and relay tests');
