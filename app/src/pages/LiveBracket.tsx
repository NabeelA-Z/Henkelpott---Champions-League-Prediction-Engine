import { useEffect, useRef, useState } from "react";
import { BracketView } from "../components/season";
import { Club, Empty, PageHead, useCopy } from "../components/ui";
import { CLUB } from "../engine/model";
import type { Season } from "../engine/season";
import { useSim } from "../state/sim";

const STEP_MS = 1100;

export default function LiveBracket() {
  const { result, run, status } = useSim();
  const [revealed, setRevealed] = useState(0);
  const [lead, setLead] = useState(true);
  const [phase, setPhase] = useState<"table" | "bracket">("bracket");
  const [msg, setMsg] = useState("");
  const timers = useRef<number[]>([]);
  const copy = useCopy();

  const play = (withLead: boolean) => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setRevealed(0);
    const offset = withLead ? 2600 : 0;
    setPhase(withLead ? "table" : "bracket");
    if (withLead) timers.current.push(window.setTimeout(() => setPhase("bracket"), offset));
    for (let r = 1; r <= 6; r++) timers.current.push(window.setTimeout(() => setRevealed(r), offset + r * STEP_MS));
  };

  useEffect(() => {
    if (result) play(lead);
    return () => timers.current.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.seed, result?.asOf, result?.runs]);

  if (!result) return <Empty title="Run a simulation to reveal the bracket">One seeded season, revealed round by round from the knockout play-off to the final in Madrid.</Empty>;
  const s = result.featured;

  return (
    <div className="stack">
      <PageHead
        title="From the play-off to Madrid"
        meta={<>Live bracket · seed <span className="mono">{result.seed}</span> · one seeded season, revealed round by round.</>}
        actions={
          <>
            <label className="row small" style={{ gap: 6 }}>
              <input type="checkbox" checked={lead} onChange={(e) => setLead(e.target.checked)} /> League-phase lead-in
            </label>
            <button className="btn" onClick={async () => setMsg((await copy(window.location.href)) ? "Link copied" : "Copy failed")}>Copy link</button>
            <button className="btn" onClick={() => poster(s, result.seed)}>Share poster</button>
            <button className="btn" onClick={() => play(lead)}>Replay</button>
            <button className="btn primary" onClick={() => run({ fresh: true })} disabled={status === "running"}>New run</button>
          </>
        }
      />
      <p className="small muted" aria-live="polite">{msg || "No third-place match in this competition. Ties show both legs (first leg at the lower seed) and the aggregate."}</p>
      {phase === "table" ? <TableLeadIn s={s} /> : <div className="card bracket-wide"><BracketView s={s} revealed={revealed} /></div>}
    </div>
  );
}

