import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OptionsSheet, QuickSetups, type OptionsSheetProps } from "../../src/screens/OptionsSheet";

const noop = () => {};
const baseProps: OptionsSheetProps = {
  venue: "teams",
  phones: true,
  questionSets: [
    { id: "curated15", label: "Curated 15", meta: "15 questions" },
    { id: "demo", label: "Quick demo", meta: "12 questions" },
    { id: "full", label: "Full", meta: "35 questions" },
    { id: "lightning", label: "Lightning", meta: "8 questions" },
    { id: "rehearsal", label: "Practice run", meta: "35, with notes" },
  ],
  modeId: "full",
  onSelectMode: noop,
  formats: [
    { id: "widescreen", label: "Widescreen", ratio: "16:9" },
    { id: "square", label: "Square", ratio: "1:1" },
    { id: "portrait", label: "Portrait", ratio: "9:16" },
  ],
  formatId: "widescreen",
  onSelectFormat: noop,
  switches: { sound: true, timer: true, countdown: false, reactions: true, scores: false, teams: false, finale: true },
  onToggle: noop,
  startTime: "",
  onStartTime: noop,
  onOpenQuickSetups: noop,
  lookName: "Today",
  onOpenLooks: noop,
  onDone: noop,
  onOpenLobby: noop,
};

const render = (overrides: Partial<OptionsSheetProps> = {}) =>
  renderToStaticMarkup(React.createElement(OptionsSheet, { ...baseProps, ...overrides }));
const switches = (html: string) =>
  [...html.matchAll(/role="switch" aria-checked="(true|false)" aria-label="([^"]+)"/g)].map(([, checked, name]) => `${name}:${checked}`);
const switchNames = (html: string) => switches(html).map((entry) => entry.split(":")[0]);

test("with phones, the sheet shows all seven switches in reading order with their state", () => {
  assert.deepEqual(switches(render()), [
    "Music and sound:true",
    "Answer timer:true",
    "Lobby countdown:false",
    "Audience reactions:true",
    "Top 5 scores:false",
    "Two teams:false",
    "Final challenge:true",
  ]);
});

test("Curated 15 and In the room hide Final challenge so a host cannot turn on untested Showdown", () => {
  assert.deepEqual(switchNames(render({ modeId: "curated15" })), [
    "Music and sound",
    "Answer timer",
    "Lobby countdown",
    "Audience reactions",
    "Top 5 scores",
    "Two teams",
  ]);
  assert.equal(switches(render({ venue: "room", modeId: "full" })).length, 6);
  assert.doesNotMatch(render({ venue: "room" }), /Final challenge/);
  assert.doesNotMatch(render({ modeId: "curated15" }), /Final challenge/);
});

test("Curated 8, the default mode, also hides Final challenge (FINALE-TOGGLE): the store's own showdownPlayable() says neither Curated preset can ever open Showdown, so the switch that offers it must agree", () => {
  assert.doesNotMatch(render({ modeId: "curated8" }), /Final challenge/);
  assert.deepEqual(switchNames(render({ modeId: "curated8" })), [
    "Music and sound",
    "Answer timer",
    "Lobby countdown",
    "Audience reactions",
    "Top 5 scores",
    "Two teams",
  ]);
});

test("an Offline game sets the phone settings aside and says why", () => {
  const html = render({ venue: "offline", phones: false });
  assert.deepEqual(switchNames(html), ["Music and sound", "Answer timer", "Lobby countdown"]);
  assert.match(html, /data-role="phones-off"/);
  assert.match(html, /Offline games play hands up/);
  assert.match(html, /Choose Online meeting or In the room on the ready screen/);
  assert.doesNotMatch(html, /Use Quick setups for a phone-voting game/);
});

test("a hands-up game in the room also sets the phone settings aside", () => {
  const html = render({ venue: "room", phones: false });
  assert.deepEqual(switchNames(html), ["Music and sound", "Answer timer", "Lobby countdown"]);
  assert.match(html, /This game plays hands up/);
  assert.doesNotMatch(html, /Offline games play hands up/);
  assert.match(html, /Use Quick setups for a phone-voting game/);
  assert.doesNotMatch(html, /Choose Online meeting or In the room on the ready screen/);
});

test("the start time field shows only while the lobby countdown is on", () => {
  assert.doesNotMatch(render(), /type="time"/);
  const html = render({ switches: { ...baseProps.switches, countdown: true }, startTime: "09:30" });
  assert.match(html, /<input[^>]*type="time"[^>]*value="09:30"/);
});

test("questions and screen shape are real radio groups with one choice each", () => {
  const html = render({ modeId: "lightning", formatId: "portrait" });
  assert.equal((html.match(/type="radio"/g) ?? []).length, 8);
  const checked = (html.match(/<input[^>]*type="radio"[^>]*>/g) ?? [])
    .filter((tag) => tag.includes('checked=""'))
    .map((tag) => tag.match(/value="([^"]+)"/)?.[1]);
  assert.deepEqual(checked, ["lightning", "portrait"]);
  assert.match(html, /aria-label="Portrait 9:16"/);
  assert.match(html, /Curated 15/);
  assert.equal((html.match(/role="radiogroup"/g) ?? []).length, 2);
  assert.match(html, /data-count="5"/);
});

test("quick setups and the lobby stay one tap away, and a used setup says so", () => {
  const html = render({ notice: "Standard game is set" });
  assert.match(html, />Quick setups<\/button>/);
  assert.match(html, />Open the lobby<\/button>/);
  assert.match(html, />Done<\/button>/);
  assert.match(html, /Standard game is set/);
  assert.doesNotMatch(render(), /is set/);
});

test("quick setups show what each one sets and name the last one used in words", () => {
  const html = renderToStaticMarkup(React.createElement(QuickSetups, {
    setups: [
      { id: "standard", name: "Standard game", description: "The full game on Teams.", chips: ["Teams", "Full · 35"] },
      { id: "huddle", name: "10-minute game", description: "The Lightning set.", chips: ["In the room", "Hands up"] },
    ],
    activeId: "huddle",
    note: "Every quick setup turns off two teams and Top 5 scores. You can change anything after.",
    onUse: noop,
    onBack: noop,
  }));
  const active = html.split("<article").filter((chunk) => chunk.includes('aria-current="true"'));
  assert.equal(active.length, 1);
  assert.match(active[0], /10-minute game/);
  assert.match(active[0], /aria-label="Use again: 10-minute game"/);
  assert.match(active[0], />Use again<\/button>/);
  assert.match(html, /aria-label="Use this: Standard game"/);
  assert.match(html, /<li>Full · 35<\/li>/);
  assert.match(html, /turns off two teams and Top 5 scores/);
  assert.match(html, />Back<\/button>/);
  assert.match(html, /data-count="2"/);
});
