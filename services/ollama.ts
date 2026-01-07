
import { getSettings } from './settings';
import { KnowledgeChunk } from '../types';

// ==========================================
// CONNECTION HEALTH CHECK & UTILS
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

const sanitizeForEmbedding = (text: string): string => {
    if (!text) return "";
    return text.replace(/[\u0000-\u001F\u007F-\u009F]/g, "").replace(/\s+/g, " ").trim();
};

export const getEmbedding = async (text: string, isQuery: boolean = false): Promise<number[]> => {
  const settings = getSettings();
  if (!text || !text.trim()) return new Array(1024).fill(0);

  const processedText = sanitizeForEmbedding(text).substring(0, 2048);
  let prompt = processedText;

  if (settings.embeddingModel.includes('intfloat-multilingual-e5-large-instruct')) {
      if (isQuery) {
          const taskDescription = "Given a web search query, retrieve relevant passages that answer the query";
          prompt = `Instruct: ${taskDescription}\nQuery: ${processedText}`;
      }
  } else if (settings.embeddingModel.includes('nomic')) {
      prompt = (isQuery ? 'search_query: ' : 'search_document: ') + processedText;
  } else {
      prompt = (isQuery ? 'query: ' : 'passage: ') + processedText;
  }
  
  try {
      const response = await fetch(`${settings.ollamaBaseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: settings.embeddingModel, prompt: prompt }),
      });

      if (!response.ok) throw new Error(`Ollama API Error (${response.status})`);
      const data = await response.json();
      return data.embedding;
  } catch (error: any) {
      console.error(`Embedding failed:`, error.message);
      return new Array(1024).fill(0);
  }
};

// ==========================================
// DEEP SYNTHESIS ENGINE (PLANNER-WRITER ARCHITECTURE)
// ==========================================

/**
 * Phase 1: Blueprint Generation
 * Generates a logical Table of Contents based on available sources metadata.
 */
const generateBlueprint = async (topicTitle: string, chunks: KnowledgeChunk[]): Promise<string> => {
    const settings = getSettings();
    
    // Extract Metadata for the Planner (Titles and snippet beginnings)
    const sources = Array.from(new Set(chunks.map(c => c.source.id)));
    // We take a sample of content to give the planner an idea of what the topic covers
    const sampleContent = chunks.slice(0, 8).map(c => c.content.substring(0, 150)).join("... \n");
    
    const systemPrompt = `
تو "معمار اطلاعات" (Information Architect) هستی.
هدف: ایجاد یک "فهرست مطالب" (Outline) برای یک مستند فنی درباره "${topicTitle}".
ورودی: لیستی از فایل‌های منبع و نمونه محتوا.

قوانین:
1. خروجی فقط شامل لیست تیترهای اصلی (H2) و فرعی (H3) باشد.
2. ترتیب منطقی باید رعایت شود (مقدمه -> مفاهیم -> پیکربندی/عملیات -> عیب‌یابی/نکات تکمیلی).
3. هیچ متن اضافه‌ای ننویس، فقط لیست تیترها به فارسی.
`;

    const userPrompt = `منابع موجود: ${sources.join(', ')}\nنمونه محتوا: ${sampleContent}\n\nیک ساختار استاندارد و جامع برای این مستند پیشنهاد بده.`;

    try {
        const response = await fetch(`${settings.ollamaBaseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: settings.chatModel,
                stream: false,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                options: { temperature: 0.2, num_ctx: 2048 }
            }),
        });
        const data = await response.json();
        return data.message?.content || "ساختار عمومی: مقدمه، توضیحات فنی، جزئیات، نتیجه‌گیری";
    } catch (e) {
        console.error("Blueprint generation failed", e);
        return "1. مقدمه و کلیات\n2. جزئیات فنی و فرآیندها\n3. نکات تکمیلی و مراجع";
    }
};

/**
 * Main Generation Function using Planner-Writer Pattern
 */
