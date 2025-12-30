
import React, { useState, useEffect, useRef } from 'react';
import { User, BookOpen, Activity, ChevronDown, ChevronUp, ThumbsUp, ThumbsDown, Sparkles, Copy } from 'lucide-react';
import { Message } from '../types';
import { toPersianDigits } from '../services/textProcessor';
import RAGVisualization from './RAGVisualization';

// Declare mermaid global
declare var mermaid: any;

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
    const mermaidRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isUser && mermaidRef.current) {
            try {
                if (typeof mermaid !== 'undefined') {
                    mermaid.init(undefined, mermaidRef.current.querySelectorAll('.mermaid'));
                }
            } catch (err) {
                console.error('Mermaid render error:', err);
            }
        }
    }, [content, isUser]);

    const renderInline = (text: string) => {
        const parts = text.split(/(\*\*.*?\*\*)/g);
        return parts.map((part, index) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={index} className={`font-bold px-1 rounded ${isUser ? 'text-white bg-white/10 shadow-[0_0_10px_rgba(255,255,255,0.2)]' : 'text-slate-900 dark:text-white bg-brand-100 dark:bg-white/10'}`}>{part.slice(2, -2)}</strong>;
            }
            return part;
        });
    };

    if (!content) return <span className="animate-pulse opacity-50">|</span>;

    // Check for mermaid blocks
    if (content.includes('```mermaid')) {
        const parts = content.split(/```mermaid([\s\S]*?)```/g);
        return (
            <div className={`space-y-3 text-[0.93rem] leading-7 markdown-content ${isUser ? 'text-white' : 'text-slate-700 dark:text-surface-200'}`} ref={mermaidRef}>
                {parts.map((part, i) => {
                    if (i % 2 === 1) { // Mermaid block
                        return (
                            <div key={i} className="mermaid bg-slate-50 dark:bg-surface-900 p-4 rounded-xl border border-slate-200 dark:border-surface-700 overflow-x-auto my-2 shadow-inner" dir="ltr">
                                {part.trim()}
                            </div>
                        );
                    }
                    return <MarkdownRenderer key={i} content={part} isUser={isUser} />; 
                })}
            </div>
        );
    }

    const blocks = content.split(/\n\n+/);
    let orderedListCount = 0; // Track numbered list continuity across blocks

    return (
        <div className={`space-y-3 text-[0.93rem] leading-8 tracking-wide markdown-content ${isUser ? 'text-white' : 'text-slate-700 dark:text-surface-200'}`}>
            {blocks.map((block, i) => {
                const trimmed = block.trim();
                if (!trimmed) return null;

                if (trimmed.startsWith('|')) {
                    orderedListCount = 0; // Reset list counter
                    const rows = trimmed.split('\n').filter(r => r.trim().startsWith('|'));
                    if (rows.length > 1) {
                        return (
                            <div key={i} className="my-3 overflow-x-auto rounded-xl border border-slate-200 dark:border-surface-700 shadow-lg bg-white/50 dark:bg-surface-900/50">
                                <table className="w-full text-right text-xs">
                                    <tbody className="divide-y divide-slate-100 dark:divide-surface-800">
                                        {rows.slice(2).map((rowStr, ri) => {
                                            const cells = rowStr.split('|').filter(c => c.trim() !== '').map(c => c.trim());
                                            return (
                                                <tr key={ri} className="hover:bg-slate-50 dark:hover:bg-surface-800/50 transition-colors">
                                                    {cells.map((cell, ci) => (
                                                        <td key={ci} className="px-3 py-3 text-slate-700 dark:text-surface-300 border-l border-slate-200 dark:border-surface-800 last:border-0">
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

                // Check for Unordered List (Bullets)
                if (trimmed.match(/^[-*]\s/) && !trimmed.match(/^\d+\./)) {
                    orderedListCount = 0; // Reset ordered list counter on unordered list
                    const items = trimmed.split('\n');
                    return (
                        <ul key={i} className={`list-disc list-outside pr-5 space-y-1 ${isUser ? 'marker:text-white/70' : 'marker:text-brand-500 dark:marker:text-brand-400'}`}>
                            {items.map((item, ii) => (
                                <li key={ii}>{renderInline(item.replace(/^[-*]\s/, ''))}</li>
                            ))}
                        </ul>
                    );
                }

                // Check for Ordered List (Numbered)
                const orderedListMatch = trimmed.match(/^(\d+)\.\s/);
                if (orderedListMatch) {
                    const lines = trimmed.split('\n');
                    const explicitStart = parseInt(orderedListMatch[1], 10);
                    
                    // Group lines into Parent Items and Sub Items (Bullets)
                    const groupedItems: { text: string; subItems: string[] }[] = [];
                    
                    lines.forEach(line => {
                        const numMatch = line.match(/^(\d+)\.\s/);
                        const bulletMatch = line.match(/^[-*]\s/);
                        
                        if (numMatch) {
                            // Start new numbered item
                            groupedItems.push({ 
                                text: line.replace(/^\d+\.\s/, ''), 
                                subItems: [] 
                            });
                        } else if (bulletMatch) {
                            // Add as sub-item to the last numbered item
                            if (groupedItems.length > 0) {
                                groupedItems[groupedItems.length - 1].subItems.push(line.replace(/^[-*]\s/, ''));
                            } else {
                                // Fallback: if bullet appears before any number in this block (rare)
                                groupedItems.push({ text: line, subItems: [] });
                            }
                        } else {
                            // Continuation text
                            if (groupedItems.length > 0) {
                                groupedItems[groupedItems.length - 1].text += ' ' + line.trim();
                            }
                        }
                    });

                    // Intelligent Continuity Logic
                    let startNum = explicitStart;
                    if (orderedListCount > 0) {
                        startNum = orderedListCount + 1;
                    }

                    // Update the counter based on number of MAIN items only
                    orderedListCount = startNum + groupedItems.length - 1;

                    return (
                        <ol key={i} start={startNum} className={`list-decimal list-outside pr-5 space-y-2 font-medium ${isUser ? 'marker:text-white/70' : 'marker:text-brand-600 dark:marker:text-brand-500'}`}>
                            {groupedItems.map((group, ii) => (
                                <li key={ii} className="pl-1">
                                    <span className="font-normal block leading-7">{renderInline(group.text)}</span>
                                    {group.subItems.length > 0 && (
                                        <ul className={`list-disc list-outside pr-5 mt-2 space-y-1 ${isUser ? 'marker:text-white/50' : 'marker:text-brand-400/70'}`}>
                                            {group.subItems.map((sub, si) => (
                                                <li key={si} className="text-sm font-normal opacity-90">{renderInline(sub)}</li>
                                            ))}
                                        </ul>
                                    )}
                                </li>
                            ))}
                        </ol>
                    );
                }

                // If not a list, reset counter
                if (!trimmed.startsWith('##')) {
                    orderedListCount = 0;
                }

                if (trimmed.startsWith('## ')) {
                    orderedListCount = 0;
                    return <h3 key={i} className={`font-bold text-base mt-4 mb-2 pb-1 border-b border-slate-200 dark:border-surface-700/50 ${isUser ? 'text-white' : 'text-brand-700 dark:text-brand-300'}`}>{trimmed.replace('## ', '')}</h3>
                }

                return <p key={i}>{renderInline(trimmed)}</p>;
            })}
        </div>
    );
};

const ChatBubble: React.FC<ChatBubbleProps> = ({ message, onOptionSelect, onFeedback }) => {
  const isUser = message.role === 'user';
  const [showDebug, setShowDebug] = useState(false);
  
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
      <div className={`flex max-w-[90%] md:max-w-[80%] ${isUser ? 'flex-row-reverse' : 'flex-row'} gap-4`}>
        
        {/* Avatar */}
        {!isUser && (
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-white/80 dark:bg-surface-800/80 border border-slate-200 dark:border-white/10 shadow-lg shadow-brand-500/10 mt-1">
                <Sparkles className="w-5 h-5 text-brand-600 dark:text-brand-400" />
            </div>
        )}

        {/* Content Box */}
        <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} w-full min-w-0`}>
          
          <div ref={contentRef} className={`px-6 py-5 relative w-full transition-all duration-300 shadow-xl backdrop-blur-md ${
            isUser 
              ? 'bg-gradient-to-br from-brand-600 to-indigo-700 text-white rounded-[1.5rem] rounded-tr-none shadow-brand-600/20 border border-white/10' 
              : 'bg-white/90 dark:bg-surface-900/60 text-slate-800 dark:text-surface-100 rounded-[1.5rem] rounded-tl-none border border-slate-100 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/10'
          }`}>
            
            {/* 1. RAG Visualization */}
            {!isUser && message.pipelineData && (
                <RAGVisualization data={message.pipelineData} />
            )}

            {/* 2. Text Content or Thinking State */}
            {message.isThinking ? (
               <div className="flex items-center gap-3 text-slate-500 dark:text-surface-400 py-2">
                 <div className="flex gap-1.5">
                    <span className="w-2 h-2 bg-brand-500 dark:bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-2 h-2 bg-brand-500 dark:bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-2 h-2 bg-brand-500 dark:bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                 </div>
                 <span className="text-xs font-bold text-brand-600 dark:text-brand-300 animate-pulse tracking-wide">در حال جستجوی عصبی...</span>
               </div>
            ) : (
              <>
                 <MarkdownRenderer content={displayedContent} isUser={isUser} />
                 
                 {!isUser && isTyping && (
                     <span className="inline-block w-1.5 h-4 bg-brand-500 dark:bg-brand-400 ml-1 align-middle animate-pulse shadow-[0_0_8px_#818cf8]"></span>
                 )}
                 
                 {/* Logic / Debug Panel */}
                 {!isUser && !isTyping && showDebug && message.debugInfo && (
                     <div className="mt-5 p-4 bg-slate-100 dark:bg-black/40 rounded-xl border border-slate-200 dark:border-white/5 text-xs font-mono text-slate-600 dark:text-surface-400 animate-slide-in-from-top-2" dir="ltr">
                        <div className="grid grid-cols-2 gap-y-3 gap-x-4 mb-3">
                            <div>
                                <span className="text-slate-400 dark:text-surface-500 block text-[9px] uppercase tracking-widest mb-1">Strategy</span>
                                <span className="font-bold text-brand-600 dark:text-brand-300">{message.debugInfo.strategy}</span>
                            </div>
                            <div>
                                <span className="text-slate-400 dark:text-surface-500 block text-[9px] uppercase tracking-widest mb-1">Latency</span>
                                <span className="font-bold text-emerald-600 dark:text-emerald-400">{message.debugInfo.processingTimeMs}ms</span>
                            </div>
                            <div>
                                <span className="text-slate-400 dark:text-surface-500 block text-[9px] uppercase tracking-widest mb-1">Candidates</span>
                                <span className="font-bold text-slate-800 dark:text-white">{message.debugInfo.candidateCount}</span>
                            </div>
                            <div>
                                <span className="text-slate-400 dark:text-surface-500 block text-[9px] uppercase tracking-widest mb-1">Logic Step</span>
                                <span className="truncate block max-w-[150px] text-slate-800 dark:text-white" title={message.debugInfo.logicStep}>{message.debugInfo.logicStep}</span>
                            </div>
                        </div>
                        {message.debugInfo.extractedKeywords?.length > 0 && (
                            <div className="pt-3 border-t border-slate-200 dark:border-white/5">
                                <span className="text-slate-400 dark:text-surface-500 block text-[9px] uppercase tracking-widest mb-2">Keywords</span>
                                <div className="flex flex-wrap gap-1.5">
                                    {message.debugInfo.extractedKeywords.map((k, i) => (
                                        <span key={i} className="px-2 py-0.5 bg-brand-100 dark:bg-brand-900/50 border border-brand-200 dark:border-brand-700/50 rounded text-[10px] text-brand-700 dark:text-brand-200">{k}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                     </div>
                 )}

                 {!isUser && !isTyping && (
                     <div className="mt-5 pt-3 border-t border-slate-200 dark:border-white/5 flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                         <div className="flex items-center gap-1">
                             <button onClick={() => onFeedback && onFeedback(message.id, 1)} className={`p-1.5 rounded-lg transition-colors ${message.feedback === 1 ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 dark:text-surface-500 hover:text-slate-700 dark:hover:text-white'}`}>
                                 <ThumbsUp className="w-3.5 h-3.5" />
                             </button>
                             <button onClick={() => onFeedback && onFeedback(message.id, -1)} className={`p-1.5 rounded-lg transition-colors ${message.feedback === -1 ? 'bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400' : 'hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 dark:text-surface-500 hover:text-slate-700 dark:hover:text-white'}`}>
                                 <ThumbsDown className="w-3.5 h-3.5" />
                             </button>
                             <button 
                                onClick={() => navigator.clipboard.writeText(message.content)}
                                className="p-1.5 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg text-slate-400 dark:text-surface-500 hover:text-slate-700 dark:hover:text-white ml-1"
                                title="کپی متن"
                             >
                                 <Copy className="w-3.5 h-3.5" />
                             </button>
                         </div>

                         {message.debugInfo && (
                             <button 
                                onClick={() => setShowDebug(!showDebug)}
                                className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full transition-colors border ${showDebug ? 'bg-brand-50 dark:bg-brand-500/20 text-brand-600 dark:text-brand-300 border-brand-200 dark:border-brand-500/30' : 'text-slate-400 dark:text-surface-500 border-transparent hover:border-slate-200 dark:hover:border-surface-700 hover:bg-slate-50 dark:hover:bg-surface-800'}`}
                             >
                                 <Activity className="w-3 h-3" />
                                 <span>{showDebug ? 'مخفی کردن' : 'Logic'}</span>
                             </button>
                         )}
                     </div>
                 )}
              </>
            )}
          </div>

          {/* Options */}
          {!isUser && !isTyping && message.options && message.options.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 w-full animate-slide-up-fade pl-2" style={{ animationDelay: '0.1s' }}>
                  {message.options.map((opt, i) => (
                      <button
                          key={opt}
                          onClick={() => !message.selectedOption && onOptionSelect && onOptionSelect(opt)}
                          disabled={!!message.selectedOption}
                          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                              message.selectedOption === opt
                                  ? 'bg-brand-600 text-white border-brand-500 shadow-neon'
                                  : message.selectedOption
                                      ? 'bg-slate-100 dark:bg-surface-900 text-slate-400 dark:text-surface-600 border-slate-200 dark:border-surface-800'
                                      : 'bg-white dark:bg-surface-900 text-brand-600 dark:text-brand-300 border-slate-200 dark:border-surface-700 hover:border-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10'
                          }`}
                      >
                          {categoryLabels[opt] || opt}
                      </button>
                  ))}
              </div>
          )}

          {/* Sources */}
          {!showDebug && !isUser && !isTyping && !message.isThinking && message.sources && message.sources.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2 animate-fade-in pl-2">
                {message.sources.slice(0, 3).map((source, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 bg-white/50 dark:bg-surface-900/40 border border-slate-200 dark:border-white/5 rounded-full px-3 py-1 text-[10px] text-slate-500 dark:text-surface-400 hover:bg-white dark:hover:bg-surface-800 hover:text-brand-600 dark:hover:text-brand-300 hover:border-brand-200 dark:hover:border-brand-500/30 transition-all cursor-help backdrop-blur-sm" title={source.snippet}>
                    <BookOpen className="w-3 h-3" />
                    <span className="font-medium max-w-[150px] truncate">{source.id}</span>
                    <span className="opacity-30">|</span>
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
