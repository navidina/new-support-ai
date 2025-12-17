
import { getSettings } from './settings';
import { KnowledgeChunk } from '../types';

// ==========================================
// CONNECTION HEALTH CHECK
// ==========================================

export const checkOllamaConnection = async (): Promise<boolean> => {
    try {
        const settings = getSettings();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000); 
        
        const response = await fetch(`${settings.ollamaBaseUrl}/`, { 
            method: 'GET',
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response.ok;
    } catch (e) {
        return false;
    }
};

/**
 * Sends a dummy request to ensure the model is loaded in VRAM.
 */
export const preWarmModel = async (): Promise<boolean> => {
    try {
        const settings = getSettings();
        await fetch(`${settings.ollamaBaseUrl}/api/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: settings.embeddingModel,
                prompt: "warmup",
            }),
        });
        return true;
    } catch (e) {
        console.warn("Model pre-warm failed", e);
        return false;
    }
};

/**
 * Clean text specifically for embedding generation.
 */
const sanitizeForEmbedding = (text: string): string => {
    if (!text) return "";
    return text
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, "") // Remove control chars
        .replace(/\s+/g, " ")
        .trim();
};

export const getEmbedding = async (text: string, isQuery: boolean = false): Promise<number[]> => {
  const settings = getSettings();
  
  if (!text || !text.trim()) {
      return new Array(1024).fill(0);
  }

  // Truncate to safe limit (approx 2048 chars)
  const processedText = sanitizeForEmbedding(text).substring(0, 2048);
  
  let prompt = processedText;

  // Formatting logic based on Model Type
  if (settings.embeddingModel.includes('intfloat-multilingual-e5-large-instruct')) {
      // Specific logic for intfloat-multilingual-e5-large-instruct
      if (isQuery) {
          // Structure: Instruct: {task_description}\nQuery: {query}
          const taskDescription = "Given a web search query, retrieve relevant passages that answer the query";
          prompt = `Instruct: ${taskDescription}\nQuery: ${processedText}`;
      } else {
          // Documents do not need any special structure
          prompt = processedText;
      }
  } else if (settings.embeddingModel.includes('nomic')) {
      // Nomic specific prefixes
      prompt = (isQuery ? 'search_query: ' : 'search_document: ') + processedText;
  } else {
      // Fallback/Generic E5
      prompt = (isQuery ? 'query: ' : 'passage: ') + processedText;
  }
  
  try {
      const response = await fetch(`${settings.ollamaBaseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: settings.embeddingModel,
          prompt: prompt,
        }),
      });

      if (!response.ok) {
          throw new Error(`Ollama API Error (${response.status})`);
      }

      const data = await response.json();
      if (!data.embedding || !Array.isArray(data.embedding)) {
          throw new Error("Invalid response format");
      }
      
      // Safety check for NaN values in embedding vector
      if (data.embedding.some((n: any) => isNaN(n))) {
          console.error("Embedding contained NaN values");
          return new Array(1024).fill(0);
      }
      
      return data.embedding;

  } catch (error: any) {
      console.error(`Embedding failed:`, error.message);
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
          throw new Error("OLLAMA_CONNECTION_REFUSED");
      }
      return new Array(1024).fill(0);
  }
};

export const generateSynthesizedDocument = async (
    topicTitle: string, 
    chunks: KnowledgeChunk[],
    onProgress?: (current: number, total: number, phase: string) => void
): Promise<string> => {
    const settings = getSettings();
    const uniqueChunks = Array.from(new Set(chunks)).sort((a, b) => a.source.id.localeCompare(b.source.id));
    const BATCH_SIZE = 10;
    const totalBatches = Math.ceil(uniqueChunks.length / BATCH_SIZE);
    
    let finalDocument = "";
    
    for (let i = 0; i < totalBatches; i++) {
        const start = i * BATCH_SIZE;
        const end = start + BATCH_SIZE;
        const batchChunks = uniqueChunks.slice(start, end);
        
        const combinedContext = batchChunks.map(c => `[منبع: ${c.source.id}]\n${c.content}`).join('\n\n');
        
        if (onProgress) onProgress(i + 1, totalBatches, "Generating...");

        // UPDATED: Strict Persian Instructions
        let systemInstruction = `تو یک نویسنده فنی متخصص هستی. وظیفه تو نگارش مستندات فنی به زبان فارسی است. در مورد موضوع "${topicTitle}" یک متن جامع بنویس.`;
        if (i === 0) systemInstruction += " متن را با یک مقدمه مناسب شروع کن.";
        
        try {
            const response = await fetch(`${settings.ollamaBaseUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: settings.chatModel,
                    stream: false,
                    messages: [
                        { role: 'system', content: systemInstruction },
                        { role: 'user', content: `مستندات مرجع:\n${combinedContext}\n\nدستور کار: با توجه به مستندات بالا، متن بخش مربوطه را به زبان فارسی بنویس.` }
                    ],
                    options: { num_ctx: 4096 }
                }),
            });

            if (!response.ok) throw new Error("Generation failed");
            const data = await response.json();
            finalDocument += (data.message?.content || "") + "\n\n";

        } catch (error) {
            console.error(error);
            finalDocument += "\n[خطا در تولید بخش]\n";
        }
    }
    
    return finalDocument;
};
