"""Fit the Henkelpott goals model, backtest it against an Elo baseline, and freeze app data.

Goals model (per match, 90 minutes):
    log λ_home = μ + μ_E·[euro] + att_h − def_a + H·[not neutral]
    log λ_away = μ + μ_E·[euro] + att_a − def_h
with H = H_dom or H_euro, Dixon-Coles low-score correction ρ, exponential time decay ξ.

Cross-league calibration: att_i = A_country + α_i, def_i = D_country + δ_i. Club deviations
(α, δ) are shrunk toward 0 with an L2 prior; country terms are only weakly shrunk, so they are
identified by European fixtures, which link otherwise-separate domestic leagues.

Run: python model/fit.py           -> writes app/src/data/model.json
"""
from __future__ import annotations

import csv
import json
import math
import sys
import time
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import numpy as np
from scipy.optimize import minimize, minimize_scalar
from scipy.stats import poisson

sys.path.insert(0, str(Path(__file__).parent))
import parse  # noqa: E402
from clubs import CLUBS  # noqa: E402

OUT = Path(__file__).parent.parent / "app" / "src" / "data" / "model.json"
TODAY = date(2026, 10, 2)


# --------------------------------------------------------------------------- data arrays
@dataclass
class Data:
    teams: list[str]
    tidx: dict[str, int]
    countries: list[str]
    team_cty: np.ndarray
    h: np.ndarray
    a: np.ndarray
    hg: np.ndarray
    ag: np.ndarray
    euro: np.ndarray
    neutral: np.ndarray
    days: np.ndarray  # ordinal date
    comp: list[str]
    stage: list[str]
    dates: list[date]


def to_arrays(ms: list[parse.Match]) -> Data:
    teams = sorted({t for m in ms for t in (m.home, m.away)})
    tidx = {t: i for i, t in enumerate(teams)}
    countries = sorted({t.split(":")[0] for t in teams})
    cidx = {c: i for i, c in enumerate(countries)}
    return Data(
        teams, tidx, countries,
        np.array([cidx[t.split(":")[0]] for t in teams]),
        np.array([tidx[m.home] for m in ms]), np.array([tidx[m.away] for m in ms]),
        np.array([m.hg for m in ms], float), np.array([m.ag for m in ms], float),
        np.array([not m.comp.startswith("dom") for m in ms]),
        np.array([m.neutral for m in ms]),
        np.array([m.date.toordinal() for m in ms]),
        [m.comp for m in ms], [m.stage for m in ms], [m.date for m in ms],
    )


# --------------------------------------------------------------------------- goals model
@dataclass
class Fit:
    mu: float
    mu_e: float
    h_dom: float
    h_euro: float
    rho: float
    att: np.ndarray  # total (country + club)
    dfn: np.ndarray
    teams: list[str]
    tidx: dict[str, int]
    n_matches: int

    def lambdas(self, hi: int, ai: int, euro: bool = True, neutral: bool = False) -> tuple[float, float]:
        base = self.mu + (self.mu_e if euro else 0.0)
        home = 0.0 if neutral else (self.h_euro if euro else self.h_dom)
        return (math.exp(base + self.att[hi] - self.dfn[ai] + home), math.exp(base + self.att[ai] - self.dfn[hi]))


