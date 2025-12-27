
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
       .replace(/<[^>]*>/g, ' ') // Remove tags
       .replace(/&nbsp;/g, ' ')  // Remove spaces
       .replace(/&zwnj;/g, ' ')  // Remove zero-width non-joiners
       .replace(/&lt;/g, '<')
       .replace(/&gt;/g, '>')
       .replace(/&amp;/g, '&')
       .replace(/\s+/g, ' ')     // Collapse whitespace
       .trim();
};

/**
 * Simple HTML to Markdown converter to preserve Tables from Docx
 * This is crucial for API documentation and settings lists.
 */
export const htmlToMarkdown = (html: string): string => {
    if (!html) return '';
    
    let text = html;

    // 1. Handle Tables: Convert <tr><td> content </td></tr> to | content |
    text = text.replace(/<table[^>]*>(.*?)<\/table>/gs, (match, tableContent) => {
        let mdTable = '\n';
        const rows = tableContent.match(/<tr[^>]*>(.*?)<\/tr>/gs);
        if (rows) {
            rows.forEach((row: string, index: number) => {
                const cells = row.match(/<td[^>]*>(.*?)<\/td>/gs);
                if (cells) {
                    const rowContent = cells.map((cell: string) => {
                        return stripHtml(cell).trim();
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
        return mdTable + '\n';
    });

    // 2. Handle Lists
    text = text.replace(/<li[^>]*>(.*?)<\/li>/gs, '- $1\n');
    
    // 3. Handle Headers
    text = text.replace(/<h1[^>]*>(.*?)<\/h1>/gs, '# $1\n');
    text = text.replace(/<h2[^>]*>(.*?)<\/h2>/gs, '## $1\n');
    text = text.replace(/<h3[^>]*>(.*?)<\/h3>/gs, '### $1\n');
    
    // 4. Handle Paragraphs
    text = text.replace(/<p[^>]*>(.*?)<\/p>/gs, '$1\n\n');

    // 5. Final cleanup
    return stripHtml(text);
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
    // 3. STRICT SANITIZATION
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B\u200C\u200D\u200E\u200F\u202A-\u202E]/g, ' ') 
    // 4. Normalize Numbers
    .replace(/[۰-۹]/g, d => String.fromCharCode(d.charCodeAt(0) - 1728)) 
    // 5. Intelligent Punctuation Removal
    .replace(/[.,/#!$%^&*;:{}=_`~()؟،«»"'<>\[\]]/g, " ")
    // 6. Structure Normalization
    .replace(/\r\n/g, '\n')
    .replace(/(\d+)[-.)]\s*/g, '\n$1. ') 
    .replace(/\n\s*\n/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
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
 * Smart Chunking with Priority for Paragraphs.
 * Prevents splitting instructions or lists in the middle.
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
            // Push current accumulated chunk
            if (currentChunk) {
                chunks.push(currentChunk.trim());
            }
            
            // Create overlap from the end of the previous chunk
            const overlapText = currentChunk.slice(-effectiveOverlap);
            
            // If the paragraph itself is huge (> target), we must split it internally by sentences
            if (para.length > effectiveTarget) {
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

    return chunks.filter(c => c.length > 50);
};

export const chunkMarkdown = (text: string, targetSize?: number, overlap?: number): string[] => {
    const settings = getSettings();
    const effectiveTarget = targetSize || settings.chunkSize;
    const effectiveOverlap = overlap || settings.chunkOverlap;

    const chunks: string[] = [];
    const lines = text.split('\n');
    
    let currentSectionContent: string[] = [];
    let currentHeader = ''; 
    
    const flushSection = () => {
        if (currentSectionContent.length === 0) return;
        
        const fullContent = currentSectionContent.join('\n').trim();
        if (!fullContent) return;

        if (fullContent.length > effectiveTarget) {
            const subChunks = smartChunking(fullContent, effectiveTarget, effectiveOverlap);
            subChunks.forEach(sc => {
                const contextPrefix = currentHeader ? `${currentHeader}\n(ادامه بخش...)\n` : '';
                chunks.push(`${contextPrefix}${sc}`);
            });
        } else {
            chunks.push(currentHeader ? `${currentHeader}\n${fullContent}` : fullContent);
        }
    };

    for (const line of lines) {
        const headerMatch = line.match(/^(#{1,3})\s+(.+)/);
        if (headerMatch) {
            flushSection();
            currentHeader = headerMatch[0]; 
            currentSectionContent = [];
        } else {
            currentSectionContent.push(line);
        }
    }
    flushSection();

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
