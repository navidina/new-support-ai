import { Router } from 'express';
import { query as dbQuery } from '../db';
import { getEmbedding, chatCompletion } from '../services/ollama';
import { PERSIAN_SYNONYMS } from '../utils/synonymsData';
import { cleanAndNormalizeText } from '../utils/textProcessor';

const router = Router();

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

const SUPPORT_ADVISOR_PROMPT = `
شما یک "مشاور فنی ارشد" هستید. وظیفه شما راهنمایی کارشناس پشتیبانی برای حل تیکت مشتری است.
۱. تحلیل مشکل: ریشه مشکل را بر اساس مستندات حدس بزنید.
۲. آدرس‌دهی: بگویید کدام منو یا فایل مرتبط است.
۳. راهکار: گام‌های اجرایی برای کارشناس را بنویسید.
لحن شما خطاب به "همکار پشتیبان" باشد.
`;

router.post('/', async (req, res) => {
    try {
        const {
            query,
            categoryFilter,
            settings = {},
            history = [],
            isAdvisorMode = false
        } = req.body;

        if (!query) {
             return res.status(400).json({ error: "Query is required" });
        }

        const vectorWeight = settings.vectorWeight ?? 0.35;
        const minConfidence = settings.minConfidence ?? 0.15;
        const temperature = settings.temperature ?? 0.3;
        const chatModel = settings.chatModel || 'llama3';
        const systemPrompt = settings.systemPrompt || "شما یک دستیار هوشمند هستید.";

        // 1. Expand Query
        const expandedQuery = expandQueryWithSynonyms(query);

        // 2. Generate Embedding
        const queryVector = await getEmbedding(expandedQuery);
        const vectorStr = JSON.stringify(queryVector);

        // 3. Hybrid Search in PostgreSQL
        // We use a CTE or subquery to calculate scores and filter
        // Note: ts_rank values might not be normalized 0-1 like cosine similarity.
        // Usually we normalize or use a simpler approach.
        // For this implementation, we assume ts_rank provides a reasonable score comparable or we rely on the weight adjustment.
        // A common trick is to use similarity from pg_trgm for exact text matching, but ts_rank is standard for FTS.
        // Let's use the provided SQL pattern.

        const sql = `
            SELECT id, content, metadata,
                   1 - (embedding <=> $1) as vector_score,
                   ts_rank_cd(to_tsvector('simple', content), plainto_tsquery('simple', $2)) as keyword_score
            FROM knowledge_chunks
            WHERE ($3::text IS NULL OR metadata->>'category' = $3)
            ORDER BY (
                (1 - (embedding <=> $1)) * $4
            ) + (
                (ts_rank_cd(to_tsvector('simple', content), plainto_tsquery('simple', $2)) / (1 + ts_rank_cd(to_tsvector('simple', content), plainto_tsquery('simple', $2)))) * (1 - $4)
            ) DESC
            LIMIT 25;
        `;

        // Note: plainto_tsquery('simple', $2) handles the query parsing for FTS.

        const searchResult = await dbQuery(sql, [vectorStr, expandedQuery, categoryFilter || null, vectorWeight]);

        const topChunks = searchResult.rows.map(row => ({
             ...row,
             score: (row.vector_score * vectorWeight) + (row.keyword_score * (1 - vectorWeight))
        })).filter(row => row.score >= minConfidence);

        if (topChunks.length === 0) {
            return res.json({
                text: "اطلاعاتی با اطمینان کافی یافت نشد.",
                sources: [],
                isAmbiguous: false,
                options: []
            });
        }

        // 4. Construct Context
        const context = topChunks.map(c => `[سند: ${c.metadata?.ticketId || c.id} (Score: ${c.score.toFixed(2)})]\n${c.content}`).join('\n\n---\n\n');
        const systemInstruction = isAdvisorMode ? SUPPORT_ADVISOR_PROMPT : systemPrompt;

        // 5. Call LLM
        // Construct history messages
        const historyMessages = (history || []).slice(-6).map((msg: any) => ({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.content
        }));

        const messages = [
            { role: 'system', content: systemInstruction },
            ...historyMessages,
            { role: 'user', content: `CONTEXT:\n${context}\n\nQUESTION: ${query}` }
        ];

        const replyText = await chatCompletion(messages, temperature);

        res.json({
            text: replyText,
            sources: topChunks.map(c => ({
                id: c.id,
                title: c.metadata?.subCategory || "سند", // Fallback title
                snippet: c.content.substring(0, 200) + "...",
                score: c.score,
                metadata: c.metadata
            })),
            debugInfo: {
                strategy: "Hybrid (Server)",
                processingTimeMs: 0, // Could track time
                candidateCount: topChunks.length,
                logicStep: `Hybrid(V:${vectorWeight})`
            }
        });

    } catch (error: any) {
        console.error("Search API Error:", error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
