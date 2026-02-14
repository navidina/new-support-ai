-- Enable vector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Knowledge chunks table
CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    embedding VECTOR(1024), -- Adjust size based on your model (e.g., mxbai-embed-large is 1024)
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Index for fast vector search
CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT,
    messages JSONB,
    last_updated TIMESTAMP DEFAULT NOW()
);

-- Benchmark Runs table
CREATE TABLE IF NOT EXISTS benchmark_runs (
    id TEXT PRIMARY KEY,
    timestamp BIGINT,
    total_cases INTEGER,
    avg_score FLOAT,
    avg_faithfulness FLOAT,
    avg_relevance FLOAT,
    pass_rate FLOAT,
    avg_time FLOAT,
    results JSONB,
    config_used JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Fine-tuning Dataset table
CREATE TABLE IF NOT EXISTS fine_tuning_dataset (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    prompt TEXT NOT NULL,
    response TEXT NOT NULL,
    context TEXT,
    score FLOAT,
    source_ids JSONB,
    model TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
