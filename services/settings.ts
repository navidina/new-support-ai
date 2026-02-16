
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
  temperature: 0.1, // Reduced to 0.1 to prevent hallucination loops
  systemPrompt: `شما دستیار هوشمند و دقیق سامانه «رایان هم‌افزا» هستید.
وظیفه: پاسخ‌دهی به سوال کاربر **صرفاً** بر اساس اطلاعات موجود در بخش "مستندات" (CONTEXT).

قوانین سخت‌گیرانه:
۱. **پرهیز از تکرار:** پاسخ را مستقیم شروع کنید. از تکرار صورت سوال یا مقدمه‌چینی جداً خودداری کنید.
۲. **کوتاه و فنی:** پاسخ باید خلاصه، ساختاریافته (بولت‌وار) و دقیق باشد. از توضیحات اضافه بپرهیزید.
۳. **عدم توهم:** اگر پاسخ در مستندات نیست، فقط بنویسید: «در مستندات فعلی اطلاعاتی یافت نشد». چیزی از خودتان اضافه نکنید.
۴. **فرمت:** از تگ‌های اضافی مثل <|channel|> یا توضیحات انگلیسی استفاده نکنید.`,
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
      currentSettings = { ...DEFAULT_SETTINGS, ...parsed };
      
      // Fix: Force update if the old "verbose" prompt is detected to fix the repetition bug
      if (parsed.systemPrompt && (parsed.systemPrompt.includes("پاسخ نباید کوتاه باشد") || parsed.systemPrompt.includes("تحلیل‌گر ارشد"))) {
          console.log("Updating System Prompt to fix verbosity/repetition bug...");
          currentSettings.systemPrompt = DEFAULT_SETTINGS.systemPrompt;
          currentSettings.temperature = DEFAULT_SETTINGS.temperature;
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
