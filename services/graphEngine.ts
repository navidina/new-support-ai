
import { KnowledgeChunk, GraphNode, GraphLink, SchemaEntityType } from '../types';

/**
 * Labels for mapping category codes to human-readable Persian names.
 */
export const categoryLabels: Record<string, string> = {
    'back_office': 'مدیریت کارگزاری (BackOffice)',
    'online_trading': 'معاملات برخط (OMS)',
    'portfolio_management': 'سبدگردانی',
    'funds': 'صندوق‌های سرمایه‌گذاری',
    'commodity_energy': 'بورس کالا و انرژی',
    'troubleshooting': 'عیب‌یابی و تیکت‌ها',
    'operational_process': 'فرآیندهای اجرایی',
    'technical_infrastructure': 'فنی و زیرساخت',
    'general': 'عمومی'
};

/**
 * Labels for mapping sub-category codes.
 */
export const subCategoryLabels: Record<string, string> = {
    'basic_info': 'اطلاعات پایه',
    'accounting': 'حسابداری/مالی',
    'treasury': 'خزانه‌داری',
    'securities_ops': 'عملیات اوراق',
    'general_backoffice': 'بک‌آفیس عمومی',
    'exir': 'اکسیر',
    'recsar': 'رکسار',
    'rayan_mobile': 'رایان همراه',
    'pwa': 'وب اپلیکیشن',
    'general_online': 'آنلاین عمومی',
    'contracts': 'قراردادها',
    'portfolio_ops': 'عملیات سبد',
    'portfolio_reports': 'گزارشات',
    'general_portfolio': 'سبد عمومی',
    'fund_ops': 'صدور و ابطال',
    'market_making': 'بازارگردانی',
    'fund_api': 'API صندوق',
    'general_funds': 'صندوق عمومی',
    'commodity': 'بورس کالا',
    'energy': 'بورس انرژی',
    'futures': 'آتی',
    'financial_reconciliation': 'مغایرت مالی',
    'trading_issues': 'مشکلات معاملات',
    'access_issues': 'دسترسی/لاگین',
    'general_ticket': 'تیکت‌های عمومی',
    'ipo': 'عرضه اولیه',
    'clearing': 'تسویه و پایاپای',
    'payment_gateways': 'درگاه پرداخت',
    'web_service': 'وب‌سرویس',
    'network_security': 'شبکه/امنیت',
    'uncategorized': 'سایر'
};

const GRANULAR_TOPICS: Record<string, string> = {
    'رایان کلاب': 'باشگاه مشتریان',
    'اختیار معامله': 'معاملات آپشن',
    'همراه صندوق': 'اپلیکیشن صندوق',
    'ورود دو مرحله': 'احراز هویت',
    'فراموشی رمز': 'بازیابی رمز عبور',
    'رمز عبور اشتباه': 'خطای لاگین',
    'حساب مسدود': 'مسدودی حساب',
    'سفارش شرطی': 'سفارش شرطی',
    'خرید عرضه اولیه': 'عرضه اولیه',
    'فروش تعهدی': 'فروش تعهدی',
    'صف خرید': 'مدیریت صف',
    'مغایرت ریالی': 'مغایرت مالی',
    'واریز آنی': 'پرداخت الکترونیک',
    'صدور واحد': 'صدور صندوق',
    'ابطال واحد': 'ابطال صندوق',
    'nav ابطال': 'محاسبه NAV',
    'خطای 10061': 'خطای شبکه',
    'تایم اوت': 'خطای شبکه',
    'شعب': 'مدیریت شعب',
    'سجام': 'احراز هویت سجام',
    'پایاپای': 'امور تسویه'
};

export const detectGranularTopic = (text: string): string => {
    const content = text.toLowerCase();
    let bestMatch = 'سایر موضوعات';
    let maxScore = 0;

    for (const [keyword, topicLabel] of Object.entries(GRANULAR_TOPICS)) {
        if (content.includes(keyword.toLowerCase())) {
            const score = keyword.length * 2; 
            if (score > maxScore) {
                maxScore = score;
                bestMatch = topicLabel;
            }
        }
    }
    if (maxScore > 0) return bestMatch;
    return 'عمومی';
};

