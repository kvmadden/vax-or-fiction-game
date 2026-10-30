import React, { Suspense, lazy, useState } from "react";
import { useLook } from "../look";
import { usePhoneTopic } from "./phone-topic";
import { askedFor, layerMounted } from "./pattern-setting";
import { useQuietViewer } from "./quiet-viewer";
import type { TopicPatternProps } from "./TopicPattern";

/**
 * Where a surface mounts its topic pattern (VOF-94). This file is all that loads with the page. The pattern layer
 * itself (TopicPattern, its stylesheet, the index of questions) is fetched the first time a question is on screen
 * and the page's patterns are on, so a page that never asks one, whose host switched patterns off, or whose viewer asks
 * for less transparency or forced colours (who would never see it), downloads none of it. A question's own tile loads
 * after that, and only for the family that question belongs to.
 */
const nothing: React.FC<TopicPatternProps> = () => null;
/**
 * A layer that cannot be fetched (a dropped connection, or a tab left open across a deploy that replaced the chunk) becomes a layer
 * that draws nothing, so the pattern, which is decoration, never takes a question down with it. React keeps a rejected import and
 * would throw it again on every remount, and a browser remembers a module that failed to load, so the empty layer stays for the
 * rest of the page session. Reloading the page tries again.
 */
const TopicPattern = lazy(() => import("./TopicPattern").catch((error: unknown) => {
  console.warn("The topic pattern layer could not be loaded, so questions go without it until the page is reloaded.", error);
  return { default: nothing };
}));

/**
 * A layer that loads and then throws must not take a question down either. The boundary draws nothing in its place and says so in the
 * console, so a real fault stays visible to a person who looks, and a question never shows an error card for a decoration.
 */
class LayerBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    console.error("The topic pattern layer failed while it was drawing, so questions go without it until the page is reloaded.", error);
  }

  render(): React.ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

export interface TopicPatternSlotProps {
  surface: "stage" | "phone" | "preview";
  /** The question's statement, or null when no question is on screen. */
  statement: string | null;
}

export const TopicPatternSlot: React.FC<TopicPatternSlotProps> = React.memo(({ surface, statement }) => {
  const { patterns } = useLook();
  const quiet = useQuietViewer();
  const [asked, setAsked] = useState(false);
  const askedNow = askedFor(asked, patterns, statement);
  if (askedNow !== asked) setAsked(askedNow);
  if (!layerMounted(askedNow, patterns, quiet)) return null;
  return (
    <LayerBoundary>
      <Suspense fallback={null}>
        <TopicPattern surface={surface} statement={statement} />
      </Suspense>
    </LayerBoundary>
  );
});

TopicPatternSlot.displayName = "TopicPatternSlot";

/** The phone's slot, in the shared backdrop, on the stem the phone's screens publish (phone-topic.ts). */
export const PhoneTopicSlot: React.FC = () => {
  const statement = usePhoneTopic();
  return <TopicPatternSlot surface="phone" statement={statement} />;
};

export default TopicPatternSlot;
