// One full season: 144 league-phase matches -> table -> play-off -> R16 -> QF -> SF -> final.
import { buildBracket, type Bracket } from "./bracket";
import { CLUB, CODES, FIXTURES, lambdas, matchOdds, type Venue } from "./model";
import type { Rng } from "./rng";
import { player, squad, XI, type Player } from "./squads";

export type Stage = "league" | "po" | "r16" | "qf" | "sf" | "final";
export const STAGE_LABEL: Record<Stage, string> = {
  league: "League phase", po: "Knockout play-off", r16: "Round of 16", qf: "Quarter-finals", sf: "Semi-finals", final: "Final",
};
export type AsOf = "live" | "pre";

export type GoalEv = { min: number; side: "h" | "a"; scorer: string; assist?: string; pen?: boolean };
export type SubEv = { min: number; side: "h" | "a"; on: string; off: string };
export type LineupEntry = {
  pid: string; x: number; y: number; start: boolean; on?: number; off?: number;
  rating: number; goals: number; assists: number; captain: boolean;
};
export type MatchDetail = { home: LineupEntry[]; away: LineupEntry[]; bench: { home: string[]; away: string[] }; goals: GoalEv[]; subs: SubEv[]; potm: string };

export type MatchResult = {
  id: string; stage: Stage; md?: number; leg?: 1 | 2; date?: string; venue: Venue;
  home: string; away: string;
  hg: number; ag: number; // final score incl. extra time
  ft: [number, number]; // after 90'
  aet: boolean; pens?: [number, number]; real?: boolean;
  detail?: MatchDetail;
};

export type Tie = {
  id: string; stage: Stage; a: string; b: string; // b = higher seed, hosts the 2nd leg
  legs: [MatchResult, MatchResult]; aggA: number; aggB: number;
  winner: string; loser: string; aet: boolean; pens?: [number, number];
};

export type TableRow = {
  code: string; p: number; w: number; d: number; l: number; gf: number; ga: number; gd: number; pts: number;
  awayGf: number; awayW: number; oppPts: number; oppGd: number; oppGf: number; pos: number;
};

export type Tally = Record<string, { g: number; a: number; cs: number; gL: number; aL: number; csL: number }>;

/** Typed-array tally for the fast path; index = club index * SQUAD_SIZE + squad index. */
export const SQUAD_SIZE = 23;
export type FastTally = { g: Int32Array; a: Int32Array; cs: Int32Array };
export const newFastTally = (): FastTally => {
  const n = CODES.length * SQUAD_SIZE;
  return { g: new Int32Array(n), a: new Int32Array(n), cs: new Int32Array(n) };
};
export const fastPid = (i: number) => squad(CODES[Math.floor(i / SQUAD_SIZE)])[i % SQUAD_SIZE].id;
export const CIDX: Record<string, number> = Object.fromEntries(CODES.map((c, i) => [c, i]));

export type Season = {
  table: TableRow[];
  order: string[];
  league: MatchResult[];
  bracket: Bracket;
  po: Tie[]; r16: Tie[]; qf: Tie[]; sf: Tie[];
  final: { match: MatchResult; winner: string; loser: string };
  champion: string;
  tally: Tally; // detail runs
  fast?: FastTally; // fast runs
  posByMd?: Record<string, number[]>;
};

// ---------------------------------------------------------------- score sampling
type Sampler = { cum: Float64Array; h: Uint8Array; a: Uint8Array };
const samplers: (Sampler | undefined)[] = [];
export function sampler(home: string, away: string, venue: Venue): Sampler {
  const key = (CIDX[home] * CODES.length + CIDX[away]) * 2 + (venue === "neutral" ? 1 : 0);
  let s = samplers[key];
  if (!s) {
    const o = matchOdds(home, away, venue);
    const cells: [number, number, number][] = [];
    o.grid.forEach((row, i) => row.forEach((p, j) => cells.push([p, i, j])));
    cells.sort((x, y) => y[0] - x[0]);
    const cum = new Float64Array(cells.length), h = new Uint8Array(cells.length), a = new Uint8Array(cells.length);
    let c = 0;
    cells.forEach(([p, i, j], k) => {
      c += p;
      cum[k] = c;
      h[k] = i;
      a[k] = j;
    });
    s = { cum, h, a };
    samplers[key] = s;
  }
  return s;
}

