
import { getEmbedding, cosineSimilarity } from './ollama';
import { getSettings } from './settings';
import { PERSIAN_SYNONYMS } from './synonymsData';
import { cleanAndNormalizeText } from './textProcessor'; 
import { calculateKeywordScore } from './reranker'; // Imported explicitly
import { SearchOverrides } from '../types';

const SUPPORT_ADVISOR_PROMPT = `
شما یک "مشاور فنی ارشد" هستید. وظیفه شما راهنمایی کارشناس پشتیبانی برای حل تیکت مشتری است.
۱. تحلیل مشکل: ریشه مشکل را بر اساس مستندات حدس بزنید.
۲. آدرس‌دهی: بگویید کدام منو یا فایل مرتبط است.
۳. راهکار: گام‌های اجرایی برای کارشناس را بنویسید.
لحن شما خطاب به "همکار پشتیبان" باشد.
`;

const expandQueryWithSynonyms = (query: string) => {
    let expanded = query;
    const lowerQuery = cleanAndNormalizeText(query).toLowerCase();
    Object.entries(PERSIAN_SYNONYMS).forEach(([official, synonyms]) => {
        if (synonyms.some(syn => lowerQuery.includes(syn.toLowerCase()))) {
            if (!lowerQuery.includes(official.toLowerCase())) {
                expanded += " " + official;
            }
        }
    });
    return expanded;
};

export const processQuery = async (
    query: string,
    knowledgeBase: any[],
    onProgress: any,
    categoryFilter?: string,
    temperatureOverride?: number, 
    useWebSearch = false,
    history: any[] = [],
    searchOverrides: SearchOverrides = {},
    isAdvisorMode = false 
) => {
    const globalSettings = getSettings();
    
    // Merge overrides with global settings
    const settings = { 
        ...globalSettings, 
        ...searchOverrides,
        temperature: searchOverrides.temperature ?? temperatureOverride ?? globalSettings.temperature,
        minConfidence: searchOverrides.minConfidence ?? globalSettings.minConfidence,
        vectorWeight: searchOverrides.vectorWeight ?? globalSettings.vectorWeight,
        enableReranker: searchOverrides.enableReranker ?? globalSettings.enableReranker
    };

    const startTime = Date.now();

    try {
        const expandedQuery = expandQueryWithSynonyms(query);
        onProgress?.({ step: 'vectorizing', expandedQuery });
        
        const queryVec = await getEmbedding(expandedQuery, true);

        // --- TRUE HYBRID SEARCH LOGIC ---
        // Instead of filtering by vector score first, we calculate hybrid score for ALL candidates immediately.
        // This ensures a document with 0.2 vector score but 1.0 keyword score doesn't get filtered out.
        
        onProgress?.({ step: 'searching' });

        const scored = knowledgeBase
            .filter(k => !categoryFilter || k.metadata?.category === categoryFilter)
            .map(chunk => {
                const vectorScore = chunk.embedding ? cosineSimilarity(queryVec, chunk.embedding) : 0;
                
                // Calculate keyword score immediately (Lightweight operation)
                const keywordScore = calculateKeywordScore(expandedQuery, chunk.content);
                
                // Hybrid Score Formula: (Vector * Weight) + (Keyword * (1 - Weight))
                // Default settings: Vector=0.35, Keyword=0.65 (Favors exact matches)
                const hybridScore = (vectorScore * settings.vectorWeight) + (keywordScore * (1.0 - settings.vectorWeight));

                return {
                    chunk,
                    score: hybridScore, 
                    vectorScore, 
                    keywordScore,
                    // Attach explicit hybrid score for UI visualization
                    rerankScore: hybridScore 
                };
            })
            // Loose filter to remove absolute noise (e.g., score < 0.15)
            // We use a lower threshold than settings.minConfidence to ensure high-recall first pass
            .filter(item => item.score >= 0.15) 
            .sort((a, b) => b.score - a.score)
            .slice(0, 25); // Take top 25 candidates

        // Since we already calculated hybrid scores, "Reranking" is effectively done.
        // However, if we want to simulate the pipeline visual or do extra logic, we can keep the variable name.
        const topChunks = scored.map(s => ({
            ...s.chunk,
            rerankScore: s.score,
            debug: { vector: s.vectorScore, keyword: s.keywordScore }
        }));
        
        if (topChunks.length === 0) {
            return { text: "اطلاعاتی با اطمینان کافی یافت نشد.", sources: [], isAmbiguous: false, options: [] };
        }

        onProgress?.({ step: 'generating' });
        
        // Include Score in context for the LLM to know confidence
        const context = topChunks.map(c => `[سند: ${c.source.id} (Score: ${c.rerankScore?.toFixed(2)})]\n${c.content}`).join('\n\n---\n\n');
        const systemInstruction = isAdvisorMode ? SUPPORT_ADVISOR_PROMPT : settings.systemPrompt;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 90000); // 90s Timeout

        try {
            const response = await fetch(`${settings.ollamaBaseUrl}/chat/completions`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: settings.chatModel,
                    messages: [
                        { role: 'system', content: systemInstruction },
                        { role: 'user', content: `CONTEXT:\n${context}\n\nQUESTION: ${query}` }
                    ],
                    temperature: settings.temperature,
                    stream: false
                }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`API Error ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            const replyText = data.choices?.[0]?.message?.content || "پاسخی از مدل دریافت نشد.";

            return {
                text: replyText,
                sources: topChunks.map(c => c.source),
                isAmbiguous: false,
                options: [],
                debugInfo: { 
                    strategy: searchOverrides.strategyName || (isAdvisorMode ? 'Advisor' : 'TrueHybrid'), 
                    processingTimeMs: Date.now() - startTime, 
                    candidateCount: topChunks.length, 
                    logicStep: `Hybrid(V:${settings.vectorWeight})`, 
                    extractedKeywords: [] 
                }
            };
        } catch (err) {
            const fetchError = err as any; 
            clearTimeout(timeoutId);
            if (fetchError.name === 'AbortError') {
                throw new Error("تایم‌اوت ارتباط با مدل. لطفاً بررسی کنید LM Studio در حال اجرا باشد.");
            }
            if (fetchError.message?.includes('Failed to fetch') || fetchError.message?.includes('Connection refused')) {
                throw new Error("OLLAMA_CONNECTION_REFUSED");
            }
            throw fetchError;
        }

    } catch (error: any) {
        console.error("Pipeline Failure:", error);
        
        if (error.message === "OLLAMA_CONNECTION_REFUSED") {
            return { error: "OLLAMA_CONNECTION_REFUSED", sources: [], isAmbiguous: false, options: [], text: "" };
        }

        return { 
            text: `خطا در پردازش هوش مصنوعی: ${error.message}`, 
            sources: [], 
            error: error.message,
            isAmbiguous: false,
            options: []
        };
    }
};
