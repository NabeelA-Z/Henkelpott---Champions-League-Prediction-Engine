import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import { Stamp } from "../../components/travel";
import { Bar, Club, Empty, OddsList, PageHead, Seg, useCopy } from "../../components/ui";
import { modelOrder } from "../../engine/aggregate";
import { BUCKET_LABEL, bucketOf, type Bucket } from "../../engine/bracket";
import { CLUB, CODES, FIXTURES, fmtPct, formatBig, singleKnockoutOdds, tieOdds } from "../../engine/model";
import {
  decodeEntry, encodeEntry, favouritePicks, grade, isComplete, reachLabel, SCORING, userBracket,
  type BracketTie, type Entry, type KoPicks,
} from "../../engine/predict";
import { randomSeed } from "../../engine/rng";
import { useSim } from "../../state/sim";

const strengthOrder = () => [...CODES].sort((a, b) => CLUB[b].att + CLUB[b].def - (CLUB[a].att + CLUB[a].def));
const OPPONENTS: Record<string, { opp: string; home: boolean; md: number }[]> = Object.fromEntries(
  CODES.map((c) => [c, FIXTURES.filter((f) => f.home === c || f.away === c).map((f) => ({ opp: f.home === c ? f.away : f.home, home: f.home === c, md: f.md }))]),
);

export default function FullRun() {
  const { result } = useSim();
  const [params, setParams] = useSearchParams();
  const initial = useMemo(() => {
    const e = params.get("b") ? decodeEntry(params.get("b")!) : null;
    return e;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [drawSeed] = useState(() => params.get("d") || randomSeed());
  const [order, setOrder] = useState<string[]>(initial?.order ?? (result ? modelOrder(result.agg) : strengthOrder()));
  const [quick, setQuick] = useState(initial?.quick ?? false);
  const [picks, setPicks] = useState<KoPicks>(initial?.picks ?? {});
  const [assign, setAssign] = useState<Record<string, Bucket>>(() => assignFrom(initial?.order ?? order));
  const [step, setStep] = useState<1 | 2 | 3>(() => {
    const s = Number(params.get("step"));
    return s === 2 || s === 3 ? (s as 2 | 3) : 1;
  });
  const [msg, setMsg] = useState("");
  const copy = useCopy();
  const touched = useRef(!!initial);

  // Until the user edits, follow the model's order once a simulation lands.
  useEffect(() => {
    if (!touched.current && result) setOrder(modelOrder(result.agg));
  }, [result]);

  const entry: Entry = { order, quick, picks };
  const ub = useMemo(() => userBracket(order, picks, drawSeed), [order, picks, drawSeed]);

  const shareUrl = () => {
    const u = new URL(window.location.href);
    u.searchParams.set("mode", "full");
    u.searchParams.set("b", encodeEntry(entry));
    u.searchParams.set("d", drawSeed);
    u.searchParams.set("step", String(step));
    return u.toString();
  };
  const go = (s: 1 | 2 | 3) => {
    setStep(s);
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.set("mode", "full");
        n.set("step", String(s));
        n.set("b", encodeEntry(entry));
        n.set("d", drawSeed);
        return n;
      },
      { replace: true },
    );
    window.scrollTo(0, 0);
  };
  const doCopy = async () => setMsg((await copy(shareUrl())) ? "Link copied to clipboard" : "Couldn't copy. Use the address bar.");
  const edit = (o: string[]) => {
    touched.current = true;
    setOrder(o);
  };

  return (
    <div className="stack">
      <PageHead
        title="Play the whole season"
        meta="The full run: your league table, every knockout tie, then a graded report."
        actions={
          <div className="steps" aria-label="Progress">
            {["League phase", "Knockouts", "Report"].map((l, i) => (
              <span key={l} className={step === i + 1 ? "on" : step > i + 1 ? "done" : ""} aria-current={step === i + 1 ? "step" : undefined}>{i + 1} · {l}</span>
            ))}
          </div>
        }
      />
      <p className="small muted" aria-live="polite">{msg}</p>
      {step === 1 && (
        <LeagueStep
          order={order} quick={quick} setOrder={edit} assign={assign}
          setQuick={(q) => {
            if (q) setAssign(assignFrom(order));
            setQuick(q);
          }}
          setAssign={(a) => {
            touched.current = true;
            setAssign(a);
            if (assignValid(a)) setOrder(orderFrom(order, a));
          }}
          reset={() => {
            const o = result ? modelOrder(result.agg) : strengthOrder();
            edit(o);
            setAssign(assignFrom(o));
          }}
          next={() => go(2)}
        />
      )}
      {step === 2 && (
        <KnockoutStep
          order={order} picks={picks} setPicks={setPicks} ub={ub} drawSeed={drawSeed}
          back={() => go(1)} next={() => go(3)} copy={doCopy}
        />
      )}
      {step === 3 && <ReportStep entry={entry} drawSeed={drawSeed} tweak={() => go(2)} share={doCopy} />}
    </div>
  );
}

