
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
You are a query rewriting engine. Rewrite the "Current User Question" to be a standalone, specific search query based on "Chat History".
Rules:
1. Resolve pronouns.
2. If asking "How to fix it?", include the context.
3. Output ONLY the rewritten Persian query.

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
Extract the core semantic search terms from this Persian query. Remove polite phrases. Keep technical terms.
Query: "${rawQuery}"
Output (terms only):
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

// Enhanced Keyword Scorer with "Full Coverage" Bonus
export const calculateKeywordScore = (chunk: KnowledgeChunk, terms: string[], query: string): number => {
    if (terms.length === 0) return 0;
    
    const contentStr = (chunk.searchContent + " " + chunk.content).toLowerCase();
    const normalizedContent = normalizeForSearch(contentStr);
    const normalizedQuery = normalizeForSearch(query).toLowerCase();

    let score = 0;
    let matchedTermsCount = 0;
    
    terms.forEach(term => {
        if (normalizedContent.includes(term.toLowerCase())) {
            matchedTermsCount++;
        }
    });
    
    // Coverage Score
    if (matchedTermsCount > 0) {
        score += (matchedTermsCount / terms.length) * 0.6; // 60% of score comes from how many distinct terms matched
    }
    
    // Bonus: If ALL critical terms are present, huge boost (likely the exact answer)
    if (matchedTermsCount === terms.length && terms.length > 1) {
        score += 0.3;
    }

    // Exact Phrase Matching (Bi-grams & Tri-grams)
    const words = normalizedQuery.split(' ').filter(w => w.length > 2);
    for (let i = 0; i < words.length - 1; i++) {
        const biGram = words[i] + " " + words[i+1];
        if (normalizedContent.includes(biGram)) {
            score += 0.3; // Boost for 2-word phrases
        }
        
        if (i < words.length - 2) {
            const triGram = words[i] + " " + words[i+1] + " " + words[i+2];
            if (normalizedContent.includes(triGram)) {
                score += 0.5; // Significant boost for 3-word phrases
            }
        }
    }

    return score; 
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
      if (chatHistory.length > 0) {
          optimizedSearchQuery = await rewriteQueryWithHistory(query, chatHistory);
      } else {
          optimizedSearchQuery = await optimizeQueryAI(query);
      }

      const synonymExpandedQuery = expandQueryWithSynonyms(optimizedSearchQuery);
      const criticalTerms = extractCriticalTerms(synonymExpandedQuery);
      
      if (onStatusUpdate) {
          onStatusUpdate({
              step: 'vectorizing',
              extractedKeywords: criticalTerms,
              expandedQuery: synonymExpandedQuery, 
              processingTime: Date.now() - startTime
          });
      }
      
      const mainVec = await getEmbedding(synonymExpandedQuery, true);
      
      const targetChunks = categoryFilter 
          ? knowledgeBase.filter(k => k.metadata?.category === categoryFilter)
          : knowledgeBase;

      // Score Calculation
      const scoredChunks = targetChunks.map(chunk => {
          // 1. Vector Score
          let vectorScore = 0;
          if (chunk.embedding) {
              vectorScore = cosineSimilarity(mainVec, chunk.embedding);
          }

          // 2. Keyword Score (with Exact Phrase Boost)
          const kwScore = calculateKeywordScore(chunk, criticalTerms, synonymExpandedQuery);
          
          return { id: chunk.id, chunk, vectorScore, kwScore };
      });

      // Reciprocal Rank Fusion (RRF)
      const k = 60;
      const rrfMap = new Map<string, number>();
      
      // Rank by Vector
      scoredChunks.sort((a, b) => b.vectorScore - a.vectorScore).forEach((item, rank) => {
          if (item.vectorScore > 0.42) { // Lowered threshold significantly to catch "hard" matches
              rrfMap.set(item.id, (rrfMap.get(item.id) || 0) + (1 / (k + rank + 1)));
          }
      });

      // Rank by Keyword
      scoredChunks.sort((a, b) => b.kwScore - a.kwScore).forEach((item, rank) => {
          if (item.kwScore > 0) {
              rrfMap.set(item.id, (rrfMap.get(item.id) || 0) + (1 / (k + rank + 1)));
          }
      });

      // Final Sort
      const fusedResults = Array.from(rrfMap.entries())
          .map(([id, score]) => {
              const chunkObj = scoredChunks.find(c => c.id === id);
              return { chunk: chunkObj!.chunk, score };
          })
          .sort((a, b) => b.score - a.score);

      const effectiveMinConfidence = 0.005; 
      
      // CHANGE: Increased retrieval window to 30 to improve Recall for specific/obscure queries
      const topDocs = fusedResults.slice(0, 30); 

      if (onStatusUpdate) {
          onStatusUpdate({
              step: 'searching',
              retrievedCandidates: topDocs.slice(0, 8).map(d => ({ 
                  title: d.chunk.source.title, 
                  score: d.score * 30, 
                  accepted: d.score >= effectiveMinConfidence
              })),
              processingTime: Date.now() - startTime
          });
      }

      const validDocs = topDocs.filter(d => d.score >= effectiveMinConfidence);

      if (validDocs.length === 0 && !useGeneralKnowledge) {
          return { text: "متاسفانه در مستندات بارگذاری شده، اطلاعاتی در این مورد یافت نشد.", sources: [] };
      }

      // Ensure we don't overflow context context window
      const finalContextDocs = validDocs.slice(0, 8); // Send top 8 chunks to LLM

      const contextText = finalContextDocs.map(d => 
        `--- منبع: ${d.chunk.source.title} (صفحه ${d.chunk.source.page}) ---\n${d.chunk.content}`
      ).join('\n\n');

      const conversationHistoryText = chatHistory.length > 0 
        ? `تاریخچه مکالمه:\n${chatHistory.slice(-4).map(m => `${m.role === 'user' ? 'کاربر' : 'دستیار'}: ${m.content.substring(0, 100)}...`).join('\n')}\n`
        : '';

      // IMPROVED: Strict "Chain of Thought" Prompt
      const promptContent = `
${conversationHistoryText}

مستندات مرجع (Context) یافت شده:
${contextText}

سوال کاربر: ${query}
(سوال اصلاح شده: ${optimizedSearchQuery})

دستورالعمل بسیار دقیق (Strict System Rules):
۱. تو یک دستیار فنی دقیق هستی. تنها منبع دانش تو "مستندات مرجع" بالا است.
۲. **مهم:** قبل از پاسخ دادن، در ذهن خود چک کن که آیا پاسخ دقیقاً در متن وجود دارد؟
۳. اگر پاسخ در مستندات نیست، فقط بگو: "متاسفانه اطلاعات کافی در مستندات یافت نشد." (هیچ چیز دیگری نگو).
۴. **الزام ارجاع:** پاسخ باید شامل ارجاع به نام فایل باشد (مثلاً: [طبق فایل norozراهبری.docx]).
۵. از عباراتی مثل "طبق دانش من" یا اطلاعات عمومی استفاده نکن. پاسخ باید ۱۰۰٪ مبتنی بر متن باشد.

فرمت پاسخ:
- خلاصه پاسخ
- جزئیات (به صورت لیست)
- منبع

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
      generatedText = generatedText.replace(/^[\s\u4e00-\u9fa5]+/, ''); // Remove Chinese noise if any

      return { 
          text: generatedText.trim(), 
          sources: validDocs.slice(0, 5).map(d => ({ ...d.chunk.source, score: d.score })),
          debugInfo: {
              strategy: 'Enhanced Hybrid RAG (v3) + CoT Prompting',
              processingTimeMs: Date.now() - startTime,
              candidateCount: validDocs.length,
              logicStep: `Rewritten: ${synonymExpandedQuery}`,
              extractedKeywords: criticalTerms
          }
      };

  } catch (error: any) {
    return { text: "خطا در پردازش درخواست.", sources: [], error: error.message };
  }
};
