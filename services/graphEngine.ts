
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
// MANAGERIAL SCHEMA GRAPH LOGIC (Aggregated)
// ==========================================

const TICKET_CONFIG = {
    // Level 1: Systems (Root Anchors)
    systems: {
        'exir': { label: 'سامانه اکسیر', color: '#3b82f6', x: 0, y: -250, keywords: ['اکسیر', 'exir', 'تکنیکال', 'بمب', 'شرطی', 'نمودار'] },
        'recsar': { label: 'سامانه رکسار', color: '#6366f1', x: 250, y: -100, keywords: ['رکسار', 'recsar', 'برخط گروهی', 'تعهدی', 'سبد'] },
        'backoffice': { label: 'بک‌آفیس', color: '#8b5cf6', x: -250, y: -100, keywords: ['بک آفیس', 'بک‌آفیس', 'backoffice', 'pam', 'پم', 'سند', 'حسابداری', 'مالی'] },
        'etf': { label: 'صندوق/ETF', color: '#10b981', x: 0, y: 150, keywords: ['صندوق', 'etf', 'nav', 'صدور', 'ابطال', 'یونیت'] },
        'mobile': { label: 'رایان همراه', color: '#06b6d4', x: 250, y: 150, keywords: ['رایان همراه', 'mobile', 'android', 'ios', 'اپلیکیشن'] },
        'club': { label: 'باشگاه مشتریان', color: '#f43f5e', x: -250, y: 150, keywords: ['باشگاه', 'club', 'امتیاز', 'معرف', 'تخفیف', 'گیفت'] },
        'sejam': { label: 'سجام و احراز', color: '#eab308', x: 0, y: 300, keywords: ['سجام', 'sejam', 'احراز هویت', 'otp', 'شناسه', 'کد ملی'] },
        'unknown': { label: 'سایر سیستم‌ها', color: '#64748b', x: 0, y: 0, keywords: [] }
    },
    // Issue Classification
    issues: [
        { key: 'login', patterns: ['لاگین', 'رمز عبور', 'ورود', 'password', 'login', 'فراموشی رمز'], label: 'ورود و رمز عبور' },
        { key: 'access', patterns: ['دسترسی', 'مجوز', 'مسدود', 'غیرفعال', 'سطح دسترسی', 'عدم مشاهده', 'access'], label: 'سطح دسترسی' },
        { key: 'order', patterns: ['سفارش', 'خرید', 'فروش', 'معامله', 'هسته', 'ارسال نشد', 'تأخیر', 'order', 'trade'], label: 'سفارش و معاملات' },
        { key: 'finance', patterns: ['مغایرت', 'مانده', 'حساب', 'واریز', 'فیش', 'پول', 'اعتبار', 'اختلاف', 'ریال', 'بانک', 'سود', 'زیان'], label: 'مغایرت مالی و حساب' },
        { key: 'data', patterns: ['گزارش', 'داده', 'نمودار', 'اطلاعات', 'خروجی', 'عدم نمایش', 'لیست', 'اکسل', 'چاپ'], label: 'گزارشات و داده‌ها' },
        { key: 'infra', patterns: ['اتصال', 'قطع', 'تایم اوت', 'timeout', 'کندی', 'سرور', 'شبکه', 'اینترنت', 'api', 'وب سرویس'], label: 'زیرساخت و شبکه' },
        { key: 'settings', patterns: ['تنظیمات', 'پیکربندی', 'نسخه', 'آپدیت', 'کانفیگ', 'شعبه', 'کارمزد'], label: 'تنظیمات سیستم' },
        { key: 'bug', patterns: ['خطای سیستمی', 'ارور', 'error', 'باگ', 'exception', 'پیغام', 'crash'], label: 'باگ نرم‌افزاری' }
    ]
};

