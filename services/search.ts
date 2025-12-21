
import { KnowledgeChunk, Source, DebugInfo, QueryResult, PipelineData, Message } from '../types';
import { getEmbedding } from './ollama';
import { getSettings } from './settings';
import { PERSIAN_SYNONYMS } from './synonymsData';

const PERSIAN_STOP_WORDS = new Set([
    'از', 'به', 'با', 'برای', 'در', 'هم', 'و', 'که', 'را', 'این', 'آن', 'است', 'هست', 'بود', 'شد', 'می', 'نمی', 
    'یک', 'تا', 'بر', 'یا', 'نیز', 'باید', 'شاید', 'اما', 'اگر', 'چرا', 'چه', 'روی', 'زیر', 'های', 'ها', 'تر', 'ترین',
    'کند', 'کنند', 'کرده', 'داشت', 'دارد', 'شود', 'میشود', 'نشود', 'باعث', 'مورد', 'جهت', 'توسط', 'بنابراین', 'سپس',
    'ولی', 'لیکن', 'چون', 'چنانچه', 'آیا', 'بله', 'خیر', 'لطفا', 'ممنون', 'متشکرم', 'بی‌زحمت', 'سلام', 'خسته', 'نباشید',
    'روش', 'نحوه', 'چگونه', 'چطور', 'چطوره', 'چیست', 'کی', 'کجا', 'کدام', 
    'توضیح', 'بده', 'بگو', 'چی', 'هستش', 'طریقه', 'مراحل', 'انجام',
    'رو', 'میشه', 'لطفاً', 'تفاوتش', 'فرقش', 'چیه', 'کدومه', 'بگید', 'بفرمایید',
    'فرق', 'تفاوت', 'مقایسه', 'مزیت', 'معایب', 'بیزحمت'
]);

const DOMAIN_KEYWORDS = new Set([
    'مغایرت', 'تیکت', 'ابطال', 'صدور', 'کارمزد', 'اکسیر', 'رکسار', 'رایان', 'همراه',
    'بازارگردان', 'سبدگردان', 'اختیار', 'ناظر', 'اعتبار', 'ریست', 'پسورد', 'رمز',
    'صورت', 'مالی', 'تراز', 'سود', 'زیان', 'پورتفو', 'دیده‌بان', 'فیش', 'واریز',
    'توافقنامه', 'بیانیه', 'رسید', 'لاگ', 'نسخه', 'آپدیت', 'خرید', 'فروش',
    'گزارش', 'تحلیل', 'عملکرد', 'مشتریان', 'پیش‌فرض', 'پیش فرض', 'مانده', 
    'ستون', 'فیلد', 'پارامتر', 'فیلتر', 'خروجی', 'اکسل', 'چاپ', 'نمودار',
    'ایمیل', 'ارسال', 'nav', 'etf', 'prx', 'dps', 'ip', 'تغییر',
    'شعبه', 'باجه', 'کارگزار', 'سرخط', 'سرخطی', 'حراج', 'فریز', 'page', 'offset', 'api',
    'نمایندگی', 'دسترسی', 'مجوز'
]);

const normalizeForSearch = (text: string): string => {
    return text.toLowerCase()
        .replace(/ي/g, 'ی')
        .replace(/ك/g, 'ک')
        .replace(/\u200C/g, ' ') 
        .replace(/[۰-۹]/g, d => String.fromCharCode(d.charCodeAt(0) - 1728)) 
        .replace(/[،؛:!?.()\[\]{}""''\-]/g, ' ')
        .trim();
};

/**
 * REWRITE QUERY WITH CONTEXT (Follow-up Handling)
 * Uses LLM to rewrite vaguely phrased follow-up questions into standalone queries.
 */
