import { useEffect, useMemo, useState } from "react";
import { modelOrder } from "../engine/aggregate";
import { CLUB, CODES, fmtPct, MODEL, PLAYED } from "../engine/model";
import { Badge, Bar, Club, OddsList, SimLink, Trophy } from "../components/ui";
import { useSim } from "../state/sim";

const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default function Dashboard() {
  const { result, run, status, seed, asOf } = useSim();

  // First visit with nothing in the URL: start a run so the board isn't empty.
  useEffect(() => {
    if (!seed && status === "idle") run({ fresh: true });
  }, [seed, status, run]);

  const v = MODEL.validation;
  const agg = result?.agg;
  const f = result?.featured;

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <div className="hero-tags">
            <span className="pill">2026/27</span>
            <span className="pill">36 clubs</span>
            <span className="pill">189 matches</span>
            <span className="pill gold">Final · 5 Jun 2027 · Metropolitano, Madrid</span>
          </div>
          <h1>
            Who lifts the <em>big ears</em>?
          </h1>
          <p className="lede">
            A Dixon-Coles goals model fit on {MODEL.data.matchesFit.toLocaleString("en-GB")} club matches, played out across thousands of seeded
            seasons: the Swiss-model league phase, the knockout play-off, two-legged ties with extra time and penalties, and a neutral final.
          </p>
          <div className="row" style={{ marginTop: 18 }}>
            <button className="btn primary" onClick={() => run({ fresh: true })} disabled={status === "running"}>
              {status === "running" ? <><span className="spinner" /> Simulating…</> : "Run simulation"}
            </button>
            <SimLink to="/bracket" className="btn">Watch the bracket</SimLink>
          </div>
          <p className="small muted" style={{ marginTop: 14 }}>
            {asOf === "live"
              ? `Season to date: ${PLAYED.length} real results locked in (MD1); the rest is simulated.`
              : "Pre-season view: real results ignored, every match simulated from the draw."}
          </p>
        </div>
        <div className="card champ-card" aria-live="polite">
          <Trophy className="trophy" />
          <div className="kicker">Predicted champions · this run</div>
          {f ? (
            <>
              <div className="row" style={{ marginTop: 14, gap: 14, flexWrap: "nowrap" }}>
                <Badge code={f.champion} size={58} />
                <div>
                  <div className="big">{CLUB[f.champion].name}</div>
                  <div className="muted">
                    beat {CLUB[f.final.loser].name} {Math.max(f.final.match.hg, f.final.match.ag)}–{Math.min(f.final.match.hg, f.final.match.ag)}
                    {f.final.match.pens ? ` (pens ${Math.max(...f.final.match.pens)}–${Math.min(...f.final.match.pens)})` : f.final.match.aet ? " a.e.t." : ""} in the final
                  </div>
                </div>
              </div>
              <div className="tiles" style={{ marginTop: 18 }}>
                <div className="tile"><div className="v">{fmtPct(agg!.clubs[f.champion].champ)}</div><div className="l">their title odds over {result.runs.toLocaleString("en-GB")} runs</div></div>
                <div className="tile"><div className="v">{f.table.find((r) => r.code === f.champion)!.pos}</div><div className="l">league phase finish this run</div></div>
              </div>
              <p className="small muted" style={{ marginTop: 12 }}>
                Seed <span className="mono">{result.seed}</span> · {(result.ms / 1000).toFixed(1)}s ·{" "}
                <SimLink to="/results">See every match →</SimLink>
              </p>
            </>
          ) : (
            <p className="muted" style={{ marginTop: 14 }}>{status === "running" ? "Simulating the season…" : "Run a simulation to crown a champion."}</p>
          )}
        </div>
      </section>

      <section className="section grid g2">
        <div className="card">
          <div className="section-head">
            <div>
              <h2>Title odds</h2>
              <p className="muted small">Share of {agg ? agg.runs.toLocaleString("en-GB") : "N"} simulated seasons each club wins</p>
            </div>
          </div>
          {agg ? (
            <OddsList gold rows={[...CODES].sort((a, b) => agg.clubs[b].champ - agg.clubs[a].champ).slice(0, 10).map((c) => ({ code: c, p: agg.clubs[c].champ }))} />
          ) : (
            <Skeleton />
          )}
        </div>
        <div className="stack">
          <div className="card">
            <h2>Can you trust it?</h2>
            <p className="small">Backtested on {v.overall.model.n} Champions League matches (2021/22–2025/26), each predicted with only the data available on 1 September of that season.</p>
            <div className="tiles" style={{ marginTop: 12 }}>
              <div className="tile">
                <div className="v">{(v.rpsImprovementVsElo * 100).toFixed(1)}%</div>
                <div className="l">better RPS than an Elo-only baseline ({v.overall.model.rps.toFixed(4)} vs {v.overall.elo.rps.toFixed(4)})</div>
              </div>
              <div className="tile">
                <div className="v">{(v.ece * 100).toFixed(1)}%</div>
                <div className="l">expected calibration error: when it says 30%, it happens about 30% of the time</div>
              </div>
              <div className="tile">
                <div className="v">{(MODEL.data.matchesFit / 1000).toFixed(1)}k</div>
                <div className="l">real matches fit, {MODEL.data.from.slice(0, 4)}–{fmtDate(MODEL.data.to)}</div>
              </div>
            </div>
            <p className="small" style={{ marginTop: 12 }}><SimLink to="/methodology">How we validate the model →</SimLink></p>
          </div>
          <Funnel />
        </div>
      </section>

      <section className="section card">
        <div className="section-head">
          <div>
            <h2>Most likely to advance</h2>
            <p className="muted small">Per club, across all runs. Sorted by expected league finish.</p>
          </div>
        </div>
        {agg ? <AdvanceTable /> : <Skeleton />}
      </section>

      <section className="section">
        <h2 style={{ marginBottom: 14 }}>Toolkit</h2>
        <div className="grid g4 toolkit">
          <ToolCard to="/predict" icon="✎" title="Predict" text="Order the 36-club table, pick every tie, and get graded against the model." />
          <ToolCard to="/results" icon="▤" title="Match Center" text="All 189 matches of this run, with lineups, timelines and pre-match odds." />
          <ToolCard to="/bracket" icon="⌥" title="Live Bracket" text="Watch the knockouts reveal round by round, from the play-off to Madrid." />
          <ToolCard to="/scorers" icon="★" title="Stats" text="Top scorers, assists and clean sheets, plus Golden Boot odds over all runs." />
        </div>
      </section>
    </>
  );
}

