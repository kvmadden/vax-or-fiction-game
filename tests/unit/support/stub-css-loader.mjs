// Node module customization hook (module.register, stable since Node 20.6, not the experimental
// --experimental-loader flag) that no-ops any `.css` specifier a component imports directly.
// SitePage.tsx colocates its own stylesheet (VOF-45 fix pass) the same way App.tsx globally
// imports its own CSS files; Vite handles a real .css import at build time, but plain
// `node --import tsx` has no CSS loader at all, so importing a component that imports its own
// stylesheet crashes with ERR_UNKNOWN_FILE_EXTENSION unless something intercepts it first.
// Scoped to a single node:test child process (Node's default --test-isolation is "process", one
// file per process) by only being registered from inside the test file(s) that need it, so no
// other test file's CSS handling (there is none elsewhere; this is the only colocated CSS import
// in the tree) is ever affected.
export async function load(url, context, nextLoad) {
  if (url.endsWith('.css')) {
    return { format: 'module', shortCircuit: true, source: 'export default {};' };
  }
  return nextLoad(url, context);
}
