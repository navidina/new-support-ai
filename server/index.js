const express = require('express');
const cors = require('cors');
const lancedb = require('@lancedb/lancedb');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3001; // Running on port 3001 to avoid conflict with React (3000)

// Configuration
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const EMBEDDING_MODEL = 'text-embedding-nomic-embed-text-v1.5@q4_k_m'; // Ensure this matches your Ollama model
const DB_PATH = path.join(__dirname, 'data/rayan-db');

app.use(cors());
app.use(express.json({ limit: '100mb' })); // Increase limit for large file uploads

// --- DATABASE INIT ---
let db;
let table;

async function initDB() {
    if (!fs.existsSync(DB_PATH)) {
        fs.mkdirSync(DB_PATH, { recursive: true });
    }
    db = await lancedb.connect(DB_PATH);
    console.log(`📂 LanceDB connected at ${DB_PATH}`);
    
    // Check if table exists, create if not (Logic handled in ingestion)
    try {
        table = await db.openTable('knowledge_chunks');
        console.log('✅ Table "knowledge_chunks" loaded.');
    } catch (e) {
        console.log('ℹ️ Table "knowledge_chunks" does not exist yet. Will be created on first ingestion.');
    }
}

// --- HELPER FUNCTIONS ---

// 1. Server-side Embedding
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
        const data = await response.json();
        return data.embedding;
    } catch (error) {
        console.error("Embedding Error:", error.message);
        return null;
    }
}

// 2. Keyword Scoring Logic (Ported from reranker.ts)
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
    
    // Bigram
    let matchedBigrams = 0;
    for (let i = 0; i < queryTokens.length - 1; i++) {
        const bigram = `${queryTokens[i]} ${queryTokens[i+1]}`;
        if (normContent.includes(bigram)) {
            matchedBigrams++;
            score += 0.3;
        }
    }

    // Tokens
    let matchedTokens = 0;
    queryTokens.forEach(token => {
        if (normContent.includes(token)) {
            matchedTokens++;
            const count = normContent.split(token).length - 1;
            score += Math.min(count, 3) * 0.05;
        }
    });

    score += (matchedTokens / queryTokens.length) * 0.4;
    if (matchedTokens === queryTokens.length) score += 0.2;

    return Math.min(1.0, score);
};

// --- API ROUTES ---

// 1. Ingestion Endpoint
app.post('/api/ingest', async (req, res) => {
    try {
        const { chunks } = req.body;
        if (!chunks || !Array.isArray(chunks)) {
            return res.status(400).json({ error: 'Invalid chunks data' });
        }

        console.log(`📥 Receiving ${chunks.length} chunks...`);

        // Generate embeddings server-side
        const processedChunks = [];
        for (const chunk of chunks) {
            const vector = await getEmbedding(chunk.searchContent || chunk.content);
            if (vector) {
                processedChunks.push({
                    id: chunk.id,
                    vector: vector, // LanceDB expects 'vector' field by default or configured
                    content: chunk.content,
                    metadata: JSON.stringify(chunk.metadata), // Flat structure for LanceDB
                    source_id: chunk.source.id,
                    source_json: JSON.stringify(chunk.source),
                    created_at: Date.now()
                });
            }
        }

        if (processedChunks.length === 0) {
            return res.status(500).json({ error: 'Failed to generate embeddings' });
        }

        if (!table) {
            // Create table with the first batch
            table = await db.createTable('knowledge_chunks', processedChunks);
        } else {
            await table.add(processedChunks);
        }

        console.log(`✅ Indexed ${processedChunks.length} chunks into LanceDB.`);
        res.json({ success: true, count: processedChunks.length });

    } catch (e) {
        console.error("Ingestion Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// 2. Search Endpoint (Hybrid)
app.post('/api/search', async (req, res) => {
    try {
        const { query, categoryFilter, vectorWeight = 0.35, topK = 20 } = req.body;
        
        if (!table) {
            return res.json([]); // No data yet
        }

        const queryVector = await getEmbedding(query);
        if (!queryVector) {
            return res.status(500).json({ error: 'Embedding failed' });
        }

        // Vector Search via LanceDB
        let results = await table.search(queryVector)
            .limit(50) // Fetch more candidates for re-ranking
            .execute();

        // Client-side mapping & Hybrid Reranking (running on Node.js)
        const rankedResults = results.map(r => {
            const metadata = JSON.parse(r.metadata);
            
            // Filter logic (Software filtering since LanceDB SQL filter on JSON string is complex)
            if (categoryFilter && metadata.category !== categoryFilter) {
                return null;
            }

            // LanceDB returns distance (lower is better). Convert to similarity (approx 1 - distance/2 for cosine)
            // Note: LanceDB default metric is L2 or Cosine. Assuming Cosine distance (0..2).
            // Let's assume we want a normalized 0..1 score.
            // Simplified: vectorScore approx 1 - r._distance (if metric is cosine distance)
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
                // Add hybrid score for UI
                rerankScore: hybridScore
            };
        })
        .filter(r => r !== null) // Remove filtered items
        .sort((a, b) => b.score - a.score) // Sort by Hybrid Score
        .slice(0, topK);

        res.json(rankedResults);

    } catch (e) {
        console.error("Search Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// 3. Stats Endpoint
app.get('/api/stats', async (req, res) => {
    try {
        if (!table) return res.json({ count: 0 });
        const count = await table.countRows();
        res.json({ count });
    } catch (e) {
        res.json({ count: 0 });
    }
});

// 4. Reset DB
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

// Start Server
initDB().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 Central RAG Server running on http://localhost:${PORT}`);
    });
});