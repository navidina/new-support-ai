
import React, { useEffect, useRef, useState } from 'react';
import { KnowledgeChunk, GraphNode, GraphLink, GraphLayoutMode } from '../types';
import { categoryLabels, subCategoryLabels, prepareGraphData, prepareSchemaGraphData, prepareGraphRagData, prepareGalaxyGraphData, prepareTicketGraphData } from '../services/graphEngine';
import { Network, ZoomIn, ZoomOut, RefreshCw, Workflow, Search, X, Filter, Box, FileText, Tag, ArrowRight, Zap, PieChart, Activity, AlertCircle, Ticket, Upload, Trash2 } from 'lucide-react';
import { toPersianDigits } from '../services/textProcessor';

interface KnowledgeGraphProps {
  chunks: KnowledgeChunk[];
  ticketChunks?: KnowledgeChunk[]; // Prop for isolated tickets
  layoutMode: GraphLayoutMode;
  onNodeSelect?: (node: GraphNode) => void; 
  onNodeAction?: (action: 'analyze' | 'ask', node: GraphNode) => void;
  onImportTickets?: (files: FileList) => void;
  onClearTickets?: () => void;
  theme?: 'light' | 'dark';
}

const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({ 
    chunks, 
    ticketChunks = [],
    layoutMode, 
    onNodeSelect, 
    onNodeAction, 
    onImportTickets,
    onClearTickets,
    theme = 'dark' 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ticketInputRef = useRef<HTMLInputElement>(null);
  
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
    // If we are in Ticket Mode but no tickets, do nothing (UI will show upload screen)
    if (layoutMode === 'tickets' && ticketChunks.length === 0) {
        simulationData.current = { nodes: [], links: [], treeLinks: [], networkLinks: [], topicLinks: [] };
        return;
    }

    if (layoutMode !== 'tickets' && chunks.length === 0) {
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
    } else if (layoutMode === 'tickets') {
        // Use separate ticket store
        const ticketData = prepareTicketGraphData(ticketChunks);
        simulationData.current = {
            nodes: ticketData.nodes,
            links: ticketData.links,
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

  }, [chunks, ticketChunks, visibleCategories, layoutMode]);

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
          if (dragTargetRef.current && (layoutMode === 'graphrag' || layoutMode === 'schema' || layoutMode === 'tickets')) {
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
      if (layoutMode === 'schema' || layoutMode === 'tickets') activeLinks = links;
      if (layoutMode === 'galaxy') activeLinks = links;

      const activeNodes = nodes;

      if (!isDraggingRef.current) {
          alphaRef.current *= 0.99; 
          if (alphaRef.current < 0.005) alphaRef.current = 0;
      }

      const isForceMode = layoutMode === 'graphrag' || layoutMode === 'schema' || layoutMode === 'galaxy' || layoutMode === 'tickets';
      const shouldRunPhysics = isForceMode && alphaRef.current > 0;

      const DAMPING = 0.5;
      // Adjusted Physics for Schema Aggregation (Nodes are larger)
      const REPULSION = (layoutMode === 'schema' || layoutMode === 'tickets') ? 3000 : (layoutMode === 'galaxy' ? 200 : 800);
      const TARGET_SPEED = 2;
      const CURRENT_MAX_SPEED = TARGET_SPEED * Math.max(0.1, alphaRef.current);

      for (const n of activeNodes) {
          if (layoutMode === 'tree' && n.treeX !== undefined && n.treeY !== undefined) {
              n.x += (n.treeX - n.x) * 0.1;
              n.y += (n.treeY - n.y) * 0.1;
          } 
          else if (shouldRunPhysics) {
             if (!isDraggingRef.current || n !== dragTargetRef.current) {
                 if ((layoutMode === 'schema' && n.group === 'System') || (layoutMode === 'galaxy' && n.group === 'galaxy-star') || (layoutMode === 'tickets' && n.group === 'System')) {
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
                         if (d > 60000 && layoutMode !== 'schema' && layoutMode !== 'tickets') continue; // Schema needs larger influence
                         if (d < 1) d = 1;
                         const dist = Math.sqrt(d);
                         const minDistance = n.radius + other.radius + 10; // Avoid overlap
                         const f = REPULSION / (dist + 100); 
                         
                         let repulsionForce = f;
                         // Extra push if overlapping
                         if (dist < minDistance) {
                             repulsionForce *= 3;
                         }

                         n.vx += (dx/dist) * repulsionForce;
                         n.vy += (dy/dist) * repulsionForce;
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
                                 if (layoutMode === 'schema' || layoutMode === 'tickets') targetDist = n.radius + other.radius + 50;
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

      // --- RENDERING ---
      // 1. Background Fill (Theme Dependent)
      ctx.fillStyle = theme === 'dark' ? '#020617' : '#f8fafc'; // Surface-950 vs Surface-50
      ctx.fillRect(0, 0, width, height);
      
      // 2. Starfield Effect (Subtle - only in dark mode or very subtle in light)
      ctx.save();
      const time = Date.now() * 0.0005;
      for(let i=0; i<50; i++) {
          ctx.beginPath();
          const px = (Math.sin(i * 132.1) * width + width/2 + transform.x * 0.05) % width;
          const py = (Math.cos(i * 43.7) * height + height/2 + transform.y * 0.05) % height;
          const alpha = 0.1 + Math.abs(Math.sin(time + i)) * 0.2;
          ctx.fillStyle = theme === 'dark' ? `rgba(255,255,255,${alpha})` : `rgba(71, 85, 105, ${alpha * 0.5})`;
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
              ctx.strokeStyle = theme === 'dark' ? 'rgba(99, 102, 241, 0.1)' : 'rgba(99, 102, 241, 0.05)';
              ctx.lineWidth = 1;
              ctx.arc(core.x, core.y, 400, 0, Math.PI * 2);
              ctx.stroke();

              systems.forEach(sys => {
                  ctx.beginPath();
                  ctx.strokeStyle = theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
                  ctx.setLineDash([5, 15]); 
                  ctx.arc(sys.x, sys.y, 120, 0, Math.PI * 2); 
                  ctx.stroke();
                  ctx.setLineDash([]);
              });
          }
      }

      ctx.lineWidth = (layoutMode === 'tree') ? 1.5 : 1;
      
      // Link Colors
      const baseLinkColor = theme === 'dark' ? '148, 163, 184' : '100, 116, 139'; // Slate-400 vs Slate-500

      for (const link of activeLinks) {
          const s = activeNodes.find(n => n.id === link.source);
          const t = activeNodes.find(n => n.id === link.target);
          if (s && t) {
              if (layoutMode === 'graphrag' && (s.group === 'root' || t.group === 'root')) continue;

              let opacity = layoutMode === 'tree' ? 0.3 : 0.2; 
              if (link.type === 'cross') opacity = 0.4;
              if (layoutMode === 'schema' || layoutMode === 'tickets') opacity = 0.4; // Schema links more visible
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
                  ctx.shadowColor = theme === 'dark' ? '#fff' : '#000';
              } else {
                  ctx.lineWidth = 1;
                  ctx.shadowBlur = 0;
              }

              if (layoutMode === 'schema' || layoutMode === 'tickets') {
                  // Schema View Links
                  ctx.strokeStyle = `rgba(${baseLinkColor}, ${opacity})`;
                  // Use thickness for severity if applicable, but for cleanliness keep it constant for now
                  ctx.lineWidth = 1.5;
              } else if (link.type === 'SOLVES') {
                  ctx.strokeStyle = `rgba(52, 211, 153, ${opacity})`; // Emerald
                  ctx.setLineDash([]);
              } else if (link.type === 'CAUSED_BY') {
                  ctx.strokeStyle = `rgba(248, 113, 113, ${opacity})`; // Red
                  ctx.setLineDash([2, 2]);
              } else if (layoutMode === 'galaxy') {
                   ctx.strokeStyle = theme === 'dark' ? `rgba(255, 255, 255, ${opacity})` : `rgba(0, 0, 0, ${opacity})`;
                   ctx.setLineDash([]);
              } else {
                  ctx.setLineDash([]);
                  ctx.strokeStyle = `rgba(${baseLinkColor}, ${opacity})`; 
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
          if (layoutMode !== 'tree' && node.group === 'root' && layoutMode !== 'galaxy' && layoutMode !== 'tickets') continue;

          let opacity = 1;
          if (shouldDim(node)) opacity = 0.15;

          if (layoutMode === 'galaxy') {
              // Galaxy Node Rendering
              ctx.shadowBlur = node.group === 'core' ? 60 : (node.group === 'galaxy-star' ? 40 : 10);
              ctx.shadowColor = node.color;
              
              if (node.group === 'core') {
                  const gradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, node.radius);
                  if (theme === 'dark') {
                      gradient.addColorStop(0, '#ffffff');
                      gradient.addColorStop(0.4, '#818cf8'); // Brand color
                      gradient.addColorStop(1, 'rgba(0,0,0,0)');
                  } else {
                      gradient.addColorStop(0, '#4f46e5');
                      gradient.addColorStop(0.4, '#818cf8');
                      gradient.addColorStop(1, 'rgba(255,255,255,0)');
                  }
                  
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
                  ctx.strokeStyle = theme === 'dark' ? '#ffffff' : '#000000';
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
                  // In Aggregated Schema View, Issue nodes are distinct circles to show weight
                  ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
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
                  ctx.strokeStyle = theme === 'dark' ? '#fff' : '#000';
                  ctx.stroke();
                  ctx.shadowBlur = 0;
              } else {
                  ctx.strokeStyle = theme === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)';
                  ctx.lineWidth = 1;
                  ctx.stroke();
              }
          }
          ctx.globalAlpha = 1;

          const isCategory = node.group === 'category' || node.group === 'root' || node.group === 'System' || node.group === 'galaxy-star' || node.group === 'core';
          
          // Improved Label Visibility Logic
          const showLabel = 
            isCategory || 
            (node.group === 'Issue' && transform.k > 0.4) || // Show Issues earlier in Schema mode
            (node.group === 'Action' && transform.k > 0.5) ||
            (node.group === 'Module' && transform.k > 0.5) ||
            (node.group === 'Concept' && transform.k > 0.6) ||
            (node === hoverNodeRef.current) || 
            (node === selectedNode) ||
            isMatch(node);

          if (showLabel && opacity > 0.2) {
              let font = '12px Vazirmatn';
              let fillStyle = theme === 'dark' ? '#cbd5e1' : '#475569'; // Slate-300 vs Slate-600

              if (node.group === 'System' || node.group === 'core') {
                  font = 'bold 16px Vazirmatn'; // Larger system font
                  fillStyle = theme === 'dark' ? '#ffffff' : '#1e293b';
              } else if (node.group === 'Issue') {
                  // Scale font based on severity (radius)
                  const fontSize = Math.max(10, Math.min(16, node.radius / 2));
                  font = `bold ${fontSize}px Vazirmatn`;
                  fillStyle = '#ffffff'; // White text for issues to stand out
              } else if (node.group === 'galaxy-star') {
                  font = 'bold 12px Vazirmatn';
                  fillStyle = theme === 'dark' ? '#ffffff' : '#1e293b';
              }

              ctx.font = font;
              ctx.textAlign = 'center';
              const text = node.fullLabel || node.label; // Prefer full label (with count) if available
              const metrics = ctx.measureText(text);
              
              // Background pill for text
              if (layoutMode !== 'galaxy' || node === hoverNodeRef.current) {
                  ctx.fillStyle = theme === 'dark' ? 'rgba(15, 23, 42, 0.8)' : 'rgba(255, 255, 255, 0.8)';
                  const pad = 6;
                  const rectY = node.y + node.radius + 8;
                  // Rounded rect simulation
                  ctx.roundRect(node.x - metrics.width/2 - pad, rectY, metrics.width + pad*2, 24, 6);
                  ctx.fill();
                  
                  // Border for light mode pill
                  if (theme === 'light') {
                      ctx.strokeStyle = 'rgba(0,0,0,0.1)';
                      ctx.lineWidth = 1;
                      ctx.stroke();
                  }
              }

              ctx.fillStyle = fillStyle;
              ctx.fillText(text, node.x, node.y + node.radius + 24);
          }
      }

      ctx.restore();
      animationRef.current = requestAnimationFrame(animate);
    };

    animate();
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [chunks, ticketChunks, transform, layoutMode, searchQuery, selectedNode, visibleCategories, theme]);


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

  // --- EMPTY STATE FOR TICKET MODE ---
  if (layoutMode === 'tickets' && ticketChunks.length === 0) {
      return (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 dark:text-surface-500 animate-in fade-in" dir="rtl">
              <div className="w-24 h-24 bg-surface-100 dark:bg-surface-800 rounded-full flex items-center justify-center mb-6 shadow-inner border border-surface-200 dark:border-surface-700">
                  <Ticket className="w-10 h-10 text-brand-500 opacity-80" />
              </div>
              <h3 className="text-xl font-bold text-slate-700 dark:text-white mb-2">تحلیل هوشمند تیکت‌ها</h3>
              <p className="text-sm text-slate-500 dark:text-surface-400 max-w-md text-center leading-7 mb-8">
                  برای مشاهده گراف توزیع مشکلات، لطفاً فایل خروجی تیکت‌ها (CSV) را آپلود کنید.
                  <br />
                  <span className="text-xs opacity-70">سیستم به صورت خودکار تیکت‌ها را دسته‌بندی و تحلیل می‌کند.</span>
              </p>
              
              <input 
                  type="file" 
                  ref={ticketInputRef}
                  className="hidden"
                  accept=".csv"
                  onChange={(e) => e.target.files && onImportTickets?.(e.target.files)}
              />
              <button 
                  onClick={() => ticketInputRef.current?.click()}
                  className="bg-brand-600 hover:bg-brand-500 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-brand-500/30 transition-all transform hover:scale-105 flex items-center gap-2"
              >
                  <Upload className="w-5 h-5" />
                  آپلود فایل تیکت (.csv)
              </button>
          </div>
      );
  }

  // --- EMPTY STATE GENERAL ---
  if (chunks.length === 0 && ticketChunks.length === 0) {
      return (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 dark:text-surface-500">
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
      const isSystem = selectedNode.group === 'System';
      const isAggIssue = selectedNode.metadata?.type === 'aggregated_issue';
      
      return (
          <div className="absolute top-4 right-4 z-20 w-72 bg-white/90 dark:bg-surface-900/80 backdrop-blur-xl border border-slate-200 dark:border-white/10 rounded-2xl text-slate-800 dark:text-surface-200 p-5 shadow-2xl animate-in slide-in-from-right-4 fade-in duration-300" dir="rtl">
              <button 
                  onClick={() => setSelectedNode(null)}
                  className="absolute top-3 left-3 text-slate-400 dark:text-surface-400 hover:text-slate-800 dark:hover:text-white transition-colors"
              >
                  <X className="w-4 h-4" />
              </button>
              
              <div className="mb-4 pr-1 border-b border-slate-200 dark:border-white/10 pb-3">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-brand-600 dark:text-brand-300 mb-1 block">
                      {isCategory ? 'منظومه دانشی' : (isSystem ? 'سامانه' : (isAggIssue ? 'خوشه مشکلات' : 'سند دانشی'))}
                  </span>
                  <h3 className="text-lg font-bold leading-tight text-slate-900 dark:text-white">{selectedNode.label}</h3>
              </div>

              <div className="space-y-4 text-sm">
                  {/* Aggregated Issue View */}
                  {isAggIssue && selectedNode.metadata && (
                      <>
                        <div className="flex items-center justify-between bg-slate-50 dark:bg-surface-800/50 p-3 rounded-lg border border-slate-100 dark:border-white/5">
                            <span className="text-xs text-slate-500 dark:text-surface-400">سیستم مرتبط:</span>
                            <span className="font-bold text-slate-800 dark:text-white">{selectedNode.metadata.parentSystem}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="bg-slate-50 dark:bg-surface-800/50 p-3 rounded-lg border border-slate-100 dark:border-white/5 flex flex-col items-center">
                                <span className="text-[10px] text-slate-500 dark:text-surface-400 mb-1">تعداد تکرار</span>
                                <span className="text-xl font-bold text-slate-800 dark:text-white font-mono">{toPersianDigits(selectedNode.chunkCount)}</span>
                            </div>
                            <div className="bg-slate-50 dark:bg-surface-800/50 p-3 rounded-lg border border-slate-100 dark:border-white/5 flex flex-col items-center">
                                <span className="text-[10px] text-slate-500 dark:text-surface-400 mb-1">سهم از کل</span>
                                <span className="text-xl font-bold text-red-500 dark:text-red-400 font-mono">{toPersianDigits(selectedNode.metadata.percentage)}%</span>
                            </div>
                        </div>
                        <div className="text-xs text-slate-600 dark:text-surface-300 leading-5 mt-2">
                            این مشکل یکی از عوامل اصلی اختلال در سامانه {selectedNode.metadata.parentSystem} است. برای تحلیل ریشه‌ای، دکمه زیر را بزنید.
                        </div>
                      </>
                  )}

                  {/* System Anchor View */}
                  {isSystem && selectedNode.metadata && (
                      <>
                        <div className="bg-slate-50 dark:bg-surface-800/50 p-4 rounded-lg border border-slate-100 dark:border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Activity className="w-5 h-5 text-brand-500 dark:text-brand-400" />
                                <div>
                                    <span className="block text-xs text-slate-500 dark:text-surface-400">تیکت‌های ثبت شده</span>
                                    <span className="text-lg font-bold text-slate-800 dark:text-white">{toPersianDigits(selectedNode.metadata.totalIssues)}</span>
                                </div>
                            </div>
                        </div>
                        <div className="text-xs text-slate-500 dark:text-surface-400 mt-2">
                            این سامانه مرجع اصلی برای دسته‌بندی مشکلات در گراف طرح‌واره است.
                        </div>
                      </>
                  )}

                  {isFile && selectedNode.metadata && (
                      <>
                          <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-surface-300">
                              <Box className="w-3 h-3 text-brand-500 dark:text-brand-400" />
                              <span>دسته: {selectedNode.metadata.category}</span>
                          </div>
                          {selectedNode.metadata.ticketId && (
                              <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-300">
                                  <Tag className="w-3 h-3" />
                                  <span>تیکت: {selectedNode.metadata.ticketId}</span>
                              </div>
                          )}
                          
                          <div className="bg-slate-50 dark:bg-surface-800/50 p-3 rounded-lg border border-slate-100 dark:border-white/5 mt-2">
                              <span className="text-[10px] text-slate-500 dark:text-surface-400 block mb-1">تعداد قطعات (Chunks)</span>
                              <div className="flex items-center gap-2 font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                                  <FileText className="w-4 h-4" />
                                  {selectedNode.chunkCount}
                              </div>
                          </div>
                      </>
                  )}

                  {isCategory && (
                      <div className="text-xs text-slate-600 dark:text-surface-300 leading-5 bg-slate-50 dark:bg-surface-800/50 p-3 rounded-lg border border-slate-100 dark:border-white/5">
                          این خوشه حاوی <span className="text-brand-600 dark:text-brand-300 font-bold">{selectedNode.chunkCount}</span> قطعه اطلاعاتی مرتبط با موضوع {selectedNode.label} است.
                      </div>
                  )}
                  
                  {/* Action Buttons */}
                  <div className="pt-2 flex flex-col gap-2">
                      <button 
                          onClick={() => onNodeAction?.('analyze', selectedNode)}
                          className="w-full bg-brand-600 hover:bg-brand-500 text-white py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 group shadow-lg shadow-brand-500/20 dark:shadow-brand-900/50"
                      >
                          <Zap className="w-3 h-3 group-hover:text-yellow-300" />
                          <span>تحلیل هوشمند این گره</span>
                      </button>
                      {isFile && (
                          <button 
                            className="w-full bg-slate-100 dark:bg-surface-800 hover:bg-slate-200 dark:hover:bg-surface-700 text-slate-600 dark:text-surface-300 hover:text-slate-900 dark:hover:text-white py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 border border-slate-200 dark:border-white/5"
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
    <div ref={containerRef} className="relative w-full h-full overflow-hidden cursor-move bg-slate-50 dark:bg-surface-950 transition-colors duration-300" dir="ltr">
      {/* Search Bar (Floating Glass) */}
      <div className="absolute top-6 left-1/2 transform -translate-x-1/2 z-20 w-96 max-w-full">
          <div className="relative group">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                  <Search className="w-4 h-4 text-slate-400 dark:text-surface-400 group-focus-within:text-brand-500 transition-colors" />
              </div>
              <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="جستجو در گراف (نام فایل، تیکت...)"
                  className="w-full pl-10 pr-4 py-2.5 bg-white/80 dark:bg-surface-900/80 backdrop-blur border border-slate-200 dark:border-white/10 rounded-full shadow-lg text-sm text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-surface-500 focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 outline-none transition-all text-right"
                  dir="rtl"
              />
              {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute inset-y-0 right-3 flex items-center text-slate-400 dark:text-surface-400 hover:text-slate-800 dark:hover:text-white"
                  >
                      <X className="w-3 h-3" />
                  </button>
              )}
          </div>
      </div>

      {/* Controls (Glass) */}
      <div className="absolute bottom-6 right-6 z-10 flex flex-col gap-2 bg-white/80 dark:bg-surface-900/60 backdrop-blur-md border border-slate-200 dark:border-white/5 p-2 rounded-xl shadow-2xl">
        
        {/* Ticket Specific Clear Button */}
        {layoutMode === 'tickets' && ticketChunks.length > 0 && (
            <>
                <button 
                    onClick={onClearTickets}
                    className="p-2.5 rounded-lg transition-colors hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500" 
                    title="حذف داده‌های تیکت"
                >
                    <Trash2 className="w-5 h-5" />
                </button>
                <div className="w-full h-px bg-slate-200 dark:bg-white/10 my-1"></div>
            </>
        )}

        {layoutMode === 'tree' && (
            <>
                <button 
                    onClick={() => setIsFilterMenuOpen(!isFilterMenuOpen)} 
                    className={`p-2.5 rounded-lg transition-colors ${isFilterMenuOpen ? 'bg-brand-500/20 text-brand-600 dark:text-brand-300' : 'hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 dark:text-surface-400'}`} 
                    title="فیلتر دسته‌ها"
                >
                    <Filter className="w-5 h-5" />
                </button>
                <div className="w-full h-px bg-slate-200 dark:bg-white/10 my-1"></div>
            </>
        )}
        
        <button onClick={handleZoomIn} className="p-2.5 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg text-slate-500 dark:text-surface-400 hover:text-slate-800 dark:hover:text-white transition-colors"><ZoomIn className="w-5 h-5" /></button>
        <button onClick={handleZoomOut} className="p-2.5 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg text-slate-500 dark:text-surface-400 hover:text-slate-800 dark:hover:text-white transition-colors"><ZoomOut className="w-5 h-5" /></button>
        <button onClick={handleReset} className="p-2.5 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg text-slate-500 dark:text-surface-400 hover:text-slate-800 dark:hover:text-white transition-colors"><RefreshCw className="w-5 h-5" /></button>
      </div>

      {/* Legend (Glass) */}
      <div className="absolute bottom-6 left-6 z-10 bg-white/80 dark:bg-surface-900/60 backdrop-blur-md border border-slate-200 dark:border-white/5 p-4 rounded-xl shadow-2xl text-xs pointer-events-none select-none transition-opacity duration-300" style={{ opacity: selectedNode ? 0 : 1 }} dir="rtl">
         <h4 className="font-bold mb-3 text-slate-800 dark:text-white">راهنمای گراف</h4>
         
         {layoutMode === 'schema' || layoutMode === 'tickets' ? (
             <>
                 <div className="flex items-center gap-2 mb-2 text-slate-600 dark:text-surface-300">
                     <span className="w-3 h-3 rounded-full bg-blue-500 border border-black/10 dark:border-white/20 shadow-sm"></span>
                     <span>سامانه (System)</span>
                 </div>
                 <div className="flex items-center gap-2 mb-2 text-slate-600 dark:text-surface-300">
                     <span className="w-4 h-4 rounded-full bg-red-500 border border-black/10 dark:border-white/20 shadow-sm"></span>
                     <span>مشکل حاد (Major Issue)</span>
                 </div>
                 <div className="flex items-center gap-2 mb-2 text-slate-600 dark:text-surface-300">
                     <span className="w-2 h-2 rounded-full bg-red-300 border border-black/10 dark:border-white/20 shadow-sm"></span>
                     <span>مشکل جزئی (Minor Issue)</span>
                 </div>
                 <div className="text-[10px] text-slate-400 dark:text-surface-500 mt-2 opacity-80">
                     * اندازه دایره نشان‌دهنده تعداد تکرار است.
                 </div>
             </>
         ) : layoutMode === 'galaxy' ? (
             <>
                <div className="flex items-center gap-2 mb-2 text-slate-600 dark:text-surface-300">
                    <span className="w-3 h-3 rounded-full bg-white shadow-[0_0_10px_black] dark:shadow-[0_0_10px_white]"></span>
                    <span>هسته دانش</span>
                </div>
                <div className="flex items-center gap-2 mb-2 text-slate-600 dark:text-surface-300">
                    <span className="w-3 h-3 rounded-full bg-brand-400 shadow-[0_0_10px_#818cf8]"></span>
                    <span>دسته‌بندی‌ها</span>
                </div>
                <div className="flex items-center gap-2 mb-2 text-slate-600 dark:text-surface-300">
                    <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                    <span>اسناد</span>
                </div>
             </>
         ) : (
             <div className="flex items-center gap-2 mb-2 text-slate-600 dark:text-surface-300">
                <span className="w-3 h-3 rounded-full bg-brand-500 border border-black/10 dark:border-white/20 shadow-sm"></span>
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
