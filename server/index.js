
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
        console.log(`📂 Creating data directory: ${dataDir}`);
        fs.mkdirSync(dataDir, { recursive: true });
    }
    
    console.log(`🔄 Connecting to LanceDB at: ${DB_PATH}`);
    db = await lancedb.connect(DB_PATH);
    console.log(`✅ LanceDB Connected.`);
    
    try {
        const tableNames = await db.tableNames();
        console.log(`📋 Existing tables: ${tableNames.join(', ')}`);
        
        if (tableNames.includes('knowledge_chunks')) {
            table = await db.openTable('knowledge_chunks');
            const count = await table.countRows();
            console.log(`✅ Table "knowledge_chunks" loaded. Rows: ${count}`);
        } else {
            console.log('ℹ️ Table "knowledge_chunks" does not exist yet. It will be created on ingestion.');
        }
    } catch (e) {
        console.error('⚠️ DB Init Error:', e);
    }
}

// --- HELPER FUNCTIONS ---

function getEmbeddingEndpoint(baseUrl) {
    const cleanUrl = baseUrl.replace(/\/$/, '');
    if (cleanUrl.endsWith('/v1')) {
        return `${cleanUrl}/embeddings`; 
    }
    return `${cleanUrl}/api/embeddings`; 
}

async function getEmbedding(text, config = {}) {
    const baseUrl = config.ollamaBaseUrl || DEFAULT_OLLAMA_URL;
    const model = config.embeddingModel || DEFAULT_EMBEDDING_MODEL;
    const endpoint = getEmbeddingEndpoint(baseUrl);

    const safeText = text.replace(/[\u0000-\u001F]/g, "");

    try {
        let body;
        if (baseUrl.endsWith('/v1')) {
            body = { model: model, input: safeText };
        } else {
            body = { model: model, prompt: safeText };
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            const errText = await response.text();
            console.error(`❌ Embedding API Error (${response.status}) at ${endpoint}: ${errText.substring(0, 100)}...`);
            return null;
        }

        const data = await response.json();
        const vector = data.embedding || (data.data && data.data[0] ? data.data[0].embedding : null);
        
        if (!vector) {
            console.warn(`⚠️ Vector missing in response from ${endpoint}`);
        }
        return vector;
    } catch (error) {
        console.error(`❌ Connection Error to ${endpoint}:`, error.message);
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
    console.log("📥 [API] /api/ingest called");
    try {
        const { chunks, configuration } = req.body;
        if (!chunks || !Array.isArray(chunks)) {
            console.error("❌ Invalid chunks data received");
            return res.status(400).json({ error: 'Invalid chunks data' });
        }

        console.log(`🔄 Processing ${chunks.length} chunks...`);
        console.log(`⚙️ Config:`, configuration);

        const processedChunks = [];
        let errorCount = 0;

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const vector = await getEmbedding(chunk.searchContent || chunk.content, configuration);
            
            if (vector && Array.isArray(vector) && vector.length > 0) {
                processedChunks.push({
                    id: chunk.id,
                    vector: vector,
                    content: chunk.content,
                    metadata: JSON.stringify(chunk.metadata),
                    source_id: chunk.source.id,
                    source_json: JSON.stringify(chunk.source),
                    created_at: Date.now()
                });
            } else {
                errorCount++;
                if (errorCount === 1) console.error("⚠️ First embedding failure detected. Check Ollama.");
            }
            
            if (i % 50 === 0 && i > 0) console.log(`   ...processed ${i}/${chunks.length}`);
        }

        console.log(`📊 Embedding Complete. Success: ${processedChunks.length}, Fail: ${errorCount}`);

        if (processedChunks.length === 0) {
            return res.status(500).json({ error: 'Ollama Connection Failed. No embeddings generated.' });
        }

        if (!table) {
            console.log("🆕 Creating new table 'knowledge_chunks'...");
            table = await db.createTable('knowledge_chunks', processedChunks);
        } else {
            console.log("➕ Appending to existing table...");
            try {
                await table.add(processedChunks);
            } catch (addError) {
                console.warn(`⚠️ Schema Mismatch or Add Error: ${addError.message}`);
                console.log("♻️ Dropping and recreating table...");
                await db.dropTable('knowledge_chunks');
                table = await db.createTable('knowledge_chunks', processedChunks);
            }
        }

        const count = await table.countRows();
        console.log(`✅ Indexed Successfully. Total rows in DB: ${count}`);
        res.json({ success: true, count: processedChunks.length });

    } catch (e) {
        console.error("❌ Ingestion Critical Error:", e);
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
            const metadata = r.metadata ? JSON.parse(r.metadata) : {};
            
            if (categoryFilter && metadata.category !== categoryFilter) {
                return null;
            }

            const vectorScore = 1 - (r._distance || 0); 
            const keywordScore = calculateKeywordScore(query, r.content);
            const hybridScore = (vectorScore * vectorWeight) + (keywordScore * (1 - vectorWeight));

            return {
                ...r,
                metadata,
                source: r.source_json ? JSON.parse(r.source_json) : {},
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

app.get('/api/chunks', async (req, res) => {
    console.log("⚡ [API] GET /api/chunks called");
    try {
        if (!table) {
            console.warn("⚠️ [API] Table variable is null/undefined. Reconnecting...");
            const tableNames = await db.tableNames();
            if (tableNames.includes('knowledge_chunks')) {
                table = await db.openTable('knowledge_chunks');
                console.log("🔄 [API] Re-opened table successfully.");
            } else {
                console.log("ℹ️ [API] Table does not exist in DB.");
                return res.json([]);
            }
        }
        
        const count = await table.countRows();
        console.log(`ℹ️ [DB] Row count before query: ${count}`);

        if (count === 0) {
            return res.json([]);
        }

        console.log("⏳ [DB] Executing query().limit(20000).execute()...");
        const results = await table.query().limit(20000).execute();
        
        let rows = [];

        // STRATEGY 1: Is it already an array?
        if (Array.isArray(results)) {
            console.log("✅ [DB] Results is an Array.");
            rows = results;
        } 
        // STRATEGY 2: Does it have toArray()? (Common in LanceDB)
        else if (typeof results.toArray === 'function') {
            console.log("🔄 [DB] Using .toArray()...");
            rows = await results.toArray();
        } 
        // STRATEGY 3: Async Iterator (for await...of)
        else if (results != null && typeof results[Symbol.asyncIterator] === 'function') {
            console.log("🔄 [DB] Using Async Iterator...");
            for await (const batch of results) {
                if (Array.isArray(batch)) rows.push(...batch);
                else if (batch && typeof batch.toArray === 'function') rows.push(...batch.toArray());
                else if (batch && typeof batch.toJSON === 'function') rows.push(...batch.toJSON());
                else rows.push(batch);
            }
        } 
        // STRATEGY 4: Sync Iterator (for...of) - This is likely what RecordBatchIterator is in this version
        else if (results != null && typeof results[Symbol.iterator] === 'function') {
            console.log("🔄 [DB] Using Sync Iterator...");
            for (const batch of results) {
                if (Array.isArray(batch)) rows.push(...batch);
                else if (batch && typeof batch.toArray === 'function') rows.push(...batch.toArray());
                else if (batch && typeof batch.toJSON === 'function') rows.push(...batch.toJSON());
                else rows.push(batch);
            }
        } 
        // FALLBACK
        else {
            console.warn("⚠️ [DB] Unknown result type. Attempting naive push.", typeof results);
            rows.push(results);
        }

        console.log(`📦 [DB] Fetched ${rows.length} rows. Mapping to clean JSON...`);

        const sanitized = rows.map(r => {
            if (!r) return null;
            // Handle different row structures
            const vector = r.vector || r.values?.vector;
            const content = r.content || r.values?.content;
            const rest = r;
            
            // Clean up vector to save bandwidth
            const { vector: _v, ...cleanRest } = rest;
            return cleanRest;
        }).filter(Boolean);
        
        console.log(`✅ [API] Sending ${sanitized.length} chunks to client.`);
        res.json(sanitized);
    } catch (e) {
        console.error("❌ [ERROR] Fetch Chunks Critical Failure:");
        console.error(e);
        // Do not crash the server, return empty array
        res.json([]);
    }
});

app.post('/api/chat', async (req, res) => {
    try {
        const { configuration, ...chatBody } = req.body;
        const baseUrl = configuration?.ollamaBaseUrl || DEFAULT_OLLAMA_URL;
        
        const cleanUrl = baseUrl.replace(/\/$/, '');
        const endpoint = cleanUrl.endsWith('/v1') 
            ? `${cleanUrl}/chat/completions` 
            : `${cleanUrl}/api/chat`; 

        console.log(`💬 [Chat] Sending request to ${endpoint}`);

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(chatBody)
        });
        
        if (!response.ok) {
            const err = await response.text();
            console.error(`❌ Chat API Error: ${err}`);
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
    console.log("🧨 [API] Reset called. Wiping DB...");
    try {
        if (table) {
            try { await db.dropTable('knowledge_chunks'); } catch(e) {}
            table = null;
        }
        
        if (fs.existsSync(DB_PATH)) {
             fs.rmSync(DB_PATH, { recursive: true, force: true });
             fs.mkdirSync(DB_PATH);
        }
        await initDB();
        console.log("✅ [API] DB Reset Complete.");
        res.json({ success: true });
    } catch (e) {
        console.error("Reset Error:", e);
        res.status(500).json({ error: e.message });
    }
});

initDB().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 Central RAG Server running on http://localhost:${PORT}`);
    });
});
