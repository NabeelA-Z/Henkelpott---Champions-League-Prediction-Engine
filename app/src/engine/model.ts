// The fitted goals model (frozen offline by model/fit.py) and the closed-form maths on top of it.
import raw from "../data/model.json";

export type Club = {
  code: string;
  name: string;
  short: string;
  pot: number;
  country: string;
  colors: [string, string];
  att: number;
  def: number;
  elo: number;
  matches: number;
  seedOrder: number;
};

export type Fixture = { md: number; date: string; home: string; away: string; hg?: number; ag?: number };

export type ModelData = {
  generated: string;
  season: string;
  params: { mu: number; home: number; homeDomestic: number; rho: number; xi: number; sigma: number; euroWeight: number };
  clubs: Club[];
  fixtures: Fixture[];
  validation: {
    seasons: { season: string; model: Metric; elo: Metric }[];
    overall: { model: Metric; elo: Metric; uniform: Metric };
    rpsImprovementVsElo: number;
    ece: number;
    eceElo: number;
    calibration: { p: number; o: number; n: number }[];
    calibrationElo: { p: number; o: number; n: number }[];
    tuning: { seasons: string[]; chosen: { xi: number; sigma: number; euroWeight: number } };
  };
  data: { matchesFit: number; teams: number; countries: number; from: string; to: string; byComp: Record<string, number> };
};
export type Metric = { rps: number; brier: number; logloss: number; n: number };

export const MODEL = raw as unknown as ModelData;
export const CLUBS: Club[] = MODEL.clubs.map((c) => ({ ...c, colors: [c.colors[0], c.colors[1]] }));
export const CLUB: Record<string, Club> = Object.fromEntries(CLUBS.map((c) => [c.code, c]));
export const CODES = CLUBS.map((c) => c.code);
export const FIXTURES: Fixture[] = MODEL.fixtures;
export const PLAYED = FIXTURES.filter((f) => f.hg !== undefined);
export const MAX_GOALS = 10; // grid is 0..10

export type Venue = "home" | "neutral";

export function lambdas(home: string, away: string, venue: Venue = "home"): [number, number] {
  const p = MODEL.params;
  const h = CLUB[home], a = CLUB[away];
  const hAdv = venue === "neutral" ? 0 : p.home;
  return [Math.exp(p.mu + h.att - a.def + hAdv), Math.exp(p.mu + a.att - h.def)];
}

function pois(k: number, l: number): number {
  let f = 1;
  for (let i = 2; i <= k; i++) f *= i;
  return (Math.exp(-l) * Math.pow(l, k)) / f;
}

/** grid[i][j] = P(home i, away j) under Dixon-Coles. */
export function scoreGrid(lh: number, la: number, rho = MODEL.params.rho): number[][] {
  const n = MAX_GOALS + 1;
  const g: number[][] = [];
  let tot = 0;
  for (let i = 0; i < n; i++) {
    g.push([]);
    for (let j = 0; j < n; j++) {
      let p = pois(i, lh) * pois(j, la);
      if (i === 0 && j === 0) p *= 1 - lh * la * rho;
      else if (i === 0 && j === 1) p *= 1 + lh * rho;
      else if (i === 1 && j === 0) p *= 1 + la * rho;
      else if (i === 1 && j === 1) p *= 1 - rho;
      g[i].push(p);
      tot += p;
    }
  }
  for (const row of g) for (let j = 0; j < n; j++) row[j] /= tot;
  return g;
}

export function wdl(g: number[][]): { home: number; draw: number; away: number } {
  let h = 0, d = 0, a = 0;
  for (let i = 0; i < g.length; i++)
    for (let j = 0; j < g.length; j++) {
      if (i > j) h += g[i][j];
      else if (i === j) d += g[i][j];
      else a += g[i][j];
    }
  return { home: h, draw: d, away: a };
}

export type MatchOdds = {
  home: string;
  away: string;
  venue: Venue;
  lh: number;
  la: number;
  grid: number[][];
  wdl: { home: number; draw: number; away: number };
  top: { h: number; a: number; p: number }[];
};

