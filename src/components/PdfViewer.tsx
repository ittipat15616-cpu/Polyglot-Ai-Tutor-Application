import React, { useState, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';

// Configure PDF worker using unpkg CDN
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfViewerProps {
  url: string;
  onPageChange?: (pageNumber: number, canvasDataUrl: string | null) => void;
  children?: React.ReactNode; // For overlaying SmartCanvas
}

export default function PdfViewer({ url, onPageChange, children }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.2);
  const pageRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Drag-to-scroll state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setPageNumber(1);
  }

  // Capture canvas whenever page or scale changes
  useEffect(() => {
    const timer = setTimeout(() => {
      if (pageRef.current && onPageChange) {
        const canvas = pageRef.current.querySelector('canvas');
        if (canvas) {
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          onPageChange(pageNumber, dataUrl);
        } else {
          onPageChange(pageNumber, null);
        }
      }
    }, 1000); // Wait for render
    return () => clearTimeout(timer);
  }, [pageNumber, scale, url, onPageChange]);

  const changePage = (offset: number) => {
    setPageNumber(prevPageNumber => {
      const newPage = prevPageNumber + offset;
      if (newPage < 1) return 1;
      if (newPage > numPages) return numPages;
      return newPage;
    });
  };

  const changeScale = (delta: number) => {
    setScale(prev => Math.max(0.5, Math.min(3, prev + delta)));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only handle left mouse button or touch
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    
    if (!scrollContainerRef.current) return;
    setIsDragging(true);
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      scrollLeft: scrollContainerRef.current.scrollLeft,
      scrollTop: scrollContainerRef.current.scrollTop
    });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !scrollContainerRef.current) return;
    // Prevent text selection while dragging
    e.preventDefault();
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    scrollContainerRef.current.scrollTop = dragStart.scrollTop - dy;
    scrollContainerRef.current.scrollLeft = dragStart.scrollLeft - dx;
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  return (
    <div className="flex flex-col items-center bg-gray-100 h-full overflow-hidden">
      {/* PDF Controls */}
      <div className="flex items-center gap-4 p-2 bg-white w-full justify-center shadow-sm z-10 shrink-0">
        <button 
          disabled={pageNumber <= 1}
          onClick={() => changePage(-1)}
          className="p-1 rounded-full hover:bg-gray-200 disabled:opacity-50 transition-colors"
        >
          <ChevronLeft size={24} />
        </button>
        <span className="text-sm font-medium">
          หน้า {pageNumber} / {numPages || '-'}
        </span>
        <button 
          disabled={pageNumber >= numPages}
          onClick={() => changePage(1)}
          className="p-1 rounded-full hover:bg-gray-200 disabled:opacity-50 transition-colors"
        >
          <ChevronRight size={24} />
        </button>
        
        <div className="w-px h-6 bg-gray-300 mx-2"></div>
        
        <button 
          onClick={() => changeScale(-0.2)}
          className="p-1 rounded-full hover:bg-gray-200 transition-colors"
        >
          <ZoomOut size={20} />
        </button>
        <span className="text-sm w-12 text-center">{Math.round(scale * 100)}%</span>
        <button 
          onClick={() => changeScale(0.2)}
          className="p-1 rounded-full hover:bg-gray-200 transition-colors"
        >
          <ZoomIn size={20} />
        </button>
      </div>

      {/* PDF Document Container with drag-to-scroll */}
      <div 
        ref={scrollContainerRef}
        onPointerDownCapture={handlePointerDown}
        onPointerMoveCapture={handlePointerMove}
        onPointerUpCapture={handlePointerUp}
        onPointerCancelCapture={handlePointerUp}
        className={`flex-1 overflow-auto w-full p-4 text-center pb-32 no-scrollbar ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        style={{ 
          WebkitOverflowScrolling: 'touch', 
          touchAction: isDragging ? 'none' : 'auto',
          userSelect: isDragging ? 'none' : 'auto'
        }}
      >
        <div className="inline-block text-left shadow-xl" style={{ pointerEvents: isDragging ? 'none' : 'auto' }}>
          <Document
            file={url}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={<div className="p-10 text-gray-500 animate-pulse">กำลังโหลดข้อสอบ...</div>}
          >
            <div className="relative pointer-events-auto" ref={pageRef}>
              <Page 
                pageNumber={pageNumber} 
                scale={scale} 
                renderTextLayer={true}
                renderAnnotationLayer={true}
                loading={<div className="p-10 text-gray-500 animate-pulse bg-white min-w-[500px] min-h-[700px] flex items-center justify-center">กำลังวาดหน้า...</div>}
              />
              {/* The SmartCanvas and other overlays will be injected here */}
              {children}
            </div>
          </Document>
        </div>
      </div>
    </div>
  );
}
