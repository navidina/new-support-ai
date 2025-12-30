
import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { Send, Menu, X, Sparkles, FolderOpen, AlertTriangle, Database, Globe, Lock, Zap, Briefcase, BarChart } from 'lucide-react';
import Sidebar from './components/Sidebar';
import ChatBubble from './components/ChatBubble';
import KnowledgeGraph from './components/KnowledgeGraph';
import SettingsModal from './components/SettingsModal';
import HelpModal from './components/HelpModal';
import BenchmarkModal from './components/BenchmarkModal';
import KnowledgeWikiModal from './components/KnowledgeWikiModal';
import { ProcessingOverlay } from './components/ProcessingOverlay';
import { ViewMode, GraphLayoutMode, GraphNode } from './types';
import { useRAGApplication } from './hooks/useRAGApplication';
import Button from './components/Button';

function App() {
  const { state, actions } = useRAGApplication();
  
  const [viewMode, setViewMode] = useState<ViewMode>('chat');
  const [graphLayout, setGraphLayout] = useState<GraphLayoutMode>('schema');
  
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isWikiOpen, setIsWikiOpen] = useState(false);
  const [isBenchmarkOpen, setIsBenchmarkOpen] = useState(false);
  const [isBackgroundProcessing, setIsBackgroundProcessing] = useState(false);
  const [totalFilesToProcess, setTotalFilesToProcess] = useState(0);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    if (viewMode === 'chat' && scrollContainerRef.current) {
        const container = scrollContainerRef.current;
        container.scrollTop = container.scrollHeight;
    }
  }, [state.messages, viewMode]);

  useEffect(() => {
      if (!state.isProcessing) setIsBackgroundProcessing(false);
  }, [state.isProcessing]);

  const handleNewChat = () => {
      actions.handleNewChat();
      if (window.innerWidth < 768) setMobileMenuOpen(false);
  };

  const handleSelectConversation = (id: string) => {
      actions.handleSelectConversation(id);
      if (window.innerWidth < 768) setMobileMenuOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      actions.handleSendMessage();
    }
  };

  const onFilesSelectedWrapper = (files: FileList) => {
      const processableCount = Array.from(files).filter(f => 
          f.name.match(/\.(md|txt|json|csv|xml|js|ts|py|log|docx)$/i)
      ).length;
      setTotalFilesToProcess(processableCount);
      setIsBackgroundProcessing(false); 
      actions.handleFilesSelected(files);
  };

  const handleCancel = () => {
      if (confirm('آیا از توقف عملیات مطمئن هستید؟')) {
          actions.handleCancelProcessing();
          setIsBackgroundProcessing(false);
      }
  };

  const handleSuggestionClick = (text: string) => {
      actions.setInputText(text);
      inputRef.current?.focus();
  };

  const handleGraphNodeAction = (action: 'analyze' | 'ask', node: GraphNode) => {
      setViewMode('chat');
      
      let text = '';
      const label = node.fullLabel || node.label;
      
      if (action === 'analyze') {
          // Check if it's a category/cluster or a file
          const isCategory = node.group === 'category' || node.group === 'galaxy-star' || node.group === 'cluster';
          
          if (isCategory) {
              text = `یک گزارش جامع درباره دسته‌بندی «${label}» بنویس و موضوعات اصلی آن را شرح بده.`;
          } else {
              text = `لطفاً سند «${label}» را تحلیل کن و نکات کلیدی آن را استخراج کن.`;
          }
      } else if (action === 'ask') {
          text = `در مورد سند «${label}» چه اطلاعاتی داری؟`;
      }
      
      actions.setInputText(text);
  };

  useEffect(() => {
      if (!state.isProcessing && viewMode === 'chat') {
          setTimeout(() => inputRef.current?.focus(), 100);
      }
  }, [state.isProcessing, viewMode]);

  if (state.isDbLoading) {
      return (
          <div className="flex h-screen items-center justify-center bg-surface-950 text-surface-200 flex-col gap-6 font-sans animate-fade-in relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-tr from-brand-900/40 to-surface-950 opacity-50"></div>
              <div className="relative z-10 flex flex-col items-center">
                  <div className="w-20 h-20 bg-surface-900/50 backdrop-blur-md border border-white/10 rounded-2xl flex items-center justify-center shadow-2xl shadow-brand-500/20 mb-6 animate-bounce">
                      <Sparkles className="w-10 h-10 text-brand-400" />
                  </div>
                  <h3 className="text-xl font-bold text-white tracking-wide">رایان هم‌افزا</h3>
                  <p className="text-sm text-surface-400 mt-2 animate-pulse font-mono">Loading Neural Core...</p>
              </div>
          </div>
      );
  }

  const processedCount = state.docsList.filter(d => d.status === 'indexed' || d.status === 'error').length;
  const displayTotalFiles = Math.max(totalFilesToProcess, state.docsList.length);
  const isFileProcessing = state.isProcessing && state.processingType === 'file';
  const showOverlay = isFileProcessing && !isBackgroundProcessing;

  const quickActions = [
      { icon: <BarChart className="w-5 h-5 text-emerald-400" />, title: "مغایرت مالی", text: "مغایرت مانده مشتری در بک آفیس" },
      { icon: <Globe className="w-5 h-5 text-accent-purple" />, title: "عملیات اجرایی", text: "روش تغییر کارگزار ناظر" }
  ];

  return (
    <div className="flex h-screen bg-surface-950 overflow-hidden font-sans text-surface-100 relative selection:bg-brand-500/30 selection:text-white" dir="rtl">
        
        {/* Dark Mode Aurora Background */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
            <div className="absolute top-[-20%] right-[-10%] w-[800px] h-[800px] bg-brand-600/10 rounded-full blur-[120px] animate-float opacity-60"></div>
            <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] bg-accent-purple/10 rounded-full blur-[100px] animate-float-delayed opacity-50"></div>
            <div className="absolute top-[30%] left-[20%] w-[400px] h-[400px] bg-accent-cyan/5 rounded-full blur-[80px] animate-pulse-slow"></div>
        </div>
      
      {/* Processing Overlay Container */}
      <div className={`transition-opacity duration-500 ${showOverlay ? 'opacity-100 pointer-events-auto z-[70]' : 'opacity-0 pointer-events-none z-0'}`}>
        <ProcessingOverlay 
            isOpen={showOverlay} 
            currentStatus={state.processingStatus}
            processedFilesCount={processedCount}
            totalFilesCount={displayTotalFiles}
            totalChunks={state.customChunks.length}
            onCancel={handleCancel}
            onMinimize={() => setIsBackgroundProcessing(true)}
        />
      </div>

      {mobileMenuOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 md:hidden animate-fade-in" onClick={() => setMobileMenuOpen(false)}></div>
      )}

      <SettingsModal 
          isOpen={isSettingsOpen} 
          onClose={() => setIsSettingsOpen(false)}
          documents={state.docsList}
          onFilesSelected={onFilesSelectedWrapper}
          onClearDB={actions.handleClearDB} 
          onExportDB={actions.handleExportDB}
          onImportDB={actions.handleImportDB}
          fineTuningCount={state.fineTuningCount}
          onExportFineTuning={actions.handleExportFineTuning}
      />
      
      <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
      <KnowledgeWikiModal isOpen={isWikiOpen} onClose={() => setIsWikiOpen(false)} chunks={state.customChunks} />
      <BenchmarkModal isOpen={isBenchmarkOpen} onClose={() => setIsBenchmarkOpen(false)} chunks={state.customChunks} />

      {/* Sidebar */}
      <div className={`fixed inset-y-0 right-0 z-50 transform transition-transform duration-300 md:relative md:transform-none ${mobileMenuOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}`}>
         <Sidebar 
            conversations={state.conversations}
            currentConversationId={state.currentChatId}
            activeView={viewMode}
            activeGraphLayout={graphLayout}
            onGraphLayoutChange={setGraphLayout}
            onViewChange={setViewMode}
            onNewChat={handleNewChat}
            onSelectConversation={handleSelectConversation}
            onDeleteConversation={actions.handleDeleteConversation}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onOpenHelp={() => setIsHelpOpen(true)}
            onOpenWiki={() => setIsWikiOpen(true)}
            onOpenBenchmark={() => setIsBenchmarkOpen(true)}
            totalChunks={state.customChunks.length}
            lastBenchmarkScore={state.lastBenchmarkScore}
         />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full w-full relative z-10">
        
        {/* Mobile Header (Glass) */}
        <header className="md:hidden h-16 bg-surface-900/80 backdrop-blur-md border-b border-white/5 flex items-center justify-between px-4 shrink-0 z-20 sticky top-0">
          <h1 className="font-bold text-white flex items-center gap-2">
             <Sparkles className="w-5 h-5 text-brand-400" />
             <span className="bg-gradient-to-l from-brand-300 to-white bg-clip-text text-transparent">رایان هم‌افزا</span>
          </h1>
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 text-surface-400 hover:text-white transition-colors">
            {mobileMenuOpen ? <X /> : <Menu />}
          </button>
        </header>

        {viewMode === 'chat' ? (
            <>
                <main ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 scroll-smooth custom-scrollbar">
                  <div className="max-w-4xl mx-auto w-full">
                    
                    {/* Empty State / Welcome Screen */}
                    {state.customChunks.length === 0 && state.messages.length === 1 && (
                        <div className="mt-12 flex flex-col items-center justify-center text-center animate-fade-in">
                            <div className="w-24 h-24 bg-gradient-to-br from-surface-800 to-surface-900 border border-white/10 rounded-[2rem] flex items-center justify-center mb-8 shadow-[0_0_40px_-10px_rgba(99,102,241,0.3)] rotate-3 transition-transform hover:rotate-0 duration-500">
                                <Sparkles className="w-10 h-10 text-brand-400 drop-shadow-[0_0_10px_rgba(129,140,248,0.5)]" />
                            </div>
                            <h3 className="text-3xl font-black text-white mb-4 tracking-tight">هوش مصنوعی سازمانی</h3>
                            <p className="text-surface-400 max-w-lg leading-8 mb-10 text-lg">
                                پایگاه دانش محلی خود را بارگذاری کنید تا دستیار هوشمند با حفظ محرمانگی کامل به سوالات شما پاسخ دهد.
                            </p>
                            
                            <Button 
                                size="lg"
                                onClick={() => setIsSettingsOpen(true)}
                                icon={<FolderOpen className="w-5 h-5" />}
                                className="bg-gradient-to-r from-brand-600 to-brand-500 border border-brand-400/20 shadow-neon hover:shadow-brand-500/40"
                            >
                                بارگذاری مستندات
                            </Button>
                        </div>
                    )}

                    {/* Chat Messages */}
                    {state.customChunks.length > 0 && (
                        <>
                            {state.messages.length === 1 && (
                                <div className="mb-10 animate-slide-up-fade">
                                    <h4 className="text-xs font-bold text-surface-500 uppercase tracking-widest mb-4 px-2">پیشنهادات هوشمند:</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {quickActions.map((item, i) => (
                                            <button 
                                                key={i} 
                                                onClick={() => handleSuggestionClick(item.text)}
                                                className="glass-card hover:bg-surface-800/80 p-4 rounded-2xl transition-all text-right flex items-start gap-4 group"
                                            >
                                                <div className="p-3 bg-surface-800/50 rounded-xl border border-white/5 group-hover:scale-110 transition-transform shadow-inner">
                                                    {item.icon}
                                                </div>
                                                <div>
                                                    <span className="block text-xs font-bold text-surface-400 mb-1">{item.title}</span>
                                                    <span className="text-sm font-medium text-white group-hover:text-brand-300 transition-colors">{item.text}</span>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {state.messages.map((msg) => (
                                <ChatBubble 
                                    key={msg.id} 
                                    message={msg} 
                                    onOptionSelect={actions.handleOptionSelect}
                                    onFeedback={actions.handleFeedback}
                                />
                            ))}
                        </>
                    )}
                  </div>
                  
                  {/* Bottom Spacer */}
                  <div className="w-full h-48 md:h-64 flex-shrink-0" />
                </main>

                {/* Floating Input Area (The "Capsule") */}
                <div className="absolute bottom-6 left-0 right-0 px-4 md:px-0 z-30 flex justify-center pointer-events-none">
                  <div className="w-full max-w-3xl pointer-events-auto transition-all duration-300">
                    
                    {/* Status Pill */}
                    {state.isProcessing && (!isFileProcessing || isBackgroundProcessing) && state.processingStatus && (
                        <div className="flex justify-center mb-3">
                            <div className="bg-surface-900/80 backdrop-blur-md text-brand-300 text-xs font-bold px-4 py-1.5 rounded-full shadow-lg border border-brand-500/30 flex items-center gap-2 animate-pulse">
                                <Sparkles className="w-3 h-3" />
                                {state.processingStatus}
                            </div>
                        </div>
                    )}

                    {/* The Input Bar */}
                    <div className={`
                        relative bg-surface-900/70 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] rounded-[2rem] p-2 transition-all duration-300
                        ${state.useWebSearch ? 'ring-1 ring-accent-cyan/50 shadow-[0_0_20px_rgba(6,182,212,0.2)]' : 'hover:border-white/20 hover:shadow-[0_15px_40px_rgba(0,0,0,0.6)]'}
                    `}>
                        <div className="flex items-end gap-2">
                            {/* Mode Toggle */}
                            <button 
                                onClick={() => actions.setUseWebSearch(!state.useWebSearch)}
                                className={`mb-1 p-2.5 rounded-full transition-all duration-300 ${
                                    state.useWebSearch 
                                    ? 'bg-accent-cyan/20 text-accent-cyan rotate-180' 
                                    : 'bg-surface-800 text-surface-400 hover:bg-surface-700 hover:text-white'
                                }`}
                                title={state.useWebSearch ? "جستجوی ترکیبی (وب + داک)" : "فقط مستندات داخلی"}
                            >
                                {state.useWebSearch ? <Globe className="w-5 h-5" /> : <Database className="w-5 h-5" />}
                            </button>

                            <textarea
                                ref={inputRef}
                                value={state.inputText}
                                onChange={(e) => actions.setInputText(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder={state.customChunks.length > 0 ? "سوال خود را بپرسید..." : "منتظر بارگذاری..."}
                                className="flex-1 bg-transparent border-none focus:ring-0 resize-none max-h-32 min-h-[52px] py-3.5 px-2 text-white placeholder-surface-500 text-[0.95rem] font-medium leading-relaxed custom-scrollbar"
                                rows={1}
                                disabled={state.isProcessing || state.customChunks.length === 0}
                            />

                            <button 
                                onClick={actions.handleSendMessage}
                                disabled={!state.inputText.trim() || state.isProcessing || state.customChunks.length === 0}
                                className={`mb-1 p-3 rounded-full transition-all duration-300 flex items-center justify-center w-11 h-11 shadow-lg ${
                                state.inputText.trim() && !state.isProcessing && state.customChunks.length > 0
                                    ? 'bg-gradient-to-tr from-brand-600 to-brand-400 text-white hover:scale-110 active:scale-95 shadow-brand-500/30'
                                    : 'bg-surface-800 text-surface-600 cursor-not-allowed'
                                }`}
                            >
                                {state.isProcessing ? (
                                <Sparkles className="w-5 h-5 animate-spin" />
                                ) : (
                                <Send className="w-5 h-5 rtl:rotate-180" />
                                )}
                            </button>
                        </div>
                    </div>
                    
                    <div className="text-center mt-3">
                        <p className="text-[10px] text-surface-500 font-medium opacity-60 flex justify-center gap-2">
                            <Lock className="w-3 h-3" />
                            پردازش محلی (Local RAG) - داده‌ها امن هستند.
                        </p>
                    </div>

                  </div>
                </div>
            </>
        ) : (
            // Graph View
            <div className="w-full h-full animate-fade-in bg-surface-950">
                <KnowledgeGraph 
                    chunks={state.customChunks} 
                    layoutMode={graphLayout}
                    onNodeAction={handleGraphNodeAction}
                />
            </div>
        )}

      </div>
    </div>
  );
}

export default App;
