import React, { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import AnnotationToolbar, { AnnotationState } from './AnnotationToolbar';
import AnnotatableImage from './AnnotatableImage';
import { getFirebaseStorageUrl, getFirebaseStorageUrlAsync } from '../utils/firebaseStorage';
import { ref, listAll, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';

interface DocumentGalleryProps {
  type: 'hsk' | 'courseware' | 'root' | 'ielts';
  folder: string;
  prefix: string;
  hideLastNPages?: number;
  maxPagesToKeep?: number;
  specificPagesToKeep?: number[];
  cropLastPageHalf?: boolean;
  hideDownload?: boolean;
  prependNode?: React.ReactNode;
  enableAnnotation?: boolean;
}

import manifestData from '../data/image_manifest.json';

export default function DocumentGallery({ 
  type, folder, prefix, hideLastNPages = 0, maxPagesToKeep, specificPagesToKeep, cropLastPageHalf = false, hideDownload = true, prependNode, enableAnnotation = false
}: DocumentGalleryProps) {
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Annotation State
  const [annotationState, setAnnotationState] = useState<AnnotationState>({
    activeTool: 'none',
    color: '#ef4444',
    size: 4
  });
  const [clearTrigger, setClearTrigger] = useState(0);

  useEffect(() => {
    const fetchImages = async () => {
      setLoading(true);
      
      // Determine the base path key in the manifest
      const basePath = type === 'hsk' ? 'HSK_Images' : (type === 'root' ? '' : (type === 'ielts' ? 'Courseware_Images/IELTS_Mock_Tests' : 'Courseware_Images'));
      const manifestKey = basePath ? `${basePath}/${folder}` : folder;
      
      // Assert manifest as a Record of string arrays
      const manifest = manifestData as Record<string, string[]>;
      const folderFiles = manifest[manifestKey] || [];
      
      let finalImages: string[] = [];
      if (folderFiles.length > 0) {
        // Filter files matching prefix
        const matchedFiles = folderFiles.filter(f => f.startsWith(prefix) && f.endsWith('.jpg'));
        
        // Sort numerically by page number (supporting page1.jpg and page_1.jpg)
        matchedFiles.sort((a, b) => {
          const numA = parseInt(a.match(/page_?(\d+)/i)?.[1] || '0');
          const numB = parseInt(b.match(/page_?(\d+)/i)?.[1] || '0');
          return numA - numB;
        });
        
        const urls = await Promise.all(matchedFiles.map(async (f) => {
          const fullPath = `${manifestKey}/${f}`;
          return await getFirebaseStorageUrlAsync(fullPath);
        }));
        finalImages = urls;
      } else {
        // Fallback to fetching directly from Firebase Storage REST API
        try {
          const searchPrefix = basePath ? `${basePath}/${folder}/` : `${folder}/`;
          const listRef = ref(storage, searchPrefix);
          const res = await listAll(listRef);
          
          if (res.items && res.items.length > 0) {
            const matchedRefs = res.items
              .filter((itemRef) => {
                const fileName = itemRef.name;
                return fileName.startsWith(prefix) && fileName.endsWith('.jpg');
              });
              
            // Sort naturally by digits in the filename
            matchedRefs.sort((a, b) => { 
               const numA = parseInt(a.name.match(/\d+/g)?.pop() || '0');
               const numB = parseInt(b.name.match(/\d+/g)?.pop() || '0');
               return numA - numB;
            });
            
            const urls = await Promise.all(matchedRefs.map(itemRef => getDownloadURL(itemRef)));
            finalImages = urls;
          }
        } catch (err) {
          console.error("Failed to fetch from Firebase Storage:", err);
        }
      }

      if (specificPagesToKeep && specificPagesToKeep.length > 0) {
        finalImages = finalImages.filter((_, idx) => specificPagesToKeep.includes(idx + 1));
      } else if (maxPagesToKeep && maxPagesToKeep > 0 && finalImages.length > maxPagesToKeep) {
        finalImages = finalImages.slice(0, maxPagesToKeep);
      } else if (hideLastNPages && finalImages.length > hideLastNPages) {
        finalImages = finalImages.slice(0, finalImages.length - hideLastNPages);
      }
      
      setImages(finalImages);
      setLoading(false);
    };
    
    fetchImages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, folder, prefix, hideLastNPages, maxPagesToKeep, specificPagesToKeep ? specificPagesToKeep.join(',') : '']);

  const handleDownload = async (url: string, index: number) => {
    try {
      // Fetch as blob to bypass cross-origin download restrictions
      const response = await fetch(url);
      if (!response.ok) throw new Error('Network response was not ok');
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `${prefix}_page_${index + 1}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Download failed, falling back to open:', error);
      window.open(url, '_blank');
    }
  };

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="w-full h-full flex flex-col bg-gray-50 relative">
        <div className="w-full flex-1 overflow-y-auto p-4 pt-16 sm:pt-20 flex flex-col items-center">
          <div className="flex flex-col gap-6 w-full max-w-3xl mx-auto mb-8">
            {prependNode}
          </div>
          <div className="flex flex-col items-center justify-center text-gray-500 mt-10">
            <p>ไม่พบไฟล์ภาพเอกสารสำหรับเรื่องนี้</p>
            <p className="text-sm mt-2">(ไฟล์อาจกำลังอยู่ระหว่างเตรียมการ)</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-gray-100 relative">
      {enableAnnotation && (
        <div className="fixed bottom-24 right-4 z-50 pointer-events-none flex flex-col items-end">
          <div className="pointer-events-auto shadow-lg rounded-full">
            <AnnotationToolbar 
              state={annotationState} 
              onChange={setAnnotationState} 
              onClear={() => setClearTrigger(c => c + 1)} 
            />
          </div>
        </div>
      )}
      <div className="w-full flex-1 overflow-y-auto p-4 pt-4 sm:pt-6">
        <div className="flex flex-col gap-6 max-w-3xl mx-auto">
          {prependNode}
          {images.map((url, idx) => {
            const isLastPageCropped = cropLastPageHalf && idx === images.length - 1;
            return (
              <div 
                key={url} 
                className="relative group bg-white shadow-md rounded-xl overflow-hidden border border-gray-200"
                style={isLastPageCropped ? { maxHeight: '380px', overflow: 'hidden' } : undefined}
              >
                {/* Image with Annotations */}
                {enableAnnotation ? (
                  <AnnotatableImage 
                    src={url} 
                    alt={`${prefix} page ${idx + 1}`} 
                    className="w-full h-auto block" 
                    annotationState={annotationState}
                    clearTrigger={clearTrigger}
                    isActive={true}
                  />
                ) : (
                  <img src={url} alt={`${prefix} page ${idx + 1}`} className="w-full h-auto block" />
                )}
              
                {/* Page Number indicator */}
                <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-sm text-white px-3 py-1 rounded-full text-xs font-bold z-10">
                  หน้าที่ {idx + 1} {isLastPageCropped ? '(โจทย์ส่วนบน)' : ''}
                </div>

                {!hideDownload && (
                  <button
                    onClick={() => handleDownload(url, idx)}
                    className="absolute top-20 right-4 bg-white/90 hover:bg-white text-gray-700 hover:text-indigo-600 p-2 rounded-full shadow-md transition-all opacity-0 group-hover:opacity-100 z-10"
                    title="ดาวน์โหลดภาพหน้านี้"
                  >
                    <Download size={16} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
