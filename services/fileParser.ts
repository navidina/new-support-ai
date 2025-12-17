
import { KnowledgeChunk, BenchmarkCase } from '../types';
import { cleanAndNormalizeText, classifyDocument, extractMetadata, chunkWhole, chunkQA, smartChunking, classifyTextSegment } from './textProcessor';
import { getEmbedding } from './ollama';
import { saveChunksToDB } from './database';
import { getSettings } from './settings';

// Global definition for the mammoth library
declare var mammoth: any;

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
      if (initialClass.category === 'troubleshooting') {
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
