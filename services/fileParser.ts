
import { KnowledgeChunk, BenchmarkCase, DocCategory } from '../types';
import { cleanAndNormalizeText, classifyDocument, extractMetadata, chunkWhole, chunkQA, smartChunking, chunkMarkdown, classifyTextSegment, stripHtml, htmlToMarkdown } from './textProcessor';
import { getEmbedding } from './ollama';
import { saveChunksToDB } from './database';
import { getSettings } from './settings';

// Global definition for the mammoth library
declare var mammoth: any;

/**
 * Helper to check if a string is a GUID or System ID.
 */
const isSystemId = (text: string): boolean => {
    if (!text) return false;
    const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const shortHexRegex = /^[0-9a-f]{12,64}$/i; 
    return guidRegex.test(text.trim()) || shortHexRegex.test(text.trim());
};

/**
 * Generic CSV Parser that handles quotes and newlines within cells.
 */
const parseCSVGeneric = (text: string): string[][] => {
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
            // If row is empty and it's just a newline, skip pushing if we want strictness, 
            // but usually we push to finish the row.
            if (currentRow.length > 0 || currentCell.length > 0) {
                currentRow.push(currentCell);
                rows.push(currentRow);
            }
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
    return rows;
};

/**
 * Parses a Custom Benchmark CSV with specific headers:
 * "عنوان سوال (چالش)" and "پاسخ کامل و صحیح (مرجع)"
 */
export const parseBenchmarkCSV = async (file: File): Promise<BenchmarkCase[]> => {
    const text = await file.text();
    const rows = parseCSVGeneric(text);

    if (rows.length < 2) throw new Error("فایل خالی یا نامعتبر است");

    const headers = rows[0].map(h => h.trim());
    
    // Flexible matching for headers
    const questionIdx = headers.findIndex(h => h.includes('عنوان سوال') || h.includes('Question') || h.includes('چالش'));
    const answerIdx = headers.findIndex(h => h.includes('پاسخ کامل') || h.includes('Ground Truth') || h.includes('مرجع'));

    if (questionIdx === -1 || answerIdx === -1) {
        throw new Error("ستون‌های الزامی یافت نشد. لطفاً از هدرهای «عنوان سوال (چالش)» و «پاسخ کامل و صحیح (مرجع)» استفاده کنید.");
    }

    const cases: BenchmarkCase[] = [];

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        // Skip if row doesn't have enough columns
        if (row.length <= Math.max(questionIdx, answerIdx)) continue;

        const question = stripHtml(row[questionIdx] || "").trim();
        const groundTruth = stripHtml(row[answerIdx] || "").trim();

        if (question.length < 2) continue;

        cases.push({
            id: `custom-${i}`,
            category: 'تست سفارشی (CSV)',
            question: question,
            groundTruth: groundTruth || "پاسخی درج نشده است"
        });
    }

    return cases;
};

/**
 * Parses a Ticket Export CSV with specific logic for Rayan Support Exports.
 * - Groups rows by TicketNumber.
 * - Takes the bottom-most (last occurring) row as the original User Question.
 */
