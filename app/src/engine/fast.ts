// Allocation-light season kernel for bulk Monte Carlo (same model and rules as season.ts,
// minus lineups and match objects). Used by aggregate() and grade().
import { buildBracket } from "./bracket";
import { CLUB, CODES, FIXTURES, lambdas } from "./model";
import type { Rng } from "./rng";
import { CIDX, sampler, shootout, tallyFast, type AsOf, type FastTally } from "./season";

const N = CODES.length;
const NF = FIXTURES.length;
const FH = Int32Array.from(FIXTURES.map((f) => CIDX[f.home]));
const FA = Int32Array.from(FIXTURES.map((f) => CIDX[f.away]));
const REAL = FIXTURES.map((f) => (f.hg === undefined ? null : ([f.hg, f.ag!] as const)));
const OPP: number[][] = CODES.map((c) => FIXTURES.flatMap((f) => (f.home === c ? [CIDX[f.away]] : f.away === c ? [CIDX[f.home]] : [])));
const SEED = Int32Array.from(CODES.map((c) => CLUB[c].seedOrder));

type S = ReturnType<typeof sampler>;
const fixtureSampler: S[] = [];
const etLam = new Float64Array(N * N * 2); // [b home vs a] lh/3, la/3 for ET at b's ground
const etFinal = new Float64Array(N * N * 2);

function draw(s: S, rng: Rng): number {
  const r = rng.next() * s.cum[s.cum.length - 1];
  const c = s.cum;
  for (let k = 0; k < c.length; k++) if (r < c[k]) return k;
  return c.length - 1;
}

export type FastResult = {
  pos: Int8Array; // club index -> finishing position (1-based)
  order: Int32Array; // position-1 -> club index
  reach: Int8Array; // 0 league exit .. 6 champion
  pts: Int16Array;
  goals: number;
};
export const newFastResult = (): FastResult => ({
  pos: new Int8Array(N), order: new Int32Array(N), reach: new Int8Array(N), pts: new Int16Array(N), goals: 0,
});

const gf = new Int32Array(N), ga = new Int32Array(N), w = new Int32Array(N), awg = new Int32Array(N), aww = new Int32Array(N);
const key = new Float64Array(N), opPts = new Int32Array(N), opGd = new Int32Array(N), opGf = new Int32Array(N);
const idx: number[] = Array.from({ length: N }, (_, i) => i);
const cmp = (x: number, y: number) =>
  key[y] - key[x] || opPts[y] - opPts[x] || opGd[y] - opGd[x] || opGf[y] - opGf[x] || SEED[x] - SEED[y];

function etLambdas(table: Float64Array, home: number, away: number, neutral: boolean): [number, number] {
  const k = (home * N + away) * 2;
  if (!table[k]) {
    const [lh, la] = lambdas(CODES[home], CODES[away], neutral ? "neutral" : "home");
    table[k] = lh / 3;
    table[k + 1] = la / 3;
  }
  return [table[k], table[k + 1]];
}

/** Two legs: a hosts leg 1, b (higher seed) hosts leg 2. Returns the winner's index. */
function tie(a: number, b: number, rng: Rng, out: FastResult, tally?: FastTally): number {
  const s1 = sampler(CODES[a], CODES[b], "home");
  const k1 = draw(s1, rng);
  const s2 = sampler(CODES[b], CODES[a], "home");
  const k2 = draw(s2, rng);
  let aggA = s1.h[k1] + s2.a[k2], aggB = s1.a[k1] + s2.h[k2];
  out.goals += aggA + aggB;
  if (tally) {
    tallyFast(tally, CODES[a], s1.h[k1], s1.a[k1], rng);
    tallyFast(tally, CODES[b], s1.a[k1], s1.h[k1], rng);
  }
  let etB = 0, etA = 0;
  if (aggA === aggB) {
    const [lb, la] = etLambdas(etLam, b, a, false);
    etB = rng.poisson(lb);
    etA = rng.poisson(la);
    aggA += etA;
    aggB += etB;
    out.goals += etA + etB;
  }
  if (tally) {
    tallyFast(tally, CODES[b], s2.h[k2] + etB, s2.a[k2] + etA, rng);
    tallyFast(tally, CODES[a], s2.a[k2] + etA, s2.h[k2] + etB, rng);
  }
  if (aggA !== aggB) return aggA > aggB ? a : b;
  const [pb, pa] = shootout(rng);
  return pa > pb ? a : b;
}

