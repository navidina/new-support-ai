
import { KnowledgeChunk, Source, DebugInfo, QueryResult, PipelineData, Message, SearchOverrides } from '../types';
import { getEmbedding } from './ollama';
import { getSettings } from './settings';
import { PERSIAN_SYNONYMS } from './synonymsData';
import { cleanAndNormalizeText } from './textProcessor'; 
import { rerankChunks } from './reranker';

const PERSIAN_STOP_WORDS = new Set([
    'از', 'به', 'با', 'برای', 'در', 'هم', 'و', 'که', 'را', 'این', 'آن', 'است', 'هست', 'بود', 'شد', 'می', 
    'یک', 'تا', 'بر', 'یا', 'نیز', 'باید', 'شاید', 'اما', 'اگر', 'روی', 'زیر', 'های', 'ها', 'تر', 'ترین',
    'کند', 'کنند', 'کرده', 'داشت', 'دارد', 'شود', 'میشود', 'نشود', 'باعث', 'مورد', 'جهت', 'توسط', 'بنابراین', 'سپس',
    'ولی', 'لیکن', 'چون', 'چنانچه', 'لطفا', 'ممنون', 'متشکرم', 'بی‌زحمت', 'سلام', 'خسته', 'نباشید',
    'توضیح', 'بده', 'بگو', 'هستش', 'انجام',
    'رو', 'میشه', 'لطفاً', 'بگید', 'بفرمایید',
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
    'نمایندگی', 'دسترسی', 'مجوز', 'روش', 'نحوه', 'مراحل', 't+1', 't+2',
    'خطا', 'ارور', 'error', 'باگ', 'مشکل'
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

/**
 * Generates multiple diverse search queries to cover semantic gaps.
 */
const generateMultiQueries = async (originalQuery: string): Promise<string[]> => {
    const settings = getSettings();
    const prompt = `
You are an AI search expert. The user's query failed to find results in a technical manual.
Generate 3 distinct, alternative Persian search queries to find the answer.
Strategies:
1. Break down complex questions.
2. Use technical synonyms (e.g. "Branch" -> "Station").
3. Focus on related entities (e.g. "Error 100" -> "Connection Error").

Query: "${originalQuery}"

Output Format: Just 3 lines of Persian queries. No numbering.
    `.trim();

    try {
        const response = await fetch(`${settings.ollamaBaseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: settings.chatModel,
                stream: false,
                messages: [{ role: 'user', content: prompt }],
                options: { temperature: 0.7 } 
            }),
        });
        if (!response.ok) return [originalQuery];
        const data = await response.json();
        const content = data.message?.content?.trim() || "";
        const lines = content.split('\n').map(l => l.replace(/^\d+[\.\-]\s*/, '').trim()).filter(l => l.length > 3);
        return lines.slice(0, 3);
    } catch (e) {
        return [originalQuery];
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
        if (DOMAIN_KEYWORDS.has(token) || token.length >= 3) { 
            terms.push(token);
        }
    });

    return [...new Set(terms)]; 
};

// Calculates Keyword Density (0.0 to 1.0)
export const calculateKeywordDensity = (chunk: KnowledgeChunk, terms: string[]): number => {
    if (terms.length === 0) return 0;
    
    const contentStr = (chunk.searchContent + " " + chunk.content).toLowerCase();
    const normalizedContent = normalizeForSearch(contentStr);

    let matchedTermsCount = 0;
    terms.forEach(term => {
        if (normalizedContent.includes(term.toLowerCase())) {
            matchedTermsCount++;
        }
    });
    
    return matchedTermsCount / terms.length;
};

// --- RE-RANKING ALGORITHM (NORMALIZED) ---
// Returns a boost factor between 0.0 and 0.5 (additive), NOT integer values like 8.0
export const calculateAdvancedScoreBoost = (chunk: KnowledgeChunk, terms: string[], query: string): number => {
    const content = normalizeForSearch(chunk.content + " " + chunk.searchContent);
    let boost = 0.0;
    
    // 1. Exact Match for Critical Identifiers (e.g., Error Codes, Ticket IDs)
    // This is the only case where we allow a massive override, but handled via a flag in main process.
    // Here we just give a strong boost.
    const errorCodes = query.match(/\d{3,}/g);
    let hasExactIdMatch = false;
    if (errorCodes) {
        errorCodes.forEach(code => {
            if (content.includes(code)) {
                hasExactIdMatch = true;
            }
        });
    }
    
    if (hasExactIdMatch) return 0.5; // Max boost for ID match

    // 2. Keyword Density Boost
    if (terms.length === 0) return 0.0;

    let foundTerms = 0;
    let foundDomainTerms = 0;

    terms.forEach(term => {
        if (content.includes(term.toLowerCase())) {
            foundTerms++;
            if (DOMAIN_KEYWORDS.has(term)) {
                foundDomainTerms++;
            }
        }
    });
    
    const density = foundTerms / terms.length;
    
    // Linearly map density 0..1 to boost 0..0.3
    boost += density * 0.3;

    // Small bonus for domain specific terms
    if (foundDomainTerms > 0) boost += 0.05;

    return boost;
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

const executeSearchPass = async (
    searchQuery: string,
    knowledgeBase: KnowledgeChunk[],
    categoryFilter?: string
) => {
    const synonymExpandedQuery = expandQueryWithSynonyms(searchQuery);
    const criticalTerms = extractCriticalTerms(synonymExpandedQuery);
    
    const mainVec = await getEmbedding(synonymExpandedQuery, true);
    
    const targetChunks = categoryFilter 
        ? knowledgeBase.filter(k => k.metadata?.category === categoryFilter)
        : knowledgeBase;

    const scoredChunks = targetChunks.map(chunk => {
        let vectorScore = 0;
        if (chunk.embedding) {
            vectorScore = cosineSimilarity(mainVec, chunk.embedding);
        }
        
        // Calculate raw density for initial sort
        const density = calculateKeywordDensity(chunk, criticalTerms);
        
        return { id: chunk.id, chunk, vectorScore, density };
    });

    return { scoredChunks, criticalTerms, expandedQuery: synonymExpandedQuery };
};

/**
 * Main RAG Query Processor
 */
export const processQuery = async (
    query: string,
    knowledgeBase: KnowledgeChunk[],
    onProgress?: (data: PipelineData) => void,
    categoryFilter?: string,
    temperatureOverride?: number,
    useWebSearch: boolean = false,
    history: Message[] = [],
    searchOverrides?: SearchOverrides
): Promise<QueryResult> => {
    const settings = getSettings();
    const startTime = Date.now();

    // Configuration Merging
    const effectiveMinConfidence = searchOverrides?.minConfidence ?? settings.minConfidence;
    const effectiveVectorWeight = searchOverrides?.vectorWeight ?? settings.vectorWeight ?? 0.8; 
    const effectiveKeywordWeight = 1.0 - effectiveVectorWeight;

    // 1. Analyze and Rewrite Query
    onProgress?.({ step: 'analyzing', processingTime: Date.now() - startTime });
    const effectiveQuery = await rewriteQueryWithHistory(query, history);

    // 2. Vectorize and Search
    onProgress?.({ 
        step: 'vectorizing', 
        expandedQuery: effectiveQuery, 
        processingTime: Date.now() - startTime 
    });

    let { scoredChunks, criticalTerms, expandedQuery } = await executeSearchPass(effectiveQuery, knowledgeBase, categoryFilter);

    // 3. Stage 1: Broad Recall (Get top 30 candidates based on Hybrid Score)
    
    let initialRanked = scoredChunks.map(item => {
        const boost = calculateAdvancedScoreBoost(item.chunk, criticalTerms, effectiveQuery);
        
        // Weighted Score Formula:
        let weightedScore = (item.vectorScore * effectiveVectorWeight) + (item.density * effectiveKeywordWeight);
        
        // Special Case: Semantic Mismatch Protection
        if (item.vectorScore < 0.25 && boost < 0.4) {
             weightedScore *= 0.5; 
        } else {
             weightedScore += boost;
        }

        const finalScore = Math.min(1.0, Math.max(0, weightedScore));

        return { ...item, finalScore };
    })
    .sort((a, b) => b.finalScore - a.finalScore);

    // Lower threshold for Recall stage to cast a wider net
    let broadCandidates = initialRanked
        .filter(r => r.finalScore >= (effectiveMinConfidence * 0.5))
        .slice(0, 30); // Grab top 30 for reranking

    // 4. Stage 2: Reranking (Cross-Encoder Precision)
    onProgress?.({ 
        step: 'reranking', 
        processingTime: Date.now() - startTime,
        expandedQuery: "Applying BGE-M3 Cross-Encoder..."
    });

    let topCandidates: any[] = [];

    if (broadCandidates.length > 0) {
        // Map to structure expected by reranker { content: string, ... }
        const candidatesForRerank = broadCandidates.map(c => ({
            ...c,
            content: c.chunk.content // Reranker needs content
        }));

        try {
            // Rerank using BGE-M3 (Transformers.js)
            const rerankedResults = await rerankChunks(effectiveQuery, candidatesForRerank, 8); // Get Top 8 Golden results
            
            // Map back to our structure, replacing score with high-precision Rerank Score
            topCandidates = rerankedResults.map((r: any) => ({
                id: r.id,
                chunk: r.chunk,
                vectorScore: r.vectorScore,
                density: r.density,
                finalScore: r.rerankScore // Trust the Cross-Encoder score
            }));
            
        } catch (e) {
            console.error("Reranking failed, falling back to hybrid score", e);
            topCandidates = broadCandidates.slice(0, 8);
        }
    }

    // Fallback Strategy: Multi-Query if Broad Recall failed
    if (topCandidates.length === 0) {
        onProgress?.({ 
            step: 'searching', 
            processingTime: Date.now() - startTime,
            expandedQuery: "Retrying with Multi-Query strategy..." 
        });
        
        const altQueries = await generateMultiQueries(effectiveQuery);
        for (const altQ of altQueries) {
            const altResult = await executeSearchPass(altQ, knowledgeBase, categoryFilter);
            
            const altRanked = altResult.scoredChunks.map(item => {
                 const boost = calculateAdvancedScoreBoost(item.chunk, altResult.criticalTerms, altQ);
                 const weightedScore = (item.vectorScore * effectiveVectorWeight) + (item.density * effectiveKeywordWeight);
                 const finalScore = Math.min(1.0, weightedScore + boost);
                 return { ...item, finalScore };
            })
            .filter(r => r.finalScore >= effectiveMinConfidence)
            .sort((a, b) => b.finalScore - a.finalScore)
            .slice(0, 3); 
            
            altRanked.forEach(ar => {
                if (!topCandidates.some(tc => tc.id === ar.id)) {
                    topCandidates.push(ar);
                }
            });
        }
        topCandidates.sort((a, b) => b.finalScore - a.finalScore);
    }

    const selectedChunks = topCandidates.slice(0, 8);

    onProgress?.({ 
        step: 'searching', 
        retrievedCandidates: selectedChunks.map(c => ({ title: c.chunk.source.id, score: c.finalScore, accepted: true })),
        extractedKeywords: criticalTerms,
        processingTime: Date.now() - startTime 
    });

    if (topCandidates.length === 0) {
        return {
            text: "متاسفانه اطلاعاتی در مورد سوال شما در مستندات یافت نشد. لطفاً سوال را با جزئیات بیشتری بپرسید.",
            sources: [],
            debugInfo: {
                strategy: searchOverrides?.strategyName || 'No Matches',
                processingTimeMs: Date.now() - startTime,
                candidateCount: 0,
                logicStep: 'Search yielded zero results above threshold',
                extractedKeywords: criticalTerms
            }
        };
    }

    const contextText = selectedChunks.map(c => 
        `[منبع: ${c.chunk.source.id} | صفحه: ${c.chunk.source.page}]\n${c.chunk.content}`
    ).join('\n\n');

    // 5. Generate Answer
    onProgress?.({ step: 'generating', processingTime: Date.now() - startTime });

    const systemPrompt = `
نقش: شما یک ماشین پاسخ‌دهی دقیق مبتنی بر واقعیت هستید. شما دستیار یا مشاور نیستید؛ فقط استخراج‌کننده اطلاعات هستید.

قوانین حیاتی و غیرقابل‌تخطی:
۱. [محدوده پاسخ] فقط و فقط به سوالی که پرسیده شده پاسخ دهید. از ارائه "اطلاعات تکمیلی"، "نکات مرتبط" یا "آموزش‌های اضافی" اکیداً خودداری کنید.
۲. [منبع] پاسخ شما باید کلمه به کلمه بر اساس تگ <CONTEXT> باشد. اگر در کانتکست نیست، بنویسید: "اطلاعاتی در مستندات یافت نشد".
۳. [خلاصه] پاسخ باید کوتاه، مستقیم و بدون مقدمه‌چینی (مثل "با توجه به متن...") باشد.
۴. [وفاداری] هیچ دانش قبلی یا اطلاعات عمومی را ترکیب نکنید.

فرمت ورودی:
<CONTEXT>
{متن مستندات}
</CONTEXT>

<QUESTION>
{سوال کاربر}
</QUESTION>
`;
    
    // STRICT FORMATTING FOR QWEN
    const contextWithTags = `<CONTEXT>\n${contextText}\n</CONTEXT>`;
    const questionWithTags = `<QUESTION>\n${query}\n</QUESTION>`;
    const finalUserMessage = `${contextWithTags}\n${questionWithTags}\n\nپاسخ نهایی:`;

    try {
        const response = await fetch(`${settings.ollamaBaseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: settings.chatModel,
                stream: false,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: finalUserMessage }
                ],
                options: { 
                    temperature: 0.1, // Slight incr to prevent loop, still strict
                    num_ctx: 4096,
                    stop: ["<|im_end|>", "User:", "System:"]
                }
            }),
        });

        if (!response.ok) {
            throw new Error(`Ollama API Error (${response.status})`);
        }

        const data = await response.json();
        const generatedText = data.message?.content || "";

        return {
            text: generatedText,
            sources: selectedChunks.map(c => c.chunk.source),
            debugInfo: {
                strategy: searchOverrides?.strategyName || 'RAG (Hybrid + BGE Reranker)',
                processingTimeMs: Date.now() - startTime,
                candidateCount: topCandidates.length,
                logicStep: '2-Stage Retrieval (Vector Recall -> Cross-Encoder Precision)',
                extractedKeywords: criticalTerms
            }
        };

    } catch (error: any) {
         if (error.name === 'TypeError' && error.message.includes('fetch')) {
             return {
                 text: "خطا در ارتباط با سرور هوش مصنوعی (Ollama). لطفا اتصال را بررسی کنید.",
                 sources: [],
                 error: "OLLAMA_CONNECTION_REFUSED"
             };
         }
         return {
             text: `خطا در تولید پاسخ: ${error.message}`,
             sources: [],
             error: error.message
         };
    }
};
