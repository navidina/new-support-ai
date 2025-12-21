
import { KnowledgeChunk, BenchmarkCase } from '../types';
import { cleanAndNormalizeText, classifyDocument, extractMetadata, chunkWhole, chunkQA, smartChunking, chunkMarkdown, classifyTextSegment, stripHtml } from './textProcessor';
import { getEmbedding } from './ollama';
import { saveChunksToDB } from './database';
import { getSettings } from './settings';

// Global definition for the mammoth library
declare var mammoth: any;

/**
 * Parses a Ticket Export CSV (based on Excel Image).
 * Structure: TicketNum | Title | Body | CreateDate ...
 * Strategy:
 * 1. Parse CSV (handling quoted newlines)
 * 2. Group rows by TicketNum
 * 3. Sort each group by ID or Date
 * 4. Question = Body of First Row
 * 5. GroundTruth = Body of Last Row (Resolution)
 */
export const parseTicketCSV = async (file: File): Promise<BenchmarkCase[]> => {
    const text = await file.text();
    const rows: string[][] = [];
    
    // Robust CSV Parser for Quoted Newlines
    let inQuote = false;
    let currentCell = '';
    let currentRow: string[] = [];
    
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (char === '"') {
            if (inQuote && nextChar === '"') {
                currentCell += '"'; // Escaped quote
                i++;
            } else {
                inQuote = !inQuote;
            }
        } else if (char === ',' && !inQuote) {
            currentRow.push(currentCell);
            currentCell = '';
        } else if ((char === '\r' || char === '\n') && !inQuote) {
            if (char === '\r' && nextChar === '\n') i++;
            currentRow.push(currentCell);
            rows.push(currentRow);
            currentRow = [];
            currentCell = '';
        } else {
            currentCell += char;
        }
    }
    if (currentCell || currentRow.length > 0) {
        currentRow.push(currentCell);
        rows.push(currentRow);
    }

    if (rows.length < 2) throw new Error("File appears empty or invalid");

    // Header Mapping
    const headers = rows[0].map(h => h.trim().toLowerCase());
    const ticketIdx = headers.findIndex(h => h.includes('ticketnum'));
    const bodyIdx = headers.findIndex(h => h.includes('body'));
    const titleIdx = headers.findIndex(h => h.includes('title'));
    
    if (ticketIdx === -1 || bodyIdx === -1) {
        throw new Error("CSV must contain 'TicketNum' and 'Body' columns.");
    }

    // Grouping
    const ticketGroups = new Map<string, { body: string, title: string }[]>();

    // Skip header
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length <= ticketIdx) continue;

        const ticketNum = row[ticketIdx]?.trim();
        let body = row[bodyIdx] || "";
        const title = titleIdx !== -1 ? row[titleIdx] || "" : "";

        if (!ticketNum) continue;

        // Clean HTML from body
        body = stripHtml(body);
        
        if (!body || body.length < 5) continue;

        if (!ticketGroups.has(ticketNum)) {
            ticketGroups.set(ticketNum, []);
        }
        ticketGroups.get(ticketNum)!.push({ body, title });
    }

    const cases: BenchmarkCase[] = [];

    ticketGroups.forEach((entries, ticketNum) => {
        if (entries.length < 2) return; // Need at least Question + Answer

        // Assuming file order is chronological or reverse chronological.
        // We need heuristic. Usually ticket exports are ordered.
        // Let's assume input order is [First Message ... Last Message]
        // If the first message contains "با سلام" (Greetings), it's likely the question.
        
        const questionObj = entries[0];
        const answerObj = entries[entries.length - 1];

        // Sanity Check: If question matches answer (single row duplicated), skip
        if (questionObj.body === answerObj.body) return;

        cases.push({
            id: `ticket-${ticketNum}`,
            category: 'Ticket Analysis',
            question: `${questionObj.title ? `عنوان: ${questionObj.title}\n` : ''}متن تیکت: ${questionObj.body}`,
            groundTruth: answerObj.body
        });
    });

    return cases;
};

/**
 * Parses a DOCX file specifically to extract Benchmark Cases from a table.
 * 
 * Assumes a specific table structure in the Word document:
 * [Col 1: Question | Col 2: Ground Truth Answer | Col 3: Category (Optional)]
 * 
 * @param {File} file - The uploaded DOCX file.
 * @returns {Promise<BenchmarkCase[]>} A promise resolving to an array of benchmark cases.
 */
