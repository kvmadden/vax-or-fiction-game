import React, { useCallback, useEffect, useState } from 'react';
import { ShowWordmark } from '../components/show/ShowWordmark';
import {
  ArchiveAccessError,
  listArchivedGames,
  requestAdminOtp,
  verifyAdminOtp,
  type ArchivedGameListItem,
} from '../network/game-archive';
import { tapUi } from '../engine/audio-cues';
import { leaderboardRowKey } from '../phone/leaderboard-row-key';

const SESSION_KEY = 'vof-admin-session';

interface AdminSession {
  accessToken: string;
  email: string;
}

// No ADMIN_EMAIL comparison here: this only restores a plausibly-shaped stored session across a
// reload within the same tab. It is not the security boundary. public.vrc_list_recaps checks the
// signed-in user id server-side on every call, so a stored session for the wrong account still gets
// refused there, same as a fresh sign-in would.
function readSession(): AdminSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AdminSession;
    if (parsed?.email && parsed.accessToken) return parsed;
  } catch {
    /* private mode */
  }
  return null;
}

function writeSession(session: AdminSession | null) {
  try {
    if (!session) sessionStorage.removeItem(SESSION_KEY);
    else sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* private mode */
  }
}

function formatWhen(value: string | null): string {
  if (!value) return 'Unknown time';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export const Admin: React.FC = () => {
  const [session, setSession] = useState<AdminSession | null>(() => readSession());
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [games, setGames] = useState<ArchivedGameListItem[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [loadingGames, setLoadingGames] = useState(false);

  const selected = games.find((game) => game.archiveRoom === selectedRoom) ?? games[0] ?? null;

  // Shared by signOut and an expired-session refusal: clears the stored session and every
  // in-memory bit of it, optionally leaving one message behind to explain why.
  const clearSession = useCallback((message = '') => {
    writeSession(null);
    setSession(null);
    setGames([]);
    setSelectedRoom(null);
    setCode('');
    setCodeSent(false);
    setError(message);
  }, []);

  const loadGames = useCallback(async () => {
    if (!session) return;
    setLoadingGames(true);
    setError('');
    try {
      const rows = await listArchivedGames(session.accessToken);
      setGames(rows);
      setSelectedRoom((current) => current ?? rows[0]?.archiveRoom ?? null);
    } catch (err) {
      if (err instanceof ArchiveAccessError && err.status === 401) {
        // An expired or otherwise unverifiable token: PostgREST never even reached
        // public.vrc_list_recaps, so nothing here is a real refusal. Go back to sign-in instead
        // of leaving the admin stuck on a session that can never load anything again.
        clearSession('Your sign-in expired. Sign in again.');
        return;
      }
      setError(err instanceof Error ? err.message : 'Could not load past games.');
    } finally {
      setLoadingGames(false);
    }
  }, [session, clearSession]);

  useEffect(() => {
    if (!session) return;
    void loadGames();
  }, [session, loadGames]);

  const sendCode = async (event: React.FormEvent) => {
    event.preventDefault();
    tapUi();
    setBusy(true);
    setError('');
    try {
      await requestAdminOtp(email);
      setCodeSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the code.');
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (event: React.FormEvent) => {
    event.preventDefault();
    tapUi();
    setBusy(true);
    setError('');
    try {
      const next = await verifyAdminOtp(email, code);
      writeSession(next);
      setSession(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That code did not work.');
    } finally {
      setBusy(false);
    }
  };

  const signOut = () => {
    tapUi();
    clearSession();
  };

  if (!session) {
    return (
      <main className="admin-screen" data-screen="admin">
        <div className="admin-stage" aria-hidden="true"><div className="show-lights" /></div>
        <header className="admin-brand">
          <ShowWordmark />
          <p className="admin-kicker">Past games</p>
        </header>
        <form className="admin-card" onSubmit={codeSent ? verifyCode : sendCode}>
          <h1>Sign in</h1>
          <p className="admin-copy">Use the admin inbox. A one-time code arrives by email.</p>
          <label className="admin-field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          {codeSent ? (
            <label className="admin-field">
              <span>Code</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                required
              />
            </label>
          ) : null}
          {error ? <p className="admin-error" role="alert">{error}</p> : null}
          <button className="admin-primary" type="submit" disabled={busy}>
            {busy ? 'Working…' : codeSent ? 'Open the archive' : 'Email me a code'}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="admin-screen admin-screen--signed-in" data-screen="admin">
      <div className="admin-stage" aria-hidden="true"><div className="show-lights" /></div>
      <header className="admin-top">
        <div>
          <p className="admin-kicker">Past games</p>
          <h1>Show archive</h1>
          <p className="admin-copy">{session.email}</p>
        </div>
        <div className="admin-top-actions">
          <button type="button" className="admin-secondary" onClick={() => { tapUi(); void loadGames(); }} disabled={loadingGames}>
            {loadingGames ? 'Refreshing…' : 'Refresh'}
          </button>
          <button type="button" className="admin-secondary" onClick={signOut}>Sign out</button>
        </div>
      </header>

      {error ? <p className="admin-error" role="alert">{error}</p> : null}

      <div className="admin-layout">
        <section className="admin-list" aria-label="Past games">
          {games.length === 0 && !loadingGames ? (
            <p className="admin-empty">No closed games are saved yet. Finish a live room to create the first record.</p>
          ) : null}
          {games.map((game) => (
            <button
              key={`${game.archiveRoom}-${game.createdAt}`}
              type="button"
              className={`admin-game${selected?.archiveRoom === game.archiveRoom ? ' is-selected' : ''}`}
              onClick={() => { tapUi(); setSelectedRoom(game.archiveRoom); }}
            >
              <span className="admin-game-room">{game.room || game.archiveRoom}</span>
              <span className="admin-game-when">{formatWhen(game.createdAt)}</span>
              <span className="admin-game-stats">
                {game.accuracyPct == null ? 'No votes' : `${game.accuracyPct}% accuracy`}
                {' · '}
                {game.participants} {game.participants === 1 ? 'player' : 'players'}
              </span>
            </button>
          ))}
        </section>

        {selected ? (
          <section className="admin-detail" aria-label={`Game ${selected.room || selected.archiveRoom}`}>
            <header className="admin-detail-header">
              <h2>Room {selected.room || selected.archiveRoom}</h2>
              <p>{formatWhen(selected.createdAt)}</p>
            </header>

            <div className="admin-stat-row">
              <div><span>Accuracy</span><strong>{selected.accuracyPct == null ? 'n/a' : `${selected.accuracyPct}%`}</strong></div>
              <div><span>Players</span><strong>{selected.participants}</strong></div>
              <div><span>Myths busted</span><strong>{selected.mythsBusted}</strong></div>
              <div><span>Best streak</span><strong>{selected.bestStreak}</strong></div>
            </div>

            {selected.teams ? (
              <div className="admin-panel">
                <h3>Teams</h3>
                <p>Navy {selected.teams.navy} · Gold {selected.teams.gold}</p>
              </div>
            ) : null}

            <div className="admin-panel">
              <h3>Standings</h3>
              {selected.standings.length === 0 ? (
                <p className="admin-empty">No named standings for this room.</p>
              ) : (
                <ol className="admin-standings">
                  {selected.standings.map((row, index) => (
                    <li key={leaderboardRowKey(row, index)}>
                      <span className="admin-rank">{row.rank}</span>
                      <span className="admin-name">{row.nickname}</span>
                      <span className="admin-score">{row.score}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div className="admin-panel">
              <h3>Outcomes</h3>
              {selected.outcomes.length === 0 ? (
                <p className="admin-empty">No question outcomes were stored for this room.</p>
              ) : (
                <ul className="admin-outcomes">
                  {selected.outcomes.map((outcome) => (
                    <li key={outcome.questionId}>
                      <span className="admin-outcome-n">Q{outcome.number}</span>
                      <span className="admin-outcome-prompt">{outcome.prompt || outcome.questionId}</span>
                      <span className="admin-outcome-meta">
                        {outcome.accuracyPct == null ? 'n/a' : `${outcome.accuracyPct}%`}
                        {outcome.votes ? ` · ${outcome.votes} votes` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
};

export default Admin;
