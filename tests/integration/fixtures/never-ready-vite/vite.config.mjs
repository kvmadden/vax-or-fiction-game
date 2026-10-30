// TW-5 regression fixture. A Vite config that never resolves, standing in for a hung plugin or a
// config load that never settles, so tests/integration/render-harness.mjs's startInProcessVite can
// prove it bounds that startup instead of hanging forever. Never imported by the real app.
export default new Promise(() => {});
