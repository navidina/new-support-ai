
import React, { useState, useEffect, useRef } from 'react';
import { X, Settings, Database, Server, Save, Trash2, Upload, FileText, CheckCircle2, AlertCircle, Download, Activity, Cpu, Crosshair, Sun, Moon } from 'lucide-react';
import { AppSettings, DocumentStatus } from '../types';
import { getSettings, updateSettings } from '../services/settings';
import { toPersianDigits } from '../services/textProcessor';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  documents: DocumentStatus[];
  onFilesSelected: (files: FileList) => void;
  onClearDB: () => void;
  onExportDB: () => void;
  onImportDB: (files: FileList) => void;
  fineTuningCount: number;
  onExportFineTuning: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
    isOpen,
    onClose,
    documents,
    onFilesSelected,
    onClearDB,
    onExportDB,
    onImportDB,
    fineTuningCount,
    onExportFineTuning
}) => {
    const [activeTab, setActiveTab] = useState<'documents' | 'models' | 'advanced'>('documents');
    const [formData, setFormData] = useState<AppSettings>(getSettings());
    const fileInputRef = useRef<HTMLInputElement>(null);
    const dbInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setFormData(getSettings());
        }
    }, [isOpen]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'number' || type === 'range' ? parseFloat(value) : value
        }));
    };

    const toggleTheme = () => {
        setFormData(prev => ({
            ...prev,
            theme: prev.theme === 'dark' ? 'light' : 'dark'
        }));
    };

    const handleSave = () => {
        updateSettings(formData);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 dark:bg-black/80 backdrop-blur-md p-4 font-sans animate-in fade-in duration-200" dir="rtl">
            <div className="bg-white dark:bg-surface-900/90 border border-slate-200 dark:border-white/10 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-slate-800 dark:text-white backdrop-blur-xl">
                
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/5">
                    <div className="flex items-center gap-3">
                        <div className="bg-gradient-to-br from-brand-600 to-brand-800 p-2 rounded-lg text-white shadow-lg shadow-brand-500/20">
                            <Settings className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-800 dark:text-white tracking-wide">تنظیمات و مدیریت</h2>
                            <p className="text-xs text-slate-500 dark:text-surface-400 mt-1">پیکربندی هسته پردازشی و پایگاه دانش</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full text-slate-400 dark:text-surface-400 hover:text-slate-700 dark:hover:text-white transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex px-6 border-b border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/5 gap-6 overflow-x-auto">
                    <button 
                        onClick={() => setActiveTab('documents')}
                        className={`py-4 px-2 text-sm font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'documents' ? 'border-brand-500 text-brand-600 dark:text-brand-400' : 'border-transparent text-slate-500 dark:text-surface-400 hover:text-slate-800 dark:hover:text-white'}`}
                    >
                        <Database className="w-4 h-4" />
                        مدیریت دانش
                    </button>
                    <button 
                        onClick={() => setActiveTab('models')}
                        className={`py-4 px-2 text-sm font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'models' ? 'border-brand-500 text-brand-600 dark:text-brand-400' : 'border-transparent text-slate-500 dark:text-surface-400 hover:text-slate-800 dark:hover:text-white'}`}
                    >
                        <Server className="w-4 h-4" />
                        مدل‌های هوش مصنوعی
                    </button>
                     <button 
                        onClick={() => setActiveTab('advanced')}
                        className={`py-4 px-2 text-sm font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'advanced' ? 'border-brand-500 text-brand-600 dark:text-brand-400' : 'border-transparent text-slate-500 dark:text-surface-400 hover:text-slate-800 dark:hover:text-white'}`}
                    >
                        <Activity className="w-4 h-4" />
                        تنظیمات پیشرفته
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-white dark:bg-surface-950/30">
                    
                    {/* DOCUMENTS TAB */}
                    {activeTab === 'documents' && (
                        <div className="space-y-6 animate-in slide-in-from-right-4 fade-in">
                            {/* Upload Section */}
                            <div className="bg-slate-50 dark:bg-surface-800/30 border border-slate-200 dark:border-white/10 border-dashed rounded-xl p-8 text-center transition-all hover:bg-slate-100 dark:hover:bg-surface-800/50 hover:border-brand-500/30">
                                <input 
                                    type="file" 
                                    multiple 
                                    ref={fileInputRef} 
                                    className="hidden" 
                                    onChange={(e) => e.target.files && onFilesSelected(e.target.files)}
                                    accept=".md,.txt,.json,.csv,.xml,.js,.ts,.py,.log,.docx"
                                />
                                <div className="w-16 h-16 bg-brand-50 dark:bg-brand-500/10 text-brand-500 dark:text-brand-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-brand-200 dark:border-brand-500/20">
                                    <Upload className="w-8 h-8" />
                                </div>
                                <h3 className="font-bold text-slate-800 dark:text-white text-lg mb-2">بارگذاری مستندات جدید</h3>
                                <p className="text-sm text-slate-500 dark:text-surface-400 mb-6">فایل‌های متنی (Word, PDF, TXT) را انتخاب کنید</p>
                                <button 
                                    onClick={() => fileInputRef.current?.click()}
                                    className="bg-brand-600 hover:bg-brand-500 text-white px-6 py-2.5 rounded-lg font-bold shadow-lg shadow-brand-500/30 transition-all hover:scale-105 active:scale-95"
                                >
                                    انتخاب فایل‌ها
                                </button>
                            </div>

                            {/* Stats */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="bg-slate-50 dark:bg-surface-800/50 border border-slate-200 dark:border-white/5 rounded-xl p-4 flex items-center gap-4">
                                    <div className="bg-emerald-500/10 p-3 rounded-lg text-emerald-500 dark:text-emerald-400 border border-emerald-500/20">
                                        <FileText className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <div className="text-2xl font-black text-slate-800 dark:text-white">{toPersianDigits(documents.length)}</div>
                                        <div className="text-xs text-slate-500 dark:text-surface-400 font-bold">تعداد اسناد</div>
                                    </div>
                                </div>
                                <div className="bg-slate-50 dark:bg-surface-800/50 border border-slate-200 dark:border-white/5 rounded-xl p-4 flex items-center gap-4">
                                    <div className="bg-brand-500/10 p-3 rounded-lg text-brand-600 dark:text-brand-400 border border-brand-500/20">
                                        <Database className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <div className="text-2xl font-black text-slate-800 dark:text-white">
                                            {toPersianDigits(documents.reduce((acc, d) => acc + d.chunks, 0))}
                                        </div>
                                        <div className="text-xs text-slate-500 dark:text-surface-400 font-bold">تعداد قطعات (Chunks)</div>
                                    </div>
                                </div>
                                <div className="bg-slate-50 dark:bg-surface-800/50 border border-slate-200 dark:border-white/5 rounded-xl p-4 flex items-center gap-4">
                                    <div className="bg-amber-500/10 p-3 rounded-lg text-amber-500 dark:text-amber-400 border border-amber-500/20">
                                        <Activity className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <div className="text-2xl font-black text-slate-800 dark:text-white">{toPersianDigits(fineTuningCount)}</div>
                                        <div className="text-xs text-slate-500 dark:text-surface-400 font-bold">داده‌های آموزشی (RLHF)</div>
                                    </div>
                                </div>
                            </div>

                            {/* Documents List */}
                            <div className="border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden bg-white dark:bg-surface-900">
                                <div className="bg-slate-50 dark:bg-surface-800/50 px-4 py-3 font-bold text-xs text-slate-500 dark:text-surface-400 border-b border-slate-200 dark:border-white/5 flex justify-between">
                                    <span>نام فایل</span>
                                    <span>وضعیت</span>
                                </div>
                                <div className="max-h-60 overflow-y-auto custom-scrollbar">
                                    {documents.length === 0 ? (
                                        <div className="p-8 text-center text-slate-400 dark:text-surface-500 text-sm opacity-50">لیست خالی است</div>
                                    ) : (
                                        documents.map((doc, i) => (
                                            <div key={i} className="px-4 py-3 border-b border-slate-100 dark:border-white/5 last:border-0 flex justify-between items-center hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <FileText className="w-4 h-4 text-slate-400 dark:text-surface-500" />
                                                    <span className="text-sm font-medium text-slate-700 dark:text-surface-300 truncate max-w-[200px]" dir="ltr">{doc.name}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {doc.status === 'indexed' && <span className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> ایندکس شده ({toPersianDigits(doc.chunks)})</span>}
                                                    {doc.status === 'processing' && <span className="text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full font-bold flex items-center gap-1"><Activity className="w-3 h-3 animate-spin" /> در حال پردازش</span>}
                                                    {doc.status === 'embedding' && <span className="text-[10px] bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20 px-2 py-0.5 rounded-full font-bold flex items-center gap-1"><Cpu className="w-3 h-3 animate-pulse" /> بردارسازی</span>}
                                                    {doc.status === 'error' && <span className="text-[10px] bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full font-bold flex items-center gap-1"><AlertCircle className="w-3 h-3" /> خطا</span>}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                            
                            {/* DB Actions */}
                            <div className="flex flex-wrap gap-3 pt-4 border-t border-slate-200 dark:border-white/10">
                                <button onClick={onClearDB} className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30 hover:bg-red-500/20 rounded-lg text-xs font-bold transition-colors">
                                    <Trash2 className="w-4 h-4" />
                                    حذف کل داده‌ها
                                </button>
                                <button onClick={onExportDB} className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-surface-800 text-slate-600 dark:text-surface-300 border border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-surface-700 hover:text-slate-900 dark:hover:text-white rounded-lg text-xs font-bold transition-colors">
                                    <Download className="w-4 h-4" />
                                    پشتیبان‌گیری (Export JSON)
                                </button>
                                <div className="relative">
                                    <input 
                                        type="file" 
                                        ref={dbInputRef} 
                                        className="hidden" 
                                        onChange={(e) => e.target.files && onImportDB(e.target.files)}
                                        accept=".json"
                                    />
                                    <button onClick={() => dbInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-surface-800 text-slate-600 dark:text-surface-300 border border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-surface-700 hover:text-slate-900 dark:hover:text-white rounded-lg text-xs font-bold transition-colors">
                                        <Upload className="w-4 h-4" />
                                        بازیابی (Import JSON)
                                    </button>
                                </div>
                                <div className="mr-auto">
                                    <button onClick={onExportFineTuning} disabled={fineTuningCount === 0} className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                        <Download className="w-4 h-4" />
                                        دانلود دیتاست آموزشی ({toPersianDigits(fineTuningCount)})
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* MODELS TAB */}
                    {activeTab === 'models' && (
                        <div className="space-y-6 animate-in slide-in-from-right-4 fade-in">
                            <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 p-4 rounded-xl mb-4">
                                <p className="text-xs text-blue-600 dark:text-blue-300 flex items-center gap-2">
                                    <Activity className="w-4 h-4" />
                                    توجه: برای اعمال تغییرات مدل، پس از ذخیره صفحه را رفرش کنید.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-slate-600 dark:text-surface-300">Ollama API URL</label>
                                <input 
                                    type="text" 
                                    name="ollamaBaseUrl"
                                    value={formData.ollamaBaseUrl}
                                    onChange={handleChange}
                                    className="w-full p-3 bg-slate-100 dark:bg-surface-950 border border-slate-200 dark:border-white/10 rounded-xl text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none dir-ltr font-mono transition-all"
                                    placeholder="http://localhost:11434"
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="block text-sm font-bold text-slate-600 dark:text-surface-300">Chat Model (Generation)</label>
                                    <input 
                                        type="text" 
                                        name="chatModel"
                                        value={formData.chatModel}
                                        onChange={handleChange}
                                        className="w-full p-3 bg-slate-100 dark:bg-surface-950 border border-slate-200 dark:border-white/10 rounded-xl text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none dir-ltr font-mono transition-all"
                                        placeholder="aya:8b"
                                    />
                                    <p className="text-[10px] text-slate-500 dark:text-surface-500">مدل اصلی برای تولید پاسخ نهایی (مثال: qwen2:7b)</p>
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-bold text-slate-600 dark:text-surface-300">Embedding Model</label>
                                    <input 
                                        type="text" 
                                        name="embeddingModel"
                                        value={formData.embeddingModel}
                                        onChange={handleChange}
                                        className="w-full p-3 bg-slate-100 dark:bg-surface-950 border border-slate-200 dark:border-white/10 rounded-xl text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none dir-ltr font-mono transition-all"
                                        placeholder="nomic-embed-text"
                                    />
                                    <p className="text-[10px] text-slate-500 dark:text-surface-500">مدل بردارسازی متن (مثال: mxbai-embed-large)</p>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-slate-600 dark:text-surface-300 flex items-center gap-2">
                                    <Crosshair className="w-4 h-4 text-rose-500 dark:text-rose-400" />
                                    Reranker Model (مدل رتبه‌بندی مجدد)
                                </label>
                                <input 
                                    type="text" 
                                    name="rerankerModel"
                                    value={formData.rerankerModel}
                                    onChange={handleChange}
                                    className="w-full p-3 bg-slate-100 dark:bg-surface-950 border border-slate-200 dark:border-white/10 rounded-xl text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none dir-ltr font-mono transition-all"
                                    placeholder="Xenova/bge-reranker-v2-m3"
                                />
                                <p className="text-[10px] text-slate-500 dark:text-surface-500">
                                    مدل Cross-Encoder برای افزایش دقت جستجو. (پیش‌فرض: Xenova/bge-reranker-v2-m3)
                                    <br/>
                                    این مدل در مرورگر دانلود و اجرا می‌شود (Transformers.js).
                                </p>
                            </div>

                            <div className="space-y-2 pt-4 border-t border-slate-200 dark:border-white/10">
                                <label className="block text-sm font-bold text-slate-600 dark:text-surface-300">Temperature (خلاقیت مدل)</label>
                                <div className="flex items-center gap-4">
                                    <input 
                                        type="range" 
                                        name="temperature"
                                        min="0" max="1" step="0.1"
                                        value={formData.temperature}
                                        onChange={handleChange}
                                        className="flex-1 accent-brand-500 h-2 bg-slate-200 dark:bg-surface-800 rounded-lg appearance-none cursor-pointer"
                                    />
                                    <span className="font-mono bg-slate-100 dark:bg-surface-800 border border-slate-200 dark:border-white/10 px-3 py-1 rounded text-sm text-brand-600 dark:text-brand-300">{toPersianDigits(formData.temperature)}</span>
                                </div>
                                <p className="text-[10px] text-slate-500 dark:text-surface-500">0.0 = دقیق و منطقی | 1.0 = خلاق و غیرقابل پیش‌بینی</p>
                            </div>
                        </div>
                    )}
                    
                    {/* ADVANCED TAB */}
                    {activeTab === 'advanced' && (
                        <div className="space-y-6 animate-in slide-in-from-right-4 fade-in">
                             
                             <div className="bg-slate-50 dark:bg-surface-800/30 p-4 rounded-xl border border-slate-200 dark:border-white/10 flex items-center justify-between">
                                <div>
                                    <h4 className="font-bold text-sm text-slate-800 dark:text-white flex items-center gap-2">
                                        {formData.theme === 'dark' ? <Moon className="w-4 h-4 text-brand-400" /> : <Sun className="w-4 h-4 text-amber-500" />}
                                        ظاهر برنامه (Theme)
                                    </h4>
                                    <p className="text-xs text-slate-500 dark:text-surface-400 mt-1">انتخاب حالت روز یا شب برای رابط کاربری</p>
                                </div>
                                <button 
                                    onClick={toggleTheme}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${formData.theme === 'dark' ? 'bg-brand-600' : 'bg-slate-300'}`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.theme === 'dark' ? 'translate-x-1' : 'translate-x-6'}`} />
                                </button>
                             </div>

                             <div className="space-y-2">
                                <label className="block text-sm font-bold text-slate-600 dark:text-surface-300">System Prompt</label>
                                <textarea 
                                    name="systemPrompt"
                                    value={formData.systemPrompt}
                                    onChange={handleChange}
                                    rows={6}
                                    className="w-full p-3 bg-slate-100 dark:bg-surface-950 border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-700 dark:text-surface-300 focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none font-mono transition-all leading-relaxed custom-scrollbar"
                                />
                                <p className="text-[10px] text-slate-500 dark:text-surface-500">دستورالعمل‌های سیستمی که رفتار مدل را کنترل می‌کنند.</p>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="block text-sm font-bold text-slate-600 dark:text-surface-300">Chunk Size</label>
                                    <input 
                                        type="number" 
                                        name="chunkSize"
                                        value={formData.chunkSize}
                                        onChange={handleChange}
                                        className="w-full p-3 bg-slate-100 dark:bg-surface-950 border border-slate-200 dark:border-white/10 rounded-xl text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-brand-500 outline-none"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-bold text-slate-600 dark:text-surface-300">Child Chunk Size</label>
                                    <input 
                                        type="number" 
                                        name="childChunkSize"
                                        value={formData.childChunkSize}
                                        onChange={handleChange}
                                        className="w-full p-3 bg-slate-100 dark:bg-surface-950 border border-slate-200 dark:border-white/10 rounded-xl text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-brand-500 outline-none"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-bold text-slate-600 dark:text-surface-300">Overlap</label>
                                    <input 
                                        type="number" 
                                        name="chunkOverlap"
                                        value={formData.chunkOverlap}
                                        onChange={handleChange}
                                        className="w-full p-3 bg-slate-100 dark:bg-surface-950 border border-slate-200 dark:border-white/10 rounded-xl text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-brand-500 outline-none"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-bold text-slate-600 dark:text-surface-300">Min Confidence</label>
                                    <input 
                                        type="number" 
                                        step="0.05"
                                        name="minConfidence"
                                        value={formData.minConfidence}
                                        onChange={handleChange}
                                        className="w-full p-3 bg-slate-100 dark:bg-surface-950 border border-slate-200 dark:border-white/10 rounded-xl text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-brand-500 outline-none"
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-5 bg-slate-50 dark:bg-white/5 border-t border-slate-200 dark:border-white/5 flex justify-end gap-3 backdrop-blur-md">
                    <button 
                        onClick={onClose}
                        className="px-6 py-2.5 bg-transparent border border-slate-300 dark:border-white/10 text-slate-600 dark:text-surface-300 font-bold rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                    >
                        انصراف
                    </button>
                    <button 
                        onClick={handleSave}
                        className="px-6 py-2.5 bg-brand-600 text-white font-bold rounded-xl hover:bg-brand-500 transition-all shadow-lg shadow-brand-500/30 active:scale-95 flex items-center gap-2"
                    >
                        <Save className="w-4 h-4" />
                        ذخیره تغییرات
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
