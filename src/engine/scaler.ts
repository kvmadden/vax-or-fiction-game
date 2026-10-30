import { FormatId } from "../data/types";
import { formatDefinitions } from "../design/theme";

export const FORMAT_DIMENSIONS = Object.fromEntries(
  Object.entries(formatDefinitions).map(([formatId, { width, height }]) => [
    formatId,
    { width, height },
  ]),
) as Record<FormatId, { width: number; height: number }>;

/**
 * Computes the CSS transform scale to letterbox/pillarbox a target format within the window.
 * @param windowWidth - Available viewport width in pixels
 * @param windowHeight - Available viewport height in pixels
 * @param formatId - Target aspect ratio format
 * @returns Scale multiplier
 */
export function computeScale(windowWidth: number, windowHeight: number, formatId: FormatId = "widescreen"): number {
  if (windowWidth <= 0 || windowHeight <= 0) return 1.0;

  const format = FORMAT_DIMENSIONS[formatId] || FORMAT_DIMENSIONS.widescreen;
  const scaleX = windowWidth / format.width;
  const scaleY = windowHeight / format.height;

  // Fit to screen by taking the smaller scale factor
  return Math.min(scaleX, scaleY);
}
