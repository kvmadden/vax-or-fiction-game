import React from 'react';

/**
 * Keeps each hyphenated word or en-dash range on one line ("out-of- / range" and "50– / 74" never split). A compound
 * wider than its line still wraps inside, at its hyphens, so nothing runs off a narrow screen. Other words wrap as usual.
 */
export function keepCompounds(text: string): React.ReactNode {
  const parts = text.split(/(\S+[-–]\S+)/);
  if (parts.length === 1) return text;
  return parts.map((part, index) => (index % 2 === 1 ? <span key={index} className="keep-compound">{part}</span> : part));
}
