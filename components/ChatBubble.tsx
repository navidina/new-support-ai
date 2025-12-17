
import React, { useState, useEffect, useRef } from 'react';
import { User, BookOpen, Activity, ChevronDown, ChevronUp, ThumbsUp, ThumbsDown, Sparkles, Copy } from 'lucide-react';
import { Message } from '../types';
import { toPersianDigits } from '../services/textProcessor';
import RAGVisualization from './RAGVisualization';

interface ChatBubbleProps {
  message: Message;
  onOptionSelect?: (option: string) => void;
  onFeedback?: (messageId: string, rating: number) => void;
}

const categoryLabels: Record<string, string> = {
    'back_office': 'مدیریت کارگزاری',
    'online_trading': 'معاملات برخط',
    'portfolio_management': 'سبدگردانی',
    'funds': 'صندوق‌های سرمایه‌گذاری',
    'commodity_energy': 'بورس کالا و انرژی',
    'troubleshooting': 'عیب‌یابی',
    'operational_process': 'فرآیندهای اجرایی',
    'technical_infrastructure': 'فنی و زیرساخت',
    'general': 'عمومی'
};

const MarkdownRenderer: React.FC<{ content: string, isUser: boolean }> = ({ content, isUser }) => {
    const renderInline = (text: string) => {
        const parts = text.split(/(\*\*.*?\*\*)/g);
        return parts.map((part, index) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={index} className="font-bold">{part.slice(2, -2)}</strong>;
            }
            return part;
        });
    };

    // Handle empty content gracefully
    if (!content) return <span className="animate-pulse">|</span>;

    const blocks = content.split(/\n\n+/);

    return (
        <div className={`space-y-3 text-[0.93rem] leading-7 ${isUser ? 'text-white' : 'text-slate-700'}`}>
            {blocks.map((block, i) => {
                const trimmed = block.trim();
                if (!trimmed) return null;

                if (trimmed.startsWith('|')) {
                    const rows = trimmed.split('\n').filter(r => r.trim().startsWith('|'));
                    if (rows.length > 1) {
                        return (
                            <div key={i} className="my-3 overflow-x-auto rounded-xl border border-slate-200/60 shadow-sm bg-white/50">
                                <table className="w-full text-right text-xs">
                                    <tbody className="divide-y divide-slate-100">
                                        {rows.slice(2).map((rowStr, ri) => {
                                            const cells = rowStr.split('|').filter(c => c.trim() !== '').map(c => c.trim());
                                            return (
                                                <tr key={ri} className="last:border-0">
                                                    {cells.map((cell, ci) => (
                                                        <td key={ci} className="px-3 py-2 text-slate-600 border-l border-slate-100 last:border-0">
                                                            {renderInline(cell)}
                                                        </td>
                                                    ))}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        );
                    }
                }

                if (trimmed.match(/^[-*]\s/)) {
                    const items = trimmed.split('\n');
                    return (
                        <ul key={i} className={`list-disc list-outside pr-5 space-y-1 ${isUser ? 'marker:text-white/70' : 'marker:text-indigo-400'}`}>
                            {items.map((item, ii) => (
                                <li key={ii}>{renderInline(item.replace(/^[-*]\s/, ''))}</li>
                            ))}
                        </ul>
                    );
                }

                if (trimmed.match(/^\d+\.\s/)) {
                    const items = trimmed.split('\n');
                    return (
                        <ol key={i} className={`list-decimal list-outside pr-5 space-y-1 font-medium ${isUser ? 'marker:text-white/70' : 'marker:text-indigo-500'}`}>
                            {items.map((item, ii) => (
                                <li key={ii} className="pl-1">
                                    <span className="font-normal">{renderInline(item.replace(/^\d+\.\s/, ''))}</span>
                                </li>
                            ))}
                        </ol>
                    );
                }

                if (trimmed.startsWith('## ')) {
                    return <h3 key={i} className={`font-bold text-base mt-2 mb-1 ${isUser ? 'text-white' : 'text-slate-900'}`}>{trimmed.replace('## ', '')}</h3>
                }

                return <p key={i}>{renderInline(trimmed)}</p>;
            })}
        </div>
    );
};

const ChatBubble: React.FC<ChatBubbleProps> = ({ message, onOptionSelect, onFeedback }) => {
  const isUser = message.role === 'user';
  const [showDebug, setShowDebug] = useState(false);
  
  // --- TYPEWRITER LOGIC ---
  const [displayedContent, setDisplayedContent] = useState(() => {
      if (isUser) return message.content;
      if (message.isThinking) return '';
      return message.content;
  });
  
  const [isTyping, setIsTyping] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
      if (isUser || message.isThinking) {
          setDisplayedContent(message.content);
          setIsTyping(false);
          return;
      }

      if (displayedContent === message.content) {
          setIsTyping(false);
          return;
      }

      setIsTyping(true);
      setDisplayedContent(''); 
      
      let currentIndex = 0;
      const fullText = message.content;
      const step = fullText.length > 500 ? 5 : 2; 
      const delay = fullText.length > 500 ? 5 : 12;

      const interval = setInterval(() => {
          if (currentIndex < fullText.length) {
              currentIndex += step;
              const nextChunk = fullText.substring(0, Math.min(currentIndex, fullText.length));
              setDisplayedContent(nextChunk);
          } else {
              clearInterval(interval);
              setIsTyping(false);
              setDisplayedContent(fullText); 
          }
      }, delay);

      return () => clearInterval(interval);
  }, [message.content, message.isThinking, isUser]);

  return (
    <div className={`flex w-full mb-8 ${isUser ? 'justify-end' : 'justify-start'} animate-slide-up-fade group`}>
      <div className={`flex max-w-[90%] md:max-w-[75%] ${isUser ? 'flex-row-reverse' : 'flex-row'} gap-4`}>
        
        {/* Avatar */}
        {!isUser && (
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-white border border-slate-100 shadow-md shadow-indigo-100 mt-1">
                <Sparkles className="w-5 h-5 text-indigo-600" />
            </div>
        )}

        {/* Content Box */}
        <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} w-full min-w-0`}>
          
          <div ref={contentRef} className={`px-6 py-4 relative w-full transition-all duration-300 shadow-sm ${
            isUser 
              ? 'bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-[2rem] rounded-tr-none shadow-indigo-500/20' 
              : 'bg-white text-slate-800 rounded-[2rem] rounded-tl-none border border-slate-100'
          }`}>
            
            {/* 1. RAG Processing Visualization (Collapsible) - NOW INSIDE THE BUBBLE */}
            {!isUser && message.pipelineData && (
                <RAGVisualization data={message.pipelineData} />
            )}

            {/* 2. Text Content or Thinking State */}
            {message.isThinking ? (
               <div className="flex items-center gap-3 text-slate-400 py-1">
                 <div className="flex gap-1">
                    <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                 </div>
                 <span className="text-xs font-medium text-indigo-500 animate-pulse">در حال تحلیل و جستجو...</span>
               </div>
            ) : (
              <>
                 <MarkdownRenderer content={displayedContent} isUser={isUser} />
                 
                 {!isUser && isTyping && (
                     <span className="inline-block w-1.5 h-4 bg-indigo-500 ml-1 align-middle animate-pulse"></span>
                 )}
                 
                 {/* Logic / Debug Panel */}
                 {!isUser && !isTyping && showDebug && message.debugInfo && (
                     <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200/60 text-xs font-mono text-slate-600 animate-slide-in-from-top-2" dir="ltr">
                        <div className="grid grid-cols-2 gap-y-3 gap-x-4 mb-3">
                            <div>
                                <span className="text-slate-400 block text-[9px] uppercase tracking-wider mb-0.5">Strategy</span>
                                <span className="font-bold text-indigo-600">{message.debugInfo.strategy}</span>
                            </div>
                            <div>
                                <span className="text-slate-400 block text-[9px] uppercase tracking-wider mb-0.5">Latency</span>
                                <span className="font-bold">{message.debugInfo.processingTimeMs}ms</span>
                            </div>
                            <div>
                                <span className="text-slate-400 block text-[9px] uppercase tracking-wider mb-0.5">Candidates</span>
                                <span className="font-bold">{message.debugInfo.candidateCount} chunks</span>
                            </div>
                            <div>
                                <span className="text-slate-400 block text-[9px] uppercase tracking-wider mb-0.5">Logic Step</span>
                                <span className="truncate block max-w-[150px]" title={message.debugInfo.logicStep}>{message.debugInfo.logicStep}</span>
                            </div>
                        </div>
                        {message.debugInfo.extractedKeywords?.length > 0 && (
                            <div className="pt-2 border-t border-slate-200/60">
                                <span className="text-slate-400 block text-[9px] uppercase tracking-wider mb-1">Extracted Keywords</span>
                                <div className="flex flex-wrap gap-1">
                                    {message.debugInfo.extractedKeywords.map((k, i) => (
                                        <span key={i} className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[9px] text-slate-600 shadow-sm">{k}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                     </div>
                 )}

                 {!isUser && !isTyping && (
                     <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                         <div className="flex items-center gap-1">
                             <button onClick={() => onFeedback && onFeedback(message.id, 1)} className={`p-1.5 rounded-full transition-colors ${message.feedback === 1 ? 'bg-emerald-100 text-emerald-600' : 'hover:bg-slate-100 text-slate-400'}`}>
                                 <ThumbsUp className="w-3.5 h-3.5" />
                             </button>
                             <button onClick={() => onFeedback && onFeedback(message.id, -1)} className={`p-1.5 rounded-full transition-colors ${message.feedback === -1 ? 'bg-rose-100 text-rose-600' : 'hover:bg-slate-100 text-slate-400'}`}>
                                 <ThumbsDown className="w-3.5 h-3.5" />
                             </button>
                             <button 
                                onClick={() => navigator.clipboard.writeText(message.content)}
                                className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 ml-1"
                                title="کپی متن"
                             >
                                 <Copy className="w-3.5 h-3.5" />
                             </button>
                         </div>

                         {message.debugInfo && (
                             <button 
                                onClick={() => setShowDebug(!showDebug)}
                                className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full transition-colors ${showDebug ? 'bg-indigo-100 text-indigo-700' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'}`}
                             >
                                 <Activity className="w-3 h-3" />
                                 <span>{showDebug ? 'مخفی کردن Logic' : 'نمایش Logic'}</span>
                             </button>
                         )}
                     </div>
                 )}
              </>
            )}
          </div>

          {/* Options (Below Bubble) */}
          {!isUser && !isTyping && message.options && message.options.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 w-full animate-slide-up-fade" style={{ animationDelay: '0.1s' }}>
                  {message.options.map((opt, i) => (
                      <button
                          key={opt}
                          onClick={() => !message.selectedOption && onOptionSelect && onOptionSelect(opt)}
                          disabled={!!message.selectedOption}
                          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all border ${
                              message.selectedOption === opt
                                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                                  : message.selectedOption
                                      ? 'bg-slate-50 text-slate-400 border-slate-100'
                                      : 'bg-white text-indigo-600 border-indigo-100 hover:bg-indigo-50 hover:border-indigo-200 shadow-sm'
                          }`}
                      >
                          {categoryLabels[opt] || opt}
                      </button>
                  ))}
              </div>
          )}

          {/* Sources (Below Bubble) */}
          {!showDebug && !isUser && !isTyping && !message.isThinking && message.sources && message.sources.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2 animate-fade-in pl-2">
                {message.sources.slice(0, 3).map((source, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 bg-white/60 border border-slate-200/60 rounded-full px-3 py-1 text-[10px] text-slate-500 hover:bg-white hover:text-indigo-600 hover:border-indigo-200 transition-all cursor-help shadow-sm backdrop-blur-sm" title={source.snippet}>
                    <BookOpen className="w-3 h-3" />
                    <span className="font-medium max-w-[150px] truncate">{source.id}</span>
                    <span className="opacity-50">|</span>
                    <span>ص {toPersianDigits(source.page)}</span>
                  </div>
                ))}
            </div>
          )}
          
        </div>
      </div>
    </div>
  );
};

export default ChatBubble;
