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

/**
 * Generates multiple diverse search queries to cover semantic gaps.
 * Used when initial search fails.
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
                options: { temperature: 0.7 } // Higher temp for diversity
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
        if (DOMAIN_KEYWORDS.has(token) || token.length >= 4) { 
            terms.push(token);
        }
    });

    return [...new Set(terms)]; 
};

// Original Keyword Scorer (Used for initial retrieval)
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
    
    if (matchedTermsCount > 0) {
        score += (matchedTermsCount / terms.length) * 0.6;
    }
    
    if (matchedTermsCount === terms.length && terms.length > 1) {
        score += 0.3;
    }

    const words = normalizedQuery.split(' ').filter(w => w.length > 2);
    for (let i = 0; i < words.length - 1; i++) {
        const biGram = words[i] + " " + words[i+1];
        if (normalizedContent.includes(biGram)) {
            score += 0.3;
        }
    }

    return score; 
};

// --- RE-RANKING ALGORITHM ---
// This acts as a precise filter after the initial vector retrieval.
export const calculateAdvancedScore = (chunk: KnowledgeChunk, terms: string[], query: string): number => {
    const content = normalizeForSearch(chunk.content + " " + chunk.searchContent);
    let score = 0;
    
    // 1. Exact Match Bonus for Critical Identifiers (e.g., Error Codes, Ticket IDs)
    const errorCodes = query.match(/\d{3,}/g);
    if (errorCodes) {
        errorCodes.forEach(code => {
            if (content.includes(code)) score += 5.0; // Huge boost for exact ID match
        });
    }

    // 2. Term Density Check
    if (terms.length === 0) return 0.5; // Neutral if no critical terms

    let foundTerms = 0;
    terms.forEach(term => {
        if (content.includes(term.toLowerCase())) foundTerms++;
    });
    
    // Relaxed Scoring: Removed strict 0.4 threshold.
    // Instead, we just award points. Vector score will handle semantic matches.
    if (foundTerms > 0) {
        score += (foundTerms / terms.length) * 1.5;
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
        const kwScore = calculateKeywordScore(chunk, criticalTerms, synonymExpandedQuery);
        return { id: chunk.id, chunk, vectorScore, kwScore };
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
    history: Message[] = []
): Promise<QueryResult> => {
    const settings = getSettings();
    const startTime = Date.now();

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

    // 3. Rank & Filter (TWO-STAGE PROCESS)
    
    // Stage A: Initial Retrieval (Recall)
    // Get top 30 candidates based primarily on Vector score to ensure we don't miss semantic matches.
    let initialCandidates = scoredChunks.map(item => {
        // Initial score: Vector (80%) + Keyword (20%)
        const initialScore = (item.vectorScore * 0.8) + (item.kwScore * 0.2);
        return { ...item, initialScore };
    }).sort((a, b) => b.initialScore - a.initialScore).slice(0, 30);

    // Stage B: Re-ranking (Precision)
    let ranked = initialCandidates.map(item => {
        const advScore = calculateAdvancedScore(item.chunk, criticalTerms, effectiveQuery);
        
        // Final Score combines Vector accuracy with Term Density
        // Removed hard filter for 0 advScore to allow semantic matches to survive
        const finalScore = item.vectorScore + advScore;
        return { ...item, finalScore };
    })
    .sort((a, b) => b.finalScore - a.finalScore);

    let topCandidates = ranked.filter(r => r.finalScore >= settings.minConfidence);

    // 4. Fallback Strategy: Multi-Query
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
                 const advScore = calculateAdvancedScore(item.chunk, altResult.criticalTerms, altQ);
                 const initialScore = (item.vectorScore * 0.8) + (item.kwScore * 0.2);
                 return { ...item, initialScore, finalScore: item.vectorScore + advScore };
            })
            .filter(r => r.finalScore >= settings.minConfidence)
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

    onProgress?.({ 
        step: 'searching', 
        retrievedCandidates: topCandidates.slice(0, 5).map(c => ({ title: c.chunk.source.id, score: c.finalScore, accepted: true })),
        extractedKeywords: criticalTerms,
        processingTime: Date.now() - startTime 
    });

    if (topCandidates.length === 0) {
        return {
            text: "متاسفانه اطلاعاتی در مورد سوال شما در مستندات یافت نشد.",
            sources: [],
            debugInfo: {
                strategy: 'No Matches',
                processingTimeMs: Date.now() - startTime,
                candidateCount: 0,
                logicStep: 'Search yielded zero results above threshold',
                extractedKeywords: criticalTerms
            }
        };
    }

    const selectedChunks = topCandidates.slice(0, 5);
    const contextText = selectedChunks.map(c => 
        `[منبع: ${c.chunk.source.id}]\n${c.chunk.content}`
    ).join('\n\n');

    // 5. Generate Answer
    onProgress?.({ step: 'generating', processingTime: Date.now() - startTime });

    const systemPrompt = settings.systemPrompt;
    const userPrompt = `
سوال کاربر: ${query}

مستندات یافت شده:
${contextText}

با توجه به مستندات بالا، به سوال پاسخ دهید.
`;

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
                options: { 
                    temperature: temperatureOverride ?? settings.temperature 
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
                strategy: 'RAG (Re-ranked)',
                processingTimeMs: Date.now() - startTime,
                candidateCount: topCandidates.length,
                logicStep: 'Answer generated from top candidates',
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