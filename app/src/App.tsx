import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import { Moon, RefreshCw, Sun } from "lucide-react";
import { Seg, SimLink, Trophy } from "./components/ui";
import { RUN_OPTIONS, useSim } from "./state/sim";
import Dashboard from "./pages/Dashboard";

const Predict = lazy(() => import("./pages/Predict"));
const MatchCenter = lazy(() => import("./pages/MatchCenter"));
const LiveBracket = lazy(() => import("./pages/LiveBracket"));
const Stats = lazy(() => import("./pages/Stats"));
const Methodology = lazy(() => import("./pages/Methodology"));
const About = lazy(() => import("./pages/About"));

const NAV = [
  { to: "/", label: "Dashboard" },
  { to: "/predict", label: "Predict" },
  { to: "/results", label: "Match Center" },
  { to: "/bracket", label: "Live Bracket" },
  { to: "/scorers", label: "Stats" },
  { to: "/methodology", label: "Methodology" },
];

function ThemeToggle() {
  const [theme, setTheme] = useState<string | null>(() => document.documentElement.dataset.theme ?? null);
  const dark = theme ? theme === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  const toggle = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("hp-theme", next);
    } catch {
      /* storage unavailable */
    }
    setTheme(next);
  };
  return (
    <button className="btn icon ghost" onClick={toggle} aria-label={`Switch to ${dark ? "light" : "dark"} mode`} title="Toggle light / dark">
      {dark ? <Sun size={18} strokeWidth={1.75} /> : <Moon size={18} strokeWidth={1.75} />}
    </button>
  );
}

function Header() {
  const { qs, runs, setRuns, asOf, setAsOf, run, status, progress, result } = useSim();
  return (
    <header className="top">
      <div className="wrap top-row">
        <SimLink to="/" className="brand">
          <Trophy className="brand-ico" />
          <span>
            <b>HENKELPOTT</b>
            <small>UCL 2026/27 engine</small>
          </span>
        </SimLink>
        <nav className="nav" aria-label="Main">
          {NAV.map((n) => (
            <NavLink key={n.to} to={`${n.to}${qs}`} end={n.to === "/"} className={({ isActive }) => (isActive ? "active" : "")}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="settings">
          <label className="vh" htmlFor="runs">Simulation runs</label>
          <select id="runs" value={runs} onChange={(e) => setRuns(Number(e.target.value))} title="Seasons simulated per run">
            {RUN_OPTIONS.map((n) => (
              <option key={n} value={n}>{n / 1000}k runs</option>
            ))}
          </select>
          <Seg
            label="Results as of"
            value={asOf}
            onChange={setAsOf}
            items={[
              { id: "live", label: "Season to date" },
              { id: "pre", label: "Pre-season" },
            ]}
          />
        </div>
        <div className="controls">
          <button className="btn primary small" onClick={() => run({ fresh: true })} disabled={status === "running"}>
            {status === "running" ? (
              <>
                <span className="spinner" /> {Math.round(progress * 100)}%
              </>
            ) : (
              <>
                <RefreshCw size={15} strokeWidth={2.25} aria-hidden="true" /> {result ? "Run it again" : "Run simulation"}
              </>
            )}
          </button>
          <ThemeToggle />
        </div>
      </div>
      <div className="progress-line" style={{ width: status === "running" ? `${progress * 100}%` : 0 }} />
    </header>
  );
}

function Footer() {
  return (
    <footer>
      <div className="wrap cols">
        <div style={{ maxWidth: 560 }}>
          <strong>HENKELPOTT</strong>
          <p style={{ marginTop: 10 }}>
            A seeded Monte Carlo engine for the 2026/27 Champions League. Not affiliated with or endorsed by UEFA or any club. Club names are used descriptively;
            badges are generated, not official crests. Landmark photographs from Wikimedia Commons, credited on the <SimLink to="/about">About</SimLink> page.
          </p>
        </div>
        <nav aria-label="Footer">
          {NAV.slice(1).map((n) => (
            <SimLink key={n.to} to={n.to}>{n.label}</SimLink>
          ))}
          <SimLink to="/about">About</SimLink>
          <a href="https://github.com/NabeelA-Z/Henkelpott---Champions-League-Prediction-Engine" rel="noreferrer">Source on GitHub</a>
        </nav>
      </div>
    </footer>
  );
}

class Boundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null; key: string }> {
  state = { error: null as Error | null, key: this.props.resetKey };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  static getDerivedStateFromProps(p: { resetKey: string }, s: { key: string }) {
    return p.resetKey !== s.key ? { error: null, key: p.resetKey } : null;
  }
  render() {
    if (this.state.error)
      return (
        <div className="card empty guilloche">
          <h2>Something went wrong on this page</h2>
          <p className="mono small">{this.state.error.message}</p>
          <SimLink to="/" className="btn">Back to the dashboard</SimLink>
        </div>
      );
    return this.props.children;
  }
}

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <>
      <a href="#main" className="skip">Skip to content</a>
      <ScrollTop />
      <Header />
      <main id="main" className="wrap" tabIndex={-1}>
        <Boundary resetKey={useLocation().pathname}>
        <Suspense fallback={<p className="muted">Loading…</p>}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/predict" element={<Predict />} />
            <Route path="/results" element={<MatchCenter />} />
            <Route path="/bracket" element={<LiveBracket />} />
            <Route path="/scorers" element={<Stats />} />
            <Route path="/methodology" element={<Methodology />} />
            <Route path="/about" element={<About />} />
            <Route path="*" element={<div className="card empty"><h2>Page not found</h2><p><SimLink to="/">Back to the dashboard</SimLink></p></div>} />
          </Routes>
        </Suspense>
        </Boundary>
      </main>
      <Footer />
    </>
  );
}
