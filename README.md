
# Rayan Ham-Afza Intelligent Support Assistant (Local RAG)

A specialized, client-side Retrieval-Augmented Generation (RAG) application designed for financial software troubleshooting and documentation navigation. This application runs entirely within the browser (using IndexedDB for storage) while connecting to a local AI API (Ollama) for embeddings and generation.

## 🌟 Overview

This project demonstrates a "Local-First" approach to Enterprise AI. It allows users to upload confidential financial documentation (Word, Text, Markdown), process it locally without uploading to a cloud server, and perform semantic searches or specialized troubleshooting queries.

### Key Capabilities

1.  **Local ETL Pipeline**:
    *   Parses `.docx` and text files in the browser.
    *   Normalizes Persian text (character unification, noise removal).
    *   **Smart Classification**: Automatically categorizes documents into 8 specific financial domains (e.g., Back Office, Online Trading, Funds) using keyword heuristics.
    *   **Metadata Extraction**: Extracts Ticket IDs, Customer IDs, and Software Versions via Regex.
2.  **Vector Database Simulation**:
    *   Uses **IndexedDB** to store document chunks and their vector embeddings.
    *   Implements a custom MongoDB-like query interface wrapper (`LocalDB`).
3.  **Advanced Hybrid Search Engine**:
    *   **Vector Search**: Uses Cosine Similarity for semantic matching.
    *   **Keyword Boosting**: Heavily weights exact matches for IDs (Tickets, Error Codes).
    *   **Navigation Heuristics**: Automatically detects when a user is looking for a feature's location (e.g., "Where is Report X?") and injects navigation keywords ("Menu", "Path") to find the answer.
    *   **Query Expansion**: Uses a built-in synonym dictionary to broaden search terms.
4.  **Interactive Knowledge Graph**:
    *   **Recursive Tree Layout**: Visualizes document hierarchy without node overlap.
    *   **Schema View**: Displays relationships between Systems, Errors, and Solutions.
    *   **Force-Directed & Radial**: Alternative visualization modes.
5.  **Deep Synthesis & Knowledge Wiki**:
    *   **Smart Document Generation**: Reconstructs fragmented chunks into cohesive, readable topics using an LLM-driven batching strategy.
    *   **Logic Panel**: Debug view to see exactly what the AI retrieved and how it processed the query.

## 🛠 Tech Stack

*   **Frontend**: React 19, TypeScript, Tailwind CSS
*   **Icons**: Lucide React
*   **Parsing**: `mammoth.js` (for Word documents)
*   **AI Backend**: [Ollama](https://ollama.com/) (running locally)
*   **Storage**: Native Browser IndexedDB

## 🚀 Getting Started

### Prerequisites

1.  **Node.js**: Version 18+ is recommended.
2.  **Ollama**: You must have Ollama installed and running to provide the AI brains.
    *   [Download Ollama](https://ollama.com/download)
    *   Pull the required models:
        ```bash
        ollama pull aya:8b          # For Chat (Persian support)
        ollama pull jeffh/intfloat-multilingual-e5-large-instruct:f32  # For Embeddings
        ```
    *   **Important**: Start Ollama with CORS enabled so the browser can talk to it:
        *   **Mac/Linux**: `OLLAMA_ORIGINS="*" ollama serve`
        *   **Windows**: Set environment variable `OLLAMA_ORIGINS="*"` and restart Ollama.

### Installation

1.  Clone the repository.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Start the development server:
    ```bash
    npm start
    ```

## 📂 Project Structure

```
src/
├── components/          # React UI Components
│   ├── KnowledgeGraph.tsx    # Canvas-based graph visualization
│   ├── ChatBubble.tsx        # Message renderer with Logic Panel
│   ├── HelpModal.tsx         # Comprehensive Documentation
│   └── ...
├── services/            # Core Logic (The "Backend" running in frontend)
│   ├── search.ts           # Hybrid Search & Query Expansion Logic
│   ├── graphEngine.ts      # Graph Layout Algorithms (Tree, Force, Schema)
│   ├── synonymsData.ts     # Persian Synonym Dictionary
│   ├── ollama.ts           # API client for Ollama
│   ├── textProcessor.ts    # NLP, Cleaning, and Classification logic
│   └── database.ts         # High-level DB operations
├── types.ts             # TypeScript interfaces (Data Models)
└── App.tsx              # Main entry point and state management
```

## 📖 Developer Guide

### The RAG Pipeline
The pipeline is defined in `services/fileParser.ts` and `services/textProcessor.ts`.
1.  **Ingestion**: Files are read as ArrayBuffers.
2.  **Cleaning**: `cleanAndNormalizeText` unifies Arabic/Persian characters (ي/ک) and removes formatting noise.
3.  **Classification**: `classifyDocument` assigns a category (e.g., 'back_office') based on weighted keyword matching.
4.  **Chunking**: `smartChunking` splits text into semantic segments (default 2000 chars) with overlap.
5.  **Embedding**: Chunks are sent to Ollama to get a 1024-dim vector.
6.  **Storage**: Metadata + Text + Vector are saved to `chunks` store in IndexedDB.

### The Search Algorithm (`services/search.ts`)
1.  **Normalization**: Unifies characters and removes stop words.
2.  **Expansion**:
    *   **Dictionary**: Adds synonyms from `synonymsData.ts`.
    *   **Heuristics**: If the query mentions a report name, adds "Menu", "Path", "Address" to the search tokens to prioritize finding its location.
3.  **Hybrid Scoring**:
    *   Calculates Vector Similarity (Semantic).
    *   Calculates Keyword Match Score (Exact).
    *   **Weighting**: If critical terms (IDs, specific error codes) exist, they carry 80% weight; otherwise, vectors carry the load.
4.  **Reranking**: Results are sorted, and the top chunks are sent to the LLM as `CONTEXT`.

### Deep Synthesis (Smart Docs)
Defined in `services/ollama.ts` -> `generateSynthesizedDocument`.
*   Uses a "Batching & Recursive Appending" strategy.
*   Takes hundreds of scattered chunks, groups them into batches of 15.
*   Feeds them sequentially to the LLM with a prompt to "continue writing the document".
*   Produces a single, Markdown-formatted technical manual.

## 🤝 Contributing
Please ensure every new function has a JSDoc comment explaining its purpose, parameters, and return value. Run the benchmark suite before submitting changes to core search logic.
