import React, { useState } from 'react';
import { PenTool, Type, Eraser, Trash2, Highlighter, MousePointer2, Bold, Italic, Underline, EyeOff } from 'lucide-react';

export type ToolType = 'none' | 'pen' | 'text' | 'eraser' | 'highlighter' | 'sticker';
export type ToolColor = string;
export type ToolSize = number;

export interface AnnotationState {
  activeTool: ToolType;
  color: ToolColor;
  size: ToolSize;
  fontSize?: number;
  fontFamily?: string;
  isBold?: boolean;
  isItalic?: boolean;
  isUnderline?: boolean;
  stickerSize?: number;
  composedSticker?: string;
}

interface AnnotationToolbarProps {
  state: AnnotationState;
  onChange: (newState: AnnotationState) => void;
  onClear: () => void;
}

const COLOR_PALETTE: Record<string, { dark: string; light: string; label: string }> = {
  black: { dark: '#000000', light: '#808080', label: 'ดำ' },
  red: { dark: '#FF0000', light: '#E60000', label: 'แดง (อาทิตย์)' },
  yellow: { dark: '#FFD700', light: '#FFFF00', label: 'เหลือง (จันทร์)' },
  pink: { dark: '#FF1493', light: '#FF00FF', label: 'ชมพู (อังคาร)' },
  green: { dark: '#008000', light: '#00FF00', label: 'เขียว (พุธ)' },
  orange: { dark: '#FFA500', light: '#FF8000', label: 'ส้ม (พฤหัสบดี)' },
  blue: { dark: '#0000FF', light: '#00FFFF', label: 'ฟ้า (ศุกร์)' },
  purple: { dark: '#800080', light: '#B026FF', label: 'ม่วง (เสาร์)' },
};

const FONT_FAMILIES = [
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Times New Roman', value: "'Times New Roman', serif" },
  { label: 'Courier New', value: "'Courier New', monospace" },
  { label: 'Tahoma', value: 'Tahoma, sans-serif' },
  { label: 'Comic Sans MS', value: "'Comic Sans MS', cursive" }
];

