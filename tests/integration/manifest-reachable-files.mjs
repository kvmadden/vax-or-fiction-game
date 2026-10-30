import path from 'node:path';

/**
 * Walks a Vite build manifest (the dist/.vite/manifest.json shape: each key a module id, each
 * value an entry with a built `file`, static `imports`, and lazy `dynamicImports`) from `startKeys`,
 * returning the built file basenames reachable from them.
 *
 * Static `imports` are always followed. `dynamicImports` (lazy `import()` targets) are followed
 * only when `followDynamic` is true. That split lets a caller seed a lazy-loaded route's own entry
 * point (one of ITS parent's dynamicImports, so the parent's own traversal never reaches it) and
 * still get everything that route reaches, including any further lazy import it makes of its own,
 * without pulling in sibling routes the parent's dynamicImports name (other lazy routes reached only
 * by a different URL branch than the one being walked).
 */
export function manifestReachableFiles(manifest, startKeys, { followDynamic = false, skipKeys = [] } = {}) {
  const reached = new Set();
  // Every dynamic-entry chunk Vite builds (any lazy-loaded route) lists the real entry (index.html)
  // back in its OWN static `imports`, so the browser loads the entry's JS/CSS before the lazy chunk
  // runs. That back-reference means a static-imports walk seeded at a lazy route always loops back
  // to the entry, and if `followDynamic` is on anywhere in that walk, it would re-expand the entry's
  // OTHER dynamicImports (every sibling lazy route) right back in, undoing the whole point of
  // scoping a walk to one route's own subtree. `skipKeys` breaks that loop by pre-marking a key
  // visited so its edges are never expanded, without needing it added to `reached` (a separate
  // traversal seeded at that key already covers it).
  const visited = new Set(skipKeys);
  const stack = [...startKeys];
  while (stack.length > 0) {
    const key = stack.pop();
    if (visited.has(key)) continue;
    visited.add(key);
    const entry = manifest[key];
    if (!entry) continue;
    if (entry.file) reached.add(path.basename(entry.file));
    for (const imported of entry.imports ?? []) stack.push(imported);
    if (followDynamic) for (const imported of entry.dynamicImports ?? []) stack.push(imported);
  }
  return reached;
}
