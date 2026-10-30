import React, { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useGameStore } from "../store/game-store";

/** The most phones one room seats: the relay turns the next one away (server/room-relay.mjs and the production relay). */
export const ROOM_MAX_PHONES = 250;

export interface Arrival {
  id: string;
  name: string;
  joinedAt: number;
}

/** Newest first, ties by device id so the order never shuffles. Every joined name shows, so the list stops only at the room's cap. */
export function lobbyArrivals(
  devices: Record<string, { nickname?: string | null; joinedAt?: number | null } | null | undefined>,
  limit = ROOM_MAX_PHONES,
): Arrival[] {
  return Object.entries(devices)
    .map(([id, device]) => ({
      id,
      name: device?.nickname?.trim() || "Player",
      joinedAt: Number(device?.joinedAt) || 0,
    }))
    .sort((a, b) => b.joinedAt - a.joinedAt || a.id.localeCompare(b.id))
    .slice(0, limit);
}

function firstLetter(name: string): string {
  const first = Array.from(name.trim())[0];
  return first ? first.toUpperCase() : "?";
}

/**
 * VOF-97 (the owner's pick of 2026-10-05, option B): a joined player's name is never hidden, and the names keep today's size
 * as long as the lobby can make room for them. The roster takes the copy column's free height, and the lobby steps through
 * these fit states, in order, until every name shows. A state is a plate size (0 is today's plate, 1 to 3 smaller plates,
 * 4 to 11 plain names, each smaller than the last) and a room level (0 as designed, 1 a smaller wordmark, 2 a smaller wordmark
 * still and no hype line, 3 for the biggest rooms, also no walk-in band). The wordmark makes room first, so today's plates
 * hold through a dozen phones. Then the plates step down, and the walk-in band gives way last, only once the smallest
 * names no longer fit above it.
 */
export interface RosterFit {
  plate: number;
  room: number;
}
export const ROSTER_PLATE_STEPS = 12;
const ROOM_STEPS = 4;
const BIGGEST_ROOM = ROOM_STEPS - 1;
const platesAt = (room: number, from = 0): RosterFit[] => Array.from({ length: ROSTER_PLATE_STEPS - from }, (_, i) => ({ plate: from + i, room }));
export const ROSTER_FIT_ORDER: readonly RosterFit[] = [
  ...Array.from({ length: BIGGEST_ROOM }, (_, room) => ({ plate: 0, room })),
  ...platesAt(BIGGEST_ROOM - 1, 1),
  ...platesAt(BIGGEST_ROOM),
];

