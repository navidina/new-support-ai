
import React, { useState } from 'react';
import { X, BookOpen, Code, Cpu, Database, FileText, Search, ShieldCheck, Layers, GitBranch, Zap, HelpCircle, ChevronDown, ChevronUp, Tag, Activity, Server, Hash, ClipboardCheck, Book, Sparkles, Tags, Network, BrainCircuit, CheckCircle2 } from 'lucide-react';

interface HelpModalProps {
  /** Flag to control modal visibility. */
  isOpen: boolean;
  /** Callback to close the modal. */
  onClose: () => void;
}

// Data structure for the Taxonomy Guide
const TAXONOMY_DATA = [
    {
        id: 'back_office',
        title: 'مدیریت عملیات کارگزاری (Back Office)',
        icon: <Layers className="w-5 h-5 text-blue-600" />,
        color: 'bg-blue-50 border-blue-200',
        description: 'شامل کلیه فرآیندهای داخلی، مالی و اداری کارگزاری.',
        subs: [
            { name: 'اطلاعات پایه (Basic Info)', keywords: ['شعب', 'باجه', 'تعریف کاربر', 'دسترسی‌ها', 'تنظیمات سیستم'] },
            { name: 'حسابداری (Accounting)', keywords: ['سند حسابداری', 'معین', 'تفصیلی', 'تراز', 'صورت‌های مالی', 'کدینگ'] },
            { name: 'خزانه‌داری (Treasury)', keywords: ['فیش واریزی', 'چک', 'مغایرت بانکی', 'تسهیلات', 'دریافت و پرداخت'] },
            { name: 'عملیات اوراق (Securities Ops)', keywords: ['تخصیص', 'ابطال معامله', 'کارگزار ناظر', 'فایل DBS', 'پایاپای'] }
        ]
    },
    {
        id: 'online_trading',
        title: 'معاملات برخط (OMS)',
        icon: <Activity className="w-5 h-5 text-emerald-600" />,
        color: 'bg-emerald-50 border-emerald-200',
        description: 'سامانه‌های معاملاتی کلاینت‌ساید و هسته معاملات.',
        subs: [
            { name: 'اکسیر (Exir)', keywords: ['اکسیر', 'تکنیکال', 'نمودار', 'سفارش شرطی', 'بمب', 'دیده‌بان'] },
            { name: 'رکسار (Recsar)', keywords: ['رکسار', 'برخط گروهی', 'فروش تعهدی', 'سبد سفارش'] },
            { name: 'موبایل (Mobile/PWA)', keywords: ['رایان همراه', 'اپلیکیشن', 'Android', 'iOS', 'اثر انگشت'] }
        ]
    },
    {
        id: 'funds',
        title: 'صندوق‌های سرمایه‌گذاری (Funds)',
        icon: <Database className="w-5 h-5 text-amber-600" />,
        color: 'bg-amber-50 border-amber-200',
        description: 'مدیریت صندوق‌های ETF، صدور و ابطال و بازارگردانی.',
        subs: [
            { name: 'عملیات صندوق', keywords: ['صدور', 'ابطال', 'NAV', 'ضامن نقدشوندگی', 'متولی'] },
            { name: 'API صندوق', keywords: ['وب‌سرویس صندوق', 'Fund API', 'اتصال سایت'] }
        ]
    },
    {
        id: 'troubleshooting',
        title: 'عیب‌یابی و پشتیبانی (Troubleshooting)',
        icon: <ShieldCheck className="w-5 h-5 text-red-600" />,
        color: 'bg-red-50 border-red-200',
        description: 'تشخیص خودکار خطاها، تیکت‌ها و مغایرت‌ها.',
        subs: [
            { name: 'مغایرت مالی', keywords: ['مانده', 'کارمزد', 'نکول', 'ثبت تکراری', 'عدم تراز'] },
            { name: 'مشکلات سفارش', keywords: ['ارسال نشد', 'تأخیر هسته', 'خطای سفارش', 'عدم نمایش'] },
            { name: 'دسترسی و لاگین', keywords: ['رمز عبور', 'لاگین', 'IP', 'مسدودی', 'سطح دسترسی'] }
        ]
    },
    {
        id: 'tech',
        title: 'فنی و زیرساخت (Technical)',
        icon: <Server className="w-5 h-5 text-slate-600" />,
        color: 'bg-slate-50 border-slate-200',
        description: 'مستندات مربوط به سرور، شبکه و وب‌سرویس‌ها.',
        subs: [
            { name: 'Web Services', keywords: ['API', 'Swagger', 'WSDL', 'متد فراخوانی', 'JSON'] },
            { name: 'Payment Gateways', keywords: ['درگاه پرداخت', 'IPG', 'شاپرک', 'کلید خصوصی'] },
            { name: 'Network/Security', keywords: ['فایروال', 'DNS', 'VPN', 'مکنا', 'دیتاسنتر'] }
        ]
    }
];

