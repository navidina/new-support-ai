import fs from 'fs/promises';
import path from 'path';
import { query } from '../src/db';

const migrate = async () => {
    const filePath = process.argv[2];
    if (!filePath) {
        console.error("Please provide path to JSON export file");
        process.exit(1);
    }

    try {
        console.log(`Reading ${filePath}...`);
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const json = JSON.parse(fileContent);

        // Handle different export formats (array or { data: [] })
        let chunks = [];
        if (Array.isArray(json)) {
            chunks = json;
        } else if (json.data && Array.isArray(json.data)) {
            chunks = json.data;
        } else {
            throw new Error("Invalid JSON format");
        }

        console.log(`Found ${chunks.length} chunks. Starting migration...`);

        let successCount = 0;
        let errorCount = 0;

        // Process in batches
        const BATCH_SIZE = 50;
        for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
            const batch = chunks.slice(i, i + BATCH_SIZE);
            const promises = batch.map(async (chunk: any) => {
                try {
                    // Ensure ID exists
                    const id = chunk.id || `migrated-${Date.now()}-${Math.random()}`;

                    // Convert embedding to string format for pgvector if needed
                    // Usually JSON.stringify([1,2]) -> "[1,2]" works
                    const embedding = JSON.stringify(chunk.embedding || []);
                    const metadata = JSON.stringify(chunk.metadata || {});

                    await query(
                        `INSERT INTO knowledge_chunks (id, content, embedding, metadata)
                         VALUES ($1, $2, $3, $4)
                         ON CONFLICT (id) DO NOTHING`,
                        [id, chunk.content, embedding, metadata]
                    );
                    successCount++;
                } catch (e) {
                    console.error(`Error inserting chunk ${chunk.id}:`, e);
                    errorCount++;
                }
            });

            await Promise.all(promises);
            console.log(`Processed ${Math.min(i + BATCH_SIZE, chunks.length)} / ${chunks.length}`);
        }

        console.log(`Migration complete.`);
        console.log(`Success: ${successCount}`);
        console.log(`Errors: ${errorCount}`);
        process.exit(0);

    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
};

migrate();
