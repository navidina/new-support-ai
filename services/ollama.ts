
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

/**
 * Deep Synthesis Generation Strategy
 * Uses a "Senior Technical Writer" persona with structured prompt engineering.
 * 1. Sorts chunks logically (File -> Page -> Index).
 * 2. Uses Sliding Window context for coherence between batches.
 * 3. Enforces strict Markdown structure.
 */
export const generateSynthesizedDocument = async (
    topicTitle: string, 
    chunks: KnowledgeChunk[],
    onProgress?: (current: number, total: number, phase: string) => void
): Promise<string> => {
    const settings = getSettings();
    
    // 1. SMART SORTING: Sort by source ID, then page, then creation index
    // This helps maintain the logical flow of the original documents.
    const sortedChunks = Array.from(new Set(chunks)).sort((a, b) => {
        if (a.source.id !== b.source.id) return a.source.id.localeCompare(b.source.id);
        const pageA = a.source.page || 0;
        const pageB = b.source.page || 0;
        if (pageA !== pageB) return pageA - pageB;
        return (a.createdAt || 0) - (b.createdAt || 0);
    });

    // 2. Adaptive Batching
    // If chunks are few (<20), we send them all at once for best coherence.
    // If many, we batch them to respect context window.
    const BATCH_SIZE = 20; 
    const totalBatches = Math.ceil(sortedChunks.length / BATCH_SIZE);
    
    let finalDocument = "";
    let previousContextSummary = ""; // Sliding window context

    for (let i = 0; i < totalBatches; i++) {
        const start = i * BATCH_SIZE;
        const end = start + BATCH_SIZE;
        const batchChunks = sortedChunks.slice(start, end);
        
        // Prepare Context with Citation Markers
        const combinedContext = batchChunks.map(c => 
            `--- START OF CHUNK FROM [${c.source.id}] ---\n${c.content}\n--- END OF CHUNK ---`
        ).join('\n\n');
        
        if (onProgress) onProgress(i + 1, totalBatches, i === 0 ? "طراحی ساختار سند..." : "نگارش محتوا...");

        // 3. Structured Prompt Engineering
        let systemInstruction = `
تو یک "نویسنده فنی ارشد" (Senior Technical Writer) در یک شرکت نرم‌افزاری مالی هستی.
وظیفه: نگارش یک "سند جامع فنی" (Technical Documentation) به زبان فارسی درباره موضوع "${topicTitle}".

قوانین نگارش:
۱. **ساختار:** متن باید دارای تیترهای اصلی (H2) و فرعی (H3) باشد. از بولت پوینت برای لیست‌ها استفاده کن.
۲. **لحن:** رسمی، تخصصی و دقیق. از عبارات محاوره‌ای پرهیز کن.
۳. **استناد:** تمام مطالب باید از "مستندات مرجع" استخراج شوند. از اطلاعات خارج از متن استفاده نکن.
۴. **ارجاع:** در انتهای پاراگراف‌ها، منبع را به صورت [نام فایل] ذکر کن.
۵. **فرمت:** خروجی باید Markdown تمیز باشد.
۶. **یکپارچگی:** متن باید روان باشد، نه مجموعه‌ای از جملات گسسته. تکرارها را حذف کن.

${i === 0 ? `
ساختار مورد انتظار برای بخش اول:
- یک جدول "شناسنامه سند" (شامل عنوان، تاریخ تولید، و نویسنده: هوش مصنوعی).
- مقدمه اجرایی (Executive Summary): تعریف کلی موضوع.
- مفاهیم کلیدی: تعاریف پایه.` 
: 
`ادامه نگارش:
- ادامه مباحث قبلی را به صورت منطقی پی بگیرید.
- وارد جزئیات فنی، فرآیندها و جداول شوید.
- اگر به انتهای مبحث رسیدید، یک بخش "عیب‌یابی و مشکلات متداول" اضافه کنید.`}
`;

        let userPrompt = `مستندات مرجع جدید:\n${combinedContext}`;
        
        // Sliding Window: Provide context from previous generation
        if (previousContextSummary) {
            userPrompt = `خلاصه بخش‌های قبلی که نوشتی:\n${previousContextSummary}\n\n` + userPrompt;
        }

        userPrompt += `\n\nدستور کار: با استفاده از مستندات بالا، ${i === 0 ? 'بخش ابتدایی سند را بنویس.' : 'ادامه سند را بنویس و مباحث را تکمیل کن.'}`;

        try {
            const response = await fetch(`${settings.ollamaBaseUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: settings.chatModel,
                    stream: false,
                    messages: [
                        { role: 'system', content: systemInstruction },
                        { role: 'user', content: userPrompt }
                    ],
                    options: { 
                        num_ctx: 4096, // Request larger context window
                        temperature: 0.3 // Lower temp for factual consistency
                    }
                }),
            });

            if (!response.ok) throw new Error("Generation failed");
            const data = await response.json();
            const generatedText = data.message?.content || "";
            
            finalDocument += generatedText + "\n\n";
            
            // Keep the last 500 chars as context for the next batch to ensure continuity
            previousContextSummary = generatedText.slice(-500);

        } catch (error) {
            console.error(error);
            finalDocument += "\n\n> [خطا در تولید این بخش به دلیل عدم پاسخگویی مدل]\n\n";
        }
    }
    
    // Add Footer
    finalDocument += "\n\n---\n*این سند توسط سیستم هوشمند RAG رایان هم‌افزا به صورت خودکار تولید شده است.*";
    
    return finalDocument;
};
