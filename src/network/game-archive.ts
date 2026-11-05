import { buildClosingRecap } from '../engine/closing-recap';
import { computeLeaderboard, rankLeaderboard, type RankedLeaderboardEntry } from '../engine/leaderboard';
import { isQuestionSlide } from '../engine/kinds';
import type { Question, QuestionStats, SlideEntry } from '../data/types';
import type { GameShowdownState } from '../store/game-store';

/** Classic archive tables only accept six lowercase room-alphabet characters. */
export const ARCHIVE_ROOM_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
const ARCHIVE_ROOM_PATTERN = /^[23456789abcdefghjkmnpqrstuvwxyz]{6}$/;
const DECK_ID_PATTERN = /^[a-z0-9-]{1,64}$/;
const SHOW_ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Admin identity lives only in supabase/migrations/20260927160000_vof_recap_privacy_lockdown.sql
// (public.vrc_list_recaps checks the caller's own verified auth.uid() there), never in this
// client bundle (tests/integration/no-admin-email-in-bundle.test.mjs pins this).
// The client no longer knows or checks who the admin is. It just signs in with Supabase Auth and
// lets the RPC accept or refuse.

export interface ArchiveStanding {
  rank: number;
  nickname: string;
  score: number;
  bestStreak: number;
  hardQuestionPoints: number;
  realityGap: number;
  team: 'NAVY' | 'GOLD' | null;
}

/** What the room saw of the final round. Aggregate prediction counts only, never who picked whom. */
export type ArchiveShowdown = Pick<GameShowdownState, 'id' | 'stage' | 'finalists' | 'predictionCounts' | 'questionIds' | 'winner' | 'tie'>;

export interface ArchiveOutcome {
  questionId: string;
  number: number;
  prompt: string;
  answerText: string | null;
  accuracyPct: number | null;
  votes: number;
  kind: string | null;
}

export interface ArchiveSummary {
  room: string;
  archiveRoom: string;
  deckId: string;
  deckTitle: string;
  startedAt: string | null;
  generatedAt: string;
  participants: number;
  accuracyPct: number | null;
  mythsBusted: number;
  bestStreak: number;
  votesTotal: number;
  totalQuestions: number;
  standings: ArchiveStanding[];
  outcomes: ArchiveOutcome[];
  teams: { navy: number; gold: number } | null;
  showdown: ArchiveShowdown | null;
  offline: boolean;
}

export interface GameArchiveSnapshot {
  roomId: string;
  deckId?: string | null;
  deckTitle?: string | null;
  session?: { startedAt?: number | string | null; questions?: unknown[] } | null;
  roomStats?: {
    accuracy?: number;
    mythsBusted?: number;
    bestStreak?: number;
    votesTotal?: number;
    questions?: Record<string, QuestionStats>;
    // TEAM-SCORES: the store keys this NAVY/GOLD, uppercase (summarizeTeams, game-store.ts:635-654).
    teams?: { NAVY?: { score?: number }; GOLD?: { score?: number } };
  } | null;
  seenDevices?: Record<string, unknown>;
  run?: readonly SlideEntry[] | null;
  showdown?: GameShowdownState | null;
  venue?: string | null;
  teamsEnabled?: boolean;
}

// Same dual-path read as src/network/production-room.ts: import.meta.env under Vite, a
// globalThis.process.env fallback so this is reachable from plain node --test too, where
// import.meta.env is not populated.
function supabaseConfig(): { baseUrl: string; key: string } | null {
  const buildEnvironment = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
    ?? (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const baseUrl = (buildEnvironment?.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const key = buildEnvironment?.VITE_SUPABASE_PUBLISHABLE_KEY || '';
  if (!baseUrl || !key) return null;
  return { baseUrl, key };
}

/** Map any show room id onto the six-character archive check constraint. */
export function archiveRoomKey(roomId: string): string {
  const trimmed = String(roomId ?? '').trim();
  const lower = trimmed.toLowerCase();
  if (ARCHIVE_ROOM_PATTERN.test(lower)) return lower;

  const upper = trimmed.toUpperCase();
  let mapped = '';
  for (const ch of upper) {
    const index = SHOW_ROOM_ALPHABET.indexOf(ch);
    if (index >= 0) mapped += ARCHIVE_ROOM_ALPHABET[index % ARCHIVE_ROOM_ALPHABET.length];
  }
  let hash = 2166136261;
  for (const ch of upper) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  while (mapped.length < 6) {
    mapped += ARCHIVE_ROOM_ALPHABET[hash % ARCHIVE_ROOM_ALPHABET.length];
    hash = Math.imul(hash ^ (hash >>> 13), 1274126177) >>> 0;
  }
  return mapped.slice(0, 6);
}

function votesOn(stats: { choices?: Record<string, number>; trueCount?: number; falseCount?: number } | null | undefined): number {
  if (!stats || typeof stats !== 'object') return 0;
  const fromChoices = Object.values(stats.choices ?? {})
    .reduce((sum, count) => sum + (Number.isFinite(Number(count)) ? Number(count) : 0), 0);
  if (fromChoices > 0) return fromChoices;
  return (Number(stats.trueCount) || 0) + (Number(stats.falseCount) || 0);
}

function isoStartedAt(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    const time = Date.parse(value);
    if (!Number.isNaN(time)) return new Date(time).toISOString();
  }
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    const ms = value < 1e12 ? value * 1000 : value;
    return new Date(ms).toISOString();
  }
  return null;
}

