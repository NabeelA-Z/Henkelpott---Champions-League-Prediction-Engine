// User bracket: structure, picks, scoring and the graded report.
import { buildBracket, type Bracket, type Bucket } from "./bracket";
import { CLUB, CODES, singleKnockoutOdds, tieOdds } from "./model";
import type { Sims } from "./aggregate";
import { makeRng } from "./rng";

export const SCORING = {
  bucket: 2, exact: 3, near: 1, // league: per club
  r16: 3, qf: 5, sf: 8, final: 12, champion: 30, // knockouts: per club reaching the round
};

/** Knockout picks: winner per tie id. Tie ids: PO9..PO16, R16-1..R16-8, QF1..QF4, SF1..SF2, F. */
export type KoPicks = Record<string, string>;

export type BracketTie = { id: string; a?: string; b?: string; winner?: string; from?: [string, string] };
export type UserBracket = { bracket: Bracket; po: BracketTie[]; r16: BracketTie[]; qf: BracketTie[]; sf: BracketTie[]; final: BracketTie };

export const drawRng = (seed: string) => makeRng(`${seed}/draw`);

/** Lay out ties from an order + picks; later rounds fill in as earlier winners are picked. */
export function userBracket(order: string[], picks: KoPicks, seed: string): UserBracket {
  const bracket = buildBracket(order, drawRng(seed));
  const valid = (id: string, a?: string, b?: string) => {
    const w = picks[id];
    return w && (w === a || w === b) ? w : undefined;
  };
  const po = bracket.playoffs.map((t) => ({ id: t.id, a: t.unseeded, b: t.seeded, winner: valid(t.id, t.unseeded, t.seeded) }));
  const r16 = bracket.r16.map((s) => {
    const a = po[s.po].winner;
    return { id: s.id, a, b: s.top, winner: valid(s.id, a, s.top), from: [po[s.po].id, ""] as [string, string] };
  });
  const round = (prev: BracketTie[], prefix: string) => {
    const out: BracketTie[] = [];
    for (let i = 0; i < prev.length; i += 2) {
      const id = `${prefix}${i / 2 + 1}`;
      const a = prev[i].winner, b = prev[i + 1].winner;
      out.push({ id, a, b, winner: valid(id, a, b), from: [prev[i].id, prev[i + 1].id] });
    }
    return out;
  };
  const qf = round(r16, "QF");
  const sf = round(qf, "SF");
  const final = round(sf, "F")[0];
  final.id = "F";
  final.winner = valid("F", final.a, final.b);
  return { bracket, po, r16, qf, sf, final };
}

export function isComplete(ub: UserBracket): boolean {
  return [...ub.po, ...ub.r16, ...ub.qf, ...ub.sf, ub.final].every((t) => t.winner);
}

/** Favourite in every tie (two legs, higher seed at home second; final neutral). */
export function favouritePicks(order: string[], seed: string): KoPicks {
  const picks: KoPicks = {};
  const pos = Object.fromEntries(order.map((c, i) => [c, i]));
  for (let pass = 0; pass < 5; pass++) {
    const ub = userBracket(order, picks, seed);
    for (const t of [...ub.po, ...ub.r16, ...ub.qf, ...ub.sf]) {
      if (t.a && t.b && !t.winner) {
        const [lo, hi] = pos[t.a] > pos[t.b] ? [t.a, t.b] : [t.b, t.a];
        picks[t.id] = tieOdds(lo, hi).a.total > 0.5 ? lo : hi;
      }
    }
    if (ub.final.a && ub.final.b && !ub.final.winner) picks.F = singleKnockoutOdds(ub.final.a, ub.final.b).a.total >= 0.5 ? ub.final.a : ub.final.b;
  }
  return picks;
}

/** Furthest round per club in the user's bracket, same scale as reachMap. */
export function userReach(order: string[], ub: UserBracket): Record<string, number> {
  const r: Record<string, number> = Object.fromEntries(CODES.map((c) => [c, 0]));
  order.forEach((c, i) => (r[c] = i < 8 ? 2 : i < 24 ? 1 : 0));
  for (const t of ub.po) if (t.winner) r[t.winner] = 2;
  for (const t of ub.r16) if (t.winner) r[t.winner] = 3;
  for (const t of ub.qf) if (t.winner) r[t.winner] = 4;
  for (const t of ub.sf) if (t.winner) r[t.winner] = 5;
  if (ub.final.winner) r[ub.final.winner] = 6;
  return r;
}

export type Entry = { order: string[]; quick: boolean; picks: KoPicks };

