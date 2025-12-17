
import React, { useState, useEffect, useRef } from 'react';
import { X, Settings, Database, Server, Save, Trash2, Upload, FileText, CheckCircle2, AlertCircle, Download, Activity, Cpu } from 'lucide-react';
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

    const handleSave = () => {
        updateSettings(formData);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 font-sans animate-in fade-in duration-200" dir="rtl">
            <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
                
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50">
                    <div className="flex items-center gap-3">
                        <div className="bg-slate-800 p-2 rounded-lg text-white shadow-lg">
                            <Settings className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-800">تنظیمات و مدیریت</h2>
                            <p className="text-xs text-slate-500 mt-1">پیکربندی مدل‌ها و مدیریت دانش</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex px-6 border-b border-slate-100 bg-slate-50 gap-6">
                    <button 
                        onClick={() => setActiveTab('documents')}
                        className={`py-3 px-2 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'documents' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        <Database className="w-4 h-4" />
                        مدیریت دانش
                    </button>
                    <button 
                        onClick={() => setActiveTab('models')}
                        className={`py-3 px-2 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'models' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        <Server className="w-4 h-4" />
                        مدل‌های هوش مصنوعی
                    </button>
                     <button 
                        onClick={() => setActiveTab('advanced')}
                        className={`py-3 px-2 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'advanced' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        <Activity className="w-4 h-4" />
                        تنظیمات پیشرفته
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-white custom-scrollbar">
                    
                    {/* DOCUMENTS TAB */}
                    {activeTab === 'documents' && (
                        <div className="space-y-6 animate-in slide-in-from-right-4 fade-in">
                            {/* Upload Section */}
                            <div className="bg-slate-50 border border-slate-200 border-dashed rounded-xl p-8 text-center">
                                <input 
                                    type="file" 
                                    multiple 
                                    ref={fileInputRef} 
                                    className="hidden" 
                                    onChange={(e) => e.target.files && onFilesSelected(e.target.files)}
                                    accept=".md,.txt,.json,.csv,.xml,.js,.ts,.py,.log,.docx"
                                />
                                <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Upload className="w-8 h-8" />
                                </div>
                                <h3 className="font-bold text-slate-700 text-lg mb-2">بارگذاری مستندات جدید</h3>
                                <p className="text-sm text-slate-500 mb-6">فایل‌های متنی (Word, PDF, TXT) را انتخاب کنید</p>
                                <button 
                                    onClick={() => fileInputRef.current?.click()}
                                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-bold shadow-lg shadow-blue-500/30 transition-all"
                                >
                                    انتخاب فایل‌ها
                                </button>
                            </div>

                            {/* Stats */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4 shadow-sm">
                                    <div className="bg-emerald-100 p-3 rounded-lg text-emerald-600">
                                        <FileText className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <div className="text-2xl font-black text-slate-800">{toPersianDigits(documents.length)}</div>
                                        <div className="text-xs text-slate-500 font-bold">تعداد اسناد</div>
                                    </div>
                                </div>
                                <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4 shadow-sm">
                                    <div className="bg-violet-100 p-3 rounded-lg text-violet-600">
                                        <Database className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <div className="text-2xl font-black text-slate-800">
                                            {toPersianDigits(documents.reduce((acc, d) => acc + d.chunks, 0))}
                                        </div>
                                        <div className="text-xs text-slate-500 font-bold">تعداد قطعات (Chunks)</div>
                                    </div>
                                </div>
                                <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4 shadow-sm">
                                    <div className="bg-amber-100 p-3 rounded-lg text-amber-600">
                                        <Activity className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <div className="text-2xl font-black text-slate-800">{toPersianDigits(fineTuningCount)}</div>
                                        <div className="text-xs text-slate-500 font-bold">داده‌های آموزشی (RLHF)</div>
                                    </div>
                                </div>
                            </div>

                            {/* Documents List */}
                            <div className="border border-slate-200 rounded-xl overflow-hidden">
                                <div className="bg-slate-100 px-4 py-3 font-bold text-xs text-slate-500 border-b border-slate-200 flex justify-between">
                                    <span>نام فایل</span>
                                    <span>وضعیت</span>
                                </div>
                                <div className="max-h-60 overflow-y-auto custom-scrollbar">
                                    {documents.length === 0 ? (
                                        <div className="p-8 text-center text-slate-400 text-sm">لیست خالی است</div>
                                    ) : (
                                        documents.map((doc, i) => (
                                            <div key={i} className="px-4 py-3 border-b border-slate-100 last:border-0 flex justify-between items-center hover:bg-slate-50">
                                                <div className="flex items-center gap-3">
                                                    <FileText className="w-4 h-4 text-slate-400" />
                                                    <span className="text-sm font-medium text-slate-700 truncate max-w-[200px]" dir="ltr">{doc.name}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {doc.status === 'indexed' && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> ایندکس شده ({toPersianDigits(doc.chunks)})</span>}
                                                    {doc.status === 'processing' && <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold flex items-center gap-1"><Activity className="w-3 h-3 animate-spin" /> در حال پردازش</span>}
                                                    {doc.status === 'embedding' && <span className="text-[10px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-bold flex items-center gap-1"><Cpu className="w-3 h-3 animate-pulse" /> بردارسازی</span>}
                                                    {doc.status === 'error' && <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold flex items-center gap-1"><AlertCircle className="w-3 h-3" /> خطا</span>}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                            
                            {/* DB Actions */}
                            <div className="flex flex-wrap gap-3 pt-4 border-t border-slate-100">
                                <button onClick={onClearDB} className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-xs font-bold transition-colors">
                                    <Trash2 className="w-4 h-4" />
                                    حذف کل داده‌ها
                                </button>
                                <button onClick={onExportDB} className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg text-xs font-bold transition-colors">
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
                                    <button onClick={() => dbInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg text-xs font-bold transition-colors">
                                        <Upload className="w-4 h-4" />
                                        بازیابی (Import JSON)
                                    </button>
                                </div>
                                <div className="mr-auto">
                                    <button onClick={onExportFineTuning} disabled={fineTuningCount === 0} className="flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 rounded-lg text-xs font-bold transition-colors disabled:opacity-50">
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
                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-slate-700">Ollama API URL</label>
                                <input 
                                    type="text" 
                                    name="ollamaBaseUrl"
                                    value={formData.ollamaBaseUrl}
                                    onChange={handleChange}
                                    className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none dir-ltr font-mono transition-shadow focus:shadow-md"
                                    placeholder="http://localhost:11434"
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="block text-sm font-bold text-slate-700">Chat Model (Generation)</label>
                                    <input 
                                        type="text" 
                                        name="chatModel"
                                        value={formData.chatModel}
                                        onChange={handleChange}
                                        className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none dir-ltr font-mono transition-shadow focus:shadow-md"
                                        placeholder="aya:8b"
                                    />
                                    <p className="text-[10px] text-slate-400">مدل اصلی برای تولید پاسخ نهایی</p>
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-bold text-slate-700">Embedding Model</label>
                                    <input 
                                        type="text" 
                                        name="embeddingModel"
                                        value={formData.embeddingModel}
                                        onChange={handleChange}
                                        className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none dir-ltr font-mono transition-shadow focus:shadow-md"
                                        placeholder="nomic-embed-text"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2 pt-4 border-t border-slate-100">
                                <label className="block text-sm font-bold text-slate-700">Temperature (خلاقیت مدل)</label>
                                <div className="flex items-center gap-4">
                                    <input 
                                        type="range" 
                                        name="temperature"
                                        min="0" max="1" step="0.1"
                                        value={formData.temperature}
                                        onChange={handleChange}
                                        className="flex-1 accent-blue-600"
                                    />
                                    <span className="font-mono bg-slate-100 px-2 py-1 rounded text-sm">{toPersianDigits(formData.temperature)}</span>
                                </div>
                                <p className="text-[10px] text-slate-400">0.0 = دقیق و منطقی | 1.0 = خلاق و غیرقابل پیش‌بینی</p>
                            </div>
                        </div>
                    )}
                    
                    {/* ADVANCED TAB */}
                    {activeTab === 'advanced' && (
                        <div className="space-y-6 animate-in slide-in-from-right-4 fade-in">
                             <div className="space-y-2">
                                <label className="block text-sm font-bold text-slate-700">System Prompt</label>
                                <textarea 
                                    name="systemPrompt"
                                    value={formData.systemPrompt}
                                    onChange={handleChange}
                                    rows={6}
                                    className="w-full p-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 outline-none font-mono transition-shadow focus:shadow-md"
                                />
                                <p className="text-[10px] text-slate-400">دستورالعمل‌های سیستمی که رفتار مدل را کنترل می‌کنند.</p>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="block text-sm font-bold text-slate-700">Chunk Size</label>
                                    <input 
                                        type="number" 
                                        name="chunkSize"
                                        value={formData.chunkSize}
                                        onChange={handleChange}
                                        className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-bold text-slate-700">Child Chunk Size</label>
                                    <input 
                                        type="number" 
                                        name="childChunkSize"
                                        value={formData.childChunkSize}
                                        onChange={handleChange}
                                        className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-bold text-slate-700">Overlap</label>
                                    <input 
                                        type="number" 
                                        name="chunkOverlap"
                                        value={formData.chunkOverlap}
                                        onChange={handleChange}
                                        className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-bold text-slate-700">Min Confidence</label>
                                    <input 
                                        type="number" 
                                        step="0.05"
                                        name="minConfidence"
                                        value={formData.minConfidence}
                                        onChange={handleChange}
                                        className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                    <button 
                        onClick={onClose}
                        className="px-6 py-2 bg-white border border-slate-300 text-slate-700 font-bold rounded-lg hover:bg-slate-50 transition-colors"
                    >
                        انصراف
                    </button>
                    <button 
                        onClick={handleSave}
                        className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/30"
                    >
                        <Save className="w-4 h-4 inline-block ml-2" />
                        ذخیره تغییرات
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
