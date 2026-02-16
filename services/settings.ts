
import { AppSettings } from '../types';

const DEFAULT_SETTINGS: AppSettings = {
  serverUrl: 'http://localhost:3001/api', // Central LanceDB Server
  ollamaBaseUrl: 'http://127.0.0.1:11434/v1', 
  chatModel: 'aya:8b', // Or your specific model
  embeddingModel: 'text-embedding-nomic-embed-text-v1.5@q4_k_m', 
  rerankerModel: 'text-embedding-bge-reranker-v2-m3', 
  enableReranker: true, 
  chunkSize: 600, 
  childChunkSize: 200,
  chunkOverlap: 150, 
  temperature: 0.2, // Slightly increased for better fluency
  systemPrompt: `شما یک "تحلیل‌گر ارشد و دستیار هوشمند سازمانی" هستید.
وظیفه شما ارائه پاسخ‌های "بسیار جامع، کامل و با جزئیات دقیق" بر اساس مستندات ارائه شده است.

دستورالعمل‌های پاسخ‌دهی:
۱. **جامعیت:** پاسخ نباید کوتاه باشد. تمام زوایای سوال را بررسی کنید و اگر اطلاعات در چند بخش مختلف مستندات پخش شده است، آن‌ها را با هم ترکیب کنید.
۲. **ساختار:** پاسخ باید ساختاریافته باشد (استفاده از تیتر، بولت‌پوینت و پاراگراف‌بندی).
۳. **استدلال:** فقط نتیجه را نگویید، دلیل آن را هم از متن استخراج کنید (چرا این خطا رخ می‌دهد؟ راهکار چیست؟).
۴. **دقت:** اگر در متن مستندات، مراحل انجام کاری ذکر شده، آن مراحل را به ترتیب و با جزئیات کامل بنویسید.
۵. **محدودیت:** اگر پاسخ در مستندات نیست، صادقانه بگویید "در مستندات فعلی اطلاعاتی یافت نشد" اما اگر اطلاعات مرتبطی هست، حتماً آن را ارائه دهید.`,
  minConfidence: 0.25, 
  vectorWeight: 0.30, 
  theme: 'dark'
};

let currentSettings: AppSettings = { ...DEFAULT_SETTINGS };

const loadSettings = () => {
  try {
    const saved = localStorage.getItem('rayan_rag_settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Create a merger to ensure new prompt updates apply if user hasn't customized strictly
      // Or simply overwrite if we want to force the improvement (safer to merge keys)
      currentSettings = { ...DEFAULT_SETTINGS, ...parsed };
      
      // Force update system prompt if it was the old default
      if (parsed.systemPrompt && parsed.systemPrompt.includes("بدون حاشیه")) {
          currentSettings.systemPrompt = DEFAULT_SETTINGS.systemPrompt;
      }

      if (!currentSettings.serverUrl) currentSettings.serverUrl = DEFAULT_SETTINGS.serverUrl;
    }
  } catch (e) { console.error("Failed to load settings", e); }
};
loadSettings();

export const getSettings = (): AppSettings => ({ ...currentSettings });
export const updateSettings = (newSettings: Partial<AppSettings>) => {
  currentSettings = { ...currentSettings, ...newSettings };
  localStorage.setItem('rayan_rag_settings', JSON.stringify(currentSettings));
};
