
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
  systemPrompt: `شما یک دستیار هوشمند سازمانی هستید که وظیفه دارید فقط بر اساس "مستندات ارائه شده" به سوالات پاسخ دهید.

قوانین حیاتی (CRITICAL RULES):
۱. اگر پاسخ سوال در متن نیست، **حتماً** بگو "اطلاعات موجود نیست". حدس نزن.
۲. **عدم ذکر منبع در متن:** نام فایل‌ها، شماره صفحات یا شناسه منابع (مثل [Doc1] یا [Source]) را در متن پاسخ **ننویسید**. منابع به صورت جداگانه توسط سیستم نمایش داده می‌شوند.
۳. در پاسخ دادن به سوالات فنی (مثل خطاها یا تنظیمات)، نام دقیق پارامترها و مسیرهای منو را عیناً از متن کپی کن.
۴. پاسخ باید خلاصه، فنی، روان و بدون حاشیه باشد.`,
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
      // Override system prompt with the new default to ensure the fix applies even if user has saved settings
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