const calculateTreeLayout = (rootId: string, nodes: GraphNode[], links: GraphLink[]) => {
    const adj: Record<string, string[]> = {};
    links.forEach(l => {
        if (!adj[l.source]) adj[l.source] = [];
        adj[l.source].push(l.target);
    });

    const widths: Record<string, number> = {};
    const LEAF_WIDTH = 60;
    const SPACING = 20;

    const getWidth = (nodeId: string): number => {
        const children = adj[nodeId] || [];
        const validChildren = children.filter(cid => nodes.some(n => n.id === cid));
        if (validChildren.length === 0) {
            widths[nodeId] = LEAF_WIDTH;
            return LEAF_WIDTH;
        }
        let w = 0;
        validChildren.forEach(childId => w += getWidth(childId));
        w += (validChildren.length - 1) * SPACING;
        widths[nodeId] = w;
        return w;
    };
    
    getWidth(rootId);

    const setPosition = (nodeId: string, x: number, y: number) => {
        const node = nodes.find(n => n.id === nodeId);
        if (node) {
            node.treeX = x;
            node.treeY = y;
        }
        const children = adj[nodeId] || [];
        const validChildren = children.filter(cid => nodes.some(n => n.id === cid));
        if (validChildren.length === 0) return;

        let currentX = x - widths[nodeId] / 2;
        validChildren.forEach(childId => {
            const childWidth = widths[childId];
            setPosition(childId, currentX + childWidth / 2, y + 180); 
            currentX += childWidth + SPACING;
        });
    };

    setPosition(rootId, 0, -300);
};

export const prepareGraphData = (chunks: KnowledgeChunk[], visibleCategories: Set<string>) => {
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];
    const treeLinks: GraphLink[] = [];
    const networkLinks: GraphLink[] = [];
    const topicLinks: GraphLink[] = [];

    const rootNode: GraphNode = {
        id: 'root',
        group: 'root',
        label: 'پایگاه دانش',
        fullLabel: 'پایگاه دانش رایان هم‌افزا',
        x: 0, y: 0, vx: 0, vy: 0, radius: 40, baseRadius: 40, color: '#1e293b', chunkCount: chunks.length
    };
    nodes.push(rootNode);

    const categories = new Map<string, GraphNode>();
    const subCategories = new Map<string, GraphNode>();
    const files = new Map<string, GraphNode>();
    const topics = new Map<string, GraphNode>();

    chunks.forEach(chunk => {
        const catKey = chunk.metadata?.category || 'general';
        const subKey = chunk.metadata?.subCategory || 'uncategorized';
        const fileKey = chunk.source.id;
        
        if (!visibleCategories.has(catKey)) return;

        if (!categories.has(catKey)) {
            const catNode: GraphNode = {
                id: `cat-${catKey}`,
                group: 'category',
                label: categoryLabels[catKey] || catKey,
                fullLabel: categoryLabels[catKey] || catKey,
                x: (Math.random() - 0.5) * 400,
                y: (Math.random() - 0.5) * 400,
                vx: 0, vy: 0, radius: 25, baseRadius: 25, color: '#3b82f6', chunkCount: 0
            };
            categories.set(catKey, catNode);
            nodes.push(catNode);
            
            links.push({ source: 'root', target: catNode.id });
            treeLinks.push({ source: 'root', target: catNode.id });
            networkLinks.push({ source: 'root', target: catNode.id });
            topicLinks.push({ source: 'root', target: catNode.id });
        }
        categories.get(catKey)!.chunkCount!++;

        const subId = `sub-${catKey}-${subKey}`;
        if (!subCategories.has(subId)) {
            const subNode: GraphNode = {
                id: subId,
                group: 'subCategory',
                label: subCategoryLabels[subKey] || subKey,
                fullLabel: subCategoryLabels[subKey] || subKey,
                x: (Math.random() - 0.5) * 500,
                y: (Math.random() - 0.5) * 500,
                vx: 0, vy: 0, radius: 15, baseRadius: 15, color: '#10b981', chunkCount: 0
            };
            subCategories.set(subId, subNode);
            nodes.push(subNode);
            
            links.push({ source: `cat-${catKey}`, target: subId });
            treeLinks.push({ source: `cat-${catKey}`, target: subId });
            networkLinks.push({ source: `cat-${catKey}`, target: subId });
            
            const topicLabel = detectGranularTopic(chunk.content);
            const topicId = `topic-${topicLabel}`;
            if (!topics.has(topicId)) {
                const topicNode: GraphNode = {
                    id: topicId,
                    group: 'topic',
                    label: topicLabel,
                    fullLabel: topicLabel,
                    x: (Math.random() - 0.5) * 600,
                    y: (Math.random() - 0.5) * 600,
                    vx: 0, vy: 0, radius: 20, baseRadius: 20, color: '#8b5cf6', chunkCount: 0, relatedChunks: []
                };
                topics.set(topicId, topicNode);
                nodes.push(topicNode);
                topicLinks.push({ source: 'root', target: topicId }); 
            }
            const tNode = topics.get(topicId)!;
            tNode.chunkCount!++;
            tNode.relatedChunks!.push(chunk);
        }
        subCategories.get(subId)!.chunkCount!++;

        const fileId = `file-${fileKey}`;
        if (!files.has(fileId)) {
            const fileNode: GraphNode = {
                id: fileId,
                group: 'file',
                label: fileKey.length > 15 ? fileKey.substring(0, 12) + '...' : fileKey,
                fullLabel: fileKey,
                x: (Math.random() - 0.5) * 600,
                y: (Math.random() - 0.5) * 600,
                vx: 0, vy: 0, radius: 8, baseRadius: 8, color: '#cbd5e1', chunkCount: 0, metadata: chunk.metadata
            };
            files.set(fileId, fileNode);
            nodes.push(fileNode);
            links.push({ source: subId, target: fileId });
            treeLinks.push({ source: subId, target: fileId });
            networkLinks.push({ source: subId, target: fileId });
        }
        files.get(fileId)!.chunkCount!++;
        
        const topicLabel = detectGranularTopic(chunk.content);
        const topicId = `topic-${topicLabel}`;
        topicLinks.push({ source: topicId, target: fileId });
    });

    const categoryNodes = Array.from(categories.values());
    const angleStep = (2 * Math.PI) / categoryNodes.length;
    categoryNodes.forEach((cat, i) => {
        const angle = i * angleStep;
        cat.radialX = Math.cos(angle) * 150;
        cat.radialY = Math.sin(angle) * 150;
        const relatedSubs = nodes.filter(n => n.group === 'subCategory' && n.id.includes(cat.id.replace('cat-', '')));
        const subAngleStep = 0.5;
        const startSubAngle = angle - (relatedSubs.length * subAngleStep) / 2;
        relatedSubs.forEach((sub, j) => {
            const subAngle = startSubAngle + j * subAngleStep;
            sub.radialX = Math.cos(subAngle) * 300;
            sub.radialY = Math.sin(subAngle) * 300;
        });
    });

    const validTreeLinks = treeLinks.filter(l => nodes.some(n => n.id === l.source) && nodes.some(n => n.id === l.target));
    calculateTreeLayout('root', nodes, validTreeLinks);

    const topicNodes = Array.from(topics.values());
    const cols = Math.ceil(Math.sqrt(topicNodes.length));
    const spacing = 150;
    topicNodes.forEach((t, i) => {
        const row = Math.floor(i / cols);
        const col = i % cols;
        t.metadata = { ...t.metadata, topicTreeX: (col - cols/2) * spacing, topicTreeY: (row - cols/2) * spacing };
    });

    return { nodes, links, treeLinks, networkLinks, topicLinks };
};

