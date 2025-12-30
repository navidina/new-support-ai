
import React from 'react';
import { Network, History, Plus, Settings, HelpCircle, ClipboardCheck, Book, Trash2, MessageSquare, Sparkles, Box, Share2, Workflow, GitMerge, Orbit, Ticket } from 'lucide-react';
import { Conversation, GraphLayoutMode } from '../types';
import Button from './Button';

interface SidebarProps {
  conversations?: Conversation[];
  currentConversationId?: string;
  activeView?: 'chat' | 'graph';
  activeGraphLayout?: GraphLayoutMode;
  onGraphLayoutChange?: (mode: GraphLayoutMode) => void;
  onViewChange?: (mode: 'chat' | 'graph') => void;
  onSelectConversation?: (id: string) => void;
  onNewChat?: () => void;
  onDeleteConversation?: (id: string) => void;
  onOpenSettings?: () => void;
  onOpenHelp?: () => void;
  onOpenWiki?: () => void;
  onOpenBenchmark?: () => void;
  totalChunks?: number;
  lastBenchmarkScore?: number | null;
}

const graphModes = [
    { id: 'tickets', label: 'تحلیل تیکت‌ها (Ticket Analysis)', icon: Ticket, desc: 'توزیع و فراوانی مشکلات در سیستم‌ها' },
    { id: 'galaxy', label: 'کهکشان دانش (Galaxy)', icon: Orbit, desc: 'تراکم و حجم دانش به صورت خوشه‌ها' },
    { id: 'schema', label: 'طرح‌واره (Schema)', icon: Box, desc: 'ساختار سیستم‌ها و مشکلات' },
    { id: 'tree', label: 'سلسله‌مراتب (Hierarchy)', icon: Workflow, desc: 'نمایش درختی بالا به پایین' },
    { id: 'graphrag', label: 'گراف دانش (GraphRAG)', icon: GitMerge, desc: 'موجودیت‌ها و روابط معنایی' },
];