export function fastSeason(rng: Rng, asOf: AsOf, out: FastResult, tally?: FastTally): FastResult {
  const pts = out.pts;
  pts.fill(0); gf.fill(0); ga.fill(0); w.fill(0); awg.fill(0); aww.fill(0);
  out.goals = 0;
  for (let i = 0; i < NF; i++) {
    const h = FH[i], a = FA[i];
    let hg: number, ag: number;
    const real = asOf === "live" ? REAL[i] : null;
    if (real) {
      [hg, ag] = real;
    } else {
      const s = fixtureSampler[i] ?? (fixtureSampler[i] = sampler(CODES[h], CODES[a], "home"));
      const k = draw(s, rng);
      hg = s.h[k];
      ag = s.a[k];
      if (tally) {
        tallyFast(tally, CODES[h], hg, ag, rng);
        tallyFast(tally, CODES[a], ag, hg, rng);
      }
    }
    out.goals += hg + ag;
    gf[h] += hg; ga[h] += ag; gf[a] += ag; ga[a] += hg; awg[a] += ag;
    if (hg > ag) { pts[h] += 3; w[h]++; }
    else if (hg < ag) { pts[a] += 3; w[a]++; aww[a]++; }
    else { pts[h]++; pts[a]++; }
  }
  for (let c = 0; c < N; c++) {
    key[c] = ((((pts[c] * 128 + (gf[c] - ga[c] + 64)) * 64 + gf[c]) * 64 + awg[c]) * 16 + w[c]) * 8 + aww[c];
    let p = 0, d = 0, g = 0;
    for (const o of OPP[c]) {
      p += pts[o];
      d += gf[o] - ga[o];
      g += gf[o];
    }
    opPts[c] = p; opGd[c] = d; opGf[c] = g;
  }
  idx.sort(cmp);
  const reach = out.reach;
  for (let p = 0; p < N; p++) {
    const c = idx[p];
    out.order[p] = c;
    out.pos[c] = p + 1;
    reach[c] = p < 8 ? 2 : p < 24 ? 1 : 0;
  }

  const br = buildBracket(idx.map((c) => CODES[c]), rng);
  const poW = br.playoffs.map((t) => tie(CIDX[t.unseeded], CIDX[t.seeded], rng, out, tally));
  for (const c of poW) reach[c] = 2;
  let round = br.r16.map((s) => tie(poW[s.po], CIDX[s.top], rng, out, tally));
  for (const c of round) reach[c] = 3;
  for (let lvl = 4; lvl <= 5; lvl++) {
    const next: number[] = [];
    for (let i = 0; i < round.length; i += 2) {
      const x = round[i], y = round[i + 1];
      const [lo, hi] = out.pos[x] < out.pos[y] ? [y, x] : [x, y];
      next.push(tie(lo, hi, rng, out, tally));
    }
    for (const c of next) reach[c] = lvl;
    round = next;
  }
  // Final: neutral, single match.
  const [a, b] = round;
  const s = sampler(CODES[a], CODES[b], "neutral");
  const k = draw(s, rng);
  let ga_ = s.h[k], gb_ = s.a[k];
  if (ga_ === gb_) {
    const [la, lb] = etLambdas(etFinal, a, b, true);
    ga_ += rng.poisson(la);
    gb_ += rng.poisson(lb);
  }
  out.goals += ga_ + gb_;
  if (tally) {
    tallyFast(tally, CODES[a], ga_, gb_, rng);
    tallyFast(tally, CODES[b], gb_, ga_, rng);
  }
  let champ: number;
  if (ga_ !== gb_) champ = ga_ > gb_ ? a : b;
  else {
    const [pa, pb] = shootout(rng);
    champ = pa > pb ? a : b;
  }
  reach[champ] = 6;
  return out;
}