// ------------------------------------------------------------------ step 1
const TARGET: Record<Bucket, number> = { top8: 8, playoff: 16, out: 12 };
const assignFrom = (order: string[]) => Object.fromEntries(order.map((c, i) => [c, bucketOf(i + 1)])) as Record<string, Bucket>;
const assignValid = (a: Record<string, Bucket>) =>
  (Object.keys(TARGET) as Bucket[]).every((b) => Object.values(a).filter((x) => x === b).length === TARGET[b]);
const orderFrom = (order: string[], a: Record<string, Bucket>) =>
  (["top8", "playoff", "out"] as Bucket[]).flatMap((b) => order.filter((c) => a[c] === b));

function LeagueStep({ order, quick, setQuick, setOrder, assign, setAssign, reset, next }: {
  order: string[]; quick: boolean; setQuick: (q: boolean) => void; setOrder: (o: string[]) => void;
  assign: Record<string, Bucket>; setAssign: (a: Record<string, Bucket>) => void; reset: () => void; next: () => void;
}) {
  const ok = !quick || assignValid(assign);
  return (
    <div className="card">
      <div className="row between" style={{ marginBottom: 12 }}>
        <div>
          <h2>League phase</h2>
          <p className="small muted">
            {quick ? "Drop each club into a bucket: 8 to the last 16, 16 to the play-off, 12 out." : "Drag clubs into your predicted 1–36 order, or use the arrows. Hover or focus a club to see its 8 drawn opponents."}
          </p>
        </div>
        <div className="row">
          <Seg label="Mode" value={quick ? "quick" : "full"} onChange={(v) => setQuick(v === "quick")} items={[{ id: "full", label: "Full order" }, { id: "quick", label: "Quick mode" }]} />
          <button className="btn small" onClick={reset}>Reset to model order</button>
        </div>
      </div>
      {quick ? <Buckets order={order} assign={assign} setAssign={setAssign} /> : <OrderList order={order} setOrder={setOrder} />}
      <div className="row" style={{ marginTop: 16, justifyContent: "flex-end" }}>
        <button className="btn primary" onClick={next} disabled={!ok}>{ok ? <>Next: knockouts <ArrowRight size={15} aria-hidden="true" /></> : "Buckets need 8 / 16 / 12"}</button>
      </div>
    </div>
  );
}

