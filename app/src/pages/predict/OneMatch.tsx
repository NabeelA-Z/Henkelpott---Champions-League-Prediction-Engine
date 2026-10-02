import { useMemo, useState } from "react";
import { MatchRow, ScoreHeat } from "../../components/match";
import { Bar, Club, Seg } from "../../components/ui";
import { CLUB, CODES, fmtPct, markets, matchOdds, oneIn, singleKnockoutOdds, tieOdds, type Venue } from "../../engine/model";
import { makeRng, randomSeed } from "../../engine/rng";
import { playOne, playSingle, playTie, type MatchResult, type Tie } from "../../engine/season";

const MARQUEE: [string, string][] = [["RMA", "BAY"], ["LIV", "PSG"], ["BAR", "INT"], ["ARS", "MCI"], ["PSG", "BAR"], ["ARS", "RMA"]];
const SORTED = [...CODES].sort((a, b) => CLUB[a].name.localeCompare(CLUB[b].name));

function Stepper({ value, set, label }: { value: number; set: (n: number) => void; label: string }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button aria-label={`${label} minus one`} onClick={() => set(Math.max(0, value - 1))}>−</button>
      <output aria-live="polite">{value}</output>
      <button aria-label={`${label} plus one`} onClick={() => set(Math.min(9, value + 1))}>+</button>
    </div>
  );
}

function ClubPick({ value, onChange, id, label }: { value: string; onChange: (c: string) => void; id: string; label: string }) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      <label htmlFor={id} className="kicker">{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {SORTED.map((c) => <option key={c} value={c}>{CLUB[c].name}</option>)}
      </select>
    </div>
  );
}

