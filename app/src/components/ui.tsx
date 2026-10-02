import { useId, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { CLUB, fmtPct } from "../engine/model";
import { useSim } from "../state/sim";

/** Neutral generated badge: shield in two kit colours with the club code. Not an official crest. */
export function Badge({ code, size = 22 }: { code: string; size?: number }) {
  const c = CLUB[code];
  const id = useId();
  if (!c) return null;
  const [p, s] = c.colors;
  const light = luminance(p) > 0.6;
  return (
    <svg className="badge" width={size} height={size * 1.15} viewBox="0 0 40 46" aria-hidden="true">
      <defs>
        <clipPath id={id}>
          <path d="M20 1 L38 6 V22 C38 34 30 41 20 45 C10 41 2 34 2 22 V6 Z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>
        <rect width="40" height="46" fill={p} />
        <path d={stripe(code)} fill={s} opacity="0.9" />
      </g>
      <path d="M20 1 L38 6 V22 C38 34 30 41 20 45 C10 41 2 34 2 22 V6 Z" fill="none" stroke="rgba(0,0,0,.25)" strokeWidth="1.5" />
      <text x="20" y="27" textAnchor="middle" fontSize="11.5" fontWeight="800" fontFamily="system-ui, sans-serif"
        fill={light ? "#111" : "#fff"} stroke={light ? "rgba(255,255,255,.6)" : "rgba(0,0,0,.35)"} strokeWidth="0.6" paintOrder="stroke">
        {code}
      </text>
    </svg>
  );
}
function stripe(code: string) {
  const k = (code.charCodeAt(0) + code.charCodeAt(2)) % 4;
  return [
    "M0 34 H40 V46 H0 Z", // base band
    "M26 0 H40 V46 H26 Z", // side panel
    "M0 0 L14 0 L40 30 L40 46 Z", // sash
    "M0 0 H40 V9 H0 Z", // top band
  ][k];
}
function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export function Club({ code, short, size, bold }: { code: string; short?: boolean; size?: number; bold?: boolean }) {
  const c = CLUB[code];
  return (
    <span className="club" title={c?.name}>
      <Badge code={code} size={size} />
      <span className="nm" style={bold ? { fontWeight: 800 } : undefined}>{short ? c?.short : c?.name}</span>
    </span>
  );
}

export function Bar({ value, max = 1, gold }: { value: number; max?: number; gold?: boolean }) {
  return (
    <div className={`bar${gold ? " gold" : ""}`} role="presentation">
      <span style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%` }} />
    </div>
  );
}

export function OddsList({ rows, max, gold, tag }: { rows: { code: string; p: number }[]; max?: number; gold?: boolean; tag?: (code: string) => ReactNode }) {
  const m = max ?? Math.max(...rows.map((r) => r.p), 0.0001);
  return (
    <div className="odds-list">
      {rows.map((r, i) => (
        <div className="odds-row" key={r.code}>
          <span className="rank">{i + 1}</span>
          <span className="row" style={{ gap: 6, flexWrap: "nowrap", minWidth: 0 }}>
            <Club code={r.code} />
            {tag?.(r.code)}
          </span>
          <Bar value={r.p} max={m} gold={gold && i === 0} />
          <span className="val">{fmtPct(r.p)}</span>
        </div>
      ))}
    </div>
  );
}

export function Trophy({ className }: { className?: string }) {
  // Original generic two-handled cup.
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 8h22v13a11 11 0 0 1-22 0z" fill="currentColor" fillOpacity="0.15" />
      <path d="M21 12c-11-6-17 9-6 15 3 2 5 2 7 2M43 12c11-6 17 9 6 15-3 2-5 2-7 2" />
      <path d="M32 32v12M25 44h14l3 10H22z" />
    </svg>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  const { run, status } = useSim();
  return (
    <div className="card empty">
      <Trophy className="empty-ico" />
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      <button className="btn primary" onClick={() => run({ fresh: true })} disabled={status === "running"}>
        {status === "running" ? <><span className="spinner" /> Simulating…</> : "Run simulation"}
      </button>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: { id: T; label: ReactNode }[]; label: string }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {items.map((it) => (
        <button key={it.id} role="tab" aria-selected={value === it.id} onClick={() => onChange(it.id)}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function Seg<T extends string | number>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: { id: T; label: ReactNode }[]; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {items.map((it) => (
        <button key={String(it.id)} aria-pressed={value === it.id} onClick={() => onChange(it.id)}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

/** Link that keeps ?seed / runs / asof. */
export function SimLink({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  const { qs } = useSim();
  return (
    <Link to={`${to}${qs}`} className={className}>
      {children}
    </Link>
  );
}

export function Stat({ v, l }: { v: ReactNode; l: ReactNode }) {
  return (
    <div className="tile">
      <div className="v">{v}</div>
      <div className="l">{l}</div>
    </div>
  );
}

export function useCopy() {
  return async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  };
}