function OrderList({ order, setOrder }: { order: string[]; setOrder: (o: string[]) => void }) {
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [tip, setTip] = useState<string | null>(null);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return;
    const o = [...order];
    const [x] = o.splice(from, 1);
    o.splice(to, 0, x);
    setOrder(o);
  };
  const onDrop = (e: DragEvent, i: number) => {
    e.preventDefault();
    if (drag !== null) move(drag, i);
    setDrag(null);
    setOver(null);
  };
  return (
    <ol className="order-list" aria-label="League phase order">
      {order.map((c, i) => {
        const b = bucketOf(i + 1);
        return (
          <li key={c} style={{ listStyle: "none" }}>
            {(i === 0 || i === 8 || i === 24) && <div className={`zone-label ${b}`}>{b === "top8" ? "1–8 · Round of 16" : b === "playoff" ? "9–24 · Knockout play-off" : "25–36 · Eliminated"}</div>}
            <div
              className={`order-item ${b}${over === i ? " drag-over" : ""}${drag === i ? " dragging" : ""}`}
              draggable
              onDragStart={() => setDrag(i)}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(i);
              }}
              onDragLeave={() => setOver((o) => (o === i ? null : o))}
              onDrop={(e) => onDrop(e, i)}
              onDragEnd={() => {
                setDrag(null);
                setOver(null);
              }}
              onMouseEnter={() => setTip(c)}
              onMouseLeave={() => setTip(null)}
            >
              <span className="p">{i + 1}</span>
              <span className="handle" aria-hidden="true"><GripVertical size={16} /></span>
              <span tabIndex={0} onFocus={() => setTip(c)} onBlur={() => setTip(null)}><Club code={c} /></span>
              <span className="small faint">Pot {CLUB[c].pot}</span>
              <span className="mv">
                <button aria-label={`Move ${CLUB[c].name} up`} onClick={() => move(i, i - 1)} disabled={i === 0}><ChevronUp size={15} aria-hidden="true" /></button>
                <button aria-label={`Move ${CLUB[c].name} down`} onClick={() => move(i, i + 1)} disabled={i === order.length - 1}><ChevronDown size={15} aria-hidden="true" /></button>
              </span>
              {tip === c && <Opponents code={c} />}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Opponents({ code }: { code: string }) {
  return (
    <div className="tip" role="tooltip">
      <div className="kicker" style={{ marginBottom: 4 }}>{CLUB[code].short}'s 8 opponents</div>
      {OPPONENTS[code].map((o) => (
        <div key={o.opp} className="row between" style={{ gap: 6 }}>
          <span className="faint mono">MD{o.md}</span>
          <Club code={o.opp} short size={16} />
          <span className="faint">{o.home ? "H" : "A"} · P{CLUB[o.opp].pot}</span>
        </div>
      ))}
    </div>
  );
}

function Buckets({ order, assign, setAssign }: { order: string[]; assign: Record<string, Bucket>; setAssign: (a: Record<string, Bucket>) => void }) {
  const [over, setOver] = useState<Bucket | null>(null);
  const moveTo = (c: string, b: Bucket) => setAssign({ ...assign, [c]: b });
  const groups: Record<Bucket, string[]> = { top8: [], playoff: [], out: [] };
  order.forEach((c) => groups[assign[c]].push(c));
  const target = TARGET;
  return (
    <>
      <div className="buckets">
        {(Object.keys(groups) as Bucket[]).map((b) => (
          <div
            key={b}
            className={`bucket${over === b ? " over" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(b);
            }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const c = e.dataTransfer.getData("text/plain");
              if (CLUB[c]) moveTo(c, b);
            }}
          >
            <div className="row between" style={{ marginBottom: 8 }}>
              <strong className={`zone-label ${b}`} style={{ padding: 0 }}>{BUCKET_LABEL[b]}</strong>
              <span className={`small ${groups[b].length === target[b] ? "muted" : "pill bad"}`}>{groups[b].length} / {target[b]}</span>
            </div>
            <div className="chips">
              {groups[b].map((c) => (
                <span key={c} className="chip" draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", c)}>
                  <Club code={c} short size={16} />
                  <label className="vh" htmlFor={`bk-${c}`}>Bucket for {CLUB[c].name}</label>
                  <select id={`bk-${c}`} value={b} onChange={(e) => moveTo(c, e.target.value as Bucket)}>
                    <option value="top8">Top 8</option>
                    <option value="playoff">Play-off</option>
                    <option value="out">Out</option>
                  </select>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="small muted" style={{ marginTop: 8 }}>
        In quick mode only buckets are scored. Within a bucket, clubs keep the model's order for seeding the knockouts.
      </p>
    </>
  );
}

// ------------------------------------------------------------------ step 2
function KnockoutStep({ order, picks, setPicks, ub, drawSeed, back, next, copy }: {
  order: string[]; picks: KoPicks; setPicks: (p: KoPicks) => void; ub: ReturnType<typeof userBracket>; drawSeed: string;
  back: () => void; next: () => void; copy: () => void;
}) {
  const pos = Object.fromEntries(order.map((c, i) => [c, i + 1]));
  const pick = (t: BracketTie, c: string) => setPicks({ ...picks, [t.id]: c });
  const odds = (t: BracketTie, c: string) => {
    if (!t.a || !t.b) return null;
    if (t.id === "F") {
      const o = singleKnockoutOdds(t.a, t.b);
      return c === t.a ? o.a.total : o.b.total;
    }
    const [lo, hi] = pos[t.a] > pos[t.b] ? [t.a, t.b] : [t.b, t.a];
    const o = tieOdds(lo, hi);
    return c === lo ? o.a.total : o.b.total;
  };
  const col = (title: string, ties: BracketTie[]) => (
    <div className="bcol" style={{ minWidth: 170 }}>
      <h4>{title}</h4>
      {ties.map((t) => (
        <div className="pick-tie" key={t.id}>
          {[t.a, t.b].map((c, i) => {
            const p = c ? odds(t, c) : null;
            return (
              <button key={i} disabled={!c} aria-pressed={!!c && t.winner === c} onClick={() => c && pick(t, c)}>
                {c ? <span className="club"><span className="mono faint" style={{ fontSize: "0.68rem", width: 16 }}>{pos[c]}</span><Club code={c} short size={16} /></span> : <span className="faint">TBD</span>}
                {p !== null && <span className="pct">{fmtPct(p, 0)}</span>}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
  const complete = isComplete(ub);
  return (
    <div className="card">
      <div className="row between" style={{ marginBottom: 12 }}>
        <div>
          <h2>Knockouts</h2>
          <p className="small muted">
            Built from your table on UEFA's seeded paths. Where UEFA draws between two slots, the draw is fixed by bracket seed <span className="mono">{drawSeed}</span>. Click the winner of every tie; percentages are the model's odds of advancing.
          </p>
        </div>
        <div className="row">
          <button className="btn small" onClick={() => setPicks(favouritePicks(order, drawSeed))}>Fill with favourites</button>
          <button className="btn small" onClick={copy}>Copy link</button>
          <button className="btn small" onClick={() => setPicks({})}>Clear</button>
        </div>
      </div>
      <div className="scroll-x">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(170px, 1fr))", gap: 10, minWidth: 1050 }}>
          {col("Play-off", ub.r16.map((r) => ub.po.find((p) => p.id === r.from![0])!))}
          {col("Round of 16", ub.r16)}
          {col("Quarter-finals", ub.qf)}
          {col("Semi-finals", ub.sf)}
          {col("Final", [ub.final])}
          <div className="bcol">
            <h4>Champion</h4>
            {ub.final.winner ? (
              <div className="champ-banner">
                <span className="kicker">Champions</span>
                <div style={{ display: "flex", justifyContent: "center", marginTop: 6 }}><Club code={ub.final.winner} bold /></div>
              </div>
            ) : (
              <div className="bucket" style={{ minHeight: 0, textAlign: "center" }}><span className="small muted">Pick a champion</span></div>
            )}
          </div>
        </div>
      </div>
      <div className="row between" style={{ marginTop: 16 }}>
        <button className="btn" onClick={back}><ArrowLeft size={15} aria-hidden="true" /> Back</button>
        <button className="btn primary" onClick={next} disabled={!complete}>{complete ? <>Run my prediction <ArrowRight size={15} aria-hidden="true" /></> : "Pick every tie to continue"}</button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ step 3
function ReportStep({ entry, drawSeed, tweak, share }: { entry: Entry; drawSeed: string; tweak: () => void; share: () => void }) {
  const { result, run, status } = useSim();
  const rep = useMemo(() => (result ? grade(entry, drawSeed, result.sims) : null), [result, entry.order.join(), entry.quick, JSON.stringify(entry.picks), drawSeed]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!rep || !result) return <Empty title="Run a simulation to grade your bracket">Your bracket is scored against every simulated season.</Empty>;
  const stage = (lvl: number) => reachLabel(lvl);
  return (
    <div className="stack">
      <div className="grid g2">
        <div className="card">
          <div className="row" style={{ gap: 20, flexWrap: "nowrap" }}>
            <div className="grade" role="img" aria-label={`Grade ${rep.grade}`}>{rep.grade}</div>
            <div>
              <h2>{rep.gradeLabel}</h2>
              <p className="small muted" style={{ marginTop: 4 }}>Graded across {rep.runs.toLocaleString("en-GB")} simulated seasons (seed <span className="mono">{result.seed}</span>).</p>
            </div>
          </div>
          <div className="tiles" style={{ marginTop: 16 }}>
            <div className="tile"><div className="v">{rep.expUser.toFixed(1)}</div><div className="l">your expected points</div></div>
            <div className="tile"><div className="v">{rep.expChalk.toFixed(1)}</div><div className="l">favourites' expected points</div></div>
            <div className="tile"><div className="v">{fmtPct(rep.pBeatChalk, 0)}</div><div className="l">chance you beat the favourites</div></div>
            <div className="tile"><div className="v">{rep.best}</div><div className="l">your best-case score</div></div>
          </div>
        </div>
        <div className="card">
          <h3>Your champion</h3>
          {rep.champion && (
            <div className="row" style={{ marginTop: 10, gap: 12 }}>
              <Club code={rep.champion} size={40} bold />
              <Stamp label="Model rank" value={`#${rep.champRank}`} tilt={-3} />
            </div>
          )}
          <p style={{ marginTop: 10 }}>
            <strong>{fmtPct(rep.champPct)}</strong> to lift it, <strong>#{rep.champRank}</strong> on the model's board.
          </p>
          <div className="tiles">
            <div className="tile"><div className="v">1 in {formatBig(1 / Math.max(rep.perfectOdds, 1e-300))}</div><div className="l">perfect bracket: every bucket and every tie</div></div>
            <div className="tile"><div className="v">1 in {formatBig(1 / rep.perfectKoOdds)}</div><div className="l">every knockout tie as picked, given your table</div></div>
            <div className="tile"><div className="v">{rep.within2.toFixed(1)} / 36</div><div className="l">clubs expected within ±2 places{entry.quick ? " (not scored in quick mode)" : ""}</div></div>
            <div className="tile"><div className="v">{rep.bucketed.toFixed(1)} / 36</div><div className="l">clubs expected in the right bucket</div></div>
          </div>
        </div>
      </div>

      <div className="grid g3">
        <div className="card">
          <h3>Your bracket vs the favourites</h3>
          <table style={{ marginTop: 8 }}>
            <thead><tr><th /><th className="num">You</th><th className="num">Favourites</th></tr></thead>
            <tbody>
              <tr><td>League phase</td><td className="num">{rep.expUserLeague.toFixed(1)}</td><td className="num">{rep.expChalkLeague.toFixed(1)}</td></tr>
              <tr><td>Knockouts</td><td className="num">{rep.expUserKo.toFixed(1)}</td><td className="num">{rep.expChalkKo.toFixed(1)}</td></tr>
              <tr><td><strong>Total</strong></td><td className="num"><strong>{rep.expUser.toFixed(1)}</strong></td><td className="num"><strong>{rep.expChalk.toFixed(1)}</strong></td></tr>
            </tbody>
          </table>
          <p className="small muted" style={{ marginTop: 10 }}>
            Scoring: right bucket {SCORING.bucket} per club; exact place +{SCORING.exact}, within 2 places +{SCORING.near}. Each club you correctly put in the last 16 {SCORING.r16}, QF {SCORING.qf}, SF {SCORING.sf}, final {SCORING.final}, champion {SCORING.champion}. Favourites = model order plus the favourite in every tie.
          </p>
        </div>
        <div className="card">
          <h3>Model's title race</h3>
          <div style={{ marginTop: 10 }}>
            <OddsList rows={rep.titleRace} tag={(c) => (c === rep.champion ? <span className="pill gold">Your pick</span> : null)} />
          </div>
        </div>
        <div className="card">
          <h3>Your final four</h3>
          <div className="odds-list" style={{ marginTop: 10 }}>
            {rep.finalFour.map((r) => (
              <div key={r.code} className="row between"><Club code={r.code} /><span>{fmtPct(r.p, 0)} reach SF</span></div>
            ))}
          </div>
          <h3 style={{ marginTop: 16 }}>Your finalists</h3>
          <div className="odds-list" style={{ marginTop: 10 }}>
            {rep.finalists.map((r) => (
              <div key={r.code} className="row between"><Club code={r.code} /><span>{fmtPct(r.p, 0)} reach final</span></div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid g2">
        {rep.safest && (
          <div className="card">
            <h3>Safest pick</h3>
            <p style={{ marginTop: 8 }}><Club code={rep.safest.code} bold /> to reach {stage(rep.safest.stage)}: <strong>{fmtPct(rep.safest.p)}</strong>.</p>
          </div>
        )}
        {rep.gamble && (
          <div className="card">
            <h3>Biggest gamble</h3>
            <p style={{ marginTop: 8 }}><Club code={rep.gamble.code} bold /> to reach {stage(rep.gamble.stage)}: <strong>{fmtPct(rep.gamble.p)}</strong>.</p>
          </div>
        )}
      </div>

      <div className="card">
        <h3>Bucket by bucket</h3>
        <p className="small muted">Where your calls agree with the model's most likely bucket, and where you go against it. Percentages are the model's chance each club lands in the bucket you chose.</p>
        <div className="grid g3" style={{ marginTop: 10 }}>
          {(["top8", "playoff", "out"] as Bucket[]).map((b) => (
            <div key={b}>
              <div className={`zone-label ${b}`}>{BUCKET_LABEL[b]} · {rep.buckets[b].filter((x) => x.agree).length}/{rep.buckets[b].length} agree</div>
              <div className="odds-list">
                {rep.buckets[b].map((x) => (
                  <div key={x.code} className="row between" style={{ gap: 6, flexWrap: "nowrap" }}>
                    <Club code={x.code} short size={16} />
                    <div style={{ flex: 1, minWidth: 40 }}><Bar value={x.p} /></div>
                    <span className="small" style={{ width: 40, textAlign: "right" }}>{fmtPct(x.p, 0)}</span>
                    {!x.agree && <span className="pill warn" title={`Model favours ${BUCKET_LABEL[x.modelBucket]}`}>vs {BUCKET_LABEL[x.modelBucket]}</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="row">
        <button className="btn" onClick={tweak}>Tweak my bracket</button>
        <button className="btn" onClick={share}>Share bracket</button>
        <button className="btn primary" onClick={() => run({ fresh: true })} disabled={status === "running"}>Re-run</button>
      </div>
    </div>
  );
}
