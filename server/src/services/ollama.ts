import dotenv from 'dotenv';

dotenv.config();

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'mxbai-embed-large';
const CHAT_MODEL = process.env.CHAT_MODEL || 'llama3';

export const getEmbedding = async (text: string): Promise<number[]> => {
  if (!text || !text.trim()) return new Array(1024).fill(0);

  // Clean text from control characters
  const processedText = text.substring(0, 4000).replace(/[\u0000-\u001F\u007F-\u009F]/g, " ");

  try {
      const response = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, { // Correct endpoint for Ollama might be /api/embeddings or /v1/embeddings depending on version/compat
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: EMBEDDING_MODEL,
            prompt: processedText // Ollama native API uses prompt, OpenAI compat uses input
        }),
      });

      // Try OpenAI compatible endpoint if the above fails or check if we should default to one
      // The prompt uses /embeddings (OpenAI compat) in frontend code.
      // Let's stick to what was likely working or standard Ollama.
      // Frontend code used: `${settings.ollamaBaseUrl}/embeddings` with body { model, input } -> This suggests OpenAI compatibility mode of Ollama or LM Studio.

      // Let's try to match frontend logic which used /embeddings (OpenAI format)

      if (response.ok) {
        const data = await response.json();
         // Ollama native: data.embedding
         if (data.embedding) return data.embedding;
      }

      // Fallback to OpenAI compatible endpoint if the first one wasn't it or if we want to support both
      const responseOpenAI = await fetch(`${OLLAMA_BASE_URL}/v1/embeddings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: EMBEDDING_MODEL, input: processedText })
      });

      if (!responseOpenAI.ok) {
          console.error(`Embedding API Error: ${responseOpenAI.statusText}`);
          return new Array(1024).fill(0);
      }

      const data = await responseOpenAI.json();
      return data.data?.[0]?.embedding || new Array(1024).fill(0);

  } catch (error: any) {
      console.warn(`Embedding failed: ${error.message}. Returning zero-vector fallback.`);
      return new Array(1024).fill(0);
  }
};

export const chatCompletion = async (messages: any[], temperature: number = 0.7) => {
    try {
        const response = await fetch(`${OLLAMA_BASE_URL}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: CHAT_MODEL,
                messages,
                temperature,
                stream: false
            })
        });

        if (!response.ok) {
            throw new Error(`API Error ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content || "No response from model.";
    } catch (error) {
        console.error("Chat Completion Error:", error);
        throw error;
    }
};
