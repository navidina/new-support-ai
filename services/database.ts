
import { KnowledgeChunk, Conversation, BenchmarkRun, FineTuningRecord } from '../types';
import { LocalDB } from './localDb';
import { getSettings } from './settings';

// --- NoSQL Database Configuration (Keep LocalDB for User History/Chats only) ---
const DB_CONFIG = {
    dbName: 'RayanRAG_LocalCache',
    version: 5, 
    stores: ['conversations', 'benchmark_runs', 'fine_tuning_dataset', 'tickets'] // Removed 'chunks' as it's now on server
};

const db = new LocalDB(DB_CONFIG);

const getDB = async () => {
    await db.connect();
    return db;
};

// --- SERVER API WRAPPERS ---

/**
 * Sends a batch of knowledge chunks to the Central Server for ingestion.
 * @param {KnowledgeChunk[]} chunks - Array of chunks (embeddings will be generated on server).
 */
export const saveChunksToDB = async (chunks: KnowledgeChunk[]): Promise<void> => {
    const settings = getSettings();
    try {
        const response = await fetch(`${settings.serverUrl}/ingest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chunks })
        });
        
        if (!response.ok) throw new Error('Server ingestion failed');
        const data = await response.json();
        console.log(`Server responded: ${data.count} chunks indexed.`);
    } catch (e: any) {
        console.error("Central DB Error:", e);
        throw e;
    }
};

/**
 * Loads chunk count from server (instead of full download).
 */
export const loadChunksFromDB = async (): Promise<KnowledgeChunk[]> => {
    // We do NOT load all chunks to client memory in centralized mode.
    // Return empty array to satisfy type signature, or fetch minimal metadata if needed.
    // Real search happens via API.
    return []; 
};

/**
 * Wipes the Central Database.
 */
export const clearDatabase = async (): Promise<void> => {
    const settings = getSettings();
    // Clear Local
    const database = await getDB();
    await database.collection('conversations').clear();
    await database.collection('benchmark_runs').clear();
    await database.collection('fine_tuning_dataset').clear();
    await database.collection('tickets').clear();

    // Clear Server
    try {
        await fetch(`${settings.serverUrl}/reset`, { method: 'POST' });
    } catch (e) {
        console.error("Failed to clear server DB", e);
    }
};

// --- TICKET KNOWLEDGE BASE OPERATIONS (ISOLATED - Keep Local for now or move to server later) ---
// For now, keeping tickets local to avoid breaking that specific module if it's meant to be ad-hoc analysis.
export const saveTicketsToDB = async (chunks: KnowledgeChunk[]): Promise<void> => {
    const database = await getDB();
    await database.collection<KnowledgeChunk>('tickets').insertMany(chunks);
};

export const loadTicketsFromDB = async (): Promise<KnowledgeChunk[]> => {
    const database = await getDB();
    return database.collection<KnowledgeChunk>('tickets').find({});
};

export const clearTicketsDB = async (): Promise<void> => {
    const database = await getDB();
    await database.collection('tickets').clear();
};

// --------------------------------------------------
// LOCAL STORAGE FOR CHAT HISTORY (Remains Client-Side)
// --------------------------------------------------

export const saveConversationToDB = async (conversation: Conversation): Promise<void> => {
    const database = await getDB();
    const existing = await database.collection<Conversation>('conversations').findOne(conversation.id);
    if (existing) {
        await database.collection<Conversation>('conversations').updateOne(conversation.id, conversation);
    } else {
        await database.collection<Conversation>('conversations').insertOne(conversation);
    }
};

export const loadConversationsFromDB = async (): Promise<Conversation[]> => {
    const database = await getDB();
    const convs = await database.collection<Conversation>('conversations').find({});
    return convs.sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime());
};

export const deleteConversationFromDB = async (id: string): Promise<void> => {
    const database = await getDB();
    await database.collection<Conversation>('conversations').deleteOne(id);
};

// --- Benchmark Operations ---
export const saveBenchmarkRun = async (run: BenchmarkRun): Promise<void> => {
    const database = await getDB();
    await database.collection<BenchmarkRun>('benchmark_runs').insertOne(run);
};

export const loadBenchmarkHistory = async (): Promise<BenchmarkRun[]> => {
    const database = await getDB();
    const runs = await database.collection<BenchmarkRun>('benchmark_runs').find({});
    return runs.sort((a, b) => b.timestamp - a.timestamp);
};

export const deleteBenchmarkRun = async (id: string): Promise<void> => {
    const database = await getDB();
    await database.collection<BenchmarkRun>('benchmark_runs').deleteOne(id);
};

// --- Fine-Tuning Operations ---
export const saveFineTuningRecord = async (record: FineTuningRecord): Promise<void> => {
    const database = await getDB();
    await database.collection<FineTuningRecord>('fine_tuning_dataset').insertOne(record);
};

export const exportFineTuningDataset = async (): Promise<string> => {
    const database = await getDB();
    const records = await database.collection<FineTuningRecord>('fine_tuning_dataset').find({});
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

export const getFineTuningCount = async (): Promise<number> => {
    const database = await getDB();
    return database.collection('fine_tuning_dataset').count();
};

export const exportDatabaseToBlob = async (): Promise<Blob> => {
    // Only exports local conversations in this mode
    const conversations = await loadConversationsFromDB();
    return new Blob([JSON.stringify(conversations, null, 2)], { type: 'application/json' });
};

export const exportDatabaseToJson = async (): Promise<string> => {
    const blob = await exportDatabaseToBlob();
    return await blob.text();
};

export const importDatabaseFromJson = async (jsonString: string): Promise<KnowledgeChunk[]> => {
    // Import logic for Server is complex (requires re-ingestion). 
    // For now, we disabled full DB import/export in Central Mode.
    throw new Error("Direct DB Import is disabled in Centralized Mode. Please use 'Upload Files' to ingest data to the server.");
};
