import React, { useRef, useEffect, useState } from 'react';
import { AnnotationState } from './AnnotationToolbar';
import { Move } from 'lucide-react';
import { saveAnnotationData, loadAnnotationData } from '../services/userPersistence';

interface AnnotatableAreaProps {
  id: string; // Used for localStorage key
  children: React.ReactNode;
  className?: string;
  annotationState: AnnotationState;
  clearTrigger: number; // Increment to clear all
  clearRegion?: { top: number; bottom: number; t: number } | null; // Clear specific Y range
  isActive: boolean; // Is annotation enabled
}

interface Point { x: number; y: number }
interface Stroke {
  tool: 'pen' | 'highlighter' | 'eraser';
  points: Point[];
  color: string;
  size: number;
}
interface TextNote {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
  fontFamily: string;
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
}

const TextNoteItem = ({
  t,
  isActiveText,
  isActive,
  annotationState,
  canvasWidth,
  canvasHeight,
  onActivate,
  onUpdate,
  onRemove,
  getPos,
  onDragStart
}: {
  t: TextNote;
  isActiveText: boolean;
  isActive: boolean;
  annotationState: AnnotationState;
  canvasWidth: number;
  canvasHeight: number;
  onActivate: (id: string) => void;
  onUpdate: (id: string, updates: Partial<TextNote>) => void;
  onRemove: (id: string) => void;
  getPos: (e: any) => { x: number, y: number };
  onDragStart: (id: string, offset: {x: number, y: number}) => void;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isActiveText && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isActiveText]);

  return (
    <div 
      className={`absolute z-20 group ${isActiveText ? 'ring-2 ring-indigo-400 ring-offset-1 bg-white/40' : 'hover:ring-1 hover:ring-gray-300'} transition-all rounded-sm`}
      style={{ 
          left: `${(t.x / canvasWidth) * 100}%`, 
          top: `${(t.y / canvasHeight) * 100}%`,
          transform: 'translateY(-100%)' // Align bottom-left to click point
      }}
      onPointerDown={(e) => {
          if (!isActive) return;
          e.stopPropagation();
          onActivate(t.id);
      }}
    >
      {/* Drag Handle (Visible only when active or hovered) */}
      <div 
          className={`absolute -top-6 left-0 bg-white shadow-md border border-gray-200 rounded-md p-1 cursor-move text-gray-500 hover:text-indigo-600 transition-colors ${isActiveText ? 'flex' : 'hidden group-hover:flex'}`}
          onPointerDown={(e) => {
              e.stopPropagation();
              const pos = getPos(e);
              onDragStart(t.id, { x: pos.x - t.x, y: pos.y - t.y });
          }}
      >
          <Move size={14} />
      </div>
      
      {/* Text Input Wrapper */}
      <div className="grid">
          {/* Hidden measuring div */}
          <div 
              aria-hidden="true"
              className="invisible whitespace-pre min-w-[50px] px-1 border border-transparent pointer-events-none"
              style={{
                  gridArea: '1 / 1 / 2 / 2',
                  fontSize: `${t.fontSize}px`, 
                  fontFamily: t.fontFamily,
                  fontWeight: t.isBold ? 'bold' : 'normal',
                  fontStyle: t.isItalic ? 'italic' : 'normal',
                  textDecoration: t.isUnderline ? 'underline' : 'none',
              }}
          >
              {t.text || (isActiveText ? "พิมพ์ข้อความ..." : "")}{' '}
          </div>
          
          <textarea
              ref={inputRef as any}
              wrap="off"
              placeholder={isActiveText ? "พิมพ์ข้อความ..." : ""}
              className={`bg-transparent outline-none w-full h-full resize-none overflow-hidden px-1 ${isActiveText ? 'border border-dashed border-gray-400' : 'border-transparent'} ${!t.text && !isActiveText ? 'opacity-0' : ''}`}
              style={{ 
                  gridArea: '1 / 1 / 2 / 2',
                  color: t.color, 
                  fontSize: `${t.fontSize}px`, 
                  fontFamily: t.fontFamily,
                  fontWeight: t.isBold ? 'bold' : 'normal',
                  fontStyle: t.isItalic ? 'italic' : 'normal',
                  textDecoration: t.isUnderline ? 'underline' : 'none',
                  lineHeight: 'normal'
              }}
              value={t.text}
              onChange={(e) => onUpdate(t.id, { 
                  text: e.target.value
              })}
              onFocus={() => onActivate(t.id)}
              onBlur={() => {
                  if (!t.text.trim()) {
                      onRemove(t.id);
                  }
              }}
          />
      </div>
    </div>
  );
};

