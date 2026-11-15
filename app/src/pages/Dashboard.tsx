import { useEffect, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { modelOrder } from "../engine/aggregate";
import { CLUB, CODES, FIXTURES, fmtPct, MODEL, PLAYED } from "../engine/model";
import type { Season } from "../engine/season";
import { CalibrationChart } from "../components/season";
import { FixtureTicket, Plate, Stamp, useFollow } from "../components/travel";
import { Badge, Bar, OddsList, SimLink } from "../components/ui";
import { useSim } from "../state/sim";

const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const SORTED = [...CODES].sort((a, b) => CLUB[a].name.localeCompare(CLUB[b].name));
const TILTS = [-3, 2, -1.5, 3, -2, 1.5, -4, 2.5];

/** How far a club got in one simulated season. */
function reachedIn(s: Season, code: string): string {
  if (s.champion === code) return "won the final in Madrid";
  if (s.final.loser === code) return "lost the final in Madrid";
  if (s.sf.some((t) => t.loser === code)) return "went out in the semi-finals";
  if (s.qf.some((t) => t.loser === code)) return "went out in the quarter-finals";
  if (s.r16.some((t) => t.loser === code)) return "went out in the round of 16";
  if (s.po.some((t) => t.loser === code)) return "went out in the knockout play-off";
  return "went out in the league phase";
}
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;

export default function Dashboard() {
  const { result, run, status, seed, asOf } = useSim();
  const [followed, setFollowed] = useFollow();

  // First visit with nothing in the URL: start a run so the passport isn't blank.
  useEffect(() => {
    if (!seed && status === "idle") run({ fresh: true });
  }, [seed, status, run]);

  const agg = result?.agg;
  const fav = agg ? [...CODES].sort((a, b) => agg.clubs[b].champ - agg.clubs[a].champ)[0] : null;
  const club = followed ?? fav;

  return (
    <>
      <h1 className="vh">Henkelpott: who reaches Madrid in the 2026/27 Champions League</h1>
      <section className="spread" aria-label="The passport">
        <div className="leaf guilloche">
          <div className="row" style={{ gap: "6px 28px", alignItems: "start" }}>
            <div><span className="field-l">Destination</span><span className="field-v">Final · Madrid</span></div>
            <div><span className="field-l">Date</span><span className="field-v">5 June 2027</span></div>
            <div><span className="field-l">Venue</span><span className="field-v">Metropolitano, neutral</span></div>
          </div>
          <Plate city="madrid" eager />
          {fav && agg ? (
            <>
              <div className="fav-name h1like row" style={{ gap: 14, flexWrap: "nowrap" }}>
                <Badge code={fav} size={46} />
                <span style={{ minWidth: 0 }}>{CLUB[fav].name}</span>
              </div>
              <div className="foil-figure" aria-label={`${fmtPct(agg.clubs[fav].champ)} chance to lift the trophy`}>
                {(agg.clubs[fav].champ * 100).toFixed(1)}<small>%</small>
              </div>
              <p className="muted" style={{ margin: "10px 0 0" }}>
                <strong style={{ color: "var(--ink)" }}>Favourite to arrive in Madrid.</strong> {agg.runs.toLocaleString("en-GB")} simulated seasons; {CLUB[fav].short} lift the trophy in {fmtPct(agg.clubs[fav].champ)} of them.
              </p>
              <p className="small muted" style={{ margin: "4px 0 0" }}>
                Backtested on {MODEL.validation.overall.model.n} held-out UCL matches: {(MODEL.validation.rpsImprovementVsElo * 100).toFixed(1)}% better than Elo, {(MODEL.validation.ece * 100).toFixed(1)}% calibration error. <a href="#trust">Can you trust it?</a>
              </p>
            </>
          ) : (
            <div className="fav-name h1like faint">{status === "running" ? "Simulating…" : "Run a simulation"}</div>
          )}
          <div className="leaf-foot">
            <div><span className="field-l">Seed</span><span className="field-v mono">{result?.seed ?? "…"}</span></div>
            <div><span className="field-l">Seasons</span><span className="field-v">{(result?.runs ?? 0).toLocaleString("en-GB")}</span></div>
            <div>
              <span className="field-l">Results as of</span>
              <span className="field-v">{asOf === "live" ? `Season to date · ${PLAYED.length} real results` : "Pre-season · all simulated"}</span>
            </div>
          </div>
        </div>

        <div className="leaf guilloche" aria-live="polite">
          <div className="row between" style={{ alignItems: "end" }}>
            <h2>{club ? `${CLUB[club].short}'s entries` : "Entries"}</h2>
            <div className="follow">
              <label htmlFor="follow" className="field-l">Follow a club</label>
              <select id="follow" value={followed ?? ""} onChange={(e) => setFollowed(e.target.value || null)}>
                <option value="">The favourite</option>
                {SORTED.map((c) => <option key={c} value={c}>{CLUB[c].name}</option>)}
              </select>
            </div>
          </div>
          <Entries club={club} key={`${result?.seed}-${club}`} />
          {result && club && (
            <p className="this-run">
              <span className="field-l" style={{ marginBottom: 4 }}>This run · seed {result.seed}</span>
              <strong>{CLUB[result.featured.champion].name}</strong> beat {CLUB[result.featured.final.loser].name}{" "}
              {Math.max(result.featured.final.match.hg, result.featured.final.match.ag)}–{Math.min(result.featured.final.match.hg, result.featured.final.match.ag)}
              {result.featured.final.match.pens ? " on penalties" : result.featured.final.match.aet ? " after extra time" : ""} in Madrid.{" "}
              {club !== result.featured.champion && (
                <>
                  {CLUB[club].short} finished {ordinal(result.featured.table.find((r) => r.code === club)!.pos)} and {reachedIn(result.featured, club)}.{" "}
                </>
              )}
              <SimLink to="/results">See every match</SimLink>
            </p>
          )}
        </div>
      </section>

      <NextTickets />

      <section className="section grid g2" style={{ alignItems: "start" }}>
        <div>
          <div className="section-head">
            <div>
              <h2>Title odds</h2>
              <p>Share of {agg ? agg.runs.toLocaleString("en-GB") : "the"} simulated seasons each club wins.</p>
            </div>
          </div>
          {agg ? (
            <OddsList
              rows={[...CODES].sort((a, b) => agg.clubs[b].champ - agg.clubs[a].champ).slice(0, 10).map((c) => ({ code: c, p: agg.clubs[c].champ }))}
              tag={(c) => (c === followed ? <span className="pill route">Following</span> : null)}
            />
          ) : (
            <Skeleton />
          )}
        </div>
        <Trust />
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <h2>The route: 36 to one</h2>
            <p>
              Eight different opponents each, two from every pot, in one 36-club table. The top 8 go straight to the last 16; 9th–24th meet in a two-legged play-off;
              25th–36th are out. From there the bracket is fixed by seeding, so league position decides the path. League phase {fmtDate("2026-09-08")} – {fmtDate("2027-01-27")}.
            </p>
          </div>
        </div>
        <RouteLine club={club} />
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <h2>Most likely to advance</h2>
            <p>Per club, across all runs, sorted by expected league finish.</p>
          </div>
        </div>
        {agg ? <AdvanceTable followed={followed} /> : <Skeleton />}
      </section>

      <section className="section">
        <div className="section-head"><h2>Where next</h2></div>
        <nav className="departures" aria-label="Tools">
          <Departure to="/predict" gate="Predict" text="Order the 36-club table, pick every tie, and get graded against the model." />
          <Departure to="/results" gate="Match Center" text="All 189 matches of this run, with lineups, timelines and pre-match odds." />
          <Departure to="/bracket" gate="Live Bracket" text="Watch the knockouts reveal round by round, from the play-off to Madrid." />
          <Departure to="/scorers" gate="Stats" text="Top scorers, assists and clean sheets, plus Golden Boot odds over all runs." />
        </nav>
      </section>
    </>
  );
}

function Entries({ club }: { club: string | null }) {
  const { result } = useSim();
  const o = club && result ? result.agg.clubs[club] : null;
  const p = (x: number | undefined) => (x === undefined ? "–" : fmtPct(x, x < 0.1 ? 1 : 0));
  const rows: [string, number | undefined, "ink" | "route" | "void"][] = [
    ["League phase · top 8", o?.top8, "ink"],
    ["Into the knockouts", o?.top24, "ink"],
    ["Round of 16", o?.r16, "ink"],
    ["Quarter-final", o?.qf, "ink"],
    ["Semi-final", o?.sf, "ink"],
    ["Final · Madrid", o?.final, "ink"],
    ["Out in the league phase", o ? 1 - o.top24 : undefined, "void"],
    ["Champions", o?.champ, "route"],
  ];
  return (
    <div className={`stamps${o ? " pressing" : ""}`}>
      {rows.map(([l, v, tone], i) => (
        <Stamp key={l} label={l} value={p(v)} tone={o ? (tone === "ink" && (v ?? 0) < 0.02 ? "ghost" : tone) : "ghost"} tilt={TILTS[i]} i={i} big={tone === "route"} />
      ))}
    </div>
  );
}

function NextTickets() {
  const next = useMemo(() => {
    const open = FIXTURES.filter((f) => f.hg === undefined);
    if (!open.length) return null;
    const md = Math.min(...open.map((f) => f.md));
    return { md, list: open.filter((f) => f.md === md) };
  }, []);
  const [all, setAll] = useState(false);
  if (!next) return null;
  return (
    <section className="section">
      <div className="section-head">
        <div>
          <h2>Departures · matchday {next.md}</h2>
          <p>Every fixture is a ticket: away city to home city, with the model's home / draw / away odds on the stub.</p>
        </div>
        <button className="btn small" onClick={() => setAll((a) => !a)}>{all ? "Show fewer" : `All ${next.list.length} fixtures`}</button>
      </div>
      <div className="tickets">
        {(all ? next.list : next.list.slice(0, 6)).map((f) => (
          <FixtureTicket key={`${f.home}${f.away}`} home={f.home} away={f.away} md={f.md} date={f.date} />
        ))}
      </div>
    </section>
  );
}

function RouteLine({ club }: { club: string | null }) {
  const { result } = useSim();
  const o = club && result ? result.agg.clubs[club] : null;
  const p = o ? [1, o.top24, o.r16, o.qf, o.sf, o.final, o.champ] : null;
  const reach = p ? p.reduce((last, x, i) => (x >= 0.5 ? i : last), 0) : 0;
  const stops = [[36, "League phase"], [24, "Play-off + top 8"], [16, "Round of 16"], [8, "Quarter-finals"], [4, "Semi-finals"], [2, "Final"], [1, "Champion"]] as const;
  return (
    <div className="route-line" style={{ ["--reach" as string]: reach / 6 }} aria-label={`From 36 clubs to 1 champion${club ? `, with ${CLUB[club].name}'s chance of reaching each stage` : ""}`}>
      {p && <span className="route-follow" aria-hidden="true" />}
      {stops.map(([n, t], i) => (
        <div key={t}>
          <span className={`dot${p && i <= reach ? " on" : ""}`}>{n}</span>
          <span className="t">{t}</span>
          {p && <span className="rp">{i === 0 ? CLUB[club!].code : fmtPct(p[i], p[i] < 0.1 ? 1 : 0)}</span>}
        </div>
      ))}
    </div>
  );
}

function Trust() {
  const v = MODEL.validation;
  const max = Math.max(...v.seasons.flatMap((s) => [s.model.rps, s.elo.rps]));
  const min = Math.min(...v.seasons.flatMap((s) => [s.model.rps, s.elo.rps])) * 0.96;
  return (
    <div id="trust" style={{ scrollMarginTop: 140 }}>
      <div className="section-head">
        <div>
          <h2>Can you trust it?</h2>
          <p>
            Backtested on {v.overall.model.n} Champions League matches (2021/22–2025/26), each predicted with only the data available on 1 September of that season.
          </p>
        </div>
      </div>
      <div className="proof">
        <div>
          <div className="figure">{(v.rpsImprovementVsElo * 100).toFixed(1)}%</div>
          <p className="small muted" style={{ marginTop: 6 }}>
            better ranked probability score than an Elo-only baseline ({v.overall.model.rps.toFixed(4)} vs {v.overall.elo.rps.toFixed(4)}; lower is better).
          </p>
        </div>
        <div className="rps-bars" aria-label="RPS per season, model against Elo">
          {v.seasons.map((s) => (
            <div key={s.season}>
              <span className="faint">{s.season}</span>
              <span className="pair">
                <span style={{ width: `${((s.model.rps - min) / (max - min)) * 100}%` }} title={`Model ${s.model.rps.toFixed(4)}`} />
                <span style={{ width: `${((s.elo.rps - min) / (max - min)) * 100}%` }} title={`Elo ${s.elo.rps.toFixed(4)}`} />
              </span>
              <span className="faint" style={{ textAlign: "right" }}>{s.model.rps.toFixed(3)}</span>
            </div>
          ))}
          <p className="small faint" style={{ margin: "4px 0 0" }}>Dark: this model. Light: Elo. Shorter is better.</p>
        </div>
        <div>
          <div className="figure">{(v.ece * 100).toFixed(1)}%</div>
          <p className="small muted" style={{ marginTop: 6 }}>expected calibration error: when it says 30%, it happens about 30% of the time.</p>
          <p className="small" style={{ marginTop: 10 }}><SimLink to="/methodology">How the model is validated</SimLink></p>
        </div>
        <CalibrationChart model={v.calibration} elo={v.calibrationElo} />
      </div>
    </div>
  );
}

function AdvanceTable({ followed }: { followed: string | null }) {
  const { result } = useSim();
  const agg = result!.agg;
  const [all, setAll] = useState(false);
  const order = useMemo(() => modelOrder(agg), [agg]);
  const cols: [keyof typeof agg.clubs.ARS, string][] = [["top8", "Top 8"], ["top24", "Top 24"], ["qf", "Reach QF"], ["sf", "Reach SF"]];
  const shown = all ? order : order.slice(0, 12);
  if (!all && followed && !shown.includes(followed)) shown.push(followed);
  return (
    <>
      <div className="scroll-x">
        <table>
          <thead>
            <tr>
              <th>Club</th>
              <th className="num">Exp. pts</th>
              <th className="num">Avg pos</th>
              {cols.map(([, l]) => <th key={l} style={{ minWidth: 140 }}>{l}</th>)}
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c} className={c === followed ? "hl" : undefined}>
                <td><span className="club"><Badge code={c} /><span className="nm">{CLUB[c].name}</span></span></td>
                <td className="num">{agg.clubs[c].avgPts.toFixed(1)}</td>
                <td className="num">{agg.clubs[c].avgPos.toFixed(1)}</td>
                {cols.map(([k]) => (
                  <td key={k}>
                    <div className="row" style={{ gap: 10, flexWrap: "nowrap" }}>
                      <div style={{ flex: 1, minWidth: 50 }}><Bar value={agg.clubs[c][k] as number} gold={c === followed} /></div>
                      <span style={{ width: 44, textAlign: "right" }}>{fmtPct(agg.clubs[c][k] as number, 0)}</span>
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="btn small" style={{ marginTop: 14 }} onClick={() => setAll((a) => !a)}>{all ? "Show top 12" : "Show all 36 clubs"}</button>
    </>
  );
}

function Departure({ to, gate, text }: { to: string; gate: string; text: string }) {
  return (
    <SimLink to={to}>
      <span className="gate">{gate}</span>
      <span className="what">{text}</span>
      <span className="go">Go <ArrowRight size={15} strokeWidth={2.25} aria-hidden="true" /></span>
    </SimLink>
  );
}

function Skeleton() {
  return (
    <div className="stack" aria-busy="true" style={{ gap: 14 }}>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="bar" style={{ height: 12, opacity: 0.7 }} />
      ))}
    </div>
  );
}
