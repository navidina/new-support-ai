
import React, { useState, useMemo, useEffect } from 'react';
import { X, ChevronRight, ChevronDown, FileText, Folder, FolderOpen, Search, Hash, Clock, Tag, Book, Layout, Share2, Printer, Sparkles, Layers, ArrowRight, Quote, ExternalLink, Zap, PenTool, RefreshCw, Clipboard, Table as TableIcon, Loader2, Download } from 'lucide-react';
import { KnowledgeChunk } from '../types';
import { generateSynthesizedDocument } from '../services/mockBackend';
import { toPersianDigits } from '../services/textProcessor';

interface KnowledgeWikiModalProps {
  isOpen: boolean;
  onClose: () => void;
  chunks: KnowledgeChunk[];
}

const categoryLabels: Record<string, string> = {
    'back_office': 'مدیریت کارگزاری (BackOffice)',
    'online_trading': 'معاملات برخط (OMS)',
    'portfolio_management': 'سبدگردانی و پورتفو',
    'funds': 'صندوق‌های سرمایه‌گذاری',
    'commodity_energy': 'بورس کالا و انرژی',
    'troubleshooting': 'مرکز عیب‌یابی و پشتیبانی',
    'operational_process': 'فرآیندهای اجرایی و عملیات',
    'technical_infrastructure': 'زیرساخت فنی و API',
    'general': 'عمومی و سایر'
};

const subCategoryLabels: Record<string, string> = {
    'basic_info': 'مدیریت اطلاعات پایه',
    'accounting': 'امور مالی و حسابداری',
    'treasury': 'خزانه‌داری',
    'securities_ops': 'عملیات اوراق',
    'exir': 'سامانه معاملاتی اکسیر',
    'recsar': 'سامانه معاملاتی رکسار',
    'rayan_mobile': 'رایان همراه',
    'pwa': 'نسخه وب‌اپلیکیشن',
    'fund_ops': 'صدور و ابطال',
    'financial_reconciliation': 'رفع مغایرت‌های مالی',
    'trading_issues': 'خطاهای سفارش‌گذاری',
    'access_issues': 'مشکلات دسترسی',
    'uncategorized': 'سایر مستندات'
};

type WikiTopic = {
    id: string;
    title: string;
    category: string;
    chunkCount: number;
    sourceCount: number;
    chunks: KnowledgeChunk[];
    topTags: string[];
};

type WikiCategory = {
    id: string;
    title: string;
    topics: WikiTopic[];
};

