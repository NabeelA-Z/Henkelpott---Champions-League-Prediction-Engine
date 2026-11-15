import { useState } from "react";
import { Stamp } from "../components/travel";
import { Badge, Bar, Club, Empty, PageHead, Seg, Tabs } from "../components/ui";
import { CLUB } from "../engine/model";
import { fmtPct } from "../engine/model";
import { player, usingPlaceholders } from "../engine/squads";
import { useSim } from "../state/sim";

type Kind = "g" | "a" | "cs";
type Phase = "all" | "league" | "ko";
const LABEL: Record<Kind, string> = { g: "Top scorers", a: "Assists", cs: "Clean sheets" };
const UNIT: Record<Kind, string> = { g: "goals", a: "assists", cs: "clean sheets" };

export default function Stats() {
  const { result } = useSim();
  const [kind, setKind] = useState<Kind>("g");
  const [phase, setPhase] = useState<Phase>("all");
  const [view, setView] = useState<"run" | "odds">("run");
  if (!result) return <Empty title="Run a simulation to see the stats">Top scorers, assists and clean sheets for one seeded season, plus Golden Boot odds across every run.</Empty>;
  const s = result.featured;

  const value = (t: (typeof s.tally)[string]) => {
    const all = t[kind], lg = kind === "g" ? t.gL : kind === "a" ? t.aL : t.csL;
    return phase === "all" ? all : phase === "league" ? lg : all - lg;
  };
  const rows = Object.entries(s.tally)
    .map(([pid, t]) => ({ pid, n: value(t) }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n || player(a.pid).name.localeCompare(player(b.pid).name))
    .slice(0, 30);

  const odds = kind === "cs" ? null : kind === "g" ? result.agg.topScorer : result.agg.topAssist;

  return (
    <div className="stack">
      <PageHead
        title="Golden Boot and the rest"
        meta={<>Tournament stats · seed <span className="mono">{result.seed}</span> · {CLUB[s.champion].name} lift the trophy in this run.</>}
      />
      <div className="card">
        <Tabs label="Statistic" value={kind} onChange={setKind} items={(["g", "a", "cs"] as Kind[]).map((k) => ({ id: k, label: LABEL[k] }))} />
        <div className="row between" style={{ marginBottom: 16 }}>
          <Seg label="View" value={view} onChange={setView} items={[{ id: "run", label: "This run" }, { id: "odds", label: `Odds over ${result.runs.toLocaleString("en-GB")} runs` }]} />
          {view === "run" && (
            <Seg label="Phase" value={phase} onChange={setPhase} items={[{ id: "all", label: "All" }, { id: "league", label: "League phase" }, { id: "ko", label: "Knockouts" }]} />
          )}
        </div>

        {view === "run" ? (
          rows.length ? (
            <>
              <div className={`boot-stamps pressing`} key={`${kind}-${phase}-${result.seed}`}>
                {[0, 1, 2].map((i) =>
                  rows[i] ? (
                    <Stamp
                      key={rows[i].pid}
                      i={i}
                      tilt={[-3, 2, -1.5][i]}
                      big={i === 0}
                      tone="ink"
                      label={<>{["1st", "2nd", "3rd"][i]} · {player(rows[i].pid).name}<span className="who"><Badge code={player(rows[i].pid).club} size={16} /> {CLUB[player(rows[i].pid).club].short}</span></>}
                      value={`${rows[i].n} ${UNIT[kind]}`}
                    />
                  ) : null,
                )}
              </div>
              <table>
                <thead>
                  <tr><th className="num">#</th><th>Player</th><th>Club</th><th className="num">{UNIT[kind]}</th></tr>
                </thead>
                <tbody>
                  {rows.slice(3).map((r, i) => (
                    <tr key={r.pid}>
                      <td className="num">{i + 4}</td>
                      <td>{player(r.pid).name}</td>
                      <td><Club code={player(r.pid).club} short /></td>
                      <td className="num"><strong>{r.n}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <p className="muted">Nothing to show for this phase.</p>
          )
        ) : odds ? (
          <table>
            <thead>
              <tr><th className="num">#</th><th>Player</th><th>Club</th><th style={{ minWidth: 160 }}>Chance to finish top</th><th className="num">Avg {UNIT[kind]}</th></tr>
            </thead>
            <tbody>
              {odds.slice(0, 20).map((o, i) => (
                <tr key={o.pid}>
                  <td className="num">{i + 1}</td>
                  <td>{player(o.pid).name}</td>
                  <td><Club code={player(o.pid).club} short /></td>
                  <td>
                    <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                      <div style={{ flex: 1 }}><Bar value={o.share} max={odds[0].share} /></div>
                      <span style={{ width: 52, textAlign: "right" }}>{fmtPct(o.share)}</span>
                    </div>
                  </td>
                  <td className="num">{o.avg.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">Odds view covers scorers and assists.</p>
        )}
        <p className="small faint" style={{ marginTop: 12 }}>
          {usingPlaceholders()
            ? "Players are positional placeholders (club + shirt number by role) until real UEFA A-lists are loaded into src/data/squads.json. "
            : ""}
          Shared top spots split the credit in the odds view. Real (already played) matches have no scorer data and aren't counted.
        </p>
      </div>
    </div>
  );
}
