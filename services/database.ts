
import { KnowledgeChunk, Conversation, BenchmarkRun, FineTuningRecord } from '../types';
import { LocalDB } from './localDb';

// --- NoSQL Database Configuration ---
const DB_CONFIG = {
    dbName: 'RayanRAG_NoSQL',
    version: 4, // Incremented version to create new 'tickets' store
    stores: ['chunks', 'conversations', 'benchmark_runs', 'fine_tuning_dataset', 'tickets'] // Added 'tickets' store
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

// --- TICKET KNOWLEDGE BASE OPERATIONS (ISOLATED) ---

/**
 * Saves ticket chunks to the isolated 'tickets' store.
 */
export const saveTicketsToDB = async (chunks: KnowledgeChunk[]): Promise<void> => {
    const database = await getDB();
    await database.collection<KnowledgeChunk>('tickets').insertMany(chunks);
};

/**
 * Loads tickets from the isolated store.
 */
export const loadTicketsFromDB = async (): Promise<KnowledgeChunk[]> => {
    const database = await getDB();
    return database.collection<KnowledgeChunk>('tickets').find({});
};

/**
 * Clears the isolated tickets store.
 */
export const clearTicketsDB = async (): Promise<void> => {
    const database = await getDB();
    await database.collection('tickets').clear();
};

// --------------------------------------------------

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
    await database.collection('tickets').clear();
};

/**
 * Exports the 'chunks' collection to a Blob directly to avoid large string allocation.
 * @returns {Promise<Blob>} JSON Blob of the database content.
 */
export const exportDatabaseToBlob = async (): Promise<Blob> => {
    const chunks = await loadChunksFromDB();
    
    const header = {
        version: "3.0",
        timestamp: new Date().toISOString(),
        count: chunks.length
    };
    
    // Prepare JSON structure manually to stream data into Blob parts
    // Structure: { ...header, "data": [ ...chunks... ] }
    
    const headerStr = JSON.stringify(header, null, 2);
    // Remove the last closing brace '}' to append "data" property
    const lastBraceIndex = headerStr.lastIndexOf('}');
    const openJson = headerStr.substring(0, lastBraceIndex);
    
    const blobParts: string[] = [openJson + ',\n  "data": [\n'];
    
    // Process chunks in blocks to avoid UI freeze if needed, 
    // but here mainly to avoid huge single string
    for (let i = 0; i < chunks.length; i++) {
        const chunkJson = JSON.stringify(chunks[i], null, 2);
        // Add comma for all except first item
        const prefix = i === 0 ? '' : ',\n';
        blobParts.push(prefix + chunkJson);
    }
    
    blobParts.push('\n  ]\n}'); // Close array and object
    
    return new Blob(blobParts, { type: 'application/json' });
};

/**
 * Legacy export function (kept for compatibility if needed, but prefer exportDatabaseToBlob)
 * @deprecated Use exportDatabaseToBlob for better memory management.
 */
export const exportDatabaseToJson = async (): Promise<string> => {
    const blob = await exportDatabaseToBlob();
    return await blob.text();
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
