import { Router } from 'express';
import { query } from '../db';

const router = Router();

router.post('/ingest', async (req, res) => {
    try {
        const { chunks } = req.body;

        if (!Array.isArray(chunks) || chunks.length === 0) {
             return res.status(400).json({ error: "Invalid chunks data" });
        }

        console.log(`Ingesting ${chunks.length} chunks...`);

        // Use a transaction or just loop inserts (for simplicity in this proof of concept)
        // For better performance with large arrays, we should use pg-format or multiple values insert.
        // But loop with Promise.all is okay for moderate size.

        const promises = chunks.map(chunk => {
            const embeddingString = JSON.stringify(chunk.embedding);
            const metadataString = JSON.stringify(chunk.metadata);

            return query(
                `INSERT INTO knowledge_chunks (content, embedding, metadata) VALUES ($1, $2, $3)`,
                [chunk.content, embeddingString, metadataString]
            );
        });

        await Promise.all(promises);

        res.json({ success: true, count: chunks.length });
    } catch (error: any) {
        console.error("Ingest Error:", error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
