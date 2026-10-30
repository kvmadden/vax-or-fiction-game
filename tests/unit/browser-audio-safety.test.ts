import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const browserHarnesses = [
  "tests/integration/app-flow.mjs",
  "tests/integration/keyboard-single-owner.test.mjs",
  "tests/integration/mounted-room.test.mjs",
  "tests/integration/phone-bundle.mjs",
  "tests/integration/presenter-controls.mjs",
  "tests/integration/stage-layout.mjs",
];

test("every browser harness initializes muted audio before its first page load", async () => {
  for (const path of browserHarnesses) {
    const source = await readFile(path, "utf8");
    const muteInit = source.indexOf("vrc_audio_muted");
    const firstLoad = source.indexOf(".goto(");
    assert.ok(muteInit >= 0, `${path} must initialize the mute preference`);
    assert.ok(firstLoad >= 0, `${path} must contain a browser page load`);
    assert.ok(muteInit < firstLoad, `${path} must initialize mute before loading a page`);
    const contextNames = [...source.matchAll(/const\s+(\w+)\s*=\s*await\s+browser\.newContext\(/g)].map((match) => match[1]);
    for (const contextName of contextNames) {
      const contextInit = source.indexOf(`${contextName}.addInitScript`);
      const contextPage = source.indexOf(`${contextName}.newPage`);
      const contextMute = source.indexOf("vrc_audio_muted", contextInit);
      assert.ok(contextInit >= 0 && contextInit < contextPage, `${path} must initialize ${contextName} before creating its page`);
      assert.ok(contextMute >= contextInit && contextMute < contextPage, `${path} must initialize ${contextName} muted`);
    }
  }
});
