
import React, { useEffect, useState } from 'react';
import { Database, FileText, Cpu, Layers, Terminal, Sparkles, CheckCircle2, Loader2, Zap, BrainCircuit, XCircle, Minimize2, Server } from 'lucide-react';
import { toPersianDigits } from '../services/textProcessor';

interface ProcessingOverlayProps {
  isOpen: boolean;
  currentStatus: string;
  processedFilesCount: number;
  totalFilesCount: number;
  totalChunks: number;
  onCancel?: () => void;
  onMinimize?: () => void;
}

const steps = [
    { id: 'read', label: 'خواندن فایل', icon: FileText, color: 'text-blue-500', bg: 'bg-blue-100' },
    { id: 'clean', label: 'NLP & تمیزسازی', icon: Sparkles, color: 'text-amber-500', bg: 'bg-amber-100' },
    { id: 'chunk', label: 'قطعه‌بندی معنایی', icon: Layers, color: 'text-violet-500', bg: 'bg-violet-100' },
    { id: 'embed', label: 'بردارسازی (Vector)', icon: BrainCircuit, color: 'text-emerald-500', bg: 'bg-emerald-100' },
];

export const ProcessingOverlay: React.FC<ProcessingOverlayProps> = ({ 
    isOpen, 
    currentStatus, 
    processedFilesCount, 
    totalFilesCount, 
    totalChunks,
    onCancel,
    onMinimize
}) => {
    const [logs, setLogs] = useState<string[]>([]);
    const [activeStep, setActiveStep] = useState(0);

    useEffect(() => {
        if (!isOpen) {
            setLogs([]);
            return;
        }
        
        if (currentStatus) {
            setLogs(prev => [...prev.slice(-6), `> ${currentStatus}`]); 
            
            if (currentStatus.includes('reading') || currentStatus.includes('آنالیز')) setActiveStep(0);
            else if (currentStatus.includes('Clean')) setActiveStep(1);
            else if (currentStatus.includes('Processing') || currentStatus.includes('Chunk')) setActiveStep(2);
            else if (currentStatus.includes('embedding') || currentStatus.includes('بردار')) setActiveStep(3);
        }
    }, [currentStatus, isOpen]);

    if (!isOpen) return null;

    const progressPercent = totalFilesCount > 0 
        ? Math.min(100, Math.round((processedFilesCount / totalFilesCount) * 100)) 
        : 0;

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/90 backdrop-blur-xl transition-all duration-300 font-sans" dir="rtl">
            
            {/* CSS Animations for the Funnel */}
            <style>{`
                @keyframes float-file {
                    0% { transform: translateY(-40px) translateX(0) rotate(0deg); opacity: 0; }
                    20% { opacity: 1; }
                    100% { transform: translateY(120px) translateX(var(--tx)) rotate(var(--rot)); opacity: 0; scale: 0.5; }
                }
                @keyframes binary-stream {
                    0% { transform: translateY(0); opacity: 0; }
                    20% { opacity: 1; }
                    100% { transform: translateY(100px); opacity: 0; }
                }
                @keyframes pulse-ring {
                    0% { transform: scale(0.8); opacity: 0.5; }
                    50% { transform: scale(1.1); opacity: 0.2; }
                    100% { transform: scale(0.8); opacity: 0.5; }
                }
                @keyframes spin-slow {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                @keyframes scan-line {
                    0% { top: 0%; opacity: 0; }
                    50% { opacity: 1; }
                    100% { top: 100%; opacity: 0; }
                }
                .file-particle {
                    animation: float-file 3s infinite linear;
                }
                .binary-particle {
                    animation: binary-stream 1.5s infinite linear;
                }
            `}</style>

            <div className="w-full max-w-5xl bg-white/95 rounded-3xl shadow-2xl overflow-hidden border border-white/20 relative flex flex-col md:flex-row h-[600px]">
                
                {/* --- LEFT SIDE: THE VISUALIZATION --- */}
                <div className="w-full md:w-5/12 bg-slate-900 relative flex flex-col items-center justify-center overflow-hidden border-l border-slate-700">
                    
                    {/* Background Grid */}
                    <div className="absolute inset-0 opacity-10" 
                         style={{ backgroundImage: 'linear-gradient(#4f46e5 1px, transparent 1px), linear-gradient(90deg, #4f46e5 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
                    </div>

                    {/* --- THE FUNNEL ANIMATION --- */}
                    <div className="relative w-64 h-96 flex flex-col items-center z-10">
                        
                        {/* 1. INPUT ZONE (Files Falling) */}
                        <div className="relative w-full h-32 mb-[-20px] overflow-visible">
                            {[...Array(6)].map((_, i) => (
                                <div 
                                    key={`file-${i}`}
                                    className="absolute top-0 left-1/2 file-particle text-slate-300"
                                    style={{
                                        left: '50%',
                                        marginLeft: `${(Math.random() - 0.5) * 100}px`,
                                        animationDelay: `${Math.random() * 2}s`,
                                        '--tx': `${(Math.random() - 0.5) * 30}px`,
                                        '--rot': `${(Math.random() - 0.5) * 45}deg`
                                    } as any}
                                >
                                    <div className="w-8 h-10 bg-slate-700 border border-slate-500 rounded flex items-center justify-center shadow-lg">
                                        <FileText className="w-4 h-4 text-blue-400" />
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* 2. THE FUNNEL (Processing) */}
                        <div className="relative w-48 h-40 z-20">
                            {/* Spinning Rings (Holographic effect) */}
                            <div className="absolute inset-0 border-t-2 border-cyan-500/50 rounded-full animate-[spin-slow_4s_linear_infinite]"></div>
                            <div className="absolute inset-2 border-b-2 border-purple-500/50 rounded-full animate-[spin-slow_3s_linear_infinite_reverse]"></div>
                            
                            {/* Glass Funnel Body */}
                            <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-[0_0_15px_rgba(59,130,246,0.5)]">
                                <defs>
                                    <linearGradient id="funnelGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                                        <stop offset="0%" stopColor="rgba(30, 41, 59, 0.1)" />
                                        <stop offset="50%" stopColor="rgba(59, 130, 246, 0.2)" />
                                        <stop offset="100%" stopColor="rgba(6, 182, 212, 0.4)" />
                                    </linearGradient>
                                </defs>
                                <path d="M10,10 L90,10 L60,90 L40,90 Z" fill="url(#funnelGrad)" stroke="rgba(59, 130, 246, 0.5)" strokeWidth="1" />
                                {/* Laser Scan Line */}
                                <rect x="30" y="10" width="40" height="2" fill="#4f46e5" className="animate-[scan-line_2s_linear_infinite]" />
                            </svg>

                            {/* Center Glow */}
                            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-[0_0_20px_#fff] animate-pulse"></div>
                        </div>

                        {/* 3. OUTPUT ZONE (Binary Stream) */}
                        <div className="relative w-16 h-32 mt-[-5px] overflow-hidden flex justify-center">
                            {[...Array(8)].map((_, i) => (
                                <div 
                                    key={`bin-${i}`}
                                    className="absolute top-0 binary-particle text-[10px] font-mono font-bold text-emerald-400"
                                    style={{
                                        left: `${Math.random() * 80}%`,
                                        animationDelay: `${Math.random() * 1.5}s`,
                                        animationDuration: `${0.8 + Math.random()}s`
                                    }}
                                >
                                    {Math.random() > 0.5 ? '۱' : '۰'}
                                </div>
                            ))}
                        </div>

                        {/* 4. DATABASE (Target) */}
                        <div className="relative mt-[-20px] z-30">
                            <div className="absolute inset-0 bg-emerald-500/20 blur-xl rounded-full animate-pulse"></div>
                            <Server className="w-16 h-16 text-emerald-500 relative z-10 drop-shadow-2xl" />
                            <div className="absolute -bottom-2 -right-2 bg-slate-800 text-emerald-400 text-xs px-2 py-0.5 rounded-full border border-emerald-500/50 shadow-lg font-mono">
                                DB
                            </div>
                        </div>

                    </div>

                    <div className="mt-6 text-center z-10">
                        <h3 className="text-white font-bold text-lg flex items-center justify-center gap-2">
                            <Cpu className="w-5 h-5 text-cyan-400 animate-spin" />
                            پردازش هوشمند
                        </h3>
                        <p className="text-slate-400 text-xs mt-1">تبدیل اسناد به بردارهای دانش</p>
                    </div>
                </div>

                {/* --- RIGHT SIDE: STATS & LOGS --- */}
                <div className="w-full md:w-7/12 p-8 flex flex-col bg-slate-50/50">
                    
                    {/* Header */}
                    <div className="mb-8">
                        <h2 className="text-2xl font-black text-slate-800 mb-2 flex items-center gap-3">
                            <Layers className="w-7 h-7 text-indigo-600" />
                            در حال ساخت پایگاه دانش
                        </h2>
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                            هوش مصنوعی در حال مطالعه مستندات شماست
                        </div>
                    </div>

                    {/* Progress Circle & Stats */}
                    <div className="grid grid-cols-2 gap-4 mb-8">
                        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm flex items-center gap-4">
                            <div className="relative w-16 h-16 flex-shrink-0">
                                <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                                    <path className="text-slate-100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" />
                                    <path className="text-indigo-600 transition-all duration-500 ease-out" strokeDasharray={`${progressPercent}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-indigo-700">
                                    {toPersianDigits(progressPercent)}٪
                                </div>
                            </div>
                            <div>
                                <div className="text-xs text-slate-400 font-bold uppercase tracking-wider">پیشرفت فایل‌ها</div>
                                <div className="text-xl font-black text-slate-800">
                                    {toPersianDigits(processedFilesCount)} <span className="text-sm font-medium text-slate-400">/ {toPersianDigits(totalFilesCount)}</span>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm flex flex-col justify-center">
                            <div className="flex items-center gap-2 mb-1">
                                <Database className="w-4 h-4 text-emerald-500" />
                                <span className="text-xs text-slate-400 font-bold uppercase">Chunks ذخیره شده</span>
                            </div>
                            <div className="text-2xl font-black text-slate-800">
                                {toPersianDigits(totalChunks)}
                            </div>
                        </div>
                    </div>

                    {/* Pipeline Steps (Compact) */}
                    <div className="grid grid-cols-4 gap-2 mb-6">
                        {steps.map((step, idx) => {
                            const isActive = idx === activeStep;
                            const isCompleted = idx < activeStep;
                            return (
                                <div key={step.id} className={`flex flex-col items-center p-2 rounded-lg transition-all ${isActive ? 'bg-white shadow-md scale-105 border border-slate-100' : 'opacity-60'}`}>
                                    <step.icon className={`w-5 h-5 mb-1 ${isActive ? step.color : 'text-slate-400'}`} />
                                    <span className="text-[9px] font-bold text-slate-600">{step.label.split(' ')[0]}</span>
                                </div>
                            )
                        })}
                    </div>

                    {/* Terminal Logs */}
                    <div className="flex-1 bg-slate-900 rounded-xl p-3 font-mono text-[10px] text-green-400 shadow-inner border border-slate-800 flex flex-col overflow-hidden relative">
                        <div className="absolute top-2 right-3 text-slate-600 flex items-center gap-1">
                            <Terminal className="w-3 h-3" /> LOG
                        </div>
                        <div className="flex-1 flex flex-col justify-end space-y-1">
                            {logs.map((log, i) => (
                                <div key={i} className="truncate opacity-80 animate-in slide-in-from-left-2 fade-in duration-300">
                                    <span className="text-slate-500 mr-2">[{new Date().toLocaleTimeString('fa-IR')}]</span>
                                    {log}
                                </div>
                            ))}
                            <div className="flex items-center gap-1 text-green-500 animate-pulse">
                                <span className="w-1 h-3 bg-green-500 block"></span>
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="mt-4 flex gap-3">
                        {onMinimize && (
                            <button 
                                onClick={onMinimize}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold rounded-xl transition-all hover:shadow-sm"
                            >
                                <Minimize2 className="w-4 h-4" />
                                ادامه در پس‌زمینه
                            </button>
                        )}
                        
                        {onCancel && (
                            <button 
                                onClick={onCancel}
                                className="flex items-center justify-center gap-2 px-4 py-3 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-xs font-bold rounded-xl transition-colors"
                            >
                                <XCircle className="w-4 h-4" />
                                توقف
                            </button>
                        )}
                    </div>

                </div>
            </div>
        </div>
    );
};
