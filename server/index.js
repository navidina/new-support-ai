const express = require('express');
const cors = require('cors');
const lancedb = require('@lancedb/lancedb');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3001; 

// Configuration
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const EMBEDDING_MODEL = 'text-embedding-nomic-embed-text-v1.5@q4_k_m'; 
const DB_PATH = path.join(__dirname, 'data', 'rayan-db');

app.use(cors());
app.use(express.json({ limit: '100mb' }));

// --- DATABASE INIT ---
let db;
let table;

async function initDB() {
    // Ensure data directory exists
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    
    // Connect to LanceDB
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

async function getEmbedding(text) {
    try {
        const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: EMBEDDING_MODEL,
                prompt: text
            })
        });
        
        if (!response.ok) {
            console.error(`Ollama Embedding Error: ${response.status} ${response.statusText}`);
            return null;
        }

        const data = await response.json();
        return data.embedding;
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
        const { chunks } = req.body;
        if (!chunks || !Array.isArray(chunks)) {
            return res.status(400).json({ error: 'Invalid chunks data' });
        }

        console.log(`📥 Receiving ${chunks.length} chunks...`);

        const processedChunks = [];
        for (const chunk of chunks) {
            const vector = await getEmbedding(chunk.searchContent || chunk.content);
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
            return res.status(500).json({ error: 'Failed to generate embeddings. Check Ollama.' });
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
        const { query, categoryFilter, vectorWeight = 0.35, topK = 20 } = req.body;
        
        if (!table) return res.json([]);

        const queryVector = await getEmbedding(query);
        if (!queryVector) {
            return res.status(500).json({ error: 'Embedding failed' });
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

app.post('/api/chat', async (req, res) => {
    try {
        const response = await fetch(`${OLLAMA_URL}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body)
        });
        
        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Ollama Error: ${err}`);
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