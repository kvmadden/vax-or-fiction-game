import { Question, QuestionKind } from "../data/types";

/** A tally cell may arrive as a number, a numeric string, or (over the relay) an object of voters; never let Number() throw on it. */
function toCount(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, value) : 0;
  if (typeof value === 'string') return Math.max(0, Number(value) || 0);
  if (value && typeof value === 'object') return Array.isArray(value) ? value.length : Object.keys(value as object).length;
  return 0;
}

export const QUESTION_KINDS: readonly QuestionKind[] = Object.freeze(["binary", "myth-among-three", "estimate", "order", "which-patient"]);
export const VERDICT_KINDS: readonly string[] = Object.freeze(["binary", "myth-among-three", "which-patient"]);
export const OPTION_LETTERS = "abcdef";
export const MAX_OPTIONS = 6;
export const MIN_ORDER_STEPS = 3;
export const MAX_ORDER_STEPS = 6;
export const CHOICE_TOKEN_PATTERN = /^(?:true|false|[a-f]|[a-f](?:-[a-f]){2,5})$/;

export const KIND_LABELS: Record<QuestionKind, string> = Object.freeze({
  binary: "True or false",
  "myth-among-three": "Myth among three",
  estimate: "Estimate the number",
  order: "Order the steps",
  "which-patient": "Which patient",
});

/**
 * A run slide is a question when it carries a question identity: a binary `answer` (legacy runs) or an explicit
 * `kind` (every ported question). Non-binary kinds carry no `answer`, so `'answer' in slide` alone misses them.
 */
export function isQuestionSlide(slide: unknown): slide is Question {
  if (!slide || typeof slide !== "object") return false;
  const candidate = slide as Record<string, unknown>;
  if (typeof candidate.id !== "string") return false;
  return "answer" in candidate || (typeof candidate.kind === "string" && (QUESTION_KINDS as readonly string[]).includes(candidate.kind));
}

/**
 * Presenter chip for a non-question slide. Title/instructions sit on leftover
 * `entering`, so the HUD must read the slide, not the phase, or it says Posed.
 */
export function staticSlideLabel(slide: unknown): string | null {
  if (!slide || typeof slide !== "object" || isQuestionSlide(slide)) return null;
  const type = String((slide as { type?: unknown; id?: unknown }).type ?? (slide as { id?: unknown }).id ?? "").toLowerCase();
  if (type === "title") return "Title";
  if (type === "instructions") return "Instructions";
  if (type === "closing" || type === "outro") return "Closing";
  if (type === "showdown") return "Showdown";
  if (type === "focus") return "Focus";
  if (type === "halftime") return "Halftime";
  if (type === "fork") return "Fork";
  return null;
}

/** Closing / showdown / outro — SKIP off the last live question should end the run. */
export function isTerminalSlide(slide: unknown): boolean {
  const label = staticSlideLabel(slide);
  return label === "Closing" || label === "Showdown";
}

export function questionKind(question?: Partial<Question> | null): QuestionKind {
  const k = question?.kind;
  return (k && (QUESTION_KINDS as readonly string[]).includes(k)) ? k : "binary";
}

export function isVerdictKind(kind?: string | null): boolean {
  return VERDICT_KINDS.includes(kind ?? "");
}

export function letterFor(index: number): string | null {
  return OPTION_LETTERS[index] ?? null;
}

export function indexFor(letter: string): number | null {
  const index = OPTION_LETTERS.indexOf(letter);
  return index >= 0 ? index : null;
}

