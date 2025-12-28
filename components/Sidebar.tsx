
import React from 'react';
import { Network, History, Plus, Settings, HelpCircle, ClipboardCheck, Book, Trash2, MessageSquare, Sparkles, Box, Share2, Workflow, GitMerge } from 'lucide-react';
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
    { id: 'schema', label: 'طرح‌واره (Schema)', icon: Box, desc: 'نمایش ساختار سیستم‌ها و مشکلات' },
    { id: 'tree', label: 'سلسله‌مراتب (Hierarchy)', icon: Workflow, desc: 'نمایش درختی بالا به پایین' },
    { id: 'graphrag', label: 'گراف دانش سازمانی (GraphRAG)', icon: GitMerge, desc: 'نمایش موجودیت‌ها و روابط خوشه‌بندی شده' },
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
    <div className="w-80 h-full flex flex-col bg-brand-950 text-surface-300 border-l border-brand-900 relative font-sans">
      
      {/* Brand Header */}
      <div className="p-6 pb-2 z-10">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-gradient-to-br from-brand-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-brand-500/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black text-white tracking-tight leading-none">رایان هم‌افزا</h1>
            <span className="text-[10px] text-surface-400 font-medium tracking-wide">Enterprise AI Assistant</span>
          </div>
        </div>

        {/* Primary Actions */}
        {activeView === 'chat' && onNewChat && (
            <Button 
              variant="secondary" 
              className="w-full justify-start mb-6 bg-white hover:bg-surface-50 text-brand-900 border-none shadow-md" 
              onClick={onNewChat}
              icon={<Plus className="w-5 h-5 text-brand-600" />}
            >
              گفتگوی جدید
            </Button>
        )}

        {/* View Switcher */}
        {onViewChange && (
            <div className="bg-brand-900/50 p-1 rounded-xl flex gap-1 mb-2 border border-brand-800">
                <button 
                    onClick={() => onViewChange('chat')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all duration-300 ${
                        activeView === 'chat' 
                        ? 'bg-brand-800 text-white shadow-sm ring-1 ring-brand-700' 
                        : 'text-surface-500 hover:text-surface-300'
                    }`}
                >
                    <MessageSquare className="w-4 h-4" />
                    چت
                </button>
                <button 
                    onClick={() => onViewChange('graph')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all duration-300 ${
                        activeView === 'graph' 
                        ? 'bg-brand-800 text-white shadow-sm ring-1 ring-brand-700' 
                        : 'text-surface-500 hover:text-surface-300'
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
                    <div className="text-[10px] font-bold text-surface-500 px-2 mb-2 uppercase tracking-wider flex items-center gap-2">
                        <History className="w-3 h-3" />
                        تاریخچه گفتگوها
                    </div>
                    
                    {conversations.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 opacity-30 border-2 border-dashed border-brand-800 rounded-xl mt-2">
                            <MessageSquare className="w-6 h-6 mb-2" />
                            <span className="text-xs">خالی</span>
                        </div>
                    ) : (
                        conversations.map((conv) => (
                            <div 
                                key={conv.id}
                                onClick={() => onSelectConversation?.(conv.id)}
                                className={`group relative p-3 rounded-xl cursor-pointer transition-all duration-200 border border-transparent ${
                                    currentConversationId === conv.id 
                                    ? 'bg-brand-600/10 text-white border-brand-500/20' 
                                    : 'text-surface-400 hover:bg-brand-800 hover:text-surface-200'
                                }`}
                            >
                                <h4 className="text-xs font-medium line-clamp-1 mb-1 leading-relaxed">
                                    {conv.title}
                                </h4>
                                <div className="flex items-center justify-between text-[10px] opacity-50 font-mono">
                                    <span>
                                        {new Date(conv.lastUpdated).toLocaleDateString('fa-IR')}
                                    </span>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); onDeleteConversation?.(conv.id); }}
                                        className="p-1 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
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
                    <div className="text-[10px] font-bold text-surface-500 px-2 mb-2 uppercase tracking-wider flex items-center gap-2">
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
                                    ? 'bg-brand-800 text-white border-brand-700 shadow-lg'
                                    : 'bg-transparent text-surface-400 border-transparent hover:bg-brand-900 hover:text-surface-200'
                                }`}
                            >
                                <div className={`p-2 rounded-lg ${activeGraphLayout === mode.id ? 'bg-brand-700' : 'bg-brand-900'}`}>
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
      <div className="p-4 border-t border-brand-900 bg-brand-950 z-10">
         <div className="grid grid-cols-2 gap-2 mb-3">
             <button onClick={onOpenBenchmark} className="flex flex-col items-center justify-center p-3 rounded-xl bg-brand-900 hover:bg-brand-800 border border-brand-800 transition-all group">
                <ClipboardCheck className="w-5 h-5 text-brand-400 mb-1 group-hover:scale-110 transition-transform" />
                <span className="text-[10px] font-bold text-surface-300">بنچمارک</span>
             </button>
             <button onClick={onOpenWiki} className="flex flex-col items-center justify-center p-3 rounded-xl bg-brand-900 hover:bg-brand-800 border border-brand-800 transition-all group">
                <Book className="w-5 h-5 text-emerald-400 mb-1 group-hover:scale-110 transition-transform" />
                <span className="text-[10px] font-bold text-surface-300">مخزن دانش</span>
             </button>
         </div>

         <div className="flex items-center gap-2">
             <button onClick={onOpenSettings} className="flex-1 flex items-center justify-center gap-2 p-2.5 rounded-xl bg-brand-900 hover:bg-brand-800 text-xs font-medium text-surface-400 hover:text-white transition-colors">
                <Settings className="w-4 h-4" />
                <span>تنظیمات</span>
             </button>
             <button onClick={onOpenHelp} className="flex-1 flex items-center justify-center gap-2 p-2.5 rounded-xl bg-brand-900 hover:bg-brand-800 text-xs font-medium text-surface-400 hover:text-white transition-colors">
                <HelpCircle className="w-4 h-4" />
                <span>راهنما</span>
             </button>
         </div>
      </div>
    </div>
  );
};

export default Sidebar;
