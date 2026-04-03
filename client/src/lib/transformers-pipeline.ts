/* ═══════════════════════════════════════════════════════════
   THE AXIOM — Transformers Singleton
   Ensures the embedding model is loaded once and reused.
   ═══════════════════════════════════════════════════════════ */

import { pipeline, type FeatureExtractionPipeline } from '@xenova/transformers';

let instance: FeatureExtractionPipeline | null = null;
let isLoading = false;

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
