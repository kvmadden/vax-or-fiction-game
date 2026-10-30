import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * Rule-scoped CSS reads for layout tests.
 *
 * Layout assertions used to be written as `/\.rule \{[\s\S]*font-size:\s*40px/`, which matches a
 * declaration from any later rule in the file and so passes for the wrong reason. These helpers
 * read a declaration out of the rules that actually carry the selector, and let a test assert a
 * floor ("the room can read this") instead of pinning an exact pixel that any retune has to chase.
 *
 * Not named `*.test.ts`, so the unit runner's glob leaves it alone.
 */

interface Rule {
  selectors: string[];
  declarations: [string, string][];
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Flat top-level rules. At-rule bodies are walked too, so nested rules are still reachable. */
function parseRules(css: string): Rule[] {
  const rules: Rule[] = [];
  const source = stripComments(css);
  let prelude = '';
  let depth = 0;
  let body = '';
  for (const character of source) {
    if (depth === 0) {
      if (character === '{') { depth = 1; body = ''; continue; }
      if (character === '}') { prelude = ''; continue; }
      prelude += character;
      continue;
    }
    if (character === '{') { depth += 1; body += character; continue; }
    if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        const selector = prelude.trim();
        prelude = '';
        // An at-rule (`@media`, `@layer`, `@supports`) wraps rules rather than declarations.
        if (selector.startsWith('@')) rules.push(...parseRules(body));
        else if (selector) {
          rules.push({
            selectors: selector.split(',').map((part) => part.trim().replace(/\s+/g, ' ')).filter(Boolean),
            declarations: body.split(';')
              .map((entry) => entry.trim())
              .filter(Boolean)
              .flatMap((entry) => {
                const colon = entry.indexOf(':');
                if (colon < 1) return [];
                return [[entry.slice(0, colon).trim(), entry.slice(colon + 1).trim().replace(/\s*!important$/, '')] as [string, string]];
              }),
          });
        }
        continue;
      }
      body += character;
      continue;
    }
    body += character;
  }
  return rules;
}

/**
 * The value a selector's own rules give a property: the last declaration among every rule that
 * lists the selector, or null when none of them set it. Whitespace inside the selector is
 * normalised, so `.a  .b` and `.a .b` are the same lookup.
 */
export function declaration(css: string, selector: string, property: string): string | null {
  const wanted = selector.trim().replace(/\s+/g, ' ');
  let value: string | null = null;
  for (const rule of parseRules(css)) {
    if (!rule.selectors.includes(wanted)) continue;
    for (const [name, declared] of rule.declarations) {
      if (name === property) value = declared;
    }
  }
  return value;
}

/** Inline `@import './x.css'` so tests that used to grep one monolith still see extracted owners. */
export function loadStyleSheet(absPath: string, seen = new Set<string>()): string {
  const path = resolve(absPath);
  if (seen.has(path)) return "";
  seen.add(path);
  const source = readFileSync(path, "utf8");
  return source.replace(/@import\s+['"](\.[^'"]+)['"]\s*;/g, (_match, rel: string) =>
    loadStyleSheet(resolve(dirname(path), rel), seen),
  );
}

export function presentationBundle(): string {
  return [
    loadStyleSheet(resolve(process.cwd(), "src/styles/presentation.css")),
    readFileSync(resolve(process.cwd(), "src/styles/phone-live.css"), "utf8"),
    readFileSync(resolve(process.cwd(), "src/styles/opening-stage.css"), "utf8"),
    readFileSync(resolve(process.cwd(), "src/styles/question-chrome.css"), "utf8"),
    readFileSync(resolve(process.cwd(), "src/styles/presenter-remote.css"), "utf8"),
  ].join("\n");
}

/** A `px` declaration as a number, for floor assertions. Throws when it is missing or not px. */
export function pixels(css: string, selector: string, property: string): number {
  const value = declaration(css, selector, property);
  const match = value?.match(/^(-?[\d.]+)px$/);
  if (!match) throw new Error(`${selector} { ${property} } is ${value ?? 'unset'}, expected a px length`);
  return Number(match[1]);
}