def fit_goals(d: Data, mask: np.ndarray, cutoff_ord: int, xi: float, sigma: float, euro_w: float) -> Fit:
    T, C = len(d.teams), len(d.countries)
    h, a, hg, ag = d.h[mask], d.a[mask], d.hg[mask], d.ag[mask]
    eu, neu = d.euro[mask].astype(float), d.neutral[mask].astype(float)
    w = np.exp(-xi * (cutoff_ord - d.days[mask])) * np.where(eu > 0, euro_w, 1.0)
    tc = d.team_cty
    lam_t = 1.0 / sigma**2
    lam_c = 1.0 / 1.0**2
    home_dom = (1 - eu) * (1 - neu)
    home_eu = eu * (1 - neu)
    # params: mu, mu_e, h_dom, h_euro, A[C], D[C], alpha[T], delta[T]
    n = 4 + 2 * C + 2 * T

    def unpack(p):
        A, D = p[4:4 + C], p[4 + C:4 + 2 * C]
        al, de = p[4 + 2 * C:4 + 2 * C + T], p[4 + 2 * C + T:]
        return p[0], p[1], p[2], p[3], A, D, al, de

    def f(p):
        mu, mue, hd, he, A, D, al, de = unpack(p)
        att = A[tc] + al
        dfn = D[tc] + de
        base = mu + mue * eu
        lh = base + att[h] - dfn[a] + hd * home_dom + he * home_eu
        la = base + att[a] - dfn[h]
        eh, ea = np.exp(lh), np.exp(la)
        nll = np.sum(w * (eh - hg * lh + ea - ag * la))
        nll += 0.5 * lam_t * (al @ al + de @ de) + 0.5 * lam_c * (A @ A + D @ D)
        rh = w * (eh - hg)  # d/d lh
        ra = w * (ea - ag)
        g = np.zeros(n)
        g[0] = rh.sum() + ra.sum()
        g[1] = (rh * eu).sum() + (ra * eu).sum()
        g[2] = (rh * home_dom).sum()
        g[3] = (rh * home_eu).sum()
        gatt = np.bincount(h, rh, T) + np.bincount(a, ra, T)
        gdef = -np.bincount(a, rh, T) - np.bincount(h, ra, T)
        g[4:4 + C] = np.bincount(tc, gatt, C) + lam_c * A
        g[4 + C:4 + 2 * C] = np.bincount(tc, gdef, C) + lam_c * D
        g[4 + 2 * C:4 + 2 * C + T] = gatt + lam_t * al
        g[4 + 2 * C + T:] = gdef + lam_t * de
        return nll, g

    p0 = np.zeros(n)
    p0[0] = math.log(max(1e-3, (hg.sum() + ag.sum()) / (2 * len(hg))))
    p0[2] = p0[3] = 0.2
    res = minimize(f, p0, jac=True, method="L-BFGS-B", options={"maxiter": 3000})
    mu, mue, hd, he, A, D, al, de = unpack(res.x)
    att, dfn = A[tc] + al, D[tc] + de
    # Centre: shift so the mean club rating is 0 (identifiability is via priors; this is cosmetic).
    s_att, s_def = att.mean(), dfn.mean()
    att, dfn = att - s_att, dfn - s_def
    mu = mu + s_att - s_def

    # Dixon-Coles rho on low-score cells, other params fixed.
    base = mu + mue * eu
    lh = np.exp(base + att[h] - dfn[a] + hd * home_dom + he * home_eu)
    la = np.exp(base + att[a] - dfn[h])

    def nll_rho(r):
        tau = np.ones_like(lh)
        m00 = (hg == 0) & (ag == 0)
        m01 = (hg == 0) & (ag == 1)
        m10 = (hg == 1) & (ag == 0)
        m11 = (hg == 1) & (ag == 1)
        tau[m00] = 1 - lh[m00] * la[m00] * r
        tau[m01] = 1 + lh[m01] * r
        tau[m10] = 1 + la[m10] * r
        tau[m11] = 1 - r
        if np.any(tau <= 0):
            return 1e18
        return -np.sum(w * np.log(tau))

    rho = minimize_scalar(nll_rho, bounds=(-0.25, 0.15), method="bounded").x
    return Fit(mu, mue, hd, he, float(rho), att, dfn, d.teams, d.tidx, int(mask.sum()))


def score_grid(lh: float, la: float, rho: float, n: int = 11) -> np.ndarray:
    g = np.outer(poisson.pmf(np.arange(n), lh), poisson.pmf(np.arange(n), la))
    g[0, 0] *= 1 - lh * la * rho
    g[0, 1] *= 1 + lh * rho
    g[1, 0] *= 1 + la * rho
    g[1, 1] *= 1 - rho
    return g / g.sum()


def wdl(g: np.ndarray) -> tuple[float, float, float]:
    return float(np.tril(g, -1).sum()), float(np.trace(g)), float(np.triu(g, 1).sum())


# --------------------------------------------------------------------------- Elo baseline
ELO_K, ELO_HOME, ELO_INIT_NEW = 20.0, 60.0, 1350.0


def run_elo(d: Data, upto_ord: int) -> np.ndarray:
    """Club-Elo-style ratings from all matches before upto_ord. New clubs start at their
    country's current mean (or a low default), which is how inter-league offsets propagate."""
    r = np.full(len(d.teams), np.nan)
    cty_sum: dict[int, list[float]] = {}
    for i in np.argsort(d.days, kind="stable"):
        if d.days[i] >= upto_ord:
            break
        hi, ai = d.h[i], d.a[i]
        for t in (hi, ai):
            if np.isnan(r[t]):
                c = int(d.team_cty[t])
                pool = [r[j] for j in np.where(d.team_cty == c)[0] if not np.isnan(r[j])]
                r[t] = (np.mean(pool) - 50) if pool else ELO_INIT_NEW
        dr = r[hi] - r[ai] + (0 if d.neutral[i] else ELO_HOME)
        e = 1 / (1 + 10 ** (-dr / 400))
        gd = d.hg[i] - d.ag[i]
        s = 1.0 if gd > 0 else 0.5 if gd == 0 else 0.0
        k = ELO_K * (1.5 if d.euro[i] else 1.0) * (math.log(abs(gd) + 1) + 1 if gd else 1)
        r[hi] += k * (s - e)
        r[ai] -= k * (s - e)
    _ = cty_sum
    return np.nan_to_num(r, nan=ELO_INIT_NEW)


