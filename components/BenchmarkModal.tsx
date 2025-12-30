
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Play, Award, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Clock, FileText, BarChart2, Download, Trash2, History, Upload, FileType, Database, ThumbsUp, ThumbsDown, ShieldCheck, Target, Ticket, MessageSquare, Zap, Settings, Gauge } from 'lucide-react';
import { BenchmarkResult, KnowledgeChunk, BenchmarkRun, BenchmarkCase, FineTuningRecord, TuningStepResult, SearchOverrides } from '../types';
import { BENCHMARK_DATASET } from '../services/benchmarkData';
import { runBenchmark, saveBenchmarkRun, loadBenchmarkHistory, deleteBenchmarkRun, parseBenchmarkDocx, parseTicketCSV, saveFineTuningRecord, getSettings, runAutoTuneBenchmark } from '../services/mockBackend';
import { toPersianDigits } from '../services/textProcessor';

interface BenchmarkModalProps {
  isOpen: boolean;
  onClose: () => void;
  chunks: KnowledgeChunk[];
}

const BenchmarkModal: React.FC<BenchmarkModalProps> = ({ isOpen, onClose, chunks }) => {
  const [activeTab, setActiveTab] = useState<'run' | 'history' | 'autotune'>('run');
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
  
  // Auto-Tuner State
  const [tuningSteps, setTuningSteps] = useState<TuningStepResult[]>([]);
  const [winnerConfig, setWinnerConfig] = useState<SearchOverrides | null>(null);
  const [activeStrategyName, setActiveStrategyName] = useState<string>('');
  
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

  const handleAutoTuneStart = async () => {
    if (chunks.length === 0) {
        alert("لطفاً ابتدا مستندات را بارگذاری کنید.");
        return;
    }
    
    setIsRunning(true);
    setTuningSteps([]);
    setWinnerConfig(null);
    setActiveStrategyName('');
    
    // Use the dataset selected by user, or fall back to standard if none selected
    // Note: The logic passes the FULL dataset as requested by the user.
    const tuningDataset = datasetMode === 'custom' && customDataset.length > 0 
        ? customDataset 
        : (datasetMode === 'ticket' && ticketDataset.length > 0 ? ticketDataset : BENCHMARK_DATASET);

    const result = await runAutoTuneBenchmark(tuningDataset, chunks, (step) => {
        setTuningSteps(prev => [...prev, step]);
        setActiveStrategyName(step.strategyName);
    });
    
    setWinnerConfig(result);
    setIsRunning(false);
    setActiveStrategyName('');
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
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6 text-white">
        <div className="bg-surface-800/50 p-3 rounded-xl border border-white/5 shadow-sm flex flex-col justify-center items-center backdrop-blur-sm">
            <div className={`p-2 rounded-full mb-1 ${data.avgScore > 0.8 ? 'bg-brand-500/20 text-brand-400' : 'bg-surface-700/50 text-surface-400'}`}>
                <Award className="w-5 h-5" />
            </div>
            <span className="text-xl font-bold">{toPersianDigits((data.avgScore * 100).toFixed(0))}٪</span>
            <span className="text-[10px] text-surface-400">امتیاز کل (Composite)</span>
        </div>
        
        <div className="bg-surface-800/50 p-3 rounded-xl border border-white/5 shadow-sm flex flex-col justify-center items-center backdrop-blur-sm">
            <div className="p-2 rounded-full mb-1 bg-emerald-500/20 text-emerald-400">
                <ShieldCheck className="w-5 h-5" />
            </div>
            <span className="text-xl font-bold">{toPersianDigits(((data.avgFaithfulness || 0) * 100).toFixed(0))}٪</span>
            <span className="text-[10px] text-surface-400">وفاداری (Faithfulness)</span>
        </div>

        <div className="bg-surface-800/50 p-3 rounded-xl border border-white/5 shadow-sm flex flex-col justify-center items-center backdrop-blur-sm">
            <div className="p-2 rounded-full mb-1 bg-blue-500/20 text-blue-400">
                <Target className="w-5 h-5" />
            </div>
            <span className="text-xl font-bold">{toPersianDigits(((data.avgRelevance || 0) * 100).toFixed(0))}٪</span>
            <span className="text-[10px] text-surface-400">ارتباط (Relevance)</span>
        </div>

        <div className="bg-surface-800/50 p-3 rounded-xl border border-white/5 shadow-sm flex flex-col justify-center items-center backdrop-blur-sm">
            <div className="p-2 rounded-full mb-1 bg-amber-500/20 text-amber-400">
                <CheckCircle2 className="w-5 h-5" />
            </div>
            <span className="text-xl font-bold">{toPersianDigits(data.passRate.toFixed(0))}٪</span>
            <span className="text-[10px] text-surface-400">نرخ قبولی</span>
        </div>

        <div className="bg-surface-800/50 p-3 rounded-xl border border-white/5 shadow-sm flex flex-col justify-center items-center backdrop-blur-sm">
            <div className="p-2 rounded-full mb-1 bg-surface-700/50 text-surface-400">
                <Clock className="w-5 h-5" />
            </div>
            <span className="text-xl font-bold">{toPersianDigits((data.avgTime / 1000).toFixed(1))}s</span>
            <span className="text-[10px] text-surface-400">زمان پاسخ</span>
        </div>
      </div>
  );

  const renderResultsList = (list: BenchmarkResult[]) => (
      <div className="space-y-3">
        {list.map((res) => {
            const safeScore = isNaN(res.similarityScore) ? 0 : res.similarityScore;
            const scoreColor = safeScore > 0.85 ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' 
                : safeScore > 0.60 ? 'text-amber-400 bg-amber-500/10 border-amber-500/30' 
                : 'text-red-400 bg-red-500/10 border-red-500/30';
            const isExpanded = expandedRow === res.caseId;
            const currentFeedback = feedbackMap[`${res.caseId}`];

            return (
                <div key={res.caseId} className="bg-surface-800/30 border border-white/5 rounded-xl overflow-hidden transition-all backdrop-blur-sm hover:bg-surface-800/50">
                    <button 
                        onClick={() => setExpandedRow(isExpanded ? null : (res.caseId as number))}
                        className="w-full flex items-center justify-between p-4 transition-colors"
                    >
                        <div className="flex items-center gap-4 text-right overflow-hidden">
                            <span className={`text-xs font-bold px-2 py-1 rounded border min-w-[3rem] text-center ${scoreColor}`}>
                                {toPersianDigits((safeScore * 100).toFixed(0))}٪
                            </span>
                            <span className="text-sm font-medium text-surface-200 truncate">{res.question.split('\n').pop() || res.question}</span>
                        </div>
                        <div className="flex items-center gap-4">
                            {/* Mini RAGAS Indicators */}
                            <div className="hidden md:flex gap-2">
                                <div className="flex items-center gap-1 text-[10px] text-surface-400 bg-surface-900/50 px-2 py-0.5 rounded border border-white/5">
                                    <ShieldCheck className="w-3 h-3 text-emerald-500" />
                                    <span>{toPersianDigits(((res.faithfulnessScore || 0) * 100).toFixed(0))}٪</span>
                                </div>
                                <div className="flex items-center gap-1 text-[10px] text-surface-400 bg-surface-900/50 px-2 py-0.5 rounded border border-white/5">
                                    <Target className="w-3 h-3 text-blue-500" />
                                    <span>{toPersianDigits(((res.relevanceScore || 0) * 100).toFixed(0))}٪</span>
                                </div>
                            </div>
                            {isExpanded ? <ChevronUp className="w-4 h-4 text-surface-500" /> : <ChevronDown className="w-4 h-4 text-surface-500" />}
                        </div>
                    </button>
                    
                    {isExpanded && (
                        <div className="p-4 bg-surface-950/50 border-t border-white/5 space-y-4 text-sm animate-in slide-in-from-top-2">
                            {/* Full Question if it was truncated */}
                            <div className="bg-surface-800/50 p-2 rounded text-xs text-surface-300 whitespace-pre-wrap border border-white/5">
                                <strong className="text-white">سوال کامل:</strong> {res.question}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-surface-800/30 p-3 rounded-lg border border-white/5 shadow-sm">
                                    <h4 className="text-xs font-bold text-emerald-400 mb-2 flex items-center gap-1">
                                        <CheckCircle2 className="w-3 h-3" /> پاسخ مرجع (Ground Truth)
                                    </h4>
                                    <p className="text-surface-300 leading-6 text-xs text-justify whitespace-pre-wrap">{res.groundTruth}</p>
                                </div>
                                <div className="bg-surface-800/30 p-3 rounded-lg border border-white/5 shadow-sm flex flex-col">
                                    <div>
                                        <h4 className="text-xs font-bold text-blue-400 mb-2 flex items-center gap-1">
                                            <FileText className="w-3 h-3" /> پاسخ هوش مصنوعی
                                        </h4>
                                        <p className="text-surface-300 leading-6 text-xs text-justify">{res.generatedAnswer}</p>
                                    </div>
                                    
                                    {/* RAGAS Breakdown */}
                                    <div className="mt-4 pt-3 border-t border-white/5 grid grid-cols-2 gap-2">
                                        <div className="bg-emerald-500/10 border border-emerald-500/20 p-2 rounded text-xs text-emerald-400 flex justify-between">
                                            <span>وفاداری به متن:</span>
                                            <span className="font-bold">{toPersianDigits(((res.faithfulnessScore || 0) * 100).toFixed(0))}٪</span>
                                        </div>
                                        <div className="bg-blue-500/10 border border-blue-500/20 p-2 rounded text-xs text-blue-400 flex justify-between">
                                            <span>ارتباط با سوال:</span>
                                            <span className="font-bold">{toPersianDigits(((res.relevanceScore || 0) * 100).toFixed(0))}٪</span>
                                        </div>
                                    </div>

                                    {/* Feedback Buttons */}
                                    <div className="mt-3 flex items-center justify-end gap-2">
                                        <span className="text-[10px] text-surface-500 ml-1">بازخورد دستی:</span>
                                        <button 
                                            onClick={() => handleFeedback(res, 1)}
                                            className={`p-1.5 rounded-lg transition-all ${currentFeedback === 1 ? 'bg-emerald-500/20 text-emerald-400' : 'hover:bg-surface-700 text-surface-500'}`}
                                        >
                                            <ThumbsUp className="w-3.5 h-3.5" />
                                        </button>
                                        <button 
                                            onClick={() => handleFeedback(res, -1)}
                                            className={`p-1.5 rounded-lg transition-all ${currentFeedback === -1 ? 'bg-red-500/20 text-red-400' : 'hover:bg-surface-700 text-surface-500'}`}
                                        >
                                            <ThumbsDown className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Sources Used */}
                            {res.retrievedSources.length > 0 ? (
                                <div>
                                    <span className="text-[10px] font-bold text-surface-500 mb-1 block">منابع استفاده شده:</span>
                                    <div className="flex flex-wrap gap-2">
                                        {res.retrievedSources.map((src, i) => (
                                            <span key={i} className="text-[10px] bg-surface-800 text-surface-400 px-2 py-1 rounded truncate max-w-[200px] border border-white/5" title={src.snippet}>
                                                {src.id} (ص {toPersianDigits(src.page)})
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 p-2 rounded">
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 font-sans animate-in fade-in duration-200" dir="rtl">
      <div className="bg-surface-900/90 border border-white/10 rounded-2xl w-full max-w-6xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-white backdrop-blur-xl">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/5 bg-white/5">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-brand-600 to-brand-800 p-2 rounded-lg text-white shadow-lg shadow-brand-500/20">
              <Award className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-wide">سیستم ارزیابی خودکار (RAGAS Benchmark)</h2>
              <p className="text-xs text-surface-400 mt-1">سنجش وفاداری و دقت پاسخ‌ها با استفاده از هوش مصنوعی</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-surface-400 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex px-6 border-b border-white/5 bg-white/5 gap-4">
            <button 
                onClick={() => setActiveTab('run')}
                className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'run' ? 'border-brand-500 text-brand-400' : 'border-transparent text-surface-400 hover:text-white'}`}
            >
                <Play className="w-4 h-4" />
                اجرای تست جدید
            </button>
            <button 
                onClick={() => setActiveTab('autotune')}
                className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'autotune' ? 'border-brand-500 text-brand-400' : 'border-transparent text-surface-400 hover:text-white'}`}
            >
                <Gauge className="w-4 h-4" />
                بهینه‌ساز هوشمند (Auto-Tuner)
            </button>
            <button 
                onClick={() => setActiveTab('history')}
                className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'history' ? 'border-brand-500 text-brand-400' : 'border-transparent text-surface-400 hover:text-white'}`}
            >
                <History className="w-4 h-4" />
                تاریخچه و گزارشات
            </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-surface-950/30 custom-scrollbar">
            
            {/* --- RUN TAB --- */}
            {activeTab === 'run' && (
                <>
                    {/* Control Panel */}
                    {!isRunning && results.length === 0 && (
                        <div className="bg-surface-800/30 p-6 rounded-xl border border-white/10 shadow-sm mb-6 animate-in slide-in-from-right-4">
                            
                            {/* Dataset Selection */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                <button 
                                    onClick={() => setDatasetMode('standard')}
                                    className={`p-4 rounded-xl border flex flex-col items-center gap-2 transition-all ${datasetMode === 'standard' ? 'border-brand-500 bg-brand-500/10 text-brand-300' : 'border-white/10 text-surface-400 hover:border-brand-500/50 hover:bg-surface-800'}`}
                                >
                                    <Database className="w-6 h-6" />
                                    <span className="font-bold text-sm">دیتاست استاندارد</span>
                                    <span className="text-xs opacity-70">{toPersianDigits(30)} تست پیش‌فرض سیستمی</span>
                                </button>
                                <button 
                                    onClick={() => setDatasetMode('custom')}
                                    className={`p-4 rounded-xl border flex flex-col items-center gap-2 transition-all ${datasetMode === 'custom' ? 'border-brand-500 bg-brand-500/10 text-brand-300' : 'border-white/10 text-surface-400 hover:border-brand-500/50 hover:bg-surface-800'}`}
                                >
                                    <FileType className="w-6 h-6" />
                                    <span className="font-bold text-sm">بنچمارک سفارشی</span>
                                    <span className="text-xs opacity-70">آپلود فایل Word سوال و جواب</span>
                                </button>
                                <button 
                                    onClick={() => setDatasetMode('ticket')}
                                    className={`p-4 rounded-xl border flex flex-col items-center gap-2 transition-all ${datasetMode === 'ticket' ? 'border-brand-500 bg-brand-500/10 text-brand-300' : 'border-white/10 text-surface-400 hover:border-brand-500/50 hover:bg-surface-800'}`}
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
                                        className="w-full border-2 border-dashed border-white/10 bg-surface-950/30 rounded-lg p-6 flex flex-col items-center justify-center gap-2 text-surface-400 hover:border-brand-500/50 hover:text-brand-400 transition-all"
                                    >
                                        <Upload className="w-8 h-8" />
                                        {customDataset.length > 0 ? (
                                            <span className="font-bold text-emerald-400 flex items-center gap-2">
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
                                        className="w-full border-2 border-dashed border-white/10 bg-surface-950/30 rounded-lg p-6 flex flex-col items-center justify-center gap-2 text-surface-400 hover:border-brand-500/50 hover:text-brand-400 transition-all"
                                    >
                                        <MessageSquare className="w-8 h-8" />
                                        {ticketDataset.length > 0 ? (
                                            <span className="font-bold text-emerald-400 flex items-center gap-2">
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
                                    className={`bg-brand-600 text-white px-8 py-3 rounded-full font-bold shadow-lg shadow-brand-500/30 transition-all transform hover:scale-105 flex items-center gap-2 ${
                                        (datasetMode === 'custom' && customDataset.length === 0) || (datasetMode === 'ticket' && ticketDataset.length === 0) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-brand-500'
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
                            <div className="flex justify-between text-sm font-medium text-surface-300 mb-2">
                                <span>در حال تولید پاسخ و ارزیابی RAGAS...</span>
                                <span>{toPersianDigits(progress)} از {toPersianDigits(totalCases)}</span>
                            </div>
                            <div className="w-full bg-surface-800 rounded-full h-3 overflow-hidden border border-white/5">
                                <div 
                                    className="bg-brand-600 h-full rounded-full transition-all duration-500 ease-out relative overflow-hidden shadow-[0_0_10px_rgba(99,102,241,0.5)]"
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

            {/* --- AUTO TUNER TAB --- */}
            {activeTab === 'autotune' && (
                <div className="flex flex-col h-full animate-in slide-in-from-right-2">
                    {!isRunning && !winnerConfig ? (
                         <div className="flex flex-col items-center justify-center p-10 bg-surface-800/30 rounded-xl border border-white/10 text-center shadow-sm">
                             <div className="w-20 h-20 bg-brand-500/20 text-brand-400 rounded-full flex items-center justify-center mb-6 shadow-lg shadow-brand-500/10 border border-brand-500/30">
                                 <Zap className="w-10 h-10" />
                             </div>
                             <h3 className="text-2xl font-black text-white mb-3">تیونینگ خودکار پارامترها (Auto-Tuner)</h3>
                             <p className="text-surface-400 max-w-lg leading-7 mb-8">
                                 این ابزار به صورت خودکار استراتژی‌های مختلف جستجو (مثل تنظیمات Min Confidence، Temperature و وزن‌دهی کلمات کلیدی) را تست می‌کند و آنقدر تکرار می‌کند تا به امتیاز دقت بالای <strong>۸۵٪</strong> برسد.
                             </p>
                             <button 
                                onClick={handleAutoTuneStart}
                                className="bg-brand-600 text-white px-8 py-3 rounded-full font-bold shadow-lg shadow-brand-500/30 transition-all hover:bg-brand-500 hover:scale-105 flex items-center gap-2"
                             >
                                <Play className="w-5 h-5" />
                                شروع عملیات بهینه‌سازی
                             </button>
                         </div>
                    ) : (
                        <div className="space-y-6">
                            {/* Running Status */}
                            {isRunning && (
                                <div className="bg-surface-800/50 p-6 rounded-xl border border-white/10 shadow-sm flex items-center gap-6 animate-pulse">
                                    <div className="relative w-16 h-16">
                                        <div className="absolute inset-0 border-4 border-surface-700 rounded-full"></div>
                                        <div className="absolute inset-0 border-4 border-brand-500 rounded-full border-t-transparent animate-spin"></div>
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-lg text-white">در حال جستجوی بهترین تنظیمات...</h4>
                                        <p className="text-sm text-surface-400">آزمایش استراتژی‌های مختلف روی مجموعه داده کامل</p>
                                        {activeStrategyName && <span className="text-xs bg-brand-500/20 text-brand-300 px-2 py-0.5 rounded mt-2 inline-block border border-brand-500/30">استراتژی فعلی: {activeStrategyName}</span>}
                                    </div>
                                </div>
                            )}

                            {/* Results Timeline */}
                            <div className="space-y-4">
                                {tuningSteps.map((step, idx) => (
                                    <div key={idx} className={`p-4 rounded-xl border flex items-center justify-between transition-all animate-in slide-in-from-bottom-2 ${step.pass ? 'bg-emerald-900/20 border-emerald-500/30' : 'bg-surface-800/30 border-white/5'}`}>
                                        <div className="flex items-center gap-4">
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border ${step.pass ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50' : 'bg-surface-800 text-surface-500 border-surface-700'}`}>
                                                {idx + 1}
                                            </div>
                                            <div>
                                                <h5 className="font-bold text-white">{step.strategyName}</h5>
                                                <div className="text-xs text-surface-400 font-mono mt-1 flex gap-3">
                                                    <span>Conf: {step.config.minConfidence}</span>
                                                    <span>Temp: {step.config.temperature}</span>
                                                    <span>VecWeight: {step.config.vectorWeight}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className={`text-xl font-black ${step.pass ? 'text-emerald-400' : 'text-surface-500'}`}>
                                                {toPersianDigits((step.score * 100).toFixed(1))}٪
                                            </div>
                                            <div className="text-[10px] text-surface-500">Score</div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Winner Screen */}
                            {winnerConfig && (
                                <div className="bg-gradient-to-br from-emerald-600 to-teal-800 p-8 rounded-2xl text-white shadow-2xl animate-in zoom-in-95 duration-500 text-center border border-emerald-500/30">
                                    <div className="w-20 h-20 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-6 backdrop-blur-sm shadow-inner border border-white/20">
                                        <Award className="w-10 h-10 text-white" />
                                    </div>
                                    <h2 className="text-3xl font-black mb-2">تنظیمات بهینه پیدا شد!</h2>
                                    <p className="opacity-90 mb-8">استراتژی <span className="font-bold border-b border-white/40 pb-0.5 mx-1">{winnerConfig.strategyName}</span> بهترین عملکرد را داشت.</p>
                                    
                                    <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto mb-8">
                                        <div className="bg-black/20 p-3 rounded-xl backdrop-blur-sm border border-white/10">
                                            <div className="text-xs opacity-70 mb-1">Min Confidence</div>
                                            <div className="font-mono font-bold text-lg">{winnerConfig.minConfidence}</div>
                                        </div>
                                        <div className="bg-black/20 p-3 rounded-xl backdrop-blur-sm border border-white/10">
                                            <div className="text-xs opacity-70 mb-1">Temperature</div>
                                            <div className="font-mono font-bold text-lg">{winnerConfig.temperature}</div>
                                        </div>
                                        <div className="bg-black/20 p-3 rounded-xl backdrop-blur-sm border border-white/10">
                                            <div className="text-xs opacity-70 mb-1">Vector Weight</div>
                                            <div className="font-mono font-bold text-lg">{winnerConfig.vectorWeight}</div>
                                        </div>
                                    </div>

                                    <div className="bg-white/10 p-4 rounded-xl text-sm flex items-center justify-center gap-2 border border-white/10">
                                        <Settings className="w-4 h-4" />
                                        این تنظیمات به صورت خودکار روی سیستم اعمال شدند.
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* --- HISTORY TAB --- */}
            {activeTab === 'history' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full">
                    {/* List of Runs */}
                    <div className="md:col-span-1 bg-surface-800/30 border border-white/10 rounded-xl overflow-hidden flex flex-col h-full max-h-[600px]">
                        <div className="p-4 border-b border-white/5 font-bold text-surface-200 flex items-center gap-2 bg-surface-800/50">
                            <History className="w-4 h-4" />
                            لیست گزارشات
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
                            {history.length === 0 ? (
                                <p className="text-center text-surface-500 text-xs py-8">هنوز تستی اجرا نشده است.</p>
                            ) : (
                                history.map(run => (
                                    <div 
                                        key={run.id}
                                        onClick={() => setSelectedHistoryRun(run)}
                                        className={`p-3 rounded-lg cursor-pointer border transition-all ${selectedHistoryRun?.id === run.id ? 'bg-brand-500/20 border-brand-500/50' : 'bg-surface-800/50 border-transparent hover:bg-surface-800 hover:border-white/10'}`}
                                    >
                                        <div className="flex justify-between items-start mb-1">
                                            <span className="font-bold text-surface-200 text-xs">
                                                {new Date(run.timestamp).toLocaleDateString('fa-IR')}
                                            </span>
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${run.avgScore > 0.8 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                                                {toPersianDigits((run.avgScore * 100).toFixed(0))}٪
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center text-[10px] text-surface-500">
                                            <span>{new Date(run.timestamp).toLocaleTimeString('fa-IR', {hour: '2-digit', minute:'2-digit'})}</span>
                                            <button 
                                                onClick={(e) => handleDeleteRun(e, run.id)}
                                                className="p-1 hover:bg-red-500/20 hover:text-red-400 rounded text-surface-600 transition-colors"
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
                                    <h3 className="font-bold text-white">جزئیات گزارش</h3>
                                    <button 
                                        onClick={() => handleDownloadReport(selectedHistoryRun)}
                                        className="flex items-center gap-2 text-xs bg-brand-600 hover:bg-brand-500 text-white px-3 py-2 rounded-lg transition-colors shadow-sm"
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
                            <div className="h-full flex flex-col items-center justify-center text-surface-500 border-2 border-dashed border-white/5 rounded-xl bg-surface-900/30">
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
