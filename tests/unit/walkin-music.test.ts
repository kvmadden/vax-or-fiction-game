import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('TitleSlide and Lobby configure walkin music and equalizer', () => {
  const titleTsx = fs.readFileSync(path.resolve('src/screens/TitleSlide.tsx'), 'utf8');
  const lobbyTsx = fs.readFileSync(path.resolve('src/screens/Lobby.tsx'), 'utf8');
  assert.match(titleTsx, /musicPlaying/);
  assert.match(titleTsx, /now-playing-bars/);
  assert.match(lobbyTsx, /musicPlaying/);
  assert.match(lobbyTsx, /now-playing-bars/);
});
