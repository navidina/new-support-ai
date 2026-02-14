
import { useState, useRef, useEffect } from 'react';
import { Message, DocumentStatus, KnowledgeChunk, Conversation, FineTuningRecord, PipelineData } from '../types';
import { 
    processQuery, 
    parseFiles, 
    loadChunksFromDB, 
    clearDatabase, 
    exportDatabaseToBlob, 
    importDatabaseFromJson, 
    saveConversationToDB, 
    loadConversationsFromDB, 
    deleteConversationFromDB, 
    checkOllamaConnection, 
    getSettings,
    loadBenchmarkHistory,
    saveFineTuningRecord, 
    getFineTuningCount,   
    exportFineTuningDataset,
    loadTicketsFromDB,
    saveTicketsToDB,
    parseTicketFile,
    clearTicketsDB
} from '../services/mockBackend';

const INITIAL_MESSAGE: Message = {
  id: 'init-1',
  role: 'assistant',
  content: 'سلام. دستیار پشتیبانی هوشمند رایان هم‌افزا آماده است.\n\nلطفاً پوشه مستندات را بارگذاری کنید.',
  timestamp: new Date(),
};

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

export const useRAGApplication = () => {
    // --- State ---
    const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE]);
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [currentChatId, setCurrentChatId] = useState<string>('new');
    const [inputText, setInputText] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    // Explicitly track the TYPE of processing to prevent UI flickering during status updates
    const [processingType, setProcessingType] = useState<'file' | 'chat' | 'idle'>('idle');
    const [isDbLoading, setIsDbLoading] = useState(true);
    const [processingStatus, setProcessingStatus] = useState<string>('');
    const [customChunks, setCustomChunks] = useState<KnowledgeChunk[]>([]);
    const [ticketChunks, setTicketChunks] = useState<KnowledgeChunk[]>([]); // New state for isolated tickets
    const [docsList, setDocsList] = useState<DocumentStatus[]>([]);
    const [isOllamaOnline, setIsOllamaOnline] = useState<boolean>(false);
    const [lastBenchmarkScore, setLastBenchmarkScore] = useState<number | null>(null);
    const [fineTuningCount, setFineTuningCount] = useState(0); 
    
    // Toggle for General Knowledge (Simulated Internet Search)
    const [useWebSearch, setUseWebSearch] = useState(false);

    // Refs
    const isDbInitialized = useRef(false);
    const abortControllerRef = useRef<AbortController | null>(null);

    // --- Effects ---

    // 1. Health Check
    useEffect(() => {
        const checkHealth = async () => {
            const status = await checkOllamaConnection();
            setIsOllamaOnline(status);
        };
        checkHealth();
        const interval = setInterval(checkHealth, 5000);
        return () => clearInterval(interval);
    }, []);

    // 2. Initialize DB
    useEffect(() => {
        if (isDbInitialized.current) return;
        isDbInitialized.current = true; // Mark as initialized immediately to prevent double execution

        const initSystem = async () => {
            try {
                // Load General Knowledge
                const savedChunks = await loadChunksFromDB();
                if (savedChunks.length > 0) {
                    refreshStateFromChunks(savedChunks);
                }
                
                // Load Isolated Tickets
                const savedTickets = await loadTicketsFromDB();
                if (savedTickets.length > 0) {
                    setTicketChunks(savedTickets);
                }

                await loadHistory();
                await loadBenchmarkStats();
                await updateFineTuningCount(); 
            } catch (error) {
                console.error("Failed to load DB", error);
                // If the DB fails to load, we allow the app to continue so user can re-import or clear data
            } finally {
                setIsDbLoading(false);
            }
        };
        initSystem();
    }, []);

    // 3. Auto-save Conversation
    useEffect(() => {
        if (messages.length > 1 && currentChatId) {
            const firstUserMsg = messages.find(m => m.role === 'user');
            const title = firstUserMsg ? firstUserMsg.content.substring(0, 30) + (firstUserMsg.content.length > 30 ? '...' : '') : 'گفتگوی جدید';
            const actualId = currentChatId === 'new' ? `chat-${Date.now()}` : currentChatId;
            
            if (currentChatId === 'new') {
                setCurrentChatId(actualId);
            }

            const conversation: Conversation = {
                id: actualId,
                title: title,
                messages: messages,
                lastUpdated: new Date()
            };

            saveConversationToDB(conversation).then(() => {
                loadHistory(); 
            });
        }
    }, [messages, currentChatId]);

    // --- Helpers ---

    const refreshStateFromChunks = (chunks: KnowledgeChunk[]) => {
        setCustomChunks(chunks);
        const docMap = new Map<string, number>();
        chunks.forEach(chunk => {
            const count = docMap.get(chunk.source.id) || 0;
            docMap.set(chunk.source.id, count + 1);
        });
        const reconstructedDocs: DocumentStatus[] = Array.from(docMap.entries()).map(([name, count]) => ({
            name,
            status: 'indexed',
            chunks: count
        }));
        setDocsList(reconstructedDocs);
    };

    const loadHistory = async () => {
        try {
            const convs = await loadConversationsFromDB();
            setConversations(convs);
        } catch (e) {
            console.error("Failed to load history", e);
        }
    };

    const loadBenchmarkStats = async () => {
        try {
            const runs = await loadBenchmarkHistory();
            if (runs.length > 0) {
                setLastBenchmarkScore(runs[0].avgScore);
            }
        } catch (e) {
            console.error("Failed to load benchmark stats", e);
        }
    };

    const updateFineTuningCount = async () => {
        const count = await getFineTuningCount();
        setFineTuningCount(count);
    };

    // --- Actions ---

    const performQuery = async (queryText: string, categoryFilter?: string, existingMsgId?: string) => {
        setIsProcessing(true);
        setProcessingType('chat');
        setProcessingStatus(categoryFilter ? `جستجو در بخش ${categoryLabels[categoryFilter]}...` : (useWebSearch ? "جستجو در دانش عمومی و مستندات..." : "تحلیل سوال و جستجوی دقیق سازمانی..."));

        const responseMsgId = existingMsgId || 'msg-' + Date.now();
        
        // Only add if we didn't add it in the batch update (backward compatibility)
        if (!existingMsgId) {
            setMessages(prev => [...prev, {
                id: responseMsgId,
                role: 'assistant',
                content: '',
                timestamp: new Date(),
                isThinking: true
            }]);
        }

        try {
            // Get recent history for context-aware answers (last 6 messages excluding current)
            const history = messages
                .filter(m => !m.isThinking && m.id !== 'init-1')
                .slice(-6);

            // Fix: Provided 9 arguments to match the expected signature in services/search.ts and resolve argument count error.
            const response = await processQuery(
                queryText, 
                customChunks, 
                (pipelineData: PipelineData) => {
                    // Update UI with granular pipeline steps
                    setMessages(prev => prev.map(msg => {
                        if (msg.id === responseMsgId) {
                            return {
                                ...msg,
                                pipelineData: { ...msg.pipelineData, ...pipelineData } // MERGE previous data
                            };
                        }
                        return msg;
                    }));
                }, 
                categoryFilter,
                1,
                useWebSearch,
                history,
                undefined,
                false
            );

            if (response.error === "OLLAMA_CONNECTION_REFUSED") {
                const settings = getSettings();
                setMessages(prev => prev.map(msg => {
                    if (msg.id === responseMsgId) {
                        return {
                            ...msg,
                            content: `❌ **خطای اتصال به سرور هوش مصنوعی**\n\nسیستم قادر به برقراری ارتباط با Ollama در آدرس \`${settings.ollamaBaseUrl}\` نیست.\n\nلطفاً موارد زیر را بررسی کنید:\n۱. آیا برنامه Ollama باز است؟\n۲. آیا دستور \`ollama serve\` در ترمینال اجرا شده است؟\n۳. در تنظیمات برنامه، آدرس صحیح است؟`,
                            isThinking: false
                        };
                    }
                    return msg;
                }));
            } else {
                setMessages(prev => prev.map(msg => {
                    if (msg.id === responseMsgId) {
                        return {
                            ...msg,
                            content: response.text,
                            sources: response.sources,
                            // Fix: response now guaranteed to have isAmbiguous and options from search.ts
                            options: response.isAmbiguous ? response.options : undefined, 
                            debugInfo: response.debugInfo,
                            isThinking: false,
                            // Ensure final state is visible by merging
                            pipelineData: { 
                                ...msg.pipelineData,
                                step: 'generating', 
                                extractedKeywords: response.debugInfo?.extractedKeywords,
                                processingTime: response.debugInfo?.processingTimeMs 
                            }
                        };
                    }
                    return msg;
                }));
            }
        } catch (error) {
            console.error("Error processing query", error);
            // Ensure thinking stops in UI on unexpected error
            setMessages(prev => prev.map(msg => {
                if (msg.id === responseMsgId) {
                    return { ...msg, isThinking: false, content: '❌ خطای غیرمنتظره در پردازش.' };
                }
                return msg;
            }));
        } finally {
            setIsProcessing(false);
            setProcessingType('idle');
            setProcessingStatus('');
        }
    };

    const handleSendMessage = async () => {
        if (!inputText.trim() || isProcessing) return;

        if (customChunks.length === 0) {
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'assistant',
                content: '⚠️ پایگاه داده خالی است. لطفاً ابتدا مستندات را بارگذاری کنید.',
                timestamp: new Date()
            }]);
            return;
        }

        const userMsg: Message = {
            id: 'msg-u-' + Date.now(),
            role: 'user',
            content: inputText,
            timestamp: new Date(),
        };

        const thinkingMsgId = 'msg-a-' + Date.now();
        const thinkingMsg: Message = {
            id: thinkingMsgId,
            role: 'assistant',
            content: '',
            timestamp: new Date(),
            isThinking: true
        };

        // Combine updates to prevent double render/scroll jump
        setMessages(prev => [...prev, userMsg, thinkingMsg]);
        setInputText('');
        
        // Pass the pre-created ID so we update it instead of creating new one
        await performQuery(userMsg.content, undefined, thinkingMsgId);
    };

    const handleOptionSelect = async (selectedCategory: string) => {
        let lastMsgIndex = -1;
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'assistant' && messages[i].options) {
                lastMsgIndex = i;
                break;
            }
        }
        
        if (lastMsgIndex !== -1) {
            setMessages(prev => {
                const next = [...prev];
                next[lastMsgIndex] = { ...next[lastMsgIndex], selectedOption: selectedCategory };
                return next;
            });

            let originalQuery = "";
            for (let i = lastMsgIndex - 1; i >= 0; i--) {
                if (messages[i].role === 'user') {
                    originalQuery = messages[i].content;
                    break;
                }
            }

            if (originalQuery) {
                if (categoryLabels[selectedCategory]) {
                     await performQuery(originalQuery, selectedCategory);
                } else {
                     await performQuery(`${originalQuery} در ${selectedCategory}`);
                }
            }
        }
    };

    // --- Fine-Tuning Feedback Logic ---
    const handleFeedback = async (messageId: string, rating: number) => {
        setMessages(prev => prev.map(msg => 
            msg.id === messageId ? { ...msg, feedback: rating } : msg
        ));

        const msgIndex = messages.findIndex(m => m.id === messageId);
        if (msgIndex <= 0) return; 

        const assistantMsg = messages[msgIndex];
        const userMsg = messages[msgIndex - 1];

        if (userMsg.role !== 'user') return; 

        const record: FineTuningRecord = {
            id: `ft-${Date.now()}`,
            prompt: userMsg.content,
            response: assistantMsg.content,
            context: assistantMsg.sources?.map(s => s.snippet).join('\n---\n') || '',
            score: rating,
            sourceIds: assistantMsg.sources?.map(s => s.id) || [],
            model: getSettings().chatModel,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        await saveFineTuningRecord(record);
        await updateFineTuningCount();
    };

    const handleExportFineTuning = async () => {
        try {
            const jsonlData = await exportFineTuningDataset();
            const blob = new Blob([jsonlData], { type: 'application/jsonl' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `rayan_rlhf_dataset_${new Date().toISOString().slice(0,10)}.jsonl`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (e) {
            alert('خطا در دانلود دیتاست آموزشی');
        }
    };

    const handleCancelProcessing = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        setIsProcessing(false);
        setProcessingType('idle');
        setProcessingStatus('عملیات توسط کاربر لغو شد.');
        
        setDocsList(prev => prev.map(d => 
            d.status === 'processing' || d.status === 'embedding' 
            ? { ...d, status: 'error' } 
            : d
        ));
    };

    // --- Ticket Ingestion (Isolated) ---
    const handleTicketFileSelected = async (fileList: FileList) => {
        if (fileList.length === 0) return;
        const file = fileList[0];
        
        setIsProcessing(true);
        setProcessingType('file');
        setProcessingStatus(`در حال پردازش تیکت‌های ${file.name}...`);

        try {
            const tickets = await parseTicketFile(file, (step, info) => {
                setProcessingStatus(typeof info === 'string' ? info : `${step}...`);
            });
            
            if (tickets.length > 0) {
                await saveTicketsToDB(tickets);
                setTicketChunks(prev => [...prev, ...tickets]);
                alert(`${tickets.length} تیکت با موفقیت به پایگاه تحلیل اضافه شد.`);
            } else {
                alert('هیچ تیکتی در فایل یافت نشد.');
            }
        } catch (e: any) {
            console.error(e);
            alert(`خطا در پردازش تیکت‌ها: ${e.message}`);
        } finally {
            setIsProcessing(false);
            setProcessingType('idle');
            setProcessingStatus('');
        }
    };

    const handleClearTickets = async () => {
        if (confirm("آیا از حذف تمام داده‌های تیکت مطمئن هستید؟")) {
            await clearTicketsDB();
            setTicketChunks([]);
        }
    };

    // --- Main File Ingestion ---
    const handleFilesSelected = async (fileList: FileList) => {
        const isOnline = await checkOllamaConnection();
        if (!isOnline) {
            alert("خطا: سرویس Ollama در دسترس نیست. لطفاً مطمئن شوید Ollama اجرا شده است.");
            return;
        }

        setIsProcessing(true);
        setProcessingType('file');
        setProcessingStatus('در حال آنالیز فایل‌ها...');
        
        const newDocs: DocumentStatus[] = Array.from(fileList)
            .filter(f => f.name.match(/\.(md|txt|json|csv|xml|js|ts|py|log|docx)$/i)) 
            .map(f => ({
                name: f.name,
                status: 'processing',
                chunks: 0
            }));
        
        if (newDocs.length === 0) {
            alert("هیچ فایل قابل پردازشی یافت نشد.");
            setIsProcessing(false);
            setProcessingType('idle');
            setProcessingStatus('');
            return;
        }

        setDocsList(prev => [...newDocs, ...prev]);

        abortControllerRef.current = new AbortController();

        try {
            const extractedChunks = await parseFiles(
                fileList, 
                (fileName, step, info) => {
                    if (step === 'complete') {
                        const data = info as { count: number, category: string, subCategory: string };
                        setProcessingStatus(`تکمیل شد: ${fileName}`);
                        setDocsList(currentDocs => currentDocs.map(d => {
                            if (d.name === fileName) {
                                return { 
                                    ...d, 
                                    status: data.count > 0 ? 'indexed' : 'error', 
                                    chunks: data.count,
                                    category: data.category as any,
                                    subCategory: data.subCategory
                                };
                            }
                            return d;
                        }));
                    } else if (step === 'error') {
                        if (info !== 'ABORTED') {
                            setProcessingStatus(`خطا در پردازش: ${fileName}`);
                            setDocsList(currentDocs => currentDocs.map(d => {
                                if (d.name === fileName) return { ...d, status: 'error' };
                                return d;
                            }));
                        }
                    } else {
                        const statusMsg = info ? `${step === 'reading' ? 'آنالیز' : 'بردارسازی'}: ${fileName} (${info})` : `${fileName}...`;
                        setProcessingStatus(statusMsg);
                        setDocsList(currentDocs => currentDocs.map(d => {
                            if (d.name === fileName) {
                                if (d.status === 'indexed') return d;
                                return { ...d, status: step === 'embedding' ? 'embedding' : 'processing' };
                            }
                            return d;
                        }));
                    }
                },
                abortControllerRef.current.signal 
            );

            setCustomChunks(prev => [...prev, ...extractedChunks]);
            
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'system',
                content: `✅ پردازش تکمیل شد. ${extractedChunks.length} قطعه اضافه شد.`,
                timestamp: new Date()
            }]);

        } catch (e: any) {
            console.error(e);
            if (e.message === "ABORTED") {
                setMessages(prev => [...prev, {
                    id: Date.now().toString(),
                    role: 'system',
                    content: '🛑 عملیات پردازش فایل‌ها توسط کاربر متوقف شد.',
                    timestamp: new Date()
                }]);
            } else if (e.message === "OLLAMA_CONNECTION_REFUSED") {
                setMessages(prev => [...prev, {
                    id: Date.now().toString(),
                    role: 'system',
                    content: '❌ خطا: ارتباط با Ollama قطع شد. لطفاً بررسی کنید که سرویس در حال اجرا باشد و مجدداً تلاش کنید.',
                    timestamp: new Date()
                }]);
            } else {
                alert("خطا در پردازش فایل‌ها");
            }
        } finally {
            setIsProcessing(false);
            setProcessingType('idle');
            setProcessingStatus('');
            abortControllerRef.current = null;
        }
    };

    const handleClearDB = async () => {
        if (confirm('آیا مطمئن هستید؟ تمام مستندات ذخیره شده حذف خواهند شد.')) {
            await clearDatabase();
            setCustomChunks([]);
            setTicketChunks([]);
            setDocsList([]);
            setConversations([]);
            setMessages([INITIAL_MESSAGE]);
            setCurrentChatId('new');
            setLastBenchmarkScore(null);
            setFineTuningCount(0);
            alert('پایگاه داده پاک شد.');
        }
    };

    const handleExportDB = async () => {
        try {
            // Using new blob-optimized export to handle large datasets (18k+ chunks)
            const blob = await exportDatabaseToBlob();
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `rayan_vector_db_${new Date().toISOString().slice(0,10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (e: any) {
            console.error("Export DB Error:", e);
            alert(`خطا در دانلود دیتابیس: ${e.message || 'Unknown Error'}. \n(Console را برای جزئیات چک کنید)`);
        }
    };

    const handleImportDB = async (fileList: FileList) => {
        if (fileList.length === 0) return;
        const file = fileList[0];
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const content = e.target?.result as string;
                setIsDbLoading(true);
                const loadedChunks = await importDatabaseFromJson(content);
                refreshStateFromChunks(loadedChunks);
                setMessages(prev => [...prev, {
                    id: Date.now().toString(),
                    role: 'system',
                    content: `📥 پایگاه داده از فایل ${file.name} بازیابی شد (${loadedChunks.length} رکورد).`,
                    timestamp: new Date()
                }]);
            } catch (err) {
                alert("خطا: فایل نامعتبر است یا ساختار دیتابیس همخوانی ندارد.");
            } finally {
                setIsDbLoading(false);
            }
        };
        reader.readAsText(file);
    };

    const handleNewChat = () => {
        setCurrentChatId('new');
        setMessages([INITIAL_MESSAGE]);
    };

    const handleSelectConversation = (id: string) => {
        const conv = conversations.find(c => c.id === id);
        if (conv) {
            setCurrentChatId(conv.id);
            setMessages(conv.messages);
        }
    };

    const handleDeleteConversation = async (id: string) => {
        if (confirm('مکالمه حذف شود؟')) {
            await deleteConversationFromDB(id);
            await loadHistory();
            if (currentChatId === id) {
                handleNewChat();
            }
        }
    };

    return {
        state: {
            messages,
            conversations,
            currentChatId,
            inputText,
            isProcessing,
            processingType,
            isDbLoading,
            processingStatus,
            customChunks,
            ticketChunks, // Expose isolated tickets
            docsList,
            isOllamaOnline,
            useWebSearch,
            lastBenchmarkScore,
            fineTuningCount 
        },
        actions: {
            setInputText,
            handleSendMessage,
            handleOptionSelect,
            handleFilesSelected,
            handleTicketFileSelected, // New action
            handleClearTickets, // New action
            handleCancelProcessing,
            handleClearDB,
            handleExportDB,
            handleImportDB,
            handleNewChat,
            handleSelectConversation,
            handleDeleteConversation,
            setUseWebSearch,
            handleFeedback,       
            handleExportFineTuning 
        }
    };
};
