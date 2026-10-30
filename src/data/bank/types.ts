// src/data/bank/types.ts (phase 2). No player text lives here.
import type { QuestionKind } from '../types'

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert'
export type DifficultySource = 'rubric' | 'play'
export type SkillType = 'recall' | 'application' | 'judgment' | 'communication' | 'estimation' | 'sequencing'
export type AudiencePitch = 'everyone' | 'pharmacy-team' | 'immunizer'
export type QuestionStatus = 'live' | 'draft' | 'retired'
export type Rotation = 'core' | 'alternate'
export type Subject = 'flu' | 'rsv' | 'shingles' | 'pneumococcal' | 'hpv' | 'hepatitis-b' | 'tetanus'
  | 'public-health' | 'covid-19' | 'other-vaccines' | 'at-the-counter' | 'what-to-say'
export type Vaccine = 'influenza' | 'rsv' | 'zoster' | 'pneumococcal' | 'hpv' | 'hepatitis-b' | 'tdap-td'
  | 'covid-19' | 'mmr' | 'varicella' | 'hepatitis-a' | 'meningococcal' | 'hib' | 'polio' | 'mpox'
  | 'rotavirus' | 'travel' | 'smallpox' | 'any'
export type Population = 'infants' | 'children' | 'adolescents' | 'adults-19-49' | 'adults-50-64'
  | 'adults-65-plus' | 'pregnancy' | 'immunocompromised' | 'chronic-conditions'
  | 'health-care-personnel' | 'travelers' | 'all-ages'
export type Volatility = 'stable' | 'seasonal' | 'recommendation'
export type WordingFlag = 'buried-hinge' | 'jargon' | 'extreme-words' | 'hard-to-parse' | 'gives-itself-away' | 'too-long'

export interface RaterEntry {
  role: 'rater-a' | 'rater-b' | 'adjudicator' | 'owner'
  level: Difficulty | 'defect'
  reason: string              // one line, 140 characters or fewer
  sure: boolean
  flags: WordingFlag[]
  rater: string               // agent run id and model, or 'owner' with the ruling id
  ratedOn: string             // YYYY-MM-DD
}

export interface PlayEvidence {
  surface: 'room' | 'solo'
  answered: number
  right: number
  sessions: number            // games or rounds that answered it
  chance: number               // from the question's own options (8.9)
  knowledgeRate: number        // (right / answered - chance) / (1 - chance)
  interval90: [number, number] // on the knowledge rate
  window: { from: string, to: string } // YYYY-MM
  soloOffset?: number          // required when surface is 'solo': the calibration applied (8.9)
  measuredOn: string
}

export interface DifficultyRecord {
  level: Difficulty
  source: DifficultySource
  rationale: string           // the deciding one-line reason
  provisional: boolean        // true for estimates until play data arrives
  ratings: RaterEntry[]
  play?: PlayEvidence         // required when source is 'play'
  history: { level: Difficulty, source: DifficultySource, changedOn: string, why: string, playSnapshot?: PlayEvidence[] }[]
}

export interface EvidenceClaim {
  id: string                  // c1, c2 ...
  role: 'key' | 'distractor' | 'number' | 'sequence' | 'reveal' | 'takeaway' | 'note'
  text: string                // the claim in plain words
  url: string                 // an allowlisted host for agent-drafted claims (7.4)
  quote: string                // the supporting sentence, verbatim from the fetched page
  retrievedOn: string          // YYYY-MM-DD of the live fetch that found the quote
  pageUpdated: string | null   // the page's own last-updated date, when it shows one
}

export interface EvidenceRecord {
  sourceIds: string[]          // deck citation ids, or content/bank/sources.json ids
  claims: EvidenceClaim[]      // required for agent-drafted. Filled for owner-authored by the phase 2 sweep
  guidelineVersion: string | null
  retrievedOn: string | null
  volatility: Volatility
  reviewBy: string             // YYYY-MM-DD
}

export interface AgentRun { runId: string, taskType: string, model: string, promptVersion: string, ranOn: string }

export type Provenance =
  | { origin: 'owner-authored', basis: string }    // e.g. 'VOF-26 show port', 'VOF-44 solo topic decks'
  | {
      origin: 'agent-drafted'
      batchId: string
      draftId: string
      approvedOn: string
      approvalRecord: string    // path to approval.json
      agents: { drafter: AgentRun, editor: AgentRun, evidenceChecker: AgentRun, approver: AgentRun, adjudicator?: AgentRun }
    }

export interface QuestionMetadata {
  bankId: string
  copies: string[]             // other deckId:questionId appearances of this question
  kind: QuestionKind            // cross-check against the deck, never a source of truth
  textVersion: number
  textHash: string               // sha256 of the normalized stem, options and key
  status: QuestionStatus
  subject: Subject
  rotation: Rotation
  conceptId: string
  tags: string[]
  vaccines: Vaccine[]
  populations: Population[]
  skill: SkillType
  audience: AudiencePitch
  difficulty: DifficultyRecord  // every record carries a final level. scripts/build-bank.mjs refuses anything else
  evidence: EvidenceRecord
  provenance: Provenance
  wordingFlags: WordingFlag[]  // notes for the owner on frozen text
  notes?: string
}

// What ships in the bundle, generated from the records above.
export interface RuntimeMeta {
  subject: Subject
  kind: QuestionKind
  textVersion: number           // the host reports it with each play count (8.9)
  difficulty: Difficulty
  conceptId: string
  rotation: Rotation
  status: QuestionStatus
  skill: SkillType
  audience: AudiencePitch
}
