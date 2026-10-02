import { CalibrationChart } from "../components/season";
import { Club } from "../components/ui";
import { CLUBS, MODEL } from "../engine/model";

const COMP_LABEL: Record<string, string> = {
  UCL: "Champions League", UCLQ: "UCL qualifying", UEL: "Europa League", UELQ: "UEL qualifying", UECL: "Conference League", UECLQ: "UECL qualifying",
};

export default function Methodology() {
  const p = MODEL.params, v = MODEL.validation, d = MODEL.data;
  const euro = Object.entries(d.byComp).filter(([k]) => !k.startsWith("dom:"));
  const domestic = Object.entries(d.byComp).filter(([k]) => k.startsWith("dom:")).sort((a, b) => b[1] - a[1]);
  const ranked = [...CLUBS].sort((a, b) => b.att + b.def - (a.att + a.def));
  const homeX = Math.exp(p.home);
  return (
    <div className="prose" style={{ maxWidth: "none" }}>
      <div className="kicker">Methodology</div>
      <h1 style={{ fontSize: "clamp(1.8rem, 4.5vw, 2.8rem)", marginTop: 4 }}>How the engine works</h1>
      <p className="muted" style={{ maxWidth: "70ch", marginTop: 10 }}>
        Four steps: results are ingested and fit offline in Python, frozen into a small JSON file, then simulated in your browser. Nothing is fetched when the page loads.
      </p>

      <div className="pipeline" style={{ marginTop: 20 }}>
        {[
          ["01", "Ingest", `${d.matchesFit.toLocaleString("en-GB")} club results: ${domestic.length} domestic leagues plus European competitions, ${d.from.slice(0, 4)}–${d.to}.`],
          ["02", "Fit", "Dixon-Coles goals model with cross-league calibration, exponential time decay and shrinkage priors; Elo alongside as a baseline."],
          ["03", "Validate", `Season-by-season backtests on ${v.overall.model.n} UCL matches, freezing the model on 1 September of each season.`],
          ["04", "Simulate", "Seeded Monte Carlo in Web Workers: league phase, UEFA tie-breakers, play-off, fixed bracket, two legs, ET, penalties."],
        ].map(([n, t, x]) => (
          <div className="card" key={n}>
            <div className="n">{n}</div>
            <h3 style={{ margin: "4px 0 6px" }}>{t}</h3>
            <p className="small muted" style={{ margin: 0 }}>{x}</p>
          </div>
        ))}
      </div>

      <div className="grid g2" style={{ marginTop: 28, alignItems: "start" }}>
        <div>
          <h2>The goals model</h2>
          <p>Every match is a pair of Poisson goal counts with the Dixon-Coles correction for low scores:</p>
          <div className="formula">
            log λ<sub>home</sub> = μ + att<sub>home</sub> − def<sub>away</sub> + H
            <br />
            log λ<sub>away</sub> = μ + att<sub>away</sub> − def<sub>home</sub>
            <br />
            P(x, y) = τ<sub>ρ</sub>(x, y) · Pois(x; λ<sub>home</sub>) · Pois(y; λ<sub>away</sub>)
          </div>
          <p style={{ marginTop: 12 }}>
            τ adjusts the 0–0, 1–0, 0–1 and 1–1 cells; fitted ρ = <strong>{p.rho.toFixed(3)}</strong>. Parameters are fit by maximum likelihood (L-BFGS with analytic
            gradients) with each match weighted by e<sup>−ξ·age</sup>; ξ = {p.xi} per day, a half-life of about {Math.round(Math.log(2) / p.xi / 30)} months.
          </p>
          <h3>Home advantage is a real parameter</h3>
          <p>
            Fit separately for domestic and European football: H = {p.homeDomestic.toFixed(3)} at home in league play, <strong>{p.home.toFixed(3)}</strong> in European
            competition. A home side in Europe scores about {((homeX - 1) * 100).toFixed(0)}% more than it would on neutral ground. The final in Madrid is neutral (H = 0); every
            other knockout leg carries it.
          </p>
          <h3>Cross-league calibration</h3>
          <p>
            Domestic results only say how strong a club is relative to its own league. So each club's ratings are split into a country term plus a club deviation:
            att<sub>i</sub> = A<sub>country</sub> + α<sub>i</sub>. The club deviations are shrunk toward zero with an L2 prior (σ = {p.sigma}); the country terms are only weakly
            shrunk, which leaves the European matches, where leagues actually meet, to pin them down. That includes Europa League, Conference League and qualifying
            rounds, which carry most of the information about smaller leagues (Azerbaijan, Slovakia, Norway, Austria).
          </p>
          <h3>Tuning</h3>
          <p>
            ξ, σ and a European-match weight were chosen by log-loss on {v.tuning.seasons.join(" and ")} (chosen: ξ = {v.tuning.chosen.xi}, σ = {v.tuning.chosen.sigma},
            European weight {v.tuning.chosen.euroWeight}), then left alone for the held-out test seasons below.
          </p>
        </div>
        <div className="card">
          <h3>Fitted strength · 2026/27 clubs</h3>
          <p className="small muted">Attack and defence on the log-goals scale (higher is better for both). Fit through {d.to}.</p>
          <div className="scroll-x">
            <table>
              <thead><tr><th>Club</th><th className="num">Att</th><th className="num">Def</th><th className="num">Elo</th><th className="num">Matches</th></tr></thead>
              <tbody>
                {ranked.map((c) => (
                  <tr key={c.code}>
                    <td><Club code={c.code} short /></td>
                    <td className="num">{c.att.toFixed(2)}</td>
                    <td className="num">{c.def.toFixed(2)}</td>
                    <td className="num">{c.elo}</td>
                    <td className="num">{c.matches}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <h2>Simulating the season</h2>
      <ol>
        <li><strong>League phase.</strong> All 144 drawn fixtures are played (in <em>Season to date</em> mode, only the ones not yet played; real scores are locked in). The table uses UEFA's order: points, goal difference, goals scored, away goals scored, wins, away wins, opponents' points, opponents' goal difference, opponents' goals scored, then club coefficient (approximated by pot and draw order).</li>
        <li><strong>Knockout play-off.</strong> 9/10 v 23/24, 11/12 v 21/22, 13/14 v 19/20, 15/16 v 17/18. Which of each pair meets which is drawn by the seed; the seeded club hosts the second leg.</li>
        <li><strong>Fixed bracket.</strong> 1/2 meet the 15/16 v 17/18 winners, 3/4 the 13/14 v 19/20 winners, 5/6 the 11/12 v 21/22 winners, 7/8 the 9/10 v 23/24 winners. Each seeded pair is split across the two halves, so 1st and 2nd can only meet in the final.</li>
        <li><strong>Two-legged ties.</strong> Aggregate score, no away-goals rule. Level after 180 minutes means 30 minutes of extra time at the second-leg venue (each side's rate scaled to a third of a match), then penalties: alternating kicks scored at 76%, best of five, then sudden death. The better-placed league finisher hosts the second leg in every round.</li>
        <li><strong>Final.</strong> One match at a neutral venue, with extra time and penalties if needed.</li>
        <li><strong>Players.</strong> Goals are shared among the players on the pitch by role-based weights (striker highest), with 10% penalties and about 74% assisted. Squads are placeholders until real A-lists are loaded.</li>
      </ol>
      <p>
        Every run is seeded: the seed in the URL reproduces the featured season and the full set of runs exactly. Runs are split into fixed chunks of 1,000 with their own
        sub-seeds, so the answer doesn't depend on how many CPU cores your browser uses.
      </p>

      <h2>Validation</h2>
      <div className="grid g2" style={{ alignItems: "start" }}>
        <div>
          <p>
            For each season from 2021/22 to 2025/26, both models were frozen on 1 September using only earlier data, then asked for win/draw/loss probabilities for
            every Champions League match that season (group/league phase and knockouts, 90-minute result).
          </p>
          <div className="scroll-x">
            <table>
              <thead><tr><th>Season</th><th className="num">Matches</th><th className="num">RPS · model</th><th className="num">RPS · Elo</th><th className="num">Log-loss · model</th><th className="num">Log-loss · Elo</th></tr></thead>
              <tbody>
                {v.seasons.map((s) => (
                  <tr key={s.season}>
                    <td>{s.season}</td>
                    <td className="num">{s.model.n}</td>
                    <td className="num" style={{ fontWeight: s.model.rps < s.elo.rps ? 800 : 400 }}>{s.model.rps.toFixed(4)}</td>
                    <td className="num" style={{ fontWeight: s.elo.rps < s.model.rps ? 800 : 400 }}>{s.elo.rps.toFixed(4)}</td>
                    <td className="num">{s.model.logloss.toFixed(4)}</td>
                    <td className="num">{s.elo.logloss.toFixed(4)}</td>
                  </tr>
                ))}
                <tr>
                  <td><strong>All</strong></td>
                  <td className="num">{v.overall.model.n}</td>
                  <td className="num"><strong>{v.overall.model.rps.toFixed(4)}</strong></td>
                  <td className="num">{v.overall.elo.rps.toFixed(4)}</td>
                  <td className="num"><strong>{v.overall.model.logloss.toFixed(4)}</strong></td>
                  <td className="num">{v.overall.elo.logloss.toFixed(4)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p style={{ marginTop: 12 }}>
            Overall the model's ranked probability score is <strong>{(v.rpsImprovementVsElo * 100).toFixed(1)}% lower</strong> (better) than Elo's; a uniform ⅓-⅓-⅓ guess scores{" "}
            {v.overall.uniform.rps.toFixed(4)}. Brier: {v.overall.model.brier.toFixed(4)} vs {v.overall.elo.brier.toFixed(4)}. Elo was the better model in{" "}
            {v.seasons.filter((s) => s.elo.rps < s.model.rps).map((s) => s.season).join(" and ") || "no season"}. The margin is real but modest, and it's widest in the two
            36-club seasons (2024/25, 2025/26), where the Swiss format pairs clubs from very different leagues.
          </p>
          <p className="small muted">
            Only 2024/25 and 2025/26 used the 36-club format, so season-level checks of the format itself (table, play-off) rest on two seasons; the match-level backtest goes further back.
          </p>
        </div>
        <div className="card">
          <h3>Calibration</h3>
          <p className="small muted">
            Every predicted outcome probability, binned, against how often it happened. Blue: this model (ECE {(v.ece * 100).toFixed(1)}%). Grey: Elo baseline (ECE {(v.eceElo * 100).toFixed(1)}%).
          </p>
          <CalibrationChart model={v.calibration} elo={v.calibrationElo} />
        </div>
      </div>

      <h2>The Elo baseline</h2>
      <p>
        Club Elo's public API was unavailable when this build was fit, so the baseline is an in-house Elo of the same design: K = 20 (×1.5 in Europe), a goal-difference
        multiplier, a 60-point home edge, and clubs entering mid-history at their country's average. Elo differences become win/draw/loss probabilities through an ordered
        logit fit on the same training window.
      </p>

      <h2>Data sources</h2>
      <ul>
        <li><strong>football-data.co.uk</strong>: domestic top flights ({domestic.map(([k, n]) => `${k.slice(4)} ${n.toLocaleString("en-GB")}`).join(", ")} matches).</li>
        <li><strong>openfootball</strong> (public domain): {euro.map(([k, n]) => `${COMP_LABEL[k] ?? k} ${n.toLocaleString("en-GB")}`).join(", ")}, plus Azerbaijani, Czech, Slovak and Ukrainian league files.</li>
        <li><strong>uefa.com</strong>: the 2026/27 league-phase fixture list and MD1 results, entered by hand.</li>
        <li>Squads: placeholders. Real UEFA A-lists can be dropped into <code>src/data/squads.json</code>.</li>
      </ul>
      <p className="small muted">Rebuild: <code>python model/fetch.py && python model/fit.py</code> refreshes <code>app/src/data/model.json</code>; then redeploy.</p>
    </div>
  );
}
