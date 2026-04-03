/* ═══════════════════════════════════════════════════════════
   THE AXIOM — Transformers Singleton
   Ensures the embedding model is loaded once and reused.
   ═══════════════════════════════════════════════════════════ */

type FeatureExtractionPipeline = {
  (inputs: string[], options?: Record<string, unknown>): Promise<{
    data?: Float32Array;
  }>;
};

type TransformersModule = {
  pipeline: (
    task: string,
    model: string,
    options?: Record<string, unknown>,
  ) => Promise<FeatureExtractionPipeline>;
};

let instance: FeatureExtractionPipeline | null = null;
let isLoading = false;

async function loadTransformers(): Promise<TransformersModule> {
  if (typeof window === 'undefined') {
    throw new Error('Embedding pipeline is only available in browser runtime.');
  }

  const mod = await import('@xenova/transformers');
  return { pipeline: mod.pipeline };
}

export async function getEmbeddingPipeline(onProgress?: (progress: string) => void): Promise<FeatureExtractionPipeline> {
  if (instance) return instance;
  if (isLoading) {
    // Poll until ready
    while (isLoading) {
      await new Promise(r => setTimeout(r, 100));
    }
    if (instance) return instance;
  }

  isLoading = true;
  try {
    const { pipeline } = await loadTransformers();

    instance = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      progress_callback: (p: any) => {
        if (p.status === 'downloading' && onProgress) {
          onProgress(`Downloading ${p.file} — ${Math.round((p.loaded / p.total) * 100)}%`);
        }
      }
    });
    isLoading = false;
    return instance!;
  } catch (err) {
    isLoading = false;
    console.error('Failed to load embedding pipeline:', err);
    throw err;
  }
}