const rewriteQueryWithHistory = async (currentQuery: string, history: Message[]): Promise<string> => {
    const settings = getSettings();
    
    // If no meaningful history, fallback to standard optimization
    if (!history || history.length === 0) return optimizeQueryAI(currentQuery);

    // Format last 2 turns of history
    const historyText = history.slice(-4).map(m => 
        `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.substring(0, 200)}`
    ).join('\n');

    const prompt = `
You are a query rewriting engine for a RAG system.
Your task is to rewrite the "Current User Question" to be a standalone, specific search query based on the "Chat History".

Rules:
1. Resolve pronouns (it, that, he, she, they) to their specific nouns from history.
2. If the user asks "How do I fix it?", rewrite it as "How to fix [Specific Error from history]".
3. If the user asks for "Difference", include the two entities being compared from history.
4. If the question is already standalone, return it exactly as is.
5. Output ONLY the rewritten query text in Persian. No explanations.

Chat History:
${historyText}

Current User Question: ${currentQuery}

Rewritten Query:
    `.trim();

    try {
        const response = await fetch(`${settings.ollamaBaseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: settings.chatModel,
                stream: false,
                messages: [{ role: 'user', content: prompt }],
                options: { temperature: 0.1 }
            }),
        });
        if (!response.ok) return currentQuery;
        const data = await response.json();
        const rewritten = data.message?.content?.trim() || currentQuery;
        
        // Sanity check: if rewrite failed or is empty, use original
        return rewritten.length > 2 ? rewritten : currentQuery;
    } catch (e) {
        return currentQuery;
    }
};

/**
 * Standard Query Optimization (Noise Removal)
 */
const optimizeQueryAI = async (rawQuery: string): Promise<string> => {
    const settings = getSettings();
    
    if (rawQuery.split(/\s+/).length < 3) return rawQuery;

    const prompt = `
تو یک موتور جستجوی هوشمند برای سیستم مالی هستی. وظیفه تو استخراج "هسته معنایی" (Semantic Core) از سوال کاربر است.
قوانین:
1. تمام کلمات محاوره‌ای، تعارفات، افعال دستوری و نویزهای زبانی (مثل: لطفا، بگو، چیست، رو، برام، ممنون، بی زحمت) را حذف کن.
2. اگر کاربر دنبال مقایسه است (فرق، تفاوت، چه فرقی دارد)، حتماً کلمات "تفاوت" و "تعریف" را به عنوان کلمه کلیدی نگه دار.
3. اگر سوال درباره آدرس منو یا گزارش است، کلمات "مسیر" و "منو" را اضافه کن.
4. خروجی فقط و فقط باید کلمات کلیدی نهایی باشد که با فاصله از هم جدا شده‌اند. هیچ توضیح اضافه‌ای نده.

مثال ورودی: "بی زحمت میشه بگی فرق شعبه و باجه در سیستم چیه؟"
مثال خروجی: تفاوت تعریف شعبه باجه سیستم

ورودی کاربر: "${rawQuery}"
خروجی بهینه شده:
    `.trim();

    try {
        const response = await fetch(`${settings.ollamaBaseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: settings.chatModel,
                stream: false,
                messages: [{ role: 'user', content: prompt }],
                options: { temperature: 0.1 }
            }),
        });
        if (!response.ok) return rawQuery;
        const data = await response.json();
        const optimized = data.message?.content?.trim() || rawQuery;
        return optimized;
    } catch (e) {
        return rawQuery;
    }
};

export const extractCriticalTerms = (query: string): string[] => {
    const terms: string[] = [];
    const normalizedQuery = normalizeForSearch(query);
    
    const numbers = normalizedQuery.match(/\d{3,}/g);
    if (numbers) terms.push(...numbers);

    const englishWords = normalizedQuery.match(/[a-zA-Z0-9\+\-]{2,}/g);
    if (englishWords) {
        terms.push(...englishWords.filter(w => w.length > 3 || ['api', 'nav', 'etf', 'ip'].includes(w)));
    }

    const tokens = normalizedQuery.split(/\s+/);
    tokens.forEach(token => {
        if (PERSIAN_STOP_WORDS.has(token)) return;
        if (DOMAIN_KEYWORDS.has(token) || token.length >= 4) { 
            terms.push(token);
        }
    });

    return [...new Set(terms)]; 
};

export const calculateKeywordScore = (chunk: KnowledgeChunk, terms: string[]): number => {
    if (terms.length === 0) return 0;
    const contentStr = (chunk.searchContent + " " + chunk.content).toLowerCase();
    const normalizedContent = normalizeForSearch(contentStr);
    let matches = 0;
    terms.forEach(term => {
        if (normalizedContent.includes(term.toLowerCase())) matches++;
    });
    return Math.min(1.0, matches / terms.length); 
};

export const cosineSimilarity = (vecA: number[], vecB: number[]): number => {
    if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) return 0;
    let dotProduct = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

