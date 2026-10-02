// Many seasons -> probabilities.
//
// Runs are split into fixed-size chunks, each with its own seed (`${seed}/agg/${i}`), so the
// result is identical however many workers share the chunks.
import { fastSeason, newFastResult } from "./fast";
import { CODES } from "./model";
import { makeRng } from "./rng";
import { fastPid, newFastTally, type AsOf } from "./season";

export const CHUNK = 1000;
const N = CODES.length;

export type ChunkRaw = {
  runs: number;
  reach: Float64Array; // N*7
  posHist: Float64Array; // N*N
  pts: Float64Array; // N
  goals: number;
  gTot: Float64Array; aTot: Float64Array; gShare: Float64Array; aShare: Float64Array; // per player
  simPos: Int8Array; // runs*N, finishing position per club
  simReach: Int8Array; // runs*N
};

export function runChunk(seed: string, chunk: number, runs: number, asOf: AsOf): ChunkRaw {
  const rng = makeRng(`${seed}/agg/${chunk}`);
  const fast = newFastTally();
  const P = fast.g.length;
  const out = newFastResult();
  const raw: ChunkRaw = {
    runs, reach: new Float64Array(N * 7), posHist: new Float64Array(N * N), pts: new Float64Array(N), goals: 0,
    gTot: new Float64Array(P), aTot: new Float64Array(P), gShare: new Float64Array(P), aShare: new Float64Array(P),
    simPos: new Int8Array(runs * N), simReach: new Int8Array(runs * N),
  };
  for (let r = 0; r < runs; r++) {
    fast.g.fill(0);
    fast.a.fill(0);
    fastSeason(rng, asOf, out, fast);
    raw.goals += out.goals;
    for (let c = 0; c < N; c++) {
      raw.reach[c * 7 + out.reach[c]]++;
      raw.posHist[c * N + out.pos[c] - 1]++;
      raw.pts[c] += out.pts[c];
      raw.simPos[r * N + c] = out.pos[c];
      raw.simReach[r * N + c] = out.reach[c];
    }
    let gMax = 0, aMax = 0, gN = 0, aN = 0;
    for (let i = 0; i < P; i++) {
      const g = fast.g[i], a = fast.a[i];
      raw.gTot[i] += g;
      raw.aTot[i] += a;
      if (g > gMax) { gMax = g; gN = 1; } else if (g === gMax) gN++;
      if (a > aMax) { aMax = a; aN = 1; } else if (a === aMax) aN++;
    }
    for (let i = 0; i < P; i++) {
      if (gMax > 0 && fast.g[i] === gMax) raw.gShare[i] += 1 / gN;
      if (aMax > 0 && fast.a[i] === aMax) raw.aShare[i] += 1 / aN;
    }
  }
  return raw;
}

export type ClubOdds = {
  champ: number; final: number; sf: number; qf: number; r16: number; top8: number; top24: number;
  avgPos: number; avgPts: number; posHist: number[]; // posHist[i] = P(finish i+1)
};
export type PlayerOdds = { pid: string; share: number; avg: number };
export type Sims = { runs: number; pos: Int8Array; reach: Int8Array };
export type Aggregate = {
  seed: string; runs: number; asOf: AsOf;
  clubs: Record<string, ClubOdds>;
  topScorer: PlayerOdds[];
  topAssist: PlayerOdds[];
  avgGoalsPerSeason: number;
};

/** Merge chunks (in chunk order) into probabilities plus the raw per-run outcomes. */
export function finalize(seed: string, asOf: AsOf, chunks: ChunkRaw[]): { agg: Aggregate; sims: Sims } {
  const runs = chunks.reduce((s, c) => s + c.runs, 0);
  const P = chunks[0].gTot.length;
  const sum = (pick: (c: ChunkRaw) => Float64Array, len: number) => {
    const out = new Float64Array(len);
    for (const ch of chunks) {
      const x = pick(ch);
      for (let i = 0; i < len; i++) out[i] += x[i];
    }
    return out;
  };
  const reach = sum((c) => c.reach, N * 7), posHist = sum((c) => c.posHist, N * N), pts = sum((c) => c.pts, N);
  const gTot = sum((c) => c.gTot, P), aTot = sum((c) => c.aTot, P), gShare = sum((c) => c.gShare, P), aShare = sum((c) => c.aShare, P);
  const clubs: Record<string, ClubOdds> = {};
  CODES.forEach((code, c) => {
    const atLeast = (lvl: number) => {
      let s = 0;
      for (let i = lvl; i < 7; i++) s += reach[c * 7 + i];
      return s / runs;
    };
    const hist = Array.from(posHist.subarray(c * N, c * N + N), (x) => x / runs);
    clubs[code] = {
      champ: atLeast(6), final: atLeast(5), sf: atLeast(4), qf: atLeast(3), r16: atLeast(2),
      top8: hist.slice(0, 8).reduce((a, b) => a + b, 0),
      top24: hist.slice(0, 24).reduce((a, b) => a + b, 0),
      avgPos: hist.reduce((a, p, i) => a + p * (i + 1), 0),
      avgPts: pts[c] / runs,
      posHist: hist,
    };
  });
  const top = (share: Float64Array, tot: Float64Array) =>
    Array.from(share, (s, i) => ({ pid: fastPid(i), share: s / runs, avg: tot[i] / runs }))
      .filter((x) => x.share > 0 || x.avg > 0)
      .sort((a, b) => b.share - a.share || b.avg - a.avg)
      .slice(0, 25);
  const pos = new Int8Array(runs * N), rch = new Int8Array(runs * N);
  let off = 0;
  for (const ch of chunks) {
    pos.set(ch.simPos, off);
    rch.set(ch.simReach, off);
    off += ch.simPos.length;
  }
  return {
    agg: {
      seed, runs, asOf, clubs,
      topScorer: top(gShare, gTot),
      topAssist: top(aShare, aTot),
      avgGoalsPerSeason: chunks.reduce((s, c) => s + c.goals, 0) / runs,
    },
    sims: { runs, pos, reach: rch },
  };
}

/** Single-threaded convenience (tests, fallback). */
export function aggregate(seed: string, runs: number, asOf: AsOf) {
  const chunks: ChunkRaw[] = [];
  for (let i = 0; i * CHUNK < runs; i++) chunks.push(runChunk(seed, i, Math.min(CHUNK, runs - i * CHUNK), asOf));
  return finalize(seed, asOf, chunks);
}

/** Model order: by expected finishing position. */
export function modelOrder(agg: Aggregate): string[] {
  return [...CODES].sort((a, b) => agg.clubs[a].avgPos - agg.clubs[b].avgPos);
}