const oddsCache = new Map<string, MatchOdds>();
export function matchOdds(home: string, away: string, venue: Venue = "home"): MatchOdds {
  const key = `${home}|${away}|${venue}`;
  const hit = oddsCache.get(key);
  if (hit) return hit;
  const [lh, la] = lambdas(home, away, venue);
  const grid = scoreGrid(lh, la);
  const cells: { h: number; a: number; p: number }[] = [];
  grid.forEach((row, i) => row.forEach((p, j) => cells.push({ h: i, a: j, p })));
  cells.sort((x, y) => y.p - x.p);
  const o = { home, away, venue, lh, la, grid, wdl: wdl(grid), top: cells.slice(0, 10) };
  oddsCache.set(key, o);
  return o;
}

export function markets(g: number[][]) {
  let btts = 0, o15 = 0, o25 = 0, o35 = 0, csH = 0, csA = 0;
  for (let i = 0; i < g.length; i++)
    for (let j = 0; j < g.length; j++) {
      const p = g[i][j];
      if (i > 0 && j > 0) btts += p;
      if (i + j > 1.5) o15 += p;
      if (i + j > 2.5) o25 += p;
      if (i + j > 3.5) o35 += p;
      if (j === 0) csH += p;
      if (i === 0) csA += p;
    }
  return { btts, o15, o25, o35, csHome: csH, csAway: csA };
}

/** Distribution of (home-away) goal difference from a grid, offset by MAX_GOALS. */
function diffDist(g: number[][]): number[] {
  const d = new Array(2 * MAX_GOALS + 1).fill(0);
  for (let i = 0; i < g.length; i++) for (let j = 0; j < g.length; j++) d[i - j + MAX_GOALS] += g[i][j];
  return d;
}

export const PEN_HOME_EDGE = 0.5;

export type TieOdds = {
  a: { total: number; normal: number; et: number; pens: number };
  b: { total: number; normal: number; et: number; pens: number };
};

/**
 * Two-legged tie: leg 1 at A's ground, leg 2 at B's ground (B is the higher seed).
 * Aggregate level after 180' -> 30' extra time at B's ground -> penalties (coin flip).
 * Away goals do not count.
 */
export function tieOdds(a: string, b: string): TieOdds {
  const d1 = diffDist(matchOdds(a, b).grid); // A - B in leg 1
  const d2 = diffDist(matchOdds(b, a).grid); // B - A in leg 2
  let aWin = 0, bWin = 0, level = 0;
  for (let x = 0; x < d1.length; x++) {
    if (!d1[x]) continue;
    for (let y = 0; y < d2.length; y++) {
      const p = d1[x] * d2[y];
      const agg = x - MAX_GOALS - (y - MAX_GOALS); // A minus B
      if (agg > 0) aWin += p;
      else if (agg < 0) bWin += p;
      else level += p;
    }
  }
  const et = extraTime(b, a, true);
  return {
    a: { total: aWin + level * (et.away + et.draw * (1 - PEN_HOME_EDGE)), normal: aWin, et: level * et.away, pens: level * et.draw * (1 - PEN_HOME_EDGE) },
    b: { total: bWin + level * (et.home + et.draw * PEN_HOME_EDGE), normal: bWin, et: level * et.home, pens: level * et.draw * PEN_HOME_EDGE },
  };
}

/** Single match that must produce a winner (the final at a neutral venue). */
export function singleKnockoutOdds(a: string, b: string, venue: Venue = "neutral"): TieOdds {
  const w = matchOdds(a, b, venue).wdl;
  const et = extraTime(a, b, venue === "home");
  return {
    a: { total: w.home + w.draw * (et.home + et.draw * 0.5), normal: w.home, et: w.draw * et.home, pens: w.draw * et.draw * 0.5 },
    b: { total: w.away + w.draw * (et.away + et.draw * 0.5), normal: w.away, et: w.draw * et.away, pens: w.draw * et.draw * 0.5 },
  };
}

function extraTime(home: string, away: string, homeVenue: boolean) {
  const [lh, la] = lambdas(home, away, homeVenue ? "home" : "neutral");
  return wdl(scoreGrid(lh / 3, la / 3, 0));
}

export function fmtPct(p: number, digits = 1): string {
  if (p > 0 && p < 0.001) return "<0.1%";
  if (p > 0.999 && p < 1) return ">99.9%";
  return `${(p * 100).toFixed(digits)}%`;
}

export function oneIn(p: number): string {
  if (p <= 0) return "never";
  const n = 1 / p;
  if (n < 10) return n.toFixed(1);
  return formatBig(n);
}

export function formatBig(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(n >= 1e13 ? 0 : 1)} trillion`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1)} billion`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)} million`;
  return Math.round(n).toLocaleString("en-GB");
}
