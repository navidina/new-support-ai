
import { getSettings } from './settings';

/**
 * Checks connection to LM Studio / OpenAI compatible API.
 * Uses /v1/models endpoint.
 */
export const checkOllamaConnection = async () => {
    try {
        const settings = getSettings();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); 
        
        // LM Studio exposes models at /v1/models
        // Removed Authorization header to avoid CORS errors with wildcard access-control-allow-headers
        const response = await fetch(`${settings.ollamaBaseUrl}/models`, { 
            method: 'GET', 
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        return response.ok;
    } catch (e) { return false; }
};

/**
 * Dummy pre-warm. For LM Studio, we just check connectivity.
 */
export const preWarmModel = async () => {
    return checkOllamaConnection();
};

/**
 * Fetches embeddings using OpenAI-compatible /v1/embeddings endpoint.
 */
export const getEmbedding = async (text: string, isQuery = false) => {
  const settings = getSettings();
  const modelName = settings.embeddingModel;
  
  if (!text || !text.trim()) return new Array(1024).fill(0);

  // Clean text from control characters
  const processedText = text.substring(0, 4000).replace(/[\u0000-\u001F\u007F-\u009F]/g, " ");

  try {
      const response = await fetch(`${settings.ollamaBaseUrl}/embeddings`, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json'
            // Authorization header removed to prevent CORS preflight failures on local networks
        },
        body: JSON.stringify({ 
            model: modelName, 
            input: processedText 
        }),
      });

      if (!response.ok) {
          console.error(`API Error (${response.status}): Check if model "${modelName}" is loaded in LM Studio.`);
          return new Array(1024).fill(0); 
      }
      
      const data = await response.json();
      // OpenAI format: data.data[0].embedding
      return data.data?.[0]?.embedding || new Array(1024).fill(0);
  } catch (error: any) {
      console.warn(`Embedding failed: ${error.message}. Returning zero-vector fallback.`);
      return new Array(1024).fill(0);
  }
};

/**
 * Calculates the cosine similarity between two vectors.
 */
export const cosineSimilarity = (vecA: number[], vecB: number[]) => {
    if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
};

export const generateSynthesizedDocument = async (topicTitle: string, chunks: any[], onProgress: any) => {
    const settings = getSettings();
    const sortedChunks = [...chunks].sort((a, b) => a.source.id.localeCompare(b.source.id));
    const BATCH_SIZE = 10;
    const totalBatches = Math.ceil(sortedChunks.length / BATCH_SIZE);
    let finalDocument = `# ${topicTitle}\n\n`;
    
    for (let i = 0; i < totalBatches; i++) {
        if (onProgress) onProgress(i + 1, totalBatches, `نگارش بخش ${i+1}...`);
        const context = sortedChunks.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE).map(c => c.content).join('\n\n');
        try {
            const res = await fetch(`${settings.ollamaBaseUrl}/chat/completions`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: settings.chatModel,
                    messages: [
                        { role: 'system', content: 'You are a technical writer. Summarize the following context into a clean Persian guide.' }, 
                        { role: 'user', content: context }
                    ],
                    stream: false,
                    temperature: 0.3
                }),
            });
            const data = await res.json();
            // OpenAI format: data.choices[0].message.content
            finalDocument += (data.choices?.[0]?.message?.content || "") + "\n\n";
        } catch (e) { 
            finalDocument += "\n[Error processing batch]\n"; 
        }
    }
    return finalDocument;
};
