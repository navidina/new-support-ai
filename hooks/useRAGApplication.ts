
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
    const [processingType, setProcessingType] = useState<'file' | 'chat' | 'idle'>('idle');
    const [isDbLoading, setIsDbLoading] = useState(true);
    const [processingStatus, setProcessingStatus] = useState<string>('');
    const [customChunks, setCustomChunks] = useState<KnowledgeChunk[]>([]);
    const [ticketChunks, setTicketChunks] = useState<KnowledgeChunk[]>([]); 
    const [docsList, setDocsList] = useState<DocumentStatus[]>([]);
    const [isOllamaOnline, setIsOllamaOnline] = useState<boolean>(false);
    const [isServerOnline, setIsServerOnline] = useState<boolean>(false); // New: Track server health
    const [lastBenchmarkScore, setLastBenchmarkScore] = useState<number | null>(null);
    const [fineTuningCount, setFineTuningCount] = useState(0); 
    const [serverChunkCount, setServerChunkCount] = useState(0);
    const [useWebSearch, setUseWebSearch] = useState(false);

    const isDbInitialized = useRef(false);
    const abortControllerRef = useRef<AbortController | null>(null);

    // --- Periodic Health Check ---
    useEffect(() => {
        const checkHealth = async () => {
            const ollamaStatus = await checkOllamaConnection();
            setIsOllamaOnline(ollamaStatus);
            await loadServerStats();
        };
        checkHealth();
        const interval = setInterval(checkHealth, 10000); // Check every 10s
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (isDbInitialized.current) return;
        isDbInitialized.current = true;

        const initSystem = async () => {
            try {
                // Load Local Tickets
                const savedTickets = await loadTicketsFromDB();
                if (savedTickets.length > 0) {
                    setTicketChunks(savedTickets);
                }

                await loadHistory();
                await loadBenchmarkStats();
                await updateFineTuningCount(); 
                // loadServerStats called in health check already
            } catch (error) {
                console.error("Failed to load DB", error);
            } finally {
                setIsDbLoading(false);
            }
        };
        initSystem();
    }, []);

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

            saveConversationToDB(conversation).then(() => loadHistory());
        }
    }, [messages, currentChatId]);

    // --- Helpers ---

    const loadServerStats = async () => {
        try {
            const settings = getSettings();
            // Fail fast if offline
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);
            
            const res = await fetch(`${settings.serverUrl}/stats`, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (res.ok) {
                const data = await res.json();
                setServerChunkCount(data.count || 0);
                setIsServerOnline(true);
            } else {
                setIsServerOnline(false);
            }
        } catch (e) {
            // Suppress error in console, just mark offline
            setIsServerOnline(false);
        }
    };

    const loadHistory = async () => {
        try {
            const convs = await loadConversationsFromDB();
            setConversations(convs);
        } catch (e) { console.error("Failed to load history", e); }
    };

    const loadBenchmarkStats = async () => {
        try {
            const runs = await loadBenchmarkHistory();
            if (runs.length > 0) setLastBenchmarkScore(runs[0].avgScore);
        } catch (e) { console.error("Failed to load benchmark stats", e); }
    };

    const updateFineTuningCount = async () => {
        const count = await getFineTuningCount();
        setFineTuningCount(count);
    };

    // --- Actions ---

    const performQuery = async (queryText: string, categoryFilter?: string, existingMsgId?: string) => {
        if (!isServerOnline) {
             const responseMsgId = existingMsgId || 'msg-' + Date.now();
             setMessages(prev => {
                 const newMsgs = [...prev];
                 if (!existingMsgId) {
                     newMsgs.push({
                        id: responseMsgId,
                        role: 'assistant',
                        content: '❌ **خطای اتصال به سرور مرکزی**\n\nلطفاً از اجرای فایل `server/index.js` اطمینان حاصل کنید.',
                        timestamp: new Date(),
                        isThinking: false
                     });
                 } else {
                     return prev.map(m => m.id === responseMsgId ? { ...m, content: '❌ خطا: سرور مرکزی در دسترس نیست.', isThinking: false } : m);
                 }
                 return newMsgs;
             });
             return;
        }

        setIsProcessing(true);
        setProcessingType('chat');
        setProcessingStatus(categoryFilter ? `جستجو در بخش ${categoryLabels[categoryFilter]}...` : "تحلیل سوال و جستجوی دقیق سازمانی...");

        const responseMsgId = existingMsgId || 'msg-' + Date.now();
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
            const history = messages.filter(m => !m.isThinking && m.id !== 'init-1').slice(-6);
            const response = await processQuery(
                queryText, 
                [], // No local chunks
                (pipelineData: PipelineData) => {
                    setMessages(prev => prev.map(msg => {
                        if (msg.id === responseMsgId) {
                            return { ...msg, pipelineData: { ...msg.pipelineData, ...pipelineData } };
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
                setMessages(prev => prev.map(msg => {
                    if (msg.id === responseMsgId) {
                        return {
                            ...msg,
                            content: `❌ **خطای اتصال به مدل هوش مصنوعی**\n\nارتباط سرور با Ollama برقرار نشد.`,
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
                            options: response.isAmbiguous ? response.options : undefined, 
                            debugInfo: response.debugInfo,
                            isThinking: false,
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

        // In client-server mode, rely on server count
        if (serverChunkCount === 0 && customChunks.length === 0) {
             await loadServerStats();
             if (serverChunkCount === 0) {
                setMessages(prev => [...prev, {
                    id: Date.now().toString(),
                    role: 'assistant',
                    content: '⚠️ پایگاه داده خالی است. لطفاً ابتدا مستندات را بارگذاری کنید.',
                    timestamp: new Date()
                }]);
                return;
             }
        }

        const userMsg: Message = { id: 'msg-u-' + Date.now(), role: 'user', content: inputText, timestamp: new Date() };
        const thinkingMsgId = 'msg-a-' + Date.now();
        const thinkingMsg: Message = { id: thinkingMsgId, role: 'assistant', content: '', timestamp: new Date(), isThinking: true };

        setMessages(prev => [...prev, userMsg, thinkingMsg]);
        setInputText('');
        await performQuery(userMsg.content, undefined, thinkingMsgId);
    };

    const handleOptionSelect = async (selectedCategory: string) => { /* ... */ };
    const handleFeedback = async (messageId: string, rating: number) => { /* ... */ };
    const handleExportFineTuning = async () => { /* ... */ };
    const handleCancelProcessing = () => { /* ... */ };
    const handleTicketFileSelected = async (fileList: FileList) => { /* ... */ };
    const handleClearTickets = async () => { /* ... */ };
    
    // Updated Files Selected Handler (Calls loadServerStats after ingestion)
    const handleFilesSelected = async (fileList: FileList) => {
        if (!isServerOnline) {
            alert("خطا: سرور مرکزی در دسترس نیست.");
            return;
        }
        setIsProcessing(true);
        setProcessingType('file');
        setProcessingStatus('در حال آنالیز فایل‌ها...');
        
        abortControllerRef.current = new AbortController();
        try {
            const extractedChunks = await parseFiles(
                fileList, 
                (fileName, step, info) => {
                    const statusMsg = info ? `${step === 'reading' ? 'آنالیز' : 'ارسال به سرور'}: ${fileName}` : `${fileName}...`;
                    setProcessingStatus(statusMsg);
                },
                abortControllerRef.current.signal 
            );
            await loadServerStats(); // Update count
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'system',
                content: `✅ پردازش تکمیل شد. ${extractedChunks.length} قطعه به سرور اضافه شد.`,
                timestamp: new Date()
            }]);
        } catch (e: any) {
            alert("خطا در پردازش فایل‌ها: " + e.message);
        } finally {
            setIsProcessing(false);
            setProcessingType('idle');
            setProcessingStatus('');
        }
    };

    const handleClearDB = async () => {
        if (confirm('آیا مطمئن هستید؟ تمام مستندات ذخیره شده حذف خواهند شد.')) {
            await clearDatabase();
            setCustomChunks([]);
            setServerChunkCount(0);
            alert('پایگاه داده پاک شد.');
        }
    };

    const handleExportDB = async () => { /* ... */ };
    const handleImportDB = async (fileList: FileList) => { /* ... */ };
    const handleNewChat = () => { setCurrentChatId('new'); setMessages([INITIAL_MESSAGE]); };
    const handleSelectConversation = (id: string) => { const c = conversations.find(x => x.id === id); if(c) {setCurrentChatId(c.id); setMessages(c.messages);} };
    const handleDeleteConversation = async (id: string) => { await deleteConversationFromDB(id); await loadHistory(); };

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
            customChunks: Array(serverChunkCount).fill({}), // Fake array to satisfy "length > 0" checks in UI
            ticketChunks,
            docsList,
            isOllamaOnline,
            isServerOnline, // Exported to UI
            useWebSearch,
            lastBenchmarkScore,
            fineTuningCount 
        },
        actions: {
            setInputText,
            handleSendMessage,
            handleOptionSelect,
            handleFilesSelected,
            handleTicketFileSelected,
            handleClearTickets,
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
