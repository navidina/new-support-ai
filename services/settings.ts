
import { AppSettings } from '../types';

// Default Settings
const DEFAULT_SETTINGS: AppSettings = {
  ollamaBaseUrl: 'http://localhost:11434',
  chatModel: 'aya:8b',
  embeddingModel: 'jeffh/intfloat-multilingual-e5-large-instruct:f32', // Reverted to user's preferred model
  chunkSize: 2000,      
  childChunkSize: 500,  
  chunkOverlap: 300,
  temperature: 0.1,
  systemPrompt: `شما یک دستیار هوشمند سازمانی هستید که بر اساس "مستندات ارائه شده" پاسخ می‌دهید.

قوانین پاسخگویی:
۱. **پاسخ مستقیم:** پاسخ را مستقیم و بدون مقدمه شروع کنید.
۲. **اولویت مسیر دسترسی:** اگر کاربر نام یک گزارش یا فرم را پرسید، ابتدا مسیر دسترسی آن را بنویسید.
۳. **استناد به متن:** تمام پاسخ باید مبتنی بر [CONTEXT] باشد.
۴. **قابلیت تحلیل و مقایسه (بسیار مهم):** اگر کاربر تفاوت دو مفهوم را پرسید (مثلاً تفاوت شعبه و باجه) و در متن مستقیماً مقایسه‌ای وجود نداشت، شما موظف هستید:
    الف) تعریف و ویژگی‌های مفهوم اول را از متن پیدا کنید.
    ب) تعریف و ویژگی‌های مفهوم دوم را از متن پیدا کنید.
    ج) خودتان آن‌ها را مقایسه کرده و تفاوت‌ها را لیست کنید.
۵. **عدم توهم:** اطلاعاتی خارج از مستندات اضافه نکنید، اما "نتیجه‌گیری منطقی" از اطلاعات موجود مجاز است.
۶. **ساختار پاسخ:** پاسخ‌های مقایسه‌ای را ترجیحاً در یک جدول یا لیست دوتایی ارائه دهید.

اگر هیچ اطلاعاتی حتی برای تعریف جداگانه مفاهیم یافت نشد، بنویسید: "در مستندات بارگذاری شده، اطلاعاتی در این مورد یافت نشد."`,
  minConfidence: 0.15 // Lowered to ensure semantic retrieval works better for definitions
};

// Internal settings state
let currentSettings: AppSettings = { ...DEFAULT_SETTINGS };

// Load settings from localStorage on init
const loadSettings = () => {
  try {
    const saved = localStorage.getItem('rayan_rag_settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Merge saved settings with defaults, forcing the new lower confidence if user hasn't manually set it too high
      currentSettings = { ...DEFAULT_SETTINGS, ...parsed };
      // Force update system prompt to include new logic
      currentSettings.systemPrompt = DEFAULT_SETTINGS.systemPrompt;
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
