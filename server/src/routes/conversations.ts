import { Router } from 'express';
import { query } from '../db';

const router = Router();

// Save or Update Conversation
router.post('/', async (req, res) => {
    try {
        const { id, title, messages, user_id } = req.body;
        // The user_id might come from headers if we had real auth, but for now we trust the client or body
        // The prompt suggested a simple transition, so let's stick to the body or assume userId is sent.

        const userId = user_id || req.headers['x-user-id'] || 'anonymous';

        if (!id || !messages) {
            return res.status(400).json({ error: "Missing conversation data" });
        }

        const messagesJson = JSON.stringify(messages);

        // Upsert logic (Postgres 9.5+)
        await query(
            `INSERT INTO conversations (id, user_id, title, messages, last_updated)
             VALUES ($1, $2, $3, $4, NOW())
             ON CONFLICT (id)
             DO UPDATE SET
                title = EXCLUDED.title,
                messages = EXCLUDED.messages,
                last_updated = NOW()`,
            [id, userId, title, messagesJson]
        );

        res.json({ success: true, id });
    } catch (error: any) {
        console.error("Save Conversation Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// List Conversations
router.get('/', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'] || 'anonymous'; // Filter by user if needed
        // The prompt says "Central system... everyone can ask... based on unified knowledge".
        // It doesn't explicitly say conversations are private, but usually they are.
        // Let's filter by user_id if provided.

        let sql = `SELECT * FROM conversations`;
        const params: any[] = [];

        if (userId !== 'admin') { // Simple admin check or just filter
             sql += ` WHERE user_id = $1`;
             params.push(userId);
        }

        sql += ` ORDER BY last_updated DESC LIMIT 50`;

        const result = await query(sql, params);
        res.json(result.rows);
    } catch (error: any) {
        console.error("List Conversations Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Get Single Conversation
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await query(`SELECT * FROM conversations WHERE id = $1`, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Conversation not found" });
        }

        res.json(result.rows[0]);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Delete Conversation
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await query(`DELETE FROM conversations WHERE id = $1`, [id]);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
