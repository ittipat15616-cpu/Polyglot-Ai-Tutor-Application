import React, { useState, useEffect, useRef } from 'react';
import { BookOpen, Eye, EyeOff, ChevronLeft, ChevronRight, Bookmark, Play } from 'lucide-react';
import { allCNVocab, allENVocab, VocabWord } from '../data/vocabData';
import AnnotationToolbar, { AnnotationState } from './AnnotationToolbar';
import AnnotatableArea from './AnnotatableArea';
import HanziWriter from 'hanzi-writer';
import { saveModuleBookmark, loadModuleBookmark, ModuleBookmark } from '../services/userPersistence';
import { auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';

interface VocabAreaProps {
  activeLang: 'EN' | 'CN' | 'TH';
  onAskAI?: (prompt: string) => void;
}

// HanziBox handles the loop or static display of the character using HanziWriter
const HanziBox = ({ 
  character, 
  size = 75, 
  playAnimation = true,
  isWatermark = false
}: { 
  character: string; 
  size?: number; 
  playAnimation?: boolean; 
  isWatermark?: boolean;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = '';
    
    let isComponentActive = true;
    let timerId: any = null;
    let writer: any = null;

    try {
      writer = HanziWriter.create(containerRef.current, character, {
        width: size,
        height: size,
        padding: isWatermark ? 15 : 5,
        strokeAnimationSpeed: 0.75,
        delayBetweenStrokes: 240,
        showOutline: true,
        strokeColor: isWatermark ? '#dc2626' : '#4f46e5', // Elegant reddish stroke watermark
        outlineColor: isWatermark ? '#e5e7eb' : '#f3f4f6', // Light gray outline matching flashcards
        charDataLoader: (char, onComplete, onFailure) => {
          fetch(`https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0/${encodeURIComponent(char)}.json`)
            .then(res => {
              if (!res.ok) throw new Error('Character data not found');
              return res.json();
            })
            .then(data => {
              if (isComponentActive) onComplete(data);
            })
            .catch(err => {
              if (isComponentActive) onFailure(err);
            });
        }
      });

      if (playAnimation) {
        const playLoop = () => {
          if (!isComponentActive || !writer) return;
          try {
            writer.animateCharacter({
              onComplete: () => {
                if (isComponentActive) {
                  timerId = setTimeout(playLoop, 2000); // Wait 2s and replay
                }
              }
            });
          } catch (e) {
            console.error("Animate character loop error", e);
          }
        };
        // Small delay before starting first animation
        timerId = setTimeout(playLoop, 600);
      } else {
        writer.showCharacter();
      }
    } catch (err) {
      console.error("HanziWriter failed", err);
    }

    return () => {
      isComponentActive = false;
      if (timerId) clearTimeout(timerId);
      if (writer) {
        try {
          writer.cancelAnimations();
        } catch (e) {}
      }
    };
  }, [character, size, playAnimation, isWatermark]);

  if (isWatermark) {
    return (
      <div 
        ref={containerRef} 
        className="absolute inset-0 w-full h-full flex items-center justify-center select-none pointer-events-none"
      />
    );
  }

  return (
    <div 
      ref={containerRef} 
      className="flex items-center justify-center border border-indigo-100 bg-white rounded-xl shadow-xs hover:shadow-sm transition-all relative overflow-hidden" 
      style={{ width: size, height: size }}
    />
  );
};

