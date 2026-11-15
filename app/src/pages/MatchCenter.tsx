import { useMemo, useState } from "react";
import { MatchRow } from "../components/match";
import { LeagueTable, PositionChart } from "../components/season";
import { Plate, Stamp } from "../components/travel";
import { Club, Empty, PageHead, Seg, Stat, Tabs } from "../components/ui";
import { CLUB, CODES } from "../engine/model";
import { STAGE_LABEL, type MatchResult, type Season, type Tie } from "../engine/season";
import { player } from "../engine/squads";
import { useSim } from "../state/sim";

export default function MatchCenter() {
  const { result, run, status } = useSim();
  const [tab, setTab] = useState<"league" | "ko">("league");
  if (!result) return <Empty title="Run a simulation to watch the whole season play out">Every league-phase match, every two-legged tie, the final, and a lineup and timeline for each simulated match.</Empty>;
  const s = result.featured;
  return (
    <div className="stack">
      <Summary s={s} onNew={() => run({ fresh: true })} busy={status === "running"} />
      <div className="card">
        <Tabs label="Phase" value={tab} onChange={setTab} items={[{ id: "league", label: "League phase" }, { id: "ko", label: "Knockouts" }]} />
        {tab === "league" ? <LeagueTab s={s} /> : <KnockoutTab s={s} />}
      </div>
    </div>
  );
}

function allMatches(s: Season): MatchResult[] {
  return [...s.league, ...[...s.po, ...s.r16, ...s.qf, ...s.sf].flatMap((t) => t.legs), s.final.match];
}

function Summary({ s, onNew, busy }: { s: Season; onNew: () => void; busy: boolean }) {
  const ms = allMatches(s);
  const goals = ms.reduce((a, m) => a + m.hg + m.ag, 0);
  const et = ms.filter((m) => m.aet).length;
  const pens = ms.filter((m) => m.pens).length;
  let hat = 0;
  for (const m of ms) {
    if (!m.detail) continue;
    const c: Record<string, number> = {};
    for (const g of m.detail.goals) c[g.scorer] = (c[g.scorer] ?? 0) + 1;
    hat += Object.values(c).filter((x) => x >= 3).length;
  }
  const top = (k: "g" | "a") =>
    Object.entries(s.tally)
      .filter(([, t]) => t[k] > 0)
      .sort((a, b) => b[1][k] - a[1][k])
      .slice(0, 5);
  const f = s.final.match;
  const { result } = useSim();
  return (
    <div className="stack" style={{ gap: 22 }}>
      <PageHead
        title={<>{CLUB[s.champion].name} lift the trophy</>}
        meta={<>Match Center · one seeded season, seed <span className="mono">{result?.seed}</span>. Every match below is a ticket from this run.</>}
        actions={<button className="btn" onClick={onNew} disabled={busy}>New run</button>}
      />
      <div className="mc-final">
        <Plate city="madrid" />
        <div className="guilloche mc-final-card">
          <span className="field-l">The final · Madrid</span>
          <div className="row" style={{ gap: 14, flexWrap: "nowrap", marginTop: 8 }}>
            <Club code={f.home} short size={28} />
            <strong className="score" style={{ fontSize: "2.4rem" }}>{f.hg}–{f.ag}</strong>
            <Club code={f.away} short size={28} />
          </div>
          <p className="small muted" style={{ marginTop: 8 }}>
            {f.pens ? `${CLUB[s.champion].short} win ${Math.max(...f.pens)}–${Math.min(...f.pens)} on penalties. ` : f.aet ? "After extra time. " : ""}
            {f.detail?.goals.map((g) => `${player(g.scorer).name} ${g.min}′`).join(", ") || "No goals."}
          </p>
          <div style={{ marginTop: 14 }}><Stamp label="Champions" value={CLUB[s.champion].short} tilt={-3} big /></div>
        </div>
      </div>
      <div className="tiles">
        <Stat v={goals} l="total goals" />
        <Stat v={(goals / ms.length).toFixed(2)} l="goals per match" />
        <Stat v={et} l="ties to extra time" />
        <Stat v={pens} l="shootouts" />
        <Stat v={hat} l="hat-tricks" />
      </div>
      <div className="grid g2">
        <div>
          <h3 style={{ marginBottom: 8 }}>Top scorers</h3>
          <ol className="small" style={{ margin: 0, paddingLeft: 18 }}>
            {top("g").map(([pid, t]) => (
              <li key={pid}>{player(pid).name} <span className="muted">· {t.g}</span></li>
            ))}
          </ol>
        </div>
        <div>
          <h3 style={{ marginBottom: 8 }}>Top assists</h3>
          <ol className="small" style={{ margin: 0, paddingLeft: 18 }}>
            {top("a").map(([pid, t]) => (
              <li key={pid}>{player(pid).name} <span className="muted">· {t.a}</span></li>
            ))}
          </ol>
        </div>
      </div>
      {s.league.some((m) => m.real) && (
        <p className="small faint" style={{ marginTop: 12 }}>Scorer tallies cover simulated matches only; real results carry no event data.</p>
      )}
    </div>
  );
}

