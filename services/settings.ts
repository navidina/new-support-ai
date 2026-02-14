
import { AppSettings } from '../types';

const DEFAULT_SETTINGS: AppSettings = {
  ollamaBaseUrl: 'http://192.168.167.18:1234/v1', 
  chatModel: 'openai/gpt-oss-120b', 
  embeddingModel: 'text-embedding-nomic-embed-text-v1.5@q4_k_m', 
  rerankerModel: 'Hybrid-Local-Engine', 
  enableReranker: true, 
  chunkSize: 600, // Reduced from 2000 to 600 for better semantic precision
  childChunkSize: 200,
  chunkOverlap: 150, // Increased overlap to prevent cutting definitions in half
  temperature: 0.1, 
  systemPrompt: `شما یک دستیار هوشمند سازمانی هستید که وظیفه دارید فقط بر اساس "مستندات ارائه شده" به سوالات پاسخ دهید.
قوانین:
۱. اگر پاسخ دقیق را در متن پیدا نکردی اما اطلاعات مرتبطی وجود دارد، همان اطلاعات مرتبط را توضیح بده و نگو اطلاعات نیست.
۲. پاسخ باید فنی، دقیق و بدون حاشیه باشد.
۳. در صورت وجود جدول یا لیست در متن، آن را با فرمت مناسب نمایش دهید.`,
  minConfidence: 0.25, // Higher threshold because Hybrid Score is now more robust
  vectorWeight: 0.30, // Heavily favor keywords (30% Vector / 70% Keyword) for specific support queries
  theme: 'dark'
};

let currentSettings: AppSettings = { ...DEFAULT_SETTINGS };

const loadSettings = () => {
  try {
    const saved = localStorage.getItem('rayan_rag_settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      currentSettings = { ...DEFAULT_SETTINGS, ...parsed };
      
      // Enforce critical connection settings unless explicitly handled logic exists
      currentSettings.ollamaBaseUrl = DEFAULT_SETTINGS.ollamaBaseUrl;
    }
  } catch (e) { console.error("Failed to load settings", e); }
};
loadSettings();

export const getSettings = (): AppSettings => ({ ...currentSettings });
export const updateSettings = (newSettings: Partial<AppSettings>) => {
  currentSettings = { ...currentSettings, ...newSettings };
  localStorage.setItem('rayan_rag_settings', JSON.stringify(currentSettings));
};
