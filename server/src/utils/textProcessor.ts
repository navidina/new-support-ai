
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