export default function OneMatch() {
  const [a, setA] = useState("RMA");
  const [b, setB] = useState("BAY");
  const [venue, setVenue] = useState<"a" | "b" | "n">("a");
  const [twoLeg, setTwoLeg] = useState(false);
  const [call, setCall] = useState<[number, number]>([1, 1]); // home-away of the (first) match
  const [call2, setCall2] = useState<[number, number]>([1, 1]); // leg 2: b home
  const [played, setPlayed] = useState<{ single?: MatchResult; tie?: Tie; finalWin?: string } | null>(null);

  const home = twoLeg ? a : venue === "b" ? b : a;
  const away = twoLeg ? b : venue === "b" ? a : b;
  const v: Venue = !twoLeg && venue === "n" ? "neutral" : "home";
  const odds = useMemo(() => matchOdds(home, away, v), [home, away, v]);
  const odds2 = useMemo(() => matchOdds(b, a, "home"), [a, b]);
  const mk = markets(odds.grid);
  const pCall = odds.grid[call[0]]?.[call[1]] ?? 0;
  const allCells = odds.grid.flatMap((r, i) => r.map((p, j) => ({ i, j, p }))).sort((x, y) => y.p - x.p);
  const rank = allCells.findIndex((c) => c.i === call[0] && c.j === call[1]) + 1;
  const backs = call[0] > call[1] ? home : call[0] < call[1] ? away : null;

  const tie = useMemo(() => tieOdds(a, b), [a, b]);
  const final = useMemo(() => singleKnockoutOdds(home, away, "neutral"), [home, away]);
  const pPath = pCall * (odds2.grid[call2[0]]?.[call2[1]] ?? 0);
  const aggA = call[0] + call2[1], aggB = call[1] + call2[0];

  const settle = () => {
    const rng = makeRng(randomSeed());
    if (twoLeg) setPlayed({ tie: playTie(a, b, "r16", "T", rng, { detail: true, tally: {} }) });
    else if (v === "neutral") {
      const r = playSingle(home, away, "neutral", "final", "F", rng, { detail: true, tally: {} });
      setPlayed({ single: r.match, finalWin: r.winner });
    } else setPlayed({ single: playOne(home, away, v, rng) });
  };

  const swap = () => {
    setA(b);
    setB(a);
    setPlayed(null);
  };

  return (
    <div className="stack">
      <div className="card">
        <div className="kicker">One match</div>
        <h1 style={{ fontSize: "clamp(1.6rem, 4vw, 2.4rem)", margin: "4px 0 12px" }}>Club vs club</h1>
        <div className="row" style={{ marginBottom: 14 }}>
          <span className="small muted">Marquee ties:</span>
          {MARQUEE.map(([x, y]) => (
            <button key={x + y} className="btn small" onClick={() => { setA(x); setB(y); setPlayed(null); }}>
              {CLUB[x].short} v {CLUB[y].short}
            </button>
          ))}
        </div>
        <div className="row" style={{ alignItems: "end", gap: 16 }}>
          <ClubPick id="clubA" label={twoLeg ? "Club A (hosts leg 1)" : "Club A"} value={a} onChange={(c) => { if (c !== b) setA(c); else swap(); setPlayed(null); }} />
          <button className="btn icon" onClick={swap} aria-label="Swap clubs" title="Swap">⇄</button>
          <ClubPick id="clubB" label={twoLeg ? "Club B (hosts leg 2)" : "Club B"} value={b} onChange={(c) => { if (c !== a) setB(c); else swap(); setPlayed(null); }} />
          {!twoLeg && (
            <div className="stack" style={{ gap: 6 }}>
              <span className="kicker">Venue</span>
              <Seg label="Venue" value={venue} onChange={(x) => { setVenue(x); setPlayed(null); }} items={[
                { id: "a", label: `At ${CLUB[a].short}` }, { id: "b", label: `At ${CLUB[b].short}` }, { id: "n", label: "Neutral (final)" },
              ]} />
            </div>
          )}
          <label className="row small" style={{ gap: 6 }}>
            <input type="checkbox" checked={twoLeg} onChange={(e) => { setTwoLeg(e.target.checked); setPlayed(null); }} /> Two-leg mode
          </label>
        </div>
      </div>

      <div className="grid g2">
        <div className="card">
          <h3>{twoLeg ? "Call both legs" : "Call the score"}</h3>
          <div className="stack" style={{ marginTop: 12 }}>
            <div className="row" style={{ justifyContent: "center", gap: 12, flexWrap: "nowrap" }}>
              <Club code={home} short />
              <Stepper label={`${CLUB[home].short} goals`} value={call[0]} set={(n) => setCall([n, call[1]])} />
              <span className="muted">–</span>
              <Stepper label={`${CLUB[away].short} goals`} value={call[1]} set={(n) => setCall([call[0], n])} />
              <Club code={away} short />
            </div>
            {twoLeg && (
              <div className="row" style={{ justifyContent: "center", gap: 12, flexWrap: "nowrap" }}>
                <Club code={b} short />
                <Stepper label={`Leg 2 ${CLUB[b].short} goals`} value={call2[0]} set={(n) => setCall2([n, call2[1]])} />
                <span className="muted">–</span>
                <Stepper label={`Leg 2 ${CLUB[a].short} goals`} value={call2[1]} set={(n) => setCall2([call2[0], n])} />
                <Club code={a} short />
              </div>
            )}
          </div>
          <div className="card flat" style={{ marginTop: 16, background: "var(--panel-2)" }}>
            <div className="kicker">Your call</div>
            {twoLeg ? (
              <>
                <p style={{ margin: "6px 0" }}>
                  <strong style={{ fontSize: "1.6rem" }}>{fmtPct(pPath, 2)}</strong> for that exact path, about 1 in {oneIn(pPath)}.
                </p>
                <p className="small muted">
                  Aggregate {CLUB[a].short} {aggA}–{aggB} {CLUB[b].short}
                  {aggA === aggB ? ": level, so extra time at " + CLUB[b].short + "'s ground, then penalties." : `: ${CLUB[aggA > aggB ? a : b].name} go through.`}
                </p>
              </>
            ) : (
              <>
                <p style={{ margin: "6px 0" }}>
                  <strong style={{ fontSize: "1.6rem" }}>{fmtPct(pCall)}</strong> · about 1 in {oneIn(pCall)} · decimal odds {(1 / Math.max(pCall, 1e-9)).toFixed(2)}
                </p>
                <p className="small muted">
                  #{rank} of {allCells.length} scorelines. {backs ? `Backs ${CLUB[backs].name}` : "Backs a draw"}
                  {v === "neutral" && call[0] === call[1] ? " (then extra time and penalties)" : ""}.
                </p>
              </>
            )}
          </div>
        </div>

        <div className="card">
          {twoLeg ? (
            <>
              <h3>Who progresses?</h3>
              <p className="small muted">Two legs, no away goals. Leg 1 at {CLUB[a].short}, leg 2 at {CLUB[b].short}; level on aggregate means 30 minutes there, then penalties.</p>
              {[[a, tie.a], [b, tie.b]].map(([c, o]) => {
                const t = o as typeof tie.a;
                return (
                  <div key={c as string} style={{ marginTop: 14 }}>
                    <div className="row between"><Club code={c as string} bold /><strong>{fmtPct(t.total)}</strong></div>
                    <div style={{ marginTop: 6 }}><Bar value={t.total} /></div>
                    <p className="small muted" style={{ marginTop: 4 }}>in 90 + 90: {fmtPct(t.normal)} · extra time: {fmtPct(t.et)} · penalties: {fmtPct(t.pens)}</p>
                  </div>
                );
              })}
            </>
          ) : (
            <>
              <h3>Match odds</h3>
              <div className="stack" style={{ marginTop: 10, gap: 10 }}>
                {[[home, odds.wdl.home], ["Draw", odds.wdl.draw], [away, odds.wdl.away]].map(([k, p]) => (
                  <div key={k as string} className="row" style={{ gap: 10, flexWrap: "nowrap" }}>
                    <span style={{ width: 150 }}>{k === "Draw" ? "Draw" : <Club code={k as string} short />}</span>
                    <div style={{ flex: 1 }}><Bar value={p as number} /></div>
                    <strong style={{ width: 54, textAlign: "right" }}>{fmtPct(p as number)}</strong>
                  </div>
                ))}
              </div>
              <p className="small muted" style={{ marginTop: 10 }}>
                Expected goals {CLUB[home].short} {odds.lh.toFixed(2)} – {odds.la.toFixed(2)} {CLUB[away].short}. Most likely result {odds.top[0].h}–{odds.top[0].a} ({fmtPct(odds.top[0].p)}).
                {v === "neutral" && ` As a final: ${CLUB[home].short} lift it ${fmtPct(final.a.total)} (${fmtPct(final.a.et + final.a.pens)} via extra time or penalties).`}
              </p>
              <h3 style={{ marginTop: 14 }}>Top 6 scorelines</h3>
              <ol className="small" style={{ margin: "6px 0 0", paddingLeft: 20, columns: 2 }}>
                {odds.top.slice(0, 6).map((t) => (
                  <li key={`${t.h}${t.a}`}>{t.h}–{t.a} <span className="muted">{fmtPct(t.p)}</span></li>
                ))}
              </ol>
            </>
          )}
        </div>
      </div>

      <div className="grid g2">
        <div className="card">
          <h3>Scoreline map{twoLeg ? " · leg 1" : ""}</h3>
          <p className="small muted">Chance of each exact score (%), 0–5 goals. Your call is ringed; dashed is the most likely.</p>
          <div style={{ maxWidth: 420, marginTop: 10 }}><ScoreHeat odds={odds} ring={call} /></div>
          {twoLeg && (
            <>
              <h3 style={{ marginTop: 16 }}>Leg 2</h3>
              <div style={{ maxWidth: 420, marginTop: 10 }}><ScoreHeat odds={odds2} ring={call2} /></div>
            </>
          )}
        </div>
        <div className="card">
          <h3>Markets{twoLeg ? " · leg 1" : ""}</h3>
          <table style={{ marginTop: 8 }}>
            <tbody>
              {[
                ["Both teams score", mk.btts], ["Over 1.5 goals", mk.o15], ["Over 2.5 goals", mk.o25], ["Over 3.5 goals", mk.o35],
                [`${CLUB[home].short} clean sheet`, mk.csHome], [`${CLUB[away].short} clean sheet`, mk.csAway],
              ].map(([k, p]) => (
                <tr key={k as string}>
                  <td>{k}</td>
                  <td style={{ width: "45%" }}><Bar value={p as number} /></td>
                  <td className="num"><strong>{fmtPct(p as number)}</strong></td>
                  <td className="num muted">{(1 / (p as number)).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 20 }}>
            <h3>Settle it · play the match out</h3>
            <p className="small muted">Rolls the {twoLeg ? "tie through both legs, with extra time and penalties if level on aggregate" : v === "neutral" ? "final, with extra time and penalties if needed" : "match"} using the same simulator as every season.</p>
            <button className="btn primary" onClick={settle}>{played ? "Roll again" : "Play it"}</button>
          </div>
        </div>
      </div>

      {played && (
        <div className="card" aria-live="polite">
          {played.tie ? (
            <>
              <div className="row between" style={{ marginBottom: 10 }}>
                <h3>{CLUB[played.tie.winner].name} go through, {Math.max(played.tie.aggA, played.tie.aggB)}–{Math.min(played.tie.aggA, played.tie.aggB)} on aggregate{played.tie.pens ? ` (pens ${Math.max(...played.tie.pens)}–${Math.min(...played.tie.pens)})` : played.tie.aet ? " after extra time" : ""}</h3>
              </div>
              <MatchRow m={played.tie.legs[0]} label="1st leg" defaultOpen />
              <MatchRow m={played.tie.legs[1]} label="2nd leg" defaultOpen />
            </>
          ) : (
            played.single && (
              <>
                <h3 style={{ marginBottom: 10 }}>
                  {played.finalWin ? `${CLUB[played.finalWin].name} win the final` : played.single.hg === played.single.ag ? "Honours even" : `${CLUB[played.single.hg > played.single.ag ? played.single.home : played.single.away].name} win`}
                </h3>
                <MatchRow m={played.single} label={v === "neutral" ? "Neutral" : "Played"} defaultOpen />
              </>
            )
          )}
        </div>
      )}
    </div>
  );
}
