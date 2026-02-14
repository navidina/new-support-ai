
import { KnowledgeChunk } from '../types';
import { cleanAndNormalizeText } from './textProcessor';

/**
 * Normalizes text for keyword matching.
 */
const normalize = (text: string) => {
    return cleanAndNormalizeText(text).toLowerCase()
        .replace(/[.,/#!$%^&*;:{}=\-_`~()؟،«»"']/g, " ") // Remove extra punctuation
        .replace(/\s+/g, ' ')
        .trim();
};

/**
 * Calculates a Keyword Match Score (BM25-lite).
 * Boosts score if exact query phrases or bigrams appear in the chunk.
 */
export const calculateKeywordScore = (query: string, content: string): number => {
    const normQuery = normalize(query);
    const normContent = normalize(content);
    
    // 1. Exact Phrase Match (Huge Boost)
    // If the entire query is inside the content (e.g. "Where is X?"), it's very relevant.
    // We check for reasonable length to avoid matching common short phrases.
    if (normQuery.length > 10 && normContent.includes(normQuery)) {
        return 1.0; 
    }

    const queryTokens = normQuery.split(' ').filter(t => t.length > 2);
    if (queryTokens.length === 0) return 0;

    let score = 0;
    
    // 2. Bigram Matching (Contextual Pair Boosting)
    // e.g., "خرید اعتباری" is more important than just "خرید" + "اعتباری"
    let matchedBigrams = 0;
    const bigramsCount = Math.max(1, queryTokens.length - 1);
    
    for (let i = 0; i < queryTokens.length - 1; i++) {
        const bigram = `${queryTokens[i]} ${queryTokens[i+1]}`;
        if (normContent.includes(bigram)) {
            matchedBigrams++;
            score += 0.3; // Significant boost per bigram
        }
    }

    // 3. Token Matching (Frequency)
    let matchedTokens = 0;
    queryTokens.forEach(token => {
        if (normContent.includes(token)) {
            matchedTokens++;
            // Boost for term frequency (capped)
            const count = normContent.split(token).length - 1;
            score += Math.min(count, 3) * 0.05;
        }
    });

    // Normalize base score
    score += (matchedTokens / queryTokens.length) * 0.4;
    
    // Bonus for high coverage
    if (matchedTokens === queryTokens.length) score += 0.2;

    return Math.min(1.0, score);
};

/**
 * Reranks chunks using a Hybrid Algorithm:
 * Score = (VectorScore * vectorWeight) + (KeywordScore * (1 - vectorWeight))
 * 
 * This runs purely in the browser, requires NO model downloads.
 */
export const rerankChunks = async (query: string, chunks: KnowledgeChunk[], topK = 5, vectorWeight: number = 0.7): Promise<KnowledgeChunk[]> => {
    if (!chunks || chunks.length === 0) return [];

    const keywordWeight = 1.0 - vectorWeight;

    const scoredChunks = chunks.map(chunk => {
        // Use existing vector score (calculated in search.ts) or default to 0
        const vectorScore = chunk.score || 0;
        
        // Calculate fresh keyword score with improved logic
        const keywordScore = calculateKeywordScore(query, chunk.content);
        
        // Hybrid Fusion
        const finalScore = (vectorScore * vectorWeight) + (keywordScore * keywordWeight);

        return {
            ...chunk,
            rerankScore: finalScore,
            // Store debug info
            debug: { vector: vectorScore, keyword: keywordScore } 
        };
    });

    // Sort by the new Hybrid Score
    return scoredChunks
        .sort((a, b) => (b.rerankScore || 0) - (a.rerankScore || 0))
        .slice(0, topK);
};