const RichDocumentRenderer: React.FC<{ content: string }> = ({ content }) => {
    const renderInline = (text: string) => {
        const parts = text.split(/(\*\*.*?\*\*|`.*?`|\[SourceID:.*?\])/g);
        return parts.map((part, index) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={index} className="font-bold text-slate-900">{part.slice(2, -2)}</strong>;
            }
            if (part.startsWith('`') && part.endsWith('`')) {
                return <code key={index} className="bg-slate-100 text-pink-600 px-1.5 py-0.5 rounded text-xs font-mono border border-slate-200 mx-1">{part.slice(1, -1)}</code>;
            }
            // Citation Highlighting
            if (part.startsWith('[SourceID:') && part.endsWith(']')) {
                return <sup key={index} className="text-[10px] text-blue-600 bg-blue-50 px-1 rounded ml-1 cursor-help" title={part}>{part.replace('SourceID:', 'Ref:')}</sup>;
            }
            return part;
        });
    };

    const blocks = content.split(/\n\n+/);

    return (
        <div className="space-y-6 text-slate-700 leading-8 text-justify font-sans">
            {blocks.map((block, i) => {
                const trimBlock = block.trim();
                if (!trimBlock) return null;

                if (trimBlock.startsWith('# ')) {
                    return <h1 key={i} className="text-3xl font-black text-slate-900 mt-8 mb-6 border-b-2 border-indigo-600 pb-3">{trimBlock.replace('# ', '')}</h1>;
                }
                if (trimBlock.startsWith('## ')) {
                    return <h2 key={i} className="text-2xl font-bold text-indigo-800 mt-10 mb-4 flex items-center gap-3 bg-indigo-50/50 p-2 rounded-r-lg border-r-4 border-indigo-500">
                        {trimBlock.replace('## ', '')}
                    </h2>;
                }
                if (trimBlock.startsWith('### ')) {
                    return <h3 key={i} className="text-xl font-bold text-slate-800 mt-6 mb-2 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full"></span>
                        {trimBlock.replace('### ', '')}
                    </h3>;
                }
                if (trimBlock.startsWith('>')) {
                    const cleanText = trimBlock.replace(/^>\s?/gm, '');
                    return (
                        <div key={i} className="my-6 bg-amber-50 border-r-4 border-amber-400 p-4 rounded-l-lg shadow-sm">
                            <div className="flex gap-3">
                                <Quote className="w-6 h-6 text-amber-400 flex-shrink-0" />
                                <div className="text-amber-900 text-sm font-medium italic">
                                    {renderInline(cleanText.replace(/\n/g, ' '))}
                                </div>
                            </div>
                        </div>
                    );
                }
                // Detect Metadata Table (Starts with | and typically contains 'شناسنامه' or specific headers)
                if (trimBlock.startsWith('|')) {
                    const rows = trimBlock.split('\n').filter(r => r.trim().startsWith('|'));
                    if (rows.length < 2) return <p key={i}>{renderInline(trimBlock)}</p>;
                    const headers = rows[0].split('|').filter(c => c.trim()).map(c => c.trim());
                    const dataRows = rows.slice(2).map(r => r.split('|').filter(c => c.trim()).map(c => c.trim()));
                    
                    // Special styling for Metadata tables (usually 2 columns)
                    const isMetadata = headers.some(h => h.includes('ویژگی') || h.includes('مقدار') || h.includes('آیتم'));

                    return (
                        <div key={i} className={`my-6 overflow-hidden rounded-xl border border-slate-200 shadow-sm ${isMetadata ? 'max-w-lg mx-auto' : 'w-full'}`}>
                            {isMetadata && <div className="bg-slate-100 px-4 py-2 text-xs font-bold text-slate-500 border-b border-slate-200 text-center">شناسنامه سند</div>}
                            <table className="w-full text-sm text-right">
                                <thead className={`${isMetadata ? 'hidden' : 'bg-slate-50 text-slate-700'}`}>
                                    <tr>
                                        {headers.map((h, hi) => (
                                            <th key={hi} className="px-4 py-3 font-bold border-b border-slate-200 whitespace-nowrap">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 bg-white">
                                    {dataRows.map((row, ri) => (
                                        <tr key={ri} className="hover:bg-slate-50 transition-colors">
                                            {row.map((cell, ci) => (
                                                <td key={ci} className={`px-4 py-3 text-slate-600 ${isMetadata && ci === 0 ? 'bg-slate-50 font-bold text-slate-700 w-1/3' : ''}`}>
                                                    {renderInline(cell)}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    );
                }
                if (trimBlock.match(/^[-*]\s/) || trimBlock.match(/^\d+\.\s/)) {
                    const items = trimBlock.split('\n');
                    const isOrdered = items[0].match(/^\d+\.\s/);
                    const ListTag = isOrdered ? 'ol' : 'ul';
                    return (
                        <ListTag key={i} className={`my-4 pr-5 space-y-2 ${isOrdered ? 'list-decimal' : 'list-disc'} marker:text-indigo-500`}>
                            {items.map((item, ii) => {
                                const cleanItem = item.replace(/^[-*]\s/, '').replace(/^\d+\.\s/, '');
                                return <li key={ii} className="pl-2">{renderInline(cleanItem)}</li>;
                            })}
                        </ListTag>
                    );
                }
                if (trimBlock === '---') {
                    return <hr key={i} className="my-8 border-t-2 border-slate-100" />;
                }
                return <p key={i} className="mb-4">{renderInline(trimBlock)}</p>;
            })}
        </div>
    );
};

const KnowledgeWikiModal: React.FC<KnowledgeWikiModalProps> = ({ isOpen, onClose, chunks }) => {
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  
  // Generation State
  const [viewMode, setViewMode] = useState<'raw' | 'ai'>('raw');
  const [aiDocContent, setAiDocContent] = useState<Record<string, string>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{current: number, total: number, phase: string} | null>(null);

  // --- RECONSTRUCTION ENGINE ---
  const wikiStructure = useMemo(() => {
      const categoriesMap = new Map<string, WikiCategory>();
      chunks.forEach(chunk => {
          const catKey = chunk.metadata?.category || 'general';
          const subKey = chunk.metadata?.subCategory || 'uncategorized';
          if (!categoriesMap.has(catKey)) {
              categoriesMap.set(catKey, {
                  id: catKey,
                  title: categoryLabels[catKey] || catKey,
                  topics: []
              });
          }
          const category = categoriesMap.get(catKey)!;
          let topic = category.topics.find(t => t.id === subKey);
          if (!topic) {
              topic = {
                  id: subKey,
                  title: subCategoryLabels[subKey] || subKey,
                  category: catKey,
                  chunkCount: 0,
                  sourceCount: 0,
                  chunks: [],
                  topTags: []
              };
              category.topics.push(topic);
          }
          topic.chunks.push(chunk);
          topic.chunkCount++;
      });
      categoriesMap.forEach(cat => {
          cat.topics.forEach(topic => {
              const sources = new Set(topic.chunks.map(c => c.source.id));
              topic.sourceCount = sources.size;
              topic.chunks.sort((a, b) => {
                  if (a.source.id !== b.source.id) return a.source.id.localeCompare(b.source.id);
                  return (a.source.page || 0) - (b.source.page || 0);
              });
          });
      });
      return Array.from(categoriesMap.values());
  }, [chunks]);

  const filteredStructure = useMemo(() => {
      if (!searchTerm) return wikiStructure;
      const lowerSearch = searchTerm.toLowerCase();
      return wikiStructure.map(cat => {
          const matchingTopics = cat.topics.filter(topic => 
              topic.title.toLowerCase().includes(lowerSearch) || 
              topic.chunks.some(c => c.content.toLowerCase().includes(lowerSearch))
          );
          if (matchingTopics.length > 0) return { ...cat, topics: matchingTopics };
          return null;
      }).filter(Boolean) as WikiCategory[];
  }, [wikiStructure, searchTerm]);

  useEffect(() => {
      if (searchTerm) {
          const allCatIds = new Set(filteredStructure.map(c => c.id));
          setExpandedCategories(allCatIds);
      }
  }, [searchTerm, filteredStructure]);

  const toggleCategory = (id: string) => {
      const newSet = new Set(expandedCategories);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      setExpandedCategories(newSet);
  };

  const handleGenerateDoc = async () => {
      if (!activeTopic || isGenerating) return;
      setIsGenerating(true);
      setGenerationProgress({ current: 0, total: 0, phase: 'شروع' });
      
      try {
          // IMPORTANT: Pass the full chunks array, not just text, so we have source info
          const generatedDoc = await generateSynthesizedDocument(
              activeTopic.title, 
              activeTopic.chunks, 
              (curr, total, phase) => {
                  setGenerationProgress({ current: curr, total: total, phase });
              }
          );
          
          setAiDocContent(prev => ({ ...prev, [activeTopic.id]: generatedDoc }));
      } catch (error) {
          console.error(error);
          alert('خطا در تولید سند: ارتباط با هوش مصنوعی برقرار نشد.');
      } finally {
          setIsGenerating(false);
          setGenerationProgress(null);
      }
  };

  const handleDownload = () => {
      if (!activeTopic || !aiDocContent[activeTopic.id]) return;
      
      const docTitle = activeTopic.title.replace(/\s+/g, '_');
      const text = aiDocContent[activeTopic.id];
      const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `SmartDoc_${docTitle}_${new Date().toISOString().slice(0,10)}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  const activeTopic = useMemo(() => {
      for (const cat of wikiStructure) {
          const t = cat.topics.find(top => top.id === selectedTopicId);
          if (t) return t;
      }
      return null;
  }, [wikiStructure, selectedTopicId]);

  useEffect(() => { setViewMode('raw'); }, [selectedTopicId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 font-sans animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl w-full max-w-[95vw] h-[90vh] shadow-2xl flex overflow-hidden border border-slate-200" dir="rtl">
        
        {/* SIDEBAR */}
        <div className="w-80 bg-slate-50 border-l border-slate-200 flex flex-col shrink-0">
            <div className="p-5 border-b border-slate-200 bg-white">
                <div className="flex items-center gap-3 text-slate-800 font-bold mb-4">
                    <div className="bg-blue-600 p-2 rounded-lg text-white shadow-lg shadow-blue-500/20">
                        <Book className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-base">مخزن دانش سازمانی</h3>
                        <p className="text-[10px] text-slate-500 font-normal mt-0.5">بازسازی شده توسط هوش مصنوعی</p>
                    </div>
                </div>
                <div className="relative group">
                    <input 
                        type="text" 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="جستجو در مفاهیم..."
                        className="w-full bg-slate-100 border-none rounded-xl pl-3 pr-10 py-2.5 text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all shadow-inner text-slate-700 font-medium"
                    />
                    <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-3 custom-scrollbar space-y-1">
                {filteredStructure.map(cat => {
                    const isExpanded = expandedCategories.has(cat.id) || !!searchTerm;
                    return (
                        <div key={cat.id} className="mb-1">
                            <button
                                onClick={() => toggleCategory(cat.id)}
                                className={`w-full flex items-center justify-between px-3 py-2.5 text-xs font-bold rounded-lg transition-colors ${isExpanded ? 'bg-slate-200/50 text-slate-800' : 'text-slate-600 hover:bg-slate-100'}`}
                            >
                                <div className="flex items-center gap-2">
                                    {isExpanded ? <FolderOpen className="w-4 h-4 text-blue-500" /> : <Folder className="w-4 h-4 text-slate-400" />}
                                    <span>{cat.title}</span>
                                </div>
                                <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                            </button>
                            
                            {isExpanded && (
                                <div className="pr-3 pl-1 mt-1 space-y-0.5 border-r-2 border-slate-200 mr-2.5 animate-in slide-in-from-top-1 duration-200">
                                    {cat.topics.map(topic => (
                                        <button
                                            key={topic.id}
                                            onClick={() => setSelectedTopicId(topic.id)}
                                            className={`w-full flex items-center gap-2 px-3 py-2.5 text-xs rounded-lg transition-all text-right ${
                                                selectedTopicId === topic.id 
                                                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 font-medium' 
                                                : 'text-slate-600 hover:bg-white hover:shadow-sm'
                                            }`}
                                        >
                                            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${selectedTopicId === topic.id ? 'bg-white' : 'bg-slate-300'}`} />
                                            <span className="truncate">{topic.title}</span>
                                            {topic.chunkCount > 0 && (
                                                <span className={`mr-auto text-[9px] px-1.5 py-0.5 rounded-full ${selectedTopicId === topic.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                                    {toPersianDigits(topic.chunkCount)}
                                                </span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>

        {/* MAIN CONTENT */}
        <div className="flex-1 flex flex-col bg-slate-50 min-w-0">
            {/* Toolbar */}
            <div className="h-16 border-b border-slate-200 flex items-center justify-between px-6 bg-white shrink-0">
                <div className="flex items-center gap-2 overflow-hidden">
                    {activeTopic ? (
                        <>
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                <span>مخزن دانش</span>
                                <ChevronRight className="w-3 h-3 text-slate-300" />
                                <span>{categoryLabels[activeTopic.category]}</span>
                            </div>
                            <div className="w-px h-4 bg-slate-300 mx-2"></div>
                            <h2 className="font-bold text-slate-800 text-sm truncate">{activeTopic.title}</h2>
                        </>
                    ) : (
                        <div className="flex items-center gap-2 text-slate-400 text-sm">
                            <Sparkles className="w-4 h-4" />
                            <span>لطفاً یک موضوع را انتخاب کنید</span>
                        </div>
                    )}
                </div>
                
                <div className="flex items-center gap-2">
                    {activeTopic && (
                        <div className="flex bg-slate-100 p-1 rounded-lg mr-4 border border-slate-200">
                            <button 
                                onClick={() => setViewMode('raw')}
                                className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === 'raw' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                <Layout className="w-3 h-3" />
                                داده خام
                            </button>
                            <button 
                                onClick={() => setViewMode('ai')}
                                className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === 'ai' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-indigo-600'}`}
                            >
                                <Sparkles className="w-3 h-3" />
                                سند هوشمند
                            </button>
                        </div>
                    )}
                    <button onClick={onClose} className="p-2 hover:bg-red-50 rounded text-slate-400 hover:text-red-500 transition-colors ml-2">
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Document Canvas */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-10 relative">
                {activeTopic ? (
                    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {/* Topic Hero */}
                        <div className="text-center pb-6 border-b border-slate-200">
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-600 text-xs font-bold mb-4 border border-blue-100">
                                <Layers className="w-3 h-3" />
                                {categoryLabels[activeTopic.category]}
                            </div>
                            <h1 className="text-3xl font-extrabold text-slate-900 mb-4 leading-tight">
                                {activeTopic.title}
                            </h1>
                            <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-slate-500">
                                <div className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-slate-200 shadow-sm">
                                    <Book className="w-3 h-3 text-slate-400" />
                                    <span>{toPersianDigits(activeTopic.sourceCount)} سند</span>
                                </div>
                                <div className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-slate-200 shadow-sm">
                                    <Layout className="w-3 h-3 text-slate-400" />
                                    <span>{toPersianDigits(activeTopic.chunkCount)} قطعه</span>
                                </div>
                            </div>
                        </div>

                        {/* --- VIEW: RAW --- */}
                        {viewMode === 'raw' && (
                            <div className="space-y-8">
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800 flex gap-3">
                                    <Zap className="w-5 h-5 flex-shrink-0" />
                                    <p>این بخش شامل تمام قطعات خامی است که سیستم از فایل‌های آپلود شده استخراج کرده است. برای دیدن یک گزارش تمیز و یکپارچه، روی تب "سند هوشمند" کلیک کنید.</p>
                                </div>
                                {Array.from(new Set(activeTopic.chunks.map(c => c.source.id))).map((sourceId, idx) => {
                                    const sourceChunks = activeTopic.chunks.filter(c => c.source.id === sourceId);
                                    return (
                                        <div key={sourceId} className="relative group">
                                            <div className="flex items-center gap-3 mb-4">
                                                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200 text-slate-500 font-bold text-xs">
                                                    {toPersianDigits(idx + 1)}
                                                </div>
                                                <div className="flex-1 h-px bg-slate-200"></div>
                                                <div className="flex items-center gap-2 text-xs text-slate-400 bg-white px-3 py-1 rounded-full border border-slate-200">
                                                    <FileText className="w-3 h-3" />
                                                    <span className="truncate max-w-[200px]">{sourceId}</span>
                                                </div>
                                            </div>
                                            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                                                {sourceChunks.map((chunk, cIdx) => (
                                                    <div key={chunk.id} className={`p-6 ${cIdx !== 0 ? 'border-t border-slate-100' : ''}`}>
                                                        <p className="text-sm leading-8 text-justify text-slate-700 whitespace-pre-wrap">
                                                            {chunk.content}
                                                        </p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* --- VIEW: AI DOC --- */}
                        {viewMode === 'ai' && (
                            <div className="min-h-[400px]">
                                {aiDocContent[activeTopic.id] ? (
                                    <div className="animate-in fade-in duration-500">
                                        <div className="bg-white border border-slate-200 rounded-xl shadow-xl relative overflow-hidden print:shadow-none print:border-none">
                                            {/* Decorative Top Bar */}
                                            <div className="h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>
                                            
                                            {/* Action Bar (Overlay) */}
                                            <div className="absolute top-6 left-6 flex gap-2 print:hidden">
                                                <button 
                                                    onClick={() => {navigator.clipboard.writeText(aiDocContent[activeTopic.id]); alert('متن کپی شد');}}
                                                    className="p-2 bg-white/80 hover:bg-white text-slate-400 hover:text-indigo-600 rounded-lg border border-slate-200 shadow-sm transition-colors"
                                                    title="کپی متن"
                                                >
                                                    <Clipboard className="w-4 h-4" />
                                                </button>
                                                <button 
                                                    onClick={handleDownload}
                                                    className="p-2 bg-white/80 hover:bg-white text-slate-400 hover:text-emerald-600 rounded-lg border border-slate-200 shadow-sm transition-colors"
                                                    title="دانلود فایل Markdown"
                                                >
                                                    <Download className="w-4 h-4" />
                                                </button>
                                                <button 
                                                    onClick={handleGenerateDoc}
                                                    className="p-2 bg-white/80 hover:bg-white text-slate-400 hover:text-indigo-600 rounded-lg border border-slate-200 shadow-sm transition-colors"
                                                    title="بازنویسی مجدد"
                                                >
                                                    <RefreshCw className="w-4 h-4" />
                                                </button>
                                            </div>

                                            <div className="p-8 md:p-12">
                                                <div className="mb-10 text-center border-b pb-6">
                                                    <div className="inline-flex items-center gap-2 text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full text-xs font-bold mb-3">
                                                        <Sparkles className="w-3 h-3" />
                                                        گزارش هوشمند سیستم
                                                    </div>
                                                    <h2 className="text-2xl font-black text-slate-800">{activeTopic.title}</h2>
                                                    <p className="text-xs text-slate-500 mt-2">تدوین شده بر اساس تحلیل جامع {toPersianDigits(activeTopic.chunkCount)} قطعه اطلاعاتی</p>
                                                </div>

                                                <RichDocumentRenderer content={aiDocContent[activeTopic.id]} />
                                                
                                                <div className="mt-12 pt-6 border-t border-slate-100 flex justify-between items-center text-[10px] text-slate-400">
                                                    <span>تولید شده توسط دستیار هوشمند رایان هم‌افزا</span>
                                                    <span>{new Date().toLocaleDateString('fa-IR')}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-20 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                                        {isGenerating ? (
                                            <div className="text-center w-full max-w-md">
                                                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-lg mb-6 mx-auto relative">
                                                    <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                                                </div>
                                                <h3 className="text-lg font-bold text-slate-800 mb-2">در حال نگارش سند جامع...</h3>
                                                <p className="text-sm text-slate-500 mb-4">لطفاً صبور باشید. هوش مصنوعی در حال مطالعه و ترکیب تمام قطعات است.</p>
                                                
                                                {generationProgress && (
                                                    <div className="w-full bg-slate-200 rounded-full h-2 mb-2 overflow-hidden">
                                                        <div 
                                                            className="bg-indigo-600 h-full rounded-full transition-all duration-300 ease-out" 
                                                            style={{ width: `${(generationProgress.current / generationProgress.total) * 100}%` }}
                                                        ></div>
                                                    </div>
                                                )}
                                                {generationProgress && (
                                                    <div className="text-xs text-slate-400 flex justify-between">
                                                        <span>{generationProgress.phase}</span>
                                                        <span>{toPersianDigits(generationProgress.current)} / {toPersianDigits(generationProgress.total)}</span>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="text-center max-w-md mx-auto px-4">
                                                <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mb-6 mx-auto text-indigo-600 shadow-inner">
                                                    <PenTool className="w-8 h-8" />
                                                </div>
                                                <h3 className="text-xl font-bold text-slate-800 mb-3">تولید سند جامع هوشمند (Deep Synthesis)</h3>
                                                <p className="text-sm text-slate-600 leading-6 mb-8 text-justify">
                                                    در این حالت، سیستم تمامی {toPersianDigits(activeTopic.chunkCount)} قطعه اطلاعاتی موجود را تک‌به‌تک بررسی کرده و در یک فرآیند چندمرحله‌ای، آن‌ها را به یک کتابچه راهنمای کامل و عمیق تبدیل می‌کند. سند نهایی شامل <strong>جدول مشخصات، ارجاعات دقیق به منابع و لیست رفرنس‌ها</strong> خواهد بود.
                                                </p>
                                                <button 
                                                    onClick={handleGenerateDoc}
                                                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-indigo-500/30 transition-all transform hover:scale-105 flex items-center gap-2 mx-auto"
                                                >
                                                    <Sparkles className="w-5 h-5" />
                                                    شروع نگارش سند کامل
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400">
                        <div className="w-32 h-32 bg-slate-100 rounded-full flex items-center justify-center mb-6 opacity-50">
                            <Layout className="w-16 h-16 opacity-30" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-700 mb-2">به مخزن دانش خوش آمدید</h3>
                        <p className="text-sm max-w-md text-center opacity-70 leading-6">
                            برای مشاهده مستندات، لطفاً یکی از مفاهیم را از منوی سمت راست انتخاب کنید.
                        </p>
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default KnowledgeWikiModal;
