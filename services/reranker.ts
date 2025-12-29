
// services/reranker.ts

// We use dynamic import with a direct URL to bypass Vite's dependency resolution
// because we are using an import map / CDN and the package is not in node_modules.
const TRANSFORMERS_URL = 'https://esm.sh/@xenova/transformers@2.17.2';

let tokenizer = null;
let model = null;
let transformers = null;

export const loadRerankerModel = async () => {
    if (!model) {
        console.log('Loading Reranker model...');
        try {
            // Load module dynamically
            if (!transformers) {
                // @ts-ignore
                transformers = await import(/* @vite-ignore */ TRANSFORMERS_URL);
                transformers.env.allowLocalModels = false;
                transformers.env.useBrowserCache = true;
            }

            const { AutoTokenizer, AutoModelForSequenceClassification } = transformers;
            const MODEL_ID = 'Xenova/bge-reranker-v2-m3';

            tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID);
            model = await AutoModelForSequenceClassification.from_pretrained(MODEL_ID, {
                quantized: true 
            });
            console.log('Reranker model loaded.');
        } catch (error) {
            console.error("Failed to load reranker model:", error);
            throw error;
        }
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