export const parseTicketCSV = async (file: File): Promise<BenchmarkCase[]> => {
    const text = await file.text();
    const rows = parseCSVGeneric(text);

    if (rows.length < 2) throw new Error("فایل خالی یا نامعتبر است");

    const headers = rows[0].map(h => h.trim().toLowerCase());
    const getIdx = (candidates: string[]) => {
        for (const c of candidates) {
            const idx = headers.indexOf(c);
            if (idx !== -1) return idx;
        }
        return -1;
    };

    const ticketIdx = getIdx(['ticketnumber', 'ticketnum', 'id', 'شماره تیکت']);
    const bodyIdx = getIdx(['body', 'description', 'text', 'متن']);
    const titleIdx = getIdx(['title', 'subject', 'عنوان']);
    
    if (ticketIdx === -1 || bodyIdx === -1) {
        throw new Error("ستون‌های TicketNumber یا Body یافت نشد.");
    }

    const ticketGroups = new Map<string, any[]>();

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const ticketNum = row[ticketIdx]?.trim();
        if (!ticketNum) continue;

        const body = stripHtml(row[bodyIdx] || "").trim();
        const title = titleIdx !== -1 ? stripHtml(row[titleIdx] || "").trim() : "";

        if (!body || body.length < 2 || isSystemId(body)) continue;

        if (!ticketGroups.has(ticketNum)) {
            ticketGroups.set(ticketNum, []);
        }
        ticketGroups.get(ticketNum)!.push({ body, title });
    }

    const cases: BenchmarkCase[] = [];
    ticketGroups.forEach((groupRows, ticketNum) => {
        // PER REQUIREMENT: Bottom-most row is the original user question
        const questionRow = groupRows[groupRows.length - 1];
        
        // Rows above it are historical support replies (Ground Truth)
        const supportResponses = groupRows.slice(0, groupRows.length - 1)
            .map(r => r.body)
            .filter(b => b.length > 5)
            .join("\n---\n");

        let finalQuestion = questionRow.body;
        if (questionRow.title && questionRow.title !== questionRow.body) {
            finalQuestion = `موضوع: ${questionRow.title}\nشرح تیکت: ${questionRow.body}`;
        }

        cases.push({
            id: `ticket-${ticketNum}`,
            category: 'تحلیل تیکت پشتیبانی',
            question: finalQuestion,
            groundTruth: supportResponses || "پاسخ تاریخی یافت نشد"
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
        const question = cleanAndNormalizeText(cells[0].textContent || "");
        const answer = cleanAndNormalizeText(cells[1].textContent || "");
        if (question.length < 5) continue;
        cases.push({
            id: Date.now() + i, 
            question: question,
            groundTruth: answer,
            category: 'Custom'
        });
    }
    return cases;
};

export const parseTicketFile = async (file: File, onProgress: (step: string, info?: any) => void): Promise<KnowledgeChunk[]> => {
    const ticketCases = await parseTicketCSV(file);
    const chunks: KnowledgeChunk[] = [];
    for (let i = 0; i < ticketCases.length; i++) {
        const ticket = ticketCases[i];
        const ticketId = String(ticket.id).replace('ticket-', '');
        const cleanedText = cleanAndNormalizeText(`تیکت ${ticketId}:\n${ticket.question}`);
        if (i % 20 === 0) onProgress('embedding', `درحال پردازش تیکت ${i+1} از ${ticketCases.length}`);
        let vector = await getEmbedding(cleanedText, false);
        chunks.push({
            id: `ticket-chunk-${ticketId}-${Date.now()}`,
            content: cleanedText,
            searchContent: `تیکت ${ticketId} ${cleanedText}`,
            embedding: vector,
            metadata: { category: 'tickets' as DocCategory, subCategory: 'general_ticket', tags: ['ticket', ticketId] },
            source: { id: file.name, title: `تیکت ${ticketId}`, snippet: ticket.question.substring(0, 100), page: 1 }
        });
    }
    return chunks;
};

export const parseFiles = async (fileList: FileList, onProgress?: (fileName: string, step: 'reading' | 'embedding' | 'complete' | 'error', info?: any) => void, signal?: AbortSignal): Promise<KnowledgeChunk[]> => {
  const settings = getSettings();
  const chunks: KnowledgeChunk[] = [];
  const files = Array.from(fileList);
  for (const file of files) {
    if (signal?.aborted) throw new Error("ABORTED");
    try {
      if (onProgress) onProgress(file.name, 'reading', 'Initializing stream...');
      let rawText = '';
      if (file.name.toLowerCase().endsWith('.csv')) {
          const ticketChunks = await parseTicketFile(file, (step, info) => { if (onProgress) onProgress(file.name, step as any, info); });
          if (ticketChunks.length > 0) {
              chunks.push(...ticketChunks);
              if (onProgress) onProgress(file.name, 'complete', { count: ticketChunks.length, category: 'troubleshooting' });
              await saveChunksToDB(ticketChunks);
              continue;
          }
      }
      if (file.name.toLowerCase().endsWith('.docx')) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer });
        rawText = htmlToMarkdown(result.value);
      } else if (file.type.startsWith('text/') || file.name.match(/\.(md|txt|json|csv|log)$/i)) {
        rawText = await file.text();
      } else continue;
      const cleanedText = cleanAndNormalizeText(rawText);
      const initialClass = classifyDocument(cleanedText, file.name);
      const fileMetadata = extractMetadata(cleanedText, file.name, initialClass.category, initialClass.subCategory);
      let parentChunks = smartChunking(cleanedText, settings.chunkSize, settings.chunkOverlap);
      for (let i = 0; i < parentChunks.length; i++) {
        const childChunks = smartChunking(parentChunks[i], settings.childChunkSize, 100);
        for (let j = 0; j < childChunks.length; j++) {
            let vector = await getEmbedding(childChunks[j], false);
            chunks.push({
                id: `${file.name}-${i}-${j}-${Date.now()}`,
                content: parentChunks[i],      
                searchContent: childChunks[j], 
                embedding: vector,
                metadata: fileMetadata,
                source: { id: file.name, title: file.name, snippet: childChunks[j].substring(0, 80), page: 1 }
            });
        }
      }
      if (onProgress) onProgress(file.name, 'complete', { count: chunks.length, category: initialClass.category });
    } catch (err: any) { if (onProgress) onProgress(file.name, 'error', err.message); }
  }
  if (chunks.length > 0) await saveChunksToDB(chunks);
  return chunks;
};