/**
 * B3 (VOF-12): both archive rows are posted at every Closing. Only the admin account can read them
 * back, through public.vrc_list_recaps. Each standing is built field by field, so nothing a
 * leaderboard entry might carry can ride along into a row.
 */
function archiveStanding(entry: RankedLeaderboardEntry): ArchiveStanding {
  return {
    rank: entry.rank,
    nickname: entry.nickname,
    score: entry.score,
    bestStreak: entry.bestStreak,
    hardQuestionPoints: entry.hardQuestionPoints,
    realityGap: entry.realityGap,
    team: entry.team,
  };
}

/**
 * B3 (VOF-12): the host's showdown state keeps each phone's prediction keyed by its device id. The
 * archive keeps the same view the room was shown (src/network/game-projection.ts publicShowdown):
 * the finalists and the prediction counts.
 */
function archiveShowdown(showdown: GameShowdownState | null | undefined): ArchiveShowdown | null {
  if (!showdown) return null;
  return {
    id: showdown.id,
    stage: showdown.stage,
    finalists: showdown.finalists.map(({ ticket, name, score, duelPoints }) => ({ ticket, name, score, duelPoints })),
    predictionCounts: { ...showdown.predictionCounts },
    questionIds: [...showdown.questionIds],
    winner: showdown.winner,
    tie: showdown.tie,
  };
}

export function buildArchiveSummary(snapshot: GameArchiveSnapshot, now = () => new Date()): ArchiveSummary {
  const room = String(snapshot.roomId ?? '').trim();
  const archiveRoom = archiveRoomKey(room);
  const deckId = String(snapshot.deckId || 'vax-or-fiction').trim() || 'vax-or-fiction';
  const offline = snapshot.venue === 'offline';
  const standings = rankLeaderboard(computeLeaderboard(snapshot.seenDevices ?? {}, 50)).map(archiveStanding);
  const questionStats = snapshot.roomStats?.questions ?? {};
  const outcomes: ArchiveOutcome[] = [];
  let number = 0;
  for (const slide of snapshot.run ?? []) {
    if (!isQuestionSlide(slide)) continue;
    number += 1;
    const question = slide as Question & { displayNumber?: number };
    const stats = questionStats[question.id];
    const votes = votesOn(stats);
    const pct = Number(stats?.correctPct);
    outcomes.push({
      questionId: question.id,
      number: Number.isInteger(question.displayNumber) ? Number(question.displayNumber) : number,
      prompt: String(question.statement || question.scenario || '').trim(),
      answerText: question.answer == null ? null : question.answer ? 'TRUE' : 'FALSE',
      accuracyPct: Number.isFinite(pct) ? Math.round(pct) : null,
      votes,
      kind: typeof question.kind === 'string' ? question.kind : null,
    });
  }

  // TEAM-SCORES: read the real uppercase keys the store writes (summarizeTeams,
  // game-store.ts:635-654). Reading navy/gold here always missed, archiving every team score as 0.
  const teams = snapshot.teamsEnabled && snapshot.roomStats?.teams
    ? {
      navy: Number(snapshot.roomStats.teams.NAVY?.score) || 0,
      gold: Number(snapshot.roomStats.teams.GOLD?.score) || 0,
    }
    : null;

  const accuracy = Number(snapshot.roomStats?.accuracy);
  return {
    room,
    archiveRoom,
    deckId,
    deckTitle: String(snapshot.deckTitle || 'Vax or Fiction?'),
    startedAt: isoStartedAt(snapshot.session?.startedAt) ?? now().toISOString(),
    generatedAt: now().toISOString(),
    participants: standings.length || Object.keys(snapshot.seenDevices ?? {}).length,
    accuracyPct: Number.isFinite(accuracy) ? Math.round(accuracy) : null,
    mythsBusted: Math.max(0, Math.floor(Number(snapshot.roomStats?.mythsBusted) || 0)),
    bestStreak: Math.max(0, Math.floor(Number(snapshot.roomStats?.bestStreak) || 0)),
    votesTotal: Math.max(0, Math.floor(Number(snapshot.roomStats?.votesTotal) || 0)),
    totalQuestions: outcomes.length || (Array.isArray(snapshot.session?.questions) ? snapshot.session!.questions!.length : 0),
    standings,
    outcomes,
    teams,
    showdown: archiveShowdown(snapshot.showdown),
    offline,
  };
}