/**
 * HelpModal Component.
 * Provides comprehensive documentation for users and developers.
 * Includes "User Guide", "Technical Architecture", and "Taxonomy" sections.
 * 
 * @param {HelpModalProps} props - The component props.
 * @returns {React.ReactElement} The rendered modal.
 */
const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'user' | 'tech'>('user');
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const toggleSection = (id: string) => {
      setExpandedSection(expandedSection === id ? null : id);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200 font-sans">
      <div className="bg-white rounded-2xl w-full max-w-5xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden dir-rtl">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg text-white shadow-lg shadow-blue-500/30">
              <HelpCircle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">مرکز راهنمای جامع سیستم</h2>
              <p className="text-xs text-slate-500 mt-1">Local RAG Assistant Documentation</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex p-2 gap-2 bg-slate-50 border-b border-slate-100 px-6">
          <button 
            onClick={() => setActiveTab('user')}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'user' 
              ? 'bg-white shadow-md text-blue-600 ring-1 ring-black/5' 
              : 'text-slate-500 hover:bg-white/60 hover:text-slate-700'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            راهنمای کاربری (عمومی)
          </button>
          <button 
            onClick={() => setActiveTab('tech')}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'tech' 
              ? 'bg-white shadow-md text-emerald-600 ring-1 ring-black/5' 
              : 'text-slate-500 hover:bg-white/60 hover:text-slate-700'
            }`}
          >
            <Code className="w-4 h-4" />
            معماری فنی و منطق سیستم
          </button>
        </div>

        {/* Content Scrollable Area */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-white custom-scrollbar">
          
          {/* USER GUIDE TAB */}
          {activeTab === 'user' && (
            <div className="space-y-8 animate-in slide-in-from-right-4 fade-in duration-300">
              
              {/* Intro Banner */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-6 flex gap-5 items-start">
                <div className="bg-white p-3 rounded-full shadow-md text-blue-600 shrink-0">
                    <Zap className="w-6 h-6" />
                </div>
                <div>
                    <h3 className="font-bold text-lg text-slate-800 mb-2">دستیار هوشمند سازمانی چیست؟</h3>
                    <p className="text-sm text-slate-600 leading-7 text-justify">
                        این نرم‌افزار یک موتور جستجوی معنایی (RAG) است که به طور خاص برای محیط‌های پشتیبانی مالی و بورس طراحی شده است. برخلاف جستجوی معمولی که فقط کلمات را پیدا می‌کند، این سیستم <strong>مفهوم سوال شما</strong> را درک کرده و پاسخ را از بین هزاران صفحه مستندات، تیکت‌های قدیمی و فایل‌های راهنما استخراج می‌کند.
                        <br/>
                        <span className="font-bold text-blue-700 mt-2 block">ویژگی مهم: تمام داده‌ها روی کامپیوتر شما پردازش می‌شوند و هیچ فایلی به اینترنت آپلود نمی‌شود (حفظ محرمانگی).</span>
                    </p>
                </div>
              </div>

              {/* Workflow Steps */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                      { step: 1, title: 'انتخاب پوشه', desc: 'پوشه حاوی فایل‌های Word, PDF یا TXT را انتخاب کنید.', icon: <FileText className="w-5 h-5" /> },
                      { step: 2, title: 'پردازش خودکار', desc: 'سیستم فایل‌ها را می‌خواند، تمیز می‌کند و دسته‌بندی می‌کند.', icon: <Cpu className="w-5 h-5" /> },
                      { step: 3, title: 'پرسش و پاسخ', desc: 'سوال خود را بپرسید. سیستم پاسخ دقیق را تولید می‌کند.', icon: <Search className="w-5 h-5" /> },
                      { step: 4, title: 'تحلیل گراف', desc: 'ارتباطات پنهان بین مستندات را در گراف دانش کشف کنید.', icon: <GitBranch className="w-5 h-5" /> }
                  ].map((item) => (
                      <div key={item.step} className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex flex-col items-center text-center hover:shadow-md transition-shadow">
                          <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-slate-700 shadow-sm mb-3">
                              {item.icon}
                          </div>
                          <h4 className="font-bold text-slate-800 mb-1">{item.title}</h4>
                          <p className="text-xs text-slate-500 leading-5">{item.desc}</p>
                      </div>
                  ))}
              </div>

              {/* Tips Section */}
              <div className="space-y-4">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2 text-lg">
                      <HelpCircle className="w-5 h-5 text-amber-500" />
                      چگونه بهترین نتیجه را بگیریم؟
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-white border border-slate-200 p-4 rounded-lg shadow-sm">
                          <h4 className="font-bold text-sm text-emerald-600 mb-2 flex items-center gap-2"><CheckCircle2 className="w-4 h-4"/> نکات کلیدی</h4>
                          <ul className="text-sm text-slate-600 space-y-3 list-none">
                              <li className="flex gap-2">
                                  <span className="text-emerald-500">•</span>
                                  <span>برای پیدا کردن مسیر یک گزارش، فقط نام آن را بنویسید (مثلاً: <strong>"گزارش کارمزد"</strong>). سیستم به صورت خودکار آدرس منو را اولویت می‌دهد.</span>
                              </li>
                              <li className="flex gap-2">
                                  <span className="text-emerald-500">•</span>
                                  <span>از دکمه <strong>"نمایش Logic"</strong> در زیر پیام‌های ربات استفاده کنید تا ببینید سیستم چه کلمات کلیدی را استخراج کرده و چقدر زمان صرف کرده است.</span>
                              </li>
                              <li className="flex gap-2">
                                  <span className="text-emerald-500">•</span>
                                  <span>اگر پاسخ شامل کلمه "مغایرت" است، به بخش گراف بروید و گزینه "طرح‌واره (Schema)" را انتخاب کنید تا علل ریشه‌ای را ببینید.</span>
                              </li>
                          </ul>
                      </div>
                      <div className="bg-white border border-slate-200 p-4 rounded-lg shadow-sm">
                          <h4 className="font-bold text-sm text-blue-600 mb-2 flex items-center gap-2"><Sparkles className="w-4 h-4"/> قابلیت‌های ویژه</h4>
                          <ul className="text-sm text-slate-600 space-y-3 list-none">
                              <li className="flex gap-2">
                                  <span className="text-blue-500">•</span>
                                  <span><strong>نگارش سند (Deep Synthesis):</strong> در بخش "مخزن دانش"، سیستم می‌تواند صدها تکه متن پراکنده را به یک مقاله منسجم تبدیل کند.</span>
                              </li>
                              <li className="flex gap-2">
                                  <span className="text-blue-500">•</span>
                                  <span><strong>گراف درختی:</strong> برای دیدن ساختار سلسله‌مراتبی دسته‌ها بدون هم‌پوشانی، از الگوی "سلسله‌مراتب (Tree)" استفاده کنید.</span>
                              </li>
                          </ul>
                      </div>
                  </div>
              </div>
            </div>
          )}

          {/* TECH TAB */}
          {activeTab === 'tech' && (
            <div className="space-y-10 animate-in slide-in-from-left-4 fade-in duration-300">
              
              {/* 1. Architecture Pipeline */}
              <div>
                  <h3 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2 flex items-center gap-2">
                      <Cpu className="w-5 h-5 text-slate-500" />
                      ۱. معماری پردازش داده (ETL Pipeline)
                  </h3>
                  <div className="relative border-l-2 border-slate-200 mr-4 space-y-8 py-2">
                      
                      <div className="relative flex gap-4 pr-6">
                          <div className="absolute -right-[9px] top-0 w-4 h-4 bg-slate-800 rounded-full border-4 border-white shadow-sm"></div>
                          <div className="flex-1">
                              <h4 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                                  <FileText className="w-4 h-4 text-blue-500" />
                                  Ingestion & Cleaning
                              </h4>
                              <p className="text-xs text-slate-600 mt-2 leading-5 bg-slate-50 p-3 rounded-lg border border-slate-200">
                                  استخراج متن با <code>Mammoth.js</code> و نرمال‌سازی پیشرفته (تبدیل ی/ک، حذف هدر/فوتر).
                              </p>
                          </div>
                      </div>

                      <div className="relative flex gap-4 pr-6">
                          <div className="absolute -right-[9px] top-0 w-4 h-4 bg-emerald-600 rounded-full border-4 border-white shadow-sm"></div>
                          <div className="flex-1">
                              <h4 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                                  <Tags className="w-4 h-4 text-emerald-500" />
                                  Smart Classification
                              </h4>
                              <p className="text-xs text-slate-600 mt-2 leading-5 bg-slate-50 p-3 rounded-lg border border-slate-200">
                                  طبقه‌بندی اسناد بر اساس کلمات کلیدی وزن‌دار (مثلاً تشخیص تیکت‌ها، خطاهای اکسیر، اسناد مالی).
                              </p>
                          </div>
                      </div>

                      <div className="relative flex gap-4 pr-6">
                          <div className="absolute -right-[9px] top-0 w-4 h-4 bg-amber-500 rounded-full border-4 border-white shadow-sm"></div>
                          <div className="flex-1">
                              <h4 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                                  <Layers className="w-4 h-4 text-amber-500" />
                                  Semantic Chunking
                              </h4>
                              <p className="text-xs text-slate-600 mt-2 leading-5 bg-slate-50 p-3 rounded-lg border border-slate-200">
                                  استراتژی پنجره لغزنده (Sliding Window) با هم‌پوشانی ۳۰۰ کاراکتر برای حفظ کانتکست.
                              </p>
                          </div>
                      </div>
                  </div>
              </div>

              {/* 2. Search Engine & Heuristics */}
              <div>
                  <h3 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2 flex items-center gap-2">
                      <Search className="w-5 h-5 text-indigo-500" />
                      ۲. موتور جستجو و رتبه‌بندی (Search Engine)
                  </h3>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
                      <div>
                          <h4 className="font-bold text-sm text-slate-800 mb-1">Hybrid Search Strategy</h4>
                          <p className="text-xs text-slate-600 leading-6 text-justify">
                              سیستم از ترکیب <strong>جستجوی برداری (Cosine Similarity)</strong> و <strong>تطبیق کلمات کلیدی (BM25-style)</strong> استفاده می‌کند. اگر کلمات کلیدی حیاتی (مانند شماره تیکت یا کد خطا) در جستجو باشد، وزن آن‌ها در رتبه‌بندی به شدت افزایش می‌یابد.
                          </p>
                      </div>
                      <div className="border-t border-slate-200 pt-3">
                          <h4 className="font-bold text-sm text-slate-800 mb-1 flex items-center gap-2">
                              <BrainCircuit className="w-4 h-4 text-violet-500" />
                              Navigation Heuristics (هوشمندی ناوبری)
                          </h4>
                          <p className="text-xs text-slate-600 leading-6 text-justify">
                              سیستم دارای یک لایه "پیش‌پردازش کوئری" است. اگر کاربر نام یک فرم یا گزارش را جستجو کند (مثلاً "گزارش کارمزد")، سیستم به طور خودکار کلمات <code>"منو"</code>، <code>"مسیر"</code> و <code>"آدرس"</code> را به جستجو تزریق می‌کند تا احتمال یافتن محل دسترسی آن در نرم‌افزار افزایش یابد. همچنین از یک دیکشنری مترادف‌ها (<code>synonymsData.ts</code>) برای گسترش جستجو استفاده می‌شود.
                          </p>
                      </div>
                  </div>
              </div>

              {/* 3. Graph Engine */}
              <div>
                  <h3 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2 flex items-center gap-2">
                      <Network className="w-5 h-5 text-pink-500" />
                      ۳. موتور گراف (Graph Engine)
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-white border border-slate-200 p-3 rounded-lg">
                          <h4 className="font-bold text-xs text-slate-800 mb-1">Recursive Tree Layout</h4>
                          <p className="text-[10px] text-slate-500 leading-5">
                              الگوریتم جدید چیدمان درختی از روش بازگشتی (Recursive DFS) برای محاسبه عرض زیرشاخه‌ها استفاده می‌کند. این کار تضمین می‌کند که حتی در گراف‌های پیچیده، گره‌های فرزند روی هم نمی‌افتند و ساختار سلسله‌مراتبی کاملاً خوانا باقی می‌ماند.
                          </p>
                      </div>
                      <div className="bg-white border border-slate-200 p-3 rounded-lg">
                          <h4 className="font-bold text-xs text-slate-800 mb-1">Schema Constrained Graph</h4>
                          <p className="text-[10px] text-slate-500 leading-5">
                              در نمای "طرح‌واره"، نودها بر اساس نوع موجودیت (سیستم، خطا، راه‌حل) رنگ‌بندی و چیده می‌شوند. سیستم‌های اصلی (اکسیر، رکسار) به عنوان لنگرهای ثابت (Anchors) عمل می‌کنند تا ثبات بصری حفظ شود.
                          </p>
                      </div>
                  </div>
              </div>

            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default HelpModal;