const extractTicketEntities = (text: string) => {
    const lower = text.toLowerCase();
    
    // Separate Title from Body if marked (requires parseTicketFile update)
    let titleText = "";
    let bodyText = lower;
    const titleMatch = lower.match(/عنوان:(.*?)\n/);
    if (titleMatch) {
        titleText = titleMatch[1];
        bodyText = lower.replace(titleMatch[0], ''); // Remove title from body to avoid double counting if needed, but keeping it is fine.
    }

    const checkMatch = (patterns: string[]) => {
        let score = 0;
        patterns.forEach(p => {
            const pLower = p.toLowerCase();
            // Title matches count double
            if (titleText.includes(pLower)) score += 2;
            // Body matches count once per occurrence
            const matches = bodyText.split(pLower).length - 1;
            score += matches;
        });
        return score;
    };

    // 1. Detect System (Scoring Strategy)
    let bestSys = 'unknown';
    let maxSysScore = 0;

    Object.entries(TICKET_CONFIG.systems).forEach(([key, conf]) => {
        if (key === 'unknown') return;
        const score = checkMatch(conf.keywords);
        if (score > maxSysScore) {
            maxSysScore = score;
            bestSys = key;
        }
    });

    // Fallback logic if score is low but explicit mentions exist
    if (maxSysScore === 0) {
        if (lower.includes('آنلاین')) bestSys = 'exir'; // Default to Exir for "Online"
    }

    // 2. Detect Issue Category (Scoring Strategy)
    let bestIssue = 'سایر موارد';
    let maxIssueScore = 0;

    TICKET_CONFIG.issues.forEach(issue => {
        const score = checkMatch(issue.patterns);
        if (score > maxIssueScore) {
            maxIssueScore = score;
            bestIssue = issue.label;
        }
    });

    // Specific Error Code override for more detail
    const errCodeMatch = lower.match(/(خطای|error)\s*[:#-]?\s*(\d{3,})/);
    if (errCodeMatch) {
        bestIssue = `Error ${errCodeMatch[2]}`;
    }

    return { sysKey: bestSys, issueLabel: bestIssue };
};

export const prepareSchemaGraphData = (chunks: KnowledgeChunk[]) => {
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];
    
    // Aggregation Maps
    const systemCounts: Record<string, number> = {};
    const issueCounts: Record<string, Record<string, number>> = {}; // SysKey -> IssueLabel -> Count

    // Initialize Systems
    Object.keys(TICKET_CONFIG.systems).forEach(k => {
        systemCounts[k] = 0;
        issueCounts[k] = {};
    });

    // 1. Aggregate Data
    chunks.forEach(chunk => {
        // Only process troubleshooting or relevant chunks
        if (chunk.metadata?.category !== 'troubleshooting' && !chunk.content.includes('خطا') && !chunk.content.includes('مشکل') && !chunk.source.id.endsWith('.csv')) return;

        const { sysKey, issueLabel } = extractTicketEntities(chunk.content);
        
        systemCounts[sysKey]++;
        if (!issueCounts[sysKey][issueLabel]) {
            issueCounts[sysKey][issueLabel] = 0;
        }
        issueCounts[sysKey][issueLabel]++;
    });

    // 2. Create System Anchors (Central Nodes)
    Object.entries(TICKET_CONFIG.systems).forEach(([key, conf]) => {
        const totalSysIssues = systemCounts[key];
        // Only show system if it has issues or is a main one
        if (totalSysIssues > 0 || ['exir', 'recsar', 'backoffice'].includes(key)) {
            const size = Math.max(40, 30 + Math.sqrt(totalSysIssues) * 3);
            nodes.push({
                id: `sys-${key}`,
                group: 'System',
                label: conf.label,
                fullLabel: conf.label, // Display label
                x: conf.x, 
                y: conf.y, 
                vx: 0, vy: 0, 
                radius: size, 
                baseRadius: size, 
                color: conf.color, 
                chunkCount: totalSysIssues,
                targetX: conf.x, 
                targetY: conf.y,
                metadata: { type: 'system_anchor', totalIssues: totalSysIssues }
            });
        }
    });

    // 3. Create Aggregated Issue Nodes (Orbiting Planets)
    Object.entries(issueCounts).forEach(([sysKey, issues]) => {
        const sysNode = nodes.find(n => n.id === `sys-${sysKey}`);
        if (!sysNode) return;

        Object.entries(issues).forEach(([issueLabel, count]) => {
            if (count === 0) return;

            const nodeId = `issue-${sysKey}-${issueLabel}`;
            // Size based on count (Logarithmic scale for better visual balance)
            const radius = Math.max(15, 10 + Math.sqrt(count) * 5); 
            
            // Color Intensity based on severity/count relative to system total
            const severity = count / (sysNode.chunkCount || 1);
            let color = '#fca5a5'; // Light red
            if (severity > 0.3) color = '#ef4444'; // Red
            if (severity > 0.5) color = '#b91c1c'; // Dark Red
            if (issueLabel.includes('مالی') || issueLabel.includes('مغایرت')) color = '#f59e0b'; // Amber for finance

            // Initial position: Random circle around system
            const angle = Math.random() * Math.PI * 2;
            const dist = 150 + Math.random() * 50; 

            nodes.push({
                id: nodeId,
                group: 'Issue',
                label: issueLabel,
                fullLabel: `${issueLabel} (${count})`,
                x: sysNode.x + Math.cos(angle) * dist,
                y: sysNode.y + Math.sin(angle) * dist,
                vx: 0, vy: 0,
                radius: radius,
                baseRadius: radius,
                color: color,
                chunkCount: count,
                metadata: { type: 'aggregated_issue', parentSystem: sysNode.label, percentage: (severity * 100).toFixed(1) }
            });

            // Weighted Link
            links.push({ 
                source: sysNode.id, 
                target: nodeId, 
                type: 'CAUSED_BY' 
            });
        });
    });

    return { 
        nodes, 
        links, 
        treeLinks: [], networkLinks: [], topicLinks: [] 
    };
};

/**
 * Prepare specialized Ticket Frequency Graph.
 * Groups by System (Cluster) -> Error Type (Sub-Cluster).
 * Uses a Packed Bubble Layout logic (via Force Simulation).
 */
export const prepareTicketGraphData = (chunks: KnowledgeChunk[]) => {
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];

    // 1. Filter only Ticket Data
    const ticketChunks = chunks.filter(c => 
        (c.metadata?.ticketId) || 
        (c.metadata?.category === 'troubleshooting') ||
        (c.source.id.endsWith('.csv'))
    );

    if (ticketChunks.length === 0) return { nodes: [], links: [], treeLinks: [], networkLinks: [], topicLinks: [] };

    // 2. Aggregate Data: System -> Issue -> Count
    const systemAggregation: Record<string, Record<string, number>> = {};
    const systemTotals: Record<string, number> = {};

    ticketChunks.forEach(chunk => {
        const { sysKey, issueLabel } = extractTicketEntities(chunk.content);
        
        if (!systemAggregation[sysKey]) systemAggregation[sysKey] = {};
        if (!systemTotals[sysKey]) systemTotals[sysKey] = 0;

        if (!systemAggregation[sysKey][issueLabel]) systemAggregation[sysKey][issueLabel] = 0;
        
        systemAggregation[sysKey][issueLabel]++;
        systemTotals[sysKey]++;
    });

    // 3. Create Graph
    // Center Node: Company
    const centerNode: GraphNode = {
        id: 'RAYAN',
        group: 'core',
        label: 'رایان هم‌افزا',
        fullLabel: 'کل تیکت‌ها',
        x: 0, y: 0, vx: 0, vy: 0,
        radius: 50, baseRadius: 50,
        color: '#ffffff',
        chunkCount: ticketChunks.length
    };
    nodes.push(centerNode);

    // Systems
    const activeSystems = Object.keys(systemTotals).filter(k => systemTotals[k] > 0);
    
    activeSystems.forEach((sysKey, sysIdx) => {
        const totalSys = systemTotals[sysKey] || 0;
        const conf = TICKET_CONFIG.systems[sysKey as keyof typeof TICKET_CONFIG.systems];

        // Position systems in a ring
        const angle = (sysIdx / activeSystems.length) * Math.PI * 2;
        const radius = 350;
        const sysX = Math.cos(angle) * radius;
        const sysY = Math.sin(angle) * radius;

        const sysNode: GraphNode = {
            id: `sys-${sysKey}`,
            group: 'System',
            label: conf.label,
            fullLabel: `${conf.label} (${totalSys})`,
            x: sysX, y: sysY, vx: 0, vy: 0,
            radius: 30 + Math.sqrt(totalSys) * 2,
            baseRadius: 30,
            color: conf.color,
            chunkCount: totalSys,
            targetX: sysX, targetY: sysY
        };
        nodes.push(sysNode);
        links.push({ source: 'RAYAN', target: sysNode.id, type: 'hierarchy' });

        // Issues (Bubbles around System)
        const issues = systemAggregation[sysKey];
        const issueKeys = Object.keys(issues);
        
        issueKeys.forEach((issueLabel, i) => {
            const count = issues[issueLabel];
            // Spiral placement around system node
            const issueAngle = (i / issueKeys.length) * Math.PI * 2 + Math.random();
            const issueDist = 90 + Math.random() * 60;
            
            nodes.push({
                id: `issue-${sysKey}-${i}`,
                group: 'Issue',
                label: issueLabel,
                fullLabel: `${issueLabel}: ${count} مورد`,
                x: sysX + Math.cos(issueAngle) * issueDist,
                y: sysY + Math.sin(issueAngle) * issueDist,
                vx: 0, vy: 0,
                radius: 10 + Math.sqrt(count) * 4, // Area proportional to count
                baseRadius: 10,
                color: count > 20 ? '#ef4444' : (count > 5 ? '#f59e0b' : '#3b82f6'), // Red for high freq
                chunkCount: count,
                metadata: { type: 'aggregated_issue', parentSystem: conf.label, percentage: ((count/totalSys)*100).toFixed(1) }
            });

            links.push({ source: sysNode.id, target: `issue-${sysKey}-${i}`, type: 'issue' });
        });
    });

    return { nodes, links, treeLinks: [], networkLinks: [], topicLinks: [] };
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