export const parseBenchmarkDocx = async (file: File): Promise<BenchmarkCase[]> => {
    if (typeof mammoth === 'undefined') {
        throw new Error("Mammoth library not loaded");
    }

    const arrayBuffer = await file.arrayBuffer();
    // Use convertToHtml to preserve table structure
    const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer });
    const htmlContent = result.value;

    // Use DOMParser to walk the table
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    const rows = Array.from(doc.querySelectorAll('tr'));

    const cases: BenchmarkCase[] = [];

    // Skip header row usually, but we check content length to be safe
    for (let i = 0; i < rows.length; i++) {
        const cells = rows[i].querySelectorAll('td');
        
        // Ensure row has at least 2 columns (Question, Answer)
        if (cells.length < 2) continue;

        // In RTL Word tables converted to HTML, cell order usually follows logical order (Right to Left visually -> Index 0 to N in DOM)
        // Col 0: Question
        // Col 1: Ground Truth
        // Col 2: Category (Optional)
        
        const rawQuestion = cells[0].textContent || "";
        const rawAnswer = cells[1].textContent || "";
        const rawCategory = cells[2]?.textContent || "General";

        const question = cleanAndNormalizeText(rawQuestion);
        const answer = cleanAndNormalizeText(rawAnswer);

        // Filter out headers or empty rows
        // Basic heuristic: Question must be longer than 5 chars and not be "سوال"
        if (question.length < 5 || question.includes("سوال") || question.includes("Question")) {
            continue;
        }

        cases.push({
            id: Date.now() + i, // Generate unique temp ID
            question: question,
            groundTruth: answer,
            category: cleanAndNormalizeText(rawCategory) || 'Custom'
        });
    }

    return cases;
};

/**
 * Parses and processes a list of files into vector embeddings.
 * 
 * Pipeline:
 * 1. Read file content (Text or Docx).
 * 2. Clean and Normalize.
 * 3. Classify Document.
 * 4. Split into chunks (Parent/Child strategy).
 * 5. Embed each chunk using Ollama.
 * 6. Save to Database.
 * 
 * @param {FileList} fileList - The list of files from the file input.
 * @param {(fileName: string, step: 'reading' | 'embedding' | 'complete' | 'error', info?: any) => void} [onProgress] - Callback for progress updates.
 * @param {AbortSignal} [signal] - Optional signal to abort processing.
 * @returns {Promise<KnowledgeChunk[]>} The processed chunks.
 */
