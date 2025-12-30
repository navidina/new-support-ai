
// services/reranker.ts
import { getSettings } from './settings';

// We use dynamic import with a direct URL to bypass Vite's dependency resolution
// because we are using an import map / CDN and the package is not in node_modules.
const TRANSFORMERS_URL = 'https://esm.sh/@xenova/transformers@2.17.2';

let tokenizer = null;
let model = null;
let transformers = null;
let loadedModelId = '';

export const loadRerankerModel = async () => {
    const settings = getSettings();
    const currentModelId = settings.rerankerModel || 'Xenova/bge-reranker-v2-m3';

    // If model is already loaded and ID matches, return
    if (model && loadedModelId === currentModelId) {
        return;
    }

    // If ID changed or model not loaded, load/reload
    console.log(`Loading Reranker model: ${currentModelId}...`);
    try {
        // Load module dynamically if not already loaded
        if (!transformers) {
            // @ts-ignore
            transformers = await import(/* @vite-ignore */ TRANSFORMERS_URL);
            transformers.env.allowLocalModels = false;
            transformers.env.useBrowserCache = true;
        }

        const { AutoTokenizer, AutoModelForSequenceClassification } = transformers;

        // Dispose old model if exists (if method available, otherwise JS GC handles it eventually)
        // transformers.js models don't strictly require manual disposal in this context, just overwrite reference.
        tokenizer = null;
        model = null;

        tokenizer = await AutoTokenizer.from_pretrained(currentModelId);
        model = await AutoModelForSequenceClassification.from_pretrained(currentModelId, {
            quantized: true 
        });
        
        loadedModelId = currentModelId;
        console.log('Reranker model loaded.');
    } catch (error) {
        console.error("Failed to load reranker model:", error);
        throw error;
    }
};

/**
 * Reranks a list of chunks based on their semantic relevance to the query.
 * Uses a Cross-Encoder model.
 */
export const rerankChunks = async (query, chunks, topK = 5) => {
    await loadRerankerModel();

    if (!chunks || chunks.length === 0) return [];

    // Prepare pairs of (Query, Document)
    const inputs = await tokenizer(
        new Array(chunks.length).fill(query), // Repeat query for each chunk
        chunks.map(c => c.content),           // The content of the chunks
        { padding: true, truncation: true, return_tensors: 'pt' }
    );

    // Calculate scores
    const { logits } = await model(inputs);
    
    // Extract scores and apply Sigmoid to normalize between 0 and 1
    // logits.data is a Float32Array
    const scores = Array.from(logits.data).map((score) => 1 / (1 + Math.exp(-Number(score))));

    // Combine original chunk with new score
    const scoredChunks = chunks.map((chunk, index) => ({
        ...chunk,
        rerankScore: scores[index]
    }));

    // Sort descending by the new Reranker score (precision)
    scoredChunks.sort((a, b) => b.rerankScore - a.rerankScore);

    // Return top K
    return scoredChunks.slice(0, topK);
};
