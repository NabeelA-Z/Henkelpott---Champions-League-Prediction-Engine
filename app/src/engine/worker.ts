/// <reference lib="webworker" />
import { runChunk } from "./aggregate";
import { makeRng } from "./rng";
import { simulateSeason, type AsOf } from "./season";

export type WorkerRequest =
  | { type: "featured"; id: number; seed: string; asOf: AsOf }
  | { type: "chunk"; id: number; seed: string; chunk: number; runs: number; asOf: AsOf };

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;
  if (req.type === "featured") {
    const season = simulateSeason(makeRng(`${req.seed}/featured`), { asOf: req.asOf, detail: true });
    self.postMessage({ type: "featured", id: req.id, season });
  } else {
    const raw = runChunk(req.seed, req.chunk, req.runs, req.asOf);
    const transfer = [raw.reach, raw.posHist, raw.pts, raw.gTot, raw.aTot, raw.gShare, raw.aShare, raw.simPos, raw.simReach].map((a) => a.buffer);
    self.postMessage({ type: "chunk", id: req.id, chunk: req.chunk, raw }, transfer);
  }
};
