import { useLayoutEffect, useState } from 'react';
import type { FormatId } from '../data/types';
import { formatCompatibility } from '../design/theme';

function viewportSize() {
  return typeof window === 'undefined'
    ? { width: 0, height: 0 }
    : { width: window.innerWidth, height: window.innerHeight };
}

/** Display-only fallback; resizing never rewrites the presenter's preference. */
export function useViewportFormat(preferred: FormatId | null, enabled = true): FormatId {
  const [viewport, setViewport] = useState(viewportSize);
  useLayoutEffect(() => {
    if (!enabled) return;
    const update = () => setViewport(viewportSize());
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [enabled]);

  const selected = preferred ?? 'widescreen';
  if (!enabled || viewport.width <= 0 || viewport.height <= 0) return selected;
  return formatCompatibility(selected, viewport.width, viewport.height).recommendedFormatId;
}