function ToolCard({ to, icon, title, text }: { to: string; icon: string; title: string; text: string }) {
  return (
    <SimLink to={to} className="card">
      <div className="ico" aria-hidden="true">{icon}</div>
      <h3>{title}</h3>
      <p className="small muted" style={{ marginTop: 4, marginBottom: 0 }}>{text}</p>
    </SimLink>
  );
}

function Funnel() {
  const steps = [
    [36, "Clubs"], [24, "Play-off + top 8"], [16, "Round of 16"], [8, "Quarter-finals"], [4, "Semi-finals"], [2, "Final"], [1, "Champion"],
  ] as const;
  return (
    <div className="card">
      <h2>How 36 become one</h2>
      <p className="small">
        Each club plays 8 different opponents, two from each pot, in one 36-team table. The top 8 go straight to the last 16; 9th–24th meet in a two-legged
        play-off; 25th–36th are out. From there the bracket is fixed by seeding, so league position decides the path. League phase {fmtDate("2026-09-08")} – {fmtDate("2027-01-27")}.
      </p>
      <div className="funnel" style={{ marginTop: 14 }} aria-label="Funnel from 36 clubs to 1 champion">
        {steps.map(([n, t]) => (
          <div key={t}>
            <div className="col" style={{ height: 8 + (n / 36) * 90 }} />
            <div className="n">{n}</div>
            <div className="t">{t}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdvanceTable() {
  const { result } = useSim();
  const agg = result!.agg;
  const [all, setAll] = useState(false);
  const order = useMemo(() => modelOrder(agg), [agg]);
  const cols: [keyof typeof agg.clubs.ARS, string][] = [["top8", "Top 8"], ["top24", "Top 24"], ["qf", "Reach QF"], ["sf", "Reach SF"]];
  return (
    <>
      <div className="scroll-x">
        <table>
          <thead>
            <tr>
              <th>Club</th>
              <th className="num">Exp. pts</th>
              <th className="num">Avg pos</th>
              {cols.map(([, l]) => <th key={l} style={{ minWidth: 130 }}>{l}</th>)}
            </tr>
          </thead>
          <tbody>
            {(all ? order : order.slice(0, 12)).map((c) => (
              <tr key={c}>
                <td><Club code={c} /></td>
                <td className="num">{agg.clubs[c].avgPts.toFixed(1)}</td>
                <td className="num">{agg.clubs[c].avgPos.toFixed(1)}</td>
                {cols.map(([k]) => (
                  <td key={k}>
                    <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                      <div style={{ flex: 1, minWidth: 50 }}><Bar value={agg.clubs[c][k] as number} /></div>
                      <span style={{ width: 48, textAlign: "right" }}>{fmtPct(agg.clubs[c][k] as number, 0)}</span>
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="btn small" style={{ marginTop: 12 }} onClick={() => setAll((a) => !a)}>{all ? "Show top 12" : "Show all 36 clubs"}</button>
    </>
  );
}

function Skeleton() {
  return (
    <div className="stack" aria-busy="true">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="bar" style={{ height: 14, opacity: 0.6 }} />
      ))}
    </div>
  );
}
