
import { AppSettings } from '../types';

// Default Settings
const DEFAULT_SETTINGS: AppSettings = {
  ollamaBaseUrl: 'http://localhost:11434',
  chatModel: 'aya:8b',
  embeddingModel: 'jeffh/intfloat-multilingual-e5-large-instruct:f32', 
  chunkSize: 1200,      // Increased to improve context capture (Paragraph based)
  childChunkSize: 400,  // Adjusted relative to parent
  chunkOverlap: 200,    // Increased overlap to prevent cutting instructions
  temperature: 0.0,     // Keep 0 for max faithfulness
  systemPrompt: `شما یک دستیار هوشمند سازمانی هستید.
وظیفه: پاسخگویی به سوال کاربر **فقط** با استفاده از اطلاعات موجود در "مستندات مرجع" (Context).

دستورالعمل تفکر (Chain of Thought):
۱. ابتدا مستندات را بخوان و ببین کدام بخش دقیقاً به سوال پاسخ می‌دهد.
۲. اگر پاسخ دقیق (شامل عدد، مرحله یا نام خاص) در متن نیست، صریحاً بگو "اطلاعات موجود نیست".
۳. اگر پاسخ وجود دارد، آن را استخراج کن و به زبانی روان بازنویسی کن.

قوانین پاسخ‌دهی:
- هیچ اطلاعاتی از خودت اضافه نکن.
- اگر سوال درباره "مراحل" یا "مسیر منو" است، عیناً ترتیب مراحل را حفظ کن.
- پاسخ نهایی باید مستقیم، کوتاه و بدون توضیحات اضافه مثل "بر اساس متن..." باشد.`,
  minConfidence: 0.15 
};

// Internal settings state
let currentSettings: AppSettings = { ...DEFAULT_SETTINGS };

// Load settings from localStorage on init
const loadSettings = () => {
  try {
    const saved = localStorage.getItem('rayan_rag_settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      currentSettings = { ...DEFAULT_SETTINGS, ...parsed };
      // Override specific fields to ensure updates apply to existing users
      currentSettings.systemPrompt = DEFAULT_SETTINGS.systemPrompt;
      currentSettings.chunkSize = DEFAULT_SETTINGS.chunkSize;
      currentSettings.chunkOverlap = DEFAULT_SETTINGS.chunkOverlap;
    }
  } catch (e) {
    console.error("Failed to load settings", e);
  }
};
loadSettings();

export const getSettings = (): AppSettings => ({ ...currentSettings });

export const updateSettings = (newSettings: Partial<AppSettings>) => {
  currentSettings = { ...currentSettings, ...newSettings };
  localStorage.setItem('rayan_rag_settings', JSON.stringify(currentSettings));
};
