
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Play, Award, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Clock, FileText, BarChart2, Download, Trash2, History, Upload, FileType, Database, ThumbsUp, ThumbsDown, ShieldCheck, Target, Ticket, MessageSquare } from 'lucide-react';
import { BenchmarkResult, KnowledgeChunk, BenchmarkRun, BenchmarkCase, FineTuningRecord } from '../types';
import { BENCHMARK_DATASET } from '../services/benchmarkData';
import { runBenchmark, saveBenchmarkRun, loadBenchmarkHistory, deleteBenchmarkRun, parseBenchmarkDocx, parseTicketCSV, saveFineTuningRecord, getSettings } from '../services/mockBackend';
import { toPersianDigits } from '../services/textProcessor';

interface BenchmarkModalProps {
  isOpen: boolean;
  onClose: () => void;
  chunks: KnowledgeChunk[];
}

const BenchmarkModal: React.FC<BenchmarkModalProps> = ({ isOpen, onClose, chunks }) => {
  const [activeTab, setActiveTab] = useState<'run' | 'history'>('run');
  const [datasetMode, setDatasetMode] = useState<'standard' | 'custom' | 'ticket'>('standard');
  const [customDataset, setCustomDataset] = useState<BenchmarkCase[]>([]);
  const [ticketDataset, setTicketDataset] = useState<BenchmarkCase[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [history, setHistory] = useState<BenchmarkRun[]>([]);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [selectedHistoryRun, setSelectedHistoryRun] = useState<BenchmarkRun | null>(null);
  const [feedbackMap, setFeedbackMap] = useState<Record<string, number>>({}); 
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ticketInputRef = useRef<HTMLInputElement>(null);

  const activeDataset = datasetMode === 'standard' ? BENCHMARK_DATASET : (datasetMode === 'ticket' ? ticketDataset : customDataset);
  const totalCases = activeDataset.length;

  const stats = useMemo(() => {
      if (results.length === 0) return { avgScore: 0, passRate: 0, avgTime: 0, avgFaithfulness: 0, avgRelevance: 0 };
      const avgScore = results.reduce((acc, r) => acc + (isNaN(r.similarityScore) ? 0 : r.similarityScore), 0) / results.length;
      const avgFaithfulness = results.reduce((acc, r) => acc + (r.faithfulnessScore || 0), 0) / results.length;
      const avgRelevance = results.reduce((acc, r) => acc + (r.relevanceScore || 0), 0) / results.length;
      
      // Pass rate now depends on composite score
      const passRate = (results.filter(r => r.similarityScore > 0.70).length / results.length) * 100;
      const avgTime = results.reduce((acc, r) => acc + r.timeTakenMs, 0) / results.length;
      return { avgScore, passRate, avgTime, avgFaithfulness, avgRelevance };
  }, [results]);

  useEffect(() => {
      if (isOpen) {
          loadHistory();
      } else {
          // Cleanup on close
          if (!isRunning) {
              setResults([]);
              setProgress(0);
              setSelectedHistoryRun(null);
          }
      }
  }, [isOpen]);

  const loadHistory = async () => {
      try {
          const pastRuns = await loadBenchmarkHistory();
          setHistory(pastRuns);
      } catch (e) {
          console.error("Failed to load benchmark history", e);
      }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
          const file = e.target.files[0];
          if (!file.name.endsWith('.docx')) {
              alert('لطفاً فقط فایل Word (.docx) بارگذاری کنید.');
              return;
          }

          try {
              const cases = await parseBenchmarkDocx(file);
              if (cases.length === 0) {
                  alert('هیچ سوالی یافت نشد. لطفاً از وجود جدول (سوال | جواب | دسته) در فایل اطمینان حاصل کنید.');
                  return;
              }
              setCustomDataset(cases);
              alert(`${cases.length} تست با موفقیت بارگذاری شد.`);
          } catch (error) {
              console.error(error);
              alert('خطا در پردازش فایل.');
          }
      }
  };

  const handleTicketUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
          const file = e.target.files[0];
          // Accept csv for now as specified
          if (!file.name.toLowerCase().endsWith('.csv')) {
              alert('لطفاً فایل خروجی تیکت‌ها را با فرمت CSV بارگذاری کنید.');
              return;
          }

          try {
              const cases = await parseTicketCSV(file);
              if (cases.length === 0) {
                  alert('هیچ تیکت معتبری یافت نشد. لطفاً ساختار فایل (TicketNum, Body) را بررسی کنید.');
                  return;
              }
              setTicketDataset(cases);
              alert(`${cases.length} تیکت جهت ارزیابی استخراج شد.`);
          } catch (error: any) {
              console.error(error);
              alert(`خطا در پردازش فایل تیکت: ${error.message}`);
          }
      }
  };

  const handleStart = async () => {
      if (chunks.length === 0) {
          alert("لطفاً ابتدا مستندات را بارگذاری کنید.");
          return;
      }
      
      setIsRunning(true);
      setResults([]);
      setFeedbackMap({});
      setProgress(0);
      setSelectedHistoryRun(null);

      const currentRunResults: BenchmarkResult[] = [];

      await runBenchmark(activeDataset, chunks, (current, total, result) => {
          setProgress(current);
          setResults(prev => [...prev, result]);
          currentRunResults.push(result);
      });

      // Calculate stats
      const validResults = currentRunResults.map(r => ({...r, similarityScore: isNaN(r.similarityScore) ? 0 : r.similarityScore}));
      const avgScore = validResults.reduce((acc, r) => acc + r.similarityScore, 0) / validResults.length;
      const avgFaith = validResults.reduce((acc, r) => acc + (r.faithfulnessScore || 0), 0) / validResults.length;
      const avgRel = validResults.reduce((acc, r) => acc + (r.relevanceScore || 0), 0) / validResults.length;
      const passRate = (validResults.filter(r => r.similarityScore > 0.70).length / validResults.length) * 100;
      const avgTime = validResults.reduce((acc, r) => acc + r.timeTakenMs, 0) / validResults.length;

      const newRun: BenchmarkRun = {
          id: `run-${Date.now()}`,
          timestamp: Date.now(),
          totalCases: validResults.length,
          avgScore,
          avgFaithfulness: avgFaith,
          avgRelevance: avgRel,
          passRate,
          avgTime,
          results: validResults,
          createdAt: Date.now(),
          updatedAt: Date.now()
      };

      await saveBenchmarkRun(newRun);
      await loadHistory();
      setIsRunning(false);
  };

  const handleDeleteRun = async (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      if (confirm('آیا از حذف این گزارش مطمئن هستید؟')) {
          await deleteBenchmarkRun(id);
          await loadHistory();
          if (selectedHistoryRun?.id === id) setSelectedHistoryRun(null);
      }
  };

  const handleFeedback = async (res: BenchmarkResult, score: number) => {
      const feedbackKey = `${res.caseId}`;
      if (feedbackMap[feedbackKey] === score) return;
      setFeedbackMap(prev => ({ ...prev, [feedbackKey]: score }));

      const record: FineTuningRecord = {
          id: `ft-bench-${Date.now()}`,
          prompt: res.question,
          response: res.generatedAnswer,
          context: res.retrievedSources.map(s => s.snippet).join('\n---\n'),
          score: score,
          sourceIds: res.retrievedSources.map(s => s.id),
          model: getSettings().chatModel,
          createdAt: Date.now(),
          updatedAt: Date.now()
      };

      await saveFineTuningRecord(record);
  };

  const handleDownloadReport = (run: BenchmarkRun) => {
      const report = {
          title: "Rayan Ham-Afza Benchmark Report",
          date: new Date(run.timestamp).toLocaleString('fa-IR'),
          metrics: {
              overallScore: (run.avgScore * 100).toFixed(1) + "%",
              faithfulness: run.avgFaithfulness ? (run.avgFaithfulness * 100).toFixed(1) + "%" : "N/A",
              relevance: run.avgRelevance ? (run.avgRelevance * 100).toFixed(1) + "%" : "N/A",
              passRate: run.passRate.toFixed(1) + "%",
          },
          detailedResults: run.results
      };

      const jsonString = JSON.stringify(report, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `benchmark_ragas_report_${new Date(run.timestamp).toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  // Helper to render stats for current run OR selected history run
  const renderStats = (data: { avgScore: number, avgFaithfulness?: number, avgRelevance?: number, passRate: number, avgTime: number }) => (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center items-center">
            <div className={`p-2 rounded-full mb-1 ${data.avgScore > 0.8 ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-600'}`}>
                <Award className="w-5 h-5" />
            </div>
            <span className="text-xl font-bold text-slate-800">{toPersianDigits((data.avgScore * 100).toFixed(0))}٪</span>
            <span className="text-[10px] text-slate-500">امتیاز کل (Composite)</span>
        </div>
        
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center items-center">
            <div className="p-2 rounded-full mb-1 bg-emerald-100 text-emerald-600">
                <ShieldCheck className="w-5 h-5" />
            </div>
            <span className="text-xl font-bold text-slate-800">{toPersianDigits(((data.avgFaithfulness || 0) * 100).toFixed(0))}٪</span>
            <span className="text-[10px] text-slate-500">وفاداری (Faithfulness)</span>
        </div>

        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center items-center">
            <div className="p-2 rounded-full mb-1 bg-blue-100 text-blue-600">
                <Target className="w-5 h-5" />
            </div>
            <span className="text-xl font-bold text-slate-800">{toPersianDigits(((data.avgRelevance || 0) * 100).toFixed(0))}٪</span>
            <span className="text-[10px] text-slate-500">ارتباط (Relevance)</span>
        </div>

        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center items-center">
            <div className="p-2 rounded-full mb-1 bg-amber-100 text-amber-600">
                <CheckCircle2 className="w-5 h-5" />
            </div>
            <span className="text-xl font-bold text-slate-800">{toPersianDigits(data.passRate.toFixed(0))}٪</span>
            <span className="text-[10px] text-slate-500">نرخ قبولی</span>
        </div>

        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center items-center">
            <div className="p-2 rounded-full mb-1 bg-slate-100 text-slate-600">
                <Clock className="w-5 h-5" />
            </div>
            <span className="text-xl font-bold text-slate-800">{toPersianDigits((data.avgTime / 1000).toFixed(1))}s</span>
            <span className="text-[10px] text-slate-500">زمان پاسخ</span>
        </div>
      </div>
  );

  const renderResultsList = (list: BenchmarkResult[]) => (
      <div className="space-y-3">
        {list.map((res) => {
            const safeScore = isNaN(res.similarityScore) ? 0 : res.similarityScore;
            const scoreColor = safeScore > 0.85 ? 'text-emerald-600 bg-emerald-50 border-emerald-200' 
                : safeScore > 0.60 ? 'text-amber-600 bg-amber-50 border-amber-200' 
                : 'text-red-600 bg-red-50 border-red-200';
            const isExpanded = expandedRow === res.caseId;
            const currentFeedback = feedbackMap[`${res.caseId}`];

            return (
                <div key={res.caseId} className="bg-white border border-slate-200 rounded-xl overflow-hidden transition-all">
                    <button 
                        onClick={() => setExpandedRow(isExpanded ? null : (res.caseId as number))}
                        className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
                    >
                        <div className="flex items-center gap-4 text-right overflow-hidden">
                            <span className={`text-xs font-bold px-2 py-1 rounded border min-w-[3rem] text-center ${scoreColor}`}>
                                {toPersianDigits((safeScore * 100).toFixed(0))}٪
                            </span>
                            <span className="text-sm font-medium text-slate-700 truncate">{res.question.split('\n').pop() || res.question}</span>
                        </div>
                        <div className="flex items-center gap-4">
                            {/* Mini RAGAS Indicators */}
                            <div className="hidden md:flex gap-2">
                                <div className="flex items-center gap-1 text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                    <ShieldCheck className="w-3 h-3 text-emerald-500" />
                                    <span>{toPersianDigits(((res.faithfulnessScore || 0) * 100).toFixed(0))}٪</span>
                                </div>
                                <div className="flex items-center gap-1 text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                    <Target className="w-3 h-3 text-blue-500" />
                                    <span>{toPersianDigits(((res.relevanceScore || 0) * 100).toFixed(0))}٪</span>
                                </div>
                            </div>
                            {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                        </div>
                    </button>
                    
                    {isExpanded && (
                        <div className="p-4 bg-slate-50 border-t border-slate-100 space-y-4 text-sm animate-in slide-in-from-top-2">
                            {/* Full Question if it was truncated */}
                            <div className="bg-slate-100 p-2 rounded text-xs text-slate-700 whitespace-pre-wrap">
                                <strong>سوال کامل:</strong> {res.question}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                                    <h4 className="text-xs font-bold text-emerald-600 mb-2 flex items-center gap-1">
                                        <CheckCircle2 className="w-3 h-3" /> پاسخ مرجع (Ground Truth)
                                    </h4>
                                    <p className="text-slate-600 leading-6 text-xs text-justify whitespace-pre-wrap">{res.groundTruth}</p>
                                </div>
                                <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm flex flex-col">
                                    <div>
                                        <h4 className="text-xs font-bold text-blue-600 mb-2 flex items-center gap-1">
                                            <FileText className="w-3 h-3" /> پاسخ هوش مصنوعی
                                        </h4>
                                        <p className="text-slate-600 leading-6 text-xs text-justify">{res.generatedAnswer}</p>
                                    </div>
                                    
                                    {/* RAGAS Breakdown */}
                                    <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2">
                                        <div className="bg-emerald-50 p-2 rounded text-xs text-emerald-800 flex justify-between">
                                            <span>وفاداری به متن:</span>
                                            <span className="font-bold">{toPersianDigits(((res.faithfulnessScore || 0) * 100).toFixed(0))}٪</span>
                                        </div>
                                        <div className="bg-blue-50 p-2 rounded text-xs text-blue-800 flex justify-between">
                                            <span>ارتباط با سوال:</span>
                                            <span className="font-bold">{toPersianDigits(((res.relevanceScore || 0) * 100).toFixed(0))}٪</span>
                                        </div>
                                    </div>

                                    {/* Feedback Buttons */}
                                    <div className="mt-3 flex items-center justify-end gap-2">
                                        <span className="text-[10px] text-slate-400 ml-1">بازخورد دستی:</span>
                                        <button 
                                            onClick={() => handleFeedback(res, 1)}
                                            className={`p-1.5 rounded-lg transition-all ${currentFeedback === 1 ? 'bg-emerald-100 text-emerald-600' : 'hover:bg-slate-100 text-slate-400'}`}
                                        >
                                            <ThumbsUp className="w-3.5 h-3.5" />
                                        </button>
                                        <button 
                                            onClick={() => handleFeedback(res, -1)}
                                            className={`p-1.5 rounded-lg transition-all ${currentFeedback === -1 ? 'bg-red-100 text-red-600' : 'hover:bg-slate-100 text-slate-400'}`}
                                        >
                                            <ThumbsDown className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Sources Used */}
                            {res.retrievedSources.length > 0 ? (
                                <div>
                                    <span className="text-[10px] font-bold text-slate-500 mb-1 block">منابع استفاده شده:</span>
                                    <div className="flex flex-wrap gap-2">
                                        {res.retrievedSources.map((src, i) => (
                                            <span key={i} className="text-[10px] bg-slate-200 text-slate-600 px-2 py-1 rounded truncate max-w-[200px]" title={src.snippet}>
                                                {src.id} (ص {toPersianDigits(src.page)})
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 text-red-500 text-xs bg-red-50 p-2 rounded">
                                    <AlertTriangle className="w-3 h-3" />
                                    هیچ منبعی یافت نشد (ریسک توهم بالا)
                                </div>
                            )}
                        </div>
                    )}
                </div>
            );
        })}
      </div>
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 font-sans" dir="rtl">
      <div className="bg-white rounded-2xl w-full max-w-6xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-lg text-white shadow-lg shadow-indigo-500/30">
              <Award className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">سیستم ارزیابی خودکار (RAGAS Benchmark)</h2>
              <p className="text-xs text-slate-500 mt-1">سنجش وفاداری و دقت پاسخ‌ها با استفاده از هوش مصنوعی</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex px-6 border-b border-slate-100 bg-slate-50">
            <button 
                onClick={() => setActiveTab('run')}
                className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'run' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
                اجرای تست جدید
            </button>
            <button 
                onClick={() => setActiveTab('history')}
                className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'history' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
                تاریخچه و گزارشات
            </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 custom-scrollbar">
            
            {/* --- RUN TAB --- */}
            {activeTab === 'run' && (
                <>
                    {/* Control Panel */}
                    {!isRunning && results.length === 0 && (
                        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm mb-6">
                            
                            {/* Dataset Selection */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                <button 
                                    onClick={() => setDatasetMode('standard')}
                                    className={`p-4 rounded-xl border flex flex-col items-center gap-2 transition-all ${datasetMode === 'standard' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'}`}
                                >
                                    <Database className="w-6 h-6" />
                                    <span className="font-bold text-sm">دیتاست استاندارد</span>
                                    <span className="text-xs opacity-70">{toPersianDigits(30)} تست پیش‌فرض سیستمی</span>
                                </button>
                                <button 
                                    onClick={() => setDatasetMode('custom')}
                                    className={`p-4 rounded-xl border flex flex-col items-center gap-2 transition-all ${datasetMode === 'custom' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'}`}
                                >
                                    <FileType className="w-6 h-6" />
                                    <span className="font-bold text-sm">بنچمارک سفارشی</span>
                                    <span className="text-xs opacity-70">آپلود فایل Word سوال و جواب</span>
                                </button>
                                <button 
                                    onClick={() => setDatasetMode('ticket')}
                                    className={`p-4 rounded-xl border flex flex-col items-center gap-2 transition-all ${datasetMode === 'ticket' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'}`}
                                >
                                    <Ticket className="w-6 h-6" />
                                    <span className="font-bold text-sm">بنچمارک تیکت‌ها</span>
                                    <span className="text-xs opacity-70">آپلود خروجی اکسل (CSV)</span>
                                </button>
                            </div>

                            {/* Custom File Upload */}
                            {datasetMode === 'custom' && (
                                <div className="mb-6 animate-in fade-in slide-in-from-top-2">
                                    <input 
                                        type="file" 
                                        ref={fileInputRef}
                                        onChange={handleFileUpload}
                                        accept=".docx"
                                        className="hidden"
                                    />
                                    <button 
                                        onClick={() => fileInputRef.current?.click()}
                                        className="w-full border-2 border-dashed border-slate-300 rounded-lg p-6 flex flex-col items-center justify-center gap-2 text-slate-500 hover:border-indigo-400 hover:text-indigo-500 hover:bg-indigo-50/50 transition-all"
                                    >
                                        <Upload className="w-8 h-8" />
                                        {customDataset.length > 0 ? (
                                            <span className="font-bold text-emerald-600 flex items-center gap-2">
                                                <CheckCircle2 className="w-4 h-4" />
                                                {toPersianDigits(customDataset.length)} تست بارگذاری شد
                                            </span>
                                        ) : (
                                            <span>کلیک برای آپلود فایل Word (.docx)</span>
                                        )}
                                        <span className="text-[10px] opacity-60">ساختار فایل: جدول ۳ ستونی (دسته | جواب | سوال)</span>
                                    </button>
                                </div>
                            )}

                            {/* Ticket CSV Upload */}
                            {datasetMode === 'ticket' && (
                                <div className="mb-6 animate-in fade-in slide-in-from-top-2">
                                    <input 
                                        type="file" 
                                        ref={ticketInputRef}
                                        onChange={handleTicketUpload}
                                        accept=".csv"
                                        className="hidden"
                                    />
                                    <button 
                                        onClick={() => ticketInputRef.current?.click()}
                                        className="w-full border-2 border-dashed border-slate-300 rounded-lg p-6 flex flex-col items-center justify-center gap-2 text-slate-500 hover:border-indigo-400 hover:text-indigo-500 hover:bg-indigo-50/50 transition-all"
                                    >
                                        <MessageSquare className="w-8 h-8" />
                                        {ticketDataset.length > 0 ? (
                                            <span className="font-bold text-emerald-600 flex items-center gap-2">
                                                <CheckCircle2 className="w-4 h-4" />
                                                {toPersianDigits(ticketDataset.length)} تیکت شناسایی شد
                                            </span>
                                        ) : (
                                            <span>کلیک برای آپلود فایل خروجی تیکت (.csv)</span>
                                        )}
                                        <span className="text-[10px] opacity-60">ساختار: خروجی استاندارد شامل TicketNum و Body</span>
                                    </button>
                                </div>
                            )}

                            <div className="flex justify-center">
                                <button 
                                    onClick={handleStart}
                                    disabled={(datasetMode === 'custom' && customDataset.length === 0) || (datasetMode === 'ticket' && ticketDataset.length === 0)}
                                    className={`bg-indigo-600 text-white px-8 py-3 rounded-full font-bold shadow-lg shadow-indigo-500/30 transition-all transform hover:scale-105 flex items-center gap-2 ${
                                        (datasetMode === 'custom' && customDataset.length === 0) || (datasetMode === 'ticket' && ticketDataset.length === 0) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-indigo-700'
                                    }`}
                                >
                                    <Play className="w-5 h-5" />
                                    شروع ارزیابی خودکار
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Progress Bar */}
                    {isRunning && (
                        <div className="mb-8">
                            <div className="flex justify-between text-sm font-medium text-slate-600 mb-2">
                                <span>در حال تولید پاسخ و ارزیابی RAGAS...</span>
                                <span>{toPersianDigits(progress)} از {toPersianDigits(totalCases)}</span>
                            </div>
                            <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                                <div 
                                    className="bg-indigo-600 h-full rounded-full transition-all duration-500 ease-out relative overflow-hidden"
                                    style={{ width: `${(progress / totalCases) * 100}%` }}
                                >
                                    <div className="absolute inset-0 bg-white/20 animate-[shimmer_2s_infinite]"></div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Results Summary & List for Current Run */}
                    {results.length > 0 && (
                        <>
                            {renderStats(stats)}
                            {renderResultsList(results)}
                        </>
                    )}
                </>
            )}

            {/* --- HISTORY TAB --- */}
            {activeTab === 'history' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full">
                    {/* List of Runs */}
                    <div className="md:col-span-1 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col h-full max-h-[600px]">
                        <div className="p-4 border-b border-slate-100 font-bold text-slate-700 flex items-center gap-2">
                            <History className="w-4 h-4" />
                            لیست گزارشات
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
                            {history.length === 0 ? (
                                <p className="text-center text-slate-400 text-xs py-8">هنوز تستی اجرا نشده است.</p>
                            ) : (
                                history.map(run => (
                                    <div 
                                        key={run.id}
                                        onClick={() => setSelectedHistoryRun(run)}
                                        className={`p-3 rounded-lg cursor-pointer border transition-all ${selectedHistoryRun?.id === run.id ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-transparent hover:bg-white hover:border-slate-200 hover:shadow-sm'}`}
                                    >
                                        <div className="flex justify-between items-start mb-1">
                                            <span className="font-bold text-slate-700 text-xs">
                                                {new Date(run.timestamp).toLocaleDateString('fa-IR')}
                                            </span>
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${run.avgScore > 0.8 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                                {toPersianDigits((run.avgScore * 100).toFixed(0))}٪
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center text-[10px] text-slate-500">
                                            <span>{new Date(run.timestamp).toLocaleTimeString('fa-IR', {hour: '2-digit', minute:'2-digit'})}</span>
                                            <button 
                                                onClick={(e) => handleDeleteRun(e, run.id)}
                                                className="p-1 hover:bg-red-100 hover:text-red-600 rounded text-slate-300 transition-colors"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Detailed View */}
                    <div className="md:col-span-2 flex flex-col h-full overflow-hidden">
                        {selectedHistoryRun ? (
                            <div className="flex flex-col h-full">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="font-bold text-slate-800">جزئیات گزارش</h3>
                                    <button 
                                        onClick={() => handleDownloadReport(selectedHistoryRun)}
                                        className="flex items-center gap-2 text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg transition-colors shadow-sm"
                                    >
                                        <Download className="w-4 h-4" />
                                        دانلود گزارش کامل (JSON)
                                    </button>
                                </div>
                                
                                {renderStats(selectedHistoryRun)}
                                
                                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                                    {renderResultsList(selectedHistoryRun.results)}
                                </div>
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
                                <FileText className="w-12 h-12 mb-2 opacity-50" />
                                <p className="text-sm">یک گزارش را از لیست انتخاب کنید</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

        </div>
      </div>
    </div>
  );
};

export default BenchmarkModal;