export const prepareSmartGraphData = (chunks: KnowledgeChunk[]) => {
    const nodes = new Map<string, GraphNode>();
    const links: GraphLink[] = [];

    chunks.forEach(chunk => {
        const text = chunk.content;
        const concepts = [];
        if (text.includes('خطا') || text.includes('مشکل')) concepts.push('خطاها و مشکلات');
        if (text.includes('اکسیر')) concepts.push('سامانه اکسیر');
        if (text.includes('رکسار')) concepts.push('سامانه رکسار');
        if (text.includes('صندوق') || text.includes('ETF')) concepts.push('مدیریت صندوق');
        if (text.includes('سند') || text.includes('حسابداری')) concepts.push('حسابداری');
        if (text.includes('کارمزد')) concepts.push('مدیریت کارمزد');
        if (text.includes('سفارش')) concepts.push('سفارش‌گذاری');

        concepts.forEach(c => {
            if (!nodes.has(c)) {
                nodes.set(c, {
                    id: c, group: 'concept', label: c, fullLabel: c,
                    x: (Math.random() - 0.5) * 400, y: (Math.random() - 0.5) * 400,
                    vx: 0, vy: 0, radius: 35, baseRadius: 35, color: '#ec4899', chunkCount: 0
                });
            }
            nodes.get(c)!.chunkCount!++;
        });

        const fileId = `file-${chunk.source.id}`;
        if (!nodes.has(fileId)) {
            nodes.set(fileId, {
                id: fileId, group: 'file', label: chunk.source.id.substring(0, 10) + '...', fullLabel: chunk.source.id,
                x: (Math.random() - 0.5) * 600, y: (Math.random() - 0.5) * 600,
                vx: 0, vy: 0, radius: 6, baseRadius: 6, color: '#94a3b8', chunkCount: 0
            });
        }
        concepts.forEach(c => links.push({ source: c, target: fileId, type: 'semantic' }));
    });

    return { nodes: Array.from(nodes.values()), links: links, treeLinks: [], networkLinks: [], topicLinks: [] };
};

