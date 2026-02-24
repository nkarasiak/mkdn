let pipeline = null;
let modelLoading = false;
let modelReady = false;

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';

async function loadModel(onProgress) {
  if (modelReady && pipeline) return pipeline;
  if (modelLoading) {
    // Wait for existing load
    while (modelLoading) {
      await new Promise(r => setTimeout(r, 200));
    }
    return pipeline;
  }

  modelLoading = true;

  try {
    // Dynamic import to avoid bundling the large library
    const { pipeline: createPipeline } = await import('@huggingface/transformers');

    pipeline = await createPipeline('feature-extraction', MODEL_NAME, {
      progress_callback: onProgress || (() => {}),
    });

    modelReady = true;
    return pipeline;
  } catch (e) {
    console.error('Failed to load embedding model:', e);
    throw e;
  } finally {
    modelLoading = false;
  }
}

export const embeddingEngine = {
  isReady() {
    return modelReady;
  },

  isLoading() {
    return modelLoading;
  },

  async init(onProgress) {
    await loadModel(onProgress);
  },

  /**
   * Generate an embedding vector for the given text.
   * Returns a Float32Array.
   */
  async embed(text) {
    const pipe = await loadModel();

    // Truncate to ~512 tokens (~2000 chars) for the model
    const truncated = text.slice(0, 2000);

    const output = await pipe(truncated, {
      pooling: 'mean',
      normalize: true,
    });

    // output.data is a Float32Array of the embedding
    return new Float32Array(output.data);
  },

  /**
   * Generate embeddings for multiple texts in batch.
   */
  async embedBatch(texts) {
    const results = [];
    for (const text of texts) {
      results.push(await this.embed(text));
    }
    return results;
  },

  /**
   * Compute cosine similarity between two vectors.
   */
  cosineSimilarity(a, b) {
    if (a.length !== b.length) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  },
};
