import test from 'node:test';
import assert from 'node:assert/strict';
import { HUDAutoHideController, DEFAULT_AUTO_HIDE_DELAY_MS } from '../../src/facilitator/hud-auto-hide.ts';

test('HUDAutoHideController initializes with default delay and arms timer', (t) => {
  t.mock.timers.enable();
  let hidden = false;
  const controller = new HUDAutoHideController({
    autoHideDelay: DEFAULT_AUTO_HIDE_DELAY_MS,
    onHide: () => { hidden = true; },
    isVisible: true,
  });

  assert.equal(controller.autoHideDelay, 2500);
  assert.equal(controller.isTimerActive(), true);
  assert.equal(hidden, false);

  t.mock.timers.tick(2400);
  assert.equal(hidden, false);

  t.mock.timers.tick(100);
  assert.equal(hidden, true);

  controller.dispose();
});

test('HUDAutoHideController resets on user activity and throttles rapid calls', (t) => {
  t.mock.timers.enable();
  let hidden = false;
  const controller = new HUDAutoHideController({
    autoHideDelay: 2500,
    onHide: () => { hidden = true; },
    isVisible: true,
    throttleMs: 250,
  });

  t.mock.timers.tick(2000);
  assert.equal(hidden, false);

  const handled = controller.handleActivity(true);
  assert.equal(handled, true);

  t.mock.timers.tick(50);
  const rapidHandled = controller.handleActivity(false);
  assert.equal(rapidHandled, false);

  t.mock.timers.tick(2000);
  assert.equal(hidden, false);

  t.mock.timers.tick(500);
  assert.equal(hidden, true);

  controller.dispose();
});

test('HUDAutoHideController suppresses timer when hovered, focused, or pinned', (t) => {
  t.mock.timers.enable();
  let hidden = false;
  const controller = new HUDAutoHideController({
    autoHideDelay: 2500,
    onHide: () => { hidden = true; },
    isVisible: true,
    isHovered: true,
  });

  assert.equal(controller.isTimerActive(), false);
  t.mock.timers.tick(5000);
  assert.equal(hidden, false);

  controller.updateState({ isHovered: false });
  assert.equal(controller.isTimerActive(), true);
  t.mock.timers.tick(2500);
  assert.equal(hidden, true);

  hidden = false;
  controller.updateState({ isVisible: true, isPinned: true });
  assert.equal(controller.isTimerActive(), false);
  t.mock.timers.tick(5000);
  assert.equal(hidden, false);

  controller.dispose();
});
