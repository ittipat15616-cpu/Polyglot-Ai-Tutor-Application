import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Maximize2, X, Headphones, FileText, Edit3, Mic, Download } from 'lucide-react';
import { getFirebaseStorageUrl } from '../utils/firebaseStorage';
import DocumentGallery from './DocumentGallery';
import PdfViewer from './PdfViewer';

interface IeltsPracticeAreaProps {
  examId: string; // e.g. "IELTS_Mock_1"
  skill: string;  // e.g. "Listening", "Reading", "Writing", "Speaking", "Full Mock Exams"
  onBack: () => void;
}

const SPEAKING_TRACKS = [
  { p: 1, q: 1 }, { p: 1, q: 2 }, { p: 1, q: 3 }, { p: 1, q: 4 },
  { p: 2, q: 1 },
  { p: 3, q: 1 }, { p: 3, q: 2 }, { p: 3, q: 3 }, { p: 3, q: 4 }
];

export default function IeltsPracticeArea({ examId, skill, onBack }: IeltsPracticeAreaProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  const [speakingTrackIdx, setSpeakingTrackIdx] = useState(0);
  const [activeSkill, setActiveSkill] = useState<string | null>(
    skill === 'Full Mock Exams' ? null : skill
  );

  useEffect(() => {
    setActiveSkill(skill === 'Full Mock Exams' ? null : skill);
  }, [skill]);

  // Normalize examId from "IELTS_Mock_1" to "IELTS_Mock_Test_1"
  const normalizedExamId = examId.replace('IELTS_Mock_', 'IELTS_Mock_Test_');
  const isSet1 = normalizedExamId === 'IELTS_Mock_Test_1';
  
  const pdfFileName = activeSkill ? `${activeSkill.charAt(0).toUpperCase() + activeSkill.slice(1).toLowerCase()}_Full.pdf` : '';
  const pdfUrl = activeSkill ? getFirebaseStorageUrl(`IELTS_Mock_Tests/${normalizedExamId}/${pdfFileName}`) : '';
  

  if (!activeSkill) {
    return (
      <div className="flex flex-col h-full w-full max-w-5xl mx-auto pb-10">
        <button onClick={onBack} className="flex items-center gap-2 text-indigo-600 font-medium hover:text-indigo-700 transition-colors mb-6 self-start">
          <ChevronLeft size={20} /> ย้อนกลับไปเลือกชุดข้อสอบ
        </button>
        
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">{normalizedExamId.replace(/_/g, ' ')}</h1>
          <p className="text-gray-600 mb-8 max-w-2xl mx-auto">ยินดีต้อนรับเข้าสู่โหมดฝึกทำข้อสอบ (Practice Mode) โปรดเลือกทักษะที่ต้องการฝึกทำ (ไม่มีจับเวลา)</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <button
              id="tutorial-exam-listening-skill"
              onClick={() => { setActiveSkill('listening'); setSpeakingTrackIdx(0); }}
              className="p-6 rounded-2xl border-2 border-indigo-100 hover:border-indigo-500 hover:bg-indigo-50 transition-all group flex flex-col items-center"
            >
              <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Headphones size={32} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Listening</h3>
              <p className="text-sm text-gray-500">Practice Mode</p>
            </button>

            <button onClick={() => { setActiveSkill('reading'); setSpeakingTrackIdx(0); }} className="p-6 rounded-2xl border-2 border-emerald-100 hover:border-emerald-500 hover:bg-emerald-50 transition-all group flex flex-col items-center">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <FileText size={32} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Reading</h3>
              <p className="text-sm text-gray-500">Practice Mode</p>
            </button>

            <button onClick={() => { setActiveSkill('writing'); setSpeakingTrackIdx(0); }} className="p-6 rounded-2xl border-2 border-amber-100 hover:border-amber-500 hover:bg-amber-50 transition-all group flex flex-col items-center">
              <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Edit3 size={32} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Writing</h3>
              <p className="text-sm text-gray-500">Practice Mode</p>
            </button>

            <button onClick={() => { setActiveSkill('speaking'); setSpeakingTrackIdx(0); }} className="p-6 rounded-2xl border-2 border-rose-100 hover:border-rose-500 hover:bg-rose-50 transition-all group flex flex-col items-center">
              <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Mic size={32} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Speaking</h3>
              <p className="text-sm text-gray-500">Practice Mode</p>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Determine PDF URL
  // We use standard capitalization for PDF names
    // Determine Audio URLs
  const hasAudio = activeSkill.toLowerCase() === 'listening' || activeSkill.toLowerCase() === 'speaking';
  
  let currentAudioUrl = '';
  let audioLabel = '';

  if (activeSkill.toLowerCase() === 'listening') {
    currentAudioUrl = getFirebaseStorageUrl(`IELTS_Mock_Tests/${normalizedExamId}/Listening_Full_Audio.mp3`);
    audioLabel = 'Listening Audio';
  } else if (activeSkill.toLowerCase() === 'speaking') {
    const track = SPEAKING_TRACKS[speakingTrackIdx];
    const isUppercaseSet = isSet1 || 
                           normalizedExamId === 'IELTS_Mock_Test_2' || 
                           normalizedExamId === 'IELTS_Mock_Test_5' || 
                           normalizedExamId === 'IELTS_Mock_Test_6' || 
                           normalizedExamId === 'IELTS_Mock_Test_7';
    const fileName = isUppercaseSet 
      ? `Speaking_Part${track.p}_Q${track.q}.mp3` 
      : `speaking_part${track.p}_q${track.q}.mp3`;
    currentAudioUrl = getFirebaseStorageUrl(`IELTS_Mock_Tests/${normalizedExamId}/${fileName}`);
    audioLabel = `Speaking Part ${track.p} - Q${track.q}`;
  }

  const handleNextSpeakingTrack = () => {
    if (speakingTrackIdx < SPEAKING_TRACKS.length - 1) {
      setSpeakingTrackIdx(speakingTrackIdx + 1);
    }
  };

  const handlePrevSpeakingTrack = () => {
    if (speakingTrackIdx > 0) {
      setSpeakingTrackIdx(speakingTrackIdx - 1);
    }
  };

  const handleBack = () => {
    if (skill === 'Full Mock Exams') {
      setActiveSkill(null);
    } else {
      onBack();
    }
  };

  const AudioPlayer = ({ compact = false }: { compact?: boolean }) => {
    if (!hasAudio) return null;
    return (
      <div id="tutorial-exam-audio-play" className={`flex flex-col sm:flex-row items-center gap-2 sm:gap-4 bg-indigo-50/90 border border-indigo-100 px-4 py-2 sm:py-2.5 rounded-2xl shadow-xs w-full ${compact ? 'max-w-xl' : 'max-w-2xl'}`}>
        <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
          <Headphones size={16} className="text-indigo-600 shrink-0" />
          <span className="text-xs sm:text-sm font-bold text-indigo-900 whitespace-nowrap">{audioLabel}</span>
        </div>
        <audio 
          controls 
          className="w-full h-8 outline-none flex-1" 
          src={currentAudioUrl}
          key={currentAudioUrl} // force reload on url change
        >
          Your browser does not support the audio element.
        </audio>
        {activeSkill.toLowerCase() === 'speaking' && (
          <div className="flex gap-1.5 shrink-0 self-end sm:self-auto">
            {speakingTrackIdx > 0 && (
              <button
                onClick={handlePrevSpeakingTrack}
                className="flex items-center gap-1 bg-white text-indigo-700 px-2.5 py-1 rounded-lg text-xs font-bold border border-indigo-200 hover:bg-indigo-50 transition-colors shadow-xs"
              >
                <ChevronLeft size={14} /> ก่อนหน้า
              </button>
            )}
            {speakingTrackIdx < SPEAKING_TRACKS.length - 1 && (
              <button
                onClick={handleNextSpeakingTrack}
                className="flex items-center gap-1 bg-indigo-600 text-white px-3 py-1 rounded-lg text-xs font-bold hover:bg-indigo-700 transition-colors shadow-xs"
              >
                ถัดไป <ChevronRight size={14} />
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  if (isFullscreen) {
    return createPortal(
      <div className="fixed inset-0 z-[999999] bg-gray-100 flex flex-col h-screen w-screen overflow-hidden">
        {/* Locked Top Tab Header — strictly locked at the top, nothing overlaps */}
        <header className="shrink-0 z-10 bg-white border-b border-gray-200 shadow-md px-4 sm:px-6 py-3 sm:py-4 flex flex-col md:flex-row md:items-center justify-between gap-3 pt-[max(env(safe-area-inset-top),20px)]">
          <div className="flex items-center justify-between w-full md:w-auto gap-3 min-w-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl shrink-0">
                <Headphones size={20} />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base font-bold text-gray-900 truncate">
                  {normalizedExamId.replace(/_/g, ' ')}
                </h2>
                <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-wide">
                  {activeSkill} (โหมดเต็มจอ)
                </span>
              </div>
            </div>

            {/* Mobile Exit Button on the top row */}
            <button 
              onClick={() => setIsFullscreen(false)} 
              title="ออกเต็มจอ"
              className="md:hidden flex items-center gap-1.5 px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl font-bold text-xs border border-rose-200 shadow-xs transition-colors shrink-0"
            >
              <X size={16} />
              <span>ออกเต็มจอ</span>
            </button>
          </div>

          {hasAudio && (
            <div className="w-full md:flex-1 md:max-w-xl md:mx-4">
              <AudioPlayer compact={true} />
            </div>
          )}

          {/* Desktop Exit Button */}
          <div className="hidden md:flex items-center gap-2 shrink-0">
            <button 
              onClick={() => setIsFullscreen(false)} 
              title="ออกเต็มจอ"
              className="flex items-center gap-1.5 px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl font-bold text-sm border border-rose-200 shadow-xs transition-colors"
            >
              <X size={18} />
              <span>ออกเต็มจอ</span>
            </button>
          </div>
        </header>

        {/* Main Document Content Area — completely below the locked top header */}
        <main className="flex-1 w-full overflow-hidden relative">
          <DocumentGallery 
            type="ielts" 
            folder={`${normalizedExamId}/${activeSkill.charAt(0).toUpperCase() + activeSkill.slice(1).toLowerCase()}_Full`}
            prefix="page" 
            enableAnnotation={true}
          />
        </main>
      </div>,
      document.body
    );
  }

  return (
    <div className="flex flex-col h-full w-full max-w-5xl mx-auto pb-10">
      <button 
        onClick={handleBack}
        className="flex items-center gap-2 text-indigo-600 font-medium hover:text-indigo-700 transition-colors mb-4 self-start"
      >
        <ChevronLeft size={20} /> ย้อนกลับ
      </button>
      
      <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-100 mb-6 flex flex-col items-center justify-between gap-4">
        <div className="w-full flex flex-col sm:flex-row justify-between sm:items-center gap-3 mb-1">
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">{normalizedExamId.replace(/_/g, ' ')}</h2>
            <p className="text-gray-500 text-xs sm:text-sm capitalize">โหมดฝึกทำข้อสอบ (Practice Mode) - {activeSkill}</p>
          </div>
          <button
            id="tutorial-exam-fullscreen-btn"
            onClick={() => setIsFullscreen(true)}
            className="flex items-center gap-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-colors shrink-0 self-start sm:self-auto shadow-xs"
          >
            <Maximize2 size={16} /> <span>ดูแบบเต็มจอ</span>
          </button>
        </div>
        
        {hasAudio && (
          <div className="w-full flex justify-center">
            <AudioPlayer />
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6 flex flex-col h-[500px] md:h-[800px] relative">
        <div className="flex-1 rounded-xl overflow-hidden border border-indigo-100 w-full h-full relative">
          <DocumentGallery 
            type="ielts" 
            folder={`${normalizedExamId}/${activeSkill.charAt(0).toUpperCase() + activeSkill.slice(1).toLowerCase()}_Full`}
            prefix="page" 
            enableAnnotation={true}
          />
        </div>
      </div>
    </div>
  );
}