const Sidebar: React.FC<SidebarProps> = ({ 
    conversations = [],
    currentConversationId,
    activeView = 'chat', 
    activeGraphLayout = 'schema',
    onGraphLayoutChange,
    onViewChange,
    onSelectConversation,
    onNewChat,
    onDeleteConversation,
    onOpenSettings,
    onOpenHelp,
    onOpenWiki,
    onOpenBenchmark,
}) => {

  return (
    <div className="w-80 h-full flex flex-col bg-slate-50/80 dark:bg-surface-900/60 backdrop-blur-xl border-l border-slate-200 dark:border-white/5 relative font-sans text-slate-600 dark:text-surface-300 transition-colors duration-300">
      
      {/* Brand Header */}
      <div className="p-6 pb-2 z-10">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-gradient-to-br from-brand-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-brand-500/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-800 dark:text-white tracking-tight leading-none">رایان هم‌افزا</h1>
            <span className="text-[10px] text-brand-600 dark:text-brand-300 font-medium tracking-wide uppercase">Enterprise AI</span>
          </div>
        </div>

        {/* Primary Actions */}
        {activeView === 'chat' && onNewChat && (
            <button 
              className="w-full flex items-center gap-3 px-4 py-3 mb-6 bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white rounded-xl shadow-lg shadow-brand-900/10 dark:shadow-brand-900/50 transition-all transform active:scale-95 group font-bold text-sm" 
              onClick={onNewChat}
            >
              <div className="bg-white/20 p-1 rounded-lg">
                  <Plus className="w-4 h-4" />
              </div>
              <span>گفتگوی جدید</span>
            </button>
        )}

        {/* View Switcher */}
        {onViewChange && (
            <div className="bg-white/50 dark:bg-surface-950/50 p-1 rounded-xl flex gap-1 mb-2 border border-slate-200 dark:border-white/5">
                <button 
                    onClick={() => onViewChange('chat')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all duration-300 ${
                        activeView === 'chat' 
                        ? 'bg-white dark:bg-surface-800 text-slate-900 dark:text-white shadow-sm ring-1 ring-black/5 dark:ring-white/10' 
                        : 'text-slate-500 dark:text-surface-500 hover:text-slate-700 dark:hover:text-surface-300'
                    }`}
                >
                    <MessageSquare className="w-4 h-4" />
                    چت
                </button>
                <button 
                    onClick={() => onViewChange('graph')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all duration-300 ${
                        activeView === 'graph' 
                        ? 'bg-white dark:bg-surface-800 text-slate-900 dark:text-white shadow-sm ring-1 ring-black/5 dark:ring-white/10' 
                        : 'text-slate-500 dark:text-surface-500 hover:text-slate-700 dark:hover:text-surface-300'
                    }`}
                >
                    <Network className="w-4 h-4" />
                    گراف
                </button>
            </div>
        )}
      </div>

      {/* List Content (Chat History OR Graph Options) */}
      <div className="flex-1 overflow-y-auto px-4 py-2 custom-scrollbar space-y-1 z-10">
            {activeView === 'chat' ? (
                <>
                    <div className="text-[10px] font-bold text-slate-400 dark:text-surface-500 px-2 mb-2 uppercase tracking-widest flex items-center gap-2">
                        <History className="w-3 h-3" />
                        تاریخچه
                    </div>
                    
                    {conversations.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 opacity-30 border border-dashed border-slate-300 dark:border-surface-700 rounded-xl mt-2">
                            <MessageSquare className="w-6 h-6 mb-2 text-slate-500" />
                            <span className="text-xs text-slate-500">خالی</span>
                        </div>
                    ) : (
                        conversations.map((conv) => (
                            <div 
                                key={conv.id}
                                onClick={() => onSelectConversation?.(conv.id)}
                                className={`group relative p-3 rounded-xl cursor-pointer transition-all duration-200 border border-transparent ${
                                    currentConversationId === conv.id 
                                    ? 'bg-white dark:bg-brand-500/10 text-brand-700 dark:text-white border-brand-200 dark:border-brand-500/20 shadow-sm dark:shadow-[0_0_15px_-5px_rgba(99,102,241,0.3)]' 
                                    : 'text-slate-500 dark:text-surface-400 hover:bg-white dark:hover:bg-surface-800 hover:text-slate-700 dark:hover:text-surface-200'
                                }`}
                            >
                                {/* Active Indicator */}
                                {currentConversationId === conv.id && (
                                    <div className="absolute right-0 top-3 bottom-3 w-1 bg-brand-500 rounded-l-full shadow-[0_0_8px_#6366f1]"></div>
                                )}
                                
                                <h4 className={`text-xs font-medium line-clamp-1 mb-1 leading-relaxed ${currentConversationId === conv.id ? 'pr-2' : ''}`}>
                                    {conv.title}
                                </h4>
                                <div className={`flex items-center justify-between text-[10px] opacity-50 font-sans ${currentConversationId === conv.id ? 'pr-2' : ''}`}>
                                    <span>
                                        {new Date(conv.lastUpdated).toLocaleDateString('fa-IR')}
                                    </span>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); onDeleteConversation?.(conv.id); }}
                                        className="p-1 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                        title="حذف"
                                    >
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </>
            ) : (
                <>
                    <div className="text-[10px] font-bold text-slate-400 dark:text-surface-500 px-2 mb-2 uppercase tracking-widest flex items-center gap-2">
                        <Network className="w-3 h-3" />
                        الگوی نمایش گراف
                    </div>
                    
                    <div className="space-y-2 mt-2">
                        {graphModes.map((mode) => (
                            <button
                                key={mode.id}
                                onClick={() => onGraphLayoutChange?.(mode.id as GraphLayoutMode)}
                                className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-right border ${
                                    activeGraphLayout === mode.id
                                    ? 'bg-white dark:bg-brand-500/10 text-brand-700 dark:text-white border-brand-200 dark:border-brand-500/30 shadow-sm dark:shadow-neon'
                                    : 'bg-transparent text-slate-500 dark:text-surface-400 border-transparent hover:bg-white dark:hover:bg-surface-800 hover:text-slate-700 dark:hover:text-surface-200'
                                }`}
                            >
                                <div className={`p-2 rounded-lg ${activeGraphLayout === mode.id ? 'bg-brand-600 text-white' : 'bg-slate-200 dark:bg-surface-800 text-slate-500 dark:text-surface-500'}`}>
                                    <mode.icon className="w-4 h-4" />
                                </div>
                                <div>
                                    <span className="block text-xs font-bold">{mode.label}</span>
                                    <span className="block text-[10px] opacity-60 mt-0.5">{mode.desc}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                </>
            )}
      </div>

      {/* Footer / Tools */}
      <div className="p-4 border-t border-slate-200 dark:border-white/5 bg-slate-100/50 dark:bg-surface-950/30 z-10">
         <div className="grid grid-cols-2 gap-2 mb-3">
             <button onClick={onOpenBenchmark} className="flex flex-col items-center justify-center p-3 rounded-xl bg-white dark:bg-surface-800/50 hover:bg-slate-50 dark:hover:bg-surface-800 border border-slate-200 dark:border-white/5 hover:border-brand-300 dark:hover:border-white/10 transition-all group shadow-sm">
                <ClipboardCheck className="w-5 h-5 text-brand-600 dark:text-brand-400 mb-1 group-hover:scale-110 transition-transform drop-shadow-[0_0_5px_rgba(129,140,248,0.5)]" />
                <span className="text-[10px] font-bold text-slate-600 dark:text-surface-300">بنچمارک</span>
             </button>
             <button onClick={onOpenWiki} className="flex flex-col items-center justify-center p-3 rounded-xl bg-white dark:bg-surface-800/50 hover:bg-slate-50 dark:hover:bg-surface-800 border border-slate-200 dark:border-white/5 hover:border-emerald-300 dark:hover:border-white/10 transition-all group shadow-sm">
                <Book className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mb-1 group-hover:scale-110 transition-transform drop-shadow-[0_0_5px_rgba(52,211,153,0.5)]" />
                <span className="text-[10px] font-bold text-slate-600 dark:text-surface-300">مخزن دانش</span>
             </button>
         </div>

         <div className="flex items-center gap-2">
             <button onClick={onOpenSettings} className="flex-1 flex items-center justify-center gap-2 p-2.5 rounded-xl bg-white dark:bg-surface-800/50 hover:bg-slate-50 dark:hover:bg-surface-700 text-xs font-medium text-slate-500 dark:text-surface-400 hover:text-slate-800 dark:hover:text-white transition-colors shadow-sm dark:shadow-none border border-slate-200 dark:border-transparent">
                <Settings className="w-4 h-4" />
                <span>تنظیمات</span>
             </button>
             <button onClick={onOpenHelp} className="flex-1 flex items-center justify-center gap-2 p-2.5 rounded-xl bg-white dark:bg-surface-800/50 hover:bg-slate-50 dark:hover:bg-surface-700 text-xs font-medium text-slate-500 dark:text-surface-400 hover:text-slate-800 dark:hover:text-white transition-colors shadow-sm dark:shadow-none border border-slate-200 dark:border-transparent">
                <HelpCircle className="w-4 h-4" />
                <span>راهنما</span>
             </button>
         </div>
      </div>
    </div>
  );
};

export default Sidebar;