export function buildArchiveRecap(snapshot: GameArchiveSnapshot, summary: ArchiveSummary) {
  const closing = buildClosingRecap(snapshot.run, snapshot.roomStats as Parameters<typeof buildClosingRecap>[1], { offline: summary.offline });
  const answers: Record<string, string> = {};
  for (const outcome of summary.outcomes) {
    if (outcome.answerText) answers[outcome.questionId] = outcome.answerText;
  }
  return {
    room: summary.room,
    archiveRoom: summary.archiveRoom,
    deckId: summary.deckId,
    deck_id: summary.deckId,
    answers,
    summary: {
      startedAt: summary.startedAt,
      accuracyPct: summary.accuracyPct,
      mythsBusted: summary.mythsBusted,
      participants: summary.participants,
      bestStreak: summary.bestStreak,
      votesTotal: summary.votesTotal,
      questions: Object.fromEntries(summary.outcomes.map((outcome) => [outcome.questionId, {
        accuracyPct: outcome.accuracyPct,
        votes: outcome.votes,
      }])),
    },
    standings: summary.standings,
    outcomes: summary.outcomes,
    teams: summary.teams,
    // The archive keeps the recap's words and numbers, never their display emphasis, so a stored row does not change
    // shape with the look.
    takeaways: closing.takeaways.map(({ questionId, number, text, correctPct }) => ({ questionId, number, text, correctPct })),
    split: closing.split && {
      questionId: closing.split.questionId,
      number: closing.split.number,
      headline: closing.split.headline,
      correctPct: closing.split.correctPct,
      votes: closing.split.votes,
    },
    questionIds: summary.outcomes.map((outcome) => outcome.questionId),
  };
}

async function postRow(path: string, body: Record<string, unknown>): Promise<void> {
  const config = supabaseConfig();
  if (!config) throw new Error('Archive is unavailable without the production relay.');
  if (!DECK_ID_PATTERN.test(String(body.deck_id ?? ''))) throw new Error('deckId is invalid');
  const response = await fetch(`${config.baseUrl}/rest/v1/${path}`, {
    method: 'POST',
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`archive ${path} failed: HTTP ${response.status}${detail ? ` ${detail.slice(0, 180)}` : ''}`);
  }
}

/** The exact rows saveClosedGame posts, built in one place so a test can hold both bodies to VOF-12. */
export function buildArchivePostBodies(snapshot: GameArchiveSnapshot, now = () => new Date()) {
  const summary = buildArchiveSummary(snapshot, now);
  const recap = buildArchiveRecap(snapshot, summary);
  return {
    summary,
    sessions: {
      room: summary.archiveRoom,
      deck_id: summary.deckId,
      started_at: summary.startedAt,
      summary,
    },
    recaps: {
      room: summary.archiveRoom,
      deck_id: summary.deckId,
      recap,
    },
  };
}

/** Persist a finished show once. Failures stay quiet for the audience; callers may log. */
export async function saveClosedGame(snapshot: GameArchiveSnapshot): Promise<ArchiveSummary> {
  const { summary, sessions, recaps } = buildArchivePostBodies(snapshot);
  if (!summary.room) throw new Error('archive room is missing');
  await postRow('vrc_sessions', sessions);
  await postRow('vrc_recaps', recaps);
  return summary;
}

export interface ArchivedGameListItem {
  room: string;
  archiveRoom: string;
  deckId: string;
  createdAt: string | null;
  accuracyPct: number | null;
  participants: number;
  mythsBusted: number;
  bestStreak: number;
  standings: ArchiveStanding[];
  outcomes: ArchiveOutcome[];
  teams: { navy: number; gold: number } | null;
  takeaways: unknown;
}

/**
 * Thrown by listArchivedGames on a non-OK response, carrying the real HTTP status so the caller
 * can tell an expired session (401, PostgREST could not even verify the JWT) apart from a real
 * refusal (403, public.vrc_list_recaps ran and said no) and a server problem (5xx, nothing about
 * this session or account). A plain Error loses that distinction, and Admin.tsx needs it: an
 * expired token should clear the stored session and return to sign-in, not sit on an account that
 * can never load anything again without a manual sign-out.
 */
export class ArchiveAccessError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ArchiveAccessError';
    this.status = status;
  }
}