export default function AnnotationToolbar({ state, onChange, onClear }: AnnotationToolbarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const getActiveToolIcon = () => {
    switch (state.activeTool) {
      case 'pen': return <PenTool size={20} />;
      case 'highlighter': return <Highlighter size={20} />;
      case 'text': return <Type size={20} />;
      case 'eraser': return <Eraser size={20} />;
      default: return <MousePointer2 size={20} />;
    }
  };

  const getActiveToolLabel = () => {
    switch (state.activeTool) {
      case 'pen': return 'ปากกา';
      case 'highlighter': return 'ไฮไลท์';
      case 'text': return 'ข้อความ';
      case 'eraser': return 'ยางลบ';
      default: return 'เลื่อนดู';
    }
  };

  const updateState = (updates: Partial<AnnotationState>) => {
    let newColor = updates.color || state.color;
    
    // Auto-switch shade if tool changes between pen and highlighter
    if (updates.activeTool && (updates.activeTool === 'pen' || updates.activeTool === 'highlighter' || updates.activeTool === 'text')) {
      const baseKey = Object.keys(COLOR_PALETTE).find(k => 
         COLOR_PALETTE[k].dark === state.color || COLOR_PALETTE[k].light === state.color
      );
      if (baseKey) {
         if (updates.activeTool === 'highlighter' && baseKey === 'black') {
            newColor = COLOR_PALETTE['yellow'].light; // Fallback to yellow
         } else {
            newColor = updates.activeTool === 'highlighter' 
               ? COLOR_PALETTE[baseKey].light 
               : COLOR_PALETTE[baseKey].dark;
         }
      }
    }

    onChange({ ...state, ...updates, color: newColor });
  };

  const defaultFontSize = state.fontSize || 24;
  const defaultFontFamily = state.fontFamily || FONT_FAMILIES[0].value;

  if (isCollapsed) {
    return (
      <button
        id="tutorial-mock-show-toolbar"
        onClick={() => setIsCollapsed(false)}
        className="flex items-center justify-center w-12 h-12 bg-indigo-600 hover:bg-indigo-700 text-white shadow-xl rounded-full border border-indigo-500 transition-all transform hover:scale-105 pointer-events-auto"
        title="แตะเพื่อแสดงแถบเครื่องมือขีดเขียน"
      >
        {getActiveToolIcon()}
      </button>
    );
  }

  return (
    <div className="flex gap-2 mx-auto sm:mr-0 sm:ml-auto w-fit z-40 transition-all pointer-events-auto items-end flex-col relative">
      <div className="flex flex-col gap-2 items-end">
        <div className="flex flex-wrap items-center justify-center gap-1.5 p-1.5 bg-white/90 backdrop-blur-md border border-gray-200 shadow-lg rounded-2xl w-fit">
          {/* Tools: MousePointer2, PenTool, Highlighter, Type, Eraser */}
          <div className="flex items-center gap-1 bg-gray-100/50 p-1 rounded-xl">
            <button
              onClick={() => updateState({ activeTool: 'none' })}
              className={`p-1.5 rounded-lg transition-all ${state.activeTool === 'none' ? 'bg-indigo-100 text-indigo-700 shadow-sm' : 'text-gray-600 hover:bg-gray-200'}`}
              title="เลื่อนดู (ไม่วาด)"
            >
              <MousePointer2 size={18} />
            </button>

            <button
              id="tutorial-vocab-pen"
              onClick={() => updateState({ activeTool: 'pen' })}
              className={`p-1.5 rounded-lg transition-all ${state.activeTool === 'pen' ? 'bg-indigo-100 text-indigo-700 shadow-sm' : 'text-gray-600 hover:bg-gray-200'}`}
              title="วาดเขียน (ปากกา)"
            >
              <PenTool size={18} />
            </button>

            <button
              id="tutorial-vocab-highlighter"
              onClick={() => updateState({ activeTool: 'highlighter', size: 16 })}
              className={`p-1.5 rounded-lg transition-all ${state.activeTool === 'highlighter' ? 'bg-yellow-100 text-yellow-700 shadow-sm' : 'text-gray-600 hover:bg-gray-200'}`}
              title="ไฮไลท์"
            >
              <Highlighter size={18} />
            </button>

            <button
              id="tutorial-vocab-text"
              onClick={() => updateState({ activeTool: 'text', fontSize: defaultFontSize, fontFamily: defaultFontFamily })}
              className={`p-1.5 rounded-lg transition-all ${state.activeTool === 'text' ? 'bg-indigo-100 text-indigo-700 shadow-sm' : 'text-gray-600 hover:bg-gray-200'}`}
              title="พิมพ์ข้อความ"
            >
              <Type size={18} />
            </button>

            <button
              id="tutorial-vocab-eraser"
              onClick={() => updateState({ activeTool: 'eraser' })}
              className={`p-1.5 rounded-lg transition-all ${state.activeTool === 'eraser' ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-200'}`}
              title="ยางลบ"
            >
              <Eraser size={18} />
            </button>
          </div>

          <div className="w-px h-6 bg-gray-200 mx-1 hidden sm:block" />

          {/* Colors */}
          {state.activeTool !== 'eraser' && state.activeTool !== 'none' && (
            <>
              <div className="w-px h-6 bg-gray-200 mx-1 hidden sm:block" />
              <div id="tutorial-vocab-color-palette" className="flex items-center gap-1.5 px-1">
                {Object.values(COLOR_PALETTE).map((c) => {
                  const isHighlighter = state.activeTool === 'highlighter';
                  if (isHighlighter && c.label === 'ดำ') return null;
                  const targetColor = isHighlighter ? c.light : c.dark;
                  const isActive = state.color === targetColor;
                  return (
                    <button
                      key={c.label}
                      onClick={() => updateState({ color: targetColor })}
                      style={{ backgroundColor: targetColor }}
                      className={`w-5 h-5 rounded-full shadow-sm transition-transform ${isActive ? 'scale-125 ring-2 ring-offset-1 ring-indigo-500' : 'hover:scale-110'}`}
                      title={c.label}
                    />
                  );
                })}
              </div>
            </>
          )}

          {/* Thickness Input */}
          {state.activeTool !== 'text' && state.activeTool !== 'none' && (
            <>
              <div className="w-px h-6 bg-gray-200 mx-1 hidden sm:block" />
              <div id="tutorial-vocab-size-input" className="flex items-center gap-1 border border-gray-300 rounded-lg bg-white overflow-hidden px-1">
                <input 
                  type="number" 
                  value={state.size || 2} 
                  onChange={(e) => updateState({ size: Math.max(1, parseInt(e.target.value) || 2) })}
                  className="w-10 py-0.5 text-center text-xs outline-none bg-transparent"
                  min="1" max="100"
                />
                <span className="text-[10px] text-gray-500 pr-1">px</span>
              </div>
            </>
          )}

          <div className="w-px h-6 bg-gray-200 mx-1 hidden sm:block" />

          {/* Actions */}
          <button
            id="tutorial-vocab-clear-all"
            onClick={onClear}
            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1"
            title="ล้างทั้งหมดหน้านี้"
          >
            <Trash2 size={18} />
            <span className="text-xs font-medium hidden sm:inline">ลบทั้งหน้า</span>
          </button>

          <div className="w-px h-6 bg-gray-200 mx-1 hidden sm:block" />

          <button
            id="tutorial-mock-hide-toolbar"
            onClick={() => setIsCollapsed(true)}
            className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-1"
            title="ซ่อนเครื่องมือขีดเขียน"
          >
            <EyeOff size={18} />
            <span className="text-xs font-medium hidden sm:inline">ซ่อน</span>
          </button>
        </div>
        
        {/* Text Properties Sub-toolbar */}
        {state.activeTool === 'text' && (
          <div className="flex flex-wrap items-center justify-center gap-3 p-2 bg-white/90 backdrop-blur-md border border-gray-200 shadow-md rounded-xl w-fit animate-in slide-in-from-top-2">
            <div id="tutorial-vocab-font-size-input" className="flex items-center gap-1 border border-gray-300 rounded-lg bg-white overflow-hidden px-1">
                <input 
                  type="number" 
                  value={state.fontSize || 24} 
                  onChange={(e) => updateState({ fontSize: parseInt(e.target.value) || 24 })}
                  className="w-12 py-1 text-center text-sm outline-none bg-transparent"
                  min="10" max="100"
                />
                <span className="text-xs text-gray-500 pr-1">px</span>
            </div>

            <div className="flex items-center gap-1 bg-gray-100/50 p-1 rounded-lg">
                <button
                  onClick={() => updateState({ isBold: !state.isBold })}
                  className={`p-1.5 rounded-md transition-colors ${state.isBold ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-200'}`}
                  title="ตัวหนา"
                >
                  <Bold size={20} />
                </button>
                <button
                  onClick={() => updateState({ isItalic: !state.isItalic })}
                  className={`p-1.5 rounded-md transition-colors ${state.isItalic ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-200'}`}
                  title="ตัวเอียง"
                >
                  <Italic size={20} />
                </button>
                <button
                  onClick={() => updateState({ isUnderline: !state.isUnderline })}
                  className={`p-1.5 rounded-md transition-colors ${state.isUnderline ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-200'}`}
                  title="ขีดเส้นใต้"
                >
                  <Underline size={20} />
                </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
