import { useState } from "react";
import { ArrowDown, ArrowLeftRight, ArrowRight, ChevronDown, Plane, Star } from "lucide-react";
import { CLUB_CITY, Plate, venueOf } from "./travel";
import { CLUB, fmtPct, matchOdds, type MatchOdds } from "../engine/model";
import type { LineupEntry, MatchDetail, MatchResult } from "../engine/season";
import { FORMATION, player } from "../engine/squads";
import { Club } from "./ui";

const shortName = (pid: string) => player(pid).name;

export function ScoreHeat({ odds, ring, size = 6, showMostLikely = true }: { odds: MatchOdds; ring?: [number, number]; size?: number; showMostLikely?: boolean }) {
  const max = Math.max(...odds.grid.slice(0, size).flatMap((r) => r.slice(0, size)));
  const ml = odds.top[0];
  return (
    <div>
      <div className="heat" style={{ gridTemplateColumns: `22px repeat(${size}, minmax(0, 1fr))` }} role="table" aria-label="Scoreline probabilities">
        <span className="ax" />
        {Array.from({ length: size }, (_, j) => (
          <span className="ax" key={`c${j}`}>{j}</span>
        ))}
        {Array.from({ length: size }, (_, i) => (
          <Row key={i} i={i} size={size} odds={odds} max={max} ring={ring} ml={showMostLikely ? ml : undefined} />
        ))}
      </div>
      <div className="row between small muted" style={{ marginTop: 6 }}>
        <span className="row" style={{ gap: 4 }}><ArrowDown size={13} aria-hidden="true" /> {CLUB[odds.home].short} goals</span>
        <span className="row" style={{ gap: 4 }}>{CLUB[odds.away].short} goals <ArrowRight size={13} aria-hidden="true" /></span>
      </div>
    </div>
  );
}
function Row({ i, size, odds, max, ring, ml }: { i: number; size: number; odds: MatchOdds; max: number; ring?: [number, number]; ml?: { h: number; a: number } }) {
  return (
    <>
      <span className="ax">{i}</span>
      {Array.from({ length: size }, (_, j) => {
        const p = odds.grid[i][j];
        const a = Math.pow(p / max, 0.7);
        return (
          <span
            key={j}
            className={`cell${ring && ring[0] === i && ring[1] === j ? " ring" : ""}${ml && ml.h === i && ml.a === j ? " ml" : ""}`}
            style={{ background: `rgba(var(--heat), ${0.08 + a * 0.85})`, color: a > 0.55 ? "#fff" : "var(--text)" }}
            title={`${i}–${j}: ${fmtPct(p)}`}
          >
            {(p * 100).toFixed(p >= 0.1 ? 0 : 1)}
          </span>
        );
      })}
    </>
  );
}

function Pitch({ lineup, code, potm }: { lineup: LineupEntry[]; code: string; potm: string }) {
  const [p, s] = CLUB[code].colors;
  const starters = lineup.filter((l) => l.start);
  return (
    <div className="pitch" aria-label={`${CLUB[code].name} lineup`}>
      <svg className="lines" viewBox="0 0 68 100" preserveAspectRatio="none" aria-hidden="true">
        <g fill="none" stroke="var(--pitch-line)" strokeWidth="0.4">
          <rect x="2" y="2" width="64" height="96" />
          <line x1="2" y1="2" x2="66" y2="2" />
          <path d="M20 98 V82 H48 V98 M27 98 V92 H41 V98" />
          <path d="M26 2 A8 8 0 0 0 42 2" />
          <circle cx="34" cy="86" r="0.6" fill="var(--pitch-line)" />
        </g>
      </svg>
      {starters.map((l) => {
        const sub = lineup.find((x) => !x.start && x.on !== undefined && x.x === l.x && x.y === l.y && x.on === l.off);
        const pl = player(l.pid);
        return (
          <div className="pl" key={l.pid} style={{ left: `${l.x}%`, top: `${l.y}%` }}>
            <span className="dot" style={{ background: pl.pos === "GK" ? s : p, color: pl.pos === "GK" ? p : s }}>
              {pl.num}
              {l.captain && <span className="tag">C</span>}
              {(l.pid === potm || sub?.pid === potm) && <span className="star" title="Player of the match"><Star size={13} fill="currentColor" strokeWidth={0} /></span>}
            </span>
            <span className="nm">{pl.name.replace(`${CLUB[code].short} `, "")}{l.goals ? ` ${"●".repeat(Math.min(3, l.goals))}` : ""}</span>
            <span className={`rt${l.rating >= 8 ? " hi" : l.rating < 6 ? " lo" : ""}`}>{l.rating.toFixed(1)}</span>
            {sub && <span className="nm" style={{ opacity: 0.85 }}>on {sub.on}′ No.{player(sub.pid).num} ({sub.rating.toFixed(1)})</span>}
          </div>
        );
      })}
    </div>
  );
}

