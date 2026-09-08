/**
 * The arrange, off the main thread.
 *
 * A judged arrange is dozens of route solves - half a minute on a busy
 * board - and half a minute on the main thread is a frozen tab. So the
 * board posts the job to a worker (`arrange.worker.ts`), shows its
 * progress, and applies the layout when it lands. One job at a time; a
 * second click while one runs is ignored by the caller. No Worker (SSR,
 * tests, a worker that cannot start): the same pure function runs here.
 */
import {
  runArrangeJob,
  type ArrangeJob,
  type ArrangeJobResult,
  type ArrangeProgress,
} from "./arrange-job";

export type { ArrangeJob, ArrangeJobResult, ArrangeProgress } from "./arrange-job";

let worker: Worker | undefined;
let workerBroken = false;
let seq = 0;

/** Whether an arrange can leave the main thread at all. */
export function arrangeWorkerAvailable(): boolean {
  return !workerBroken && typeof Worker !== "undefined";
}

/**
 * Runs the job in the worker (or here, when there is none) and resolves
 * with its result. Progress arrives on `onProgress` as it happens.
 */
export function arrangeInWorker(
  job: Omit<ArrangeJob, "seq">,
  onProgress?: (progress: ArrangeProgress) => void,
): Promise<ArrangeJobResult> {
  seq += 1;
  const full: ArrangeJob = { ...job, seq };
  if (!arrangeWorkerAvailable()) {
    return Promise.resolve(runArrangeJob(full, onProgress));
  }
  return new Promise((resolve) => {
    let target: Worker;
    try {
      target = getWorker();
    } catch (error) {
      console.error("arrange worker failed to start; arranging on the main thread", error);
      workerBroken = true;
      resolve(runArrangeJob(full, onProgress));
      return;
    }
    const onMessage = (
      event: MessageEvent<{ progress?: ArrangeProgress; done?: ArrangeJobResult; error?: string }>,
    ) => {
      const data = event.data;
      if (data.progress) {
        if (data.progress.seq === full.seq) onProgress?.(data.progress);
        return;
      }
      target.removeEventListener("message", onMessage);
      target.removeEventListener("error", onError);
      if (data.done && data.done.seq === full.seq) {
        resolve(data.done);
      } else {
        console.error("arrange worker error:", data.error ?? "unknown");
        resolve(runArrangeJob(full, onProgress));
      }
    };
    const onError = (event: ErrorEvent) => {
      target.removeEventListener("message", onMessage);
      target.removeEventListener("error", onError);
      console.error("arrange worker broke; arranging on the main thread", event.message);
      workerBroken = true;
      resolve(runArrangeJob(full, onProgress));
    };
    target.addEventListener("message", onMessage);
    target.addEventListener("error", onError);
    target.postMessage(full);
  });
}

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./arrange.worker.ts", import.meta.url));
  }
  return worker;
}
