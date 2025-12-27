
import { KnowledgeChunk, Source, DebugInfo, QueryResult, PipelineData, Message } from '../types';
import { getEmbedding } from './ollama';
import { getSettings } from './settings';
import { PERSIAN_SYNONYMS } from './synonymsData';
import { cleanAndNormalizeText } from './textProcessor'; // Reuse logic

// REMOVED 'روش', 'نحوه', 'مراحل', 'چطور' from stop words to fix the "How to" retrieval issue
const PERSIAN_STOP_WORDS = new Set([
    'از', 'به', 'با', 'برای', 'در', 'هم', 'و', 'که', 'را', 'این', 'آن', 'است', 'هست', 'بود', 'شد', 'می', 'نمی', 
    'یک', 'تا', 'بر', 'یا', 'نیز', 'باید', 'شاید', 'اما', 'اگر', 'چرا', 'چه', 'روی', 'زیر', 'های', 'ها', 'تر', 'ترین',
    'کند', 'کنند', 'کرده', 'داشت', 'دارد', 'شود', 'میشود', 'نشود', 'باعث', 'مورد', 'جهت', 'توسط', 'بنابراین', 'سپس',
    'ولی', 'لیکن', 'چون', 'چنانچه', 'آیا', 'بله', 'خیر', 'لطفا', 'ممنون', 'متشکرم', 'بی‌زحمت', 'سلام', 'خسته', 'نباشید',
    'چیست', 'کی', 'کجا', 'کدام', 
    'توضیح', 'بده', 'بگو', 'چی', 'هستش', 'انجام',
    'رو', 'میشه', 'لطفاً', 'تفاوتش', 'فرقش', 'چیه', 'کدومه', 'بگید', 'بفرمایید',
    'بیزحمت'
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
    'نمایندگی', 'دسترسی', 'مجوز', 'روش', 'نحوه', 'مراحل', 't+1', 't+2'
]);

const normalizeForSearch = (text: string): string => {
    // Reuse the exact same normalization logic as ingestion to ensure "T+1" matches "T+1"
    // even if input was "(T+1)"
    return cleanAndNormalizeText(text);
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
1. کلمات محاوره‌ای و تعارفات (لطفا، ممنون، بی زحمت، سلام) را حذف کن.
2. **خیلی مهم:** کلمات کلیدی سوال مثل "روش"، "نحوه"، "تفاوت"، "مراحل" را **هرگز** حذف نکن. این کلمات هدف کاربر را نشان می‌دهند.
3. اگر کاربر دنبال مقایسه است (فرق، تفاوت)، حتماً کلمات "تفاوت" و "تعریف" را نگه دار.
4. خروجی فقط و فقط باید کلمات کلیدی نهایی باشد که با فاصله از هم جدا شده‌اند.

مثال ورودی: "بی زحمت میشه بگی روش تغییر کارگزار ناظر چیه؟"
مثال خروجی: روش تغییر کارگزار ناظر

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

    // Enhanced regex to catch T+1, T-2, C++ style terms properly
    const englishWords = normalizedQuery.match(/[a-zA-Z0-9]+[\+\-]?[0-9]+/g);
    if (englishWords) {
        terms.push(...englishWords);
    }
    
    // Catch standard english words
    const standardEnglish = normalizedQuery.match(/[a-zA-Z]{3,}/g);
    if (standardEnglish) {
        terms.push(...standardEnglish);
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

      // --- PROCEDURAL INTENT INJECTION (The "Fix" for incomplete answers) ---
      // If the user asks "How to" or "Method", we explicitly inject navigation keywords.
      // This forces the vector search to prefer chunks that talk about menus and paths.
      const proceduralKeywords = ['روش', 'نحوه', 'چطور', 'چگونه', 'مراحل', 'طریقه', 'آموزش'];
      const isProcedural = proceduralKeywords.some(k => optimizedSearchQuery.includes(k));
      
      if (isProcedural) {
          optimizedSearchQuery += ' "مسیر" "منو" "دکمه" "گزینه" "ثبت"';
          strategyLabel += ' + Procedural Boost';
      }
      // --------------------------------------------------------------------

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
۲. اگر کاربر دنبال "روش" یا "مراحل" انجام کاری است (مثل تغییر کارگزار)، حتماً به دنبال کلماتی مثل "منو"، "مسیر"، "دکمه" در متن باش و مراحل را قدم به قدم بنویس.
۳. اگر مراحل دقیق در متن نیست، اما مفهوم مرتبطی وجود دارد (مثلاً "تخصیص" بجای "تغییر ناظر")، آن را توضیح بده و بگو که احتمالاً منظور همین است.
۴. **مهم:** پاسخ باید تماماً به زبان فارسی باشد. از نوشتن مقدمه به زبان‌های دیگر (انگلیسی، چینی و...) خودداری کن.

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
      let generatedText = data.message?.content || "";

      // --- CLEAN UP MULTILINGUAL ARTIFACTS ---
      // Fix: Updated regex to include Hiragana (\u3040-\u309F) and Katakana (\u30A0-\u30FF)
      generatedText = generatedText.replace(/^[\s\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef\u3040-\u309f\u30a0-\u30ff]+/, '');
      generatedText = generatedText.replace(/^(Here is the answer|Based on the provided|According to)[^:\n]*[:]?\s*/i, '');

      // Sanity Check: Ensure response is in Persian
      const hasPersian = /[\u0600-\u06FF]/.test(generatedText);
      const isJapaneseRefusal = /[\u3040-\u309f\u30a0-\u30ff]/.test(generatedText);

      if (!hasPersian && isJapaneseRefusal) {
         return { 
             text: "متاسفانه مدل هوش مصنوعی پاسخ معتبری تولید نکرد (خطای زبان). لطفاً دوباره تلاش کنید یا مدل چت را تغییر دهید.",
             sources: validDocs.map(d => ({ ...d.chunk.source, score: d.score })),
             debugInfo: {
                strategy: 'Fallback (Language Error)',
                processingTimeMs: Date.now() - startTime,
                candidateCount: validDocs.length,
                logicStep: 'Detected invalid Japanese response',
                extractedKeywords: criticalTerms
             }
         };
      }

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
