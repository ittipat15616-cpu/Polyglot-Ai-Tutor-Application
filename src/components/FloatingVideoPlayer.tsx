import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, GripHorizontal, Video } from 'lucide-react';

interface VideoData {
  chapter: number;
  title: string;
  url: string;
}

interface FloatingVideoPlayerProps {
  videos: VideoData[];
  onClose: () => void;
  isOpen: boolean;
}

export default function FloatingVideoPlayer({ videos, onClose, isOpen }: FloatingVideoPlayerProps) {
  const [currentVideo, setCurrentVideo] = useState<VideoData | null>(null);

  const getEmbedUrl = (rawUrl: string) => {
    try {
      if (!rawUrl.includes('media.bccampus.ca')) return rawUrl;
      const parts = rawUrl.split('/');
      const entryId = parts[parts.length - 1];
      return `https://media.bccampus.ca/embed/secure/iframe/entryId/${entryId}/uiConfId/23449753`;
    } catch {
      return rawUrl;
    }
  };

  useEffect(() => {
    if (videos && videos.length > 0 && !currentVideo) {
      setCurrentVideo(videos[0]);
    }
  }, [videos, currentVideo]);

  // Reset to first video when videos list changes (e.g., user switches levels)
  useEffect(() => {
    if (videos && videos.length > 0) {
      setCurrentVideo(videos[0]);
    }
  }, [videos]);

  if (!isOpen || !videos || videos.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 50 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 50 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        drag
        dragMomentum={false}
        dragElastic={0.1}
        className="fixed z-[100] bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-200 flex flex-col"
        style={{
          width: 380,
          height: 300,
          bottom: 20,
          right: 20,
          touchAction: 'none'
        }}
      >
        {/* Drag Handle & Header */}
        <div className="bg-indigo-50 border-b border-indigo-100 p-2 flex items-center gap-2 cursor-grab active:cursor-grabbing shrink-0 handle">
          <GripHorizontal size={16} className="text-indigo-300 ml-1" />
          <div className="flex-1 flex items-center gap-2 overflow-hidden">
            <Video size={16} className="text-indigo-600 shrink-0" />
            <select 
              className="bg-white border border-indigo-200 rounded-md text-sm font-medium text-gray-800 px-2 py-1 w-full truncate focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              value={currentVideo?.chapter || ''}
              onChange={(e) => {
                const chapter = parseInt(e.target.value);
                const vid = videos.find(v => v.chapter === chapter);
                if (vid) setCurrentVideo(vid);
              }}
              // Stop dragging when interacting with select
              onPointerDown={(e) => e.stopPropagation()} 
            >
              {videos.map(v => (
                <option key={v.chapter} value={v.chapter}>
                  {v.title}
                </option>
              ))}
            </select>
          </div>
          <button 
            onClick={onClose}
            onPointerDown={(e) => e.stopPropagation()}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-indigo-100 hover:text-indigo-700 transition-colors shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Video Player Area */}
        <div className="flex-1 bg-black relative" onPointerDown={(e) => e.stopPropagation()}>
          {currentVideo ? (
            <iframe 
              key={currentVideo.url}
              src={getEmbedUrl(currentVideo.url)} 
              className="absolute inset-0 w-full h-full"
              frameBorder="0"
              allowFullScreen
              allow="autoplay; encrypted-media; fullscreen"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-gray-500">
              ไม่มีวิดีโอ
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
