
import React, { useEffect, useRef, useState } from 'react';
import { KnowledgeChunk, GraphNode, GraphLink, GraphLayoutMode } from '../types';
import { categoryLabels, subCategoryLabels, prepareGraphData, prepareSchemaGraphData, prepareGraphRagData } from '../services/graphEngine';
import { Network, ZoomIn, ZoomOut, RefreshCw, Workflow, Search, X, Filter, Box } from 'lucide-react';

interface KnowledgeGraphProps {
  chunks: KnowledgeChunk[];
  layoutMode: GraphLayoutMode;
}

const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({ chunks, layoutMode }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  
  const [visibleCategories, setVisibleCategories] = useState<Set<string>>(new Set(Object.keys(categoryLabels)));
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);

  // Graph Data Refs
  const simulationData = useRef<{ nodes: GraphNode[], links: GraphLink[], treeLinks: GraphLink[], networkLinks: GraphLink[], topicLinks: GraphLink[] }>({ nodes: [], links: [], treeLinks: [], networkLinks: [], topicLinks: [] });
  const dimensions = useRef({ width: 800, height: 600 });
  const animationRef = useRef<number>(0);
  const alphaRef = useRef(1.0); 
  
  // Interaction State
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 0.6 }); 
  const isDraggingRef = useRef(false);
  const dragTargetRef = useRef<GraphNode | null>(null);
  const hoverNodeRef = useRef<GraphNode | null>(null);
  const lastMousePos = useRef({ x: 0, y: 0 });

  useEffect(() => {
      alphaRef.current = 1.0;
  }, [layoutMode, searchQuery]);

  // 1. Initialize Graph Data using the detached Service
  useEffect(() => {
    if (chunks.length === 0) {
        simulationData.current = { nodes: [], links: [], treeLinks: [], networkLinks: [], topicLinks: [] };
        return;
    }
    alphaRef.current = 1.0; 
    
    // Switch between Schema, GraphRAG, and Tree (Standard)
    if (layoutMode === 'schema') {
        const schemaData = prepareSchemaGraphData(chunks);
        simulationData.current = {
            nodes: schemaData.nodes,
            links: schemaData.links,
            treeLinks: [],
            networkLinks: [],
            topicLinks: []
        };
    } else if (layoutMode === 'graphrag') {
        const ragData = prepareGraphRagData(chunks);
        simulationData.current = {
            nodes: ragData.nodes,
            links: ragData.links,
            treeLinks: [],
            networkLinks: [],
            topicLinks: []
        };
    } else {
        // Default (Tree/Hierarchy)
        simulationData.current = prepareGraphData(chunks, visibleCategories);
    }

  }, [chunks, visibleCategories, layoutMode]);

  // 2. Resize Handler
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
        if (container) {
            dimensions.current = { width: container.clientWidth, height: container.clientHeight };
            if (canvasRef.current) {
                canvasRef.current.width = container.clientWidth;
                canvasRef.current.height = container.clientHeight;
            }
        }
    };
    const ro = new ResizeObserver(updateSize);
    ro.observe(container);
    updateSize();
    return () => ro.disconnect();
  }, []);

  // 3. Interaction Handlers
  const getCanvasCoordinates = (e: React.MouseEvent) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const x = (e.clientX - rect.left - dimensions.current.width / 2 - transform.x) / transform.k;
      const y = (e.clientY - rect.top - dimensions.current.height / 2 - transform.y) / transform.k;
      return { x, y };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
      const { x, y } = getCanvasCoordinates(e);
      alphaRef.current = 1.0; 

      let clickedNode: GraphNode | null = null;
      for (let i = simulationData.current.nodes.length - 1; i >= 0; i--) {
          const node = simulationData.current.nodes[i];
          const dist = Math.sqrt((x - node.x)**2 + (y - node.y)**2);
          if (dist < node.radius + 5) { 
              clickedNode = node;
              break;
          }
      }

      if (clickedNode) {
          dragTargetRef.current = clickedNode;
          isDraggingRef.current = true;
          setSelectedNode(clickedNode); 
      } else {
          isDraggingRef.current = true;
          setSelectedNode(null); 
      }
      lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      const { x, y } = getCanvasCoordinates(e);
      let hovered: GraphNode | null = null;
      for (let i = simulationData.current.nodes.length - 1; i >= 0; i--) {
          const node = simulationData.current.nodes[i];
          const dist = Math.sqrt((x - node.x)**2 + (y - node.y)**2);
          if (dist < node.radius + 5) {
              hovered = node;
              break;
          }
      }
      
      if (hoverNodeRef.current !== hovered) {
          hoverNodeRef.current = hovered;
          canvasRef.current!.style.cursor = hovered ? 'pointer' : (isDraggingRef.current ? 'grabbing' : 'grab');
      }

      if (isDraggingRef.current) {
          if (dragTargetRef.current && (layoutMode === 'graphrag' || layoutMode === 'schema')) {
              dragTargetRef.current.x = x;
              dragTargetRef.current.y = y;
              dragTargetRef.current.vx = 0;
              dragTargetRef.current.vy = 0;
              alphaRef.current = 1.0; 
          } else {
              const dx = e.clientX - lastMousePos.current.x;
              const dy = e.clientY - lastMousePos.current.y;
              setTransform(t => ({ ...t, x: t.x + dx, y: t.y + dy }));
          }
      }
      lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
      isDraggingRef.current = false;
      dragTargetRef.current = null;
  };

  const handleWheel = (e: React.WheelEvent) => {
      e.preventDefault();
      const scaleFactor = 0.1;
      const newK = e.deltaY > 0 
        ? Math.max(0.1, transform.k - scaleFactor) 
        : Math.min(4, transform.k + scaleFactor);
      setTransform(t => ({ ...t, k: newK }));
  };

  // 4. Physics & Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const animate = () => {
      const { nodes, links, treeLinks } = simulationData.current;
      const { width, height } = dimensions.current;
      const cx = width / 2;
      const cy = height / 2;
      
      let activeLinks = links;
      if (layoutMode === 'tree') activeLinks = treeLinks;
      if (layoutMode === 'graphrag') activeLinks = links;
      if (layoutMode === 'schema') activeLinks = links;

      const activeNodes = nodes;

      if (!isDraggingRef.current) {
          alphaRef.current *= 0.99; 
          if (alphaRef.current < 0.005) alphaRef.current = 0;
      }

      const isForceMode = layoutMode === 'graphrag' || layoutMode === 'schema';
      const shouldRunPhysics = isForceMode && alphaRef.current > 0;

      const DAMPING = 0.5;
      const REPULSION = (layoutMode === 'schema') ? 1500 : 800;
      const TARGET_SPEED = 2;
      const CURRENT_MAX_SPEED = TARGET_SPEED * Math.max(0.1, alphaRef.current);

      for (const n of activeNodes) {
          if (layoutMode === 'tree' && n.treeX !== undefined && n.treeY !== undefined) {
              n.x += (n.treeX - n.x) * 0.1;
              n.y += (n.treeY - n.y) * 0.1;
          } 
          else if (shouldRunPhysics) {
             if (!isDraggingRef.current || n !== dragTargetRef.current) {
                 // For Schema view, System nodes are somewhat fixed anchors
                 if (layoutMode === 'schema' && n.group === 'System') {
                    if (n.targetX !== undefined) n.x += (n.targetX - n.x) * 0.05;
                    if (n.targetY !== undefined) n.y += (n.targetY - n.y) * 0.05;
                 }
                 
                 for (const other of activeNodes) {
                     if (n === other) continue;
                     const dx = n.x - other.x;
                     const dy = n.y - other.y;
                     let d = dx*dx + dy*dy;
                     
                     if (d > 60000) continue;

                     if (d < 1) d = 1;
                     const dist = Math.sqrt(d);
                     
                     const f = REPULSION / (dist + 100); 
                     n.vx += (dx/dist) * f;
                     n.vy += (dy/dist) * f;
                 }

                 for (const link of activeLinks) {
                     if (link.source === n.id || link.target === n.id) {
                         const otherId = link.source === n.id ? link.target : link.source;
                         const other = activeNodes.find(on => on.id === otherId);
                         if (other) {
                             const dx = other.x - n.x;
                             const dy = other.y - n.y;
                             const dist = Math.sqrt(dx*dx + dy*dy);
                             const targetDist = layoutMode === 'schema' ? 150 : 100;
                             
                             const force = (dist - targetDist) * 0.01; 
                             n.vx += (dx/dist) * force;
                             n.vy += (dy/dist) * force;
                         }
                     }
                 }
                 
                 // Apply velocity limits
                 const velocity = Math.sqrt(n.vx*n.vx + n.vy*n.vy);
                 if (velocity > CURRENT_MAX_SPEED) {
                     n.vx = (n.vx / velocity) * CURRENT_MAX_SPEED;
                     n.vy = (n.vy / velocity) * CURRENT_MAX_SPEED;
                 }

                 n.vx *= DAMPING;
                 n.vy *= DAMPING;
                 
                 n.x += n.vx;
                 n.y += n.vy;
             }
          }
      }

      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.translate(cx + transform.x, cy + transform.y);
      ctx.scale(transform.k, transform.k);

      const isConnected = (n1: GraphNode, n2: GraphNode) => {
          return activeLinks.some(l => (l.source === n1.id && l.target === n2.id) || (l.source === n2.id && l.target === n1.id));
      };

      const isMatch = (n: GraphNode) => !searchQuery || (n.fullLabel?.toLowerCase().includes(searchQuery.toLowerCase()) || false);
      
      const shouldDim = (n: GraphNode) => {
          if (searchQuery && !isMatch(n)) return true;
          if (hoverNodeRef.current && n !== hoverNodeRef.current && !isConnected(n, hoverNodeRef.current)) return true;
          if (selectedNode && n !== selectedNode && !isConnected(n, selectedNode)) return true;
          return false;
      };

      // Draw Links
      ctx.lineWidth = (layoutMode === 'tree') ? 1.5 : 1;
      for (const link of activeLinks) {
          const s = activeNodes.find(n => n.id === link.source);
          const t = activeNodes.find(n => n.id === link.target);
          if (s && t) {
              // Hide root links in GraphRAG for cleaner look unless explicitly connected
              if (layoutMode === 'graphrag' && (s.group === 'root' || t.group === 'root')) continue;

              let opacity = layoutMode === 'tree' ? 0.3 : 0.15; 
              if (link.type === 'cross') opacity = 0.4;
              if (layoutMode === 'schema') opacity = 0.2;

              const sDim = shouldDim(s);
              const tDim = shouldDim(t);

              if (sDim || tDim) opacity = 0.05;
              if ((hoverNodeRef.current && (s === hoverNodeRef.current || t === hoverNodeRef.current)) ||
                  (selectedNode && (s === selectedNode || t === selectedNode)) ||
                  (searchQuery && isMatch(s) && isMatch(t))) {
                  opacity = 0.6;
                  ctx.lineWidth = 2;
              } else {
                  ctx.lineWidth = 1;
              }

              if (link.type === 'SOLVES') {
                  ctx.strokeStyle = `rgba(16, 185, 129, ${opacity})`; // Green for solutions
                  ctx.setLineDash([]);
              } else if (link.type === 'CAUSED_BY') {
                  ctx.strokeStyle = `rgba(239, 68, 68, ${opacity})`; // Red for causes
                  ctx.setLineDash([2, 2]);
              } else {
                  ctx.setLineDash([]);
                  ctx.strokeStyle = `rgba(148, 163, 184, ${opacity})`;
              }

              ctx.beginPath();
              ctx.moveTo(s.x, s.y);
              ctx.lineTo(t.x, t.y);
              ctx.stroke();
              ctx.setLineDash([]);
          }
      }

      // Draw Nodes
      for (const node of activeNodes) {
          if (layoutMode !== 'tree' && node.group === 'root') continue;

          let opacity = 1;
          if (shouldDim(node)) opacity = 0.1;

          ctx.beginPath();
          // Draw Shape based on Schema type
          if (node.group === 'Issue') {
              // Triangle for Issues
              const r = node.radius;
              ctx.moveTo(node.x, node.y - r);
              ctx.lineTo(node.x + r, node.y + r);
              ctx.lineTo(node.x - r, node.y + r);
              ctx.closePath();
          } else if (node.group === 'Action') {
              // Square for Actions
              const r = node.radius * 0.8;
              ctx.rect(node.x - r, node.y - r, r*2, r*2);
          } else if (node.group === 'Module') {
              // Hexagon for Modules (Components)
              const r = node.radius;
              for (let i = 0; i < 6; i++) {
                  const angle = (Math.PI / 3) * i;
                  const x = node.x + r * Math.cos(angle);
                  const y = node.y + r * Math.sin(angle);
                  if (i === 0) ctx.moveTo(x, y);
                  else ctx.lineTo(x, y);
              }
              ctx.closePath();
          } else {
              // Circle for others
              ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
          }

          ctx.fillStyle = node.color;
          ctx.globalAlpha = opacity;
          ctx.fill();
          
          if (node === selectedNode || node === hoverNodeRef.current) {
              ctx.lineWidth = 3;
              ctx.strokeStyle = '#fff';
              ctx.stroke();
              ctx.lineWidth = 1;
              ctx.strokeStyle = node.color; 
              ctx.stroke();
          } else {
              ctx.strokeStyle = '#fff';
              ctx.lineWidth = 1.5;
              ctx.stroke();
          }
          ctx.globalAlpha = 1;

          // Labels
          const isCategory = node.group === 'category' || node.group === 'root' || node.group === 'System';
          const showLabel = 
            isCategory || 
            (node.group === 'Issue' && transform.k > 0.5) ||
            (node.group === 'Action' && transform.k > 0.5) ||
            (node.group === 'Module' && transform.k > 0.5) ||
            (node.group === 'Concept' && transform.k > 0.6) ||
            (node === hoverNodeRef.current) || 
            (node === selectedNode) ||
            isMatch(node);

          if (showLabel && opacity > 0.2) {
              let font = '12px Vazirmatn';
              let fillStyle = '#334155';

              if (node.group === 'System') {
                  font = 'bold 14px Vazirmatn';
                  fillStyle = '#1e3a8a';
              } else if (node.group === 'Issue') {
                  font = 'bold 11px Vazirmatn';
                  fillStyle = '#991b1b';
              }

              ctx.font = font;
              ctx.textAlign = 'center';
              const text = node.label;
              const metrics = ctx.measureText(text);
              
              // Background for readability
              ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
              const pad = 4;
              const rectY = node.y + node.radius + 5;
              ctx.fillRect(node.x - metrics.width/2 - pad, rectY, metrics.width + pad*2, 18);

              ctx.fillStyle = fillStyle;
              ctx.fillText(text, node.x, node.y + node.radius + 19);
          }
      }

      ctx.restore();
      animationRef.current = requestAnimationFrame(animate);
    };

    animate();
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [chunks, transform, layoutMode, searchQuery, selectedNode, visibleCategories]);


  const handleZoomIn = () => setTransform(t => ({ ...t, k: Math.min(4, t.k + 0.2) }));
  const handleZoomOut = () => setTransform(t => ({ ...t, k: Math.max(0.1, t.k - 0.2) }));
  const handleReset = () => setTransform({ x: 0, y: 0, k: 0.6 });

  if (chunks.length === 0) {
      return (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <Network className="w-16 h-16 mb-4 opacity-50" />
              <p>داده‌ای برای نمایش وجود ندارد.</p>
          </div>
      );
  }

  return (
    <div ref={containerRef} className="relative w-full h-full bg-slate-50 overflow-hidden cursor-move" dir="ltr">
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-20 w-80 max-w-full">
          <div className="relative group">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                  <Search className="w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
              </div>
              <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="جستجو در گراف (نام فایل، تیکت...)"
                  className="w-full pl-10 pr-4 py-2 bg-white/90 backdrop-blur border border-slate-300 rounded-full shadow-sm text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-right"
                  dir="rtl"
              />
              {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600"
                  >
                      <X className="w-3 h-3" />
                  </button>
              )}
          </div>
      </div>

      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2 bg-white/90 backdrop-blur p-2 rounded-lg shadow-lg border border-slate-200">
        
        {layoutMode === 'tree' && (
            <>
                <button 
                    onClick={() => setIsFilterMenuOpen(!isFilterMenuOpen)} 
                    className={`p-2 rounded transition-colors ${isFilterMenuOpen ? 'bg-blue-100 text-blue-600' : 'hover:bg-slate-100 text-slate-600'}`} 
                    title="فیلتر دسته‌ها"
                >
                    <Filter className="w-5 h-5" />
                </button>
                <div className="w-full h-px bg-slate-200 my-1"></div>
            </>
        )}
        
        <button onClick={handleZoomIn} className="p-2 hover:bg-slate-100 rounded text-slate-600"><ZoomIn className="w-5 h-5" /></button>
        <button onClick={handleZoomOut} className="p-2 hover:bg-slate-100 rounded text-slate-600"><ZoomOut className="w-5 h-5" /></button>
        <button onClick={handleReset} className="p-2 hover:bg-slate-100 rounded text-slate-600"><RefreshCw className="w-5 h-5" /></button>
      </div>

      <div className="absolute bottom-4 left-4 z-10 bg-white/90 p-4 rounded-lg shadow-lg border border-slate-200 backdrop-blur-sm text-xs pointer-events-none select-none transition-opacity duration-300" style={{ opacity: selectedNode ? 0 : 1 }} dir="rtl">
         <h4 className="font-bold mb-2 text-slate-700">راهنمای گراف</h4>
         
         {layoutMode === 'schema' ? (
             <>
                 <div className="flex items-center gap-2 mb-2">
                     <span className="w-3 h-3 rounded-full bg-blue-700 border border-white shadow-sm"></span>
                     <span>سامانه (System)</span>
                 </div>
                 <div className="flex items-center gap-2 mb-2">
                     <span className="w-3 h-3 bg-amber-500 border border-white shadow-sm" style={{clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)'}}></span>
                     <span>مولفه/ماژول (Component)</span>
                 </div>
                 <div className="flex items-center gap-2 mb-2">
                     <span className="w-3 h-3 bg-red-500 border border-white shadow-sm transform rotate-45"></span>
                     <span>مشکل/خطا (Issue)</span>
                 </div>
                 <div className="flex items-center gap-2 mb-2">
                     <span className="w-3 h-3 bg-emerald-500 border border-white shadow-sm"></span>
                     <span>راه‌حل (Action)</span>
                 </div>
             </>
         ) : layoutMode === 'graphrag' ? (
             <>
                 <div className="flex items-center gap-2 mb-2">
                     <span className="w-3 h-3 rounded-full bg-blue-600 border border-white shadow-sm"></span>
                     <span>موجودیت سیستم (Entity)</span>
                 </div>
                 <div className="flex items-center gap-2 mb-2">
                     <span className="w-3 h-3 rounded-full bg-emerald-500 border border-white shadow-sm"></span>
                     <span>مفهوم/دسته (Concept)</span>
                 </div>
                 <div className="flex items-center gap-2 mb-2">
                     <span className="w-3 h-3 rounded-full bg-red-500 border border-white shadow-sm"></span>
                     <span>خطا/مشکل (Error)</span>
                 </div>
                 <div className="flex items-center gap-2 mb-1">
                     <span className="w-6 border-b-2 border-slate-400"></span>
                     <span>رابطه معنایی (Relation)</span>
                 </div>
             </>
         ) : (
             <>
                <div className="flex items-center gap-2 mb-2">
                    <span className="w-3 h-3 rounded-full bg-slate-800 border border-white shadow-sm"></span>
                    <span>پایگاه دانش</span>
                </div>
                <div className="flex items-center gap-2 mb-2">
                    <span className="w-3 h-3 rounded-full bg-blue-500 border border-white shadow-sm"></span>
                    <span>دسته‌بندی اصلی</span>
                </div>
             </>
         )}

         <div className="text-[10px] text-slate-400 mt-2 pt-2 border-t border-slate-200">
             * برای مشاهده جزئیات کلیک کنید
         </div>
      </div>

      <canvas 
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        className="block w-full h-full"
      />
    </div>
  );
};

export default KnowledgeGraph;
