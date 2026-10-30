# Architecture

`App.tsx` parses the URL with `resolveAppRoute` and mounts exactly one lazy-loaded suite:

| URL | Suite | Purpose |
| --- | --- | --- |
| `/` | `Entry` | Choose Host, Join or Solo |
| `/?room=CODE&host=1` | `PresentationSuite` | Host setup, the shared stage, HUD, timer, scoring, and the room host |
| `/join?room=CODE` | `PhoneSuite` | Join, vote, react, see your own result and rank |
| `/remote?remote=CODE.KEY` | `RemoteSuite` | A paired phone as the presenter's clicker |
| `/play` | `SoloSuite` | One player, no room, no network |
| `/about`, `/disclaimer`, `/privacy`, `/terms`, `/credits` | Site pages | Each its own chunk |
| `/admin` | `Admin` | Signed-in archive of finished games (optional Supabase backend only) |

## One authoritative host

The host's Zustand store (`src/store/game-store.ts`) owns phase, the current question instance, votes, settlement,
scores, leaderboard, timer and the optional Showdown. The state machine (`src/engine/state-machine.ts`) is one-way
through each question: entering, deliberating, locked (or timed out), revealed, explaining. A reveal is never undone.

Phones never receive the host store. `src/network/game-projection.ts` builds two projections on every change:

- **Public room state** for every phone. While voting is open it carries the question but not the key. For an order
  question the step tokens are opaque and re-shuffled per occurrence, because the canonical order is the answer.
- **Attendee state** for one phone: its own vote, correctness, points and rank.

`src/network/guards.ts` validates every message shape on both ends with exact key lists, so an unknown or extra key
is refused rather than ignored.

## Relays

`connectConfiguredRoom` (`src/network/configured-room.ts`) picks one:

- **Local (default).** `npm run dev` attaches `server/room-relay.mjs` to the Vite HTTP server at
  `/api/rooms/:roomId/ws`. The relay binds room, role, credential and device during the handshake, forwards host
  state only to attendees, and limits message size, rate and replay. `npm run relay` runs the same relay standalone
  (`VOF_RELAY_HOST`, `VOF_RELAY_PORT`), and `VITE_WS_URL` points a build at it.
- **Supabase (optional).** With `VITE_PRODUCTION_RELAY=true`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`,
  `src/network/production-room.ts` polls one security-definer Postgres function, `public.vof_relay_exchange`, over the
  REST RPC endpoint with the publishable key. The function applies the same validation as the local relay, plus
  per-network room budgets. The schema and functions are in `supabase/migrations/`. Nothing in the browser uses a
  service-role key. If the flag is set and a value is missing, the host shows an explicit offline error.

A static build with neither configured still serves solo play and the hands-up offline venue. Phone rooms need one of
the relays.

## Solo

`SoloSuite` runs the same store and the phone's own vote and reveal screens in one page, with no room and no network
calls. Topic decks load on demand. The dealer (`src/solo/dealer.ts`) and the question-bank metadata it reads are
described in `docs/QUESTION-BANK.md`.

## Admin archive

With the Supabase backend, a closed online game saves a recap. `/admin` signs in with Supabase Auth email OTP and
calls `public.vrc_list_recaps`, which checks `auth.uid()` against one configured admin user id. Anon can insert recaps
but cannot read them. Recaps expire after 30 days and session summaries after 90, deleted by a trigger on the next
insert.
