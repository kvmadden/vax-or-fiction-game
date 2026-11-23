import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { FormatId } from '../../src/data/types.ts';
import { useViewportFormat } from '../../src/presentation/useViewportFormat.ts';

// Server rendering runs the hook's initial-state path without requiring a browser
// or a DOM test dependency. Restore the global so other tests cannot inherit it.
function renderedFormat(
  preferred: FormatId | null,
  viewport: { width: number; height: number } | null,
  enabled = true,
): string {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  try {
    if (viewport === null) {
      Reflect.deleteProperty(globalThis, 'window');
    } else {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: { innerWidth: viewport.width, innerHeight: viewport.height },
      });
    }

    function Probe() {
      return React.createElement('span', null, useViewportFormat(preferred, enabled));
    }
    return renderToStaticMarkup(React.createElement(Probe));
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
  }
}

test('without a browser, defaults to widescreen and respects an explicit preference', () => {
  assert.equal(renderedFormat(null, null), '<span>widescreen</span>');
  assert.equal(renderedFormat('square', null), '<span>square</span>');
});

test('an incompatible widescreen preference falls back to portrait on a narrow phone', () => {
  assert.equal(
    renderedFormat('widescreen', { width: 390, height: 844 }),
    '<span>portrait</span>',
  );
});

test('a compatible selected format is kept rather than replaced', () => {
  assert.equal(
    renderedFormat('square', { width: 1200, height: 1200 }),
    '<span>square</span>',
  );
});

test('disabling viewport fallback retains the preference even on a narrow phone', () => {
  assert.equal(
    renderedFormat('widescreen', { width: 390, height: 844 }, false),
    '<span>widescreen</span>',
  );
});
