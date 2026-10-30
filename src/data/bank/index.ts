// src/data/bank/index.ts (phase 2). Hand-written, no deck imports (4.2: nothing under src/ imports content/bank/,
// and this file reads only the generated runtime slice, never a deck module).
import { BANK_META, BANK_COPIES } from './metadata.generated'
import type { RuntimeMeta } from './types'

/**
 * Resolves a deck question's bank id: its own id if it is a primary appearance, or the primary's id if it is a
 * copy (4.3). Returns null for a question with no metadata record yet (a draft not built, or a question the
 * backfill has not reached).
 */
export function bankIdFor(deckId: string, questionId: string): string | null {
  const key = `${deckId}:${questionId}`
  if (BANK_META[key]) return key
  return BANK_COPIES[key] ?? null
}

/**
 * Reads a question's runtime metadata slice (4.7): the solo dealer, solo Adaptive and host adaptive call this,
 * never the phone. Returns null when the question carries no bank record.
 */
export function bankMetaFor(deckId: string, questionId: string): RuntimeMeta | null {
  const bankId = bankIdFor(deckId, questionId)
  if (!bankId) return null
  return BANK_META[bankId] ?? null
}
