import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';

export interface DrawCommand {
  id: string;
  type: 'circle' | 'text' | 'highlight';
  x: number; // 0-100 percentage
  y: number; // 0-100 percentage
  text?: string;
  width?: number; // percentage
  height?: number; // percentage
  color?: string;
}

interface SmartCanvasProps {
  commands: DrawCommand[];
}

export interface SmartCanvasRef {
  clear: () => void;
}

const SmartCanvas = forwardRef<SmartCanvasRef, SmartCanvasProps>(({ commands }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Redraw when commands change or window resizes
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Make canvas sharp on high DPI displays
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    // Draw all commands
    commands.forEach(cmd => {
      const cx = (cmd.x / 100) * rect.width;
      const cy = (cmd.y / 100) * rect.height;

      ctx.save();
      if (cmd.type === 'circle') {
        ctx.beginPath();
        // Default radius if not specified (e.g. 20px)
        const radius = cmd.width ? (cmd.width / 100) * rect.width : 20;
        ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
        ctx.strokeStyle = cmd.color || '#ef4444'; // Red
        ctx.lineWidth = 3;
        ctx.stroke();
      } else if (cmd.type === 'highlight') {
        const w = cmd.width ? (cmd.width / 100) * rect.width : 100;
        const h = cmd.height ? (cmd.height / 100) * rect.height : 20;
        ctx.fillStyle = cmd.color || 'rgba(250, 204, 21, 0.4)'; // Yellow transparent
        // cx, cy could be center or top-left. Let's assume top-left for highlight
        ctx.fillRect(cx, cy, w, h);
      } else if (cmd.type === 'text' && cmd.text) {
        ctx.font = 'bold 20px "Kanit", sans-serif';
        ctx.fillStyle = cmd.color || '#2563eb'; // Blue
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Add text shadow for readability
        ctx.shadowColor = 'white';
        ctx.shadowBlur = 4;
        ctx.lineWidth = 3;
        ctx.strokeText(cmd.text, cx, cy);
        
        ctx.shadowBlur = 0;
        ctx.fillText(cmd.text, cx, cy);
      }
      ctx.restore();
    });

  }, [commands]);

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none z-50">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
});

SmartCanvas.displayName = 'SmartCanvas';

export default SmartCanvas;
