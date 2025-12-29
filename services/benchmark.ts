
import { BenchmarkCase, BenchmarkResult, KnowledgeChunk, SearchOverrides, TuningStepResult } from '../types';
import { processQuery, cosineSimilarity } from './search';
import { getEmbedding, preWarmModel } from './ollama';
import { getSettings, updateSettings } from './settings';

// Extended Persian Stop Words to ignore during keyword extraction
const PERSIAN_STOP_WORDS = new Set([
  'از', 'به', 'با', 'برای', 'در', 'هم', 'و', 'که', 'را', 'این', 'آن', 'است', 'هست', 'بود', 'شد', 'می', 'نمی', 
  'یک', 'تا', 'بر', 'یا', 'نیز', 'باید', 'شاید', 'اما', 'اگر', 'چرا', 'چه', 'روی', 'زیر', 'های', 'ها', 'تر', 'ترین',
  'کند', 'کنند', 'کرده', 'داشت', 'دارد', 'شود', 'میشود', 'نشود', 'باعث', 'مورد', 'جهت', 'توسط', 'بنابراین', 'سپس',
  'ولی', 'لیکن', 'چون', 'چنانچه', 'آیا', 'بله', 'خیر', 'لطفا', 'ممنون', 'متشکرم', 'عبارتند', 'نام', 'ببرید', 'حداقل', 'پنج', 'نوع', 'لیست',
  'می‌باشد', 'میباشد', 'گردد', 'میگردد', 'گشته'
]);

/**
 * Normalizes text for better comparison by removing punctuation and unifying characters.
 */
