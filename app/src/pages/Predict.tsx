import { useSearchParams } from "react-router-dom";
import { SimLink } from "../components/ui";
import FullRun from "./predict/FullRun";
import OneMatch from "./predict/OneMatch";

export default function Predict() {
  const [params, setParams] = useSearchParams();
  const mode = params.get("mode");
  const set = (m: string | null) =>
    setParams((p) => {
      const n = new URLSearchParams(p);
      if (m) n.set("mode", m);
      else {
        n.delete("mode");
        n.delete("b");
        n.delete("step");
      }
      return n;
    });

  if (mode === "full" || mode === "match")
    return (
      <div className="stack">
        <div>
          <button className="btn ghost small" onClick={() => set(null)}>← Both modes</button>
        </div>
        {mode === "full" ? <FullRun /> : <OneMatch />}
      </div>
    );

  return (
    <div className="stack">
      <div>
        <div className="kicker">Predict</div>
        <h1 style={{ fontSize: "clamp(1.8rem, 4.5vw, 2.8rem)", marginTop: 4 }}>Your call against the model</h1>
        <p className="muted" style={{ maxWidth: "60ch", marginTop: 8 }}>Build a full-season bracket and get graded across thousands of simulated seasons, or zoom in on a single tie.</p>
      </div>
      <div className="grid g2">
        <button className="card" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => set("full")}>
          <div className="kicker">The full run</div>
          <h2 style={{ margin: "6px 0 8px" }}>Play the whole season</h2>
          <p className="muted small">Order the 36-club league phase table, pick every play-off and knockout tie, crown a champion, and get a graded report: expected points, perfect-bracket odds and how often you beat the favourites.</p>
          <span className="btn primary small" style={{ marginTop: 6 }}>Build my bracket →</span>
        </button>
        <button className="card" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => set("match")}>
          <div className="kicker">One match</div>
          <h2 style={{ margin: "6px 0 8px" }}>Club vs club</h2>
          <p className="muted small">Call an exact scoreline, see the model's odds and scoreline map, try a two-legged tie with extra time and penalties, then settle it by playing the match out.</p>
          <span className="btn small" style={{ marginTop: 6 }}>Pick a match →</span>
        </button>
      </div>
      <p className="small muted">Grades use the current simulation (<SimLink to="/">dashboard</SimLink> settings: runs and "as of").</p>
    </div>
  );
}