// ==========================================
// TICKET-FOCUSED SCHEMA GRAPH LOGIC (REVISED)
// ==========================================

const TICKET_CONFIG = {
    // Level 1: Systems (Root Anchors)
    systems: {
        'exir': { label: 'سامانه اکسیر', color: '#1e40af', x: 0, y: -200 },
        'recsar': { label: 'سامانه رکسار', color: '#1e3a8a', x: 200, y: -100 },
        'backoffice': { label: 'بک‌آفیس', color: '#1e40af', x: -200, y: -100 },
        'etf': { label: 'صندوق/ETF', color: '#1d4ed8', x: 0, y: 100 },
        'mobile': { label: 'رایان همراه', color: '#2563eb', x: 200, y: 100 },
        'unknown': { label: 'سایر سیستم‌ها', color: '#64748b', x: -200, y: 100 }
    },
    // Level 2: Modules/Components (Orange)
    components: [
        { key: 'login', patterns: ['لاگین', 'رمز عبور', 'ورود', 'دسترسی'], label: 'دسترسی و ورود' },
        { key: 'order', patterns: ['سفارش', 'خرید', 'فروش', 'معامله'], label: 'سفارشات' },
        { key: 'finance', patterns: ['حساب', 'مانده', 'واریز', 'فیش', 'پول', 'اعتبار'], label: 'مالی و حساب' },
        { key: 'data', patterns: ['گزارش', 'داده', 'نمودار', 'اطلاعات', 'خروجی'], label: 'گزارشات و داده' },
        { key: 'setting', patterns: ['تنظیمات', 'پیکربندی', 'منو', 'آپدیت'], label: 'تنظیمات' }
    ],
    // Level 3: Issues/Symptoms (Red)
    issues: [
        { key: 'error', patterns: ['خطای', 'ارور', 'error', 'failed'], label: 'خطای سیستمی' },
        { key: 'discrepancy', patterns: ['مغایرت', 'اختلاف', 'تفاوت'], label: 'مغایرت' },
        { key: 'block', patterns: ['مسدود', 'بسته', 'غیرفعال'], label: 'مسدودی' },
        { key: 'connection', patterns: ['قطع', 'تایم اوت', 'timeout', 'کند'], label: 'اتصال/شبکه' },
        { key: 'bug', patterns: ['باگ', 'ایراد', 'مشکل', 'نمایش نمی‌دهد'], label: 'باگ نرم‌افزاری' }
    ],
    // Level 4: Actions/Solutions (Green)
    actions: [
        { key: 'reset', patterns: ['ریست', 'بازنشانی', 'reset'], label: 'ریست/بازنشانی' },
        { key: 'update', patterns: ['بروزرسانی', 'update', 'نسخه جدید'], label: 'بروزرسانی' },
        { key: 'config', patterns: ['تنظیم', 'اصلاح', 'تغییر وضعیت'], label: 'تغییر تنظیمات' },
        { key: 'check', patterns: ['بررسی', 'پیگیری', 'تیکت'], label: 'بررسی پشتیبانی' }
    ]
};

