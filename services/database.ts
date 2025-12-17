
import { KnowledgeChunk, Conversation, BenchmarkRun, FineTuningRecord } from '../types';
import { LocalDB } from './localDb';

// --- NoSQL Database Configuration ---
const DB_CONFIG = {
    dbName: 'RayanRAG_NoSQL',
    version: 3, // Incremented version to create new store
    stores: ['chunks', 'conversations', 'benchmark_runs', 'fine_tuning_dataset'] // Added new store
};

const db = new LocalDB(DB_CONFIG);

/**
 * Initializes DB Connection (Lazy load wrapper).
 * @returns {Promise<LocalDB>} The connected database instance.
 */
const getDB = async () => {
    await db.connect();
    return db;
};

// --- CRUD Operations using NoSQL Engine ---

/**
 * Saves a batch of knowledge chunks to the database.
 * @param {KnowledgeChunk[]} chunks - Array of chunks.
 */
export const saveChunksToDB = async (chunks: KnowledgeChunk[]): Promise<void> => {
    const database = await getDB();
    await database.collection<KnowledgeChunk>('chunks').insertMany(chunks);
};

/**
 * Loads all knowledge chunks from the database.
 * @returns {Promise<KnowledgeChunk[]>}
 */
export const loadChunksFromDB = async (): Promise<KnowledgeChunk[]> => {
    const database = await getDB();
    return database.collection<KnowledgeChunk>('chunks').find({});
};

/**
 * Saves or updates a conversation session.
 * @param {Conversation} conversation - The conversation object.
 */
export const saveConversationToDB = async (conversation: Conversation): Promise<void> => {
    const database = await getDB();
    // Check if exists to update, else insert
    const existing = await database.collection<Conversation>('conversations').findOne(conversation.id);
    if (existing) {
        await database.collection<Conversation>('conversations').updateOne(conversation.id, conversation);
    } else {
        await database.collection<Conversation>('conversations').insertOne(conversation);
    }
};

/**
 * Loads all conversation history, sorted by last updated.
 * @returns {Promise<Conversation[]>}
 */
export const loadConversationsFromDB = async (): Promise<Conversation[]> => {
    const database = await getDB();
    const convs = await database.collection<Conversation>('conversations').find({});
    // Sort by lastUpdated desc
    return convs.sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime());
};

/**
 * Deletes a specific conversation by ID.
 * @param {string} id - The conversation ID.
 */
export const deleteConversationFromDB = async (id: string): Promise<void> => {
    const database = await getDB();
    await database.collection<Conversation>('conversations').deleteOne(id);
};

// --- Benchmark CRUD Operations ---

/**
 * Saves a benchmark run result.
 * @param {BenchmarkRun} run - The run data.
 */
export const saveBenchmarkRun = async (run: BenchmarkRun): Promise<void> => {
    const database = await getDB();
    await database.collection<BenchmarkRun>('benchmark_runs').insertOne(run);
};

/**
 * Loads all past benchmark runs.
 * @returns {Promise<BenchmarkRun[]>}
 */
export const loadBenchmarkHistory = async (): Promise<BenchmarkRun[]> => {
    const database = await getDB();
    const runs = await database.collection<BenchmarkRun>('benchmark_runs').find({});
    return runs.sort((a, b) => b.timestamp - a.timestamp);
};

/**
 * Deletes a specific benchmark run.
 * @param {string} id - Run ID.
 */
export const deleteBenchmarkRun = async (id: string): Promise<void> => {
    const database = await getDB();
    await database.collection<BenchmarkRun>('benchmark_runs').deleteOne(id);
};

// --- Fine-Tuning Dataset Operations ---

/**
 * Saves a user interaction feedback as a fine-tuning record.
 * @param {FineTuningRecord} record - The training example.
 */
export const saveFineTuningRecord = async (record: FineTuningRecord): Promise<void> => {
    const database = await getDB();
    await database.collection<FineTuningRecord>('fine_tuning_dataset').insertOne(record);
};

/**
 * Exports the fine-tuning dataset in JSONL format (standard for OpenAI/LLaMA training).
 * @returns {Promise<string>} JSONL string.
 */
export const exportFineTuningDataset = async (): Promise<string> => {
    const database = await getDB();
    const records = await database.collection<FineTuningRecord>('fine_tuning_dataset').find({});
    
    // Convert to JSONL (Each line is a JSON object)
    return records.map(r => JSON.stringify({
        messages: [
            { role: "user", content: r.prompt },
            { role: "assistant", content: r.response }
        ],
        context: r.context,
        score: r.score,
        metadata: { source_ids: r.sourceIds, model: r.model }
    })).join('\n');
};

/**
 * Counts the number of fine-tuning records collected.
 */
export const getFineTuningCount = async (): Promise<number> => {
    const database = await getDB();
    return database.collection('fine_tuning_dataset').count();
};

/**
 * Wipes the entire database (Chunks, History, Benchmarks, Datasets).
 */
export const clearDatabase = async (): Promise<void> => {
    const database = await getDB();
    await database.collection('chunks').clear();
    await database.collection('conversations').clear();
    await database.collection('benchmark_runs').clear();
    await database.collection('fine_tuning_dataset').clear();
};

/**
 * Exports the 'chunks' collection to a JSON string.
 * @returns {Promise<string>} JSON string of the database content.
 */
export const exportDatabaseToJson = async (): Promise<string> => {
    const chunks = await loadChunksFromDB();
    const exportData = {
        version: "3.0",
        timestamp: new Date().toISOString(),
        count: chunks.length,
        data: chunks
    };
    return JSON.stringify(exportData, null, 2);
};

/**
 * Imports chunks from a JSON string into the database.
 * Wipes existing chunks before import.
 * @param {string} jsonString - The JSON content to import.
 * @returns {Promise<KnowledgeChunk[]>} The imported chunks.
 */
export const importDatabaseFromJson = async (jsonString: string): Promise<KnowledgeChunk[]> => {
    try {
        const parsed = JSON.parse(jsonString);
        if (!parsed.data || !Array.isArray(parsed.data)) {
            throw new Error("Invalid database file format");
        }
        const chunks = parsed.data as KnowledgeChunk[];
        
        const database = await getDB();
        await database.collection('chunks').clear();
        await database.collection('chunks').insertMany(chunks);
        
        return chunks;
    } catch (e) {
        throw e;
    }
};
