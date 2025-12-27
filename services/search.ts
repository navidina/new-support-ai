
import { KnowledgeChunk, Source, DebugInfo, QueryResult, PipelineData, Message } from '../types';
import { getEmbedding } from './ollama';
import { getSettings } from './settings';
import { PERSIAN_SYNONYMS } from './synonymsData';
import { cleanAndNormalizeText } from './textProcessor'; 

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
    return cleanAndNormalizeText(text);
};

// --- SYNONYM EXPANSION LOGIC ---
const expandQueryWithSynonyms = (query: string): string => {
    let expanded = query;
    const lowerQuery = cleanAndNormalizeText(query).toLowerCase();

    Object.entries(PERSIAN_SYNONYMS).forEach(([official, synonyms]) => {
        const hasSynonym = synonyms.some(syn => lowerQuery.includes(syn.toLowerCase()));
        const hasOfficial = lowerQuery.includes(official.toLowerCase());

        if (hasSynonym && !hasOfficial) {
            expanded += ` ${official}`;
        } else if (hasOfficial) {
            expanded += ` ${synonyms.slice(0, 2).join(' ')}`;
        }
    });
    
    return expanded;
};

const rewriteQueryWithHistory = async (currentQuery: string, history: Message[]): Promise<string> => {
    const settings = getSettings();
    
    if (!history || history.length === 0) return optimizeQueryAI(currentQuery);

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
        return rewritten.length > 2 ? rewritten : currentQuery;
    } catch (e) {
        return currentQuery;
    }
};

