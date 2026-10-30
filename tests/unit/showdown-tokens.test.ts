import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Showdown } from '../../src/screens/Showdown';
import { useGameStore } from '../../src/store/game-store';
import { presentationBundle } from './css-declarations';

describe('Task 6 / DS-02: Showdown.tsx Restyle and Token Discipline', () => {
  const showdownPath = path.resolve(process.cwd(), 'src/screens/Showdown.tsx');
  const tokensCssPath = path.resolve(process.cwd(), 'src/design/tokens.css');
  const showdownContent = fs.readFileSync(showdownPath, 'utf8');
  const presentationCss = presentationBundle();
  const tokensCss = fs.readFileSync(tokensCssPath, 'utf8');

  it('Showdown.tsx contains 0 Tailwind typography utility classes', () => {
    const forbiddenTailwindTypography = [
      /\btext-3xl\b/,
      /\btext-4xl\b/,
      /\btext-5xl\b/,
      /\blg:text-4xl\b/,
      /\blg:text-5xl\b/,
      /\bfont-black\b/,
      /\bfont-extrabold\b/,
    ];

    for (const pattern of forbiddenTailwindTypography) {
      const match = showdownContent.match(pattern);
      assert.strictEqual(
        match,
        null,
        `Found forbidden Tailwind typography class matching ${pattern} in Showdown.tsx`
      );
    }
  });

  it('Showdown.tsx contains 0 Tailwind responsive or layout classes', () => {
    const forbiddenTailwindLayout = [
      /\bhidden md:flex\b/,
      /\bmd:grid-cols-2\b/,
      /\bgrid-cols-1\b/,
      /\brounded-2xl\b/,
      /\brounded-3xl\b/,
      /\bp-6\b/,
      /\bp-8\b/,
    ];

    for (const pattern of forbiddenTailwindLayout) {
      const match = showdownContent.match(pattern);
      assert.strictEqual(
        match,
        null,
        `Found forbidden Tailwind layout class matching ${pattern} in Showdown.tsx`
      );
    }
  });

  it('Showdown.tsx does not use inline colorTokens or fontStacks', () => {
    assert.doesNotMatch(
      showdownContent,
      /colorTokens\./,
      'Showdown.tsx must not use inline colorTokens; use CSS variables / semantic classes instead'
    );
    assert.doesNotMatch(
      showdownContent,
      /fontStacks\./,
      'Showdown.tsx must not use inline fontStacks; use CSS variables / semantic classes instead'
    );
    assert.doesNotMatch(
      showdownContent,
      /spacingScale\./,
      'Showdown.tsx must not use inline spacingScale; use CSS variables / semantic classes instead'
    );
    assert.doesNotMatch(
      showdownContent,
      /liquidGlass\./,
      'Showdown.tsx must not use inline liquidGlass; use CSS variables / semantic classes instead'
    );
  });

  it('Showdown stylesheet rules reference declared CSS tokens', () => {
    const declaredTokens = new Set([...tokensCss.matchAll(/--[a-zA-Z0-9_-]+/g)].map((m) => m[0]));
    const showdownCssMatches = [...presentationCss.matchAll(/var\(\s*(--color-[a-zA-Z0-9_-]+)\s*\)/g)];
    assert.ok(showdownCssMatches.length > 0, 'Showdown presentation CSS must reference color tokens');

    const undeclared: string[] = [];
    for (const match of showdownCssMatches) {
      const varName = match[1];
      if (!declaredTokens.has(varName)) {
        undeclared.push(varName);
      }
    }
    assert.deepEqual([...new Set(undeclared)], [], 'Showdown CSS contains undeclared color variables');
  });

  it('Showdown renders semantic classes across lineup, duel, and result stages', () => {
    useGameStore.setState({
      sessionId: 'test-showdown',
      modeId: 'full',
      run: [
        { id: 'q1', type: 'question', kind: 'binary', statement: 'Statement 1', answer: true, takeaway: 'Takeaway 1' } as any,
      ],
      slideIndex: 0,
      phase: 'showdown',
      showdownEnabled: true,
      showdown: {
        id: 'test-showdown:showdown',
        stage: 'lineup',
        finalists: [
          { ticket: 'F-1', name: 'Alpha', score: 10, duelPoints: 0 },
          { ticket: 'F-2', name: 'Beta', score: 8, duelPoints: 0 },
        ],
        predictions: { dev1: 'F-1' },
        predictionCounts: { 'F-1': 1, 'F-2': 0 },
        questionIds: ['q1'],
        questionIndex: 0,
        winner: null,
        tie: false,
        isRecap: true,
      },
    });

    const lineupHtml = renderToString(React.createElement(Showdown));
    assert.ok(lineupHtml.includes('showdown-screen'), 'Must render showdown-screen');
    assert.ok(lineupHtml.includes('showdown-finalist-card'), 'Must render showdown-finalist-card');
    assert.ok(lineupHtml.includes('showdown-finalist-name'), 'Must render showdown-finalist-name');

    const duelHtml = renderToString(React.createElement(Showdown, { stage: 'duel' }));
    assert.ok(duelHtml.includes('showdown-score-card'), 'Must render showdown-score-card');
    assert.ok(duelHtml.includes('showdown-evidence-card'), 'Must render showdown-evidence-card');

    const resultHtml = renderToString(React.createElement(Showdown, { stage: 'result' }));
    assert.ok(resultHtml.includes('showdown-result-hero'), 'Must render showdown-result-hero');
    assert.ok(resultHtml.includes('showdown-result-tile'), 'Must render showdown-result-tile');
  });
});
