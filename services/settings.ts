
import { AppSettings } from '../types';

// Default Settings
const DEFAULT_SETTINGS: AppSettings = {
  ollamaBaseUrl: 'http://localhost:11434',
  chatModel: 'aya:8b',
  embeddingModel: 'jeffh/intfloat-multilingual-e5-large-instruct:f32', 
  rerankerModel: 'Xenova/bge-reranker-v2-m3', // Default BGE M3 Reranker
  chunkSize: 1500,      // Increased to 1500 to capture more context
  childChunkSize: 500,  // Increased for child chunks
  chunkOverlap: 300,    // Increased overlap to 300 chars to ensure sentence continuity
  temperature: 0.0,     // Keep 0 for max faithfulness
  systemPrompt: `شما یک دستیار هوشمند سازمانی هستید که وظیفه دارید فقط بر اساس "مستندات ارائه شده" به سوالات پاسخ دهید.

قوانین حیاتی (CRITICAL RULES):
۱. اگر پاسخ سوال در متن نیست، **حتماً** بگو "اطلاعات موجود نیست". حدس نزن.
۲. **عدم ذکر منبع در متن:** نام فایل‌ها، شماره صفحات یا شناسه منابع (مثل [Doc1] یا [Source]) را در متن پاسخ **ننویسید**. منابع به صورت جداگانه توسط سیستم نمایش داده می‌شوند.
۳. در پاسخ دادن به سوالات فنی (مثل خطاها یا تنظیمات)، نام دقیق پارامترها و مسیرهای منو را عیناً از متن کپی کن.
۴. پاسخ باید خلاصه، فنی، روان و بدون حاشیه باشد.`,
  minConfidence: 0.15,
  vectorWeight: 0.8 // Default: 80% Vector, 20% Keyword
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
      // Force update critical chunking defaults if they match old defaults
      if (currentSettings.chunkSize === 1200) currentSettings.chunkSize = 1500;
      if (currentSettings.chunkOverlap === 200) currentSettings.chunkOverlap = 300;
      if (currentSettings.vectorWeight === undefined) currentSettings.vectorWeight = 0.8;
      if (currentSettings.rerankerModel === undefined) currentSettings.rerankerModel = 'Xenova/bge-reranker-v2-m3';
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
