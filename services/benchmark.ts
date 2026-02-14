
import { BenchmarkCase, BenchmarkResult, KnowledgeChunk, SearchOverrides, TuningStepResult } from '../types';
import { processQuery } from './search';
import { getEmbedding, preWarmModel, cosineSimilarity } from './ollama';
import { getSettings, updateSettings } from './settings';

const normalizeText = (text: string): string => {
    return text.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()؟،«»"']/g, " ").replace(/\s+/g, " ").trim();
};

const calculateKeywordRecall = (generated: string, groundTruth: string): number => {
    if (!generated || !groundTruth) return 0;
    const tokenize = (t: string) => normalizeText(t).split(" ").filter(w => w.length > 2);
    const truthTokens = new Set(tokenize(groundTruth));
    const genTokens = new Set(tokenize(generated));
    if (truthTokens.size === 0) return 1;
    let matches = 0;
    truthTokens.forEach(t => { if (genTokens.has(t)) matches++; });
    return matches / truthTokens.size;
};

export const runBenchmark = async (
    testCases: BenchmarkCase[], 
    knowledgeBase: KnowledgeChunk[],
    onProgress: (current: number, total: number, lastResult: BenchmarkResult) => void,
    searchOverrides?: SearchOverrides
): Promise<void> => {
    await preWarmModel();
    for (let i = 0; i < testCases.length; i++) {
        const testCase = testCases[i];
        const startTime = Date.now();
        
        // Trigger Advisor Mode ONLY if it's a ticket
        const isTicket = String(testCase.id).startsWith('ticket-');

        const result = await processQuery(
            testCase.question, 
            knowledgeBase,
            undefined, 
            undefined, 
            searchOverrides?.temperature,         
            false,
            [],
            searchOverrides,
            isTicket 
        );
        
        let finalScore = 0;
        if (result.text && !result.text.includes("اطلاعاتی") && !result.error) {
            const recall = calculateKeywordRecall(result.text, testCase.groundTruth);
            try {
                const genVec = await getEmbedding(result.text, false);
                const truthVec = await getEmbedding(testCase.groundTruth, false);
                finalScore = (recall * 0.4) + (cosineSimilarity(genVec, truthVec) * 0.6);
            } catch { finalScore = recall; }
        }

        onProgress(i + 1, testCases.length, {
            caseId: testCase.id,
            question: testCase.question,
            groundTruth: testCase.groundTruth,
            generatedAnswer: result.text || "بدون پاسخ",
            similarityScore: parseFloat(finalScore.toFixed(2)),
            retrievedSources: result.sources,
            timeTakenMs: Date.now() - startTime
        });
    }
};

export const runAutoTuneBenchmark = async (testCases: BenchmarkCase[], knowledgeBase: KnowledgeChunk[], onStep: (stepResult: TuningStepResult) => void): Promise<SearchOverrides | null> => {
    const strategies: SearchOverrides[] = [
        { strategyName: 'پیش‌فرض (Baseline)', enableReranker: true, vectorWeight: 0.8, temperature: 0.1, minConfidence: 0.1 },
        { strategyName: 'جستجوی برداری (Vector Only)', enableReranker: false, temperature: 0.0, minConfidence: 0.15 },
        { strategyName: 'متمرکز بر کلمات کلیدی (Keyword Heavy)', enableReranker: true, vectorWeight: 0.3, temperature: 0.0, minConfidence: 0.1 },
        { strategyName: 'متمرکز بر معنا (Vector Heavy)', enableReranker: true, vectorWeight: 0.9, temperature: 0.0, minConfidence: 0.1 },
        { strategyName: 'حالت خلاقانه (Creative)', enableReranker: true, vectorWeight: 0.7, temperature: 0.6, minConfidence: 0.05 },
        { strategyName: 'حالت سخت‌گیرانه (Strict)', enableReranker: true, vectorWeight: 0.8, temperature: 0.0, minConfidence: 0.4 },
    ];

    let bestConfig = null;
    let bestScore = 0;

    for (const strategy of strategies) {
        const scores: number[] = [];
        await runBenchmark(testCases, knowledgeBase, (curr, total, res) => { scores.push(res.similarityScore); }, strategy);
        const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
        
        onStep({ 
            strategyName: strategy.strategyName || 'Unknown', 
            config: strategy, 
            score: parseFloat(avgScore.toFixed(3)), 
            pass: avgScore > 0.6, // Arbitrary pass threshold
            logs: [] 
        });

        if (avgScore > bestScore) { 
            bestScore = avgScore; 
            bestConfig = strategy; 
        }
    }
    return bestConfig;
};
