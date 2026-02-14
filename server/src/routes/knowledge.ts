import { Router } from 'express';
import pool from '../db';

const router = Router();

router.post('/ingest', async (req, res) => {
    const client = await pool.connect();

    try {
        const { chunks } = req.body;

        if (!chunks || !Array.isArray(chunks) || chunks.length === 0) {
             return res.status(400).json({ error: "Invalid chunks data" });
        }

        await client.query('BEGIN');
        console.log(`Ingesting ${chunks.length} chunks...`);

        const BATCH_SIZE = 500;

        for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
            const batch = chunks.slice(i, i + BATCH_SIZE);
            const values: any[] = [];
            const placeholders: string[] = [];

            batch.forEach((chunk: any, batchIdx: number) => {
                const offset = batchIdx * 4;
                placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`);

                values.push(
                    chunk.id,
                    chunk.content,
                    JSON.stringify(chunk.embedding),
                    JSON.stringify(chunk.metadata)
                );
            });

            const queryText = `
                INSERT INTO knowledge_chunks (id, content, embedding, metadata)
                VALUES ${placeholders.join(', ')}
                ON CONFLICT (id)
                DO UPDATE SET
                    content = EXCLUDED.content,
                    embedding = EXCLUDED.embedding,
                    metadata = EXCLUDED.metadata,
                    created_at = NOW()
            `;

            await client.query(queryText, values);
        }

        await client.query('COMMIT');
        res.json({ success: true, count: chunks.length });
    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error("Ingest Error:", error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});

export default router;