function LeagueTab({ s }: { s: Season }) {
  const [md, setMd] = useState<number | "all">(1);
  const [club, setClub] = useState<string>("");
  const matches = useMemo(() => {
    if (club) return s.league.filter((m) => m.home === club || m.away === club);
    return s.league.filter((m) => md === "all" || m.md === md);
  }, [s, md, club]);
  const chartClub = club || s.champion;
  return (
    <div className="grid g2" style={{ alignItems: "start" }}>
      <div>
        <h2 style={{ marginBottom: 12 }}>Final league phase table</h2>
        <LeagueTable rows={s.table} highlight={club || undefined} onPick={(c) => setClub(c)} />
      </div>
      <div className="stack">
        <div>
          <div className="row between" style={{ marginBottom: 8 }}>
            <h3>{CLUB[chartClub].name}: position by matchday</h3>
          </div>
          {s.posByMd && <PositionChart series={s.posByMd[chartClub]} code={chartClub} />}
        </div>
        <div className="row">
          <Seg
            label="Matchday"
            value={club ? 0 : md}
            onChange={(v) => {
              setClub("");
              setMd(v as number | "all");
            }}
            items={[...Array.from({ length: 8 }, (_, i) => ({ id: i + 1, label: `MD${i + 1}` }))]}
          />
          <label className="vh" htmlFor="clubf">Club filter</label>
          <select id="clubf" value={club} onChange={(e) => setClub(e.target.value)}>
            <option value="">All clubs</option>
            {[...CODES].sort((a, b) => CLUB[a].name.localeCompare(CLUB[b].name)).map((c) => (
              <option key={c} value={c}>{CLUB[c].name}</option>
            ))}
          </select>
        </div>
        <div>
          {matches.map((m) => (
            <MatchRow key={m.id} m={m} label={club ? `MD${m.md}` : undefined} />
          ))}
        </div>
      </div>
    </div>
  );
}

function KnockoutTab({ s }: { s: Season }) {
  const [round, setRound] = useState<"po" | "r16" | "qf" | "sf" | "final">("po");
  const ties: Tie[] = round === "final" ? [] : s[round];
  return (
    <div>
      <Seg
        label="Round"
        value={round}
        onChange={setRound}
        items={[
          { id: "po", label: "Play-off" },
          { id: "r16", label: "R16" },
          { id: "qf", label: "QF" },
          { id: "sf", label: "SF" },
          { id: "final", label: "Final" },
        ]}
      />
      <h2 style={{ margin: "22px 0 12px" }}>{STAGE_LABEL[round]}</h2>
      {round === "final" ? (
        <MatchRow m={s.final.match} label="Madrid" defaultOpen />
      ) : (
        <div className="stack">
          {ties.map((t) => (
            <div key={t.id} className="card flat" style={{ padding: 14 }}>
              <div className="row between" style={{ marginBottom: 10 }}>
                <div className="row" style={{ gap: 8 }}>
                  <Club code={t.a} /> <span className="muted">v</span> <Club code={t.b} />
                </div>
                <div className="row" style={{ gap: 12 }}>
                  <strong>Agg {t.aggA}–{t.aggB}</strong>
                  {t.pens ? <span className="pill">pens {t.pens[0]}–{t.pens[1]}</span> : t.aet ? <span className="pill">a.e.t.</span> : null}
                  <Stamp label="Through" value={CLUB[t.winner].code} tilt={-3} />
                </div>
              </div>
              <MatchRow m={t.legs[0]} label="1st leg" />
              <MatchRow m={t.legs[1]} label="2nd leg" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
