# Architecture & Development Guidelines

## Client-Server Architecture (Transitioned from Local-First)

This project has been migrated from a local IndexedDB architecture to a centralized Node.js/PostgreSQL client-server model.

### Key Rules
1.  **Frontend Services**: Files in `src/services/` (e.g., `database.ts`, `search.ts`) should act as **API Clients**. They should not contain business logic for search or database management.
2.  **Backend Logic**: All heavy processing, including Vector Search, Hybrid Ranking, and LLM Orchestration, must reside in `server/src/`.
3.  **Database**:
    *   Use `pgvector` for embeddings.
    *   Use `ts_rank_cd` with normalization for keyword scoring.
    *   Ensure `ON CONFLICT` (Upsert) logic is used for ingestion.
4.  **Tickets Isolation**: Ticket data must be tagged with `metadata.category = 'tickets'` to ensure proper filtering.

### Running the Project
*   **Backend**: `npm run server` (runs from root, executes `cd server && npm run dev`).
*   **Frontend**: `npm run dev`.

### Environment Variables
*   Frontend: `.env` (VITE_API_URL, VITE_OLLAMA_BASE_URL).
*   Backend: `server/.env` (DATABASE_URL, OLLAMA_BASE_URL, PORT).
