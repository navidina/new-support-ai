
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
import { ViewMode, GraphLayoutMode } from './types';
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

  useEffect(() => {
      if (!state.isProcessing && viewMode === 'chat') {
          setTimeout(() => inputRef.current?.focus(), 100);
      }
  }, [state.isProcessing, viewMode]);

  if (state.isDbLoading) {
      return (
          <div className="flex h-screen items-center justify-center bg-slate-50 text-slate-600 flex-col gap-6 font-sans animate-fade-in relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-tr from-brand-50 to-indigo-50 opacity-50"></div>
              <div className="relative z-10 flex flex-col items-center">
                  <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-xl shadow-brand-500/10 mb-6 animate-bounce">
                      <Sparkles className="w-8 h-8 text-brand-600" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-800">رایان هم‌افزا</h3>
                  <p className="text-sm text-slate-500 mt-2 animate-pulse">در حال آماده‌سازی هسته هوشمند...</p>
              </div>
          </div>
      );
  }

  const processedCount = state.docsList.filter(d => d.status === 'indexed' || d.status === 'error').length;
  const displayTotalFiles = Math.max(totalFilesToProcess, state.docsList.length);
  const isFileProcessing = state.isProcessing && state.processingType === 'file';
  const showOverlay = isFileProcessing && !isBackgroundProcessing;

  // New Quick Actions for Empty State
  const quickActions = [
      { icon: <BarChart className="w-5 h-5 text-emerald-500" />, title: "مغایرت مالی", text: "مغایرت مانده مشتری در بک آفیس" },
      { icon: <Globe className="w-5 h-5 text-purple-500" />, title: "عملیات اجرایی", text: "روش تغییر کارگزار ناظر" }
  ];

  return (
    <div className="flex h-screen bg-[#F0F2F5] overflow-hidden font-sans text-slate-800 relative" dir="rtl">
        
        {/* Background Aurora Effect */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
            <div className="absolute top-[-10%] right-[-10%] w-[800px] h-[800px] bg-brand-200/30 rounded-full blur-[120px] animate-float"></div>
            <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] bg-blue-200/30 rounded-full blur-[100px] animate-float-delayed"></div>
        </div>
      
      <div className={`transition-opacity duration-500 ${showOverlay ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
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
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 md:hidden animate-fade-in" onClick={() => setMobileMenuOpen(false)}></div>
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
        
        {/* Mobile Header */}
        <header className="md:hidden h-16 bg-white/80 backdrop-blur-md border-b border-slate-200/50 flex items-center justify-between px-4 shrink-0 z-20 sticky top-0">
          <h1 className="font-bold text-slate-800 flex items-center gap-2">
             <Sparkles className="w-5 h-5 text-brand-600" />
             رایان هم‌افزا
          </h1>
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 text-slate-600 active:scale-90 transition-transform">
            {mobileMenuOpen ? <X /> : <Menu />}
          </button>
        </header>

        {viewMode === 'chat' ? (
            <>
                <main ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 scroll-smooth">
                  <div className="max-w-4xl mx-auto w-full">
                    
                    {/* Empty State / Welcome Screen */}
                    {state.customChunks.length === 0 && state.messages.length === 1 && (
                        <div className="mt-12 flex flex-col items-center justify-center text-center animate-fade-in">
                            <div className="w-24 h-24 bg-white rounded-[2rem] flex items-center justify-center mb-8 shadow-2xl shadow-brand-500/20 rotate-3 transition-transform hover:rotate-0 duration-500">
                                <Sparkles className="w-10 h-10 text-brand-600" />
                            </div>
                            <h3 className="text-3xl font-black text-slate-900 mb-4 tracking-tight">سلام، به دستیار هوشمند خوش آمدید</h3>
                            <p className="text-slate-500 max-w-lg leading-8 mb-10 text-lg">
                                برای شروع، مستندات سازمانی خود را بارگذاری کنید تا بتوانم به سوالات تخصصی شما در لحظه پاسخ دهم.
                            </p>
                            
                            <Button 
                                size="lg"
                                onClick={() => setIsSettingsOpen(true)}
                                icon={<FolderOpen className="w-5 h-5" />}
                                className="shadow-xl hover:-translate-y-1"
                            >
                                بارگذاری پایگاه دانش
                            </Button>
                        </div>
                    )}

                    {/* Chat Messages */}
                    {state.customChunks.length > 0 && (
                        <>
                            {state.messages.length === 1 && (
                                <div className="mb-10 animate-slide-up-fade">
                                    <h4 className="text-sm font-bold text-slate-400 mb-4 px-2">پیشنهادات شروع سریع:</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {quickActions.map((item, i) => (
                                            <button 
                                                key={i} 
                                                onClick={() => handleSuggestionClick(item.text)}
                                                className="bg-white/70 hover:bg-white border border-white/60 p-4 rounded-2xl shadow-sm hover:shadow-lg hover:shadow-brand-500/10 transition-all text-right flex items-start gap-4 group backdrop-blur-sm"
                                            >
                                                <div className="p-3 bg-white rounded-xl shadow-sm group-hover:scale-110 transition-transform border border-slate-100">
                                                    {item.icon}
                                                </div>
                                                <div>
                                                    <span className="block text-xs font-bold text-slate-500 mb-1">{item.title}</span>
                                                    <span className="text-sm font-medium text-slate-800">{item.text}</span>
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
                  
                  {/* Bottom Spacer to ensure content isn't covered by the input capsule */}
                  <div className="w-full h-48 md:h-64 flex-shrink-0" />
                </main>

                {/* Floating Input Area (The "Capsule") */}
                <div className="absolute bottom-6 left-0 right-0 px-4 md:px-0 z-30 flex justify-center pointer-events-none">
                  <div className="w-full max-w-3xl pointer-events-auto transition-all duration-300">
                    
                    {/* Status Pill */}
                    {state.isProcessing && (!isFileProcessing || isBackgroundProcessing) && state.processingStatus && (
                        <div className="flex justify-center mb-3">
                            <div className="glass-panel text-brand-600 text-xs font-bold px-4 py-1.5 rounded-full shadow-lg border border-white/50 flex items-center gap-2 animate-pulse">
                                <Sparkles className="w-3 h-3" />
                                {state.processingStatus}
                            </div>
                        </div>
                    )}

                    {/* The Input Bar */}
                    <div className={`
                        relative bg-white/85 backdrop-blur-2xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.12)] rounded-[2rem] p-2 transition-all duration-300
                        ${state.useWebSearch ? 'ring-2 ring-brand-500/30' : 'hover:shadow-[0_15px_40px_rgb(0,0,0,0.15)]'}
                    `}>
                        <div className="flex items-end gap-2">
                            {/* Mode Toggle (Inside Input) */}
                            <button 
                                onClick={() => actions.setUseWebSearch(!state.useWebSearch)}
                                className={`mb-1 p-2 rounded-full transition-all duration-300 ${
                                    state.useWebSearch 
                                    ? 'bg-brand-100 text-brand-600 rotate-180' 
                                    : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
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
                                placeholder={state.customChunks.length > 0 ? "سوال خود را بپرسید..." : "منتظر بارگذاری مستندات..."}
                                className="flex-1 bg-transparent border-none focus:ring-0 resize-none max-h-32 min-h-[52px] py-3.5 px-2 text-slate-700 placeholder-slate-400 text-[0.95rem] font-medium leading-relaxed"
                                rows={1}
                                disabled={state.isProcessing || state.customChunks.length === 0}
                            />

                            <button 
                                onClick={actions.handleSendMessage}
                                disabled={!state.inputText.trim() || state.isProcessing || state.customChunks.length === 0}
                                className={`mb-1 p-3 rounded-full transition-all duration-300 flex items-center justify-center w-11 h-11 shadow-lg ${
                                state.inputText.trim() && !state.isProcessing && state.customChunks.length > 0
                                    ? 'bg-brand-600 text-white hover:bg-brand-700 hover:scale-110 active:scale-95'
                                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
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
                        <p className="text-[10px] text-slate-400 font-medium opacity-70 flex justify-center gap-2">
                            <Lock className="w-3 h-3" />
                            اطلاعات شما به صورت محلی پردازش می‌شود (Local RAG).
                        </p>
                    </div>

                  </div>
                </div>
            </>
        ) : (
            // Graph View
            <div className="w-full h-full animate-fade-in bg-slate-50/50 backdrop-blur-sm">
                <KnowledgeGraph 
                    chunks={state.customChunks} 
                    layoutMode={graphLayout}
                />
            </div>
        )}

      </div>
    </div>
  );
}

export default App;
