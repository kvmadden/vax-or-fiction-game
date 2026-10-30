import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Preflight renders QR code and room code for both room and teams venues', () => {
  const tsx = fs.readFileSync(path.resolve('src/screens/Preflight.tsx'), 'utf8');
  // QR code frame should not be gated solely on activeVenue === 'room'
  assert.doesNotMatch(tsx, /activeVenue === 'room'\s*\?\s*\(\s*<div className="setup-room-qr"/);
  assert.match(tsx, /setup-room-qr/);
  assert.match(tsx, /setup-room-code/);
});

test('Lobby renders QR code and room code for both room and teams venues', () => {
  const tsx = fs.readFileSync(path.resolve('src/screens/Lobby.tsx'), 'utf8');
  // QR code should be rendered without checking activeVenue === 'room' exclusively
  assert.doesNotMatch(tsx, /activeVenue === "room"\s*\?\s*\(\s*<>\s*<div className="lobby-qr-frame"/);
  assert.match(tsx, /lobby-qr-frame/);
  assert.match(tsx, /lobby-room-code/);
});

test('TitleSlide and InstructionsSlide enable join pill in live venues', () => {
  const titleTsx = fs.readFileSync(path.resolve('src/screens/TitleSlide.tsx'), 'utf8');
  const instructionsTsx = fs.readFileSync(path.resolve('src/screens/InstructionsSlide.tsx'), 'utf8');
  assert.doesNotMatch(titleTsx, /<ShowChrome [^>]*showJoin=\{false\}/);
  assert.doesNotMatch(instructionsTsx, /<ShowChrome [^>]*showJoin=\{false\}/);
});
