// Squads for the scorer/assister and lineup model.
//
// Real 2026/27 UEFA A-lists are not bundled (licensing unconfirmed), so every club gets a
// positional placeholder squad: shirt numbers and roles, labelled e.g. "Liverpool No. 9".
// To use real players, add entries to src/data/squads.json in the shape
//   { "LIV": [{ "num": 9, "name": "A. Player", "slot": "ST" }, ...] }
// Listed players replace the placeholder at the same slot (first 11 by slot order start).
import overrides from "../data/squads.json";
import { CLUB } from "./model";

export type Slot = "GK" | "RB" | "CB" | "LB" | "CM" | "AM" | "RW" | "ST" | "LW";
export type Pos = "GK" | "DF" | "MF" | "FW";

export type Player = {
  id: string; // CLUB-num
  club: string;
  num: number;
  name: string;
  slot: Slot;
  pos: Pos;
  goalW: number;
  assistW: number;
  starter: boolean;
  placeholder: boolean;
};

const POS_OF: Record<Slot, Pos> = { GK: "GK", RB: "DF", CB: "DF", LB: "DF", CM: "MF", AM: "MF", RW: "FW", ST: "FW", LW: "FW" };
const GOAL_W: Record<Slot, number> = { GK: 0, RB: 0.02, CB: 0.03, LB: 0.02, CM: 0.055, AM: 0.11, RW: 0.13, ST: 0.25, LW: 0.13 };
const ASSIST_W: Record<Slot, number> = { GK: 0.005, RB: 0.07, CB: 0.02, LB: 0.07, CM: 0.08, AM: 0.18, RW: 0.15, ST: 0.1, LW: 0.15 };

// 4-3-3: order is the starting XI.
export const XI: { num: number; slot: Slot; x: number; y: number }[] = [
  { num: 1, slot: "GK", x: 50, y: 92 },
  { num: 2, slot: "RB", x: 84, y: 72 },
  { num: 4, slot: "CB", x: 62, y: 77 },
  { num: 5, slot: "CB", x: 38, y: 77 },
  { num: 3, slot: "LB", x: 16, y: 72 },
  { num: 6, slot: "CM", x: 66, y: 52 },
  { num: 8, slot: "CM", x: 34, y: 52 },
  { num: 10, slot: "AM", x: 50, y: 40 },
  { num: 7, slot: "RW", x: 82, y: 22 },
  { num: 9, slot: "ST", x: 50, y: 14 },
  { num: 11, slot: "LW", x: 18, y: 22 },
];
const BENCH: { num: number; slot: Slot }[] = [
  { num: 13, slot: "GK" }, { num: 15, slot: "CB" }, { num: 22, slot: "RB" }, { num: 23, slot: "LB" },
  { num: 14, slot: "CM" }, { num: 16, slot: "CM" }, { num: 18, slot: "AM" },
  { num: 17, slot: "RW" }, { num: 19, slot: "ST" }, { num: 20, slot: "LW" }, { num: 21, slot: "ST" }, { num: 25, slot: "GK" },
];
export const FORMATION = "4-3-3";

const SLOT_LABEL: Record<Slot, string> = { GK: "Goalkeeper", RB: "Right-back", CB: "Centre-back", LB: "Left-back", CM: "Midfielder", AM: "Playmaker", RW: "Right wing", ST: "Striker", LW: "Left wing" };
export const slotLabel = (s: Slot) => SLOT_LABEL[s];

/** Deterministic 0..1 per (club, num) so each placeholder has a stable "quality". */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

type Override = { num: number; name: string; slot: Slot };
const OVR = overrides as unknown as Record<string, Override[]>;

function build(code: string): Player[] {
  const club = CLUB[code];
  const out: Player[] = [];
  const given = [...(OVR[code] ?? [])];
  const take = (slot: Slot): Override | undefined => {
    const i = given.findIndex((g) => g.slot === slot);
    return i >= 0 ? given.splice(i, 1)[0] : undefined;
  };
  const add = (num: number, slot: Slot, starter: boolean) => {
    const o = take(slot);
    const q = 0.7 + hash01(`${code}-${num}`) * 0.65; // 0.70 .. 1.35
    const benchFactor = starter ? 1 : 0.8;
    out.push({
      id: `${code}-${o?.num ?? num}`,
      club: code,
      num: o?.num ?? num,
      name: o?.name ?? `${club.short} No. ${num}`,
      slot,
      pos: POS_OF[slot],
      goalW: GOAL_W[slot] * q * benchFactor,
      assistW: ASSIST_W[slot] * (0.8 + hash01(`${code}-a${num}`) * 0.4) * benchFactor,
      starter,
      placeholder: !o,
    });
  };
  XI.forEach((s) => add(s.num, s.slot, true));
  BENCH.forEach((s) => add(s.num, s.slot, false));
  return out;
}

const cache = new Map<string, Player[]>();
export function squad(code: string): Player[] {
  let s = cache.get(code);
  if (!s) {
    s = build(code);
    cache.set(code, s);
  }
  return s;
}

const byId = new Map<string, Player>();
export function player(id: string): Player {
  let p = byId.get(id);
  if (!p) {
    const club = id.split("-")[0];
    for (const x of squad(club)) byId.set(x.id, x);
    p = byId.get(id)!;
  }
  return p;
}

export const usingPlaceholders = (): boolean => Object.keys(OVR).length === 0;
