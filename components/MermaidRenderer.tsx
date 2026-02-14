
import React, { useEffect, useRef, useState } from 'react';
import { Loader2, AlertCircle, Download, FileCode } from 'lucide-react';

const MERMAID_CDN = 'https://esm.sh/mermaid@10.9.1';

interface MermaidRendererProps {
    code: string;
}

const MermaidRenderer: React.FC<MermaidRendererProps> = ({ code }) => {
    const [svg, setSvg] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const renderDiagram = async () => {
            if (!code) return;
            setLoading(true);
            setError(null);
            try {
                // Dynamically import mermaid to bypass Vite's static analysis error
                // @ts-ignore
                const { default: mermaid } = await import(/* @vite-ignore */ MERMAID_CDN);
                
                const isDark = document.documentElement.classList.contains('dark');
                mermaid.initialize({
                    startOnLoad: false,
                    theme: isDark ? 'dark' : 'default',
                    securityLevel: 'loose',
                    fontFamily: 'Vazirmatn, sans-serif',
                    themeVariables: {
                        primaryColor: '#6366f1',
                        lineColor: isDark ? '#475569' : '#cbd5e1',
                    }
                });

                const id = `mermaid-${Math.random().toString(36).substring(2, 11)}`;
                const { svg } = await mermaid.render(id, code);
                setSvg(svg);
            } catch (err: any) {
                console.error('Mermaid render error:', err);
                setError('خطا در رسم نمودار. لطفاً ساختار کد را بررسی کنید.');
            } finally {
                setLoading(false);
            }
        };

        renderDiagram();
    }, [code]);

    const downloadSvg = () => {
        if (!svg) return;
        const blob = new Blob([svg], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `rayan-diagram-${Date.now()}.svg`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="my-6 relative group w-full">
            <div className="flex items-center justify-between mb-2 px-1">
                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 dark:text-surface-500 uppercase tracking-widest">
                    <FileCode className="w-3 h-3" />
                    نمودار فرآیند (Flowchart)
                </div>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                    <button 
                        onClick={downloadSvg}
                        className="p-1.5 bg-white dark:bg-surface-800 hover:bg-slate-100 dark:hover:bg-surface-700 rounded-lg border border-slate-200 dark:border-white/5 text-slate-400 hover:text-brand-500 transition-colors shadow-sm"
                        title="دانلود به عنوان تصویر"
                    >
                        <Download className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            <div className="bg-slate-50/50 dark:bg-surface-900/30 rounded-2xl border border-slate-200 dark:border-white/5 overflow-hidden transition-all duration-300">
                <div className="p-6 overflow-x-auto custom-scrollbar flex justify-center min-h-[120px] items-center">
                    {loading ? (
                        <div className="flex flex-col items-center gap-3 text-slate-400">
                            <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
                            <span className="text-xs font-medium">در حال تولید نمودار...</span>
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center gap-2 text-red-500 py-4">
                            <AlertCircle className="w-6 h-6" />
                            <span className="text-xs font-bold">{error}</span>
                        </div>
                    ) : (
                        <div 
                            className="w-full transition-all animate-fade-in flex justify-center" 
                            dangerouslySetInnerHTML={{ __html: svg }} 
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

export default MermaidRenderer;