function sample90(home: string, away: string, venue: Venue, rng: Rng): [number, number] {
  const s = sampler(home, away, venue);
  const r = rng.next() * s.cum[s.cum.length - 1];
  for (let k = 0; k < s.cum.length; k++) if (r < s.cum[k]) return [s.h[k], s.a[k]];
  return [s.h[s.h.length - 1], s.a[s.a.length - 1]];
}

function sampleET(home: string, away: string, venue: Venue, rng: Rng): [number, number] {
  const [lh, la] = lambdas(home, away, venue);
  return [rng.poisson(lh / 3), rng.poisson(la / 3)];
}

export function shootout(rng: Rng, pHome = 0.76, pAway = 0.76): [number, number] {
  let h = 0, a = 0;
  for (let k = 0; k < 5; k++) {
    // After the home kick: home has 4-k kicks left, away 5-k. Stop once it's decided.
    if (rng.next() < pHome) h++;
    if (h > a + (5 - k) || a > h + (4 - k)) return [h, a];
    if (rng.next() < pAway) a++;
    if (h > a + (4 - k) || a > h + (4 - k)) return [h, a];
  }
  while (h === a) {
    const x = rng.next() < pHome, y = rng.next() < pAway;
    h += +x;
    a += +y;
  }
  return [h, a];
}

