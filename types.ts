

export interface AppSettings {
  ollamaBaseUrl: string;
  chatModel: string;
  embeddingModel: string;
  chunkSize: number;
  childChunkSize: number;
  chunkOverlap: number;
  temperature: number;
  systemPrompt: string;
  minConfidence: number;
}

export interface BaseDocument {
    id: string;
    createdAt?: number;
    updatedAt?: number;
}

export type DocCategory = 'back_office' | 'online_trading' | 'portfolio_management' | 'funds' | 'commodity_energy' | 'troubleshooting' | 'operational_process' | 'technical_infrastructure' | 'general';

export interface ChunkMetadata {
    category: DocCategory;
    subCategory: string;
    tags: string[];
    ticketId?: string;
    customerId?: string;
    software?: string;
    version?: string;
    documentDate?: string;
    symbols?: string[];
}

export interface Source {
    id: string;
    title: string;
    snippet: string;
    page?: number;
    score?: number;
    metadata?: ChunkMetadata;
}

export interface KnowledgeChunk extends BaseDocument {
    content: string;
    searchContent: string;
    embedding: number[];
    metadata: ChunkMetadata;
    source: Source;
    score?: number; // Runtime score
}

// --- RAG PIPELINE VISUALIZATION TYPES ---
export type PipelineStepType = 'analyzing' | 'vectorizing' | 'searching' | 'generating' | 'idle';

export interface PipelineData {
    step: PipelineStepType;
    extractedKeywords?: string[]; // Real extracted terms
    expandedQuery?: string;       // Synonyms added
    vectorPreview?: string;       // Visual representation of embedding
    retrievedCandidates?: { title: string; score: number; accepted?: boolean }[]; // Added accepted flag
    processingTime?: number;
}
// ----------------------------------------

export interface DebugInfo {
    strategy: string;
    processingTimeMs: number;
    candidateCount: number;
    logicStep: string;
    extractedKeywords: string[];
}

export interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
    isThinking?: boolean;
    pipelineData?: PipelineData; // Add live pipeline data to message
    sources?: Source[];
    options?: string[];
    selectedOption?: string;
    debugInfo?: DebugInfo;
    feedback?: number;
}

export interface Conversation extends BaseDocument {
    title: string;
    messages: Message[];
    lastUpdated: Date;
}

export interface DocumentStatus {
    name: string;
    status: 'processing' | 'embedding' | 'indexed' | 'error';
    chunks: number;
    category?: DocCategory;
    subCategory?: string;
}

export type ViewMode = 'chat' | 'graph';
export type GraphLayoutMode = 'schema' | 'smart' | 'force' | 'radial' | 'topic' | 'tree' | 'network';

export type SchemaEntityType = 'System' | 'Issue' | 'Action' | 'Module' | 'Concept' | 'Role';

export interface GraphNode {
    id: string;
    group: string; // 'category', 'subCategory', 'file', 'topic', 'root', 'concept', SchemaEntityType
    label: string;
    fullLabel?: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
    baseRadius: number;
    color: string;
    chunkCount?: number;
    metadata?: ChunkMetadata | any;
    
    // Layout specific props
    radialX?: number;
    radialY?: number;
    treeX?: number;
    treeY?: number;
    targetX?: number;
    targetY?: number;
    relatedChunks?: KnowledgeChunk[];
}

export interface GraphLink {
    source: string;
    target: string;
    type?: string; // 'cross', 'semantic', 'RELATED_TO', 'SOLVES', 'CAUSED_BY'
}

export interface BenchmarkCase {
    id: number | string;
    category: string;
    question: string;
    groundTruth: string;
}

export interface BenchmarkResult {
    caseId: number | string;
    question: string;
    groundTruth: string;
    generatedAnswer: string;
    similarityScore: number;
    faithfulnessScore?: number; // RAGAS Metric: 0-1
    relevanceScore?: number;    // RAGAS Metric: 0-1
    retrievedSources: Source[];
    timeTakenMs: number;
}

export interface BenchmarkRun extends BaseDocument {
    timestamp: number;
    totalCases: number;
    avgScore: number;
    avgFaithfulness?: number; // Added
    avgRelevance?: number;    // Added
    passRate: number;
    avgTime: number;
    results: BenchmarkResult[];
}

export interface FineTuningRecord extends BaseDocument {
    prompt: string;
    response: string;
    context: string;
    score: number;
    sourceIds: string[];
    model: string;
}

export interface QueryResult {
    text: string;
    sources: Source[];
    debugInfo?: DebugInfo;
    error?: string;
    options?: string[];
    isAmbiguous?: boolean;
}