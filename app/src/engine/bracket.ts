// Knockout structure from a final league-phase order (UEFA 2024/25+ format).
//
// Play-off: 9/10 v 23/24, 11/12 v 21/22, 13/14 v 19/20, 15/16 v 17/18 (which of the pair meets
// which is drawn). Round of 16: 1/2 meet the 15/16 v 17/18 winners, 3/4 the 13/14 v 19/20
// winners, 5/6 the 11/12 v 21/22 winners, 7/8 the 9/10 v 23/24 winners. Each seeded pair is
// split across the two halves by the draw, so 1 and 2 can only meet in the final. In each half
// the 1/2 path meets the 7/8 path in the QF, and the 3/4 path meets the 5/6 path.
import type { Rng } from "./rng";

export type POTie = { id: string; seeded: string; unseeded: string; seededPos: number; unseededPos: number };
export type R16Slot = { id: string; top: string; topPos: number; po: number; half: 0 | 1 };
export type Bracket = { playoffs: POTie[]; r16: R16Slot[] };

const PO_GROUPS: [number, number, number, number][] = [
  [9, 10, 23, 24],
  [11, 12, 21, 22],
  [13, 14, 19, 20],
  [15, 16, 17, 18],
];
// R16: seeded pair -> play-off group index
const R16_GROUPS: [number, number, number][] = [
  [1, 2, 3], // 1/2 v winners of 15/16 v 17/18
  [7, 8, 0], // 7/8 v 9/10 v 23/24
  [3, 4, 2], // 3/4 v 13/14 v 19/20
  [5, 6, 1], // 5/6 v 11/12 v 21/22
];

/** order[0] is 1st place. Draw choices come from rng (deterministic for a given seed). */
export function buildBracket(order: string[], rng: Rng): Bracket {
  const at = (pos: number) => order[pos - 1];
  const playoffs: POTie[] = [];
  for (const [s1, s2, u1, u2] of PO_GROUPS) {
    const swap = rng.next() < 0.5;
    const pairs: [number, number][] = swap ? [[s1, u2], [s2, u1]] : [[s1, u1], [s2, u2]];
    for (const [s, u] of pairs) playoffs.push({ id: `PO${s}`, seeded: at(s), unseeded: at(u), seededPos: s, unseededPos: u });
  }
  // playoffs[2g], playoffs[2g+1] belong to PO group g
  const r16ByHalf: [R16Slot[], R16Slot[]] = [[], []];
  for (const [t1, t2, g] of R16_GROUPS) {
    const poA = 2 * g, poB = 2 * g + 1;
    const flipOpp = rng.next() < 0.5;
    const flipHalf = rng.next() < 0.5;
    const s1: R16Slot = { id: `R16-${t1}`, top: at(t1), topPos: t1, po: flipOpp ? poB : poA, half: flipHalf ? 1 : 0 };
    const s2: R16Slot = { id: `R16-${t2}`, top: at(t2), topPos: t2, po: flipOpp ? poA : poB, half: flipHalf ? 0 : 1 };
    r16ByHalf[s1.half].push(s1);
    r16ByHalf[s2.half].push(s2);
  }
  // Each half is ordered [1/2 path, 7/8 path, 3/4 path, 5/6 path] => QF = (0,1), (2,3).
  return { playoffs, r16: [...r16ByHalf[0], ...r16ByHalf[1]] };
}

export type Bucket = "top8" | "playoff" | "out";
export const bucketOf = (pos: number): Bucket => (pos <= 8 ? "top8" : pos <= 24 ? "playoff" : "out");
export const BUCKET_LABEL: Record<Bucket, string> = { top8: "Top 8", playoff: "Play-off", out: "Out" };