export const generateSynthesizedDocument = async (
    topicTitle: string, 
    chunks: KnowledgeChunk[],
    onProgress?: (current: number, total: number, phase: string) => void
): Promise<string> => {
    const settings = getSettings();
    
    // 1. Sort Chunks Logically to help the model flow better
    const sortedChunks = Array.from(new Set(chunks)).sort((a, b) => {
        // Prioritize "Introduction" or "General" files if possible
        if (a.source.id !== b.source.id) return a.source.id.localeCompare(b.source.id);
        return (a.source.page || 0) - (b.source.page || 0);
    });

    const BATCH_SIZE = 12; // Moderate batch size for better attention
    const totalBatches = Math.ceil(sortedChunks.length / BATCH_SIZE);
    
    // 2. Phase 1: Blueprint Generation
    if (onProgress) onProgress(0, totalBatches, "تحلیل ساختار و معماری سند (Blueprint)...");
    const blueprint = await generateBlueprint(topicTitle, chunks);
    
    let finalDocument = "";
    let previousContextSummary = "هنوز متنی تولید نشده است."; 

    // 3. Phase 2: Content Writing (Iterative)
    for (let i = 0; i < totalBatches; i++) {
        const start = i * BATCH_SIZE;
        const end = start + BATCH_SIZE;
        const batchChunks = sortedChunks.slice(start, end);
        
        // Context Preparation with strict citation markers
        const contextData = batchChunks.map(c => 
            `[Source: ${c.source.id}]: ${c.content}`
        ).join('\n\n');
        
        if (onProgress) onProgress(i + 1, totalBatches, `در حال نگارش بخش ${i + 1} از ${totalBatches}...`);

        const systemInstruction = `
تو یک "نویسنده فنی ارشد" (Senior Technical Writer) هستی. در حال نوشتن بخش ${i + 1} از ${totalBatches} برای مستند "${topicTitle}" هستی.

**نقشه راه (Outline) کلی سند:**
${blueprint}

**وظیفه شما:**
اطلاعات خام زیر را پردازش کرده و بر اساس "نقشه راه" بالا، آن‌ها را به یک متن منسجم و حرفه‌ای تبدیل کن. اگر اطلاعات این بخش مربوط به قسمت‌های انتهایی نقشه راه است، آن‌ها را همانجا بنویس.

**قوانین حیاتی:**
۱. **سنتز (Synthesis) نه چسباندن:** جملات را عیناً کپی نکن. آن‌ها را بازنویسی کن تا خوانا و یکدست شوند.
۲. **استناد دقیق (Citation):** هر جا ادعایی مطرح شد، منبع را دقیقاً به فرمت [SourceID: نام فایل] در پایان جمله بیاور. 
   مثال صحیح: ...این خطا معمولاً به دلیل قطعی شبکه رخ می‌دهد [SourceID: error_logs.txt].
۳. **قالب‌بندی:** از Markdown استفاده کن (تیترهای H2, H3، بولت پوینت).
۴. **تداوم:** متن باید ادامه منطقی بخش قبلی باشد.
۵. **حذف اضافات:** اگر اطلاعاتی تکراری یا بی‌ارزش است (مثل هدر/فوتر نامه)، آن را حذف کن.
۶. **زبان:** فارسی رسمی و تخصصی.

**خلاصه بخش‌های قبلی نوشته شده:**
${previousContextSummary}
`;

        const userPrompt = `
داده‌های خام جدید برای پردازش:
---
${contextData}
---

دستور: این داده‌ها را تحلیل کن و متن نهایی این بخش را بنویس.`;

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
                        num_ctx: 4096, 
                        temperature: 0.3, // Low temp for factual accuracy
                        top_p: 0.9
                    }
                }),
            });

            if (!response.ok) throw new Error("Generation failed");
            const data = await response.json();
            const generatedText = data.message?.content || "";
            
            // Append with spacing
            finalDocument += generatedText + "\n\n";
            
            // Self-Correction/Summary for next context
            // Taking the last 600 chars as a "short term memory" of what was just written
            previousContextSummary = generatedText.slice(-600);

        } catch (error) {
            console.error(error);
            finalDocument += "\n\n> [خطا در پردازش این بخش]\n\n";
        }
    }

    // 4. Phase 3: Final Touches (Metadata Table)
    const metadataHeader = `
# سند جامع: ${topicTitle}

| ویژگی | مقدار |
| :--- | :--- |
| **تعداد منابع** | ${new Set(chunks.map(c=>c.source.id)).size} فایل |
| **تاریخ تولید** | ${new Date().toLocaleDateString('fa-IR')} |
| **نسخه** | 1.0 (تولید شده توسط هوش مصنوعی) |

---

> **نکته:** این سند با تحلیل ${chunks.length} قطعه اطلاعاتی تولید شده است. ارجاعات داخل متن به شما کمک می‌کند تا منبع اصلی هر ادعا را پیدا کنید.

---

`;

    return metadataHeader + finalDocument;
};