const optimizeQueryAI = async (rawQuery: string): Promise<string> => {
    const settings = getSettings();
    if (rawQuery.split(/\s+/).length < 3) return rawQuery;

    const prompt = `
تو یک موتور جستجوی هوشمند برای سیستم مالی هستی. وظیفه تو استخراج "هسته معنایی" (Semantic Core) از سوال کاربر است.
قوانین:
1. کلمات محاوره‌ای و تعارفات (لطفا، ممنون، بی زحمت، سلام) را حذف کن.
2. **خیلی مهم:** کلمات کلیدی سوال مثل "روش"، "نحوه"، "تفاوت"، "مراحل" را **هرگز** حذف نکن.
3. اگر کاربر دنبال مقایسه است (فرق، تفاوت)، حتماً کلمات "تفاوت" و "تعریف" را نگه دار.
4. خروجی فقط کلمات کلیدی نهایی با فاصله باشد.

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
    
    // 1. Technical IDs and Error Codes (Numbers > 3 digits)
    const numbers = normalizedQuery.match(/\d{3,}/g);
    if (numbers) terms.push(...numbers);

    // 2. English technical terms (API, Page, Offset, T+1, GTC)
    const englishWords = normalizedQuery.match(/[a-zA-Z0-9]+[\+\-]?[0-9]*/g);
    if (englishWords) {
        englishWords.forEach(w => {
            if (w.length > 2 || w.toUpperCase() === 'IP') terms.push(w);
        });
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

// Improved Keyword Scorer: Focuses on "Coverage" (Query Terms found) + Frequency
export const calculateKeywordScore = (chunk: KnowledgeChunk, terms: string[]): number => {
    if (terms.length === 0) return 0;
    const contentStr = (chunk.searchContent + " " + chunk.content).toLowerCase();
    const normalizedContent = normalizeForSearch(contentStr);
    
    let matchedTermsCount = 0;
    let totalFrequency = 0;

    terms.forEach(term => {
        // Simple token check is faster and safer than RegExp loop for mass scoring
        if (normalizedContent.includes(term.toLowerCase())) {
            matchedTermsCount++;
            // Basic frequency check (not full regex count for speed)
            const parts = normalizedContent.split(term.toLowerCase());
            totalFrequency += (parts.length - 1); 
        }
    });

    if (matchedTermsCount === 0) return 0;

    // Coverage Score (How many of the query terms are present?) - Most Important
    const coverage = matchedTermsCount / terms.length;
    
    // Frequency Bonus (capped small boost)
    const frequencyBoost = Math.min(0.2, totalFrequency * 0.01);

    return coverage + frequencyBoost; 
};

/**
 * Simulates Cross-Encoder behavior by scoring term proximity.
 * If terms appear in the same sentence, it suggests strong semantic relevance.
 */
const calculateProximityScore = (text: string, terms: string[]): number => {
    if (terms.length < 2) return 0;
    const lowerText = normalizeForSearch(text).toLowerCase();
    // Split by sentence terminators
    const sentences = lowerText.split(/[.?!؟\n]+/);
    let maxScore = 0;
    
    for (const sent of sentences) {
        if (!sent.trim()) continue;
        let matchCount = 0;
        for (const term of terms) {
            if (sent.includes(term.toLowerCase())) matchCount++;
        }
        
        // If multiple distinct terms appear in the same sentence, boost significantly
        if (matchCount > 1) {
            const sentenceRatio = matchCount / terms.length;
            maxScore = Math.max(maxScore, sentenceRatio);
        }
    }
    return maxScore; // Range 0 to 1
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
    chatHistory: Message[] = [] 
): Promise<QueryResult> => {
  const settings = getSettings();
  const startTime = Date.now();
  
  if (knowledgeBase.length === 0) return { text: "پایگاه دانش خالی است.", sources: [] };

  try {
      if (onStatusUpdate) onStatusUpdate({ step: 'analyzing', processingTime: 0 });
      
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

      const synonymExpandedQuery = expandQueryWithSynonyms(optimizedSearchQuery);
      if (synonymExpandedQuery.length > optimizedSearchQuery.length) {
          strategyLabel += ' + Synonyms';
      }

      const proceduralKeywords = ['روش', 'نحوه', 'چطور', 'چگونه', 'مراحل', 'طریقه', 'آموزش'];
      const isProcedural = proceduralKeywords.some(k => synonymExpandedQuery.includes(k));
      
      let finalSearchQuery = synonymExpandedQuery;
      if (isProcedural) {
          finalSearchQuery += ' "مسیر" "منو" "دکمه" "گزینه" "ثبت"';
          strategyLabel += ' + Procedural Boost';
      }

      const criticalTerms = extractCriticalTerms(finalSearchQuery);
      
      const comparisonKeywords = ['فرق', 'تفاوت', 'مقایسه', 'تمایز'];
      const isComparison = comparisonKeywords.some(k => finalSearchQuery.includes(k));
      if (isComparison) strategyLabel += ' (Multi-Vector)';

      if (onStatusUpdate) {
          onStatusUpdate({
              step: 'vectorizing',
              extractedKeywords: criticalTerms,
              expandedQuery: finalSearchQuery, 
              processingTime: Date.now() - startTime
          });
      }
      
      // 1. Vector Search
      const mainVec = await getEmbedding(finalSearchQuery, true);
      const isVectorValid = mainVec.some(v => v !== 0);
      
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

      // 2. Score Calculation (Dual Scoring)
      const vectorRanked = targetChunks.map(chunk => {
          let vectorScore = 0;
          if (isVectorValid && chunk.embedding) {
              vectorScore = cosineSimilarity(mainVec, chunk.embedding);
              for (const exVec of extraVectors) {
                  const s = cosineSimilarity(exVec, chunk.embedding);
                  if (s > vectorScore) vectorScore = s;
              }
          }
          return { id: chunk.id, chunk, vectorScore };
      }).sort((a, b) => b.vectorScore - a.vectorScore);

      const keywordRanked = targetChunks.map(chunk => {
          const kwScore = calculateKeywordScore(chunk, criticalTerms);
          // NEW: Proximity Boost (Simulate Cross-Encoder)
          // If keywords appear close together, boost the score.
          const proxScore = calculateProximityScore(chunk.content, criticalTerms);
          
          return { id: chunk.id, chunk, kwScore: kwScore + (proxScore * 0.5) };
      }).sort((a, b) => b.kwScore - a.kwScore);

      // 3. Reciprocal Rank Fusion (RRF)
      const k = 60;
      const rrfMap = new Map<string, number>();
      
      vectorRanked.forEach((item, rank) => {
          if (item.vectorScore > 0.65) {
              rrfMap.set(item.id, (rrfMap.get(item.id) || 0) + (1 / (k + rank + 1)));
          }
      });

      keywordRanked.forEach((item, rank) => {
          if (item.kwScore > 0) {
              rrfMap.set(item.id, (rrfMap.get(item.id) || 0) + (1 / (k + rank + 1)));
          }
      });

      // 4. Final Sort & Reranking
      const fusedResults = Array.from(rrfMap.entries())
          .map(([id, score]) => {
              const chunkObj = vectorRanked.find(c => c.id === id);
              return { chunk: chunkObj!.chunk, score };
          })
          .sort((a, b) => b.score - a.score);

      const effectiveMinConfidence = 0.012;
      
      // Increased retrieval window for better coverage before context selection
      const topDocs = fusedResults.slice(0, 10); 

      if (onStatusUpdate) {
          onStatusUpdate({
              step: 'searching',
              retrievedCandidates: topDocs.map(d => ({ 
                  title: d.chunk.source.title, 
                  score: d.score * 30, 
                  accepted: d.score >= effectiveMinConfidence
              })),
              processingTime: Date.now() - startTime
          });
      }

      // Filter low confidence chunks
      const validDocs = topDocs.filter(d => d.score >= effectiveMinConfidence);

      if (validDocs.length === 0 && !useGeneralKnowledge) {
          return { text: "متاسفانه در مستندات بارگذاری شده، اطلاعاتی در این مورد یافت نشد.", sources: [] };
      }

      // STRICT CONTEXT SELECTION: Top 5 only to reduce noise/hallucination risk
      // This combined with Proximity Scoring acts as a Reranker.
      const finalContextDocs = validDocs.slice(0, 5);

      const contextText = finalContextDocs.map(d => 
        `--- منبع: ${d.chunk.source.title} (صفحه ${d.chunk.source.page}) ---\n${d.chunk.content}`
      ).join('\n\n');

      const conversationHistoryText = chatHistory.length > 0 
        ? `تاریخچه مکالمه اخیر:\n${chatHistory.slice(-4).map(m => `${m.role === 'user' ? 'کاربر' : 'دستیار'}: ${m.content.substring(0, 150)}...`).join('\n')}\n`
        : '';

      const promptContent = `
${conversationHistoryText}

مستندات مرجع (Context) یافت شده برای سوال جدید:
${contextText}

سوال جدید کاربر: ${query}
(سوال بازنویسی شده توسط سیستم جهت درک بهتر: ${optimizedSearchQuery})

دستورالعمل نهایی:
۱. فقط و فقط بر اساس "مستندات مرجع" بالا پاسخ بده.
۲. اگر پاسخ در متن نیست، صراحتاً بگو "اطلاعاتی یافت نشد" و از خودت مطلب اضافه نکن.
۳. اگر کاربر دنبال مسیر منو یا تنظیمات است، دقیقاً مسیر را از متن استخراج کن.
۴. پاسخ باید فارسی، روان و بدون ذکر جملات انگلیسی بیهوده باشد.

پاسخ شما:`;

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

      generatedText = generatedText.replace(/^[\s\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef\u3040-\u309f\u30a0-\u30ff]+/, '');
      generatedText = generatedText.replace(/^(Here is the answer|Based on the provided|According to)[^:\n]*[:]?\s*/i, '');

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
              strategy: strategyLabel + ' + RRF Fusion + Proximity',
              processingTimeMs: Date.now() - startTime,
              candidateCount: validDocs.length,
              logicStep: `Rewritten: ${finalSearchQuery}`,
              extractedKeywords: criticalTerms
          }
      };

  } catch (error: any) {
    return { text: "خطا در پردازش درخواست.", sources: [], error: error.message };
  }
};
