
import { DocCategory, ChunkMetadata } from '../types';
import { getSettings } from './settings';

// ==========================================
// UTILITIES
// ==========================================

export const toPersianDigits = (n: number | string | undefined | null): string => {
    if (n === undefined || n === null) return '';
    const farsiDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    return n.toString().replace(/\d/g, x => farsiDigits[parseInt(x)]);
};

export const stripHtml = (html: string): string => {
   if (!html) return '';
   return html
       .replace(/<[^>]*>/g, '') // Remove tags
       .replace(/&nbsp;/g, ' ')
       .replace(/&zwnj;/g, '‌')
       .replace(/&lt;/g, '<')
       .replace(/&gt;/g, '>')
       .replace(/&amp;/g, '&')
       .replace(/[ \t]+/g, ' ') // Collapse horizontal whitespace only
       .trim();
};

/**
 * Robust HTML to Markdown converter.
 * Crucial Fix: Preserves newlines and structure so chunking works correctly.
 */
export const htmlToMarkdown = (html: string): string => {
    if (!html) return '';
    
    let text = html;

    // 1. Handle Tables: Convert <tr><td> content </td></tr> to | content |
    // We do this before stripping tags to preserve table structure
    text = text.replace(/<table[^>]*>(.*?)<\/table>/gs, (match, tableContent) => {
        let mdTable = '\n\n'; 
        const rows = tableContent.match(/<tr[^>]*>(.*?)<\/tr>/gs);
        if (rows) {
            rows.forEach((row: string, index: number) => {
                const cells = row.match(/<td[^>]*>(.*?)<\/td>/gs);
                if (cells) {
                    const rowContent = cells.map((cell: string) => {
                        // Strip tags inside cell but keep text
                        return cell.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
                    }).join(' | ');
                    mdTable += `| ${rowContent} |\n`;
                    
                    // Add separator after header (first row)
                    if (index === 0) {
                        const separator = cells.map(() => '---').join(' | ');
                        mdTable += `| ${separator} |\n`;
                    }
                }
            });
        }
        return mdTable + '\n\n';
    });

    // 2. Structural Conversion
    text = text.replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '\n\n# $1\n\n'); // Headers
    text = text.replace(/<li[^>]*>(.*?)<\/li>/gi, '\n- $1'); // List items
    text = text.replace(/<br\s*\/?>/gi, '\n'); // Line breaks
    text = text.replace(/<p[^>]*>/gi, '\n\n'); // Start of paragraph
    text = text.replace(/<\/p>/gi, '\n\n'); // End of paragraph
    text = text.replace(/<\/div>/gi, '\n'); 

    // 3. Clean up remaining tags
    text = text.replace(/<[^>]+>/g, ' '); 

    // 4. Decode entities
    text = text.replace(/&nbsp;/g, ' ')
               .replace(/&amp;/g, '&')
               .replace(/&lt;/g, '<')
               .replace(/&gt;/g, '>')
               .replace(/&zwnj;/g, '‌');

    // 5. Normalize Whitespace (CRITICAL FIX)
    // Collapse horizontal spaces
    text = text.replace(/[ \t]+/g, ' ');
    // Collapse vertical spaces (max 2 newlines)
    text = text.replace(/\n\s*\n/g, '\n\n');
    
    return text.trim();
};

// ==========================================
// CLEANING PIPELINE
// ==========================================

