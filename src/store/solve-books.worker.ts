import { calculateThroughput } from "@/lib/solver";
import { initLpEngine } from "@/lib/solver/lp-engine";
import { attachClogLocks } from "@/components/flow/clog-lock";
import type { FactoryProject } from "@/lib/model/types";

// HiGHS loads once at worker startup, and every solve waits for the load to
// settle: a board routed here is slow by definition, so a one-time wasm
// fetch is always the better trade than a minutes-long homegrown walk. A
// failed load resolves too - solves then run on the homegrown simplex.
const engineReady = initLpEngine({ glueUrl: "/highs.js", wasmUrl: "/highs.wasm" });

/**
 * The solver, off the main thread. One message in (a plan and the content key
 * that names it), one message out (the same key and the finished books). The
 * scheduling - coalescing rapid edits, dropping superseded solves, deciding
 * which result is still current - all lives on the store side in
 * `solve-books.ts`; this file stays a dumb calculator on purpose.
 */
self.onmessage = async (event: MessageEvent<{ key: string; project: FactoryProject }>) => {
  const { key, project } = event.data;
  try {
    await engineReady;
    const started = performance.now();
    const result = calculateThroughput(project);
    // The clog-lock proof is a second LP over the same board, and on a plan
    // with many stopped machines a harder one than the books (18 s against
    // 11 s on a 236-card plan, homegrown): it runs here, on HiGHS, and rides
    // back on the books so the board never proves it on the main thread.
    attachClogLocks(project, result);
    // The solve's own cost rides back so the router can learn whether this
    // board is one that must stay off the main thread - the diagnosis
    // counts, since a board slow only in its proof must stay here too.
    self.postMessage({ key, result, solveMs: performance.now() - started });
  } catch (error) {
    self.postMessage({ key, error: error instanceof Error ? error.message : String(error) });
  }
};
