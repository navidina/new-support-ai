
import { getSettings } from './settings';
import { PERSIAN_SYNONYMS } from './synonymsData';
import { cleanAndNormalizeText } from './textProcessor'; 
import { SearchOverrides } from '../types';

const SUPPORT_ADVISOR_PROMPT = `
شما یک "مشاور فنی ارشد" هستید. وظیفه شما راهنمایی کارشناس پشتیبانی برای حل تیکت مشتری است.
۱. تحلیل مشکل: ریشه مشکل را بر اساس مستندات حدس بزنید.
۲. آدرس‌دهی: بگویید کدام منو یا فایل مرتبط است.
۳. راهکار: گام‌های اجرایی برای کارشناس را بنویسید.
لحن شما خطاب به "همکار پشتیبان" باشد و پاسخ باید کامل و راهگشا باشد.
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
    
    const settings = { 
        ...globalSettings, 
        ...searchOverrides,
        temperature: searchOverrides.temperature ?? temperatureOverride ?? globalSettings.temperature,
        minConfidence: searchOverrides.minConfidence ?? globalSettings.minConfidence,
        vectorWeight: searchOverrides.vectorWeight ?? globalSettings.vectorWeight,
        enableReranker: searchOverrides.enableReranker ?? globalSettings.enableReranker
    };

    const startTime = Date.now();

    // Config object to pass to server
    const serverConfig = {
        ollamaBaseUrl: settings.ollamaBaseUrl,
        embeddingModel: settings.embeddingModel
    };

    try {
        const expandedQuery = expandQueryWithSynonyms(query);
        onProgress?.({ step: 'searching', expandedQuery });
        
        // --- CENTRALIZED SEARCH ---
        let topChunks = [];
        try {
            // INCREASED TOP_K to 15 for comprehensive context
            const searchResponse = await fetch(`${settings.serverUrl}/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: expandedQuery,
                    categoryFilter,
                    vectorWeight: settings.vectorWeight,
                    topK: 15, // Increased from 8 to 15 to allow comprehensive answers
                    configuration: serverConfig
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
        
        const context = topChunks.map(c => `[منبع: ${c.source.id} | امتیاز: ${c.score?.toFixed(2)}]\n${c.content}`).join('\n\n---\n\n');
        const systemInstruction = isAdvisorMode ? SUPPORT_ADVISOR_PROMPT : settings.systemPrompt;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000); // Increased timeout for longer generation

        try {
            const response = await fetch(`${settings.serverUrl}/chat`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: settings.chatModel,
                    messages: [
                        { role: 'system', content: systemInstruction },
                        // Simplified user prompt to prevent repetition loops
                        { role: 'user', content: `مستندات (CONTEXT):\n${context}\n\nسوال کاربر (QUESTION):\n${query}\n\nپاسخ نهایی (فارسی، خلاصه و بدون تکرار):` }
                    ],
                    temperature: settings.temperature,
                    stream: false,
                    configuration: serverConfig
                }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`API Error ${response.status}: ${errText}`);
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
                throw new Error("تایم‌اوت ارتباط با مدل. تولید پاسخ جامع بیش از حد طول کشید.");
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
