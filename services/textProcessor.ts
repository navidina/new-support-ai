
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
    // Allow more punctuation for technical terms (%, $, -, _, /)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B\u200C\u200D\u200E\u200F\u202A-\u202E]/g, ' ') 
    // 4. Normalize Numbers (Persian to English) - Crucial for matching query numbers to text
    .replace(/[۰-۹]/g, d => String.fromCharCode(d.charCodeAt(0) - 1728)) 
    // 5. Intelligent Punctuation Removal 
    // Kept: % (percent), $ (finance), _ (files), - (ranges/negative), / (dates/paths), . (decimals)
    // Removed: ! ? ^ & * ; = ` ~ « » " [ ] (Only meaningless chars)
    .replace(/[!^&*;=`~«»"\[\]]/g, " ") 
    // 6. Structure Normalization
    .replace(/\r\n/g, '\n')
    // Fix list numbering stuck to text: "1.Text" -> "\n1. Text"
    .replace(/(\n|^)(\d+)[-.)](?!\s)/g, '$1$2. ')
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
 * Intelligent Recursive Character Text Splitter.
 * This function tries to split text by high-priority separators first (paragraphs),
 * then medium (sentences), then low (words), to ensure semantic integrity.
 * It also maintains an "Overlap" window to prevent cutting context at boundaries.
 */
export const intelligentChunking = (text: string, targetSize?: number, overlapSize?: number): string[] => {
    const settings = getSettings();
    const chunkSize = targetSize || settings.chunkSize;
    const overlap = overlapSize || settings.chunkOverlap;

    if (!text) return [];
    if (text.length <= chunkSize) return [text];

    // Priority list of separators
    const separators = [
        "\n\n", // Paragraphs
        "\n",   // Lines
        ". ", "؟ ", "! ", "; ", "؛ ", // Sentences
        " "     // Words
    ];

    // Recursive splitter function
    const splitText = (currentText: string, sepIndex: number): string[] => {
        // Base case: text fits
        if (currentText.length <= chunkSize) {
            return [currentText.trim()];
        }

        // Fallback: If no separators left, hard slice
        if (sepIndex >= separators.length) {
            const chunks: string[] = [];
            for (let i = 0; i < currentText.length; i += (chunkSize - overlap)) {
                chunks.push(currentText.slice(i, i + chunkSize));
            }
            return chunks;
        }

        const separator = separators[sepIndex];
        let splits: string[] = [];

        // Special handling for punctuation to keep it attached to the sentence
        if (['. ', '؟ ', '! ', '; ', '؛ '].includes(separator)) {
            // Split but re-attach separator to the preceding part
            const tempSplits = currentText.split(separator);
            for (let i = 0; i < tempSplits.length; i++) {
                // Add separator back to all except the last one (unless text ended with it)
                if (i < tempSplits.length - 1) {
                    splits.push(tempSplits[i] + separator.trim());
                } else {
                    splits.push(tempSplits[i]);
                }
            }
        } else {
            splits = currentText.split(separator);
        }

        // If split didn't reduce size (e.g. no paragraphs found), try next separator
        if (splits.length === 1) {
            return splitText(currentText, sepIndex + 1);
        }

        // Merge Logic with Overlap
        const finalChunks: string[] = [];
        let currentDoc: string[] = [];
        let totalLen = 0;

        for (const split of splits) {
            const splitLen = split.length;
            
            // If adding this piece exceeds chunk size
            if (totalLen + splitLen > chunkSize) {
                // 1. Push current accumulated chunk
                if (totalLen > 0) {
                    const doc = currentDoc.join(separator === " " ? " " : separator.includes("\n") ? separator : " ");
                    if (doc.trim()) finalChunks.push(doc.trim());

                    // 2. Handle Overlap (Backtracking)
                    // Remove items from start of currentDoc until it's small enough to form the overlap
                    // We want to keep approximately 'overlap' characters from the END of currentDoc
                    while (totalLen > overlap && currentDoc.length > 0) {
                        const removed = currentDoc.shift();
                        if (removed) {
                            totalLen -= (removed.length + (currentDoc.length > 0 ? separator.length : 0));
                        }
                    }
                }

                // If the split ITSELF is larger than chunk size, recurse on it
                if (splitLen > chunkSize) {
                    const subChunks = splitText(split, sepIndex + 1);
                    finalChunks.push(...subChunks);
                    // Reset
                    currentDoc = [];
                    totalLen = 0;
                } else {
                    // Start new chunk with remaining overlap + current split
                    currentDoc.push(split);
                    totalLen += splitLen + (currentDoc.length > 1 ? separator.length : 0);
                }
            } else {
                currentDoc.push(split);
                totalLen += splitLen + (currentDoc.length > 1 ? separator.length : 0);
            }
        }

        // Add remaining
        if (currentDoc.length > 0) {
            const doc = currentDoc.join(separator === " " ? " " : separator.includes("\n") ? separator : " ");
            if (doc.trim()) finalChunks.push(doc.trim());
        }

        return finalChunks;
    };

    return splitText(text, 0);
};

// Renamed for backward compatibility if needed, but we replace the logic
export const smartChunking = intelligentChunking;

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
             // If section is HUGE, use intelligentChunking on it
             const subChunks = intelligentChunking(currentSectionContent, effectiveTarget, effectiveOverlap);
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
        return intelligentChunking(text, effectiveTarget, effectiveOverlap);
    }

    return chunks;
};

export const chunkWhole = (text: string): string[] => {
    const settings = getSettings();
    if (text.length < settings.chunkSize) return [text];
    return intelligentChunking(text, settings.chunkSize, settings.chunkOverlap);
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
        return intelligentChunking(text);
    }

    return chunks;
};
