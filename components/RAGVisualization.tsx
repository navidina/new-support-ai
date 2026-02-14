
import React, { useEffect, useState } from 'react';
import { PipelineData } from '../types';
import { Search, Database, Cpu, BrainCircuit, Filter, ChevronDown, ChevronUp, Activity, Zap, Crosshair } from 'lucide-react';
import { toPersianDigits } from '../services/textProcessor';
import { getSettings } from '../services/settings';

interface RAGVisualizationProps {
    data: PipelineData;
}

const RAGVisualization: React.FC<RAGVisualizationProps> = ({ data }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [elapsed, setElapsed] = useState(0);

    // Timer logic
    useEffect(() => {
        // If final processing time is available, set it and stop timer logic
        if (data.processingTime) {
            setElapsed(data.processingTime);
            return;
        }

        // If actively processing (not idle) and no final time yet, run timer
        if (data.step !== 'idle') {
            const interval = setInterval(() => {
                setElapsed(prev => prev + 100);
            }, 100);
            return () => clearInterval(interval);
        }
    }, [data.step, data.processingTime]);

    const steps = [
        { id: 'analyzing', label: 'آنالیز معنایی', icon: Search, color: 'text-blue-400' },
        { id: 'vectorizing', label: 'بهینه‌سازی کوئری', icon: BrainCircuit, color: 'text-violet-400' },
        { id: 'reranking', label: 'غربال دقیق (Rerank)', icon: Crosshair, color: 'text-rose-400' },
        { id: 'searching', label: 'انتخاب اسناد', icon: Database, color: 'text-amber-400' },
        { id: 'generating', label: 'تولید پاسخ نهایی', icon: Cpu, color: 'text-emerald-400' },
    ];

    const currentStepIndex = steps.findIndex(s => s.id === data.step);
    const activeStep = steps[currentStepIndex] || steps[steps.length - 1];
    // If we have processingTime, it means the whole flow is effectively done
    const isDone = !!data.processingTime; 
    const isProcessing = !isDone && data.step !== 'idle';

    const getStatusText = () => {
        if (isDone) return 'پردازش با موفقیت انجام شد';
        if (data.step === 'generating') return 'در حال نگارش پاسخ...';
        if (data.step === 'idle') return 'آماده';
        return activeStep.label + '...';
    };

    return (
        <div className="w-full my-3 border border-white/10 rounded-xl overflow-hidden bg-surface-950/40 backdrop-blur-md font-sans" dir="rtl">
            {/* Header / Toggle */}
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-3 hover:bg-white/5 transition-all cursor-pointer"
            >
                <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded-lg border border-white/10 ${isProcessing ? 'bg-brand-500/10 shadow-[0_0_10px_rgba(99,102,241,0.2)]' : 'bg-surface-800'}`}>
                        {isProcessing ? (
                            <Activity className="w-4 h-4 text-brand-400 animate-spin" />
                        ) : (
                            <Cpu className="w-4 h-4 text-surface-400" />
                        )}
                    </div>
                    <div className="flex flex-col items-start">
                        <span className="text-xs font-bold text-surface-200 flex items-center gap-2">
                            {getStatusText()}
                            {isProcessing && <span className="flex h-1.5 w-1.5 rounded-full bg-brand-500 animate-pulse"></span>}
                        </span>
                        <span className="text-[10px] text-surface-500 font-sans mt-0.5">
                            زمان کل: {toPersianDigits((elapsed / 1000).toFixed(1))} ثانیه
                        </span>
                    </div>
                </div>
                <div className="text-surface-500">
                    {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
            </button>

            {/* Collapsible Content */}
            {isOpen && (
                <div className="bg-surface-950/60 border-t border-white/5 p-4 animate-slide-in-from-top-2">
                    {/* Steps Visualization */}
                    <div className="space-y-5 relative">
                        {/* Connecting Line */}
                        <div className="absolute top-4 bottom-4 right-[15px] w-0.5 bg-surface-800 pointer-events-none"></div>

                        {steps.map((step, idx) => {
                            const isStepDone = currentStepIndex > idx || isDone;
                            const isCurrent = currentStepIndex === idx && !isDone;
                            const isPending = currentStepIndex < idx && !isDone;

                            return (
                                <div key={step.id} className={`relative flex gap-4 ${isPending ? 'opacity-30 grayscale' : 'opacity-100'} transition-all duration-500`}>
                                    {/* Icon Node */}
                                    <div className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300 shrink-0
                                        ${isCurrent ? `bg-surface-800 border-${step.color.split('-')[1]}-500 shadow-[0_0_10px_currentColor] ${step.color}` : ''}
                                        ${isStepDone ? 'bg-surface-800 border-surface-600 text-surface-500' : ''}
                                        ${isPending ? 'bg-surface-900 border-surface-800 text-surface-700' : ''}
                                    `}>
                                        <step.icon className="w-4 h-4" />
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 pt-1 min-w-0 text-right">
                                        <h4 className={`text-xs font-bold ${isCurrent ? 'text-surface-200' : 'text-surface-500'}`}>
                                            {step.label}
                                        </h4>
                                        
                                        {/* Step Details */}
                                        {step.id === 'analyzing' && (isCurrent || isStepDone) && data.expandedQuery && (
                                            <div className="mt-2 p-2 rounded bg-brand-900/20 border border-brand-500/20 flex flex-col gap-1.5 animate-fade-in">
                                                <div className="flex items-center gap-1.5 text-[9px] text-brand-300 font-bold uppercase tracking-wider">
                                                    <Zap className="w-3 h-3" />
                                                    هسته معنایی (AI Intent)
                                                </div>
                                                <div className="text-[10px] text-surface-300 leading-5">
                                                    {data.expandedQuery}
                                                </div>
                                            </div>
                                        )}

                                        {step.id === 'vectorizing' && (isCurrent || isStepDone) && data.extractedKeywords && (
                                            <div className="mt-2 flex flex-wrap gap-1.5 animate-fade-in">
                                                {data.extractedKeywords.slice(0, 6).map((k, i) => (
                                                    <span key={i} className="px-1.5 py-0.5 rounded bg-surface-800 border border-surface-700 text-brand-300 text-[9px]">
                                                        {k}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        
                                        {step.id === 'reranking' && (isCurrent || isStepDone) && (
                                             <div className="mt-1 text-[9px] text-surface-400 animate-fade-in">
                                                مرتب‌سازی ترکیبی (Hybrid Score) نتایج یافت شده.
                                             </div>
                                        )}

                                        {step.id === 'searching' && (isCurrent || isStepDone) && data.retrievedCandidates && (
                                            <div className="mt-2 space-y-2 animate-fade-in w-full">
                                                {/* Accepted Candidates */}
                                                <div className="space-y-1">
                                                     <div className="text-[10px] font-bold text-emerald-400 mb-1 flex justify-between">
                                                        <span>نتایج منطبق (Top 6)</span>
                                                        <span className="opacity-50 text-[9px]">High Precision</span>
                                                     </div>
                                                     {data.retrievedCandidates.filter(c => c.accepted).slice(0, 4).map((doc, i) => (
                                                        <div key={i} className="flex items-center justify-between text-[9px] text-emerald-100 bg-emerald-500/10 p-1.5 rounded border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors">
                                                            <span className="truncate max-w-[150px]" title={doc.title}>{doc.title}</span>
                                                            <span className="text-emerald-300 font-mono font-bold">{toPersianDigits((doc.score * 100).toFixed(0))}%</span>
                                                        </div>
                                                    ))}
                                                    {data.retrievedCandidates.filter(c => c.accepted).length === 0 && (
                                                        <div className="text-[9px] text-surface-500 italic px-1">هیچ نتیجه با کیفیتی یافت نشد.</div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default RAGVisualization;
