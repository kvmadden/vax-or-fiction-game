import { useEffect, useSyncExternalStore } from "react";

/**
 * The live question's stem on the phone, for the topic pattern in the shared backdrop. The phone's screens know
 * the question and the backdrop does not, and the backdrop's place in PhoneSuite is pinned by
 * tests/unit/phone-critique.test.ts, so the screens publish the stem here and the backdrop's pattern reads it.
 */
let current: string | null = null;
const listeners = new Set<() => void>();

/** Sets the live stem directly, for a caller outside React. */
export function publishPhoneTopic(statement: string | null): void {
  if (statement === current) return;
  current = statement;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Called by the phone's screens with the live question's statement, or null between questions. */
export function usePublishPhoneTopic(statement: string | null): void {
  useEffect(() => {
    publishPhoneTopic(statement);
  }, [statement]);
  useEffect(() => () => publishPhoneTopic(null), []);
}

/** The live question's statement, for the backdrop's pattern. */
export function usePhoneTopic(): string | null {
  // The static render reads the same stem, so a page rendered to markup shows the live topic too.
  return useSyncExternalStore(subscribe, () => current, () => current);
}
