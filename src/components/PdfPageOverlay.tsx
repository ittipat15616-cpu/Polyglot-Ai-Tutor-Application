import React, { useRef, useState, useEffect } from 'react';
import { Stage, Layer, Line, Text } from 'react-konva';

export type ToolType = 'pointer' | 'pen' | 'text' | 'eraser';

export type DrawingLine = {
  tool: 'pen' | 'eraser';
  points: number[];
  color: string;
  strokeWidth: number;
};

export type DrawingText = {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
};

export type PageAnnotations = {
  lines: DrawingLine[];
  texts: DrawingText[];
};

interface PdfPageOverlayProps {
  width: number;
  height: number;
  scale: number;
  tool: ToolType;
  color: string;
  annotations: PageAnnotations;
  onUpdateAnnotations: (newAnnotations: PageAnnotations) => void;
}

export default function PdfPageOverlay({
  width,
  height,
  scale,
  tool,
  color,
  annotations,
  onUpdateAnnotations
}: PdfPageOverlayProps) {
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentLine, setCurrentLine] = useState<DrawingLine | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  
  const handleMouseDown = (e: any) => {
    if (tool === 'pointer') return;
    
    const pos = e.target.getStage().getPointerPosition();
    if (!pos) return;

    // Adjust position by scale
    const x = pos.x / scale;
    const y = pos.y / scale;

    if (tool === 'pen' || tool === 'eraser') {
      setIsDrawing(true);
      setCurrentLine({
        tool,
        points: [x, y],
        color: tool === 'eraser' ? '#ffffff' : color,
        strokeWidth: tool === 'eraser' ? 20 : 3
      });
    } else if (tool === 'text') {
      const newText: DrawingText = {
        id: Date.now().toString(),
        x,
        y,
        text: 'พิมพ์ข้อความ...',
        color,
        fontSize: 16
      };
      onUpdateAnnotations({
        ...annotations,
        texts: [...annotations.texts, newText]
      });
      // A quick hack: prompt for text right away
      const text = window.prompt('ใส่ข้อความ:', '');
      if (text) {
        newText.text = text;
        onUpdateAnnotations({
          ...annotations,
          texts: [...annotations.texts, newText]
        });
      } else {
        // Cancelled
        onUpdateAnnotations({
          ...annotations,
          texts: annotations.texts
        });
      }
    }
  };

  const handleMouseMove = (e: any) => {
    if (!isDrawing || !currentLine) return;
    if (tool === 'pointer' || tool === 'text') return;

    const pos = e.target.getStage().getPointerPosition();
    if (!pos) return;

    const x = pos.x / scale;
    const y = pos.y / scale;

    setCurrentLine({
      ...currentLine,
      points: currentLine.points.concat([x, y])
    });
  };

  const handleMouseUp = () => {
    if (!isDrawing || !currentLine) return;
    setIsDrawing(false);
    onUpdateAnnotations({
      ...annotations,
      lines: [...annotations.lines, currentLine]
    });
    setCurrentLine(null);
  };

  // Convert points back to scaled for rendering
  const scalePoints = (points: number[]) => {
    return points.map(p => p * scale);
  };

  return (
    <div 
      className="absolute inset-0 z-10" 
      style={{ pointerEvents: tool === 'pointer' ? 'none' : 'auto' }}
    >
      <Stage
        width={width}
        height={height}
        onMouseDown={handleMouseDown}
        onMousemove={handleMouseMove}
        onMouseup={handleMouseUp}
        onTouchStart={handleMouseDown}
        onTouchMove={handleMouseMove}
        onTouchEnd={handleMouseUp}
      >
        <Layer>
          {annotations.lines.map((line, i) => (
            <Line
              key={i}
              points={scalePoints(line.points)}
              stroke={line.color}
              strokeWidth={line.strokeWidth * scale}
              tension={0.5}
              lineCap="round"
              lineJoin="round"
              globalCompositeOperation={
                line.tool === 'eraser' ? 'destination-out' : 'source-over'
              }
            />
          ))}
          {currentLine && (
            <Line
              points={scalePoints(currentLine.points)}
              stroke={currentLine.color}
              strokeWidth={currentLine.strokeWidth * scale}
              tension={0.5}
              lineCap="round"
              lineJoin="round"
              globalCompositeOperation={
                currentLine.tool === 'eraser' ? 'destination-out' : 'source-over'
              }
            />
          )}
          {annotations.texts.map((txt) => (
            <Text
              key={txt.id}
              x={txt.x * scale}
              y={txt.y * scale}
              text={txt.text}
              fill={txt.color}
              fontSize={txt.fontSize * scale}
              fontFamily="sans-serif"
              draggable={tool === 'pointer'} // Not strictly possible if pointerEvents is none, but let's leave it
            />
          ))}
        </Layer>
      </Stage>
    </div>
  );
}
