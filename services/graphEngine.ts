

import { KnowledgeChunk, GraphNode, GraphLink } from '../types';

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

export const subCategoryLabels: Record<string, string> = {
    'basic_info': 'مدیریت اطلاعات پایه',
    'accounting': 'امور مالی و حسابداری',
    'treasury': 'خزانه‌داری',
    'securities_ops': 'عملیات اوراق',
    'general_backoffice': 'بک‌آفیس عمومی',
    'exir': 'سامانه معاملاتی اکسیر',
    'recsar': 'سامانه معاملاتی رکسار',
    'rayan_mobile': 'رایان همراه',
    'pwa': 'نسخه وب‌اپلیکیشن',
    'fund_ops': 'صدور و ابطال',
    'market_making': 'بازارگردانی',
    'fund_api': 'API صندوق',
    'general_funds': 'صندوق عمومی',
    'commodity': 'بورس کالا',
    'energy': 'بورس انرژی',
    'futures': 'آتی',
    'financial_reconciliation': 'مغایرت مالی',
    'trading_issues': 'خطاهای سفارش‌گذاری',
    'access_issues': 'مشکلات دسترسی',
    'general_ticket': 'تیکت‌های عمومی',
    'ipo': 'عرضه اولیه',
    'clearing': 'تسویه و پایاپای',
    'payment_gateways': 'درگاه پرداخت',
    'web_service': 'وب‌سرویس',
    'network_security': 'شبکه/امنیت',
    'uncategorized': 'سایر مستندات'
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

    const rootNode: GraphNode = {
        id: 'root',
        group: 'root',
        label: 'پایگاه دانش',
        fullLabel: 'پایگاه دانش رایان هم‌افزا',
        x: 0, y: 0, vx: 0, vy: 0, radius: 40, baseRadius: 40, color: '#1e293b', chunkCount: chunks.length
    };
    nodes.push(rootNode);

    const categories = new Map<string, GraphNode>();
    const files = new Map<string, GraphNode>();

    chunks.forEach(chunk => {
        const catKey = chunk.metadata?.category || 'general';
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
            treeLinks.push({ source: 'root', target: catNode.id });
        }
        categories.get(catKey)!.chunkCount!++;

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
            treeLinks.push({ source: `cat-${catKey}`, target: fileId });
        }
        files.get(fileId)!.chunkCount!++;
    });

    const validTreeLinks = treeLinks.filter(l => nodes.some(n => n.id === l.source) && nodes.some(n => n.id === l.target));
    calculateTreeLayout('root', nodes, validTreeLinks);

    return { nodes, links, treeLinks, networkLinks: [], topicLinks: [] };
};

// ==========================================
// TICKET-FOCUSED SCHEMA GRAPH LOGIC
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
    
    // Specific Error Code Extraction
    const errCodeMatch = lower.match(/(خطای|error)\s*[:#-]?\s*(\d{3,})/);
    let specificIssueLabel = issueMatch ? issueMatch.label : null;
    if (errCodeMatch) {
        specificIssueLabel = `خطای ${errCodeMatch[2]}`;
    }

    // 4. Detect Action
    let actionMatch = TICKET_CONFIG.actions.find(a => a.patterns.some(p => lower.includes(p)));

    return { sysKey, compMatch, issueLabel: specificIssueLabel, actionMatch };
};

export const prepareSchemaGraphData = (chunks: KnowledgeChunk[]) => {
    const nodesMap = new Map<string, GraphNode>();
    const links: GraphLink[] = [];
    const MAX_NODES = 200; 

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
                links.push({ source: sysId, target: compId });
            } else {
                nodesMap.get(compId)!.chunkCount!++;
            }
        }

        let issueId = '';
        if (issueLabel) {
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

            const parentId = compId || sysId;
            if (!links.some(l => l.source === parentId && l.target === issueId)) {
                links.push({ source: parentId, target: issueId, type: 'CAUSED_BY' });
            }
        }

        if (actionMatch && issueId) {
            const actionId = `act-${actionMatch.key}`;
            if (!nodesMap.has(actionId)) {
                nodesMap.set(actionId, {
                    id: actionId, group: 'Action', label: actionMatch.label, fullLabel: actionMatch.label,
                    x: (Math.random()-0.5)*500, y: (Math.random()-0.5)*500,
                    vx: 0, vy: 0, radius: 15, baseRadius: 15, color: '#10b981', chunkCount: 1
                });
            }
            if (!links.some(l => l.source === actionId && l.target === issueId)) {
                links.push({ source: actionId, target: issueId, type: 'SOLVES' });
            }
        }
    });

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

