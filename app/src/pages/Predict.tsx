import { ArrowLeft, ArrowRight, Plane } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { PageHead, SimLink } from "../components/ui";
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
        n.delete("a");
      }
      return n;
    });

  if (mode === "full" || mode === "match")
    return (
      <div className="stack">
        <div>
          <button className="btn ghost small" onClick={() => set(null)}><ArrowLeft size={15} aria-hidden="true" /> Both modes</button>
        </div>
        {mode === "full" ? <FullRun /> : <OneMatch />}
      </div>
    );

  return (
    <div className="stack" style={{ gap: 28 }}>
      <PageHead
        title="Your call against the model"
        meta="Build a full-season bracket and get graded across thousands of simulated seasons, or zoom in on a single tie."
      />
      <div className="passes">
        <button className="pass" onClick={() => set("full")}>
          <span className="pass-main">
            <span className="pass-route"><span className="iata">36</span><Plane size={16} aria-hidden="true" /><span className="iata">MAD</span></span>
            <span className="pass-title">Play the whole season</span>
            <span className="pass-text">
              Order the 36-club league phase table, pick every play-off and knockout tie, crown a champion, and get a graded report: expected points,
              perfect-bracket odds and how often you beat the favourites.
            </span>
          </span>
          <span className="pass-stub">
            <span className="field-l">Class</span>
            <span className="field-v">Full run</span>
            <span className="btn primary small">Build my bracket <ArrowRight size={14} aria-hidden="true" /></span>
          </span>
        </button>
        <button className="pass" onClick={() => set("match")}>
          <span className="pass-main">
            <span className="pass-route"><span className="iata">1</span><Plane size={16} aria-hidden="true" /><span className="iata">1</span></span>
            <span className="pass-title">Club vs club</span>
            <span className="pass-text">
              Call an exact scoreline, see the model's odds and scoreline map, try a two-legged tie with extra time and penalties, then settle it by playing the match out.
            </span>
          </span>
          <span className="pass-stub">
            <span className="field-l">Class</span>
            <span className="field-v">One match</span>
            <span className="btn small">Pick a match <ArrowRight size={14} aria-hidden="true" /></span>
          </span>
        </button>
      </div>
      <p className="small muted">Grades use the current simulation (<SimLink to="/">dashboard</SimLink> settings: runs and "as of").</p>
    </div>
  );
}
