
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Play, Award, CheckCircle2, ChevronDown, ChevronUp, Upload, Database, Ticket, Zap, FileSpreadsheet, Download, Sliders, Check, RefreshCw } from 'lucide-react';
import { BenchmarkResult, KnowledgeChunk, BenchmarkRun, BenchmarkCase, TuningStepResult, SearchOverrides } from '../types';
import { BENCHMARK_DATASET } from '../services/benchmarkData';
import { runBenchmark, runAutoTuneBenchmark, saveBenchmarkRun, loadBenchmarkHistory, parseTicketCSV, parseBenchmarkCSV } from '../services/mockBackend';
import { updateSettings } from '../services/settings';
import { toPersianDigits } from '../services/textProcessor';

interface BenchmarkModalProps {
  isOpen: boolean;
  onClose: () => void;
  chunks: KnowledgeChunk[];
}

const BenchmarkModal: React.FC<BenchmarkModalProps> = ({ isOpen, onClose, chunks }) => {
  const [activeTab, setActiveTab] = useState<'run' | 'history' | 'tune'>('run');
  const [datasetMode, setDatasetMode] = useState<'standard' | 'ticket' | 'custom'>('standard');
  const [customDataset, setCustomDataset] = useState<BenchmarkCase[]>([]);
  
  // Benchmark State
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [history, setHistory] = useState<BenchmarkRun[]>([]);
  const [expandedRow, setExpandedRow] = useState<string | number | null>(null);

  // Auto Tune State
  const [tuningResults, setTuningResults] = useState<TuningStepResult[]>([]);
  const [bestStrategy, setBestStrategy] = useState<SearchOverrides | null>(null);
  const [isTuneRunning, setIsTuneRunning] = useState(false);

  const activeDataset = useMemo(() => {
      if (datasetMode === 'custom') return customDataset;
      if (datasetMode === 'ticket') return customDataset; 
      return BENCHMARK_DATASET;
  }, [datasetMode, customDataset]);

  useEffect(() => { if (isOpen) loadHistory(); }, [isOpen]);

  const loadHistory = async () => { setHistory(await loadBenchmarkHistory()); };

  const handleCustomUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'ticket' | 'qa') => {
      if (e.target.files && e.target.files[0]) {
          try {
              let cases: BenchmarkCase[] = [];
              if (type === 'ticket') {
                  cases = await parseTicketCSV(e.target.files[0]);
              } else {
                  cases = await parseBenchmarkCSV(e.target.files[0]);
              }
              setCustomDataset(cases);
              alert(`${cases.length} مورد بارگذاری شد.`);
          } catch (error: any) { alert(error.message); }
      }
  };

  const handleStart = async () => {
      setIsRunning(true);
      setResults([]);
      setProgress(0);
      const currentRunResults: BenchmarkResult[] = [];
      await runBenchmark(activeDataset, chunks, (current, total, result) => {
          setProgress(current);
          setResults(prev => [...prev, result]);
          currentRunResults.push(result);
      });
      await saveBenchmarkRun({
          id: `run-${Date.now()}`,
          timestamp: Date.now(),
          totalCases: currentRunResults.length,
          avgScore: currentRunResults.reduce((acc, r) => acc + r.similarityScore, 0) / currentRunResults.length,
          passRate: (currentRunResults.filter(r => r.similarityScore > 0.7).length / currentRunResults.length) * 100,
          avgTime: 0,
          results: currentRunResults
      });
      loadHistory();
      setIsRunning(false);
  };

  const handleStartTune = async () => {
      if (activeDataset.length === 0) return;
      setIsTuneRunning(true);
      setTuningResults([]);
      setBestStrategy(null);

      const best = await runAutoTuneBenchmark(activeDataset, chunks, (step) => {
          setTuningResults(prev => [...prev, step]);
      });
      
      setBestStrategy(best);
      setIsTuneRunning(false);
  };

  const handleApplyStrategy = (config: SearchOverrides) => {
      updateSettings(config);
      alert('تنظیمات بهینه با موفقیت اعمال شد.');
  };

  const handleDownloadRun = (run: BenchmarkRun) => {
      const BOM = "\uFEFF";
      const headers = ['ID', 'Question', 'Ground Truth', 'Generated Answer', 'Score', 'Time (ms)'];
      const escape = (text: string | number) => {
          if (text === null || text === undefined) return '';
          const str = String(text).replace(/"/g, '""'); 
          return `"${str}"`;
      };
      const csvContent = [
          headers.join(','),
          ...run.results.map(res => [
              escape(res.caseId),
              escape(res.question),
              escape(res.groundTruth),
              escape(res.generatedAnswer),
              escape(res.similarityScore),
              escape(res.timeTakenMs)
          ].join(','))
      ].join('\n');
      const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `benchmark_run_${new Date(run.timestamp).toISOString().slice(0,19).replace(/[:]/g, '-')}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
  };

  const renderResultsList = (list: BenchmarkResult[]) => (
      <div className="space-y-3">
        {list.map((res) => {
            const isExpanded = expandedRow === res.caseId;
            const isCustom = String(res.caseId).startsWith('custom-') || String(res.caseId).startsWith('ticket-');
            return (
                <div key={res.caseId} className="bg-surface-800/30 border border-white/5 rounded-xl overflow-hidden backdrop-blur-sm">
                    <button onClick={() => setExpandedRow(isExpanded ? null : res.caseId)} className="w-full flex items-center justify-between p-4 text-right">
                        <div className="flex items-center gap-4">
                            <span className="text-xs font-bold px-2 py-1 rounded bg-brand-500/10 text-brand-400 border border-brand-500/30">
                                {toPersianDigits((res.similarityScore * 100).toFixed(0))}٪
                            </span>
                            <span className="text-sm text-surface-200 truncate max-w-md">{res.question}</span>
                        </div>
                        {isExpanded ? <ChevronUp /> : <ChevronDown />}
                    </button>
                    {isExpanded && (
                        <div className="p-4 bg-surface-950/50 border-t border-white/5 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                            <div className="bg-surface-800/30 p-3 rounded-lg border border-white/5">
                                <h4 className="text-xs font-bold text-emerald-400 mb-2 flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" /> {isCustom ? 'پاسخ صحیح (Ground Truth)' : 'پاسخ مرجع'}
                                </h4>
                                <p className="text-surface-300 leading-6 whitespace-pre-wrap">{res.groundTruth}</p>
                            </div>
                            <div className="bg-surface-800/30 p-3 rounded-lg border border-white/5">
                                <h4 className="text-xs font-bold text-blue-400 mb-2 flex items-center gap-1">
                                    <Zap className="w-3 h-3" /> پاسخ هوش مصنوعی
                                </h4>
                                <p className="text-surface-300 leading-6">{res.generatedAnswer}</p>
                            </div>
                        </div>
                    )}
                </div>
            );
        })}
      </div>
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in" dir="rtl">
      <div className="bg-surface-900/90 border border-white/10 rounded-2xl w-full max-w-6xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-white">
        <div className="flex items-center justify-between p-5 border-b border-white/5 bg-white/5">
          <h2 className="text-xl font-bold flex items-center gap-2"><Award className="text-brand-400" /> مرکز آزمون و سنجش کیفیت (Benchmark)</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full"><X /></button>
        </div>
        <div className="flex px-6 border-b border-white/5 bg-white/5 gap-4">
            <button onClick={() => setActiveTab('run')} className={`py-3 px-4 text-sm font-medium border-b-2 ${activeTab === 'run' ? 'border-brand-500 text-brand-400' : 'border-transparent text-surface-400'}`}>اجرای آزمون</button>
            <button onClick={() => setActiveTab('tune')} className={`py-3 px-4 text-sm font-medium border-b-2 ${activeTab === 'tune' ? 'border-brand-500 text-brand-400' : 'border-transparent text-surface-400'}`}>تنظیم خودکار (Auto Tune)</button>
            <button onClick={() => setActiveTab('history')} className={`py-3 px-4 text-sm font-medium border-b-2 ${activeTab === 'history' ? 'border-brand-500 text-brand-400' : 'border-transparent text-surface-400'}`}>تاریخچه نتایج</button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 bg-surface-950/30">
            {/* Common Dataset Selection for Run and Tune */}
            {(activeTab === 'run' || activeTab === 'tune') && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <button onClick={() => setDatasetMode('standard')} className={`p-4 rounded-xl border flex flex-col items-center justify-center gap-3 text-center transition-all ${datasetMode === 'standard' ? 'border-brand-500 bg-brand-500/10' : 'border-white/10 hover:bg-white/5'}`}>
                        <Database className="w-6 h-6 text-blue-400" />
                        <span className="font-bold text-sm">تست استاندارد</span>
                    </button>
                    <button onClick={() => setDatasetMode('ticket')} className={`p-4 rounded-xl border flex flex-col items-center justify-center gap-3 text-center transition-all ${datasetMode === 'ticket' ? 'border-brand-500 bg-brand-500/10' : 'border-white/10 hover:bg-white/5'}`}>
                        <Ticket className="w-6 h-6 text-amber-400" />
                        <span className="font-bold text-sm">تحلیل تیکت</span>
                    </button>
                    <button onClick={() => setDatasetMode('custom')} className={`p-4 rounded-xl border flex flex-col items-center justify-center gap-3 text-center transition-all ${datasetMode === 'custom' ? 'border-brand-500 bg-brand-500/10' : 'border-white/10 hover:bg-white/5'}`}>
                        <FileSpreadsheet className="w-6 h-6 text-emerald-400" />
                        <span className="font-bold text-sm">تست سفارشی (CSV)</span>
                    </button>
                </div>
            )}

            {/* Upload Area */}
            {(activeTab === 'run' || activeTab === 'tune') && datasetMode === 'ticket' && (
                <div className="mb-6 p-6 border-2 border-dashed border-white/10 rounded-lg text-center bg-white/5 hover:bg-white/10 transition-colors">
                    <input type="file" className="hidden" id="ticketCsv" accept=".csv" onChange={(e) => handleCustomUpload(e, 'ticket')} />
                    <label htmlFor="ticketCsv" className="cursor-pointer flex flex-col items-center gap-2">
                        <Upload className="w-8 h-8 text-amber-400" />
                        <span className="font-bold">آپلود فایل خروجی تیکت (.csv)</span>
                        <span className="text-xs opacity-50">{customDataset.length > 0 ? `${customDataset.length} مورد آماده تست` : 'فرمت استاندارد CRM'}</span>
                    </label>
                </div>
            )}

            {(activeTab === 'run' || activeTab === 'tune') && datasetMode === 'custom' && (
                <div className="mb-6 p-6 border-2 border-dashed border-white/10 rounded-lg text-center bg-white/5 hover:bg-white/10 transition-colors">
                    <input type="file" className="hidden" id="customCsv" accept=".csv" onChange={(e) => handleCustomUpload(e, 'qa')} />
                    <label htmlFor="customCsv" className="cursor-pointer flex flex-col items-center gap-2">
                        <Upload className="w-8 h-8 text-emerald-400" />
                        <span className="font-bold">آپلود فایل سوال و جواب (.csv)</span>
                        <span className="text-xs opacity-50 block">فرمت: ستون "عنوان سوال (چالش)" و ستون "پاسخ کامل و صحیح (مرجع)"</span>
                        {customDataset.length > 0 && <span className="text-emerald-400 font-bold bg-emerald-400/10 px-3 py-1 rounded-full text-xs mt-2">{customDataset.length} سوال شناسایی شد</span>}
                    </label>
                </div>
            )}

            {/* TAB: RUN */}
            {activeTab === 'run' && (
                <>
                    <button 
                        onClick={handleStart} 
                        disabled={isRunning || ((datasetMode === 'ticket' || datasetMode === 'custom') && customDataset.length === 0)} 
                        className="w-full bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-3 mb-6 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-brand-500/20"
                    >
                        {isRunning ? <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></div> : <Play className="w-5 h-5" />}
                        {isRunning ? 'در حال اجرای آزمون...' : 'شروع ارزیابی هوشمند'}
                    </button>
                    
                    {isRunning && (
                        <div className="mb-6">
                            <div className="flex justify-between text-xs mb-1 text-surface-400">
                                <span>پیشرفت</span>
                                <span>{Math.round((progress / activeDataset.length) * 100)}%</span>
                            </div>
                            <div className="h-2 bg-surface-800 rounded-full overflow-hidden">
                                <div className="h-full bg-brand-500 transition-all duration-300" style={{width: `${(progress/activeDataset.length)*100}%`}}></div>
                            </div>
                        </div>
                    )}
                    
                    {results.length > 0 && renderResultsList(results)}
                </>
            )}

            {/* TAB: AUTO TUNE */}
            {activeTab === 'tune' && (
                <>
                    <div className="bg-brand-500/10 border border-brand-500/20 rounded-xl p-4 mb-6">
                        <h4 className="font-bold text-brand-300 flex items-center gap-2 mb-2">
                            <Sliders className="w-5 h-5" />
                            بهینه‌سازی خودکار پارامترها
                        </h4>
                        <p className="text-sm text-surface-300 leading-6 text-justify">
                            در این حالت، سیستم مجموعه‌ی سوالات انتخابی شما را با چندین استراتژی و پیکربندی متفاوت (تغییر در دما، وزن برداری، و حداقل اطمینان) اجرا می‌کند تا بهترین تنظیمات را برای پایگاه دانش خاص شما پیدا کند.
                        </p>
                    </div>

                    <button 
                        onClick={handleStartTune} 
                        disabled={isTuneRunning || ((datasetMode === 'ticket' || datasetMode === 'custom') && customDataset.length === 0)} 
                        className="w-full bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-3 mb-6 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-violet-500/20"
                    >
                        {isTuneRunning ? <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></div> : <RefreshCw className="w-5 h-5" />}
                        {isTuneRunning ? 'در حال جستجوی بهترین تنظیمات...' : 'شروع بهینه‌سازی (Auto Tune)'}
                    </button>

                    <div className="space-y-3">
                        {tuningResults.map((step, idx) => (
                            <div key={idx} className={`p-4 rounded-xl border flex justify-between items-center transition-all ${
                                step.config === bestStrategy?.config ? 'bg-emerald-500/10 border-emerald-500/50 shadow-[0_0_15px_-5px_rgba(16,185,129,0.3)]' : 'bg-surface-800/30 border-white/5'
                            }`}>
                                <div>
                                    <div className="font-bold text-sm mb-1 flex items-center gap-2">
                                        {step.strategyName}
                                        {step.config === bestStrategy?.config && <span className="bg-emerald-500 text-white text-[10px] px-2 py-0.5 rounded-full">بهترین</span>}
                                    </div>
                                    <div className="text-xs opacity-60 font-mono">
                                        Reranker: {step.config.enableReranker ? 'ON' : 'OFF'} | Temp: {step.config.temperature} | VecW: {step.config.vectorWeight ?? 0.7}
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <span className={`font-mono font-bold text-lg ${step.score > 0.7 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                        {toPersianDigits((step.score * 100).toFixed(1))}٪
                                    </span>
                                    <button 
                                        onClick={() => handleApplyStrategy(step.config)}
                                        className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-bold text-surface-300 hover:text-white border border-white/5 transition-colors"
                                        title="اعمال این تنظیمات"
                                    >
                                        <Check className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                        {isTuneRunning && (
                            <div className="p-4 rounded-xl border border-white/5 bg-surface-800/30 flex items-center justify-center opacity-50 animate-pulse">
                                <span className="text-xs">در حال تست استراتژی بعدی...</span>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* TAB: HISTORY */}
            {activeTab === 'history' && (
                <div className="space-y-4">
                    {history.length === 0 ? (
                        <div className="text-center py-10 opacity-50">هنوز تستی انجام نشده است.</div>
                    ) : (
                        history.map(run => (
                            <div key={run.id} className="p-4 rounded-xl border border-white/10 flex justify-between items-center bg-surface-800/30">
                                <div>
                                    <div className="font-bold text-sm mb-1">{new Date(run.timestamp).toLocaleString('fa-IR')}</div>
                                    <div className="text-xs opacity-50">{toPersianDigits(run.totalCases)} سوال تست شده</div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="text-left">
                                        <div className="text-[10px] uppercase opacity-60 mb-1">Score</div>
                                        <span className={`font-mono font-bold text-lg ${run.avgScore > 0.7 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                            {toPersianDigits((run.avgScore * 100).toFixed(0))}٪
                                        </span>
                                    </div>
                                    <button 
                                        onClick={() => handleDownloadRun(run)}
                                        className="p-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg text-slate-400 hover:text-brand-400 transition-colors"
                                        title="دانلود گزارش کامل (CSV)"
                                    >
                                        <Download className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default BenchmarkModal;
