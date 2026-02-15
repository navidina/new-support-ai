
const express = require('express');
const cors = require('cors');
const lancedb = require('@lancedb/lancedb');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3001; 

// Default Configuration (Fallback)
const DEFAULT_OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-nomic-embed-text-v1.5@q4_k_m'; 
const DB_PATH = path.join(__dirname, 'data', 'rayan-db');

app.use(cors());
app.use(express.json({ limit: '100mb' }));

// --- DATABASE INIT ---
let db;
let table;

async function initDB() {
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    
    db = await lancedb.connect(DB_PATH);
    console.log(`📂 LanceDB connected at ${DB_PATH}`);
    
    try {
        table = await db.openTable('knowledge_chunks');
        console.log('✅ Table "knowledge_chunks" loaded.');
    } catch (e) {
        console.log('ℹ️ Table "knowledge_chunks" does not exist yet. Will be created on first ingestion.');
    }
}

// --- HELPER FUNCTIONS ---

// Construct the correct embedding endpoint based on the base URL
function getEmbeddingEndpoint(baseUrl) {
    if (baseUrl.endsWith('/v1')) {
        return `${baseUrl}/embeddings`; // OpenAI Compatible
    }
    return `${baseUrl}/api/embeddings`; // Standard Ollama
}

async function getEmbedding(text, config = {}) {
    const baseUrl = config.ollamaBaseUrl || DEFAULT_OLLAMA_URL;
    const model = config.embeddingModel || DEFAULT_EMBEDDING_MODEL;
    const endpoint = getEmbeddingEndpoint(baseUrl);

    try {
        // Handle OpenAI format vs Ollama format
        let body;
        if (baseUrl.endsWith('/v1')) {
            body = { model: model, input: text };
        } else {
            body = { model: model, prompt: text };
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            console.error(`Embedding Error (${response.status}) at ${endpoint}`);
            return null;
        }

        const data = await response.json();
        // Support both formats
        return data.embedding || (data.data && data.data[0] ? data.data[0].embedding : null);
    } catch (error) {
        console.error("Embedding Connection Error:", error.message);
        return null;
    }
}

const normalize = (text) => {
    return text.toLowerCase()
        .replace(/[.,/#!$%^&*;:{}=\-_`~()؟،«»"']/g, " ")
        .replace(/\s+/g, ' ')
        .trim();
};

const calculateKeywordScore = (query, content) => {
    const normQuery = normalize(query);
    const normContent = normalize(content);
    
    if (normQuery.length > 10 && normContent.includes(normQuery)) {
        return 1.0; 
    }

    const queryTokens = normQuery.split(' ').filter(t => t.length > 2);
    if (queryTokens.length === 0) return 0;

    let score = 0;
    let matchedTokens = 0;
    
    queryTokens.forEach(token => {
        if (normContent.includes(token)) {
            matchedTokens++;
            score += 0.1;
        }
    });

    score += (matchedTokens / queryTokens.length) * 0.5;
    return Math.min(1.0, score);
};

// --- API ROUTES ---

app.post('/api/ingest', async (req, res) => {
    try {
        const { chunks, configuration } = req.body;
        if (!chunks || !Array.isArray(chunks)) {
            return res.status(400).json({ error: 'Invalid chunks data' });
        }

        console.log(`📥 Receiving ${chunks.length} chunks. Config:`, configuration);

        const processedChunks = [];
        for (const chunk of chunks) {
            const vector = await getEmbedding(chunk.searchContent || chunk.content, configuration);
            if (vector) {
                processedChunks.push({
                    id: chunk.id,
                    vector: vector,
                    content: chunk.content,
                    metadata: JSON.stringify(chunk.metadata),
                    source_id: chunk.source.id,
                    source_json: JSON.stringify(chunk.source),
                    created_at: Date.now()
                });
            }
        }

        if (processedChunks.length === 0) {
            return res.status(500).json({ error: 'Failed to generate embeddings. Check Ollama URL/Model.' });
        }

        if (!table) {
            table = await db.createTable('knowledge_chunks', processedChunks);
        } else {
            await table.add(processedChunks);
        }

        console.log(`✅ Indexed ${processedChunks.length} chunks.`);
        res.json({ success: true, count: processedChunks.length });

    } catch (e) {
        console.error("Ingestion Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/search', async (req, res) => {
    try {
        const { query, categoryFilter, vectorWeight = 0.35, topK = 20, configuration } = req.body;
        
        if (!table) return res.json([]);

        const queryVector = await getEmbedding(query, configuration);
        if (!queryVector) {
            return res.status(500).json({ error: 'Embedding failed. Check Ollama URL.' });
        }

        let results = await table.search(queryVector)
            .limit(50) 
            .execute();

        const rankedResults = results.map(r => {
            const metadata = JSON.parse(r.metadata);
            
            if (categoryFilter && metadata.category !== categoryFilter) {
                return null;
            }

            const vectorScore = 1 - (r._distance || 0); 
            const keywordScore = calculateKeywordScore(query, r.content);
            const hybridScore = (vectorScore * vectorWeight) + (keywordScore * (1 - vectorWeight));

            return {
                ...r,
                metadata,
                source: JSON.parse(r.source_json),
                score: hybridScore,
                vectorScore,
                keywordScore,
                rerankScore: hybridScore
            };
        })
        .filter(r => r !== null) 
        .sort((a, b) => b.score - a.score) 
        .slice(0, topK);

        res.json(rankedResults);

    } catch (e) {
        console.error("Search Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/stats', async (req, res) => {
    try {
        if (!table) return res.json({ count: 0 });
        const count = await table.countRows();
        res.json({ count });
    } catch (e) {
        res.json({ count: 0 });
    }
});

// NEW: Retrieve all chunks (without vectors) for Graph/Wiki
app.get('/api/chunks', async (req, res) => {
    try {
        if (!table) return res.json([]);
        // Fetch chunks. Limit set high for local use. 
        // Note: For very large datasets, pagination would be needed.
        const results = await table.query().limit(50000).execute();
        
        // Strip heavy vectors to reduce bandwidth
        const sanitized = results.map(r => {
            const { vector, ...rest } = r; 
            return rest;
        });
        
        res.json(sanitized);
    } catch (e) {
        console.error("Fetch Chunks Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/chat', async (req, res) => {
    try {
        const { configuration, ...chatBody } = req.body;
        const baseUrl = configuration?.ollamaBaseUrl || DEFAULT_OLLAMA_URL;
        
        const endpoint = baseUrl.endsWith('/v1') 
            ? `${baseUrl}/chat/completions` 
            : `${baseUrl}/api/chat`; 

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(chatBody)
        });
        
        if (!response.ok) {
            const err = await response.text();
            throw new Error(`AI Provider Error: ${err}`);
        }

        const data = await response.json();
        res.json(data);
    } catch (e) {
        console.error("Chat Proxy Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/reset', async (req, res) => {
    try {
        if (table) {
            await db.dropTable('knowledge_chunks');
            table = null;
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

initDB().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 Central RAG Server running on http://localhost:${PORT}`);
    });
});
