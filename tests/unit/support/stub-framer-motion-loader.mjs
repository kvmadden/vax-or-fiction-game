// TW-2 support: a Node module customization hook (module.register, stable since Node 20.6, not
// the experimental --experimental-loader flag) that redirects the bare specifier 'framer-motion'
// to stub-framer-motion.mjs. Scoped to a single node:test child process (Node's default
// --test-isolation is "process", one file per process) by only being registered from inside
// react-memo-propagation.test.ts itself, so no other test file's real framer-motion import is
// ever affected.
const stubUrl = new URL('./stub-framer-motion.mjs', import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'framer-motion') {
    return { url: stubUrl, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
