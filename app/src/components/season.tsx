import type { ReactNode } from "react";
import { CLUB } from "../engine/model";
import type { Season, TableRow, Tie } from "../engine/season";
import { Club } from "./ui";

const zone = (pos: number) => (pos <= 8 ? "zone-top8" : pos <= 24 ? "zone-po" : "zone-out");

export function LeagueTable({ rows, highlight, onPick }: { rows: TableRow[]; highlight?: string; onPick?: (code: string) => void }) {
  return (
    <div className="scroll-x">
      <table>
        <caption className="vh">League phase table</caption>
        <thead>
          <tr>
            <th className="num">#</th>
            <th>Club</th>
            <th className="num">Pld</th>
            <th className="num">W</th>
            <th className="num">D</th>
            <th className="num">L</th>
            <th className="num">GF</th>
            <th className="num">GA</th>
            <th className="num">GD</th>
            <th className="num">Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.code} className={`${zone(r.pos)}${highlight === r.code ? " hl" : ""}`}>
              <td className="num">{r.pos}</td>
              <td>
                {onPick ? (
                  <button className="btn ghost small" style={{ padding: 0 }} onClick={() => onPick(r.code)}>
                    <Club code={r.code} />
                  </button>
                ) : (
                  <Club code={r.code} />
                )}
              </td>
              <td className="num">{r.p}</td>
              <td className="num">{r.w}</td>
              <td className="num">{r.d}</td>
              <td className="num">{r.l}</td>
              <td className="num">{r.gf}</td>
              <td className="num">{r.ga}</td>
              <td className="num">{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
              <td className="num"><strong>{r.pts}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted" style={{ marginTop: 8 }}>
        <span className="pill real">1–8</span> Round of 16 · <span className="pill warn">9–24</span> knockout play-off · <span className="pill">25–36</span> eliminated. Tie-breakers: points, goal difference, goals scored, away goals scored, wins, away wins, opponents' points, opponents' goal difference, opponents' goals scored, then coefficient.
      </p>
    </div>
  );
}

