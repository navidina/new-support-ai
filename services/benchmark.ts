
import { BenchmarkCase, BenchmarkResult, KnowledgeChunk } from '../types';
import { processQuery, cosineSimilarity } from './search';
import { getEmbedding, preWarmModel } from './ollama';
import { getSettings } from './settings';

// Extended Persian Stop Words to ignore during keyword extraction
const PERSIAN_STOP_WORDS = new Set([
  'از', 'به', 'با', 'برای', 'در', 'هم', 'و', 'که', 'را', 'این', 'آن', 'است', 'هست', 'بود', 'شد', 'می', 'نمی', 
  'یک', 'تا', 'بر', 'یا', 'نیز', 'باید', 'شاید', 'اما', 'اگر', 'چرا', 'چه', 'روی', 'زیر', 'های', 'ها', 'تر', 'ترین',
  'کند', 'کنند', 'کرده', 'داشت', 'دارد', 'شود', 'میشود', 'نشود', 'باعث', 'مورد', 'جهت', 'توسط', 'بنابراین', 'سپس',
  'ولی', 'لیکن', 'چون', 'چنانچه', 'آیا', 'بله', 'خیر', 'لطفا', 'ممنون', 'متشکرم'
]);

/**
 * Normalizes text for better comparison
 */
const normalizeText = (text: string): string => {
    return text.toLowerCase()
        .replace(/[.,/#!$%^&*;:{}=\-_`~()؟،«»"']/g, "") // Remove punctuation completely
        .replace(/\s+/g, " ") // Normalize spaces
        .replace(/ي/g, 'ی')
        .replace(/ك/g, 'ک')
        .trim();
};

/**
 * Calculates Jaccard Similarity for text overlap (token based).
 * Good for catching "All cases" vs "All cases."
 */
const calculateTextOverlap = (generated: string, groundTruth: string): number => {
    const genTokens = new Set(normalizeText(generated).split(' '));
    const truthTokens = new Set(normalizeText(groundTruth).split(' '));
    
    // Filter empty tokens
    const validGen = new Set([...genTokens].filter(t => t.length > 1));
    const validTruth = new Set([...truthTokens].filter(t => t.length > 1));

    if (validTruth.size === 0) return 0;

    let intersection = 0;
    validTruth.forEach(t => {
        if (validGen.has(t)) intersection++;
    });

    // Check if Ground Truth is fully contained in Generated (Recall focus)
    const recall = intersection / validTruth.size;
    
    return recall;
};

/**
 * Calculates Keyword Recall:
 * What percentage of significant words in Ground Truth appear in the Generated Answer?
 */
const calculateKeywordRecall = (generated: string, groundTruth: string): number => {
    if (!generated || !groundTruth) return 0;

    const tokenize = (text: string) => {
        return text.toLowerCase()
            .replace(/[.,/#!$%^&*;:{}=\-_`~()؟،«»"']/g, " ") 
            .replace(/\s+/g, " ")
            .trim()
            .split(" ")
            .filter(w => w.length > 2) 
            .filter(w => !PERSIAN_STOP_WORDS.has(w)); 
    };

    const truthTokens = new Set(tokenize(groundTruth));
    const genTokens = new Set(tokenize(generated));

    if (truthTokens.size === 0) return 0;

    let matches = 0;
    truthTokens.forEach(token => {
        let found = false;
        if (genTokens.has(token)) {
            found = true;
        } else {
            for (const genToken of genTokens) {
                if (genToken.includes(token) || token.includes(genToken)) {
                    if (Math.min(token.length, genToken.length) > 3) {
                         found = true;
                         break;
                    }
                }
            }
        }
        if (found) matches++;
    });

    return matches / truthTokens.size;
};

/**
 * Aggressively calibrates raw cosine similarity for Local Embeddings (E5/Mxbai).
 */
const calibrateVectorScore = (raw: number): number => {
    if (raw >= 0.90) return 1.0; 
    if (raw >= 0.85) return 0.92 + ((raw - 0.85) / 0.05) * 0.08; 
    if (raw >= 0.80) return 0.80 + ((raw - 0.80) / 0.05) * 0.12; 
    if (raw >= 0.75) return 0.60 + ((raw - 0.75) / 0.05) * 0.20; 
    return raw * 0.8; 
};

/**
 * RAGAS METRIC 1: Faithfulness
 */
const evaluateFaithfulness = async (context: string, answer: string): Promise<number> => {
    const settings = getSettings();
    const prompt = `
You are a strict evaluator. Your task is to rate the "Faithfulness" of the Answer based ONLY on the Context provided.
Score 1.0: All claims in the Answer are directly supported by the Context.
Score 0.0: The Answer contains hallucinations or info not present in Context.

Context:
${context.substring(0, 3000)}... (truncated)

Answer:
${answer}

Return a JSON object with a single key "score" (a number between 0.0 and 1.0).
JSON:
`;
    try {
        const response = await fetch(`${settings.ollamaBaseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: settings.chatModel, 
                stream: false,
                messages: [{ role: 'user', content: prompt }],
                format: "json",
                options: { temperature: 0.0 }
            }),
        });
        const data = await response.json();
        const json = JSON.parse(data.message.content);
        return typeof json.score === 'number' ? json.score : 0.5;
    } catch (e) {
        console.warn("Faithfulness check failed", e);
        return 0; 
    }
};

/**
 * RAGAS METRIC 2: Answer Relevance
 */
const evaluateRelevance = async (question: string, answer: string): Promise<number> => {
    const settings = getSettings();
    const prompt = `
You are a strict evaluator. Rate the "Relevance" of the Answer to the Question.
Score 1.0: The answer directly and fully addresses the question.
Score 0.0: The answer is unrelated or ignores the question.

Question: ${question}
Answer: ${answer}

Return a JSON object with a single key "score" (number 0.0 to 1.0).
JSON:
`;
    try {
        const response = await fetch(`${settings.ollamaBaseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: settings.chatModel,
                stream: false,
                messages: [{ role: 'user', content: prompt }],
                format: "json",
                options: { temperature: 0.0 }
            }),
        });
        const data = await response.json();
        const json = JSON.parse(data.message.content);
        return typeof json.score === 'number' ? json.score : 0.5;
    } catch (e) {
        console.warn("Relevance check failed", e);
        return 0;
    }
};

/**
 * Runs a benchmark test against a single case.
 */
export const runBenchmark = async (
    testCases: BenchmarkCase[], 
    knowledgeBase: KnowledgeChunk[],
    onProgress: (current: number, total: number, lastResult: BenchmarkResult) => void
): Promise<void> => {
    
    // 1. PRE-WARM MODEL
    await preWarmModel();

    for (let i = 0; i < testCases.length; i++) {
        const testCase = testCases[i];
        const startTime = Date.now();
        
        if (i > 0) await new Promise(resolve => setTimeout(resolve, 100));

        // Call processQuery
        // We temporarily lower minConfidence via the setting override if possible, 
        // but here we rely on the logic inside processQuery.
        const result = await processQuery(
            testCase.question, 
            knowledgeBase,
            undefined, 
            undefined, 
            1,         
            false      
        );
        
        // Fail Fast on Critical Errors
        if (result.error === "OLLAMA_CONNECTION_REFUSED" || result.error === "MODEL_NOT_FOUND") {
             const errorResult: BenchmarkResult = {
                caseId: testCase.id,
                question: testCase.question,
                groundTruth: testCase.groundTruth,
                generatedAnswer: "CRITICAL FAILURE: " + result.error,
                similarityScore: 0,
                faithfulnessScore: 0,
                relevanceScore: 0,
                retrievedSources: [],
                timeTakenMs: 0
            };
            onProgress(i + 1, testCases.length, errorResult);
            break; 
        }

        let finalScore = 0;
        let faithfulnessScore = 0;
        let relevanceScore = 0;
        
        const hasValidAnswer = !result.error && result.text && !result.text.includes("اطلاعاتی در این مورد یافت نشد");

        if (hasValidAnswer) {
            
            // 1. Check for Exact/High Text Overlap FIRST (Fixes short answer issues)
            const textOverlap = calculateTextOverlap(result.text, testCase.groundTruth);
            
            if (textOverlap > 0.9) {
                // Almost exact match (e.g. "All cases" vs "All cases.")
                finalScore = 1.0;
                faithfulnessScore = 1.0;
                relevanceScore = 1.0;
            } else {
                // 2. Fallback to Vector + RAGAS
                let calibratedScore = 0;
                try {
                    const genVec = await getEmbedding(result.text, false);
                    const truthVec = await getEmbedding(testCase.groundTruth, false);
                    const rawVectorScore = cosineSimilarity(genVec, truthVec);
                    calibratedScore = calibrateVectorScore(rawVectorScore);
                } catch (e) {
                    console.warn("Benchmark embedding failed", e);
                }

                // If text overlap is decent (e.g. > 50%), ensure score doesn't drop too low due to vectors
                if (textOverlap > 0.5) {
                    calibratedScore = Math.max(calibratedScore, textOverlap);
                }

                // C. RAGAS Metrics
                const contextStr = result.sources.map(s => s.snippet).join("\n");
                const [faith, rel] = await Promise.all([
                    evaluateFaithfulness(contextStr, result.text),
                    evaluateRelevance(testCase.question, result.text)
                ]);
                faithfulnessScore = faith;
                relevanceScore = rel;

                const ragasPenalty = (faithfulnessScore < 0.5 || relevanceScore < 0.5) ? 0.6 : 1.0;
                
                // Composite Score
                finalScore = (calibratedScore * 0.4) + (faithfulnessScore * 0.3) + (relevanceScore * 0.3);
                finalScore = finalScore * ragasPenalty;
            }
        }

        const benchmarkResult: BenchmarkResult = {
            caseId: testCase.id,
            question: testCase.question,
            groundTruth: testCase.groundTruth,
            generatedAnswer: result.error ? `⚠️ خطا: ${result.text}` : result.text,
            similarityScore: parseFloat(finalScore.toFixed(2)),
            faithfulnessScore: parseFloat(faithfulnessScore.toFixed(2)),
            relevanceScore: parseFloat(relevanceScore.toFixed(2)),
            retrievedSources: result.sources,
            timeTakenMs: Date.now() - startTime
        };

        onProgress(i + 1, testCases.length, benchmarkResult);
    }
};