export type Report = {
  runs: number;
  grade: string; gradeLabel: string;
  expUser: number; expChalk: number; expUserLeague: number; expUserKo: number; expChalkLeague: number; expChalkKo: number;
  pBeatChalk: number; best: number; worst: number;
  within2: number; bucketed: number;
  champion: string; champPct: number; champRank: number;
  perfectOdds: number; perfectKoOdds: number;
  titleRace: { code: string; p: number }[];
  finalFour: { code: string; p: number }[];
  finalists: { code: string; p: number }[];
  safest?: { code: string; stage: number; p: number };
  gamble?: { code: string; stage: number; p: number };
  buckets: Record<Bucket, { code: string; p: number; modelBucket: Bucket; agree: boolean }[]>;
  chalk: Entry;
};

const GRADES: [number, string, string][] = [
  [1.02, "A+", "Razor sharp"], [0.97, "A", "Sharp"], [0.92, "A−", "Well judged"], [0.86, "B+", "Solid"],
  [0.8, "B", "Respectable"], [0.73, "B−", "Brave"], [0.65, "C", "Bold"], [0.55, "D", "Chaos merchant"], [0, "E", "Pure vibes"],
];

type Prepped = { ub: UserBracket; pos: Int8Array; bucket: Int8Array; reach: Int8Array };
const BUCKETS: Bucket[] = ["top8", "playoff", "out"];
const bIdx = (pos: number) => (pos <= 8 ? 0 : pos <= 24 ? 1 : 2);

function prepEntry(e: Entry, seed: string): Prepped {
  const ub = userBracket(e.order, e.picks, seed);
  const r = userReach(e.order, ub);
  const pos = new Int8Array(CODES.length), bucket = new Int8Array(CODES.length), reach = new Int8Array(CODES.length);
  CODES.forEach((c, i) => {
    pos[i] = e.order.indexOf(c) + 1;
    bucket[i] = bIdx(pos[i]);
    reach[i] = r[c];
  });
  return { ub, pos, bucket, reach };
}

const KO_POINTS = [0, 0, SCORING.r16, SCORING.qf, SCORING.sf, SCORING.final, SCORING.champion];

function scoreRun(u: Prepped, quick: boolean, sims: Sims, r: number) {
  const N = CODES.length;
  let league = 0, ko = 0, within2 = 0, bucketed = 0;
  for (let c = 0; c < N; c++) {
    const sp = sims.pos[r * N + c], sr = sims.reach[r * N + c];
    if (bIdx(sp) === u.bucket[c]) {
      league += SCORING.bucket;
      bucketed++;
    }
    const d = Math.abs(sp - u.pos[c]);
    if (d <= 2) within2++;
    if (!quick) league += d === 0 ? SCORING.exact : d <= 2 ? SCORING.near : 0;
    const m = Math.min(u.reach[c], sr);
    for (let l = 2; l <= m; l++) ko += KO_POINTS[l];
  }
  return { total: league + ko, league, ko, within2, bucketed };
}