// ==========================================
// GraphRAG LOGIC (Entity Extraction & Linking)
// ==========================================

const KEY_ENTITIES = [
    'اکسیر', 'رکسار', 'رایان همراه', 'پایاپای', 'خزانه‌داری', 'سجام', 'شاپرک', 'بانک', 'کارگزاری', 'صندوق', 'ETF',
    'خطای 10061', 'مغایرت', 'مانده', 'سفارش', 'اعتبار', 'پورتفو', 'دیده‌بان', 'معامله', 'عرضه اولیه',
    'سرور', 'دیتابیس', 'وب‌سرویس', 'API', 'لینک', 'شبکه', 'فایروال', 'IP'
];

export const prepareGraphRagData = (chunks: KnowledgeChunk[]) => {
    const nodes = new Map<string, GraphNode>();
    const links: GraphLink[] = [];
    const entityIndex = new Map<string, string[]>(); // Map Entity -> ChunkIDs

    // 1. Extract Entities from Chunks
    chunks.forEach(chunk => {
        const text = chunk.content;
        
        // Find entities present in this chunk
        const foundEntities = KEY_ENTITIES.filter(entity => text.includes(entity));
        
        // Add implicit entities from Metadata
        if (chunk.metadata?.ticketId) foundEntities.push(`تیکت ${chunk.metadata.ticketId}`);
        if (chunk.metadata?.category) foundEntities.push(categoryLabels[chunk.metadata.category] || chunk.metadata.category);

        foundEntities.forEach(entity => {
            if (!entityIndex.has(entity)) entityIndex.set(entity, []);
            entityIndex.get(entity)!.push(chunk.id);

            if (!nodes.has(entity)) {
                const isSystem = ['اکسیر', 'رکسار', 'رایان همراه', 'پایاپای', 'خزانه‌داری'].includes(entity);
                const isError = entity.includes('خطا') || entity.includes('مغایرت');
                
                nodes.set(entity, {
                    id: entity,
                    group: isSystem ? 'System' : (isError ? 'Issue' : 'Concept'),
                    label: entity,
                    fullLabel: entity,
                    x: (Math.random() - 0.5) * 600,
                    y: (Math.random() - 0.5) * 600,
                    vx: 0, vy: 0,
                    radius: isSystem ? 30 : 15,
                    baseRadius: isSystem ? 30 : 15,
                    color: isSystem ? '#2563eb' : (isError ? '#ef4444' : '#10b981'),
                    chunkCount: 1
                });
            } else {
                nodes.get(entity)!.chunkCount!++;
            }
        });

        // Create Relationships (Co-occurrence)
        for (let i = 0; i < foundEntities.length; i++) {
            for (let j = i + 1; j < foundEntities.length; j++) {
                const e1 = foundEntities[i];
                const e2 = foundEntities[j];
                // Simple unique link key to avoid duplicates
                const linkId = [e1, e2].sort().join('-'); 
                
                // We add links but in a real GraphRAG we would weight them. 
                // Here we just ensure they exist.
                if (!links.some(l => (l.source === e1 && l.target === e2) || (l.source === e2 && l.target === e1))) {
                    links.push({ source: e1, target: e2, type: 'semantic' });
                }
            }
        }
    });

    return { 
        nodes: Array.from(nodes.values()), 
        links, 
        treeLinks: [], 
        networkLinks: [], 
        topicLinks: [] 
    };
};

// ==========================================
// GALAXY GRAPH LOGIC (The new creative mode)
// ==========================================

