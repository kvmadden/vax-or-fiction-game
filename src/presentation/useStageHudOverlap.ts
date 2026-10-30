import { useLayoutEffect, type RefObject } from 'react';
import type { FormatId } from '../data/types';

export function useStageHudOverlap(shellRef: RefObject<HTMLElement | null>, format: FormatId, property: string) {
  // The real host controls are a viewport portal; reserve only their overlap with this
  // screen. Direct previews have no router and retain their authored frame.
  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell?.closest('[data-testid="screen-router"]')) return;
    let portal: Element | null = null;
    let frame = 0;
    const measure = () => {
      const question = shell.getBoundingClientRect();
      const controls = portal?.getBoundingClientRect();
      const overlap = controls && controls.height > 0 ? Math.max(0, question.bottom - controls.top) : 0;
      shell.style.setProperty(property, `${overlap}px`);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const resize = new ResizeObserver(schedule);
    const attach = () => {
      const next = document.querySelector('[data-role="hud-portal"]');
      if (next !== portal) {
        if (portal) resize.unobserve(portal);
        portal = next;
        if (portal) resize.observe(portal);
      }
      schedule();
    };
    const stage = shell.closest('.scaled-stage-container');
    if (stage) resize.observe(stage);
    const scaledContent = shell.closest('.scaled-stage-content');
    const scaleChanges = new MutationObserver(schedule);
    if (scaledContent) scaleChanges.observe(scaledContent, { attributes: true, attributeFilter: ['style'] });
    // Even the reduced-motion CSS uses a short transition. Read the final geometry
    // after scaling/sizing finishes, not only when its target style is committed.
    const scaleSettled = (event: Event) => {
      if (event.target === scaledContent || event.target === scaledContent?.parentElement) schedule();
    };
    stage?.addEventListener('transitionend', scaleSettled);
    const mutations = new MutationObserver(attach);
    mutations.observe(document.body, { childList: true });
    attach();
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      scaleChanges.disconnect();
      stage?.removeEventListener('transitionend', scaleSettled);
      mutations.disconnect();
      window.removeEventListener('resize', schedule);
      shell.style.removeProperty(property);
    };
  }, [shellRef, format, property]);

}
