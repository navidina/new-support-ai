import { Router } from 'express';
import pool from '../db';

const router = Router();

router.post('/', async (req, res) => {
    try {
        const record = req.body;
        await pool.query(
            `INSERT INTO fine_tuning_dataset (prompt, response, context, score, source_ids, model)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                record.prompt,
                record.response,
                record.context,
                record.score,
                JSON.stringify(record.sourceIds || []),
                record.model
            ]
        );
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/export', async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM fine_tuning_dataset`);
        // Convert to JSONL format string
        const jsonl = result.rows.map(r => JSON.stringify({
            messages: [
                { role: "user", content: r.prompt },
                { role: "assistant", content: r.response }
            ],
            context: r.context,
            score: r.score,
            metadata: { source_ids: r.source_ids, model: r.model }
        })).join('\n');

        res.send(jsonl);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/count', async (req, res) => {
    try {
        const result = await pool.query(`SELECT COUNT(*) as count FROM fine_tuning_dataset`);
        res.json({ count: parseInt(result.rows[0].count) });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