export const prepareGalaxyGraphData = (chunks: KnowledgeChunk[]) => {
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];

    // 1. Group by Category (The Solar Systems)
    const categoryGroups = new Map<string, KnowledgeChunk[]>();
    chunks.forEach(chunk => {
        const cat = chunk.metadata?.category || 'general';
        if (!categoryGroups.has(cat)) categoryGroups.set(cat, []);
        categoryGroups.get(cat)!.push(chunk);
    });

    // 2. Center of Galaxy (Supermassive Black Hole / Core Knowledge)
    const coreNode: GraphNode = {
        id: 'CORE',
        group: 'core',
        label: 'هسته دانش',
        fullLabel: 'مرکز دانش رایان',
        x: 0, y: 0, vx: 0, vy: 0,
        radius: 60, baseRadius: 60,
        color: '#ffffff', // White glow
        chunkCount: chunks.length
    };
    nodes.push(coreNode);

    // 3. Create Planetary Systems (Categories orbiting Core)
    const categories = Array.from(categoryGroups.keys());
    const angleStep = (Math.PI * 2) / categories.length;
    const ORBIT_RADIUS = 400; // Distance of categories from Core

    categories.forEach((cat, index) => {
        const angle = index * angleStep;
        const catX = Math.cos(angle) * ORBIT_RADIUS;
        const catY = Math.sin(angle) * ORBIT_RADIUS;
        
        // Category "Sun"
        const catNode: GraphNode = {
            id: `galaxy-cat-${cat}`,
            group: 'galaxy-star',
            label: categoryLabels[cat] || cat,
            fullLabel: categoryLabels[cat] || cat,
            x: catX, y: catY, vx: 0, vy: 0,
            radius: 35, baseRadius: 35,
            color: getCategoryColor(cat),
            chunkCount: categoryGroups.get(cat)!.length,
            // Anchor for physics to pull back to orbit
            targetX: catX, targetY: catY 
        };
        nodes.push(catNode);
        
        // Link to Core (Gravity line)
        links.push({ source: 'CORE', target: catNode.id, type: 'gravity' });

        // 4. Create Planets (Files/Chunks) orbiting the Category
        const catChunks = categoryGroups.get(cat)!;
        const files = new Set(catChunks.map(c => c.source.id));
        
        // We only show FILE nodes to avoid overcrowding, sizing them by chunk count
        let fileIndex = 0;
        const fileAngleStep = (Math.PI * 2) / files.size;
        const FILE_ORBIT_RADIUS_BASE = 120;

        files.forEach(fileName => {
            const fileChunksCount = catChunks.filter(c => c.source.id === fileName).length;
            
            // Randomize orbit slightly for organic look
            const orbitVar = (Math.random() - 0.5) * 60; 
            const currentOrbit = FILE_ORBIT_RADIUS_BASE + orbitVar;
            
            const fileAngle = fileIndex * fileAngleStep + (Math.random() * 0.5); 
            
            const fileX = catX + Math.cos(fileAngle) * currentOrbit;
            const fileY = catY + Math.sin(fileAngle) * currentOrbit;

            const fileNode: GraphNode = {
                id: `galaxy-file-${fileName}-${cat}`,
                group: 'galaxy-planet',
                label: fileName.length > 15 ? fileName.substring(0, 12) + '...' : fileName,
                fullLabel: fileName,
                x: fileX, y: fileY, vx: 0, vy: 0,
                // Size depends on mass (chunk count)
                radius: Math.min(12, 4 + Math.sqrt(fileChunksCount)), 
                baseRadius: Math.min(12, 4 + Math.sqrt(fileChunksCount)),
                color: lightenColor(getCategoryColor(cat), 40),
                chunkCount: fileChunksCount,
                metadata: { category: cat }
            };
            
            nodes.push(fileNode);
            links.push({ source: catNode.id, target: fileNode.id, type: 'orbit' });
            fileIndex++;
        });
    });

    return { 
        nodes, 
        links, 
        treeLinks: [], networkLinks: [], topicLinks: [] 
    };
};

// Helper for colors
const getCategoryColor = (cat: string) => {
    switch(cat) {
        case 'troubleshooting': return '#ef4444'; // Red
        case 'online_trading': return '#f59e0b'; // Amber
        case 'back_office': return '#3b82f6'; // Blue
        case 'funds': return '#10b981'; // Emerald
        case 'technical_infrastructure': return '#6366f1'; // Indigo
        default: return '#94a3b8'; // Slate
    }
};

const lightenColor = (hex: string, percent: number) => {
    const num = parseInt(hex.replace("#",""), 16),
    amt = Math.round(2.55 * percent),
    R = (num >> 16) + amt,
    B = ((num >> 8) & 0x00FF) + amt,
    G = (num & 0x0000FF) + amt;
    return "#" + (0x1000000 + (R<255?R<1?0:R:255)*0x10000 + (B<255?B<1?0:B:255)*0x100 + (G<255?G<1?0:G:255)).toString(16).slice(1);
};