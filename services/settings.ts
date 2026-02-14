import { AppSettings } from '../types';

const DEFAULT_SETTINGS: AppSettings = {
  ollamaBaseUrl: import.meta.env.VITE_OLLAMA_BASE_URL || 'http://192.168.167.18:1234/v1',
  chatModel: 'openai/gpt-oss-120b', 
  embeddingModel: 'text-embedding-nomic-embed-text-v1.5@q4_k_m', 
  rerankerModel: 'Hybrid-Local-Engine', 
  enableReranker: true, 
  chunkSize: 600,
  childChunkSize: 200,
  chunkOverlap: 150,
  temperature: 0.1, 
  systemPrompt: `شما یک دستیار هوشمند سازمانی هستید که وظیفه دارید فقط بر اساس "مستندات ارائه شده" به سوالات پاسخ دهید.
قوانین:
۱. اگر پاسخ دقیق را در متن پیدا نکردی اما اطلاعات مرتبطی وجود دارد، همان اطلاعات مرتبط را توضیح بده و نگو اطلاعات نیست.
۲. پاسخ باید فنی، دقیق و بدون حاشیه باشد.
۳. در صورت وجود جدول یا لیست در متن، آن را با فرمت مناسب نمایش دهید.`,
  minConfidence: 0.25,
  vectorWeight: 0.30,
  theme: 'dark',
  userId: crypto.randomUUID() // Default random user ID for new users
};

let currentSettings: AppSettings = { ...DEFAULT_SETTINGS };

const loadSettings = () => {
  try {
    const saved = localStorage.getItem('rayan_rag_settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      currentSettings = { ...DEFAULT_SETTINGS, ...parsed };
      
      // Enforce critical connection settings from Env if provided
      if (import.meta.env.VITE_OLLAMA_BASE_URL) {
          currentSettings.ollamaBaseUrl = import.meta.env.VITE_OLLAMA_BASE_URL;
      }
    }
  } catch (e) { console.error("Failed to load settings", e); }
};
loadSettings();

export const getSettings = (): AppSettings => ({ ...currentSettings });
export const updateSettings = (newSettings: Partial<AppSettings>) => {
  currentSettings = { ...currentSettings, ...newSettings };
  localStorage.setItem('rayan_rag_settings', JSON.stringify(currentSettings));
};