/** Grade an entry against the simulated seasons already run for the dashboard. */
export function grade(entry: Entry, seed: string, sims: Sims): Report {
  const N = CODES.length, runs = sims.runs;
  const posSum = new Float64Array(N);
  const reachP = Array.from({ length: N }, () => new Float64Array(7));
  const bucketP = Array.from({ length: N }, () => new Float64Array(3));
  for (let r = 0; r < runs; r++)
    for (let c = 0; c < N; c++) {
      const p = sims.pos[r * N + c];
      posSum[c] += p;
      bucketP[c][bIdx(p)]++;
      for (let l = 0; l <= sims.reach[r * N + c]; l++) reachP[c][l]++;
    }
  const ci = (code: string) => CODES.indexOf(code);
  const chalkOrder = [...CODES].sort((a, b) => posSum[ci(a)] - posSum[ci(b)]);
  const chalk: Entry = { order: chalkOrder, quick: false, picks: favouritePicks(chalkOrder, seed) };
  const U = prepEntry(entry, seed), C = prepEntry(chalk, seed);

  let sumU = 0, sumC = 0, sumUL = 0, sumUK = 0, sumCL = 0, sumCK = 0, beat = 0, best = -1, worst = 1e9, w2 = 0, bk = 0;
  for (let r = 0; r < runs; r++) {
    const su = scoreRun(U, entry.quick, sims, r);
    const sc = scoreRun(C, false, sims, r);
    sumU += su.total; sumUL += su.league; sumUK += su.ko;
    sumC += sc.total; sumCL += sc.league; sumCK += sc.ko;
    beat += su.total > sc.total ? 1 : su.total === sc.total ? 0.5 : 0;
    best = Math.max(best, su.total);
    worst = Math.min(worst, su.total);
    w2 += su.within2;
    bk += su.bucketed;
  }
  const P = (code: string, lvl: number) => reachP[ci(code)][lvl] / runs;
  const expUser = sumU / runs, expChalk = sumC / runs;
  const ratio = expChalk > 0 ? expUser / expChalk : 0;
  const [, g, label] = GRADES.find(([t]) => ratio >= t)!;

  const champion = U.ub.final.winner ?? "";
  const board = [...CODES].sort((a, b) => P(b, 6) - P(a, 6));

  // Perfect bracket: every tie as picked (model tie odds) and every club in its bucket.
  let perfectKo = 1;
  const posOf = (code: string) => U.pos[ci(code)];
  for (const t of [...U.ub.po, ...U.ub.r16, ...U.ub.qf, ...U.ub.sf]) {
    if (!t.a || !t.b || !t.winner) continue;
    const [lo, hi] = posOf(t.a) > posOf(t.b) ? [t.a, t.b] : [t.b, t.a];
    const o = tieOdds(lo, hi);
    perfectKo *= t.winner === lo ? o.a.total : o.b.total;
  }
  if (U.ub.final.a && U.ub.final.b && U.ub.final.winner) {
    const o = singleKnockoutOdds(U.ub.final.a, U.ub.final.b);
    perfectKo *= U.ub.final.winner === U.ub.final.a ? o.a.total : o.b.total;
  }
  let bucketsAll = 1;
  for (let c = 0; c < N; c++) bucketsAll *= Math.max(0.5 / runs, bucketP[c][U.bucket[c]] / runs);

  const koPicks = CODES.filter((c) => U.reach[ci(c)] >= 3).map((c) => ({ code: c, stage: U.reach[ci(c)], p: P(c, U.reach[ci(c)]) }));
  koPicks.sort((a, b) => b.p - a.p);

  const buckets: Report["buckets"] = { top8: [], playoff: [], out: [] };
  for (const code of entry.order) {
    const c = ci(code);
    const b = BUCKETS[U.bucket[c]];
    const bp = bucketP[c];
    const mb = bp[0] >= bp[1] && bp[0] >= bp[2] ? 0 : bp[1] >= bp[2] ? 1 : 2;
    buckets[b].push({ code, p: bp[U.bucket[c]] / runs, modelBucket: BUCKETS[mb], agree: mb === U.bucket[c] });
  }

  return {
    runs, grade: g, gradeLabel: label,
    expUser, expChalk, expUserLeague: sumUL / runs, expUserKo: sumUK / runs, expChalkLeague: sumCL / runs, expChalkKo: sumCK / runs,
    pBeatChalk: beat / runs, best, worst,
    within2: w2 / runs, bucketed: bk / runs,
    champion, champPct: champion ? P(champion, 6) : 0, champRank: champion ? board.indexOf(champion) + 1 : 0,
    perfectOdds: perfectKo * bucketsAll, perfectKoOdds: perfectKo,
    titleRace: board.slice(0, 8).map((c) => ({ code: c, p: P(c, 6) })),
    finalFour: CODES.filter((c) => U.reach[ci(c)] >= 4).map((c) => ({ code: c, p: P(c, 4) })).sort((a, b) => b.p - a.p),
    finalists: CODES.filter((c) => U.reach[ci(c)] >= 5).map((c) => ({ code: c, p: P(c, 5) })).sort((a, b) => b.p - a.p),
    safest: koPicks[0],
    gamble: koPicks.length ? [...koPicks].sort((a, b) => a.p - b.p)[0] : undefined,
    buckets, chalk,
  };
}

export const STAGE_NAME = ["League phase exit", "Play-off", "Round of 16", "Quarter-finals", "Semi-finals", "Final", "Champions"];
export const reachLabel = (lvl: number) => ["out in the league phase", "the play-off", "the last 16", "the quarter-finals", "the semi-finals", "the final", "the trophy"][lvl];

export function clubName(c: string) {
  return CLUB[c]?.name ?? c;
}

// ---- URL encoding of an entry (codes are 3 chars) ----
export function encodeEntry(e: Entry): string {
  const ko = Object.entries(e.picks).map(([k, v]) => `${k}.${v}`).join("~");
  return `${e.quick ? "q" : "f"}${e.order.join("")}_${ko}`;
}
export function decodeEntry(s: string): Entry | null {
  try {
    const quick = s[0] === "q";
    const [ord, ko] = s.slice(1).split("_");
    const order: string[] = [];
    for (let i = 0; i < ord.length; i += 3) order.push(ord.slice(i, i + 3));
    if (order.length !== CODES.length || new Set(order).size !== CODES.length || order.some((c) => !CLUB[c])) return null;
    const picks: KoPicks = {};
    for (const kv of (ko ?? "").split("~").filter(Boolean)) {
      const [k, v] = kv.split(".");
      if (CLUB[v]) picks[k] = v;
    }
    return { order, quick, picks };
  } catch {
    return null;
  }
}
