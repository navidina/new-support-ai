
import { KnowledgeChunk, Source, DebugInfo, QueryResult, PipelineData } from '../types';
import { getEmbedding } from './ollama';
import { getSettings } from './settings';
import { PERSIAN_SYNONYMS } from './synonymsData';

const PERSIAN_STOP_WORDS = new Set([
    // Basic Stop Words
    'از', 'به', 'با', 'برای', 'در', 'هم', 'و', 'که', 'را', 'این', 'آن', 'است', 'هست', 'بود', 'شد', 'می', 'نمی', 
    'یک', 'تا', 'بر', 'یا', 'نیز', 'باید', 'شاید', 'اما', 'اگر', 'چرا', 'چه', 'روی', 'زیر', 'های', 'ها', 'تر', 'ترین',
    'کند', 'کنند', 'کرده', 'داشت', 'دارد', 'شود', 'میشود', 'نشود', 'باعث', 'مورد', 'جهت', 'توسط', 'بنابراین', 'سپس',
    'ولی', 'لیکن', 'چون', 'چنانچه', 'آیا', 'بله', 'خیر', 'لطفا', 'ممنون', 'متشکرم', 'بی‌زحمت', 'سلام', 'خسته', 'نباشید',
    
    // Question & Instructional Fillers
    'روش', 'نحوه', 'چگونه', 'چطور', 'چطوره', 'چیست', 'کی', 'کجا', 'کدام', 
    'توضیح', 'بده', 'بگو', 'چی', 'هستش', 'طریقه', 'مراحل', 'انجام',
    // Intent words
    'فرق', 'تفاوت', 'مقایسه', 'مزیت', 'معایب'
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

const DOMAIN_KEYWORDS = new Set([
    'مغایرت', 'تیکت', 'ابطال', 'صدور', 'کارمزد', 'اکسیر', 'رکسار', 'رایان', 'همراه',
    'بازارگردان', 'سبدگردان', 'اختیار', 'ناظر', 'اعتبار', 'ریست', 'پسورد', 'رمز',
    'صورت', 'مالی', 'تراز', 'سود', 'زیان', 'پورتفو', 'دیده‌بان', 'فیش', 'واریز',
    'توافقنامه', 'بیانیه', 'رسید', 'لاگ', 'نسخه', 'آپدیت', 'خرید', 'فروش',
    'گزارش', 'تحلیل', 'عملکرد', 'مشتریان', 'پیش‌فرض', 'پیش فرض', 'مانده', 
    'ستون', 'فیلد', 'پارامتر', 'فیلتر', 'خروجی', 'اکسل', 'چاپ', 'نمودار',
    'ایمیل', 'ارسال', 'nav', 'etf', 'prx', 'dps', 'ip', 'تغییر',
    // Specific entities
    'شعبه', 'باجه', 'کارگزار', 'سرخط', 'سرخطی', 'حراج', 'فریز', 'page', 'offset', 'api'
]);

// Expand query for KEYWORD MATCHING only
const expandQuery = async (query: string): Promise<string> => {
    let expandedTokens = new Set<string>();
    const normalizedQuery = normalizeForSearch(query);
    const tokens = normalizedQuery.split(/\s+/);
    tokens.forEach(t => expandedTokens.add(t));

    // Dictionary Lookup (Synonyms)
    tokens.forEach(token => {
        if (PERSIAN_SYNONYMS[token]) {
            PERSIAN_SYNONYMS[token].forEach(syn => expandedTokens.add(syn));
        }
        for (const [key, values] of Object.entries(PERSIAN_SYNONYMS)) {
            if (values.includes(token)) {
                expandedTokens.add(key);
                values.forEach(v => expandedTokens.add(v));
            }
        }
    });

    const queryStr = normalizedQuery;

    // Logic: Comparison & Difference (مقایسه و تفاوت)
    if (queryStr.includes('تفاوت') || queryStr.includes('فرق') || queryStr.includes('مقایسه') || queryStr.includes('چه فرقی')) {
        expandedTokens.add('تعریف');
        expandedTokens.add('ویژگی');
        expandedTokens.add('کارکرد');
        expandedTokens.add('محدودیت');
        expandedTokens.add('وظایف');
        expandedTokens.add('definition');
        
        if (queryStr.includes('شعبه') || queryStr.includes('باجه')) {
            expandedTokens.add('دسترسی');
            expandedTokens.add('مجوز');
            expandedTokens.add('نمایندگی');
        }
    }

    // Logic: Change Broker Supervisor (تغییر کارگزار ناظر)
    // Fix: Injects keywords found in the solution document (Upload, File, Request)
    if (queryStr.includes('ناظر') && (queryStr.includes('تغییر') || queryStr.includes('عوض') || queryStr.includes('روش'))) {
        expandedTokens.add('تغییر ناظر');
        expandedTokens.add('کارگزار ناظر');
        expandedTokens.add('ثبت درخواست'); // Critical for matching "Request"
        expandedTokens.add('آپلود فایل');  // Critical for matching "Upload"
        expandedTokens.add('برگه سهم');    // Critical for matching "Share Certificate"
        expandedTokens.add('تاریخچه');
    }
    
    // Logic: ETF Types (انواع صندوق)
    if (queryStr.includes('انواع') && (queryStr.includes('صندوق') || queryStr.includes('etf'))) {
        expandedTokens.add('درآمد ثابت');
        expandedTokens.add('سهامی');
        expandedTokens.add('مختلط');
        expandedTokens.add('طلا');
        expandedTokens.add('شاخصی');
        expandedTokens.add('اهرمی');
    }

    return Array.from(expandedTokens).join(' ');
};

export const extractCriticalTerms = (query: string): string[] => {
    const terms: string[] = [];
    const normalizedQuery = normalizeForSearch(query);
    
    const numbers = normalizedQuery.match(/\d{3,}/g);
    if (numbers) terms.push(...numbers);

    // Enhanced English detection to catch short technical terms like "page", "api", "nav"
    const englishWords = normalizedQuery.match(/[a-zA-Z0-9\+\-]{2,}/g);
    if (englishWords) {
        const validEnglish = englishWords.filter(w => {
            // Keep if length > 3 OR if it's a known short domain keyword
            return w.length > 3 || ['api', 'nav', 'etf', 'ip', 'oms', 'app', 'pwa', 'dps', 'eps', 'otp', '2fa'].includes(w);
        }); 
        terms.push(...validEnglish);
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

export const calculateKeywordScore = (chunk: KnowledgeChunk, terms: string[], originalQuery: string): number => {
    if (terms.length === 0) return 0;
    
    const contentStr = (chunk.searchContent + " " + chunk.content + " " + 
                       (chunk.metadata?.ticketId || "") + " " + 
                       (chunk.metadata?.subCategory || "")).toLowerCase();
    const normalizedContent = normalizeForSearch(contentStr);
    
    let matches = 0;
    let exactPhraseBonus = 0;
    
    terms.forEach(term => {
        const termLower = term.toLowerCase();
        if ((` ${normalizedContent} `).includes(` ${termLower} `)) {
            matches++;
            // Boost for technical terms matching exactly
            if (['page', 'offset', 'api', 'serkhat', 'ناظر', 'سرخط'].includes(termLower)) {
                matches += 0.5;
            }
        }
    });
    
    // Heuristic: Check for Error Message phrases
    if (originalQuery.includes('خطا') || originalQuery.includes('پیغام')) {
        if (normalizedContent.includes('دارایی سهم به میزان کافی وجود ندارد')) exactPhraseBonus += 0.5;
        if (normalizedContent.includes('کاربر گرامی حساب کاربری شما')) exactPhraseBonus += 0.5;
    }

    // Normalized score (0 to 1) based on how many terms matched
    const rawScore = (matches / terms.length) + exactPhraseBonus;
    return Math.min(1.0, rawScore); 
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
    useGeneralKnowledge: boolean = false
): Promise<QueryResult> => {
  const settings = getSettings();
  const startTime = Date.now();
  
  if (knowledgeBase.length === 0) return { text: "پایگاه دانش خالی است.", sources: [] };

  try {
      const normalizedOriginalQuery = normalizeForSearch(query);
      const criticalTerms = extractCriticalTerms(query);
      
      const comparisonKeywords = ['فرق', 'تفاوت', 'مقایسه', 'تمایز', 'vs', 'difference', 'چیست'];
      const isComparison = comparisonKeywords.some(k => query.includes(k)) && criticalTerms.length >= 1;

      if (onStatusUpdate) {
          onStatusUpdate({
              step: 'analyzing',
              extractedKeywords: criticalTerms,
              processingTime: 0
          });
      }
      
      const vectorQuery = query.trim();
      const expandedQueryForKeywords = await expandQuery(query);
      
      // We only use Expanded Terms for searching if critical terms are sparse
      const scoringTerms = [...new Set([...criticalTerms])];
      if (scoringTerms.length < 3) { // Increased threshold to include expanded terms more often
          const expandedTermsArray = expandedQueryForKeywords.split(' ')
            .filter(t => !PERSIAN_STOP_WORDS.has(t) && t.length > 2);
          scoringTerms.push(...expandedTermsArray);
      }
      
      // Explicitly add "change supervisor" specific terms to scoring if detected
      if (normalizedOriginalQuery.includes('ناظر') && normalizedOriginalQuery.includes('تغییر')) {
          scoringTerms.push('ثبت درخواست');
          scoringTerms.push('آپلود');
      }

      if (onStatusUpdate) {
          onStatusUpdate({
              step: 'vectorizing',
              extractedKeywords: criticalTerms,
              expandedQuery: expandedQueryForKeywords, 
              processingTime: Date.now() - startTime
          });
      }
      
      let queryVec: number[] | null = null;
      let isVectorValid = false;
      const definitionVectors: number[][] = [];
      
      try {
        queryVec = await getEmbedding(vectorQuery, true);
        const isZeroVector = queryVec.every(v => v === 0);
        if (!isZeroVector) isVectorValid = true;

        if (isComparison) {
            // Get vectors for "What is X?" to find definitions
            const entities = criticalTerms.filter(t => !comparisonKeywords.includes(t)).slice(0, 3);
            for (const entity of entities) {
                const defVec = await getEmbedding(`${entity} چیست`, true);
                if (!defVec.every(v => v === 0)) {
                    definitionVectors.push(defVec);
                }
            }
        }
      } catch (e) {
        console.error("Vector Embedding Failed:", e);
      }

      const targetChunks = categoryFilter 
          ? knowledgeBase.filter(k => k.metadata?.category === categoryFilter)
          : knowledgeBase;

      const scoreChunk = (chunk: KnowledgeChunk): number => {
          let vectorScore = 0;
          if (isVectorValid && chunk.embedding && chunk.embedding.length > 0) {
              vectorScore = cosineSimilarity(queryVec!, chunk.embedding);
              
              // If we have definition vectors, check if this chunk matches ANY of them strongly
              if (definitionVectors.length > 0) {
                  let bestDefScore = 0;
                  for (const defVec of definitionVectors) {
                      const ds = cosineSimilarity(defVec, chunk.embedding);
                      if (ds > bestDefScore) bestDefScore = ds;
                  }
                  // Boost vector score if it matches a definition well
                  vectorScore = Math.max(vectorScore, bestDefScore);
              }
          }
          
          let finalScore = vectorScore;

          if (scoringTerms.length > 0) {
              const kwScore = calculateKeywordScore(chunk, scoringTerms, normalizedOriginalQuery);
              if (kwScore > 0) {
                  // REBALANCED: Trust Vectors (80%) more than Keywords (20%)
                  // This allows "Semantic" matches (Definitions) to outrank "Keyword" matches (Random mentions in UI lists)
                  // However, if we have a match, we give a slight boost to ensure we don't lose relevant docs
                  
                  // NEW: If Keyword Score is very high (Exact Match on Technical Terms), boost significantly
                  if (kwScore > 0.8) {
                      finalScore = (vectorScore * 0.4) + (kwScore * 0.6) + 0.1;
                  } else {
                      finalScore = (vectorScore * 0.8) + (kwScore * 0.2) + 0.05; 
                  }
              }
          } 
          
          return isNaN(finalScore) ? 0 : finalScore;
      };

      let scoredDocs = targetChunks.map(chunk => ({
          chunk, 
          score: scoreChunk(chunk)
      }));

      const retrievalCount = 40; // Increased retrieval window
      let topDocs = scoredDocs
        .sort((a, b) => b.score - a.score)
        .slice(0, retrievalCount); 

      if (onStatusUpdate) {
          const uniqueCandidates = [];
          for (const doc of topDocs) {
              uniqueCandidates.push({ title: doc.chunk.source.title, score: doc.score });
              if (uniqueCandidates.length >= 4) break;
          }

          onStatusUpdate({
              step: 'searching',
              retrievedCandidates: uniqueCandidates,
              processingTime: Date.now() - startTime
          });
      }

      const effectiveMinConfidence = settings.minConfidence || 0.15;
      const validDocs = topDocs.filter(d => d.score >= effectiveMinConfidence);

      if (validDocs.length === 0 && !useGeneralKnowledge) {
          return {
              text: "در مستندات بارگذاری شده، اطلاعاتی در این مورد یافت نشد.",
              sources: [],
              debugInfo: {
                strategy: 'Blocked by Confidence Threshold',
                processingTimeMs: Date.now() - startTime,
                candidateCount: 0,
                logicStep: `Top Score (${topDocs[0]?.score?.toFixed(2)}) < ${effectiveMinConfidence}`,
                extractedKeywords: criticalTerms
              }
          };
      }

      // Increase context window
      // UPDATED: Use strictly Persian headers to anchor the model
      const contextText = validDocs.slice(0, 10).map(d => {
        const meta = d.chunk.metadata;
        const metaStr = `[دسته: ${meta?.category} | زیردسته: ${meta?.subCategory}]`;
        return `--- منبع: ${d.chunk.source.title} ${metaStr} ---\n${d.chunk.content}`;
      }).join('\n\n');

      // UPDATED: Strict Persian Prompt Structure (Anchoring)
      const promptContent = `
مستندات (Context):
${contextText}

سوال کاربر (Question):
${query}

دستورالعمل (Instruction):
${isComparison 
    ? 'تو یک دستیار هوشمند فارسی‌زبان هستی. کاربر تفاوت بین مفاهیم را پرسیده است. با استفاده از مستندات بالا، تفاوت‌ها را استخراج و به زبان فارسی توضیح بده. اگر مقایسه مستقیم نیست، ویژگی‌های هر کدام را جداگانه بنویس.' 
    : 'تو یک دستیار هوشمند فارسی‌زبان هستی. پاسخ سوال کاربر را فقط با استفاده از مستندات بالا و به زبان فارسی بنویس.'}

قوانین مهم:
۱. پاسخ باید **کاملاً فارسی** باشد. از نوشتن به زبان‌های دیگر (انگلیسی، چینی، روسی و...) اکیداً خودداری کن.
۲. اگر پاسخ در مستندات نیست، فقط بگو: "در مستندات موجود، اطلاعاتی یافت نشد."
3. از دانش عمومی خود استفاده نکن.

پاسخ نهایی:`;

      const response = await fetch(`${settings.ollamaBaseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: settings.chatModel,
          stream: false,
          messages: [
            { role: 'system', content: settings.systemPrompt },
            { 
              role: 'user', 
              content: promptContent
            }
          ],
          options: { temperature: settings.temperature }
        }),
      });

      if (!response.ok) throw new Error("Ollama Generation Failed");
      const data = await response.json();
      
      let generatedText = data.message?.content || "";

      generatedText = generatedText
          .replace(/<unused\d+>/gi, "") 
          .replace(/<pad>/gi, "")
          .replace(/<s>/gi, "")
          .replace(/<\/s>/gi, "")
          .replace(/\[CONTEXT\]/gi, "") 
          .replace(/CONTEXT:/gi, "")
          .replace(/QUESTION:/gi, "")
          .replace(/ANSWER:/gi, "")
          .replace(/متن‌های مرجع:/g, "")
          .replace(/سوال کاربر:/g, "")
          .replace(/پاسخ شما:/g, "")
          .replace(/مستندات \(Context\):/g, "")
          .replace(/دستورالعمل \(Instruction\):/g, "")
          .replace(/پاسخ نهایی:/g, "")
          .trim();
      
      const uniqueSourcesMap = new Map<string, Source>();
      validDocs.slice(0, 10).forEach(d => {
          const key = `${d.chunk.source.id}-${d.chunk.source.page}`;
          if (!uniqueSourcesMap.has(key)) {
              uniqueSourcesMap.set(key, {
                  ...d.chunk.source,
                  score: d.score,
                  metadata: d.chunk.metadata
              });
          }
      });
      const sourcesWithMeta = Array.from(uniqueSourcesMap.values());

      return { 
          text: generatedText, 
          sources: sourcesWithMeta, 
          debugInfo: {
              strategy: isComparison ? 'Semantic Comparison (Vector Heavy)' : 'Standard RAG',
              processingTimeMs: Date.now() - startTime,
              candidateCount: validDocs.length,
              logicStep: 'Success',
              extractedKeywords: criticalTerms
          }
      };

  } catch (error: any) {
    console.error('RAG Error:', error);
    return { text: "خطا در پردازش درخواست.", sources: [], error: error.message };
  }
};
