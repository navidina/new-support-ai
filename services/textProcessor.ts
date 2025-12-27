
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
    // Remove invisible control chars but PRESERVE newlines
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B\u200C\u200D\u200E\u200F\u202A-\u202E]/g, ' ') 
    // 4. Normalize Numbers
    .replace(/[۰-۹]/g, d => String.fromCharCode(d.charCodeAt(0) - 1728)) 
    // 5. Intelligent Punctuation Removal
    // We replace parentheses, brackets, and quotes with SPACE to separate words attached to them.
    // IMPORTANT: We DO NOT remove '+' or '-' to preserve terms like "T+1", "T-2"
    .replace(/[.,/#!$%^&*;:{}=_`~()؟،«»"'<>\[\]|]/g, " ")
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

// Markdown Metadata Parser
export const parseMarkdownMetadata = (text: string): Partial<ChunkMetadata> => {
    const meta: Partial<ChunkMetadata> = {};
    const lines = text.split('\n');
    
    // Scan first 50 lines for "Document Control" table
    for (let i = 0; i < Math.min(lines.length, 50); i++) { 
        const line = lines[i].trim();
        // Look for typical headers or table start
        if ((line.includes('شناسنامه سند') || line.includes('Document Control')) ||
            (line.startsWith('|') && line.includes('عنوان') && line.includes('نسخه'))) {
            
            // Search for table header in proximity
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
            break; // Stop after finding first metadata table
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

  // Enrich with Markdown specific metadata
  const mdMeta = parseMarkdownMetadata(text);
  if (mdMeta.version) metadata.version = mdMeta.version;
  if (mdMeta.documentDate) metadata.documentDate = mdMeta.documentDate;

  return metadata;
};

export const splitIntoSentences = (text: string): string[] => {
    return text.match(/[^.?!؟\n]+[.?!؟\n]+(\s+|$)|[^.?!؟\n]+$/g) || [text];
};

export const smartChunking = (text: string, targetSize?: number, overlapSize?: number): string[] => {
    const settings = getSettings();
    const effectiveTarget = targetSize || settings.chunkSize;
    const effectiveOverlap = overlapSize || settings.chunkOverlap;

    const sentences = splitIntoSentences(text);
    const chunks: string[] = [];
    
    let currentChunkSentences: string[] = [];
    let currentSize = 0;
    let i = 0;

    while (i < sentences.length) {
        const sentence = sentences[i];
        const sentenceLen = sentence.length;

        if (currentSize + sentenceLen > effectiveTarget && currentChunkSentences.length > 0) {
            chunks.push(currentChunkSentences.join('').trim());

            let overlapBuffer: string[] = [];
            let overlapCount = 0;
            for (let j = currentChunkSentences.length - 1; j >= 0; j--) {
                const s = currentChunkSentences[j];
                if (overlapCount + s.length < effectiveOverlap) {
                    overlapBuffer.unshift(s); 
                    overlapCount += s.length;
                } else {
                    if (overlapBuffer.length === 0) overlapBuffer.unshift(s);
                    break;
                }
            }
            
            currentChunkSentences = [...overlapBuffer];
            currentSize = overlapCount;
        }

        currentChunkSentences.push(sentence);
        currentSize += sentenceLen;
        i++;
    }

    if (currentChunkSentences.length > 0) {
        chunks.push(currentChunkSentences.join('').trim());
    }

    return chunks.filter(c => c.length > 50);
};

// New Structure-Aware Markdown Chunker
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

        // If section is massive, split it using smartChunking, but prefix context (Header)
        if (fullContent.length > effectiveTarget) {
            const subChunks = smartChunking(fullContent, effectiveTarget, effectiveOverlap);
            subChunks.forEach(sc => {
                chunks.push(currentHeader ? `${currentHeader}\n${sc}` : sc);
            });
        } else {
            chunks.push(currentHeader ? `${currentHeader}\n${fullContent}` : fullContent);
        }
    };

    for (const line of lines) {
        // Detect H1, H2, H3
        const headerMatch = line.match(/^(#{1,3})\s+(.+)/);
        if (headerMatch) {
            flushSection();
            currentHeader = headerMatch[0]; // Keep the whole header line like "## Title"
            currentSectionContent = [];
        } else {
            currentSectionContent.push(line);
        }
    }
    flushSection(); // Final flush

    // If no headers found, fallback to smartChunking
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
        const lines = text.split('\n');
        let buffer = '';
        for (const line of lines) {
            if (line.includes('؟') || line.includes('?')) {
                if (buffer) chunks.push(buffer);
                buffer = line;
            } else {
                buffer += '\n' + line;
            }
        }
        if (buffer) chunks.push(buffer);
        if (chunks.length > 0) found = true;
    }

    return found ? chunks : smartChunking(text);
};