export const parseFiles = async (
  fileList: FileList, 
  onProgress?: (fileName: string, step: 'reading' | 'embedding' | 'complete' | 'error', info?: any) => void,
  signal?: AbortSignal
): Promise<KnowledgeChunk[]> => {
  const settings = getSettings();
  const chunks: KnowledgeChunk[] = [];
  const files = Array.from(fileList);

  for (const file of files) {
    // 1. Check for cancellation at start of file
    if (signal?.aborted) throw new Error("ABORTED");

    const fileChunks: KnowledgeChunk[] = [];
    try {
      if (onProgress) onProgress(file.name, 'reading', 'Initializing stream...');
      
      let rawText = '';
      const fileName = file.name;

      if (fileName.toLowerCase().endsWith('.docx')) {
        if (typeof mammoth !== 'undefined') {
          const arrayBuffer = await file.arrayBuffer();
          const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
          rawText = result.value;
        } else {
          throw new Error("Mammoth library missing for docx");
        }
      } else if (file.type.startsWith('text/') || fileName.match(/\.(md|txt|json|csv|log)$/i)) {
        rawText = await file.text();
      } else {
        continue;
      }

      if (!rawText) {
          if (onProgress) onProgress(file.name, 'complete', { count: 0 });
          continue;
      }

      // 2. Check for cancellation after reading
      if (signal?.aborted) throw new Error("ABORTED");

      if (onProgress) onProgress(file.name, 'reading', 'Clean & Normalize Text...');
      const cleanedText = cleanAndNormalizeText(rawText);
      
      // Initial file-level classification
      const initialClass = classifyDocument(cleanedText, fileName);
      
      if (onProgress) onProgress(file.name, 'reading', `Classified: ${initialClass.category}/${initialClass.subCategory}`);

      const fileMetadata = extractMetadata(cleanedText, fileName, initialClass.category, initialClass.subCategory);
      
      // PARENT-CHILD INDEXING STRATEGY using Configurable Settings
      let parentChunks: string[] = [];
      if (fileName.toLowerCase().endsWith('.md')) {
          if (onProgress) onProgress(file.name, 'reading', 'Applying Markdown Structure Analysis...');
          parentChunks = chunkMarkdown(cleanedText, settings.chunkSize, settings.chunkOverlap);
      } else if (initialClass.category === 'troubleshooting') {
          parentChunks = chunkWhole(cleanedText);
      } else if (cleanedText.includes('سوال :')) {
          parentChunks = chunkQA(cleanedText);
      } else {
          parentChunks = smartChunking(cleanedText, settings.chunkSize, settings.chunkOverlap);
      }

      if (onProgress) onProgress(file.name, 'embedding', `Chunking strategy applied. ${parentChunks.length} segments.`);
      
      for (let i = 0; i < parentChunks.length; i++) {
        // 3. Check for cancellation inside chunk loop
        if (signal?.aborted) throw new Error("ABORTED");

        const parentContent = parentChunks[i];
        
        // Child chunks use configurable childChunkSize
        const childChunks = smartChunking(parentContent, settings.childChunkSize, 100);

        for (let j = 0; j < childChunks.length; j++) {
            // 4. Check for cancellation inside embedding loop (most critical)
            if (signal?.aborted) throw new Error("ABORTED");

            const childContent = childChunks[j];
            
            // --- DYNAMIC RE-CLASSIFICATION PER CHUNK ---
            let chunkCategory = initialClass.category;
            let chunkSubCategory = initialClass.subCategory;
            let chunkMeta = { ...fileMetadata };

            const specificClass = classifyTextSegment(childContent);
            if (specificClass) {
                chunkCategory = specificClass.category;
                chunkSubCategory = specificClass.subCategory;
                chunkMeta.category = chunkCategory;
                chunkMeta.subCategory = chunkSubCategory;
                chunkMeta.tags = [...chunkMeta.tags, chunkCategory, chunkSubCategory];
            }
            // ---------------------------------------------

            if (onProgress && j === 0) onProgress(file.name, 'embedding', `Vectorizing Chunk ${i+1}/${parentChunks.length}...`);

            const contextHeader = `دسته: ${chunkCategory} | زیردسته: ${chunkSubCategory} | منبع: ${fileName}`;
            const extraMeta = chunkMeta.ticketId ? ` | تیکت: ${chunkMeta.ticketId}` : '';
            const contentToEmbed = `${contextHeader}${extraMeta} \n ${childContent}`;

            let vector: number[] = [];
            try {
                vector = await getEmbedding(contentToEmbed, false);
            } catch (e: any) {
                if (e.message === "OLLAMA_CONNECTION_REFUSED") {
                    throw e; // Abort process if Ollama is down
                }
                console.warn(`Embedding failed for chunk in ${file.name}`);
                vector = new Array(1024).fill(0); 
            }

            const newChunk: KnowledgeChunk = {
                id: `${file.name}-${i}-${j}-${Date.now()}`,
                content: parentContent,      // STORE PARENT for LLM Context
                searchContent: childContent, // STORE CHILD for precision Search
                embedding: vector,
                metadata: chunkMeta,
                source: {
                    id: file.name,
                    title: file.name,
                    snippet: childContent.substring(0, 80).replace(/\n/g, ' ') + "...",
                    page: Math.floor(i / 5) + 1 
                }
            };
            
            chunks.push(newChunk);
            fileChunks.push(newChunk);
        }
      }
      
      // File processing complete
      if (onProgress) {
          const finalClass = fileChunks.length > 0 ? fileChunks[0].metadata : initialClass;
          onProgress(file.name, 'complete', { 
              count: fileChunks.length,
              category: finalClass?.category || initialClass.category,
              subCategory: finalClass?.subCategory || initialClass.subCategory
          });
      }

    } catch (err: any) {
      // Re-throw if it's a critical cancellation or connection error
      if (err.message === "ABORTED" || err.message === "OLLAMA_CONNECTION_REFUSED") throw err;
      
      console.error(`Failed to process ${file.name}`, err);
      if (onProgress) onProgress(file.name, 'error', err.message);
    }
  }

  if (chunks.length > 0) {
    await saveChunksToDB(chunks);
  }

  return chunks;
};
