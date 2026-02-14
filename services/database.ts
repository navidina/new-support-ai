import { KnowledgeChunk, Conversation, BenchmarkRun, FineTuningRecord } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

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

export const loadChunksFromDB = async (): Promise<KnowledgeChunk[]> => {
    console.warn("loadChunksFromDB called in server mode. Returning empty array.");
    return [];
};

// --- TICKET KNOWLEDGE BASE OPERATIONS (ISOLATED) ---

export const saveTicketsToDB = async (chunks: KnowledgeChunk[]): Promise<void> => {
     return saveChunksToDB(chunks);
};

export const loadTicketsFromDB = async (): Promise<KnowledgeChunk[]> => {
    return [];
};

export const clearTicketsDB = async (): Promise<void> => {
    // Not supported or needs admin endpoint
};

// --------------------------------------------------

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

// --- Benchmark CRUD Operations ---

export const saveBenchmarkRun = async (run: BenchmarkRun): Promise<void> => {
    try {
        await fetch(`${API_URL}/benchmarks`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(run)
        });
    } catch (error) {
        console.error("saveBenchmarkRun Error:", error);
    }
};

export const loadBenchmarkHistory = async (): Promise<BenchmarkRun[]> => {
    try {
        const res = await fetch(`${API_URL}/benchmarks`, { headers: getHeaders() });
        return res.ok ? res.json() : [];
    } catch (error) {
        console.error("loadBenchmarkHistory Error:", error);
        return [];
    }
};

export const deleteBenchmarkRun = async (id: string): Promise<void> => {
    try {
        await fetch(`${API_URL}/benchmarks/${id}`, {
            method: 'DELETE',
            headers: getHeaders()
        });
    } catch (error) {
        console.error("deleteBenchmarkRun Error:", error);
    }
};

// --- Fine-Tuning Dataset Operations ---

export const saveFineTuningRecord = async (record: FineTuningRecord): Promise<void> => {
    try {
        await fetch(`${API_URL}/fine-tuning`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(record)
        });
    } catch (error) {
        console.error("saveFineTuningRecord Error:", error);
    }
};

export const exportFineTuningDataset = async (): Promise<string> => {
    try {
        const res = await fetch(`${API_URL}/fine-tuning/export`, { headers: getHeaders() });
        return res.ok ? res.text() : "";
    } catch (error) {
        return "";
    }
};

export const getFineTuningCount = async (): Promise<number> => {
    try {
        const res = await fetch(`${API_URL}/fine-tuning/count`, { headers: getHeaders() });
        const data = await res.json();
        return data.count || 0;
    } catch (error) {
        return 0;
    }
};

/**
 * Wipes the entire database (Chunks, History, Benchmarks, Datasets).
 */
export const clearDatabase = async (): Promise<void> => {
    console.warn("clearDatabase: Admin operation not available from client.");
};

export const exportDatabaseToBlob = async (): Promise<Blob> => {
    return new Blob([], { type: 'application/json' });
};

export const exportDatabaseToJson = async (): Promise<string> => {
    return "[]";
};

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
