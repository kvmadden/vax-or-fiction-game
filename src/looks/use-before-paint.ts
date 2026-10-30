import { useEffect, useLayoutEffect } from "react";

/** Before paint in a browser, so a page never shows one frame of the wrong look. A node render has no paint to guard. */
export const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;
