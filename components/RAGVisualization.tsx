
import React, { useEffect, useState } from 'react';
import { PipelineData } from '../types';
import { Search, Database, Cpu, BrainCircuit, Filter, ChevronDown, ChevronUp, Activity, Zap } from 'lucide-react';
import { toPersianDigits } from '../services/textProcessor';

interface RAGVisualizationProps {
    data: PipelineData;
}

const RAGVisualization: React.FC<RAGVisualizationProps> = ({ data }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [elapsed, setElapsed] = useState(0);

    // Timer logic
    useEffect(() => {
        if (data.step !== 'idle' && data.step !== 'generating') {
            const interval = setInterval(() => {
                setElapsed(prev => prev + 100);
            }, 100);
            return () => clearInterval(interval);
        } else if (data.processingTime) {
            setElapsed(data.processingTime);
        }
    }, [data.step, data.processingTime]);

    const steps = [
        { id: 'analyzing', label: 'آنالیز معنایی', icon: Search, color: 'text-blue-400' },
        { id: 'vectorizing', label: 'بهینه‌سازی کوئری', icon: BrainCircuit, color: 'text-violet-400' },
        { id: 'searching', label: 'جستجو در اسناد', icon: Database, color: 'text-amber-400' },
        { id: 'generating', label: 'تولید پاسخ نهایی', icon: Cpu, color: 'text-emerald-400' },
    ];

    const currentStepIndex = steps.findIndex(s => s.id === data.step);
    const activeStep = steps[currentStepIndex] || steps[steps.length - 1];
    const isProcessing = data.step !== 'generating' && data.step !== 'idle';

    const getStatusText = () => {
        if (data.step === 'generating') return 'پردازش با موفقیت انجام شد';
        if (data.step === 'idle') return 'آماده';
        return activeStep.label + '...';
    };

    return (
        <div className="w-full my-3 border border-slate-200/60 rounded-xl overflow-hidden bg-white/50 backdrop-blur-sm font-sans" dir="rtl">
            {/* Header / Toggle */}
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-3 bg-slate-50/50 hover:bg-slate-100/80 transition-all cursor-pointer"
            >
                <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded-lg border border-slate-200 ${isProcessing ? 'bg-white shadow-sm' : 'bg-slate-100'}`}>
                        {isProcessing ? (
                            <Activity className="w-4 h-4 text-indigo-600 animate-spin" />
                        ) : (
                            <Cpu className="w-4 h-4 text-slate-500" />
                        )}
                    </div>
                    <div className="flex flex-col items-start">
                        <span className="text-xs font-bold text-slate-700 flex items-center gap-2">
                            {getStatusText()}
                            {isProcessing && <span className="flex h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse"></span>}
                        </span>
                        <span className="text-[10px] text-slate-400 font-sans mt-0.5">
                            زمان کل: {toPersianDigits((elapsed / 1000).toFixed(1))} ثانیه
                        </span>
                    </div>
                </div>
                <div className="text-slate-400">
                    {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
            </button>

            {/* Collapsible Content */}
            {isOpen && (
                <div className="bg-slate-900 border-t border-slate-800 p-4 animate-slide-in-from-top-2">
                    {/* Steps Visualization */}
                    <div className="space-y-5 relative">
                        {/* Connecting Line */}
                        <div className="absolute top-4 bottom-4 right-[15px] w-0.5 bg-slate-800 pointer-events-none"></div>

                        {steps.map((step, idx) => {
                            const isDone = currentStepIndex > idx;
                            const isCurrent = currentStepIndex === idx;
                            const isPending = currentStepIndex < idx;

                            return (
                                <div key={step.id} className={`relative flex gap-4 ${isPending ? 'opacity-30 grayscale' : 'opacity-100'} transition-all duration-500`}>
                                    {/* Icon Node */}
                                    <div className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300 shrink-0
                                        ${isCurrent ? `bg-slate-800 border-${step.color.split('-')[1]}-500 shadow-[0_0_10px_currentColor] ${step.color}` : ''}
                                        ${isDone ? 'bg-slate-800 border-slate-600 text-slate-500' : ''}
                                        ${isPending ? 'bg-slate-900 border-slate-800 text-slate-700' : ''}
                                    `}>
                                        <step.icon className="w-4 h-4" />
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 pt-1 min-w-0 text-right">
                                        <h4 className={`text-xs font-bold ${isCurrent ? 'text-slate-200' : 'text-slate-500'}`}>
                                            {step.label}
                                        </h4>
                                        
                                        {/* Step Details */}
                                        {step.id === 'analyzing' && (isCurrent || isDone) && data.expandedQuery && (
                                            <div className="mt-2 p-2 rounded bg-indigo-950/40 border border-indigo-900/50 flex flex-col gap-1.5 animate-fade-in">
                                                <div className="flex items-center gap-1.5 text-[9px] text-indigo-300 font-bold uppercase tracking-wider">
                                                    <Zap className="w-3 h-3" />
                                                    هسته معنایی (AI Intent)
                                                </div>
                                                <div className="text-[10px] text-slate-200 leading-5">
                                                    {data.expandedQuery}
                                                </div>
                                            </div>
                                        )}

                                        {step.id === 'vectorizing' && (isCurrent || isDone) && data.extractedKeywords && (
                                            <div className="mt-2 flex flex-wrap gap-1.5 animate-fade-in">
                                                {data.extractedKeywords.slice(0, 6).map((k, i) => (
                                                    <span key={i} className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-blue-300 text-[9px]">
                                                        {k}
                                                    </span>
                                                ))}
                                            </div>
                                        )}

                                        {step.id === 'searching' && (isCurrent || isDone) && data.retrievedCandidates && (
                                            <div className="mt-2 space-y-1 animate-fade-in">
                                                {data.retrievedCandidates.slice(0, 2).map((doc, i) => (
                                                    <div key={i} className="flex items-center justify-between text-[9px] text-slate-400 bg-slate-800/50 p-1 rounded border border-slate-700/50">
                                                        <span className="truncate max-w-[120px]">{doc.title}</span>
                                                        <span className="text-amber-300 font-mono">{doc.score.toFixed(2)}</span>
                                                    </div>
                                                ))}
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