def fit_elo_draw(d: Data, r: np.ndarray, mask: np.ndarray) -> tuple[float, float]:
    """Ordered-logit thresholds mapping Elo difference to W/D/L."""
    dr = (r[d.h[mask]] - r[d.a[mask]] + np.where(d.neutral[mask], 0, ELO_HOME)) / 400 * math.log(10)
    out = np.sign(d.hg[mask] - d.ag[mask])

    def nll(p):
        c1, c2 = p[0], p[0] + abs(p[1])
        pa = 1 / (1 + np.exp(-(c1 - dr)))
        pad = 1 / (1 + np.exp(-(c2 - dr)))
        pr = np.where(out < 0, pa, np.where(out == 0, pad - pa, 1 - pad))
        return -np.sum(np.log(np.clip(pr, 1e-9, 1)))

    p = minimize(nll, [-0.6, 1.2], method="Nelder-Mead").x
    return float(p[0]), float(p[0] + abs(p[1]))


def elo_probs(dr_elo: float, c1: float, c2: float) -> tuple[float, float, float]:
    x = dr_elo / 400 * math.log(10)
    pa = 1 / (1 + math.exp(-(c1 - x)))
    pad = 1 / (1 + math.exp(-(c2 - x)))
    return 1 - pad, pad - pa, pa


# --------------------------------------------------------------------------- metrics
def rps(p: tuple[float, float, float], o: int) -> float:
    obs = [1.0 if o == 0 else 0.0, 1.0 if o == 1 else 0.0, 1.0 if o == 2 else 0.0]
    c1 = p[0] - obs[0]
    c2 = p[0] + p[1] - obs[0] - obs[1]
    return 0.5 * (c1 * c1 + c2 * c2)


def metrics(preds: list[tuple[float, float, float]], outs: list[int]) -> dict:
    n = len(outs)
    r = sum(rps(p, o) for p, o in zip(preds, outs)) / n
    b = sum(sum((p[k] - (1 if o == k else 0)) ** 2 for k in range(3)) for p, o in zip(preds, outs)) / n
    ll = -sum(math.log(max(1e-12, p[o])) for p, o in zip(preds, outs)) / n
    return {"rps": r, "brier": b, "logloss": ll, "n": n}


def calibration(preds, outs, bins=10):
    xs, ys = [], []
    for p, o in zip(preds, outs):
        for k in range(3):
            xs.append(p[k])
            ys.append(1.0 if o == k else 0.0)
    xs, ys = np.array(xs), np.array(ys)
    edges = np.linspace(0, 1, bins + 1)
    out, ece = [], 0.0
    for i in range(bins):
        m = (xs >= edges[i]) & (xs < edges[i + 1] if i < bins - 1 else xs <= 1)
        if m.sum() == 0:
            continue
        pm, om = float(xs[m].mean()), float(ys[m].mean())
        out.append({"p": round(pm, 4), "o": round(om, 4), "n": int(m.sum())})
        ece += m.sum() / len(xs) * abs(pm - om)
    return out, float(ece)


def outcome(hg, ag) -> int:
    return 0 if hg > ag else 1 if hg == ag else 2


# --------------------------------------------------------------------------- backtest
def season_eval(d: Data, start_year: int, xi: float, sigma: float, euro_w: float):
    """Freeze both models at 1 Sep of start_year; predict that season's UCL proper (no qualifiers)."""
    cut = date(start_year, 9, 1).toordinal()
    end = date(start_year + 1, 7, 1).toordinal()
    train = d.days < cut
    test = np.where((d.days >= cut) & (d.days < end) & np.array([c == "UCL" for c in d.comp]))[0]
    fit = fit_goals(d, train, cut, xi, sigma, euro_w)
    r = run_elo(d, cut)
    c1, c2 = fit_elo_draw(d, r, train & (d.days > cut - 3 * 365))
    dc, el, outs = [], [], []
    for i in test:
        lh, la = fit.lambdas(d.h[i], d.a[i], True, bool(d.neutral[i]))
        dc.append(wdl(score_grid(lh, la, fit.rho)))
        el.append(elo_probs(r[d.h[i]] - r[d.a[i]] + (0 if d.neutral[i] else ELO_HOME), c1, c2))
        outs.append(outcome(d.hg[i], d.ag[i]))
    return dc, el, outs


