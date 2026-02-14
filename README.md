# Rayan Ham-Afza Intelligent Support Assistant (Enterprise RAG)

A specialized, centralized Retrieval-Augmented Generation (RAG) application designed for financial software troubleshooting and documentation navigation. This application uses a Client-Server architecture with a Node.js backend and PostgreSQL database to provide a unified knowledge base for all support staff.

## 🌟 Overview

This project has been transitioned from a "Local-First" prototype to an "Enterprise-Ready" solution. It allows users to upload confidential financial documentation, which is processed and stored in a central server, enabling all support agents to access the same knowledge base and perform semantic searches.

### Key Capabilities

1.  **Centralized Knowledge Base**:
    *   **PostgreSQL + pgvector**: Stores document chunks and vector embeddings efficiently.
    *   **Shared Access**: All users query the same database, ensuring consistency.
2.  **Advanced Hybrid Search Engine (Server-Side)**:
    *   **Vector Search**: Uses Cosine Similarity for semantic matching.
    *   **Keyword Boosting**: Uses PostgreSQL `ts_rank` for exact text matching.
    *   **Query Expansion**: Automatically expands queries with Persian financial synonyms.
3.  **Secure & Scalable**:
    *   **Node.js Backend**: Handles authentication (basic user tracking) and search logic.
    *   **Central LLM Connection**: Connects to a central Ollama/vLLM server for heavy lifting.
4.  **Interactive Frontend**:
    *   **React 19**: Modern UI for chatting and visualizing knowledge.
    *   **Knowledge Graph**: Visualizes relationships between documents and concepts.

## 🛠 Tech Stack

*   **Frontend**: React 19, TypeScript, Tailwind CSS, Vite
*   **Backend**: Node.js, Express, TypeScript
*   **Database**: PostgreSQL with `pgvector` extension
*   **AI Engine**: Centralized Ollama (or compatible LLM)

## 🚀 Getting Started

### Prerequisites

1.  **Node.js**: Version 18+ is required.
2.  **PostgreSQL**: Version 15+ with `pgvector` extension installed.
    *   Install pgvector: `CREATE EXTENSION vector;`
3.  **Ollama**: A central instance running the LLM models.
    *   Models: `aya:8b` (Chat), `mxbai-embed-large` (Embeddings).

### Installation & Setup

1.  **Clone the repository**.
2.  **Install dependencies**:
    ```bash
    npm install
    cd server && npm install && cd ..
    ```
3.  **Configure Environment**:
    *   Create `.env` in the root for Frontend:
        ```env
        VITE_API_URL=http://localhost:3000/api
        VITE_OLLAMA_BASE_URL=http://your-ollama-server:11434/v1
        ```
    *   Create `server/.env` for Backend:
        ```env
        DATABASE_URL=postgresql://user:password@localhost:5432/rayan_rag
        OLLAMA_BASE_URL=http://your-ollama-server:11434/v1
        PORT=3000
        ```
4.  **Setup Database**:
    *   Create a database named `rayan_rag`.
    *   Run the schema script:
        ```bash
        psql -d rayan_rag -f server/src/schema.sql
        ```

### Migration (From Local Version)

If you have data exported from the previous local version (JSON file):
```bash
# Run from root directory
npx ts-node server/scripts/migrate.ts path/to/export.json
```

### Running the Application

1.  **Start the Backend**:
    ```bash
    npm run server
    ```
    (Runs on port 3000 by default)

2.  **Start the Frontend**:
    ```bash
    npm run dev
    ```
    (Runs on port 5173 by default)

## 📂 Project Structure

```
src/                 # Frontend (React)
├── components/      # UI Components
├── services/        # Frontend Services (API Clients)
│   ├── database.ts  # Calls Backend API
│   ├── search.ts    # Calls Backend Search API
│   └── ...
server/              # Backend (Node.js)
├── src/
│   ├── routes/      # API Endpoints (Search, Knowledge, Chat)
│   ├── services/    # Backend Logic (Ollama, etc.)
│   ├── db.ts        # Database Connection
│   └── schema.sql   # Database Schema
├── scripts/         # Migration & Utility Scripts
└── package.json
```
