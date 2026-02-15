
import { getSettings } from './settings';
import { PERSIAN_SYNONYMS } from './synonymsData';
import { cleanAndNormalizeText } from './textProcessor'; 
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
    // KnowledgeBase is unused in Central mode
    _unused_knowledgeBase: any[],
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
        onProgress?.({ step: 'searching', expandedQuery });
        
        // --- CENTRALIZED SEARCH ---
        // Send query to Node.js/LanceDB Server
        
        let topChunks = [];
        try {
            const searchResponse = await fetch(`${settings.serverUrl}/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: expandedQuery,
                    categoryFilter,
                    vectorWeight: settings.vectorWeight,
                    topK: 8 // Get top 8 results
                })
            });

            if (!searchResponse.ok) throw new Error("Server Search Failed");
            topChunks = await searchResponse.json();
        } catch (serverErr) {
            console.error("Central Search Failed:", serverErr);
            throw new Error("خطا در ارتباط با سرور دانش مرکزی. لطفاً اتصال سرور را بررسی کنید.");
        }

        if (topChunks.length === 0) {
            return { text: "اطلاعاتی با اطمینان کافی در سرور یافت نشد.", sources: [], isAmbiguous: false, options: [] };
        }

        onProgress?.({ step: 'generating' });
        
        // Include Score in context for the LLM
        const context = topChunks.map(c => `[سند: ${c.source.id} (Score: ${c.score?.toFixed(2)})]\n${c.content}`).join('\n\n---\n\n');
        const systemInstruction = isAdvisorMode ? SUPPORT_ADVISOR_PROMPT : settings.systemPrompt;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 90000); // 90s Timeout

        try {
            // Chat Generation can still happen Client-side (hitting central Ollama) OR move to server.
            // Keeping it client-side for now to use the existing Ollama config in settings.
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
                    strategy: 'Centralized-LanceDB', 
                    processingTimeMs: Date.now() - startTime, 
                    candidateCount: topChunks.length, 
                    logicStep: `Server-Hybrid(V:${settings.vectorWeight})`, 
                    extractedKeywords: [] 
                }
            };
        } catch (err) {
            const fetchError = err as any; 
            clearTimeout(timeoutId);
            if (fetchError.name === 'AbortError') {
                throw new Error("تایم‌اوت ارتباط با مدل.");
            }
            if (fetchError.message?.includes('Failed to fetch')) {
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
            text: `خطا در پردازش: ${error.message}`, 
            sources: [], 
            error: error.message,
            isAmbiguous: false,
            options: []
        };
    }
};