function Timeline({ m, d }: { m: MatchResult; d: MatchDetail }) {
  type Ev = { min: number; side: "h" | "a"; node: React.ReactNode; k: string };
  const evs: Ev[] = [
    ...d.goals.map((g, i) => ({
      min: g.min, side: g.side, k: `g${i}`,
      node: (
        <span>
          <Ball /><strong>{shortName(g.scorer)}</strong>
          {g.pen && <span className="muted"> (pen)</span>}
          {g.assist && <span className="ev-sub"> · assist {shortName(g.assist)}</span>}
        </span>
      ),
    })),
    ...d.subs.map((s, i) => ({
      min: s.min, side: s.side, k: `s${i}`,
      node: <span className="ev-sub"><ArrowLeftRight size={12} className="ico" aria-label="Substitution" /> {shortName(s.on)} for {shortName(s.off)}</span>,
    })),
  ].sort((a, b) => a.min - b.min);
  return (
    <ul className="timeline" aria-label="Match timeline">
      {evs.map((e) => (
        <li key={e.k}>
          <span className="l">{e.side === "h" ? e.node : null}</span>
          <span className="min">{e.min > 90 && !m.aet ? `90+${e.min - 90}` : e.min}′</span>
          <span>{e.side === "a" ? e.node : null}</span>
        </li>
      ))}
      {!evs.length && <li><span /><span className="min">–</span><span className="muted">No goals</span></li>}
      {m.pens && (
        <li>
          <span className="l"><strong>{m.pens[0]}</strong></span>
          <span className="min">pens</span>
          <span><strong>{m.pens[1]}</strong></span>
        </li>
      )}
    </ul>
  );
}

/** A small authored football glyph for goal events. */
function Ball() {
  return (
    <svg className="ico" width="13" height="13" viewBox="0 0 16 16" aria-label="Goal" role="img">
      <circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 5.2 10.6 7 9.6 10H6.4L5.4 7Z" fill="currentColor" />
      <path d="M8 5.2V1.6M10.6 7l3.3-1.2M9.6 10l2 2.8M6.4 10l-2 2.8M5.4 7 2.1 5.8" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}

export function scoreText(m: MatchResult) {
  return `${m.hg}–${m.ag}`;
}

export function MatchRow({ m, label, defaultOpen }: { m: MatchResult; label?: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const odds = matchOdds(m.home, m.away, m.venue);
  const ml = odds.top[0];
  const actualP = m.ft[0] <= 10 && m.ft[1] <= 10 ? odds.grid[m.ft[0]][m.ft[1]] : 0;
  return (
    <div className={`match${open ? " open" : ""}`}>
      <div className="match-head">
        <div className="mt-main">
          <div className="ticket-head">
            <span>{label ?? (m.date ? new Date(m.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) : "")}</span>
            <span>{m.venue === "neutral" ? "Madrid · neutral" : venueOf(m.home)}</span>
          </div>
          <div className="mt-clubs">
            <span className="mt-side"><span className="iata">{m.home}</span><Club code={m.home} short size={18} /></span>
            <span className="flight" aria-hidden="true"><Plane size={14} strokeWidth={2} /></span>
            <span className="mt-side r"><span className="iata">{m.away}</span><Club code={m.away} short size={18} /></span>
          </div>
        </div>
        <div className="mt-stub">
          <span className="carbon big">{scoreText(m)}</span>
          {(m.aet || m.pens) && <span className="field-l">{m.pens ? `pens ${m.pens[0]}–${m.pens[1]}` : "a.e.t."}</span>}
          {m.real ? <span className="punch">Played</span> : <span className="pill sim">Simulated</span>}
          <button className="expander" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            <span className="vh">Lineups & timeline for {CLUB[m.home].name} v {CLUB[m.away].name}</span><span aria-hidden="true">Details</span> <ChevronDown size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
      {open && (
        <div className="match-body">
          <Plate city={m.venue === "neutral" ? "madrid" : CLUB_CITY[m.home]} className="mt-plate" />
          <div className="stack">
            <div>
              <div className="kicker">Pre-match odds</div>
              <p className="small" style={{ marginTop: 4 }}>
                {CLUB[m.home].short} {fmtPct(odds.wdl.home, 0)} · Draw {fmtPct(odds.wdl.draw, 0)} · {CLUB[m.away].short} {fmtPct(odds.wdl.away, 0)} · xG {odds.lh.toFixed(2)}–{odds.la.toFixed(2)}
              </p>
              <ScoreHeat odds={odds} ring={m.ft} />
              <p className="small muted" style={{ marginTop: 8 }}>
                Most likely {ml.h}–{ml.a} ({fmtPct(ml.p, 0)}). {m.real ? "Real result" : "This run"} finished {m.ft[0]}–{m.ft[1]}
                {m.aet ? " after 90′" : ""} ({fmtPct(actualP)}).
              </p>
            </div>
            {m.detail && (
              <div>
                <div className="kicker" style={{ marginBottom: 6 }}>Timeline</div>
                <Timeline m={m} d={m.detail} />
              </div>
            )}
          </div>
          {m.detail ? (
            <div>
              <div className="row between" style={{ marginBottom: 6 }}>
                <span className="kicker">Lineups · {FORMATION} v {FORMATION}</span>
                <span className="small muted row" style={{ gap: 4 }}><Star size={13} fill="currentColor" strokeWidth={0} aria-label="Player of the match" /> {shortName(m.detail.potm)}</span>
              </div>
              <div className="pitches">
                <Pitch lineup={m.detail.home} code={m.home} potm={m.detail.potm} />
                <Pitch lineup={m.detail.away.map((l) => ({ ...l, x: 100 - l.x }))} code={m.away} potm={m.detail.potm} />
              </div>
              <p className="small faint" style={{ marginTop: 6 }}>Placeholder squads (shirt numbers by role) until real A-lists are loaded.</p>
            </div>
          ) : (
            <div className="card flat" style={{ alignSelf: "start" }}>
              <h3>Real result</h3>
              <p className="small">This match has been played. Henkelpott locks the real score in and simulates only what's left; it has no lineup or event data for real matches.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
