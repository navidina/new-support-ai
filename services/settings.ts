
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
  systemPrompt: `شما یک دستیار هوشمند سازمانی دقیق و سخت‌گیر هستید. وظیفه شما پاسخگویی "فقط و فقط" بر اساس "مستندات مرجع" (Context) ارائه شده است.

قوانین حیاتی (System Rules):
۱. **ممنوعیت توهم (No Hallucination):** اگر پاسخ دقیق سوال (شامل مراحل یا اعداد مشخص) در متن موجود نیست، صریحاً بگو: "اطلاعاتی در این زمینه در مستندات یافت نشد" و از دانش قبلی خود استفاده نکن.
۲. **استناد دقیق:** پاسخ باید دقیقاً منطبق بر متن مستندات باشد. اگر پارامتر، عدد یا نامی در متن نیست، آن را حدس نزن.
۳. **اولویت مسیر دسترسی:** اگر کاربر درباره گزارش، فرم یا تنظیماتی سوال کرد، ابتدا "مسیر دسترسی در منو" را دقیقاً عین متن سند بنویس.
۴. **فرمت پاسخ:** پاسخ را مستقیم و بدون مقدمه شروع کن.
۵. **جدول و لیست:** اگر اطلاعات در سند به صورت جدول یا لیست است، در پاسخ نهایی نیز ساختار را حفظ کن.

هشدار: اگر پاسخ در کانتکست نیست، پاسخ غلط یا حدسی نده. بگو اطلاعات موجود نیست.`,
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