// ---------------------------------------------------------------- match details
function gauss(rng: Rng): number {
  const u = Math.max(1e-9, rng.next()), v = rng.next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

type SideState = {
  lineup: LineupEntry[]; // everyone who played
  onPitch: (string | null)[]; // index by XI slot -> pid at current minute
  timeline: { slot: number; pid: string; from: number; to: number }[];
  bench: string[];
};

function captainOf(code: string): number {
  let h = 0;
  for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return [3, 4, 5, 6, 0][h % 5]; // an XI index
}

function buildSide(code: string, rng: Rng, minutes: number, mirror: boolean): { st: SideState; subs: { min: number; on: string; off: string }[] } {
  const sq = squad(code);
  const starters = sq.filter((p) => p.starter);
  const bench = sq.filter((p) => !p.starter);
  const cap = captainOf(code);
  const lineup: LineupEntry[] = starters.map((p, i) => ({
    pid: p.id, x: mirror ? 100 - XI[i].x : XI[i].x, y: XI[i].y, start: true, rating: 0, goals: 0, assists: 0, captain: i === cap,
  }));
  const timeline = starters.map((p, i) => ({ slot: i, pid: p.id, from: 0, to: minutes }));
  // 3-5 substitutions, attackers and midfielders more likely to come off.
  const nSubs = 3 + rng.int(3);
  const subs: { min: number; on: string; off: string }[] = [];
  const usedSlots = new Set<number>();
  const usedBench = new Set<string>();
  const offW = [0, 0.4, 0.5, 0.5, 0.4, 1, 1, 1.1, 1.4, 1.2, 1.4];
  for (let k = 0; k < nSubs; k++) {
    const w = offW.map((x, i) => (usedSlots.has(i) ? 0 : x));
    const slot = rng.weighted(w);
    usedSlots.add(slot);
    const want = XI[slot].slot;
    const pool = bench.filter((b) => !usedBench.has(b.id) && b.slot !== "GK");
    const same = pool.filter((b) => b.slot === want || b.pos === starters[slot].pos);
    const on = (same.length ? same : pool)[rng.int((same.length ? same : pool).length)];
    if (!on) break;
    usedBench.add(on.id);
    const min = k === nSubs - 1 && minutes > 90 && rng.next() < 0.5 ? 91 + rng.int(14) : 55 + rng.int(34);
    subs.push({ min, on: on.id, off: timeline[slot].pid });
  }
  subs.sort((x, y) => x.min - y.min);
  for (const s of subs) {
    const t = timeline.find((t) => t.pid === s.off)!;
    t.to = s.min;
    const slot = t.slot;
    timeline.push({ slot, pid: s.on, from: s.min, to: minutes });
    const off = lineup.find((l) => l.pid === s.off)!;
    off.off = s.min;
    lineup.push({ pid: s.on, x: off.x, y: off.y, start: false, on: s.min, rating: 0, goals: 0, assists: 0, captain: false });
  }
  return {
    st: { lineup, onPitch: [], timeline, bench: bench.filter((b) => !usedBench.has(b.id)).map((b) => b.id) },
    subs,
  };
}

function onPitchAt(st: SideState, min: number): Player[] {
  return st.timeline.filter((t) => t.from < min && t.to >= min).map((t) => player(t.pid));
}

function goalMinute(rng: Rng, lo: number, hi: number): number {
  // Slight late-game skew, as in real data.
  const u = Math.pow(rng.next(), 0.9);
  return lo + Math.floor(u * (hi - lo + 1));
}

export function makeDetail(home: string, away: string, ft: [number, number], et: [number, number] | null, rng: Rng): MatchDetail {
  const minutes = et ? 120 : 90;
  const H = buildSide(home, rng, minutes, false);
  const A = buildSide(away, rng, minutes, true);
  const goals: GoalEv[] = [];
  const addGoals = (n: number, side: "h" | "a", lo: number, hi: number) => {
    const st = side === "h" ? H.st : A.st;
    for (let k = 0; k < n; k++) {
      const min = goalMinute(rng, lo, hi);
      const on = onPitchAt(st, min);
      const pen = rng.next() < 0.1;
      let scorer: Player;
      if (pen) scorer = on.reduce((b, p) => (p.goalW > b.goalW ? p : b), on[0]);
      else scorer = on[rng.weighted(on.map((p) => p.goalW))];
      let assist: string | undefined;
      if (!pen && rng.next() < 0.74) {
        const others = on.filter((p) => p.id !== scorer.id);
        assist = others[rng.weighted(others.map((p) => p.assistW))].id;
      }
      goals.push({ min, side, scorer: scorer.id, assist, pen: pen || undefined });
    }
  };
  addGoals(ft[0], "h", 1, 90);
  addGoals(ft[1], "a", 1, 90);
  if (et) {
    addGoals(et[0], "h", 91, 120);
    addGoals(et[1], "a", 91, 120);
  }
  goals.sort((x, y) => x.min - y.min);

  const hg = ft[0] + (et?.[0] ?? 0), ag = ft[1] + (et?.[1] ?? 0);
  const rate = (side: SideState, forG: number, against: number) => {
    const res = forG > against ? 0.3 : forG < against ? -0.3 : 0;
    for (const l of side.lineup) {
      const p = player(l.pid);
      const g = goals.filter((x) => x.scorer === l.pid).length;
      const a = goals.filter((x) => x.assist === l.pid).length;
      l.goals = g;
      l.assists = a;
      let r = (l.start ? 6.4 : 6.3) + gauss(rng) * (l.start ? 0.38 : 0.28) + res + g * 1.05 + a * 0.6;
      if (p.pos === "GK") r += against === 0 ? 0.7 : -0.18 * against;
      if (p.pos === "DF") r += against === 0 ? 0.35 : -0.1 * against;
      l.rating = Math.round(Math.max(4.5, Math.min(10, r)) * 10) / 10;
    }
  };
  rate(H.st, hg, ag);
  rate(A.st, ag, hg);
  const all = [...H.st.lineup, ...A.st.lineup];
  const potm = all.reduce((b, l) => (l.rating > b.rating ? l : b), all[0]).pid;
  return {
    home: H.st.lineup,
    away: A.st.lineup,
    bench: { home: H.st.bench, away: A.st.bench },
    goals,
    subs: [...H.subs.map((s) => ({ ...s, side: "h" as const })), ...A.subs.map((s) => ({ ...s, side: "a" as const }))].sort((x, y) => x.min - y.min),
    potm,
  };
}

// ---------------------------------------------------------------- tallies
function bump(t: Tally, pid: string, key: "g" | "a" | "cs", league: boolean) {
  const e = t[pid] ?? (t[pid] = { g: 0, a: 0, cs: 0, gL: 0, aL: 0, csL: 0 });
  e[key]++;
  if (league) e[`${key}L`]++;
}

/** Fast path: attribute goals/assists without building lineups. */
// Fast path pools: one combined cumulative distribution per club (starters 84%, subs 16%).
type Pool = { idx: Int32Array; gc: Float64Array; ac: Float64Array; gk: number };
const pools: Pool[] = [];
function poolOf(code: string): Pool {
  const ci = CIDX[code];
  let p = pools[ci];
  if (!p) {
    const sq = squad(code);
    const ids = sq.map((_, i) => i).filter((i) => sq[i].pos !== "GK" || sq[i].starter);
    const share = (i: number) => (sq[i].starter ? 0.84 : 0.16);
    const cum = (w: (i: number) => number, group: (i: number) => boolean) => {
      const totS = ids.filter((i) => group(i) && sq[i].starter).reduce((s, i) => s + w(i), 0);
      const totB = ids.filter((i) => group(i) && !sq[i].starter).reduce((s, i) => s + w(i), 0);
      let c = 0;
      return Float64Array.from(ids, (i) => (c += (w(i) / (sq[i].starter ? totS : totB)) * share(i)));
    };
    const all = () => true;
    p = { idx: Int32Array.from(ids, (i) => ci * SQUAD_SIZE + i), gc: cum((i) => sq[i].goalW, all), ac: cum((i) => sq[i].assistW, all), gk: ci * SQUAD_SIZE };
    p.gc[p.gc.length - 1] = p.ac[p.ac.length - 1] = 1;
    pools[ci] = p;
  }
  return p;
}

function pickCum(c: Float64Array, r: number): number {
  let k = 0;
  while (r >= c[k]) k++;
  return k;
}

/** Fast path: attribute goals/assists without building lineups. */
export function tallyFast(t: FastTally, code: string, goals: number, conceded: number, rng: Rng) {
  const p = poolOf(code);
  for (let k = 0; k < goals; k++) {
    const si = pickCum(p.gc, rng.next());
    t.g[p.idx[si]]++;
    if (rng.next() < 0.67) {
      let ai = pickCum(p.ac, rng.next());
      if (ai === si) ai = pickCum(p.ac, rng.next());
      if (ai !== si) t.a[p.idx[ai]]++;
    }
  }
  if (conceded === 0) t.cs[p.gk]++;
}

function tallyDetail(t: Tally, m: MatchResult) {
  const d = m.detail!;
  const league = m.stage === "league";
  for (const g of d.goals) {
    bump(t, g.scorer, "g", league);
    if (g.assist) bump(t, g.assist, "a", league);
  }
  if (m.ag === 0) bump(t, d.home[0].pid, "cs", league);
  if (m.hg === 0) bump(t, d.away[0].pid, "cs", league);
}

// ---------------------------------------------------------------- table
function emptyRow(code: string): TableRow {
  return { code, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, awayGf: 0, awayW: 0, oppPts: 0, oppGd: 0, oppGf: 0, pos: 0 };
}

/** UEFA league-phase order: Pts, GD, GF, away GF, W, away W, opponents' Pts/GD/GF, then coefficient. */
export function computeTable(matches: { home: string; away: string; hg: number; ag: number }[]): TableRow[] {
  const rows: Record<string, TableRow> = {};
  for (const c of CODES) rows[c] = emptyRow(c);
  const opps: Record<string, string[]> = {};
  for (const m of matches) {
    const h = rows[m.home], a = rows[m.away];
    (opps[m.home] ??= []).push(m.away);
    (opps[m.away] ??= []).push(m.home);
    h.p++; a.p++;
    h.gf += m.hg; h.ga += m.ag; a.gf += m.ag; a.ga += m.hg;
    a.awayGf += m.ag;
    if (m.hg > m.ag) { h.w++; a.l++; h.pts += 3; }
    else if (m.hg < m.ag) { a.w++; h.l++; a.pts += 3; a.awayW++; }
    else { h.d++; a.d++; h.pts++; a.pts++; }
  }
  for (const r of Object.values(rows)) r.gd = r.gf - r.ga;
  for (const r of Object.values(rows))
    for (const o of opps[r.code] ?? []) {
      r.oppPts += rows[o].pts;
      r.oppGd += rows[o].gd;
      r.oppGf += rows[o].gf;
    }
  const list = Object.values(rows);
  list.sort(
    (x, y) =>
      y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || y.awayGf - x.awayGf || y.w - x.w || y.awayW - x.awayW ||
      y.oppPts - x.oppPts || y.oppGd - x.oppGd || y.oppGf - x.oppGf || CLUB[x.code].seedOrder - CLUB[y.code].seedOrder,
  );
  list.forEach((r, i) => (r.pos = i + 1));
  return list;
}

// ---------------------------------------------------------------- season
export type SimOptions = { asOf: AsOf; detail: boolean; fast?: FastTally };

/** Where a run's player stats go: a Record with lineups (detail), typed arrays (fast) or nowhere. */
export type Sink = { detail: true; tally: Tally } | { detail: false; fast?: FastTally };

function finishMatch(m: MatchResult, et: [number, number] | null, sink: Sink, rng: Rng) {
  if (sink.detail) {
    m.detail = makeDetail(m.home, m.away, m.ft, et, rng);
    tallyDetail(sink.tally, m);
  } else if (sink.fast) {
    tallyFast(sink.fast, m.home, m.hg, m.ag, rng);
    tallyFast(sink.fast, m.away, m.ag, m.hg, rng);
  }
}

export function playTie(a: string, b: string, stage: Stage, id: string, rng: Rng, sink: Sink): Tie {
  const l1ft = sample90(a, b, "home", rng);
  const leg1: MatchResult = { id: `${id}-1`, stage, leg: 1, venue: "home", home: a, away: b, hg: l1ft[0], ag: l1ft[1], ft: l1ft, aet: false };
  finishMatch(leg1, null, sink, rng);
  const l2ft = sample90(b, a, "home", rng);
  const leg2: MatchResult = { id: `${id}-2`, stage, leg: 2, venue: "home", home: b, away: a, hg: l2ft[0], ag: l2ft[1], ft: l2ft, aet: false };
  let aggA = l1ft[0] + l2ft[1], aggB = l1ft[1] + l2ft[0];
  let et: [number, number] | null = null;
  let pens: [number, number] | undefined;
  if (aggA === aggB) {
    et = sampleET(b, a, "home", rng);
    leg2.aet = true;
    leg2.hg += et[0];
    leg2.ag += et[1];
    aggB += et[0];
    aggA += et[1];
    if (aggA === aggB) {
      const [ph, pa] = shootout(rng);
      leg2.pens = [ph, pa];
      pens = [pa, ph];
    }
  }
  finishMatch(leg2, et, sink, rng);
  const aWins = aggA > aggB || (aggA === aggB && pens![0] > pens![1]);
  return { id, stage, a, b, legs: [leg1, leg2], aggA, aggB, winner: aWins ? a : b, loser: aWins ? b : a, aet: leg2.aet, pens };
}

export function playSingle(a: string, b: string, venue: Venue, stage: Stage, id: string, rng: Rng, sink: Sink) {
  const ft = sample90(a, b, venue, rng);
  const m: MatchResult = { id, stage, venue, home: a, away: b, hg: ft[0], ag: ft[1], ft, aet: false };
  let et: [number, number] | null = null;
  if (ft[0] === ft[1]) {
    et = sampleET(a, b, venue, rng);
    m.aet = true;
    m.hg += et[0];
    m.ag += et[1];
    if (m.hg === m.ag) m.pens = shootout(rng);
  }
  finishMatch(m, et, sink, rng);
  const aWins = m.hg > m.ag || (m.hg === m.ag && m.pens![0] > m.pens![1]);
  return { match: m, winner: aWins ? a : b, loser: aWins ? b : a };
}

export function simulateLeague(rng: Rng, opts: SimOptions, sink: Sink): { league: MatchResult[]; table: TableRow[]; posByMd?: Record<string, number[]> } {
  const league: MatchResult[] = [];
  const posByMd: Record<string, number[]> | undefined = opts.detail ? Object.fromEntries(CODES.map((c) => [c, []])) : undefined;
  let md = 1;
  for (const f of FIXTURES) {
    if (posByMd && f.md !== md) {
      computeTable(league).forEach((r) => posByMd[r.code].push(r.pos));
      md = f.md;
    }
    const id = `L${f.md}-${f.home}-${f.away}`;
    if (opts.asOf === "live" && f.hg !== undefined) {
      league.push({ id, stage: "league", md: f.md, date: f.date, venue: "home", home: f.home, away: f.away, hg: f.hg, ag: f.ag!, ft: [f.hg, f.ag!], aet: false, real: true });
      continue;
    }
    const ft = sample90(f.home, f.away, "home", rng);
    const m: MatchResult = { id, stage: "league", md: f.md, date: f.date, venue: "home", home: f.home, away: f.away, hg: ft[0], ag: ft[1], ft, aet: false };
    finishMatch(m, null, sink, rng);
    league.push(m);
  }
  const table = computeTable(league);
  if (posByMd) table.forEach((r) => posByMd[r.code].push(r.pos));
  return { league, table, posByMd };
}

export function playKnockouts(order: string[], rng: Rng, sink: Sink) {
  const pos = Object.fromEntries(order.map((c, i) => [c, i + 1]));
  const bracket = buildBracket(order, rng);
  const po = bracket.playoffs.map((t) => playTie(t.unseeded, t.seeded, "po", t.id, rng, sink));
  const r16 = bracket.r16.map((s) => playTie(po[s.po].winner, s.top, "r16", s.id, rng, sink));
  const pairUp = (prev: Tie[], stage: Stage, prefix: string) => {
    const out: Tie[] = [];
    for (let i = 0; i < prev.length; i += 2) {
      const x = prev[i].winner, y = prev[i + 1].winner;
      const [lo, hi] = pos[x] < pos[y] ? [y, x] : [x, y];
      out.push(playTie(lo, hi, stage, `${prefix}${i / 2 + 1}`, rng, sink));
    }
    return out;
  };
  const qf = pairUp(r16, "qf", "QF");
  const sf = pairUp(qf, "sf", "SF");
  const final = playSingle(sf[0].winner, sf[1].winner, "neutral", "final", "F", rng, sink);
  return { bracket, po, r16, qf, sf, final };
}

export function simulateSeason(rng: Rng, opts: SimOptions): Season {
  const tally: Tally = {};
  const sink: Sink = opts.detail ? { detail: true, tally } : { detail: false, fast: opts.fast };
  const { league, table, posByMd } = simulateLeague(rng, opts, sink);
  const order = table.map((r) => r.code);
  const ko = playKnockouts(order, rng, sink);
  return { table, order, league, ...ko, champion: ko.final.winner, tally, fast: opts.fast, posByMd };
}

/** Furthest stage a club reached: 0 out in league, 1 play-off, 2 R16, 3 QF, 4 SF, 5 final, 6 champion. */
export function reachMap(s: Season): Record<string, number> {
  const r: Record<string, number> = Object.fromEntries(CODES.map((c) => [c, 0]));
  s.order.forEach((c, i) => {
    if (i < 8) r[c] = 2;
    else if (i < 24) r[c] = 1;
  });
  for (const t of s.po) r[t.winner] = 2;
  for (const t of s.r16) r[t.winner] = 3;
  for (const t of s.qf) r[t.winner] = 4;
  for (const t of s.sf) r[t.winner] = 5;
  r[s.champion] = 6;
  return r;
}

/** One standalone match with full detail (Predict → "Settle it"). */
export function playOne(home: string, away: string, venue: Venue, rng: Rng): MatchResult {
  const ft = sample90(home, away, venue, rng);
  const m: MatchResult = { id: "one", stage: "league", venue, home, away, hg: ft[0], ag: ft[1], ft, aet: false };
  finishMatch(m, null, { detail: true, tally: {} }, rng);
  return m;
}