export const cleanAndNormalizeText = (text: string): string => {
  if (!text) return '';
  return text
    // 1. Remove specific file artifacts
    .replace(/ETF واحد پشتیبانی صندوق/g, '')
    .replace(/_{5,}/g, '') 
    .replace(/(با سلام|با احترام|باتشکر|با تشکر).{0,50}$/g, '') 
    .replace(/صفحه \d+ از \d+/g, '')
    // 2. Character Unification
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ئ/g, 'ی')
    // 3. STRICT SANITIZATION (Keep newlines)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B\u200C\u200D\u200E\u200F\u202A-\u202E]/g, ' ') 
    // 4. Normalize Numbers
    .replace(/[۰-۹]/g, d => String.fromCharCode(d.charCodeAt(0) - 1728)) 
    // 5. Intelligent Punctuation Removal (Keep structure chars like : - . )
    .replace(/[!$%^&*;={}_`~()«»"<>\[\]]/g, " ") 
    // 6. Structure Normalization
    .replace(/\r\n/g, '\n')
    .replace(/(\d+)[-.)]\s*/g, '\n$1. ') 
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n/g, '\n\n') // Ensure paragraphs are preserved
    .trim();
};

export const classifyTextSegment = (text: string): { category: DocCategory, subCategory: string } | null => {
    const content = text.toLowerCase();
    const has = (keywords: string[]) => keywords.some(k => content.includes(k.toLowerCase()));

    if (has(['اکسیر', 'exir', 'نمودار', 'تکنیکال', 'بمب', 'سفارش شرطی', 'پیش‌نویس']))
        return { category: 'online_trading', subCategory: 'exir' };
    if (has(['رکسار', 'roxar', 'برخط گروهی', 'فروش تعهدی', 'سبد سفارش']))
        return { category: 'online_trading', subCategory: 'recsar' };
    if (has(['رایان همراه', 'اپلیکیشن', 'mobile', 'android', 'ios', 'اثر انگشت']))
        return { category: 'online_trading', subCategory: 'rayan_mobile' };
    if (has(['pwa', 'وب‌اپلیکیشن', 'تحت وب']))
        return { category: 'online_trading', subCategory: 'pwa' };
    if (has(['رایان کلاب', 'rayan club', 'وفاداری']))
        return { category: 'online_trading', subCategory: 'general_online' };

    if (has(['همراه صندوق', 'fwa.rayanbroker', 'صدور', 'ابطال', 'nav', 'ارکان صندوق']))
        return { category: 'funds', subCategory: 'fund_ops' };
    
    if (has(['سبدگردان', 'مدیریت سبد', 'قرارداد سبد', 'پورتال سرمایه‌گذار']))
        return { category: 'portfolio_management', subCategory: 'general_portfolio' };

    if (has(['اختیار معامله', 'آپشن', 'option', 'covered call', 'butterfly', 'مشتقه']))
        return { category: 'commodity_energy', subCategory: 'futures' };
    if (has(['بورس کالا', 'بورس انرژی']))
        return { category: 'commodity_energy', subCategory: 'commodity' };

    if (has(['شعب', 'باجه', 'تعریف کاربر', 'دسترسی‌ها', 'تنظیمات سیستم']))
        return { category: 'back_office', subCategory: 'basic_info' };
    if (has(['سند حسابداری', 'معین', 'تفصیلی', 'تراز', 'صورت مالی']))
        return { category: 'back_office', subCategory: 'accounting' };

    if (has(['عرضه اولیه', 'ipo', 'بوک بیلدینگ']))
        return { category: 'operational_process', subCategory: 'ipo' };

    return null;
};

export const classifyDocument = (text: string, filename: string): { category: DocCategory, subCategory: string } => {
    const content = (filename + ' ' + text).toLowerCase();
    const has = (keywords: string[]) => keywords.some(k => content.includes(k.toLowerCase()));

    const segmentClass = classifyTextSegment(text.substring(0, 1000));
    if (segmentClass) return segmentClass;

    if (filename.match(/\d{5,}/) || has(['شماره تیکت', 'تیکت', 'مغایرت', 'خطا در', 'مشکل در', 'عدم نمایش', 'لاگین نمیشود', 'error', 'bug'])) {
        if (has(['مانده', 'کارمزد', 'نکول', 'سود', 'ثبت تکراری', 'سکنا', 'صورت‌های مالی', 'تراز'])) 
            return { category: 'troubleshooting', subCategory: 'financial_reconciliation' };
        if (has(['سفارش', 'حق تقدم', 'پذیره‌نویسی', 'کد معامله‌گر', 'هسته', 'ارسال نشد', 'تأخیر'])) 
            return { category: 'troubleshooting', subCategory: 'trading_issues' };
        if (has(['دسترسی', 'رمز عبور', 'لاگین', 'ip', 'آی‌پی', 'کاربری', 'سطح دسترسی'])) 
            return { category: 'troubleshooting', subCategory: 'access_issues' };
        
        return { category: 'troubleshooting', subCategory: 'general_ticket' };
    }

    if (has(['شعب', 'باجه', 'تنظیمات سیستم', 'تعریف کاربر', 'دسترسی‌ها', 'لاگین دو عاملی', 'کد معامله‌گر']))
        return { category: 'back_office', subCategory: 'basic_info' };
    if (has(['سند حسابداری', 'معین', 'تفصیلی', 'تراز', 'مالیات', 'صورتحساب', 'کفایت سرمایه', 'ضریب']))
        return { category: 'back_office', subCategory: 'accounting' };
    if (has(['خزانه‌داری', 'فیش واریزی', 'چک', 'مغایرت بانکی', 'تسهیلات', 'وام', 'دریافت و پرداخت']))
        return { category: 'back_office', subCategory: 'treasury' };
    if (has(['تخصیص', 'ابطال معامله', 'کارگزار ناظر', 'فایل dbs', 'تغییر ناظر', 'فایل معاملات']))
        return { category: 'back_office', subCategory: 'securities_ops' };
    
    if (has(['back office', 'بک آفیس', 'بک‌آفیس', 'مدیریت کارگزاری']))
        return { category: 'back_office', subCategory: 'general_backoffice' };

    if (has(['online', 'آنلاین', 'معاملات برخط']))
        return { category: 'online_trading', subCategory: 'general_online' };

    if (has(['fund api', 'وب‌سرویس صندوق']))
        return { category: 'funds', subCategory: 'fund_api' };
    if (has(['صندوق', 'etf', 'mutual fund']))
        return { category: 'funds', subCategory: 'general_funds' };

    if (has(['درگاه پرداخت', 'shaparak', 'ipg', 'کلید درگاه']))
        return { category: 'technical_infrastructure', subCategory: 'payment_gateways' };
    if (has(['web service', 'webservice', 'api', 'swagger', 'wsdl', 'متد فراخوانی']))
        return { category: 'technical_infrastructure', subCategory: 'web_service' };
    if (has(['dns', 'مکنا', 'دیتاسنتر', 'شبکه', 'فایروال', 'امنیت']))
        return { category: 'technical_infrastructure', subCategory: 'network_security' };

    return { category: 'general', subCategory: 'uncategorized' };
};

export const parseMarkdownMetadata = (text: string): Partial<ChunkMetadata> => {
    const meta: Partial<ChunkMetadata> = {};
    const lines = text.split('\n');
    
    for (let i = 0; i < Math.min(lines.length, 50); i++) { 
        const line = lines[i].trim();
        if ((line.includes('شناسنامه سند') || line.includes('Document Control')) ||
            (line.startsWith('|') && line.includes('عنوان') && line.includes('نسخه'))) {
            
            let headerIndex = -1;
            if (line.startsWith('|')) headerIndex = i;
            else if (i + 1 < lines.length && lines[i+1].trim().startsWith('|')) headerIndex = i + 1;

            if (headerIndex !== -1 && headerIndex + 2 < lines.length) {
                const headerLine = lines[headerIndex];
                const sepLine = lines[headerIndex + 1];
                const dataLine = lines[headerIndex + 2];

                if (sepLine.includes('---')) {
                    const headers = headerLine.split('|').map(s => s.trim()).filter(s => s);
                    const values = dataLine.split('|').map(s => s.trim()).filter(s => s);
                    
                    headers.forEach((h, idx) => {
                        const val = values[idx] || '';
                        if (!val) return;
                        
                        if (h.includes('نسخه')) meta.version = val;
                        if (h.includes('تاریخ')) meta.documentDate = val;
                    });
                }
            }
            break;
        }
    }
    return meta;
};

export const extractMetadata = (text: string, filename: string, category: DocCategory, subCategory: string): ChunkMetadata => {
  const metadata: ChunkMetadata = {
    category,
    subCategory,
    tags: [category, subCategory]
  };

  const ticketMatch = filename.match(/(\d{5,})/) || text.match(/تیکت\s*[:#]?\s*(\d{5,})/);
  if (ticketMatch) metadata.ticketId = ticketMatch[1];

  const prxMatch = text.match(/(PRX\d+|prx\d+)/i);
  if (prxMatch) metadata.customerId = prxMatch[0].toUpperCase();

  if (subCategory.includes('exir')) metadata.software = 'Exir';
  else if (subCategory.includes('recsar')) metadata.software = 'Recsar';
  
  const versionMatch = text.match(/نسخه\s*([\d.]+)/) || filename.match(/([\d.]+\.[\d]+)/);
  if (versionMatch) metadata.version = versionMatch[1];

  const dateMatch = text.match(/\d{4}\/\d{2}\/\d{2}/);
  if (dateMatch) metadata.documentDate = dateMatch[0];

  const potentialSymbols = text.match(/([آ-ی]{2,4}\d{0,4})/g); 
  if (potentialSymbols) {
      const stopWords = ['برای', 'اینکه', 'تیکت', 'گزارش', 'تاریخ', 'شماره'];
      const symbols = potentialSymbols.filter(w => w.length > 3 && !stopWords.includes(w)).slice(0, 5);
      if (symbols.length > 0) metadata.symbols = symbols;
  }

  const mdMeta = parseMarkdownMetadata(text);
  if (mdMeta.version) metadata.version = mdMeta.version;
  if (mdMeta.documentDate) metadata.documentDate = mdMeta.documentDate;

  return metadata;
};

export const splitIntoSentences = (text: string): string[] => {
    return text.match(/[^.?!؟\n]+[.?!؟\n]+(\s+|$)|[^.?!؟\n]+$/g) || [text];
};

/**
 * Robust Chunking Logic.
 * 1. Primary split by double newlines (paragraphs).
 * 2. If a paragraph is too big, split by sentences.
 * 3. Accumulate paragraphs until targetSize is reached.
 */
export const smartChunking = (text: string, targetSize?: number, overlapSize?: number): string[] => {
    const settings = getSettings();
    const effectiveTarget = targetSize || settings.chunkSize;
    const effectiveOverlap = overlapSize || settings.chunkOverlap;

    // 1. Split by Paragraphs first (Double newline)
    const paragraphs = text.split(/\n\s*\n/);
    const chunks: string[] = [];
    
    let currentChunk: string = "";
    
    for (const para of paragraphs) {
        if (!para.trim()) continue;
        
        // If adding this paragraph exceeds target size
        if (currentChunk.length + para.length > effectiveTarget) {
            // Push current accumulated chunk if it exists
            if (currentChunk) {
                chunks.push(currentChunk.trim());
            }
            
            // Prepare overlap for the next chunk
            const overlapText = currentChunk.slice(-effectiveOverlap);
            
            // Handle Massive Paragraphs: If the paragraph itself is huge (> target)
            if (para.length > effectiveTarget) {
                // Split massive paragraph by sentences
                const sentences = splitIntoSentences(para);
                let subChunk = overlapText; 
                
                for (const sent of sentences) {
                    if (subChunk.length + sent.length > effectiveTarget) {
                        chunks.push(subChunk.trim());
                        subChunk = subChunk.slice(-effectiveOverlap) + sent;
                    } else {
                        subChunk += sent;
                    }
                }
                currentChunk = subChunk;
            } else {
                // Start new chunk with overlap + current paragraph
                currentChunk = overlapText + "\n\n" + para;
            }
        } else {
            // Append paragraph
            currentChunk += (currentChunk ? "\n\n" : "") + para;
        }
    }
    
    if (currentChunk) {
        chunks.push(currentChunk.trim());
    }

    // Fallback: If no newlines were found and text is huge, force split
    if (chunks.length === 0 && text.length > effectiveTarget) {
        const sentences = splitIntoSentences(text);
        let subChunk = "";
        for (const sent of sentences) {
             if (subChunk.length + sent.length > effectiveTarget) {
                chunks.push(subChunk.trim());
                subChunk = subChunk.slice(-effectiveOverlap) + sent;
            } else {
                subChunk += sent;
            }
        }
        if (subChunk) chunks.push(subChunk.trim());
    } else if (chunks.length === 0) {
        chunks.push(text);
    }

    return chunks.filter(c => c.length > 50);
};

/**
 * IMPROVED: Header-Aware Markdown Chunking (Section Accumulation).
 * Instead of streaming lines, it accumulates content per section (Header)
 * and then intelligently splits that section if it's too large using smartChunking.
 */
export const chunkMarkdown = (text: string, targetSize?: number, overlap?: number): string[] => {
    const settings = getSettings();
    const effectiveTarget = targetSize || settings.chunkSize;
    const effectiveOverlap = overlap || settings.chunkOverlap;

    const chunks: string[] = [];
    const lines = text.split('\n');
    
    let currentHeaderStack: string[] = []; 
    let currentSectionContent = "";

    const flushSection = () => {
        if (!currentSectionContent.trim()) return;

        // Context String: e.g., "[بخش: راهبری > تنظیمات]"
        const contextHeader = currentHeaderStack.length > 0 
            ? `[بخش: ${currentHeaderStack.join(" > ")}]\n` 
            : "";

        // If section is small enough, keep it as one chunk (plus header)
        if (currentSectionContent.length + contextHeader.length <= effectiveTarget * 1.5) { // Allow slight overflow for cohesion
             chunks.push((contextHeader + currentSectionContent).trim());
        } else {
             // If section is HUGE (e.g. 40 pages under one header), use smartChunking
             const subChunks = smartChunking(currentSectionContent, effectiveTarget, effectiveOverlap);
             subChunks.forEach(sc => {
                 chunks.push((contextHeader + sc).trim());
             });
        }
        currentSectionContent = "";
    };
    
    for (const line of lines) {
        const headerMatch = line.match(/^(#{1,6})\s+(.+)/);
        
        if (headerMatch) {
            // New header found -> Flush previous section
            flushSection();

            const level = headerMatch[1].length;
            const title = headerMatch[2];
            
            // Update stack
            if (currentHeaderStack.length >= level) {
                currentHeaderStack = currentHeaderStack.slice(0, level - 1);
            }
            currentHeaderStack.push(title);
            
            // Add header itself to the new section content
            currentSectionContent += line + "\n";
        } else {
            currentSectionContent += line + "\n";
        }
    }
    
    // Final flush
    flushSection();

    // Fallback if regex failed completely (no headers found)
    if (chunks.length === 0 && text.trim().length > 0) {
        return smartChunking(text, effectiveTarget, effectiveOverlap);
    }

    return chunks;
};

export const chunkWhole = (text: string): string[] => {
    const settings = getSettings();
    if (text.length < settings.chunkSize) return [text];
    return smartChunking(text, settings.chunkSize, settings.chunkOverlap);
};

export const chunkQA = (text: string): string[] => {
    const chunks: string[] = [];
    const qaRegex = /(سوال\s*[:\d-].*?)(?=سوال\s*[:\d-]|$)/gs;
    
    let match;
    let found = false;
    while ((match = qaRegex.exec(text)) !== null) {
        let block = match[1].trim();
        if (block.length > 30) {
            chunks.push(block);
            found = true;
        }
    }
    
    if (!found) {
        return smartChunking(text);
    }

    return chunks;
};
