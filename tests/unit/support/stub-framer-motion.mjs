// TW-2: a stand-in for framer-motion used only by react-memo-propagation.test.ts's rendered
// checks, loaded in place of the real package via stub-framer-motion-loader.mjs so that
// renderToStaticMarkup calls a plain function instead of framer-motion's real motion.* proxy.
// Every call is recorded (tag name plus the exact props object, so identity survives) into
// module-level CAPTURED_CALLS, then rendered as the matching plain host element so React's own
// prop and children handling (key, className, data-* attributes the assertions still read from
// the markup) behaves the same as the real thing. This is the "stubbed motion element" the item
// calls for: it proves whether the SAME props object reached two separate calls within one
// render, something a source-text regex can never see.
// module.register() replaces every 'framer-motion' import for the rest of this test file's own
// process once loaded (Node has no per-call scoping, no unregister), which also reaches this
// same file's other, pre-existing tests that dynamically import components across the wider
// TARGET_FILES list further up. This exports everything any of them import from framer-motion
// (AnimatePresence included, a plain children passthrough sufficient for SSR), not only what
// MythAmongThree and Showdown themselves need.
import React from 'react';

export const CAPTURED_CALLS = [];

export function resetCapturedMotionCalls() {
  CAPTURED_CALLS.length = 0;
}

function makeStub(tag) {
  return function StubMotionElement(props) {
    CAPTURED_CALLS.push({ tag, props });
    // Destructured only to drop them before the plain host element renders (framer-motion props a
    // real DOM tag would reject). oxlint's no-unused-vars wants the leading underscore that marks
    // them intentionally unused rather than a leftover.
    const { initial: _initial, animate: _animate, variants: _variants, transition: _transition, style, ...rest } = props;
    return React.createElement(tag, { ...rest, style }, props.children);
  };
}

export const motion = new Proxy({}, {
  get(_target, tag) {
    return makeStub(String(tag));
  },
});

export function useReducedMotion() {
  return false;
}

export function AnimatePresence({ children }) {
  return children ?? null;
}