def main() -> None:
    t0 = time.time()
    ms = parse.parse_all()
    d = to_arrays(ms)
    print(f"{len(ms)} matches, {len(d.teams)} teams, {len(d.countries)} countries ({time.time() - t0:.1f}s)")

    # Tune on 2019/20–2020/21, report on 2021/22–2025/26 (held out from tuning).
    tune_seasons, test_seasons = [2019, 2020], [2021, 2022, 2023, 2024, 2025]
    grid = [(xi, s, ew) for xi in (0.002, 0.003, 0.0045, 0.0065) for s in (0.6, 0.9) for ew in (1.0, 2.0)]
    best, best_ll = None, 1e9
    for xi, s, ew in grid:
        ll, n = 0.0, 0
        for y in tune_seasons:
            dc, _, outs = season_eval(d, y, xi, s, ew)
            m = metrics(dc, outs)
            ll += m["logloss"] * m["n"]
            n += m["n"]
        print(f"  tune xi={xi} sigma={s} euro_w={ew}: logloss {ll / n:.4f}")
        if ll / n < best_ll:
            best, best_ll = (xi, s, ew), ll / n
    xi, sigma, euro_w = best
    print("chosen", best)

    all_dc, all_el, all_out, per_season = [], [], [], []
    for y in test_seasons:
        dc, el, outs = season_eval(d, y, xi, sigma, euro_w)
        all_dc += dc
        all_el += el
        all_out += outs
        md, me = metrics(dc, outs), metrics(el, outs)
        per_season.append({"season": f"{y}/{str(y + 1)[2:]}", "model": md, "elo": me})
        print(f"  {y}/{y + 1}: n={md['n']} RPS model {md['rps']:.4f} elo {me['rps']:.4f}")
    m_dc, m_el = metrics(all_dc, all_out), metrics(all_el, all_out)
    m_un = metrics([(1 / 3, 1 / 3, 1 / 3)] * len(all_out), all_out)
    cal, ece = calibration(all_dc, all_out)
    cal_el, ece_el = calibration(all_el, all_out)
    print(f"overall RPS model {m_dc['rps']:.4f} elo {m_el['rps']:.4f} uniform {m_un['rps']:.4f}; ECE {ece:.4f} (elo {ece_el:.4f})")

    # Final fit with everything to date.
    cut = TODAY.toordinal()
    fit = fit_goals(d, d.days < cut, cut, xi, sigma, euro_w)
    elo = run_elo(d, cut)
    print(f"final: mu {fit.mu:.3f} mu_e {fit.mu_e:.3f} H_dom {fit.h_dom:.3f} H_euro {fit.h_euro:.3f} rho {fit.rho:.3f}")

    clubs = []
    for code, (cid, name, short, pot, c1, c2) in CLUBS.items():
        i = d.tidx[cid]
        n_played = int(((d.h == i) | (d.a == i)).sum())
        clubs.append({
            "code": code, "name": name, "short": short, "pot": pot, "country": cid.split(":")[0],
            "colors": [c1, c2], "att": round(float(fit.att[i]), 4), "def": round(float(fit.dfn[i]), 4),
            "elo": round(float(elo[i])), "matches": n_played,
        })
    # Coefficient-order tiebreak proxy: pot then listed order.
    for k, c in enumerate(clubs):
        c["seedOrder"] = k

    fixtures = []
    with (Path(__file__).parent / "fixtures_2627.csv").open(encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            fixtures.append({
                "md": int(r["md"]), "date": r["date"], "home": r["home"], "away": r["away"],
                **({"hg": int(r["hg"]), "ag": int(r["ag"])} if r["hg"] != "" else {}),
            })

    out = {
        "generated": TODAY.isoformat(),
        "season": "2026/27",
        "params": {
            "mu": round(fit.mu + fit.mu_e, 5), "home": round(fit.h_euro, 5), "homeDomestic": round(fit.h_dom, 5),
            "rho": round(fit.rho, 5), "xi": xi, "sigma": sigma, "euroWeight": euro_w,
        },
        "clubs": clubs,
        "fixtures": fixtures,
        "validation": {
            "seasons": per_season,
            "overall": {"model": m_dc, "elo": m_el, "uniform": m_un},
            "rpsImprovementVsElo": (m_el["rps"] - m_dc["rps"]) / m_el["rps"],
            "ece": ece, "eceElo": ece_el,
            "calibration": cal, "calibrationElo": cal_el,
            "tuning": {"seasons": ["2019/20", "2020/21"], "chosen": {"xi": xi, "sigma": sigma, "euroWeight": euro_w}},
        },
        "data": {
            "matchesFit": fit.n_matches, "teams": len(d.teams), "countries": len(d.countries),
            "from": str(min(d.dates)), "to": str(max(dt for dt in d.dates if dt < TODAY)),
            "byComp": {k: int(v) for k, v in zip(*np.unique(np.array(d.comp), return_counts=True))},
        },
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"wrote {OUT} ({time.time() - t0:.0f}s)")
    for c in sorted(clubs, key=lambda c: -(c["att"] + c["def"])):
        print(f"  {c['code']} att {c['att']:+.2f} def {c['def']:+.2f} elo {c['elo']} n={c['matches']}")


if __name__ == "__main__":
    main()
