// Copy lint (VOF-43): nothing the game shows uses a semicolon or an em-dash. tests/unit/natural-copy.test.ts runs
// findBannedCopy over every bundled and solo deck.
export const BANNED_IN_COPY = /[;—]/;

// Every string in value that still carries a semicolon or an em-dash, with its path.
export function findBannedCopy(value, root = '') {
  const hits = [];
  const walk = (v, p) => {
    if (typeof v === 'string') { if (BANNED_IN_COPY.test(v)) hits.push({ path: p, text: v }); return; }
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${p}[${i}]`));
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, p ? `${p}.${k}` : k);
  };
  walk(value, root);
  return hits;
}
