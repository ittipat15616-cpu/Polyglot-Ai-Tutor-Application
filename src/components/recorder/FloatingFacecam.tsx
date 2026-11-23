import React, { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2, FlipHorizontal2, Move } from 'lucide-react';
import CameraFeedView from './CameraFeedView';
import {
  BgEffectId,
  CAM_SIZE_PX,
  CamFilterId,
  CamMode,
  CamSize,
} from './types';

interface FloatingFacecamProps {
  stream: MediaStream | null;
  mode: CamMode;
  size: CamSize;
  bgEffect: BgEffectId;
  customBgUrl: string | null;
  filterId: CamFilterId;
  isMirrored: boolean;
  onModeChange: (mode: CamMode) => void;
  onSizeChange: (size: CamSize) => void;
  onToggleMirror: () => void;
}

const SIZE_ORDER: CamSize[] = ['sm', 'md', 'lg'];
const SIZE_LABELS: Record<CamSize, string> = { sm: 'S', md: 'M', lg: 'L' };
const VIEWPORT_MARGIN = 20;

export default function FloatingFacecam({
  stream,
  mode,
  size,
  bgEffect,
  customBgUrl,
  filterId,
  isMirrored,
  onModeChange,
  onSizeChange,
  onToggleMirror,
}: FloatingFacecamProps) {
  const diameter = CAM_SIZE_PX[size];

  // Anchor at bottom-left by default
  const [position, setPosition] = useState<{ x: number; y: number }>(() => {
    const winH = typeof window !== 'undefined' ? window.innerHeight : 800;
    const bottomClearance =
      typeof window !== 'undefined' && window.innerWidth < 768 ? 88 : 28;
    return {
      x: 24,
      y: Math.max(VIEWPORT_MARGIN, winH - CAM_SIZE_PX[size] - bottomClearance),
    };
  });

  const [isDragging, setIsDragging] = useState(false);
  const dragOffsetRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const prevDiameterRef = useRef<number>(diameter);

  // Keep bottom edge anchored & clamped when resizing bubble or viewport
  useEffect(() => {
    const prevD = prevDiameterRef.current;
    prevDiameterRef.current = diameter;

    const clampPosition = (
      pos: { x: number; y: number },
      d: number,
      deltaD: number
    ) => {
      const maxX = Math.max(VIEWPORT_MARGIN, window.innerWidth - d - VIEWPORT_MARGIN);
      const maxY = Math.max(VIEWPORT_MARGIN, window.innerHeight - d - VIEWPORT_MARGIN);
      const adjustedY =
        deltaD !== 0 && pos.y > window.innerHeight / 2 ? pos.y - deltaD : pos.y;
      return {
        x: Math.min(Math.max(VIEWPORT_MARGIN, pos.x), maxX),
        y: Math.min(Math.max(VIEWPORT_MARGIN, adjustedY), maxY),
      };
    };

    setPosition((prev) => clampPosition(prev, diameter, diameter - prevD));

    const handleResize = () => {
      setPosition((prev) => clampPosition(prev, diameter, 0));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [diameter]);

  if (mode === 'hidden' || !stream) {
    return null;
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (mode !== 'circle') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    dragOffsetRef.current = {
      dx: e.clientX - position.x,
      dy: e.clientY - position.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || mode !== 'circle') return;
    const maxX = Math.max(VIEWPORT_MARGIN, window.innerWidth - diameter - VIEWPORT_MARGIN);
    const maxY = Math.max(VIEWPORT_MARGIN, window.innerHeight - diameter - VIEWPORT_MARGIN);
    const nextX = Math.min(
      Math.max(VIEWPORT_MARGIN, e.clientX - dragOffsetRef.current.dx),
      maxX
    );
    const nextY = Math.min(
      Math.max(VIEWPORT_MARGIN, e.clientY - dragOffsetRef.current.dy),
      maxY
    );
    setPosition({ x: nextX, y: nextY });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore if pointer already released
    }
  };

  const cycleSize = (e: React.MouseEvent) => {
    e.stopPropagation();
    const idx = SIZE_ORDER.indexOf(size);
    const next = SIZE_ORDER[(idx + 1) % SIZE_ORDER.length];
    onSizeChange(next);
  };

  if (mode === 'fullscreen') {
    return (
      <div className="fixed inset-0 z-[95] bg-slate-950 flex items-center justify-center select-none group">
        <CameraFeedView
          stream={stream}
          bgEffect={bgEffect}
          customBgUrl={customBgUrl}
          filterId={filterId}
          isMirrored={isMirrored}
          highRes={true}
        />

        {/* Subtle hover-only presenter controls */}
        <div className="fixed top-5 right-5 flex items-center gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200">
          <button
            type="button"
            onClick={onToggleMirror}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-950/75 hover:bg-slate-900 text-white text-xs font-medium border border-white/15 backdrop-blur-md transition-colors whitespace-nowrap"
            title="กลับด้านภาพกล้อง"
          >
            <FlipHorizontal2 size={14} />
            <span>กลับด้านภาพ</span>
          </button>
          <button
            type="button"
            onClick={() => onModeChange('circle')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600/90 hover:bg-indigo-600 text-white text-xs font-semibold border border-white/15 backdrop-blur-md shadow-lg transition-colors whitespace-nowrap"
            title="ย่อกลับเป็นวงกลมมุมซ้ายล่าง (Alt+F)"
          >
            <Minimize2 size={14} />
            <span>ย่อเป็นวงกลม (Alt+F)</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        width: diameter,
        height: diameter,
        transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
      }}
      className={`fixed top-0 left-0 z-[96] rounded-full select-none touch-none group ${
        isDragging ? 'cursor-grabbing' : 'cursor-grab'
      }`}
    >
      {/* Circular video frame with crisp ring */}
      <div
        className={`w-full h-full rounded-full overflow-hidden bg-slate-900 ring-[3px] ring-white/95 shadow-[0_14px_36px_rgba(15,23,42,0.38)] transition-transform duration-150 ${
          isDragging ? 'scale-[1.03]' : 'scale-100'
        }`}
      >
        <CameraFeedView
          stream={stream}
          bgEffect={bgEffect}
          customBgUrl={customBgUrl}
          filterId={filterId}
          isMirrored={isMirrored}
          highRes={false}
        />
      </div>

      {/* Hover-only quick micro-controls */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        className="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full flex items-center gap-1 px-1.5 py-1 rounded-xl bg-slate-900/90 text-white border border-white/15 shadow-lg backdrop-blur-md opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150 pointer-events-auto"
      >
        <span
          className="px-1 text-slate-400 flex items-center"
          title="ลากเพื่อย้ายตำแหน่ง"
        >
          <Move size={12} />
        </span>
        <button
          type="button"
          onClick={cycleSize}
          className="px-2 py-1 rounded-lg hover:bg-white/15 text-[11px] font-semibold font-mono tabular-nums transition-colors whitespace-nowrap"
          title="สลับขนาดวงกลม (S / M / L)"
        >
          {SIZE_LABELS[size]}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleMirror();
          }}
          className="p-1.5 rounded-lg hover:bg-white/15 text-slate-200 hover:text-white transition-colors"
          title="กลับด้านภาพกล้อง"
        >
          <FlipHorizontal2 size={13} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onModeChange('fullscreen');
          }}
          className="p-1.5 rounded-lg hover:bg-indigo-500/80 text-slate-200 hover:text-white transition-colors"
          title="ขยายเต็มจอเพื่อพูดหน้ากล้อง (Alt+F)"
        >
          <Maximize2 size={13} />
        </button>
      </div>
    </div>
  );
}