const extractTicketEntities = (text: string) => {
    const lower = text.toLowerCase();
    
    // 1. Detect System
    let sysKey = 'unknown';
    if (lower.includes('اکسیر') || lower.includes('exir')) sysKey = 'exir';
    else if (lower.includes('رکسار') || lower.includes('recsar')) sysKey = 'recsar';
    else if (lower.includes('بک آفیس') || lower.includes('بک‌آفیس')) sysKey = 'backoffice';
    else if (lower.includes('صندوق') || lower.includes('etf')) sysKey = 'etf';
    else if (lower.includes('رایان همراه') || lower.includes('mobile')) sysKey = 'mobile';

    // 2. Detect Component (Module)
    let compMatch = TICKET_CONFIG.components.find(c => c.patterns.some(p => lower.includes(p)));
    
    // 3. Detect Issue
    let issueMatch = TICKET_CONFIG.issues.find(i => i.patterns.some(p => lower.includes(p)));
    
    // Specific Error Code Extraction (e.g., "Error 10061")
    const errCodeMatch = lower.match(/(خطای|error)\s*[:#-]?\s*(\d{3,})/);
    let specificIssueLabel = issueMatch ? issueMatch.label : null;
    if (errCodeMatch) {
        specificIssueLabel = `خطای ${errCodeMatch[2]}`;
    }

    // 4. Detect Action
    let actionMatch = TICKET_CONFIG.actions.find(a => a.patterns.some(p => lower.includes(p)));

    return { sysKey, compMatch, issueLabel: specificIssueLabel, actionMatch };
};

/**
 * Fundamental Logic Revision:
 * Creates a "Root Cause Analysis" graph specifically for Tickets.
 * Structure: System -> Component -> Issue -> Solution
 */
export const prepareSchemaGraphData = (chunks: KnowledgeChunk[]) => {
    const nodesMap = new Map<string, GraphNode>();
    const links: GraphLink[] = [];
    const MAX_NODES = 200; // stricter limit for clarity

    // 1. Create Base System Nodes
    Object.entries(TICKET_CONFIG.systems).forEach(([key, conf]) => {
        nodesMap.set(`sys-${key}`, {
            id: `sys-${key}`,
            group: 'System',
            label: conf.label,
            fullLabel: conf.label,
            x: conf.x, y: conf.y, vx: 0, vy: 0, radius: 45, baseRadius: 45, color: conf.color, chunkCount: 0,
            targetX: conf.x, targetY: conf.y
        });
    });

    // 2. Filter & Process Chunks
    // We prioritize chunks that look like tickets or troubleshooting guides
    const ticketChunks = chunks.filter(c => 
        c.metadata?.category === 'troubleshooting' || 
        c.metadata?.ticketId || 
        c.content.includes('خطا') || 
        c.content.includes('مغایرت')
    );

    ticketChunks.forEach(chunk => {
        if (nodesMap.size > MAX_NODES) return;

        const { sysKey, compMatch, issueLabel, actionMatch } = extractTicketEntities(chunk.content);
        const sysId = `sys-${sysKey}`;
        
        // --- Add Component Node (Module) ---
        let compId = '';
        if (compMatch) {
            compId = `comp-${sysKey}-${compMatch.key}`;
            if (!nodesMap.has(compId)) {
                nodesMap.set(compId, {
                    id: compId, group: 'Module', label: compMatch.label, fullLabel: compMatch.label,
                    x: nodesMap.get(sysId)!.x + (Math.random()-0.5)*100,
                    y: nodesMap.get(sysId)!.y + (Math.random()-0.5)*100,
                    vx: 0, vy: 0, radius: 25, baseRadius: 25, color: '#f59e0b', chunkCount: 1
                });
                // Link System -> Component
                links.push({ source: sysId, target: compId });
            } else {
                nodesMap.get(compId)!.chunkCount!++;
            }
        }

        // --- Add Issue Node (The Problem) ---
        let issueId = '';
        if (issueLabel) {
            // Use label as ID to merge similar errors (e.g., all "Error 10061" nodes merge)
            const cleanLabel = issueLabel.replace(/\s+/g, '-');
            issueId = `issue-${sysKey}-${cleanLabel}`;
            
            if (!nodesMap.has(issueId)) {
                nodesMap.set(issueId, {
                    id: issueId, group: 'Issue', label: issueLabel, fullLabel: issueLabel,
                    x: (Math.random()-0.5)*400, y: (Math.random()-0.5)*400,
                    vx: 0, vy: 0, radius: 20, baseRadius: 20, color: '#ef4444', chunkCount: 1
                });
            } else {
                nodesMap.get(issueId)!.chunkCount!++;
            }

            // Link: Component -> Issue OR System -> Issue (if no component detected)
            const parentId = compId || sysId;
            // Avoid duplicates
            if (!links.some(l => l.source === parentId && l.target === issueId)) {
                links.push({ source: parentId, target: issueId, type: 'CAUSED_BY' });
            }
        }

        // --- Add Action Node (The Solution) ---
        if (actionMatch && issueId) {
            const actionId = `act-${actionMatch.key}`;
            if (!nodesMap.has(actionId)) {
                nodesMap.set(actionId, {
                    id: actionId, group: 'Action', label: actionMatch.label, fullLabel: actionMatch.label,
                    x: (Math.random()-0.5)*500, y: (Math.random()-0.5)*500,
                    vx: 0, vy: 0, radius: 15, baseRadius: 15, color: '#10b981', chunkCount: 1
                });
            }
            // Link: Action -> Issue (Solves)
            if (!links.some(l => l.source === actionId && l.target === issueId)) {
                links.push({ source: actionId, target: issueId, type: 'SOLVES' });
            }
        }
    });

    // Remove lonely System nodes to clean up graph
    const usedSystemIds = new Set(links.map(l => l.source));
    const finalNodes = Array.from(nodesMap.values()).filter(n => 
        n.group !== 'System' || usedSystemIds.has(n.id) || n.chunkCount! > 0
    );

    return { 
        nodes: finalNodes, 
        links, 
        treeLinks: [], networkLinks: [], topicLinks: [] 
    };
};