/**
 * Recap privacy lockdown (2026-09-27): this used to SELECT the table directly with the anon key,
 * which is exactly the list-all-recaps read the migration closes, and it never actually used the
 * admin's signed-in session for anything. It now calls the security-definer public.vrc_list_recaps
 * RPC, which checks the caller's own verified identity server-side (in SQL only, never in this
 * bundle) before returning anything, so the accessToken from verifyAdminOtp has to ride as the
 * Authorization bearer, not the anon key. Without a real accessToken there is no session for the
 * RPC to check, so this returns nothing without even asking the network. A signed-in caller who
 * fails that check gets a real, readable refusal instead of a silently empty list, since an empty
 * list here would look like "no games saved" rather than "you are signed in as the wrong account."
 */
export async function listArchivedGames(accessToken: string, limit = 40): Promise<ArchivedGameListItem[]> {
  const config = supabaseConfig();
  if (!config || !accessToken) return [];
  const capped = Math.max(1, Math.min(100, Math.floor(limit)));
  const url = `${config.baseUrl}/rest/v1/rpc/vrc_list_recaps`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ p_deck_id: 'vax-or-fiction', p_limit: capped }),
  });
  if (!response.ok) {
    if (response.status === 401) {
      throw new ArchiveAccessError('Your sign-in expired.', response.status);
    }
    if (response.status >= 500) {
      throw new ArchiveAccessError('The archive is temporarily unavailable. Try again shortly.', response.status);
    }
    throw new ArchiveAccessError('This account cannot view the archive.', response.status);
  }
  const rows = await response.json();
  if (!Array.isArray(rows)) return [];
  const now = Date.now();
  const out: ArchivedGameListItem[] = [];
  for (const row of rows) {
    if (row?.expires_at) {
      const expires = Date.parse(String(row.expires_at));
      if (!Number.isNaN(expires) && expires <= now) continue;
    }
    const recap = typeof row.recap === 'string' ? JSON.parse(row.recap) : row.recap;
    if (!recap || typeof recap !== 'object') continue;
    const summary = recap.summary && typeof recap.summary === 'object' ? recap.summary : {};
    out.push({
      room: String(recap.room || row.room || ''),
      archiveRoom: String(recap.archiveRoom || row.room || ''),
      deckId: String(row.deck_id || recap.deckId || 'vax-or-fiction'),
      createdAt: row.created_at ?? null,
      accuracyPct: Number.isFinite(Number(summary.accuracyPct)) ? Math.round(Number(summary.accuracyPct)) : null,
      participants: Math.max(0, Math.floor(Number(summary.participants) || 0)),
      mythsBusted: Math.max(0, Math.floor(Number(summary.mythsBusted) || 0)),
      bestStreak: Math.max(0, Math.floor(Number(summary.bestStreak) || 0)),
      standings: Array.isArray(recap.standings) ? recap.standings : [],
      outcomes: Array.isArray(recap.outcomes) ? recap.outcomes : [],
      teams: recap.teams && typeof recap.teams === 'object' ? recap.teams : null,
      takeaways: recap.takeaways ?? null,
    });
  }
  return out;
}

export async function requestAdminOtp(email: string): Promise<void> {
  const config = supabaseConfig();
  if (!config) throw new Error('Sign-in is unavailable without the production relay.');
  const normalized = email.trim().toLowerCase();
  if (!normalized) throw new Error('Enter an email address.');
  // No ADMIN_EMAIL check here: Supabase Auth is asked with create_user: false, so a code is only
  // ever issued to an address that already has a real user, and the real gate is server-side
  // (public.vrc_list_recaps checking the signed-in user id), not this client-side string.
  const response = await fetch(`${config.baseUrl}/auth/v1/otp`, {
    method: 'POST',
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: normalized, create_user: false }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Could not send the sign-in code.${detail ? ` ${detail.slice(0, 120)}` : ''}`);
  }
}

export async function verifyAdminOtp(email: string, token: string): Promise<{ accessToken: string; email: string }> {
  const config = supabaseConfig();
  if (!config) throw new Error('Sign-in is unavailable without the production relay.');
  const normalized = email.trim().toLowerCase();
  const response = await fetch(`${config.baseUrl}/auth/v1/verify`, {
    method: 'POST',
    headers: {
      apikey: config.key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'email', email: normalized, token: token.trim() }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    throw new Error(body.msg || body.error_description || 'That code did not work.');
  }
  // No ADMIN_EMAIL check here either: any address that can complete OTP verification gets a
  // session, and listArchivedGames below surfaces whatever public.vrc_list_recaps decides about
  // that session's user id. A non-admin who somehow signs in just sees a clear refusal there.
  const userEmail = String(body.user?.email || normalized).toLowerCase();
  return { accessToken: String(body.access_token), email: userEmail };
}
