
import React, { useMemo, useState, useRef } from 'react';
import { X, BarChart2, TrendingUp, Calendar, Database, Activity, PieChart } from 'lucide-react';
import { KnowledgeChunk } from '../types';

interface MetricsModalProps {
  isOpen: boolean;
  onClose: () => void;
  chunks: KnowledgeChunk[];
}

const MetricsModal: React.FC<MetricsModalProps> = ({ isOpen, onClose, chunks }) => {
  const [tooltipData, setTooltipData] = useState<{ x: number; y: number; label: string; value: number } | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  const stats = useMemo(() => {
    if (!chunks.length) return {
        totalChunks: 0,
        totalFiles: 0,
        lastIndexed: '-',
        avgChunkSize: 0,
        data: [] as { time: string; count: number }[]
    };

    const sortedChunks = [...chunks].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    
    // Calculate basic stats
    const totalChunks = chunks.length;
    // Safely access source.id with optional chaining and fallback
    const totalFiles = new Set(chunks.map(c => c.source?.id || 'Unknown')).size;
    const lastIndexedDate = sortedChunks[totalChunks - 1]?.createdAt;
    const lastIndexed = lastIndexedDate ? new Date(lastIndexedDate).toLocaleString('fa-IR') : '-';
    const totalSize = chunks.reduce((acc, c) => acc + (c.content?.length || 0), 0);
    const avgChunkSize = totalChunks > 0 ? Math.round(totalSize / totalChunks) : 0;

    // Prepare Chart Data (Cumulative)
    const timeData: { time: string; count: number }[] = [];
    const firstTime = sortedChunks[0]?.createdAt || 0;
    const lastTime = sortedChunks[sortedChunks.length - 1]?.createdAt || 0;
    const spanHours = (lastTime - firstTime) / (1000 * 60 * 60);
    const useTimeFormat = spanHours < 48;

    let cumulative = 0;
    const groupedMap = new Map<string, number>();

    sortedChunks.forEach(c => {
        if (!c.createdAt) return;
        const d = new Date(c.createdAt);
        let key;
        if (useTimeFormat) {
            key = d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
        } else {
            key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
        groupedMap.set(key, (groupedMap.get(key) || 0) + 1);
    });

    Array.from(groupedMap.entries()).forEach(([key, count]) => {
        cumulative += count;
        timeData.push({ time: key, count: cumulative });
    });

    if (timeData.length === 1) {
        timeData.unshift({ time: 'Start', count: 0 });
    }

    return { totalChunks, totalFiles, lastIndexed, avgChunkSize, data: timeData };
  }, [chunks]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
      if (!chartRef.current || stats.data.length === 0) return;
      const rect = chartRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const width = rect.width;
      
      const index = Math.min(
          stats.data.length - 1, 
          Math.max(0, Math.round((x / width) * (stats.data.length - 1)))
      );
      
      const point = stats.data[index];
      const maxCount = stats.data[stats.data.length - 1].count;
      const height = rect.height;
      const padding = 20;
      const chartHeight = height - padding * 2;
      const y = height - padding - (point.count / maxCount) * chartHeight;

      setTooltipData({
          x: (index / (stats.data.length - 1)) * width,
          y: y,
          label: point.time,
          value: point.count
      });
  };

  const renderChart = () => {
      if (stats.data.length === 0) return null;

      const width = 600; 
      const height = 300;
      const padding = 20;
      const chartWidth = width;
      const chartHeight = height - padding * 2;
      const maxCount = Math.max(1, stats.data[stats.data.length - 1]?.count || 0);

      const points = stats.data.map((d, i) => {
          const x = (i / (stats.data.length - 1)) * chartWidth;
          const y = height - padding - (d.count / maxCount) * chartHeight;
          return `${x},${y}`;
      }).join(' ');

      return (
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
              <defs>
                  <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.5" />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                  </linearGradient>
              </defs>
              <line x1="0" y1={height - padding} x2={width} y2={height - padding} stroke="#e2e8f0" strokeWidth="1" />
              <line x1="0" y1={padding} x2={width} y2={padding} stroke="#e2e8f0" strokeDasharray="4 4" strokeWidth="1" />
              <path d={`M${points.split(' ')[0]} L${points} L${width},${height - padding} L0,${height - padding} Z`} fill="url(#chartGradient)" />
              <polyline points={points} fill="none" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              {stats.data.length < 20 && stats.data.map((d, i) => {
                   const x = (i / (stats.data.length - 1)) * chartWidth;
                   const y = height - padding - (d.count / maxCount) * chartHeight;
                   return <circle key={i} cx={x} cy={y} r="3" fill="#fff" stroke="#3b82f6" strokeWidth="2" />;
              })}
          </svg>
      );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200 font-sans" dir="rtl">
      <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="bg-violet-600 p-2 rounded-lg text-white shadow-lg shadow-violet-500/30"><BarChart2 className="w-6 h-6" /></div>
            <div><h2 className="text-xl font-bold text-slate-800">گزارش عملکرد پایگاه دانش</h2><p className="text-xs text-slate-500 mt-1">آمار و تحلیل داده‌های ایندکس شده</p></div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors"><X className="w-6 h-6" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 custom-scrollbar">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center text-center"><Database className="w-8 h-8 text-blue-500 mb-2 bg-blue-50 p-1.5 rounded-lg" /><span className="text-2xl font-bold text-slate-800">{stats.totalChunks}</span><span className="text-xs text-slate-500">تعداد کل قطعات (Chunks)</span></div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center text-center"><Activity className="w-8 h-8 text-emerald-500 mb-2 bg-emerald-50 p-1.5 rounded-lg" /><span className="text-2xl font-bold text-slate-800">{stats.totalFiles}</span><span className="text-xs text-slate-500">اسناد پردازش شده</span></div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center text-center"><PieChart className="w-8 h-8 text-amber-500 mb-2 bg-amber-50 p-1.5 rounded-lg" /><span className="text-2xl font-bold text-slate-800" dir="ltr">{stats.avgChunkSize}</span><span className="text-xs text-slate-500">میانگین کاراکتر هر قطعه</span></div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center text-center"><Calendar className="w-8 h-8 text-violet-500 mb-2 bg-violet-50 p-1.5 rounded-lg" /><span className="text-sm font-bold text-slate-800 mt-2 mb-1">{stats.lastIndexed}</span><span className="text-xs text-slate-500">آخرین بروزرسانی</span></div>
            </div>
            <div className="grid grid-cols-1 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between mb-6"><h3 className="font-bold text-slate-800 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-blue-600" />روند رشد پایگاه دانش</h3><span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded">تجمعی</span></div>
                    <div className="h-[300px] w-full relative group cursor-crosshair" dir="ltr" ref={chartRef} onMouseMove={handleMouseMove} onMouseLeave={() => setTooltipData(null)}>
                        {stats.data.length > 0 ? (<>{renderChart()}{tooltipData && (<><div className="absolute top-0 bottom-[20px] w-0.5 bg-slate-300 pointer-events-none transition-all duration-75" style={{ left: tooltipData.x }}></div><div className="absolute bg-slate-800 text-white text-xs rounded-lg p-2 shadow-xl pointer-events-none transform -translate-x-1/2 -translate-y-full transition-all duration-75 z-10" style={{ left: tooltipData.x, top: tooltipData.y - 10 }}><div className="font-bold mb-1">{tooltipData.label}</div><div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-blue-400"></span><span>{tooltipData.value} Chunks</span></div></div><div className="absolute w-3 h-3 bg-blue-600 border-2 border-white rounded-full pointer-events-none transition-all duration-75 shadow-sm" style={{ left: tooltipData.x - 6, top: tooltipData.y - 6 }}></div></>)}</>) : (<div className="h-full flex items-center justify-center text-slate-400 text-sm">داده‌ای برای نمایش وجود ندارد</div>)}
                    </div>
                </div>
            </div>
        </div>
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end"><button onClick={onClose} className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors shadow-lg">بستن گزارش</button></div>
      </div>
    </div>
  );
};

export default MetricsModal;