export function asksForReply(question?: Partial<Question> | null): boolean {
  const statement = String(question?.statement ?? "");
  const scenario = String(question?.scenario ?? "");
  return question?.reply === true
    || /\b(?:reply|replies|respond|response|say)\b/i.test(statement)
    || /[“”"]/.test(scenario)
    // Phones only receive the merged statement, so a quoted patient line must
    // still count as a spoken-reply beat when `scenario` and `reply` are absent.
    || /[“”"]/.test(statement);
}

const QUOTE_EDGE = /^[“”"‘’']|[“”"‘’']$/;

/**
 * On the host stage a spoken reply wears one pair of curly quotes, on its answer card and its result headline alike.
 * Text that is blank, or that already starts or ends with a quote mark, is left as written, so authored quotes are
 * never doubled. The phone shows replies bare (PhoneVote and reveal-copy).
 */
export function spokenReplyText(question: Partial<Question> | null | undefined, text: string): string {
  const trimmed = text.trim();
  if (!asksForReply(question) || trimmed.length === 0 || QUOTE_EDGE.test(trimmed)) return text;
  return `“${trimmed}”`;
}

/** Same quote-character set asksForReply already checks scenario/statement text against. */
const QUOTE_CONTAINS = /[“”"]/;

/**
 * The scenario card's label on the host stage (WhichPatientQuestion.tsx, its one clear-ask-owned line):
 * "Patient says" only for a reply beat whose scenario is explicitly authored as a real quoted line
 * (`scenarioVoice: 'quote'`, an editorial field). Every narrated case, and any reply question that never
 * set scenarioVoice, reads "Scenario".
 */
export function stageScenarioLabel(question?: Partial<Question> | null): 'Patient says' | 'Scenario' {
  return asksForReply(question) && question?.scenarioVoice === 'quote' ? 'Patient says' : 'Scenario';
}

/**
 * The scenario card's label on the phone. PublicQuestion (src/network/protocol.ts) carries no
 * scenarioVoice field over the room wire, so the phone derives the same call from the scenario text
 * itself instead: a reply beat whose scenario contains a quote mark reads "Patient says", everything
 * else reads "Scenario". `reply` is the caller's own `asksForReply(...)` read (the phone already computes
 * it for the kicker and the instruction line), and `scenarioText` is the already-split scenario line, not
 * the merged statement. Proven to agree with stageScenarioLabel for every which-patient question in every
 * deck by tests/unit/deck-scenario-copy.test.ts.
 */
export function phoneScenarioLabel(reply: boolean, scenarioText: string): 'Patient says' | 'Scenario' {
  return reply && QUOTE_CONTAINS.test(scenarioText) ? 'Patient says' : 'Scenario';
}

/**
 * The stem the host stage shows for a question. `statement` is the headline when it exists, and
 * a which-patient card that carries only a `scenario` (q16 in vax-or-fiction.ts: a spoken-reply
 * beat with no `statement` field) falls back to that scenario line instead, exactly as
 * WhichPatientQuestion renders it, so the same card never reads blank anywhere it is quoted
 * (Q16-RECAP: the Showdown duel recap used to read `question.statement` directly and went empty
 * for q16). Anything with neither field falls back to the same generic line
 * WhichPatientQuestion already used, never invented clinical wording.
 */
export function questionHeadline(question?: Partial<Question> | null): string {
  const statementText = question?.statement?.trim() ?? "";
  const scenarioCandidate = question?.scenario?.trim() ?? "";
  const fillerScenario = !scenarioCandidate || scenarioCandidate === "Choose the best answer.";
  const scenarioText = fillerScenario ? null : scenarioCandidate;
  const hasDistinctStatement = Boolean(statementText && statementText !== scenarioText);
  return (hasDistinctStatement ? statementText : scenarioText || statementText) || "Which reply is better?";
}

export function kindEyebrow(question?: Partial<Question> | null): string {
  switch (questionKind(question)) {
    case "myth-among-three": return "PICK THE MYTH";
    case "estimate": return "YOUR ESTIMATE";
    case "order": return "PUT IN ORDER";
    case "which-patient": return asksForReply(question) ? "WHICH REPLY IS BETTER?" : "PATIENT SCENARIO";
    default: return "TRUE OR FALSE?";
  }
}

/** Title-case kicker for the projected stage. CSS uppercases it on the show frame. */
export function stageKindKicker(question?: Partial<Question> | null): string {
  switch (questionKind(question)) {
    case "myth-among-three": return "Pick the myth";
    case "estimate": return "Estimate";
    case "order": return "Put in order";
    case "which-patient": return asksForReply(question) ? "Which reply is better" : "Patient scenario";
    default: return "Make your call";
  }
}

export interface KindOption {
  token: string;
  label: string;
  text: string;
  min?: number;
  max?: number;
}

export function kindOptions(question?: Partial<Question> | null): KindOption[] | null {
  const kind = questionKind(question);
  if (kind === "binary") {
    return [
      { token: "true", label: "TRUE", text: "" },
      { token: "false", label: "FALSE", text: "" },
    ];
  }
  if (kind === "myth-among-three") {
    return (question?.statements ?? []).map((text, index) => ({
      token: letterFor(index)!,
      label: letterFor(index)!.toUpperCase(),
      text: String(text)
    }));
  }
  if (kind === "which-patient") {
    return (question?.choices ?? []).map((text, index) => ({
      token: letterFor(index)!,
      label: letterFor(index)!.toUpperCase(),
      text: String(text)
    }));
  }
  if (kind === "estimate") {
    return (question?.estimate?.ranges ?? []).map((range, index) => ({
      token: letterFor(index)!,
      label: String(range?.label ?? ""),
      text: "",
      min: Number(range?.min),
      max: Number(range?.max),
    }));
  }
  return null;
}

function orderLetters(question?: Partial<Question> | null): string[] {
  return (question?.steps ?? []).map((_, index) => letterFor(index)!);
}

export function orderToken(letters?: string[] | null): string | null {
  return Array.isArray(letters) ? letters.join("-") : null;
}

export function orderStepsFor(question?: Partial<Question> | null, token?: string | null): ({ token: string; text: string } | null)[] {
  const steps = question?.steps ?? [];
  return String(token ?? "").split("-").map((letter) => {
    const index = indexFor(letter);
    return index !== null && index < steps.length ? { token: letter, text: String(steps[index]) } : null;
  }).filter(Boolean);
}

export function rightToken(question?: Partial<Question> | null): string {
  const kind = questionKind(question);
  if (kind === "binary") return question?.answer === false ? "false" : "true";
  if (kind === "myth-among-three") return letterFor(Number(question?.mythIndex)) ?? "a";
  if (kind === "which-patient") return letterFor(Number(question?.bestIndex)) ?? "a";
  if (kind === "order") return orderToken(orderLetters(question)) ?? "";
  if (kind === "estimate") {
    const options = kindOptions(question) || [];
    const value = Number(question?.estimate?.value);
    const containing = options.find((option) => option.min! <= value && value <= option.max!);
    return containing?.token ?? options[0]?.token ?? "a";
  }
  return "true";
}

export function validChoice(question?: Partial<Question> | null, token?: any): boolean {
  if (typeof token !== "string" || !CHOICE_TOKEN_PATTERN.test(token)) return false;
  const kind = questionKind(question);
  if (kind === "order") {
    const letters = orderLetters(question);
    const parts = token.split("-");
    if (parts.length !== letters.length) return false;
    return new Set(parts).size === letters.length && parts.every((letter) => letters.includes(letter));
  }
  const options = kindOptions(question) ?? [];
  return options.some((option) => option.token === token);
}

export function isRightChoice(question?: Partial<Question> | null, token?: any): boolean {
  if (!validChoice(question, token)) return false;
  const kind = questionKind(question);
  if (kind === "estimate") {
    const option = kindOptions(question)?.find((candidate) => candidate.token === token);
    const value = Number(question?.estimate?.value);
    const tolerance = Math.max(0, Number(question?.estimate?.tolerance) || 0);
    if (!option || !Number.isFinite(value)) return false;
    return (option.min! < value + tolerance && option.max! > value - tolerance)
      || (option.min! <= value && value <= option.max!);
  }
  return token === rightToken(question);
}

export function choiceLabel(question?: Partial<Question> | null, token?: any): string {
  const kind = questionKind(question);
  if (kind === "binary") return token === "false" ? "FALSE" : "TRUE";
  if (kind === "order") return String(token ?? "").split("-").map((letter) => letter.toUpperCase()).join(" → ");
  const option = (kindOptions(question) ?? []).find((candidate) => candidate.token === token);
  return option ? option.label : String(token ?? "").toUpperCase();
}

export function answerLine(question?: Partial<Question> | null): string {
  const kind = questionKind(question);
  if (kind === "binary") return question?.answer === false ? "FALSE" : "TRUE";
  if (kind === "myth-among-three") return `THE MYTH · ${rightToken(question).toUpperCase()}`;
  if (kind === "which-patient") return `${asksForReply(question) ? "BETTER" : "BEST"} · ${rightToken(question).toUpperCase()}`;
  if (kind === "estimate") return estimateTruthLabel(question);
  if (kind === "order") return "THE ORDER";
  return "TRUE";
}

export function answerDetail(question?: Partial<Question> | null): string {
  const kind = questionKind(question);
  if (kind === "myth-among-three") return String((question as unknown as { statements: string[] })?.statements?.[Number(question?.mythIndex)] ?? "");
  if (kind === "which-patient") return String((question as unknown as { choices: string[] })?.choices?.[Number(question?.bestIndex)] ?? "");
  if (kind === "order") return (question?.steps ?? []).map((step, index) => `${index + 1}. ${step}`).join(" · ");
  if (kind === "estimate") return "";
  return "";
}

export function estimateTruthLabel(question?: Partial<Question> | null): string {
  const value = question?.estimate?.value;
  const unit = question?.estimate?.unit ?? "";
  if (!Number.isFinite(Number(value))) return "";
  return `${value}${unit === "%" ? "%" : (unit ? ` ${unit}` : "")}`;
}

/**
 * A short first-clause sting under the estimate number. Only fires when the
 * authored reveal has more after that clause, so the result beat never dumps
 * the explanation. Skips long clauses and ones that already repeat the number.
 */
export function estimateStingLine(question?: Partial<Question> | null): string {
  if (questionKind(question) !== "estimate") return "";
  const reveal = question?.reveal?.trim() ?? "";
  if (!reveal) return "";
  const match = reveal.match(/^(.+?[.!?])\s+([\s\S]+)$/);
  const first = match?.[1]?.trim() ?? "";
  if (!first) return "";
  const label = estimateTruthLabel(question);
  if (first.length <= 36 && (!label || !first.includes(label))) {
    return first.replace(/[.!?]$/, "");
  }
  const clauseMatch = first.match(/\b(about\s+[^,.]+)/i);
  const clause = clauseMatch?.[1]?.trim() ?? "";
  if (clause && clause.length <= 36 && (!label || !clause.includes(label))) {
    return clause.replace(/[.!?]$/, "");
  }
  return "";
}

export function tallyChoices(voters?: Record<string, any> | null): Record<string, number> {
  const choices: Record<string, number> = {};
  for (const entry of Object.values(voters ?? {})) {
    const token = typeof entry === "object" && entry !== null ? entry.choice : entry;
    if (typeof token !== "string" || !CHOICE_TOKEN_PATTERN.test(token)) continue;
    choices[token] = (choices[token] ?? 0) + 1;
  }
  return choices;
}

function totalOf(choices?: Record<string, number | string> | null): number {
  return Object.values(choices ?? {}).reduce((sum: number, count: any) => sum + toCount(count), 0);
}

export interface TallyOption extends KindOption {
  count: number;
  percent: number;
  right: boolean;
  truth: boolean;
}

export function optionTally(question?: Partial<Question> | null, choices?: Record<string, number | string> | null): TallyOption[] {
  const options = kindOptions(question) ?? [];
  const total = totalOf(choices);
  const right = rightToken(question);
  return options.map((option) => {
    const count = toCount(choices?.[option.token]);
    return {
      ...option,
      count,
      percent: total > 0 ? Math.round((count / total) * 100) : 0,
      right: questionKind(question) === "estimate" ? isRightChoice(question, option.token) : option.token === right,
      truth: option.token === right,
    };
  });
}

export function pluralityOption(question?: Partial<Question> | null, choices?: Record<string, number | string> | null): TallyOption | null {
  const tally = optionTally(question, choices);
  if (tally.length === 0) return null;
  const total = totalOf(choices);
  if (total === 0) return null;
  return tally.reduce((best, option) => (option.count > best.count ? option : best), tally[0] as TallyOption);
}

export interface EstimateRead {
  medianToken: string;
  medianLabel: string;
  direction: "LOW" | "HIGH" | "ON THE MONEY";
  line: string;
}

export function estimateRead(question?: Partial<Question> | null, choices?: Record<string, number | string> | null): EstimateRead | null {
  const tally = optionTally(question, choices);
  const total = totalOf(choices);
  if (tally.length === 0 || total === 0) return null;
  let running = 0;
  let medianIndex = 0;
  for (let i = 0; i < tally.length; i += 1) {
    running += (tally[i] as TallyOption).count;
    if (running * 2 >= total) { medianIndex = i; break; }
  }
  const truthIndex = Math.max(0, tally.findIndex((option) => option.truth));
  const direction = medianIndex < truthIndex ? "LOW" : (medianIndex > truthIndex ? "HIGH" : "ON THE MONEY");
  const median = tally[medianIndex] as TallyOption;
  return {
    medianToken: median.token,
    medianLabel: median.label,
    direction,
    line: direction === "ON THE MONEY"
      ? `ROOM MEDIAN ${median.label} · ON THE MONEY`
      : `ROOM MEDIAN ${median.label} · MOST GUESSED ${direction}`,
  };
}

function ordinal(position: number): string {
  return ["first", "second", "third", "fourth", "fifth", "sixth"][position] ?? `${position + 1}th`;
}

export interface OrderRead {
  fullOrder: number;
  fullOrderPct: number;
  line: string;
  displacementLine: string | null;
}

export function orderRead(question?: Partial<Question> | null, choices?: Record<string, number | string> | null): OrderRead | null {
  const total = totalOf(choices);
  if (total === 0) return null;
  const right = rightToken(question);
  const fullOrder = Number(choices?.[right]) || 0;
  const placements = new Map<string, number>();
  for (const [token, count] of Object.entries(choices ?? {})) {
    if (token === right || !validChoice(question, token)) continue;
    token.split("-").forEach((letter, position) => {
      if (letter === right.split("-")[position]) return;
      const key = `${letter}|${position}`;
      placements.set(key, (placements.get(key) ?? 0) + (Number(count) || 0));
    });
  }
  let displacement: string | null = null;
  let best = 0;
  for (const [key, count] of placements.entries()) {
    if (count > best) { best = count; displacement = key; }
  }
  let displacementLine: string | null = null;
  if (displacement) {
    const [letter, position] = displacement.split("|");
    const step = question?.steps?.[indexFor(letter as string)!] ?? (letter as string).toUpperCase();
    displacementLine = `The room put “${step}” ${ordinal(Number(position))}`;
  }
  const fullOrderPct = Math.round((fullOrder / total) * 100);
  return {
    fullOrder,
    fullOrderPct,
    line: total >= 5 ? `${fullOrderPct}% OF THE ROOM HAD THE FULL ORDER` : `${fullOrder} OF ${total} HAD THE FULL ORDER`,
    displacementLine,
  };
}

const KIND_TEXT_MAX = 140;
function nonEmptyString(value: any, max: number): boolean {
  return typeof value === "string" && value.trim() !== "" && value.length <= max;
}

export function validateKindFields(question?: Partial<Question> | null, kind: QuestionKind = questionKind(question)): void {
  const q = question || {};
  const id = q.id ?? "question";
  if (q.scenario !== undefined && !nonEmptyString(q.scenario, 160)) {
    throw new Error(`${id} scenario must be a non-empty string <= 160 characters`);
  }
  if (q.reasons !== undefined) {
    if (!Array.isArray(q.reasons) || q.reasons.length < 3 || q.reasons.length > 4
      || q.reasons.some((reason) => !nonEmptyString(reason, 60))) {
      throw new Error(`${id} reasons must be three or four short lines (<= 60 characters)`);
    }
  }
  if (kind === "myth-among-three") {
    if (!Array.isArray(q.statements) || q.statements.length !== 3
      || q.statements.some((statement) => !nonEmptyString(statement, KIND_TEXT_MAX))) {
      throw new Error(`${id} statements must be exactly three non-empty strings <= ${KIND_TEXT_MAX} characters`);
    }
    if (!Number.isInteger(q.mythIndex) || (q.mythIndex as number) < 0 || (q.mythIndex as number) > 2) {
      throw new Error(`${id} mythIndex must be 0, 1 or 2`);
    }
  } else if (kind === "estimate") {
    const estimate = q.estimate;
    if (!estimate || typeof estimate !== "object" || Array.isArray(estimate)) throw new Error(`${id} estimate is required`);
    if (!Number.isFinite(estimate.value)) throw new Error(`${id} estimate.value must be a number`);
    if (estimate.unit !== undefined && (typeof estimate.unit !== "string" || estimate.unit.length > 12)) {
      throw new Error(`${id} estimate.unit must be a string <= 12 characters`);
    }
    if (!Number.isFinite(estimate.tolerance) || estimate.tolerance! < 0) throw new Error(`${id} estimate.tolerance must be a number >= 0`);
    if (!Array.isArray(estimate.ranges) || estimate.ranges.length < 3 || estimate.ranges.length > 6) {
      throw new Error(`${id} estimate.ranges must hold three to six ranges`);
    }
    let previousMax = -Infinity;
    for (const range of estimate.ranges) {
      if (!range || typeof range !== "object" || !nonEmptyString(range.label, 24)) throw new Error(`${id} estimate range label is required (<= 24 characters)`);
      if (!Number.isFinite(range.min) || !Number.isFinite(range.max) || range.min > range.max) throw new Error(`${id} estimate range bounds are invalid`);
      if (range.min < previousMax) throw new Error(`${id} estimate ranges must ascend`);
      previousMax = range.max;
    }
    if (estimate.value < estimate.ranges[0]!.min || estimate.value > estimate.ranges.at(-1)!.max) {
      throw new Error(`${id} estimate.value must sit inside the ranges`);
    }
  } else if (kind === "order") {
    if (!Array.isArray(q.steps) || q.steps.length < 3 || q.steps.length > 6
      || q.steps.some((step) => !nonEmptyString(step, 90))) {
      throw new Error(`${id} steps must be three to six non-empty strings <= 90 characters`);
    }
    if (new Set(q.steps).size !== q.steps.length) throw new Error(`${id} steps must be distinct`);
  } else if (kind === "which-patient") {
    if (!nonEmptyString(q.scenario, 160)) throw new Error(`${id} scenario is required for which-patient (<= 160 characters)`);
    if (!Array.isArray(q.choices) || q.choices.length < 2 || q.choices.length > 4
      || q.choices.some((choice) => !nonEmptyString(choice, KIND_TEXT_MAX))) {
      throw new Error(`${id} choices must be two to four non-empty strings <= ${KIND_TEXT_MAX} characters`);
    }
    if (!Number.isInteger(q.bestIndex) || (q.bestIndex as number) < 0 || (q.bestIndex as number) >= q.choices.length) {
      throw new Error(`${id} bestIndex must point at one of the choices`);
    }
  }
}
