/* ═══════════════════════════════════════════════════════════
   THE AXIOM — Transformers Singleton (Worker-based)
   Handles embeddings off-thread for maximum UI performance.
   ═══════════════════════════════════════════════════════════ */

let worker: Worker | null = null;
let currentPromiseRes: ((val: number[]) => void) | null = null;
let currentPromiseRej: ((err: string) => void) | null = null;
let currentProgressCb: ((msg: string) => void) | null = null;
let initPromiseRes: (() => void) | null = null;

function getWorker(): Worker {
  if (worker) return worker;
  if (typeof window === "undefined") throw new Error("Worker only available in browser");

  worker = new Worker('/embedding-worker.js', { type: 'module' });
  worker.onmessage = (e) => {
    const { status, message, result, error } = e.data;
    if (status === 'progress' && currentProgressCb) currentProgressCb(message);
    if (status === 'ready' && initPromiseRes) initPromiseRes();
    if (status === 'complete' && currentPromiseRes) currentPromiseRes(result);
    if (status === 'error' && currentPromiseRej) currentPromiseRej(error);
  };
  return worker;
}

export async function initEmbeddingWorker(onProgress?: (msg: string) => void): Promise<void> {
  const w = getWorker();
  currentProgressCb = onProgress || null;
  
  return new Promise((res, rej) => {
    initPromiseRes = res;
    currentPromiseRej = rej;
    w.postMessage({ type: 'init' });
  });
}

export async function getEmbedding(text: string | string[]): Promise<number[]> {
  const w = getWorker();
  return new Promise((res, rej) => {
    currentPromiseRes = res;
    currentPromiseRej = rej;
    w.postMessage({ type: 'embed', text });
  });
}