export const processQuery = async (
    query: string, 
    knowledgeBase: KnowledgeChunk[], 
    onStatusUpdate?: (data: PipelineData) => void,
    categoryFilter?: string,
    attempt: number = 1,
    useGeneralKnowledge: boolean = false,
    chatHistory: Message[] = [] // Added History
): Promise<QueryResult> => {
  const settings = getSettings();
  const startTime = Date.now();
  
  if (knowledgeBase.length === 0) return { text: "پایگاه دانش خالی است.", sources: [] };

  try {
      if (onStatusUpdate) onStatusUpdate({ step: 'analyzing', processingTime: 0 });
      
      // Step 1: Contextualize Query (Handle Follow-ups)
      // Instead of just optimizing, we now "Rewrite with History"
      let optimizedSearchQuery = query;
      let strategyLabel = 'AI-Optimized RAG';

      if (chatHistory.length > 0) {
          optimizedSearchQuery = await rewriteQueryWithHistory(query, chatHistory);
          if (optimizedSearchQuery !== query) {
              strategyLabel = 'Context-Aware Rewrite';
          }
      } else {
          optimizedSearchQuery = await optimizeQueryAI(query);
      }

      const criticalTerms = extractCriticalTerms(optimizedSearchQuery);
      
      const comparisonKeywords = ['فرق', 'تفاوت', 'مقایسه', 'تمایز'];
      const isComparison = comparisonKeywords.some(k => optimizedSearchQuery.includes(k));
      if (isComparison) strategyLabel += ' (Multi-Vector)';

      if (onStatusUpdate) {
          onStatusUpdate({
              step: 'vectorizing',
              extractedKeywords: criticalTerms,
              expandedQuery: optimizedSearchQuery, // Shows the Rewritten query in Logic Panel
              processingTime: Date.now() - startTime
          });
      }
      
      // Use Rewritten Query for Embedding
      const mainVec = await getEmbedding(optimizedSearchQuery, true);
      const isVectorValid = mainVec.some(v => v !== 0);
      
      // Step 2: Multi-Vector Strategy for Comparisons
      const extraVectors: number[][] = [];
      if (isComparison) {
          const entities = criticalTerms.filter(t => !comparisonKeywords.includes(t)).slice(0, 2);
          for (const entity of entities) {
              const defVec = await getEmbedding(`تعریف ${entity}`, true);
              if (defVec.some(v => v !== 0)) extraVectors.push(defVec);
          }
      }

      const targetChunks = categoryFilter 
          ? knowledgeBase.filter(k => k.metadata?.category === categoryFilter)
          : knowledgeBase;

      const scoredDocs = targetChunks.map(chunk => {
          let vectorScore = 0;
          if (isVectorValid && chunk.embedding) {
              vectorScore = cosineSimilarity(mainVec, chunk.embedding);
              // Multi-vector boost
              for (const exVec of extraVectors) {
                  const s = cosineSimilarity(exVec, chunk.embedding);
                  if (s > vectorScore) vectorScore = s;
              }
          }
          
          const kwScore = calculateKeywordScore(chunk, criticalTerms);
          // Balanced scoring: Semantic (70%) + Keyword (30%)
          const finalScore = (vectorScore * 0.7) + (kwScore * 0.3);
          
          return { chunk, score: finalScore };
      });

      const topDocs = scoredDocs
        .sort((a, b) => b.score - a.score)
        .slice(0, 15);

      if (onStatusUpdate) {
          onStatusUpdate({
              step: 'searching',
              retrievedCandidates: topDocs.slice(0, 4).map(d => ({ title: d.chunk.source.title, score: d.score })),
              processingTime: Date.now() - startTime
          });
      }

      const effectiveMinConfidence = settings.minConfidence || 0.15;
      const validDocs = topDocs.filter(d => d.score >= effectiveMinConfidence);

      if (validDocs.length === 0 && !useGeneralKnowledge) {
          return { text: "در مستندات بارگذاری شده، اطلاعاتی در این مورد یافت نشد.", sources: [] };
      }

      const contextText = validDocs.slice(0, 7).map(d => 
        `--- منبع: ${d.chunk.source.title} ---\n${d.chunk.content}`
      ).join('\n\n');

      // History for Context Window
      const conversationHistoryText = chatHistory.length > 0 
        ? `تاریخچه مکالمه اخیر:\n${chatHistory.slice(-4).map(m => `${m.role === 'user' ? 'کاربر' : 'دستیار'}: ${m.content.substring(0, 150)}...`).join('\n')}\n`
        : '';

      const promptContent = `
${conversationHistoryText}

مستندات مرجع (Context) یافت شده برای سوال جدید:
${contextText}

سوال جدید کاربر: ${query}
(سوال بازنویسی شده توسط سیستم جهت درک بهتر: ${optimizedSearchQuery})

دستورالعمل: 
۱. پاسخ دقیق را بر اساس "مستندات مرجع" بنویس. 
۲. اگر سوال به بحث قبلی ارجاع دارد (مثلا "راه حلش چیست؟")، از "تاریخچه مکالمه" برای درک موضوع استفاده کن اما پاسخ نهایی باید از "مستندات مرجع" استخراج شود.
۳. اگر در مستندات پاسخی نبود، صریح بگو.

پاسخ به زبان فارسی:`;

      const response = await fetch(`${settings.ollamaBaseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: settings.chatModel,
          stream: false,
          messages: [
            { role: 'system', content: settings.systemPrompt },
            { role: 'user', content: promptContent }
          ],
          options: { temperature: settings.temperature }
        }),
      });

      if (!response.ok) throw new Error("Ollama Failed");
      const data = await response.json();
      const generatedText = data.message?.content || "";

      return { 
          text: generatedText.trim(), 
          sources: validDocs.map(d => ({ ...d.chunk.source, score: d.score })),
          debugInfo: {
              strategy: strategyLabel,
              processingTimeMs: Date.now() - startTime,
              candidateCount: validDocs.length,
              logicStep: `Rewritten: ${optimizedSearchQuery}`,
              extractedKeywords: criticalTerms
          }
      };

  } catch (error: any) {
    return { text: "خطا در پردازش درخواست.", sources: [], error: error.message };
  }
};