export default function VocabArea({ activeLang }: VocabAreaProps) {
  const [annotationState, setAnnotationState] = useState<AnnotationState>({
    activeTool: 'none',
    color: '#4f46e5', // default to elegant indigo instead of bright blue
    fontSize: 24,
    size: 4,
    fontFamily: 'Arial, sans-serif'
  });
  
  const [clearTrigger, setClearTrigger] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInputValue, setPageInputValue] = useState("1");
  const [levelFilter, setLevelFilter] = useState('ALL');
  
  // Box size for responsive watermark animations
  const [boxSize, setBoxSize] = useState(() => {
    if (typeof window === 'undefined') return 120;
    if (window.innerWidth >= 768) return 200;
    if (window.innerWidth >= 640) return 170;
    return 120;
  });

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setBoxSize(200);
      } else if (window.innerWidth >= 640) {
        setBoxSize(170);
      } else {
        setBoxSize(120);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Controls for hide/show toggles
  const [hideWord, setHideWord] = useState(false);
  const [hideReading, setHideReading] = useState(false);
  const [hideTranslation, setHideTranslation] = useState(false);
  const [hideWatermarkAnimation, setHideWatermarkAnimation] = useState(false);
  const [hideChineseChar, setHideChineseChar] = useState(false);
  const [hideEnglishChar, setHideEnglishChar] = useState(false);

  const lang = activeLang === 'CN' ? 'CN' : 'EN';
  const fullVocab = lang === 'CN' ? allCNVocab : allENVocab;
  
  const filteredVocab = levelFilter === 'ALL' 
    ? fullVocab 
    : fullVocab.filter(v => v.level === levelFilter);
    
  // Since we do 1 word per page
  const totalPages = filteredVocab.length;
  const word = filteredVocab[currentPage - 1];

  const [bookmark, setBookmark] = useState<ModuleBookmark | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, () => {
      loadModuleBookmark('handwriting', activeLang).then(b => setBookmark(b));
    });
    return () => unsubscribe();
  }, [activeLang]);

  // Sync filter or language changes
  useEffect(() => {
    setCurrentPage(1);
    setHideWord(false);
    setHideReading(false);
    setHideTranslation(false);
    setHideChineseChar(false);
    setHideEnglishChar(false);
  }, [levelFilter, activeLang]);

  // Removed auto-save: user requested manual pinning only.

  const restoreBookmark = () => {
    if (!bookmark || !bookmark.data) return;
    if (bookmark.data.levelFilter) setLevelFilter(bookmark.data.levelFilter);
    if (bookmark.data.currentPage) setCurrentPage(bookmark.data.currentPage);
  };

  // Sync currentPage change with text input
  useEffect(() => {
    setPageInputValue(currentPage.toString());
  }, [currentPage]);

  const handlePageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPageInputValue(e.target.value);
    const val = parseInt(e.target.value);
    if (!isNaN(val) && val >= 1 && val <= totalPages) {
      setCurrentPage(val);
    }
  };

  const handlePrev = () => {
    setCurrentPage(p => Math.max(1, p - 1));
  };

  const handleNext = () => {
    setCurrentPage(p => Math.min(totalPages, p + 1));
  };

  // Available levels for filter
  const levels = ['ALL', ...Array.from(new Set(fullVocab.map(v => v.level)))];

  // Get characters for Chinese word
  const chars = word ? Array.from(word.word) : [];

  const renderChineseGrid = () => {
    const maxBoxes = Math.max(12, chars.length); // At least 12 boxes for practice
    return (
      <div className="flex flex-wrap gap-4 sm:gap-6 justify-center items-center py-6 px-4 w-full h-full select-none pointer-events-none overflow-hidden">
        {Array.from({ length: maxBoxes }).map((_, idx) => {
          const char = chars[idx] || ''; // Empty string if index is beyond the word
          return (
            <div 
              key={idx} 
              className="w-[120px] h-[120px] sm:w-[170px] sm:h-[170px] md:w-[200px] md:h-[200px] bg-white border-2 border-red-200 relative shadow-xs rounded-2xl flex items-center justify-center shrink-0"
            >
              {/* 4 Intersecting Lines (dashed light red) */}
              <svg className="absolute inset-0 w-full h-full text-red-300/60" pointerEvents="none">
                {/* Horizontal line */}
                <line x1="0" y1="50%" x2="100%" y2="50%" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4" />
                {/* Vertical line */}
                <line x1="50%" y1="0" x2="50%" y2="100%" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4" />
                {/* Diagonal 1 */}
                <line x1="0" y1="0" x2="100%" y2="100%" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" />
                {/* Diagonal 2 */}
                <line x1="100%" y1="0" x2="0" y2="100%" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" />
              </svg>

              {/* Animated stroke-by-stroke watermark character */}
              {char && !hideChineseChar && (
                <HanziBox 
                  character={char} 
                  size={boxSize} 
                  playAnimation={!hideWatermarkAnimation} 
                  isWatermark={true} 
                />
              )}

              {/* Top-left label indicating character order */}
              {char && (
                <span className="absolute top-2 left-2 text-[10px] font-bold text-red-400 font-mono">
                  {idx + 1}
                </span>
              )}

              {/* Top-left eye toggle button for hiding Chinese character (outside the box) */}
              {char && (
                <button
                  type="button"
                  onClick={() => setHideChineseChar(!hideChineseChar)}
                  className="absolute -top-3 -left-3 p-1.5 bg-red-50 hover:bg-red-100 text-red-500 hover:text-red-700 border border-red-200 rounded-full transition-all pointer-events-auto shadow-sm z-10"
                  title={hideChineseChar ? "แสดงตัวอักษรจีน" : "ซ่อนตัวอักษรจีน"}
                >
                  {hideChineseChar ? <EyeOff size={12} /> : <Eye size={12} />}
                </button>
              )}

              {/* Top-right eye toggle button for animation */}
              {char && (
                <button
                  type="button"
                  onClick={() => setHideWatermarkAnimation(!hideWatermarkAnimation)}
                  className="absolute top-2 right-2 p-1 text-red-400 hover:text-red-600 bg-red-50 hover:bg-red-100 rounded-full transition-all pointer-events-auto shadow-xs z-10"
                  title={hideWatermarkAnimation ? "เปิดแอนิเมชัน" : "ปิดแอนิเมชัน"}
                >
                  {hideWatermarkAnimation ? <EyeOff size={12} /> : <Eye size={12} />}
                </button>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full w-full relative">
      
      {/* Floating Annotation Toolbar & Settings in a beautifully unified top bar */}
      <div className="fixed bottom-24 right-4 z-50 pointer-events-none flex flex-col items-end">
        <div className="pointer-events-auto flex flex-col items-end gap-2 max-w-full">
          <div className="flex flex-wrap items-center justify-center gap-2 p-1.5 bg-white/95 backdrop-blur-md border border-gray-200 shadow-xl rounded-2xl">
            <AnnotationToolbar
              state={annotationState}
              onChange={setAnnotationState}
              onClear={() => setClearTrigger(prev => prev + 1)}
            />
          </div>
          
          {/* Small Tab/Dropdown for Writing Settings right next to the tools */}
          <div id="tutorial-vocab-level-filter" className="flex items-center gap-1.5 px-2.5 py-1.5 bg-indigo-50/70 border border-indigo-100/50 rounded-xl shadow-lg">
            <span className="text-xs font-bold text-indigo-700 whitespace-nowrap">ระดับศัพท์:</span>
            <select 
              value={levelFilter}
              onChange={(e) => { setLevelFilter(e.target.value); }}
              className="bg-white hover:bg-gray-50 text-gray-800 text-xs font-bold py-1 px-2.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer shadow-2xs"
            >
              {levels.map(l => (
                <option key={l} value={l}>{l === 'ALL' ? 'ทั้งหมด' : l}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Content - Full width layout */}
      <div className="flex-1 overflow-y-auto pt-6 px-3 sm:px-6 pb-32 w-full">
        <div className="w-full max-w-7xl mx-auto flex flex-col gap-6">
          
          {/* Resume Progress Banner */}
          {currentPage === 1 && bookmark && bookmark.data && bookmark.data.currentPage > 1 && (
            <div className="bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 text-white p-4 sm:p-5 rounded-2xl shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in duration-300">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center shrink-0">
                  <Bookmark className="text-amber-300" size={22} />
                </div>
                <div>
                  <span className="text-xs text-indigo-200 font-bold uppercase tracking-wider">คัดต่อจากจุดเดิม ({activeLang === 'CN' ? 'ภาษาจีน' : 'ภาษาอังกฤษ'})</span>
                  <h4 className="text-base sm:text-lg font-bold text-white leading-tight">
                    {bookmark.title}
                  </h4>
                </div>
              </div>
              <button
                onClick={restoreBookmark}
                className="w-full sm:w-auto bg-amber-400 hover:bg-amber-300 text-indigo-950 font-bold px-5 py-2.5 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 text-sm shrink-0 hover:scale-105"
              >
                <Play size={16} fill="currentColor" />
                <span>คัดต่อทันที</span>
              </button>
            </div>
          )}

          {/* Practice Area (1 word per page) */}
          <div className="w-full flex flex-col gap-6">
            {word ? (
              <>
                {/* 1. Vocabulary card (Word definition & Reference) */}
                <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-sm border border-indigo-50 p-6 relative">
                  
                  {/* Filter / Meta info */}
                  <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-4">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-full uppercase tracking-wider">
                        ระดับ {word.level}
                      </span>
                      <button
                        onClick={() => {
                          const title = `คำที่ ${currentPage}: ${word.word} (ระดับ ${word.level})`;
                          const dataState = { currentPage, levelFilter };
                          saveModuleBookmark('handwriting', activeLang, title, dataState);
                          setBookmark({
                            module: 'handwriting',
                            lang: activeLang,
                            title,
                            data: dataState,
                            updatedAt: Date.now()
                          });
                        }}
                        className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all ${
                          bookmark?.data?.currentPage === currentPage
                            ? 'bg-amber-400 text-amber-950 shadow-sm'
                            : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
                        }`}
                        title="ปักหมุดคำนี้ไว้คัดต่อในอนาคต"
                      >
                        <Bookmark size={13} className={bookmark?.data?.currentPage === currentPage ? 'fill-amber-950' : ''} />
                        <span>{bookmark?.data?.currentPage === currentPage ? 'ปักหมุดคำนี้แล้ว 📌' : 'ปักหมุดคำนี้ไว้คัดต่อ 📌'}</span>
                      </button>
                    </div>
                    <div className="text-xs text-gray-400 font-medium">
                      คำศัพท์ลำดับที่ {currentPage} จาก {totalPages}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                    {/* Word Display with eye toggle */}
                    <div className="flex flex-col items-center p-3 rounded-xl bg-slate-50/50 relative border border-gray-100">
                      <div className="text-xs font-semibold text-gray-400 mb-1 flex items-center gap-1.5">
                        คำศัพท์
                        <button 
                          onClick={() => setHideWord(!hideWord)} 
                          className="text-gray-400 hover:text-indigo-600 transition-colors animate-pulse"
                          title={hideWord ? "แสดงคำศัพท์" : "ซ่อนคำศัพท์"}
                        >
                          {hideWord ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      </div>
                      <div className={`font-bold text-gray-900 transition-all duration-200 text-center select-all ${
                        hideWord ? 'blur-md select-none pointer-events-none' : ''
                      } ${lang === 'CN' ? 'text-4xl' : 'text-3xl'}`}>
                        {word.word}
                      </div>
                    </div>

                    {/* Reading/Pronunciation Display with eye toggle */}
                    <div className="flex flex-col items-center p-3 rounded-xl bg-slate-50/50 relative border border-gray-100">
                      <div className="text-xs font-semibold text-gray-400 mb-1 flex items-center gap-1.5">
                        คำอ่าน
                        <button 
                          onClick={() => setHideReading(!hideReading)} 
                          className="text-gray-400 hover:text-indigo-600 transition-colors animate-pulse"
                          title={hideReading ? "แสดงคำอ่าน" : "ซ่อนคำอ่าน"}
                        >
                          {hideReading ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      </div>
                      <div className={`text-lg font-semibold text-indigo-600 transition-all duration-200 text-center ${
                        hideReading ? 'blur-md select-none pointer-events-none' : ''
                      }`}>
                        {lang === 'CN' ? word.pinyin : word.phonetic}
                      </div>
                    </div>

                    {/* Translation Display with eye toggle */}
                    <div className="flex flex-col items-center p-3 rounded-xl bg-slate-50/50 relative border border-gray-100">
                      <div className="text-xs font-semibold text-gray-400 mb-1 flex items-center gap-1.5">
                        คำแปล
                        <button 
                          onClick={() => setHideTranslation(!hideTranslation)} 
                          className="text-gray-400 hover:text-indigo-600 transition-colors animate-pulse"
                          title={hideTranslation ? "แสดงคำแปล" : "ซ่อนคำแปล"}
                        >
                          {hideTranslation ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      </div>
                      <div className={`text-sm font-semibold text-gray-700 transition-all duration-200 text-center ${
                        hideTranslation ? 'blur-md select-none pointer-events-none' : ''
                      }`}>
                        {word.translations.join(', ')}
                      </div>
                    </div>
                  </div>


                </div>

                {/* 2. Spacious copybook writing canvas with AnnotatableArea */}
                <div id="tutorial-vocab-canvas-area" className="bg-white rounded-2xl shadow-sm border border-indigo-50 overflow-hidden flex flex-col">
                  {/* Toolbar title */}
                  <div className="bg-slate-50 border-b border-slate-100 px-6 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse"></span>
                      <span className="text-sm font-semibold text-gray-600">สมุดคัดอักษรและวาดเขียน (บันทึกรายคำศัพท์อัตโนมัติ)</span>
                    </div>
                    <div className="text-[11px] text-gray-400 hidden sm:block">
                      ลายมือเขียนจะผูกกับคำนี้ เมื่อกลับมาจะแสดงผลดังเดิม
                    </div>
                  </div>

                  {/* Wrapper for Canvas */}
                  <div className="w-full relative bg-white" style={{ height: lang === 'CN' ? '920px' : '550px' }}>
                    <AnnotatableArea
                      id={`vocab-word-${lang}-${word.id}`}
                      annotationState={annotationState}
                      clearTrigger={clearTrigger}
                      isActive={annotationState.activeTool !== 'none'}
                      className="w-full h-full"
                    >
                      {/* Grid background based on active language */}
                      <div className="absolute inset-0 pointer-events-none select-none overflow-hidden bg-white flex items-center justify-center">
                        {lang === 'CN' ? (
                          renderChineseGrid()
                        ) : (
                          <>
                            {/* 5 Black Guidelines & Watermark for English Practice */}
                            <div className="absolute inset-0 flex flex-col justify-center items-center px-6">
                              
                              {/* Guidelines card */}
                              <div className="relative w-full max-w-3xl h-[200px] sm:h-[240px] flex flex-col justify-between py-2 pointer-events-none">
                                {/* 5 Black lines */}
                                <div className="absolute inset-x-0 top-0 h-[2px] bg-black/60" />
                                <div className="absolute inset-x-0 top-[25%] h-[2px] bg-black/60" />
                                <div className="absolute inset-x-0 top-[50%] h-[2px] bg-black/60" />
                                <div className="absolute inset-x-0 top-[75%] h-[2px] bg-black/60" />
                                <div className="absolute inset-x-0 bottom-0 h-[2px] bg-black/60" />

                                {/* Background Watermark Word */}
                                {word && !hideEnglishChar && (
                                  <div className="absolute inset-0 flex items-center justify-center select-none pointer-events-none">
                                    <span className="text-gray-300/60 font-sans font-bold text-5xl sm:text-7xl md:text-8xl lg:text-9xl tracking-wider text-center max-w-full truncate px-4">
                                      {word.word}
                                    </span>
                                  </div>
                                )}
                              </div>

                              {/* Hide button for English word on the left of the writing lines */}
                              {word && (
                                <button
                                  id="toggle-english-watermark"
                                  type="button"
                                  onClick={() => setHideEnglishChar(!hideEnglishChar)}
                                  className="absolute left-4 sm:left-8 top-1/2 -translate-y-1/2 p-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded-full transition-all pointer-events-auto shadow-sm z-10 flex items-center justify-center"
                                  title={hideEnglishChar ? "แสดงคำตัวอย่างอังกฤษ" : "ซ่อนคำตัวอย่างอังกฤษ"}
                                >
                                  {hideEnglishChar ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </AnnotatableArea>
                  </div>
                </div>

                {/* 3. Pagination & Navigation Controls */}
                <div className="flex flex-row items-center justify-between w-full mt-2 gap-4">
                  <button 
                    onClick={handlePrev}
                    disabled={currentPage === 1}
                    className="flex-1 max-w-[140px] flex items-center justify-center py-2.5 px-4 rounded-xl bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-white transition-colors font-semibold border border-gray-100 shadow-xs"
                  >
                    <ChevronLeft size={18} className="mr-1" /> ก่อนหน้า
                  </button>
                  
                  <div className="text-sm font-semibold text-gray-500 flex items-center gap-1.5 bg-white px-3.5 py-2 rounded-xl border border-gray-100 shadow-xs">
                    <input 
                      type="number" 
                      min={1} 
                      max={totalPages}
                      value={pageInputValue}
                      onChange={handlePageInputChange}
                      className="w-12 text-center text-indigo-600 font-bold bg-transparent border-none focus:outline-none focus:ring-0 p-0"
                      style={{ MozAppearance: 'textfield' }}
                    />
                    <span className="text-gray-300">/</span>
                    <span className="text-gray-600">{totalPages}</span>
                  </div>

                  <button 
                    onClick={handleNext}
                    disabled={currentPage === totalPages}
                    className="flex-1 max-w-[140px] flex items-center justify-center py-2.5 px-4 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:hover:bg-indigo-600 transition-colors font-bold shadow-xs"
                  >
                    ถัดไป <ChevronRight size={18} className="ml-1" />
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center py-20 text-gray-500 bg-white/50 rounded-2xl border border-dashed border-gray-200">
                ไม่มีคำศัพท์ในหมวดหมู่นี้
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
