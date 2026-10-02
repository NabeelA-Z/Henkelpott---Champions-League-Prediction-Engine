import { useState } from "react";
import { Bar, Club, Empty, Seg, Tabs } from "../components/ui";
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
      <div>
        <div className="kicker">Tournament stats · seed <span className="mono">{result.seed}</span></div>
        <h1 style={{ fontSize: "clamp(1.6rem, 4vw, 2.4rem)", marginTop: 4 }}>
          <Club code={s.champion} size={34} /> lift the trophy
        </h1>
      </div>
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
              <div className="podium" style={{ marginBottom: 18 }}>
                {[1, 0, 2].map((i) =>
                  rows[i] ? (
                    <div key={i} className={`step${i === 0 ? " first" : ""}`}>
                      <div className="place">{i + 1}</div>
                      <div style={{ fontWeight: 800, marginTop: 4 }}>{player(rows[i].pid).name}</div>
                      <div style={{ display: "flex", justifyContent: "center", margin: "6px 0" }}><Club code={player(rows[i].pid).club} short /></div>
                      <div className="count">{rows[i].n}</div>
                      <div className="small muted">{UNIT[kind]}</div>
                    </div>
                  ) : (
                    <div key={i} />
                  ),
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
