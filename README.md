# Henkelpott · Champions League Prediction Engine

A seeded Monte Carlo prediction engine for the **UEFA Champions League 2026/27**: the 36-club Swiss-model league phase, the knockout play-off, two-legged ties with extra time and penalties, and the neutral final in Madrid (5 June 2027).

Not affiliated with or endorsed by UEFA or any club. Badges are generated shields, not official crests.

## What's in it

| Route | |
|---|---|
| `/` | Dashboard: title odds, model credibility, the 36→1 funnel, advance odds per club |
| `/predict` | Full-season bracket builder (drag-and-drop 1–36 table or quick buckets → every knockout tie → graded report) and a one-match predictor with two-leg mode |
| `/results` | Match Center: every match of the featured run, league table, position-by-matchday chart, lineups, timelines, pre-match scoreline odds |
| `/bracket` | Live bracket reveal with league-phase lead-in and a PNG poster export |
| `/scorers` | Top scorers, assists and clean sheets, plus top-scorer odds across all runs |
| `/methodology`, `/about` | How it works, backtest results, calibration |

Every view carries `?seed=…&runs=…&asof=…` so a link reproduces the run exactly. *Season to date* (`asof=live`, default) locks in real results; *Pre-season* (`asof=pre`) simulates everything from the draw.

## Layout

```
model/            Python: fetch data, fit, backtest, freeze
  fetch.py        downloads football-data.co.uk + openfootball into model/raw/ (gitignored)
  parse.py        one match table, unified club ids across sources
  clubs.py        the 36 clubs (codes, pots, badge colours)
  fixtures_2627.csv  all 144 league-phase fixtures; fill hg/ag as matchdays are played
  fit.py          Dixon-Coles fit + Elo baseline + backtest -> app/src/data/model.json
app/              React + TypeScript + Vite, static
  src/engine/     model maths, season simulator, fast bulk kernel, bracket, grading, worker
  src/pages/      the routes above
```

## Run it

```sh
cd app
npm install
npm run dev        # http://localhost:5173
npm test           # engine tests (vitest)
npm run build      # static output in app/dist
```

Deploy `app/` to Vercel (or any static host); `vercel.json` rewrites routes to `index.html`.

## Refresh the model after a matchday

1. Add scores to `model/fixtures_2627.csv` (`hg`, `ag` columns).
2. `pip install numpy scipy`, then `python model/fetch.py && python model/fit.py` (about 30 s; also refreshes domestic results).
3. Rebuild and redeploy the app.

## Model in one paragraph

Per-match Poisson goals with the Dixon-Coles low-score correction: `log λ = μ + att − def_opp + H`. Ratings split into a country term plus a club deviation; club deviations are shrunk toward zero and the country terms are identified by European matches (UCL, UEL, UECL and qualifying), which is how leagues are put on one scale. Exponential time decay (half-life about 8 months). Home advantage is fit separately for European football; the final is neutral. On 753 held-out UCL matches (2021/22–2025/26, model frozen each 1 September) the RPS is 0.1995 vs 0.2030 for an Elo baseline (1.7% better), with 2.3% expected calibration error.

## Known limits

- **Squads are placeholders** ("Liverpool No. 9"). Add real UEFA A-lists to `app/src/data/squads.json`; the format is documented in `app/src/engine/squads.ts`.
- Club Elo's API was down at build time, so the baseline is an in-house Elo of the same design.
- The coefficient tie-breaker (last resort) is approximated by pot and draw order.
- No domestic data for some leagues after 2024/25 (Azerbaijan, Slovakia, Ukraine), so those clubs lean on European results.
