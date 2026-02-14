import { KnowledgeChunk, Conversation, BenchmarkRun, FineTuningRecord } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const getHeaders = () => {
    // Ideally retrieve userId/token from auth context or storage
    // For now we mock it or retrieve from localStorage if available
    const userId = localStorage.getItem('userId') || 'anonymous';
    return {
        'Content-Type': 'application/json',
        'x-user-id': userId
    };
};

// --- CRUD Operations using Backend API ---

/**
 * Saves a batch of knowledge chunks to the database.
 * @param {KnowledgeChunk[]} chunks - Array of chunks.
 */
export const saveChunksToDB = async (chunks: KnowledgeChunk[]): Promise<void> => {
    try {
        const response = await fetch(`${API_URL}/knowledge/ingest`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ chunks })
        });
        if (!response.ok) throw new Error('Failed to save chunks');
    } catch (error) {
        console.error("saveChunksToDB Error:", error);
        throw error;
    }
};

/**
 * Loads all knowledge chunks from the database.
 * WARNING: In server mode, loading ALL chunks is bad practice. Returns empty array.
 * @returns {Promise<KnowledgeChunk[]>}
 */
export const loadChunksFromDB = async (): Promise<KnowledgeChunk[]> => {
    console.warn("loadChunksFromDB called in server mode. Returning empty array.");
    return [];
};

// --- TICKET KNOWLEDGE BASE OPERATIONS (ISOLATED) ---

/**
 * Saves ticket chunks to the isolated 'tickets' store.
 * Currently maps to general ingest or specific endpoint if implemented.
 */
export const saveTicketsToDB = async (chunks: KnowledgeChunk[]): Promise<void> => {
     // Reuse ingest for now, maybe add metadata flag?
     // The prompt didn't specify separate ticket store for backend.
     // We treat them as chunks.
     return saveChunksToDB(chunks);
};

/**
 * Loads tickets from the isolated store.
 */
export const loadTicketsFromDB = async (): Promise<KnowledgeChunk[]> => {
    return [];
};

/**
 * Clears the isolated tickets store.
 */
export const clearTicketsDB = async (): Promise<void> => {
    // Not supported or needs admin endpoint
};

// --------------------------------------------------

/**
 * Saves or updates a conversation session.
 * @param {Conversation} conversation - The conversation object.
 */
export const saveConversationToDB = async (conversation: Conversation): Promise<void> => {
    try {
        await fetch(`${API_URL}/conversations`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(conversation)
        });
    } catch (error) {
        console.error("saveConversationToDB Error:", error);
    }
};

/**
 * Loads all conversation history, sorted by last updated.
 * @returns {Promise<Conversation[]>}
 */
export const loadConversationsFromDB = async (): Promise<Conversation[]> => {
    try {
        const res = await fetch(`${API_URL}/conversations`, {
            headers: getHeaders()
        });
        if (!res.ok) return [];
        return res.json();
    } catch (error) {
        console.error("loadConversationsFromDB Error:", error);
        return [];
    }
};

/**
 * Deletes a specific conversation by ID.
 * @param {string} id - The conversation ID.
 */
export const deleteConversationFromDB = async (id: string): Promise<void> => {
    try {
        await fetch(`${API_URL}/conversations/${id}`, {
            method: 'DELETE',
            headers: getHeaders()
        });
    } catch (error) {
        console.error("deleteConversationFromDB Error:", error);
    }
};

// --- Benchmark CRUD Operations (STUBBED for Client-Server) ---

export const saveBenchmarkRun = async (run: BenchmarkRun): Promise<void> => {
    console.log("saveBenchmarkRun: Not implemented in server mode yet.");
};

export const loadBenchmarkHistory = async (): Promise<BenchmarkRun[]> => {
    return [];
};

export const deleteBenchmarkRun = async (id: string): Promise<void> => {
    console.log("deleteBenchmarkRun: Not implemented in server mode yet.");
};

// --- Fine-Tuning Dataset Operations (STUBBED) ---

export const saveFineTuningRecord = async (record: FineTuningRecord): Promise<void> => {
     console.log("saveFineTuningRecord: Not implemented in server mode yet.");
};

export const exportFineTuningDataset = async (): Promise<string> => {
    return "";
};

export const getFineTuningCount = async (): Promise<number> => {
    return 0;
};

/**
 * Wipes the entire database (Chunks, History, Benchmarks, Datasets).
 */
export const clearDatabase = async (): Promise<void> => {
    console.warn("clearDatabase: Admin operation not available from client.");
};

/**
 * Exports the 'chunks' collection to a Blob directly to avoid large string allocation.
 * @returns {Promise<Blob>} JSON Blob of the database content.
 */
export const exportDatabaseToBlob = async (): Promise<Blob> => {
    // In server mode, this should probably call an export endpoint.
    // For now, return empty blob.
    return new Blob([], { type: 'application/json' });
};

/**
 * Legacy export function (kept for compatibility if needed, but prefer exportDatabaseToBlob)
 * @deprecated Use exportDatabaseToBlob for better memory management.
 */
export const exportDatabaseToJson = async (): Promise<string> => {
    return "[]";
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
        let chunks: KnowledgeChunk[] = [];
        
        if (parsed.data && Array.isArray(parsed.data)) {
            chunks = parsed.data;
        } else if (Array.isArray(parsed)) {
            chunks = parsed;
        } else {
             throw new Error("Invalid format");
        }

        await saveChunksToDB(chunks);
        return chunks;
    } catch (e) {
        throw e;
    }
};