export default function AnnotatableArea({
  id, children, className, annotationState, clearTrigger, clearRegion, isActive
}: AnnotatableAreaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [texts, setTexts] = useState<TextNote[]>([]);
  
  const [activeTextId, setActiveTextId] = useState<string | null>(null);
  const [draggingTextId, setDraggingTextId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const prevAnnotationStateRef = useRef(annotationState);

  // Sync toolbar changes to active text
  useEffect(() => {
    if (activeTextId && prevAnnotationStateRef.current !== annotationState) {
        setTexts(prev => prev.map(t => {
            if (t.id === activeTextId) {
                return {
                    ...t,
                    color: annotationState.color,
                    fontSize: annotationState.fontSize || 24,
                    fontFamily: annotationState.fontFamily || 'Arial, sans-serif',
                    isBold: !!annotationState.isBold,
                    isItalic: !!annotationState.isItalic,
                    isUnderline: !!annotationState.isUnderline
                };
            }
            return t;
        }));
    }
    prevAnnotationStateRef.current = annotationState;
  }, [annotationState, activeTextId]);

  // Handle custom sticker drop from touch
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const handleCustomDrop = (e: any) => {
        if (!isActive || annotationState.activeTool !== 'sticker') return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (e.detail.x - rect.left) * scaleX;
        const y = (e.detail.y - rect.top) * scaleY;
        
        setTexts(prev => [...prev, {
            id: Date.now().toString(),
            x,
            y,
            text: e.detail.sticker,
            color: annotationState.color,
            fontSize: e.detail.size,
            fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
            isBold: false,
            isItalic: false,
            isUnderline: false
        }]);
    };
    
    canvas.addEventListener('customStickerDrop', handleCustomDrop);
    return () => canvas.removeEventListener('customStickerDrop', handleCustomDrop);
  }, [isActive, annotationState]);

  // Track last loaded ID to prevent saving stale state onto new IDs during transitions
  const lastLoadedIdRef = useRef<string>('');

  // Load from Persistence (Firestore / LocalStorage)
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      // EXCEPTION: Do not save or load annotations in Mock Test mode!
      if (id.toLowerCase().includes('mock')) {
        setStrokes([]);
        setTexts([]);
        lastLoadedIdRef.current = id;
        return;
      }

      try {
        const data = await loadAnnotationData(id);
        if (isMounted) {
          if (data) {
            setStrokes(data.strokes || []);
            setTexts(data.texts || []);
          } else {
            setStrokes([]);
            setTexts([]);
          }
          lastLoadedIdRef.current = id;
        }
      } catch (e) {
        if (isMounted) {
          setStrokes([]);
          setTexts([]);
          lastLoadedIdRef.current = id;
        }
      }
    }
    loadData();
    return () => { isMounted = false; };
  }, [id]);

  // Save to Persistence (Firestore / LocalStorage)
  useEffect(() => {
    if (lastLoadedIdRef.current !== id) return;
    if (id.toLowerCase().includes('mock')) return; // EXCEPTION FOR MOCK TESTS!

    saveAnnotationData(id, { strokes, texts });
  }, [strokes, texts, id]);

  // Handle Clear All
  useEffect(() => {
    if (clearTrigger > 0) {
      setStrokes([]);
      setTexts([]);
      setActiveTextId(null);
    }
  }, [clearTrigger]);

  // Handle Clear Region
  useEffect(() => {
    if (clearRegion) {
      setStrokes(prev => prev.filter(stroke => {
        // Keep stroke if it has no points inside the region
        return !stroke.points.some(p => p.y >= clearRegion.top && p.y <= clearRegion.bottom);
      }));
      // Also remove texts in the region
      setTexts(prev => prev.filter(text => {
        return !(text.y >= clearRegion.top && text.y <= clearRegion.bottom);
      }));
    }
  }, [clearRegion]);

  const redraw = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const allStrokes = currentStroke ? [...strokes, currentStroke] : strokes;

    allStrokes.forEach(stroke => {
      if (stroke.points.length === 0) return;
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      
      if (stroke.tool === 'highlighter') {
        ctx.strokeStyle = stroke.color + '80'; // 50% opacity
        ctx.lineWidth = stroke.size * 3;
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'round';
        ctx.globalCompositeOperation = 'multiply';
      } else if (stroke.tool === 'eraser') {
        ctx.strokeStyle = 'rgba(255,255,255,1)';
        ctx.lineWidth = stroke.size * 5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalCompositeOperation = 'destination-out';
      } else {
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.stroke();
    });
    
    // Reset composite operation
    ctx.globalCompositeOperation = 'source-over';
  };

  useEffect(() => {
    redraw();
  }, [strokes, currentStroke]);

  const getPos = (e: React.TouchEvent | React.MouseEvent | TouchEvent | MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }
    
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const startDraw = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isActive) return;
    
    const pos = getPos(e);

    if (annotationState.activeTool === 'text') {
      const newId = Date.now().toString();
      setTexts([...texts, {
        id: newId,
        x: pos.x,
        y: pos.y,
        text: '',
        color: annotationState.color,
        fontSize: annotationState.fontSize || 24,
        fontFamily: annotationState.fontFamily || 'Arial, sans-serif',
        isBold: !!annotationState.isBold,
        isItalic: !!annotationState.isItalic,
        isUnderline: !!annotationState.isUnderline
      }]);
      setActiveTextId(newId);
      // We must prevent default so that the input focus in the effect isn't immediately stolen
      e.preventDefault();
      return;
    }

    if (annotationState.activeTool === 'sticker' && annotationState.composedSticker) {
      const newId = Date.now().toString();
      setTexts([...texts, {
        id: newId,
        x: pos.x,
        y: pos.y,
        text: annotationState.composedSticker,
        color: annotationState.color,
        fontSize: annotationState.stickerSize || 48,
        fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
        isBold: false,
        isItalic: false,
        isUnderline: false
      }]);
      e.preventDefault();
      return;
    }

    if (activeTextId) {
      setActiveTextId(null); // deselect text
    }

    if (annotationState.activeTool === 'none') {
        return; // Just viewing
    }

    setIsDrawing(true);
    setCurrentStroke({
      tool: annotationState.activeTool as any,
      color: annotationState.color,
      size: annotationState.size,
      points: [pos]
    });
  };

  const draw = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isActive) return;
    
    if (draggingTextId) {
        const pos = getPos(e);
        setTexts(texts.map(t => {
            if (t.id === draggingTextId) {
                return { ...t, x: pos.x - dragOffset.x, y: pos.y - dragOffset.y };
            }
            return t;
        }));
        return;
    }

    if (!isDrawing || !currentStroke) return;
    
    // Prevent scrolling when drawing on touch devices is handled by CSS touch-action
    const pos = getPos(e);
    setCurrentStroke({
      ...currentStroke,
      points: [...currentStroke.points, pos]
    });
  };

  const endDraw = () => {
    if (draggingTextId) {
        setDraggingTextId(null);
    }
    if (!isDrawing || !currentStroke) return;
    setIsDrawing(false);
    setStrokes([...strokes, currentStroke]);
    setCurrentStroke(null);
  };

  useEffect(() => {
    const el = contentRef.current;
    const cvs = canvasRef.current;
    if (!el || !cvs) return;

    const ro = new ResizeObserver(() => {
      cvs.width = el.clientWidth;
      cvs.height = el.clientHeight;
      redraw();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [strokes, currentStroke]); // Need to redraw when resizing or strokes change

  const updateTextNote = (id: string, updates: Partial<TextNote>) => {
      setTexts(texts.map(t => t.id === id ? { ...t, ...updates } : t));
  };

  const removeText = (id: string) => {
      setTexts(texts.filter(t => t.id !== id));
      if (activeTextId === id) setActiveTextId(null);
  };

  return (
    <div 
      ref={containerRef} 
      className={`relative select-none ${className || ''}`} 
      style={{ touchAction: annotationState.activeTool !== 'none' && isActive ? 'none' : 'auto' }}
      onMouseMove={draw}
      onMouseUp={endDraw}
      onMouseLeave={endDraw}
      onTouchMove={draw}
      onTouchEnd={endDraw}
    >
      <div ref={contentRef} className="w-full h-full">
        {children}
      </div>
      
      <canvas
        ref={canvasRef}
        className={`absolute top-0 left-0 w-full h-full ${
          annotationState.activeTool === 'text' ? 'cursor-text' : 
          annotationState.activeTool === 'none' ? 'cursor-auto' : 'cursor-crosshair'
        }`}
        style={{ pointerEvents: isActive ? 'auto' : 'none' }}
        onMouseDown={startDraw}
        onTouchStart={startDraw}
      />

      {isActive && texts.map(t => (
          <TextNoteItem 
              key={t.id}
              t={t}
              isActiveText={activeTextId === t.id}
              isActive={isActive}
              annotationState={annotationState}
              canvasWidth={canvasRef.current?.width || 1}
              canvasHeight={canvasRef.current?.height || 1}
              onActivate={setActiveTextId}
              onUpdate={updateTextNote}
              onRemove={removeText}
              getPos={getPos}
              onDragStart={(id, offset) => {
                  setDragOffset(offset);
                  setDraggingTextId(id);
                  setActiveTextId(id);
              }}
          />
      ))}
    </div>
  );
}