function TableLeadIn({ s }: { s: Season }) {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setSettled(true), 250);
    return () => clearTimeout(t);
  }, []);
  const seedOrder = [...s.order].sort((a, b) => CLUB[a].seedOrder - CLUB[b].seedOrder);
  const rowH = 30;
  return (
    <div className="card">
      <h3 style={{ marginBottom: 10 }}>League phase settles…</h3>
      <div style={{ position: "relative", height: rowH * 36 }}>
        {s.order.map((c, finalIdx) => {
          const startIdx = seedOrder.indexOf(c);
          const i = settled ? finalIdx : startIdx;
          const zone = finalIdx < 8 ? "var(--stamp)" : finalIdx < 24 ? "var(--rule-2)" : "transparent";
          return (
            <div
              key={c}
              style={{
                position: "absolute", left: 0, right: 0, top: i * rowH, height: rowH - 4, display: "flex", alignItems: "center", gap: 10,
                padding: "0 10px", borderRadius: 3, background: "var(--sheet)", boxShadow: settled ? `0 0 0 1px var(--rule), inset 0 -2px 0 ${zone}` : "0 0 0 1px var(--rule)",
                transition: `top 1.8s cubic-bezier(.2,.8,.2,1) ${(finalIdx % 9) * 30}ms, box-shadow .6s 1.6s`,
              }}
            >
              <span className="mono muted" style={{ width: 22, textAlign: "right" }}>{settled ? finalIdx + 1 : ""}</span>
              <Club code={c} />
              <span className="muted small" style={{ marginLeft: "auto" }}>{s.table[finalIdx].pts} pts</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Draws the bracket onto a canvas and downloads it as a PNG. */
function poster(s: Season, seed: string) {
  const W = 1600, H = 1000;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const g = cv.getContext("2d")!;
  g.fillStyle = "#0c1a45";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "#f3f5f9";
  g.font = "800 44px 'Archivo Variable', system-ui, sans-serif";
  g.fillText("HENKELPOTT · 2026/27", 48, 76);
  g.font = "500 20px 'Archivo Variable', system-ui, sans-serif";
  g.fillStyle = "#9aa7c2";
  g.fillText(`Simulated bracket · seed ${seed} · not affiliated with UEFA`, 48, 108);

  const cols = [
    { ties: s.bracket.r16.slice(0, 4).map((sl) => s.po.find((t) => t.id === s.bracket.playoffs[sl.po].id)!), x: 40 },
    { ties: s.r16.slice(0, 4), x: 230 },
    { ties: s.qf.slice(0, 2), x: 420 },
    { ties: s.sf.slice(0, 1), x: 610 },
    { ties: s.sf.slice(1), x: 830 },
    { ties: s.qf.slice(2), x: 1020 },
    { ties: s.r16.slice(4), x: 1210 },
    { ties: s.bracket.r16.slice(4).map((sl) => s.po.find((t) => t.id === s.bracket.playoffs[sl.po].id)!), x: 1400 },
  ];
  const top = 160, span = H - top - 60;
  const box = (x: number, y: number, a: string, b: string, sa: number, sb: number, win: string) => {
    g.fillStyle = "#13245a";
    g.strokeStyle = "#2a3d7d";
    g.lineWidth = 2;
    g.beginPath();
    g.roundRect(x, y, 170, 64, 4);
    g.fill();
    g.stroke();
    [[a, sa], [b, sb]].forEach(([c, sc], i) => {
      const code = c as string;
      g.fillStyle = CLUB[code].colors[0];
      g.fillRect(x + 10, y + 10 + i * 26, 12, 18);
      g.font = `${win === code ? 800 : 500} 18px 'Archivo Variable', system-ui, sans-serif`;
      g.fillStyle = win === code ? "#f3f5f9" : "#9aa7c2";
      g.fillText(CLUB[code].short, x + 30, y + 26 + i * 26);
      g.fillText(String(sc), x + 148, y + 26 + i * 26);
    });
  };
  for (const c of cols)
    c.ties.forEach((t, i) => {
      const y = top + ((i + 0.5) * span) / c.ties.length - 32;
      box(c.x, y, t.a, t.b, t.aggA, t.aggB, t.winner);
    });
  const f = s.final;
  g.fillStyle = "#d3d9e3";
  g.font = "800 22px 'Archivo Variable', system-ui, sans-serif";
  g.textAlign = "center";
  g.fillText("FINAL · MADRID", W / 2 + 15, top + span / 2 - 90);
  box(W / 2 - 70, top + span / 2 - 70, f.match.home, f.match.away, f.match.hg, f.match.ag, f.winner);
  g.fillStyle = "#f3f5f9";
  g.font = "900 40px 'Archivo Variable', system-ui, sans-serif";
  g.fillText(CLUB[s.champion].name.toUpperCase(), W / 2 + 15, top + span / 2 + 60);
  g.fillStyle = "#d3d9e3";
  g.font = "600 18px 'Archivo Variable', system-ui, sans-serif";
  g.fillText("CHAMPIONS", W / 2 + 15, top + span / 2 + 88);
  cv.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `henkelpott-bracket-${seed}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
}
