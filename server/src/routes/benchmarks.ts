import { Router } from 'express';
import pool from '../db';

const router = Router();

router.post('/', async (req, res) => {
    try {
        const run = req.body;
        // Postgres stores bigints as strings in JS sometimes, but inputs are numbers.
        // We need to map camelCase (frontend) to snake_case (DB) if we want pure SQL,
        // or just store JSONB. The schema defines columns, so let's map.

        await pool.query(
            `INSERT INTO benchmark_runs (
                id, timestamp, total_cases, avg_score, avg_faithfulness, avg_relevance,
                pass_rate, avg_time, results, config_used
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
                run.id || `bench-${Date.now()}`,
                run.timestamp,
                run.totalCases,
                run.avgScore,
                run.avgFaithfulness || 0,
                run.avgRelevance || 0,
                run.passRate,
                run.avgTime,
                JSON.stringify(run.results),
                JSON.stringify(run.configUsed || {})
            ]
        );
        res.json({ success: true, id: run.id });
    } catch (error: any) {
        console.error("Save Benchmark Error:", error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/', async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM benchmark_runs ORDER BY timestamp DESC`);
        // Map back to camelCase
        const runs = result.rows.map(row => ({
            id: row.id,
            timestamp: parseInt(row.timestamp),
            totalCases: row.total_cases,
            avgScore: row.avg_score,
            avgFaithfulness: row.avg_faithfulness,
            avgRelevance: row.avg_relevance,
            passRate: row.pass_rate,
            avgTime: row.avg_time,
            results: row.results,
            configUsed: row.config_used
        }));
        res.json(runs);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        await pool.query(`DELETE FROM benchmark_runs WHERE id = $1`, [req.params.id]);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