export function PositionChart({ series, code }: { series: number[]; code: string }) {
  const W = 560, H = 240, L = 34, R = 12, T = 12, B = 28;
  const x = (i: number) => L + (i / Math.max(1, series.length - 1)) * (W - L - R);
  const y = (p: number) => T + ((p - 1) / 35) * (H - T - B);
  const color = CLUB[code].colors[0];
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${CLUB[code].name} league position after each matchday`}>
      <rect x={L} y={y(1) - 4} width={W - L - R} height={y(8.5) - y(1) + 4} fill="var(--good-soft)" />
      <rect x={L} y={y(8.5)} width={W - L - R} height={y(24.5) - y(8.5)} fill="var(--warn-soft)" opacity="0.6" />
      <g className="grid">
        {[1, 8, 16, 24, 36].map((p) => (
          <g key={p}>
            <line x1={L} x2={W - R} y1={y(p)} y2={y(p)} />
            <text x={L - 6} y={y(p) + 4} textAnchor="end">{p}</text>
          </g>
        ))}
      </g>
      {series.map((_, i) => (
        <text key={i} x={x(i)} y={H - 8} textAnchor="middle">MD{i + 1}</text>
      ))}
      <polyline fill="none" stroke="var(--accent)" strokeWidth="2.5" points={series.map((p, i) => `${x(i)},${y(p)}`).join(" ")} />
      {series.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p)} r="5" fill={color} stroke="var(--panel)" strokeWidth="2" />
          <text x={x(i)} y={y(p) - 9} textAnchor="middle" style={{ fontWeight: 700, fill: "var(--text)" }}>{p}</text>
        </g>
      ))}
    </svg>
  );
}

export function CalibrationChart({ model, elo }: { model: { p: number; o: number; n: number }[]; elo: { p: number; o: number; n: number }[] }) {
  const S = 300, M = 36;
  const sx = (v: number) => M + v * (S - M - 10);
  const sy = (v: number) => S - M - v * (S - M - 10);
  return (
    <svg className="chart" viewBox={`0 0 ${S} ${S}`} width="100%" style={{ maxWidth: 380 }} role="img" aria-label="Calibration plot: predicted probability against observed frequency">
      <g className="grid">
        {[0, 0.2, 0.4, 0.6, 0.8, 1].map((v) => (
          <g key={v}>
            <line x1={sx(0)} x2={sx(1)} y1={sy(v)} y2={sy(v)} />
            <text x={sx(0) - 6} y={sy(v) + 4} textAnchor="end">{v * 100}%</text>
            <text x={sx(v)} y={sy(0) + 16} textAnchor="middle">{v * 100}%</text>
          </g>
        ))}
      </g>
      <line x1={sx(0)} y1={sy(0)} x2={sx(1)} y2={sy(1)} stroke="var(--faint)" strokeDasharray="4 4" />
      <polyline fill="none" stroke="var(--silver)" strokeWidth="1.5" points={elo.map((b) => `${sx(b.p)},${sy(b.o)}`).join(" ")} />
      {elo.map((b, i) => <circle key={`e${i}`} cx={sx(b.p)} cy={sy(b.o)} r="3" fill="var(--silver)" />)}
      <polyline fill="none" stroke="var(--accent)" strokeWidth="2.5" points={model.map((b) => `${sx(b.p)},${sy(b.o)}`).join(" ")} />
      {model.map((b, i) => <circle key={`m${i}`} cx={sx(b.p)} cy={sy(b.o)} r={3 + Math.min(5, Math.sqrt(b.n) / 8)} fill="var(--accent)" opacity="0.85"><title>{`predicted ${(b.p * 100).toFixed(0)}%, observed ${(b.o * 100).toFixed(0)}% (n=${b.n})`}</title></circle>)}
      <text x={S / 2} y={S - 4} textAnchor="middle">Predicted probability</text>
      <text x={10} y={S / 2} textAnchor="middle" transform={`rotate(-90 10 ${S / 2})`}>Observed frequency</text>
    </svg>
  );
}

// ---------------------------------------------------------------- bracket
function TieBox({ t, hidden, pos }: { t: Tie; hidden?: boolean; pos: Record<string, number> }) {
  const line = (code: string, agg: number) => (
    <div className={`bt ${t.winner === code ? "win" : "lose"}`}>
      <span className="club"><span className="mono faint" style={{ fontSize: "0.68rem", width: 18 }}>{pos[code]}</span><Club code={code} short /></span>
      <span className="agg">{agg}</span>
    </div>
  );
  return (
    <div className={`btie${hidden ? " hidden" : ""}`}>
      {line(t.a, t.aggA)}
      {line(t.b, t.aggB)}
      <div className="legs">
        {t.legs[0].hg}–{t.legs[0].ag}, {t.legs[1].ag}–{t.legs[1].hg}
        {t.pens ? ` · pens ${t.pens[0]}–${t.pens[1]}` : t.aet ? " · a.e.t." : ""}
      </div>
    </div>
  );
}

/** Two-sided bracket: play-off → R16 → QF → SF on each side, final in the middle. revealed = rounds shown (0..6). */
export function BracketView({ s, revealed = 6, extra }: { s: Season; revealed?: number; extra?: ReactNode }) {
  const pos = Object.fromEntries(s.order.map((c, i) => [c, i + 1]));
  const po = s.bracket.r16.map((sl) => s.po.find((t) => t.id === s.bracket.playoffs[sl.po].id)!);
  const left = { po: po.slice(0, 4), r16: s.r16.slice(0, 4), qf: s.qf.slice(0, 2), sf: s.sf.slice(0, 1) };
  const right = { po: po.slice(4), r16: s.r16.slice(4), qf: s.qf.slice(2), sf: s.sf.slice(1) };
  const col = (title: string, ties: Tie[], lvl: number) => (
    <div className="bcol">
      <h4>{title}</h4>
      {ties.map((t) => <TieBox key={t.id} t={t} hidden={revealed < lvl} pos={pos} />)}
    </div>
  );
  const f = s.final;
  return (
    <div className="scroll-x">
      <div className="bracket">
        {col("Play-off", left.po, 1)}
        {col("Round of 16", left.r16, 2)}
        {col("Quarter-final", left.qf, 3)}
        {col("Semi-final", left.sf, 4)}
        <div className="bcol final-col">
          <h4>Final · Madrid</h4>
          <div className={`btie${revealed < 5 ? " hidden" : ""}`}>
            {[f.match.home, f.match.away].map((c, i) => (
              <div key={c} className={`bt ${f.winner === c ? "win" : "lose"}`}>
                <Club code={c} short />
                <span className="agg">{i === 0 ? f.match.hg : f.match.ag}</span>
              </div>
            ))}
            <div className="legs">{f.match.pens ? `pens ${f.match.pens[0]}–${f.match.pens[1]}` : f.match.aet ? "a.e.t." : "Metropolitano"}</div>
          </div>
          <div className={`champ-banner${revealed < 6 ? " hidden" : ""}`} style={{ opacity: revealed < 6 ? 0 : 1, transition: "opacity .5s" }}>
            <div className="kicker" style={{ color: "inherit" }}>Champion</div>
            <div style={{ display: "flex", justifyContent: "center", marginTop: 6 }}><Club code={s.champion} bold /></div>
          </div>
          {extra}
        </div>
        {col("Semi-final", right.sf, 4)}
        {col("Quarter-final", right.qf, 3)}
        {col("Round of 16", right.r16, 2)}
        {col("Play-off", right.po, 1)}
      </div>
    </div>
  );
}
