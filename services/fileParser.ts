
import { KnowledgeChunk, BenchmarkCase } from '../types';
import { cleanAndNormalizeText, classifyDocument, extractMetadata, chunkWhole, chunkQA, smartChunking, chunkMarkdown, classifyTextSegment, stripHtml, htmlToMarkdown } from './textProcessor';
import { getEmbedding } from './ollama';
import { saveChunksToDB } from './database';
import { getSettings } from './settings';

// Global definition for the mammoth library
declare var mammoth: any;

/**
 * Parses a Ticket Export CSV (based on Excel Image).
 * Structure: TicketNum | Title | Body | CreateDate ...
 */
export const parseTicketCSV = async (file: File): Promise<BenchmarkCase[]> => {
    const text = await file.text();
    const rows: string[][] = [];
    
    let inQuote = false;
    let currentCell = '';
    let currentRow: string[] = [];
    
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (char === '"') {
            if (inQuote && nextChar === '"') {
                currentCell += '"'; 
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

    const headers = rows[0].map(h => h.trim().toLowerCase());
    const ticketIdx = headers.findIndex(h => h.includes('ticketnum'));
    const bodyIdx = headers.findIndex(h => h.includes('body'));
    const titleIdx = headers.findIndex(h => h.includes('title'));
    
    if (ticketIdx === -1 || bodyIdx === -1) {
        throw new Error("CSV must contain 'TicketNum' and 'Body' columns.");
    }

    const ticketGroups = new Map<string, { body: string, title: string }[]>();

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length <= ticketIdx) continue;

        const ticketNum = row[ticketIdx]?.trim();
        let body = row[bodyIdx] || "";
        const title = titleIdx !== -1 ? row[titleIdx] || "" : "";

        if (!ticketNum) continue;

        body = stripHtml(body);
        
        if (!body || body.length < 5) continue;

        if (!ticketGroups.has(ticketNum)) {
            ticketGroups.set(ticketNum, []);
        }
        ticketGroups.get(ticketNum)!.push({ body, title });
    }

    const cases: BenchmarkCase[] = [];

    ticketGroups.forEach((entries, ticketNum) => {
        if (entries.length < 2) return; 
        
        const questionObj = entries[0];
        const answerObj = entries[entries.length - 1];

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

export const parseBenchmarkDocx = async (file: File): Promise<BenchmarkCase[]> => {
    if (typeof mammoth === 'undefined') {
        throw new Error("Mammoth library not loaded");
    }

    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer });
    const htmlContent = result.value;

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    const rows = Array.from(doc.querySelectorAll('tr'));

    const cases: BenchmarkCase[] = [];

    for (let i = 0; i < rows.length; i++) {
        const cells = rows[i].querySelectorAll('td');
        if (cells.length < 2) continue;

        const rawQuestion = cells[0].textContent || "";
        const rawAnswer = cells[1].textContent || "";
        const rawCategory = cells[2]?.textContent || "General";

        const question = cleanAndNormalizeText(rawQuestion);
        const answer = cleanAndNormalizeText(rawAnswer);

        if (question.length < 5 || question.includes("سوال") || question.includes("Question")) {
            continue;
        }

        cases.push({
            id: Date.now() + i, 
            question: question,
            groundTruth: answer,
            category: cleanAndNormalizeText(rawCategory) || 'Custom'
        });
    }

    return cases;
};

/**
 * Parses and processes a list of files into vector embeddings.
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
    if (signal?.aborted) throw new Error("ABORTED");

    const fileChunks: KnowledgeChunk[] = [];
    try {
      if (onProgress) onProgress(file.name, 'reading', 'Initializing stream...');
      
      let rawText = '';
      const fileName = file.name;

      // IMPROVED: Use convertToHtml + markdown for DOCX to preserve tables
      if (fileName.toLowerCase().endsWith('.docx')) {
        if (typeof mammoth !== 'undefined') {
          const arrayBuffer = await file.arrayBuffer();
          // Extract HTML to preserve tables
          const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer });
          // Convert HTML to Markdown-ish text to keep structure
          rawText = htmlToMarkdown(result.value);
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

      if (signal?.aborted) throw new Error("ABORTED");

      if (onProgress) onProgress(file.name, 'reading', 'Clean & Normalize Text...');
      const cleanedText = cleanAndNormalizeText(rawText);
      
      const initialClass = classifyDocument(cleanedText, fileName);
      
      if (onProgress) onProgress(file.name, 'reading', `Classified: ${initialClass.category}/${initialClass.subCategory}`);

      const fileMetadata = extractMetadata(cleanedText, fileName, initialClass.category, initialClass.subCategory);
      
      let parentChunks: string[] = [];
      // Always use chunkMarkdown for docx now as well, since we converted it to markdown-like text
      if (fileName.toLowerCase().endsWith('.md') || fileName.toLowerCase().endsWith('.docx')) {
          if (onProgress) onProgress(file.name, 'reading', 'Applying Structural Analysis...');
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
        if (signal?.aborted) throw new Error("ABORTED");

        const parentContent = parentChunks[i];
        
        const childChunks = smartChunking(parentContent, settings.childChunkSize, 100);

        for (let j = 0; j < childChunks.length; j++) {
            if (signal?.aborted) throw new Error("ABORTED");

            const childContent = childChunks[j];
            
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

            if (onProgress && j === 0) onProgress(file.name, 'embedding', `Vectorizing Chunk ${i+1}/${parentChunks.length}...`);

            const contextHeader = `دسته: ${chunkCategory} | زیردسته: ${chunkSubCategory} | منبع: ${fileName}`;
            const extraMeta = chunkMeta.ticketId ? ` | تیکت: ${chunkMeta.ticketId}` : '';
            const contentToEmbed = `${contextHeader}${extraMeta} \n ${childContent}`;

            let vector: number[] = [];
            try {
                vector = await getEmbedding(contentToEmbed, false);
            } catch (e: any) {
                if (e.message === "OLLAMA_CONNECTION_REFUSED") {
                    throw e; 
                }
                console.warn(`Embedding failed for chunk in ${file.name}`);
                vector = new Array(1024).fill(0); 
            }

            const newChunk: KnowledgeChunk = {
                id: `${file.name}-${i}-${j}-${Date.now()}`,
                content: parentContent,      
                // CRITICAL FIX: Inject context into searchContent so keyword matching works on metadata too
                searchContent: `${contextHeader}${extraMeta}\n${childContent}`, 
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
      
      if (onProgress) {
          const finalClass = fileChunks.length > 0 ? fileChunks[0].metadata : initialClass;
          onProgress(file.name, 'complete', { 
              count: fileChunks.length,
              category: finalClass?.category || initialClass.category,
              subCategory: finalClass?.subCategory || initialClass.subCategory
          });
      }

    } catch (err: any) {
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
