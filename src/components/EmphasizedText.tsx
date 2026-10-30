import React from 'react';

import { splitEmphasis } from '../screens/questions/emphasis-match';

/**
 * `heading` marks words inside a heading (a stem, a takeaway headline), which already carries its own weight. `body`
 * marks words in running copy, where the mark also adds weight so it does not rest on color alone.
 */
export type EmphasisTone = 'heading' | 'body';

interface EmphasizedTextProps {
  text: string;
  /** The authored phrases for this exact text (a question's emphasis, revealEmphasis or takeawayEmphasis). */
  phrases?: readonly string[] | null;
  tone?: EmphasisTone;
  /** The data-comp-id each marked run carries. The stage stems keep "statement-emphasis", which their checks read. */
  compId?: string;
  /** Wraps each run's text, for a screen that already shapes its copy (the phone's keepCompounds). */
  renderText?: (text: string) => React.ReactNode;
}

/**
 * The one way a stem, reveal or takeaway shows its deciding words (content/editorial/emphasis.json). The look lives in
 * src/styles/emphasis.css, so a style change is one edit there.
 */
export function EmphasizedText({ text, phrases, tone = 'body', compId = 'emphasis', renderText }: EmphasizedTextProps) {
  const shape = renderText ?? ((value: string) => value);
  const parts = splitEmphasis(text, phrases);
  if (!parts.some((part) => part.emphasized)) return <>{shape(text)}</>;
  return (
    <>
      {parts.map((part, index) => part.emphasized
        ? <span key={index} className={`vof-emphasis vof-emphasis--${tone}`} data-comp-id={compId}>{shape(part.text)}</span>
        : <React.Fragment key={index}>{shape(part.text)}</React.Fragment>)}
    </>
  );
}