const normalizeText = (text: string): string => {
    return text.toLowerCase()
        .replace(/[.,/#!$%^&*;:{}=\-_`~()؟،«»"']/g, " ") // Remove punctuation
        .replace(/\d+[\.:\-)]/g, " ") // Remove list numbering like "1." or "1-"
        .replace(/\s+/g, " ") // Normalize spaces
        .replace(/ي/g, 'ی')
        .replace(/ك/g, 'ک')
        .trim();
};

/**
 * Calculates Keyword Recall:
 * What percentage of significant words in Ground Truth appear in the Generated Answer?
 * This is CRITICAL for list-based questions where AI might be verbose.
 */
const calculateKeywordRecall = (generated: string, groundTruth: string): number => {
    if (!generated || !groundTruth) return 0;

    const tokenize = (text: string) => {
        return normalizeText(text)
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
            // Fuzzy match for plurals or slight variations (contains check)
            for (const genToken of genTokens) {
                if (genToken.includes(token) || token.includes(genToken)) {
                    // Check length to avoid short meaningless matches
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
 * Raw vectors rarely reach 1.0 even for identical meaning, so we boost high scores.
 */
const calibrateVectorScore = (raw: number): number => {
    if (raw >= 0.88) return 1.0; 
    if (raw >= 0.82) return 0.90 + ((raw - 0.82) / 0.06) * 0.10; 
    if (raw >= 0.75) return 0.70 + ((raw - 0.75) / 0.07) * 0.20; 
    return raw; 
};

/**
 * RAGAS METRIC 1: Faithfulness
 * Checks if the answer is derived from the context.
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
 * Checks if the answer addresses the question.
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
    onProgress: (current: number, total: number, lastResult: BenchmarkResult) => void,
    searchOverrides?: SearchOverrides
): Promise<void> => {
    
    // 1. PRE-WARM MODEL
    await preWarmModel();

    for (let i = 0; i < testCases.length; i++) {
        const testCase = testCases[i];
        const startTime = Date.now();
        
        // Small delay to prevent UI freezing
        if (i > 0) await new Promise(resolve => setTimeout(resolve, 50));

        // Call processQuery with optional Overrides
        const result = await processQuery(
            testCase.question, 
            knowledgeBase,
            undefined, 
            undefined, 
            searchOverrides?.temperature,         
            false,
            [],
            searchOverrides
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
            
            // 1. Calculate Keyword Recall (Coverage)
            // Ideally, the generated answer should contain ALL key terms from Ground Truth.
            const keywordRecall = calculateKeywordRecall(result.text, testCase.groundTruth);
            
            // 2. Vector Similarity (Backup)
            let calibratedScore = 0;
            try {
                const genVec = await getEmbedding(result.text, false);
                const truthVec = await getEmbedding(testCase.groundTruth, false);
                const rawVectorScore = cosineSimilarity(genVec, truthVec);
                calibratedScore = calibrateVectorScore(rawVectorScore);
            } catch (e) {
                console.warn("Benchmark embedding failed", e);
            }

            // 3. RAGAS Metrics (Optional, heavier)
            // We only run this if basic recall is decent, to save tokens/time if answer is total garbage
            if (keywordRecall > 0.3 || calibratedScore > 0.6) {
                const contextStr = result.sources.map(s => s.snippet).join("\n");
                const [faith, rel] = await Promise.all([
                    evaluateFaithfulness(contextStr, result.text),
                    evaluateRelevance(testCase.question, result.text)
                ]);
                faithfulnessScore = faith;
                relevanceScore = rel;
            }

            // --- SMART SCORING LOGIC (UPDATED) ---
            // If Keyword Recall is high (> 80%), it means the answer contains the correct facts.
            // We use the MAX of Recall and Vector Score to allow for verbose/formatted answers.
            
            if (keywordRecall > 0.8) {
                // Highly accurate content match - ignore vector score if it's lower (due to length mismatch)
                finalScore = Math.max(keywordRecall, calibratedScore);
            } else {
                // Balanced calculation for partial answers
                // Weights: Base (Recall/Vector max) 70% + RAGAS 30%
                const baseScore = Math.max(calibratedScore, keywordRecall);
                
                // RAGAS penalty only if scores are generated
                const ragasBonus = (faithfulnessScore + relevanceScore) / 2;
                
                if (faithfulnessScore > 0) {
                     finalScore = (baseScore * 0.7) + (ragasBonus * 0.3);
                } else {
                     finalScore = baseScore;
                }
            }
            
            // Cap at 1.0
            finalScore = Math.min(1.0, finalScore);
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

/**
 * AUTO-TUNER: HYPERPARAMETER OPTIMIZATION LOOP
 * Tries different strategies until it hits 85% score.
 * UPDATED: Runs on the FULL Dataset provided as requested.
 */
export const runAutoTuneBenchmark = async (
    testCases: BenchmarkCase[],
    knowledgeBase: KnowledgeChunk[],
    onStep: (stepResult: TuningStepResult) => void
): Promise<SearchOverrides | null> => {
    
    // Define Strategy Space
    const strategies: SearchOverrides[] = [
        { strategyName: 'حالت استاندارد (Balanced)', minConfidence: 0.15, temperature: 0.0, vectorWeight: 0.8 },
        { strategyName: 'حالت دقیق (Precision Mode)', minConfidence: 0.25, temperature: 0.0, vectorWeight: 0.9 }, // High Confidence, Low Temp
        { strategyName: 'حالت خلاق (Creative Mode)', minConfidence: 0.12, temperature: 0.3, vectorWeight: 0.7 }, // Allow more context, higher temp
        { strategyName: 'تمرکز بر کلمات کلیدی (Keyword Heavy)', minConfidence: 0.10, temperature: 0.1, vectorWeight: 0.4 }, // Low vector weight
        { strategyName: 'جستجوی عمیق (Deep Search)', minConfidence: 0.05, temperature: 0.0, vectorWeight: 0.6 } // Very permissive retrieval
    ];

    console.log(`Starting Auto-Tuner on FULL dataset (${testCases.length} items)...`);

    let bestConfig: SearchOverrides | null = null;
    let bestScore = 0;

    for (const strategy of strategies) {
        const results: number[] = [];
        const logs: string[] = [`Testing Strategy: ${strategy.strategyName}`];
        
        logs.push(`Params: Conf=${strategy.minConfidence}, Temp=${strategy.temperature}, VecWeight=${strategy.vectorWeight}`);

        // Run Benchmark on ALL provided cases
        await runBenchmark(testCases, knowledgeBase, (curr, total, res) => {
            results.push(res.similarityScore);
        }, strategy);

        const avgScore = results.reduce((a, b) => a + b, 0) / results.length;
        logs.push(`Result Score: ${(avgScore * 100).toFixed(1)}%`);

        const passed = avgScore >= 0.85;
        
        onStep({
            strategyName: strategy.strategyName || 'Unknown',
            config: strategy,
            score: avgScore,
            pass: passed,
            logs: logs
        });

        if (avgScore > bestScore) {
            bestScore = avgScore;
            bestConfig = strategy;
        }

        if (passed) {
            // WINNER FOUND!
            // Apply settings globally including vectorWeight
            updateSettings({ 
                minConfidence: strategy.minConfidence,
                temperature: strategy.temperature,
                vectorWeight: strategy.vectorWeight
            });
            return strategy;
        }
    }

    // If loop finishes without hitting 85%, return best attempt
    return bestConfig;
};