function useRosterFit(listRef: React.RefObject<HTMLUListElement | null>, arrivals: Arrival[]): void {
  // Where the last walk landed, and the names it fitted. A state that fits a room also fits that room with a name gone, so
  // while names only join, the first state that fits can only move later: the walk resumes where it last landed. Any other
  // change, a name leaving or renamed, starts it over.
  const lastFit = useRef(0);
  const fitted = useRef<Map<string, string>>(new Map());
  // The stage's and copy column's sizes when a walk last ended, so a resize the walk itself caused is not taken for a new one.
  const settled = useRef<Map<Element, string>>(new Map());
  const walk = useCallback((from: number) => {
    const list = listRef.current;
    const lobby = list?.closest<HTMLElement>(".preshow-lobby");
    if (!list || !lobby) return;
    // The list's own box, and every name inside its plate: a name its ellipsis cuts short is a hidden name too.
    const fits = () => {
      if (list.scrollHeight > list.clientHeight + 1 || list.scrollWidth > list.clientWidth + 1) return false;
      for (const name of list.querySelectorAll<HTMLElement>(".lobby-arrival__name")) {
        if (name.scrollWidth > name.clientWidth + 1) return false;
      }
      return true;
    };
    // Reduced motion runs every transition for 0.01 ms (presentation.css), and a size read straight after a change returns
    // the size it starts from. The walk turns transitions off while it measures, as the stage's measured step does, and the
    // transforms of names landing or sliding along, which would read as more or less room than the names take.
    lobby.dataset.rosterMeasuring = "true";
    try {
      let index = Math.max(0, Math.min(from, ROSTER_FIT_ORDER.length - 1));
      for (; index < ROSTER_FIT_ORDER.length; index += 1) {
        const state = ROSTER_FIT_ORDER[index]!;
        list.dataset.plate = String(state.plate);
        lobby.dataset.rosterRoom = String(state.room);
        if (fits()) break;
      }
      lastFit.current = Math.min(index, ROSTER_FIT_ORDER.length - 1);
      for (const box of [lobby.querySelector(".lobby-stage"), list.closest(".lobby-copy")]) {
        if (box) settled.current.set(box, `${box.clientWidth}x${box.clientHeight}`);
      }
    } finally {
      delete lobby.dataset.rosterMeasuring;
    }
  }, [listRef]);

  // Names join or leave.
  useLayoutEffect(() => {
    const before = fitted.current;
    const now = new Map(arrivals.map((arrival) => [arrival.id, arrival.name]));
    const joinedOnly = [...before].every(([id, name]) => now.get(id) === name);
    fitted.current = now;
    walk(joinedOnly ? lastFit.current : 0);
  }, [arrivals, walk]);

  // Once per lobby: the names' real font, or a new size for the stage or the copy column, changes the room the names take, so
  // the walk starts over from the top. A look landing under the lobby (its stylesheet can arrive after the page shows on
  // Today) resizes the copy column with its own wordmark and plates, so it starts the walk over too.
  useLayoutEffect(() => {
    const list = listRef.current;
    const lobby = list?.closest<HTMLElement>(".preshow-lobby");
    if (!list || !lobby) return undefined;
    let cancelled = false;
    let frame = 0;
    const later = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { if (!cancelled) walk(0); });
    };
    document.fonts?.ready.then(later, later);
    // A join that adds a row grows the copy column on the square and portrait canvases, and the join's own walk has already
    // fitted it, so only a size no walk ended at starts the walk over.
    const resized = typeof ResizeObserver === "undefined" ? null : new ResizeObserver((entries) => {
      if (entries.some((entry) => settled.current.get(entry.target) !== `${entry.target.clientWidth}x${entry.target.clientHeight}`)) later();
    });
    const stage = lobby.querySelector<HTMLElement>(".lobby-stage");
    const copy = list.closest<HTMLElement>(".lobby-copy");
    if (resized && stage) resized.observe(stage);
    if (resized && copy) resized.observe(copy);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      resized?.disconnect();
      // A lobby whose names go away (Top 5 scores off) gets its wordmark and hype line back.
      delete lobby.dataset.rosterRoom;
      delete list.dataset.plate;
    };
  }, [listRef, walk]);
}

/**
 * Who is in, for a live-phone lobby (VOF-88): the newest names land at the front with a gold flash, and one ghost seat
 * marks where they will land before anyone joins. Names are the room-facing nickname, the same filtered one the
 * leaderboard shows.
 */
export const LobbyArrivals: React.FC = () => {
  const reduceMotion = useReducedMotion();
  const devices = useGameStore((state) => state.seenDevices);
  const arrivals = useMemo(() => lobbyArrivals(devices), [devices]);
  const listRef = useRef<HTMLUListElement | null>(null);
  useRosterFit(listRef, arrivals);
  // Names already in when the lobby opened are furniture. Only a name that arrives while the room
  // watches gets the landing flash.
  const presentAtMount = useRef<Set<string> | null>(null);
  if (presentAtMount.current === null) presentAtMount.current = new Set(arrivals.map((arrival) => arrival.id));

  return (
    <ul ref={listRef} className="lobby-arrivals" data-role="lobby-arrivals" aria-label="Players in the room">
      <AnimatePresence initial={false} mode="popLayout">
        {arrivals.length === 0 ? (
          <motion.li
            key="ghost"
            className="lobby-arrival lobby-arrival--ghost"
            exit={reduceMotion ? undefined : { opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.18 }}
          >
            <span className="lobby-arrival__initial" aria-hidden="true">?</span>
            <span className="lobby-arrival__name">Your name here</span>
          </motion.li>
        ) : arrivals.map((arrival) => {
          const fresh = !presentAtMount.current?.has(arrival.id);
          return (
            <motion.li
              key={arrival.id}
              layout={reduceMotion ? false : "position"}
              className="lobby-arrival"
              data-fresh={fresh ? "true" : undefined}
              initial={reduceMotion || !fresh ? false : { opacity: 0, scale: 0.55 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 520, damping: 22, mass: 0.8 }}
            >
              <span className="lobby-arrival__initial" aria-hidden="true">{firstLetter(arrival.name)}</span>
              <span className="lobby-arrival__name">{arrival.name}</span>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
};

export default LobbyArrivals;
