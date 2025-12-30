
import React, { useEffect, useRef, useState } from 'react';
import { KnowledgeChunk, GraphNode, GraphLink, GraphLayoutMode } from '../types';
import { categoryLabels, subCategoryLabels, prepareGraphData, prepareSchemaGraphData, prepareGraphRagData, prepareGalaxyGraphData } from '../services/graphEngine';
import { Network, ZoomIn, ZoomOut, RefreshCw, Workflow, Search, X, Filter, Box, FileText, Tag, ArrowRight, Zap } from 'lucide-react';

interface KnowledgeGraphProps {
  chunks: KnowledgeChunk[];
  layoutMode: GraphLayoutMode;
  onNodeSelect?: (node: GraphNode) => void; 
  onNodeAction?: (action: 'analyze' | 'ask', node: GraphNode) => void;
}

const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({ chunks, layoutMode, onNodeSelect, onNodeAction }) => {
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
  const targetTransform = useRef({ x: 0, y: 0, k: 0.6 });
  
  const isDraggingRef = useRef(false);
  const dragTargetRef = useRef<GraphNode | null>(null);
  const hoverNodeRef = useRef<GraphNode | null>(null);
  const lastMousePos = useRef({ x: 0, y: 0 });

  useEffect(() => {
      alphaRef.current = 1.0;
  }, [layoutMode, searchQuery]);

  // 1. Initialize Graph Data
  useEffect(() => {
    if (chunks.length === 0) {
        simulationData.current = { nodes: [], links: [], treeLinks: [], networkLinks: [], topicLinks: [] };
        return;
    }
    alphaRef.current = 1.0; 
    setSelectedNode(null);
    
    if (layoutMode === 'schema') {
        const schemaData = prepareSchemaGraphData(chunks);
        simulationData.current = {
            nodes: schemaData.nodes,
            links: schemaData.links,
            treeLinks: [],
            networkLinks: [],
            topicLinks: []
        };
        setTransform({ x: 0, y: 0, k: 0.6 });
        targetTransform.current = { x: 0, y: 0, k: 0.6 };
    } else if (layoutMode === 'graphrag') {
        const ragData = prepareGraphRagData(chunks);
        simulationData.current = {
            nodes: ragData.nodes,
            links: ragData.links,
            treeLinks: [],
            networkLinks: [],
            topicLinks: []
        };
        setTransform({ x: 0, y: 0, k: 0.6 });
        targetTransform.current = { x: 0, y: 0, k: 0.6 };
    } else if (layoutMode === 'galaxy') {
        const galaxyData = prepareGalaxyGraphData(chunks);
        simulationData.current = {
            nodes: galaxyData.nodes,
            links: galaxyData.links,
            treeLinks: [],
            networkLinks: [],
            topicLinks: []
        };
        setTransform({ x: 0, y: 0, k: 0.35 });
        targetTransform.current = { x: 0, y: 0, k: 0.35 };
    } else {
        simulationData.current = prepareGraphData(chunks, visibleCategories);
        setTransform({ x: 0, y: 0, k: 0.6 });
        targetTransform.current = { x: 0, y: 0, k: 0.6 };
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
          const hitRadius = layoutMode === 'galaxy' ? Math.max(node.radius, 15) : node.radius + 5;
          const dist = Math.sqrt((x - node.x)**2 + (y - node.y)**2);
          if (dist < hitRadius) { 
              clickedNode = node;
              break;
          }
      }

      if (clickedNode) {
          dragTargetRef.current = clickedNode;
          isDraggingRef.current = true;
          setSelectedNode(clickedNode);
          
          if (onNodeSelect) onNodeSelect(clickedNode);

          if (layoutMode === 'galaxy' && clickedNode.group === 'galaxy-star') {
              const newK = 1.2;
              targetTransform.current = {
                  k: newK,
                  x: -clickedNode.x * newK,
                  y: -clickedNode.y * newK
              };
          }
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
          const hitRadius = layoutMode === 'galaxy' ? Math.max(node.radius, 10) : node.radius + 5;
          const dist = Math.sqrt((x - node.x)**2 + (y - node.y)**2);
          if (dist < hitRadius) {
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
              setTransform(t => {
                  const newT = { ...t, x: t.x + dx, y: t.y + dy };
                  targetTransform.current = newT;
                  return newT;
              });
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
      
      const newT = { ...transform, k: newK };
      setTransform(newT);
      targetTransform.current = newT;
  };

  // 4. Physics & Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const animate = () => {
      // Smooth Camera Interpolation
      if (layoutMode === 'galaxy') {
          const dx = targetTransform.current.x - transform.x;
          const dy = targetTransform.current.y - transform.y;
          const dk = targetTransform.current.k - transform.k;
          
          if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1 || Math.abs(dk) > 0.001) {
              setTransform(t => ({
                  x: t.x + dx * 0.1,
                  y: t.y + dy * 0.1,
                  k: t.k + dk * 0.1
              }));
          }
      }

      const { nodes, links, treeLinks } = simulationData.current;
      const { width, height } = dimensions.current;
      const cx = width / 2;
      const cy = height / 2;
      
      let activeLinks = links;
      if (layoutMode === 'tree') activeLinks = treeLinks;
      if (layoutMode === 'graphrag') activeLinks = links;
      if (layoutMode === 'schema') activeLinks = links;
      if (layoutMode === 'galaxy') activeLinks = links;

      const activeNodes = nodes;

      if (!isDraggingRef.current) {
          alphaRef.current *= 0.99; 
          if (alphaRef.current < 0.005) alphaRef.current = 0;
      }

      const isForceMode = layoutMode === 'graphrag' || layoutMode === 'schema' || layoutMode === 'galaxy';
      const shouldRunPhysics = isForceMode && alphaRef.current > 0;

      const DAMPING = 0.5;
      const REPULSION = (layoutMode === 'schema') ? 1500 : (layoutMode === 'galaxy' ? 200 : 800);
      const TARGET_SPEED = 2;
      const CURRENT_MAX_SPEED = TARGET_SPEED * Math.max(0.1, alphaRef.current);

      for (const n of activeNodes) {
          if (layoutMode === 'tree' && n.treeX !== undefined && n.treeY !== undefined) {
              n.x += (n.treeX - n.x) * 0.1;
              n.y += (n.treeY - n.y) * 0.1;
          } 
          else if (shouldRunPhysics) {
             if (!isDraggingRef.current || n !== dragTargetRef.current) {
                 if ((layoutMode === 'schema' && n.group === 'System') || (layoutMode === 'galaxy' && n.group === 'galaxy-star')) {
                    if (n.targetX !== undefined) n.x += (n.targetX - n.x) * 0.05;
                    if (n.targetY !== undefined) n.y += (n.targetY - n.y) * 0.05;
                 }
                 
                 if (layoutMode === 'galaxy' && n.group === 'core') {
                    n.x = 0; n.y = 0;
                 } else {
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
                                 
                                 let targetDist = 100;
                                 if (layoutMode === 'schema') targetDist = 150;
                                 if (layoutMode === 'galaxy') targetDist = link.type === 'gravity' ? 400 : 120; 

                                 const force = (dist - targetDist) * 0.01; 
                                 n.vx += (dx/dist) * force;
                                 n.vy += (dy/dist) * force;
                             }
                         }
                     }
                 }
                 
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

      // --- DARK MODE RENDERING ---
      // 1. Background Fill
      ctx.fillStyle = '#020617'; // Surface-950
      ctx.fillRect(0, 0, width, height);
      
      // 2. Starfield Effect (Subtle)
      ctx.save();
      const time = Date.now() * 0.0005;
      for(let i=0; i<50; i++) {
          ctx.beginPath();
          const px = (Math.sin(i * 132.1) * width + width/2 + transform.x * 0.05) % width;
          const py = (Math.cos(i * 43.7) * height + height/2 + transform.y * 0.05) % height;
          const alpha = 0.1 + Math.abs(Math.sin(time + i)) * 0.2;
          ctx.fillStyle = `rgba(255,255,255,${alpha})`;
          ctx.arc(Math.abs(px), Math.abs(py), Math.random() * 1.5, 0, Math.PI*2);
          ctx.fill();
      }
      ctx.restore();

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

      if (layoutMode === 'galaxy') {
          const core = activeNodes.find(n => n.group === 'core');
          if (core) {
              const systems = activeNodes.filter(n => n.group === 'galaxy-star');
              ctx.beginPath();
              ctx.strokeStyle = 'rgba(99, 102, 241, 0.1)'; // Brand color trace
              ctx.lineWidth = 1;
              ctx.arc(core.x, core.y, 400, 0, Math.PI * 2);
              ctx.stroke();

              systems.forEach(sys => {
                  ctx.beginPath();
                  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
                  ctx.setLineDash([5, 15]); 
                  ctx.arc(sys.x, sys.y, 120, 0, Math.PI * 2); 
                  ctx.stroke();
                  ctx.setLineDash([]);
              });
          }
      }

      ctx.lineWidth = (layoutMode === 'tree') ? 1.5 : 1;
      
      for (const link of activeLinks) {
          const s = activeNodes.find(n => n.id === link.source);
          const t = activeNodes.find(n => n.id === link.target);
          if (s && t) {
              if (layoutMode === 'graphrag' && (s.group === 'root' || t.group === 'root')) continue;

              let opacity = layoutMode === 'tree' ? 0.3 : 0.2; 
              if (link.type === 'cross') opacity = 0.4;
              if (layoutMode === 'schema') opacity = 0.2;
              if (layoutMode === 'galaxy') opacity = 0.08; 

              const sDim = shouldDim(s);
              const tDim = shouldDim(t);

              if (sDim || tDim) opacity = 0.05;
              if ((hoverNodeRef.current && (s === hoverNodeRef.current || t === hoverNodeRef.current)) ||
                  (selectedNode && (s === selectedNode || t === selectedNode)) ||
                  (searchQuery && isMatch(s) && isMatch(t))) {
                  opacity = layoutMode === 'galaxy' ? 0.5 : 0.8;
                  ctx.lineWidth = 2;
                  ctx.shadowBlur = 5;
                  ctx.shadowColor = '#fff';
              } else {
                  ctx.lineWidth = 1;
                  ctx.shadowBlur = 0;
              }

              if (link.type === 'SOLVES') {
                  ctx.strokeStyle = `rgba(52, 211, 153, ${opacity})`; // Emerald
                  ctx.setLineDash([]);
              } else if (link.type === 'CAUSED_BY') {
                  ctx.strokeStyle = `rgba(248, 113, 113, ${opacity})`; // Red
                  ctx.setLineDash([2, 2]);
              } else if (layoutMode === 'galaxy') {
                   ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
                   ctx.setLineDash([]);
              } else {
                  ctx.setLineDash([]);
                  ctx.strokeStyle = `rgba(148, 163, 184, ${opacity})`; // Slate-400
              }

              if (layoutMode === 'galaxy' && (s.group === 'core' || t.group === 'core')) continue;

              ctx.beginPath();
              ctx.moveTo(s.x, s.y);
              ctx.lineTo(t.x, t.y);
              ctx.stroke();
              ctx.setLineDash([]);
              ctx.shadowBlur = 0; // Reset shadow
          }
      }

      for (const node of activeNodes) {
          if (layoutMode !== 'tree' && node.group === 'root' && layoutMode !== 'galaxy') continue;

          let opacity = 1;
          if (shouldDim(node)) opacity = 0.15;

          if (layoutMode === 'galaxy') {
              // Galaxy Node Rendering
              ctx.shadowBlur = node.group === 'core' ? 60 : (node.group === 'galaxy-star' ? 40 : 10);
              ctx.shadowColor = node.color;
              
              if (node.group === 'core') {
                  const gradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, node.radius);
                  gradient.addColorStop(0, '#ffffff');
                  gradient.addColorStop(0.4, '#818cf8'); // Brand color
                  gradient.addColorStop(1, 'rgba(0,0,0,0)');
                  ctx.fillStyle = gradient;
                  ctx.beginPath();
                  ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
                  ctx.fill();
              } else {
                  ctx.beginPath();
                  ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
                  ctx.fillStyle = node.color;
                  ctx.globalAlpha = opacity;
                  ctx.fill();
              }
              
              if (node === selectedNode) {
                  ctx.shadowBlur = 0;
                  ctx.globalAlpha = 1;
                  ctx.strokeStyle = '#ffffff';
                  ctx.lineWidth = 1.5;
                  const time = Date.now() * 0.002;
                  
                  ctx.beginPath();
                  ctx.arc(node.x, node.y, node.radius + 10, time, time + Math.PI/2);
                  ctx.stroke();
                  ctx.beginPath();
                  ctx.arc(node.x, node.y, node.radius + 10, time + Math.PI, time + Math.PI * 1.5);
                  ctx.stroke();
              }
              ctx.shadowBlur = 0;
              
          } else {
              // Standard/Schema Node Rendering
              ctx.beginPath();
              
              // Shapes based on type
              if (node.group === 'Issue') {
                  const r = node.radius;
                  ctx.moveTo(node.x, node.y - r);
                  ctx.lineTo(node.x + r, node.y + r);
                  ctx.lineTo(node.x - r, node.y + r);
                  ctx.closePath();
              } else if (node.group === 'Action') {
                  const r = node.radius * 0.8;
                  ctx.rect(node.x - r, node.y - r, r*2, r*2);
              } else if (node.group === 'Module') {
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
                  ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
              }

              ctx.fillStyle = node.color;
              ctx.globalAlpha = opacity;
              ctx.fill();
              
              // Glow for active nodes
              if (node === selectedNode || node === hoverNodeRef.current) {
                  ctx.shadowBlur = 15;
                  ctx.shadowColor = node.color;
                  ctx.lineWidth = 2;
                  ctx.strokeStyle = '#fff';
                  ctx.stroke();
                  ctx.shadowBlur = 0;
              } else {
                  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
                  ctx.lineWidth = 1;
                  ctx.stroke();
              }
          }
          ctx.globalAlpha = 1;

          const isCategory = node.group === 'category' || node.group === 'root' || node.group === 'System' || node.group === 'galaxy-star' || node.group === 'core';
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
              let fillStyle = '#cbd5e1'; // Light text for dark background

              if (node.group === 'System' || node.group === 'core') {
                  font = 'bold 14px Vazirmatn';
                  fillStyle = '#ffffff';
              } else if (node.group === 'Issue') {
                  font = 'bold 11px Vazirmatn';
                  fillStyle = '#fca5a5'; // Light Red
              } else if (node.group === 'galaxy-star') {
                  font = 'bold 12px Vazirmatn';
                  fillStyle = '#ffffff';
              }

              ctx.font = font;
              ctx.textAlign = 'center';
              const text = node.label;
              const metrics = ctx.measureText(text);
              
              // Dark background pill for text
              if (layoutMode !== 'galaxy' || node === hoverNodeRef.current) {
                  ctx.fillStyle = 'rgba(15, 23, 42, 0.8)'; // Surface-900 transparent
                  const pad = 6;
                  const rectY = node.y + node.radius + 8;
                  // Rounded rect simulation
                  ctx.roundRect(node.x - metrics.width/2 - pad, rectY, metrics.width + pad*2, 20, 6);
                  ctx.fill();
              }

              ctx.fillStyle = fillStyle;
              ctx.fillText(text, node.x, node.y + node.radius + 22);
          }
      }

      ctx.restore();
      animationRef.current = requestAnimationFrame(animate);
    };

    animate();
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [chunks, transform, layoutMode, searchQuery, selectedNode, visibleCategories]);


  const handleZoomIn = () => {
      setTransform(t => ({ ...t, k: Math.min(4, t.k + 0.2) }));
      targetTransform.current.k = Math.min(4, targetTransform.current.k + 0.2);
  };
  const handleZoomOut = () => {
      setTransform(t => ({ ...t, k: Math.max(0.1, t.k - 0.2) }));
      targetTransform.current.k = Math.max(0.1, targetTransform.current.k - 0.2);
  };
  const handleReset = () => {
      const def = layoutMode === 'galaxy' ? 0.35 : 0.6;
      setTransform({ x: 0, y: 0, k: def });
      targetTransform.current = { x: 0, y: 0, k: def };
      setSelectedNode(null);
  };

  if (chunks.length === 0) {
      return (
          <div className="flex flex-col items-center justify-center h-full text-surface-500">
              <Network className="w-16 h-16 mb-4 opacity-50" />
              <p>داده‌ای برای نمایش وجود ندارد.</p>
          </div>
      );
  }

  // --- DETAILS PANEL COMPONENT (Dark Glass) ---
  const renderDetailsPanel = () => {
      if (!selectedNode) return null;
      
      const isFile = selectedNode.group === 'file' || selectedNode.group === 'galaxy-planet';
      const isCategory = selectedNode.group === 'galaxy-star' || selectedNode.group === 'category';
      
      if (!isFile && !isCategory) return null;

      return (
          <div className="absolute top-4 right-4 z-20 w-72 glass-panel rounded-2xl text-surface-200 p-5 shadow-2xl animate-in slide-in-from-right-4 fade-in duration-300" dir="rtl">
              <button 
                  onClick={() => setSelectedNode(null)}
                  className="absolute top-3 left-3 text-surface-400 hover:text-white transition-colors"
              >
                  <X className="w-4 h-4" />
              </button>
              
              <div className="mb-4 pr-1 border-b border-white/10 pb-3">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-brand-300 mb-1 block">
                      {isCategory ? 'منظومه دانشی' : 'سیاره دانشی (سند)'}
                  </span>
                  <h3 className="text-lg font-bold leading-tight text-white">{selectedNode.fullLabel || selectedNode.label}</h3>
              </div>

              <div className="space-y-4 text-sm">
                  {isFile && selectedNode.metadata && (
                      <>
                          <div className="flex items-center gap-2 text-xs text-surface-300">
                              <Box className="w-3 h-3 text-brand-400" />
                              <span>دسته: {selectedNode.metadata.category}</span>
                          </div>
                          {selectedNode.metadata.ticketId && (
                              <div className="flex items-center gap-2 text-xs text-amber-300">
                                  <Tag className="w-3 h-3" />
                                  <span>تیکت: {selectedNode.metadata.ticketId}</span>
                              </div>
                          )}
                          
                          <div className="bg-surface-800/50 p-3 rounded-lg border border-white/5 mt-2">
                              <span className="text-[10px] text-surface-400 block mb-1">تعداد قطعات (Chunks)</span>
                              <div className="flex items-center gap-2 font-mono text-emerald-400 font-bold">
                                  <FileText className="w-4 h-4" />
                                  {selectedNode.chunkCount}
                              </div>
                          </div>
                      </>
                  )}

                  {isCategory && (
                      <div className="text-xs text-surface-300 leading-5 bg-surface-800/50 p-3 rounded-lg border border-white/5">
                          این خوشه حاوی <span className="text-brand-300 font-bold">{selectedNode.chunkCount}</span> قطعه اطلاعاتی مرتبط با موضوع {selectedNode.label} است.
                      </div>
                  )}
                  
                  {/* Action Buttons */}
                  <div className="pt-2 flex flex-col gap-2">
                      <button 
                          onClick={() => onNodeAction?.('analyze', selectedNode)}
                          className="w-full bg-brand-600 hover:bg-brand-500 text-white py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 group shadow-lg shadow-brand-900/50"
                      >
                          <Zap className="w-3 h-3 group-hover:text-yellow-300" />
                          <span>تحلیل هوشمند این گره</span>
                      </button>
                      {isFile && (
                          <button 
                            className="w-full bg-surface-800 hover:bg-surface-700 text-surface-300 hover:text-white py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 border border-white/5"
                            onClick={() => onNodeAction?.('ask', selectedNode)}
                          >
                              <ArrowRight className="w-3 h-3" />
                              <span>پرسش از این سند</span>
                          </button>
                      )}
                  </div>
              </div>
          </div>
      );
  };

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden cursor-move bg-surface-950" dir="ltr">
      {/* Search Bar (Floating Glass) */}
      <div className="absolute top-6 left-1/2 transform -translate-x-1/2 z-20 w-96 max-w-full">
          <div className="relative group">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                  <Search className="w-4 h-4 text-surface-400 group-focus-within:text-brand-400 transition-colors" />
              </div>
              <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="جستجو در گراف (نام فایل، تیکت...)"
                  className="w-full pl-10 pr-4 py-2.5 bg-surface-900/80 backdrop-blur border border-white/10 rounded-full shadow-lg text-sm text-white placeholder-surface-500 focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 outline-none transition-all text-right"
                  dir="rtl"
              />
              {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute inset-y-0 right-3 flex items-center text-surface-400 hover:text-white"
                  >
                      <X className="w-3 h-3" />
                  </button>
              )}
          </div>
      </div>

      {/* Controls (Glass) */}
      <div className="absolute bottom-6 right-6 z-10 flex flex-col gap-2 glass-panel p-2 rounded-xl shadow-2xl">
        
        {layoutMode === 'tree' && (
            <>
                <button 
                    onClick={() => setIsFilterMenuOpen(!isFilterMenuOpen)} 
                    className={`p-2.5 rounded-lg transition-colors ${isFilterMenuOpen ? 'bg-brand-500/20 text-brand-300' : 'hover:bg-white/10 text-surface-400'}`} 
                    title="فیلتر دسته‌ها"
                >
                    <Filter className="w-5 h-5" />
                </button>
                <div className="w-full h-px bg-white/10 my-1"></div>
            </>
        )}
        
        <button onClick={handleZoomIn} className="p-2.5 hover:bg-white/10 rounded-lg text-surface-400 hover:text-white transition-colors"><ZoomIn className="w-5 h-5" /></button>
        <button onClick={handleZoomOut} className="p-2.5 hover:bg-white/10 rounded-lg text-surface-400 hover:text-white transition-colors"><ZoomOut className="w-5 h-5" /></button>
        <button onClick={handleReset} className="p-2.5 hover:bg-white/10 rounded-lg text-surface-400 hover:text-white transition-colors"><RefreshCw className="w-5 h-5" /></button>
      </div>

      {/* Legend (Glass) */}
      <div className="absolute bottom-6 left-6 z-10 glass-panel p-4 rounded-xl shadow-2xl text-xs pointer-events-none select-none transition-opacity duration-300" style={{ opacity: selectedNode ? 0 : 1 }} dir="rtl">
         <h4 className="font-bold mb-3 text-white">راهنمای گراف</h4>
         
         {layoutMode === 'schema' ? (
             <>
                 <div className="flex items-center gap-2 mb-2 text-surface-300">
                     <span className="w-3 h-3 rounded-full bg-blue-700 border border-white/20 shadow-sm"></span>
                     <span>سامانه (System)</span>
                 </div>
                 <div className="flex items-center gap-2 mb-2 text-surface-300">
                     <span className="w-3 h-3 bg-amber-500 border border-white/20 shadow-sm" style={{clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)'}}></span>
                     <span>مولفه (Module)</span>
                 </div>
                 <div className="flex items-center gap-2 mb-2 text-surface-300">
                     <span className="w-3 h-3 bg-red-500 border border-white/20 shadow-sm transform rotate-45"></span>
                     <span>مشکل (Issue)</span>
                 </div>
             </>
         ) : layoutMode === 'galaxy' ? (
             <>
                <div className="flex items-center gap-2 mb-2 text-surface-300">
                    <span className="w-3 h-3 rounded-full bg-white shadow-[0_0_10px_white]"></span>
                    <span>هسته دانش</span>
                </div>
                <div className="flex items-center gap-2 mb-2 text-surface-300">
                    <span className="w-3 h-3 rounded-full bg-brand-400 shadow-[0_0_10px_#818cf8]"></span>
                    <span>دسته‌بندی‌ها</span>
                </div>
                <div className="flex items-center gap-2 mb-2 text-surface-300">
                    <span className="w-2 h-2 rounded-full bg-surface-400"></span>
                    <span>اسناد</span>
                </div>
             </>
         ) : (
             <div className="flex items-center gap-2 mb-2 text-surface-300">
                <span className="w-3 h-3 rounded-full bg-brand-500 border border-white/20 shadow-sm"></span>
                <span>پایگاه دانش</span>
             </div>
         )}
      </div>

      {renderDetailsPanel()}

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
