import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import knowledgeRoutes from './routes/knowledge';
import conversationRoutes from './routes/conversations';
import searchRoutes from './routes/search';
import benchmarkRoutes from './routes/benchmarks';
import fineTuningRoutes from './routes/finetuning';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001; // Changed to 3001 to avoid conflict with frontend (3000)

app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increase limit for large chunks ingest

app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/benchmarks', benchmarkRoutes);
app.use('/api/fine-tuning', fineTuningRoutes);

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
