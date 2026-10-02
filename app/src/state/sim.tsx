// Global simulation state. Settings live in the URL (?seed=…&runs=…&asof=…) so every view is
// shareable and reproducible; results come from a pool of Web Workers.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { CHUNK, finalize, type Aggregate, type ChunkRaw, type Sims } from "../engine/aggregate";
import { randomSeed } from "../engine/rng";
import type { AsOf, Season } from "../engine/season";
import type { WorkerRequest } from "../engine/worker";

export const RUN_OPTIONS = [5000, 10000, 25000, 50000];
export const DEFAULT_RUNS = 10000;

type Status = "idle" | "running" | "done";
export type SimResult = { seed: string; runs: number; asOf: AsOf; agg: Aggregate; sims: Sims; featured: Season; ms: number };

type Ctx = {
  seed: string | null;
  runs: number;
  asOf: AsOf;
  status: Status;
  progress: number; // 0..1
  result: SimResult | null;
  run: (opts?: { fresh?: boolean; runs?: number; asOf?: AsOf }) => void;
  setRuns: (n: number) => void;
  setAsOf: (a: AsOf) => void;
  /** Query string (with leading ?) carrying the current settings, for links. */
  qs: string;
};

const SimContext = createContext<Ctx | null>(null);

class Pool {
  workers: Worker[];
  constructor() {
    const n = Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 4) - 1));
    this.workers = Array.from({ length: n }, () => new Worker(new URL("../engine/worker.ts", import.meta.url), { type: "module" }));
  }
  terminate() {
    this.workers.forEach((w) => w.terminate());
  }
}

export function SimProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useSearchParams();
  const seed = params.get("seed");
  const runsParam = Number(params.get("runs"));
  const runs = RUN_OPTIONS.includes(runsParam) ? runsParam : DEFAULT_RUNS;
  const asOf: AsOf = params.get("asof") === "pre" ? "pre" : "live";

  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<SimResult | null>(null);
  const pool = useRef<Pool | null>(null);
  const job = useRef(0);

  const start = useCallback((s: string, n: number, a: AsOf) => {
    const id = ++job.current;
    pool.current?.terminate();
    const p = new Pool();
    pool.current = p;
    setStatus("running");
    setProgress(0);
    const t0 = performance.now();
    const nChunks = Math.ceil(n / CHUNK);
    const chunks: ChunkRaw[] = new Array(nChunks);
    let featured: Season | null = null;
    let done = 0;
    let next = 0;
    const finish = () => {
      if (id !== job.current || !featured || done < nChunks) return;
      const { agg, sims } = finalize(s, a, chunks);
      setResult({ seed: s, runs: n, asOf: a, agg, sims, featured, ms: performance.now() - t0 });
      setStatus("done");
      setProgress(1);
      p.terminate();
      if (pool.current === p) pool.current = null;
    };
    const dispatch = (w: Worker) => {
      if (next >= nChunks) return;
      const c = next++;
      const msg: WorkerRequest = { type: "chunk", id, seed: s, chunk: c, runs: Math.min(CHUNK, n - c * CHUNK), asOf: a };
      w.postMessage(msg);
    };
    p.workers.forEach((w, i) => {
      w.onmessage = (ev) => {
        const m = ev.data;
        if (m.id !== id) return;
        if (m.type === "featured") featured = m.season;
        else {
          chunks[m.chunk] = m.raw;
          done++;
          setProgress(done / nChunks);
          dispatch(w);
        }
        finish();
      };
      if (i === 0) w.postMessage({ type: "featured", id, seed: s, asOf: a } satisfies WorkerRequest);
      dispatch(w);
    });
  }, []);

  useEffect(() => () => pool.current?.terminate(), []);

  // Settings in the URL drive runs: whenever seed/runs/asOf change, (re)compute.
  useEffect(() => {
    if (!seed) return;
    if (result && result.seed === seed && result.runs === runs && result.asOf === asOf) return;
    start(seed, runs, asOf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, runs, asOf]);

  const update = useCallback(
    (patch: Record<string, string>) => {
      setParams(
        (prev) => {
          const n = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) n.set(k, v);
          return n;
        },
        { replace: false },
      );
    },
    [setParams],
  );

  const run = useCallback<Ctx["run"]>(
    (opts) => {
      const s = opts?.fresh || !seed ? randomSeed() : seed;
      const patch: Record<string, string> = { seed: s };
      if (opts?.runs) patch.runs = String(opts.runs);
      if (opts?.asOf) patch.asof = opts.asOf;
      if (s === seed && (!opts?.runs || opts.runs === runs) && (!opts?.asOf || opts.asOf === asOf)) start(s, runs, asOf);
      else update(patch);
    },
    [seed, runs, asOf, start, update],
  );

  const qs = useMemo(() => {
    const n = new URLSearchParams();
    if (seed) n.set("seed", seed);
    if (runs !== DEFAULT_RUNS) n.set("runs", String(runs));
    if (asOf !== "live") n.set("asof", asOf);
    const s = n.toString();
    return s ? `?${s}` : "";
  }, [seed, runs, asOf]);

  const value: Ctx = {
    seed, runs, asOf, status, progress,
    result: result && result.seed === seed && result.runs === runs && result.asOf === asOf ? result : null,
    run,
    setRuns: (n) => update({ runs: String(n), ...(seed ? {} : { seed: randomSeed() }) }),
    setAsOf: (a) => update({ asof: a, ...(seed ? {} : { seed: randomSeed() }) }),
    qs,
  };
  return <SimContext.Provider value={value}>{children}</SimContext.Provider>;
}

export function useSim(): Ctx {
  const c = useContext(SimContext);
  if (!c) throw new Error("useSim outside SimProvider");
  return c;
}
