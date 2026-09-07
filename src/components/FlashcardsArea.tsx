import React, { useState, useEffect, useRef } from 'react';
import HanziWriter from 'hanzi-writer';
import { EyeOff, Eye, ChevronLeft, ChevronRight, Home, Bot, Volume2, CheckCircle2, XCircle, BookOpen, Layers, Play, BookmarkCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { saveFlashcardProgress, loadFlashcardProgress, loadLastFlashcardBookmark, saveFlashcardWordStates, loadFlashcardWordStates, FlashcardProgress } from '../services/userPersistence';
import GoodnotesMode from './GoodnotesMode';
import { loadAllGoodnotesStates } from '../services/userPersistence';
import { auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { mockHsk1Data } from '../data/hsk1Data';
import { hsk2Data } from '../data/hsk2Data';
import { hsk3Data } from '../data/hsk3Data';
import { hsk4Data } from '../data/hsk4Data';
import { hsk5Data } from '../data/hsk5Data';
import { hsk6Data } from '../data/hsk6Data';
import { hsk7to9Data } from '../data/hsk7to9Data';
import { cefrVocab } from '../data/cefrVocab';
import { cefrC2Vocab } from '../data/cefrC2Vocab';
import { ieltsData } from '../data/ieltsData';

const c2FlatData = Object.values(cefrC2Vocab).flat();
const ieltsKeys = Object.keys(ieltsData);
const ieltsPart1 = ieltsKeys.slice(0, 10).flatMap(key => (ieltsData as any)[key]);
const ieltsPart2 = ieltsKeys.slice(10, 20).flatMap(key => (ieltsData as any)[key]);

// HanziWordAnimation Component
function HanziWordAnimation({ word, isAnimating }: { word: string; isAnimating: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const writersRef = useRef<any[]>([]);

  useEffect(() => {
    if (!containerRef.current) return;

    // Clear previous
    containerRef.current.innerHTML = '';
    writersRef.current = [];

    const chars = Array.from(word);
    
    chars.forEach((char) => {
      // Only animate actual Chinese characters
      if (!/[\u4e00-\u9fa5]/.test(char)) {
        const charDiv = document.createElement('div');
        charDiv.style.width = '120px';
        charDiv.style.height = '120px';
        charDiv.className = 'flex-shrink-0 flex items-center justify-center text-[80px] font-bold text-gray-900 leading-none bg-white shadow-sm border border-gray-200';
        charDiv.innerText = char;
        containerRef.current?.appendChild(charDiv);
        return;
      }

      const charDiv = document.createElement('div');
      charDiv.style.width = '120px';
      charDiv.style.height = '120px';
      charDiv.className = 'flex-shrink-0 bg-white shadow-sm border border-gray-200 relative';
      charDiv.style.backgroundImage = 'linear-gradient(to right, transparent 49%, #fca5a5 49%, #fca5a5 51%, transparent 51%), linear-gradient(to bottom, transparent 49%, #fca5a5 49%, #fca5a5 51%, transparent 51%)';
      
      containerRef.current?.appendChild(charDiv);

      try {
        const writer = HanziWriter.create(charDiv, char, {
          width: 120,
          height: 120,
          padding: 5,
          showOutline: true,
          showCharacter: !isAnimating,
          outlineColor: '#e5e7eb',
          strokeColor: '#2563eb',
          radicalColor: '#2563eb',
          strokeAnimationSpeed: 0.6,
          delayBetweenStrokes: 200,
          charDataLoader: (char, onComplete, onFailure) => {
            fetch(`https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0/${encodeURIComponent(char)}.json`)
              .then(res => {
                if (!res.ok) throw new Error('Character data not found');
                return res.json();
              })
              .then(data => {
                onComplete(data);
              })
              .catch(err => {
                onFailure(err);
              });
          }
        });
        writersRef.current.push(writer);
      } catch(e) {
        console.error("Failed to render char: ", char, e);
      }
    });

    if (!isAnimating) {
      return;
    }

    let isCancelled = false;
    const animateAll = async () => {
      while (!isCancelled) {
        for (const writer of writersRef.current) {
          if (isCancelled) break;
          writer.hideCharacter();
          await new Promise<void>((resolve) => {
             writer.animateCharacter({
               onComplete: () => { setTimeout(resolve, 200); }
             });
          });
        }
        if (isCancelled) break;
        await new Promise(r => setTimeout(r, 1500));
      }
    };

    setTimeout(animateAll, 500);

    return () => {
      isCancelled = true;
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [word, isAnimating]);

  return (
    <div ref={containerRef} className="flex flex-row flex-wrap justify-center items-center gap-2 min-h-[120px]" />
  );
}

type ViewTabMode = 'all' | 'review' | 'mastered';

function FlashcardPlayer({ 
  level, 
  allLevelVocab, 
  onBack, 
  lang, 
  onAskAI 
}: { 
  level: string, 
  allLevelVocab: any[], 
  onBack: () => void, 
  lang: string, 
  onAskAI?: (word: string) => void 
}) {
  const [viewTab, setViewTab] = useState<ViewTabMode>('all');
  const [tabIndices, setTabIndices] = useState<Record<ViewTabMode, number>>({
    all: 0,
    review: 0,
    mastered: 0
  });
  const currentIndex = tabIndices[viewTab] || 0;
  
  const setCurrentIndex = (val: number | ((prev: number) => number)) => {
    setTabIndices(prev => {
      const prevIdx = prev[viewTab];
      const nextIdx = typeof val === 'function' ? val(prevIdx) : val;
      return { ...prev, [viewTab]: nextIdx };
    });
  };

  const [isInitialized, setIsInitialized] = useState(false);
  const [slideDir, setSlideDir] = useState<'next' | 'prev'>('next');
  const [hasInteracted, setHasInteracted] = useState(false);
  const [hidePinyin, setHidePinyin] = useState(false);
  const [hideTranslation, setHideTranslation] = useState(false);
  const [hideAnimation, setHideAnimation] = useState(false);
  const [hideWord, setHideWord] = useState(false);
  const [inputValue, setInputValue] = useState("1");
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Persistence State
  const [masteredWords, setMasteredWords] = useState<Record<string, boolean>>({});
  const [reviewWords, setReviewWords] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let isMounted = true;
    async function initWordStates() {
      const { mastered, review } = await loadFlashcardWordStates();
      if (isMounted) {
        setMasteredWords(mastered);
        setReviewWords(review);
      }
    }
    initWordStates();
    return () => { isMounted = false; };
  }, [level, lang]);

  // Unique Key for word
  const getWordKey = (item: any) => `${level}_${item.word}`;

  // Filtered Vocabulary Lists
  const reviewList = allLevelVocab.filter(item => !!reviewWords[getWordKey(item)]);
  const masteredList = allLevelVocab.filter(item => !!masteredWords[getWordKey(item)]);

  let activeVocabList = allLevelVocab;
  if (viewTab === 'review') activeVocabList = reviewList;
  if (viewTab === 'mastered') activeVocabList = masteredList;

  // Load saved level progress on mount
  useEffect(() => {
    let isMounted = true;
    async function initProgress() {
      const saved = await loadFlashcardProgress(level, lang);
      if (saved && isMounted && saved.currentIndex < allLevelVocab.length) {
        setTabIndices(prev => ({ ...prev, all: saved.currentIndex }));
      }
      if (isMounted) setIsInitialized(true);
    }
    initProgress();
    return () => { isMounted = false; };
  }, [level, lang, allLevelVocab.length]);

  // Auto-save progress whenever card index changes
  useEffect(() => {
    if (isInitialized && hasInteracted && allLevelVocab.length > 0 && viewTab === 'all') {
      saveFlashcardProgress(level, lang, currentIndex, allLevelVocab.length);
    }
  }, [currentIndex, level, lang, allLevelVocab.length, isInitialized, hasInteracted, viewTab]);

  useEffect(() => {
    setInputValue((currentIndex + 1).toString());
  }, [currentIndex]);

  const currentWord = activeVocabList[currentIndex] || activeVocabList[0];

  useEffect(() => {
    // Clamp the current index if the active list shrinks
    if (activeVocabList.length > 0 && currentIndex >= activeVocabList.length) {
      setCurrentIndex(activeVocabList.length - 1);
    }
  }, [activeVocabList.length, currentIndex]);

  const toggleMastered = (item: any) => {
    setHasInteracted(true);
    const key = getWordKey(item);
    const nextMastered = { ...masteredWords };
    const nextReview = { ...reviewWords };

    if (nextMastered[key]) {
      delete nextMastered[key];
    } else {
      nextMastered[key] = true;
      delete nextReview[key];
    }

    setMasteredWords(nextMastered);
    setReviewWords(nextReview);
    saveFlashcardWordStates(nextMastered, nextReview);
  };

  const toggleReview = (item: any) => {
    setHasInteracted(true);
    const key = getWordKey(item);
    const nextMastered = { ...masteredWords };
    const nextReview = { ...reviewWords };

    if (nextReview[key]) {
      delete nextReview[key];
    } else {
      nextReview[key] = true;
      delete nextMastered[key];
    }

    setMasteredWords(nextMastered);
    setReviewWords(nextReview);
    saveFlashcardWordStates(nextMastered, nextReview);
  };

  const speakWord = async (wordText: string) => {
    setHasInteracted(true);
    if (!wordText) return;
    setIsPlayingAudio(true);

    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
    }
    if (audioRef.current) {
      try {
        audioRef.current.pause();
      } catch (e) {}
    }

    try {
      const reqBody: any = { text: wordText, lang: lang === 'CN' ? 'CN' : 'EN' };
      if (lang !== 'CN') {
        reqBody.voice = 'en-US-ChristopherNeural';
      }
      const response = await fetch('/api/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody)
      });
      const data = await response.json();
      if (data.audio) {
        const audio = new Audio(`data:audio/mp3;base64,${data.audio}`);
        audioRef.current = audio;
        audio.onended = () => setIsPlayingAudio(false);
        audio.onerror = () => setIsPlayingAudio(false);
        audio.play().catch(e => {
          console.warn('Audio play prevented by browser, using fallback:', e);
          playLocalFallback(wordText);
        });
        return;
      } else {
        throw new Error('No audio data received');
      }
    } catch (e) {
      console.error('TTS error', e);
      playLocalFallback(wordText);
    }
  };

  const playLocalFallback = (text: string) => {
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang === 'CN' ? 'zh-CN' : 'en-US';
        if (lang !== 'CN') {
          const voices = window.speechSynthesis.getVoices();
          const maleVoice = voices.find(v => 
            v.lang.startsWith('en') && (
              v.name.toLowerCase().includes('male') || 
              v.name.toLowerCase().includes('david') || 
              v.name.toLowerCase().includes('george') || 
              v.name.toLowerCase().includes('james') || 
              v.name.toLowerCase().includes('alex') || 
              v.name.toLowerCase().includes('daniel') ||
              v.name.toLowerCase().includes('guy') ||
              v.name.toLowerCase().includes('natural')
            )
          );
          if (maleVoice) utterance.voice = maleVoice;
        }
        utterance.onend = () => setIsPlayingAudio(false);
        utterance.onerror = () => setIsPlayingAudio(false);
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.error('Fallback speech synthesis failed', err);
        setIsPlayingAudio(false);
      }
    } else {
      setIsPlayingAudio(false);
    }
  };

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        try {
          audioRef.current.pause();
        } catch (e) {}
      }
      if ('speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
        } catch (e) {}
      }
    };
  }, []);

  const handleNext = () => {
    setHasInteracted(true);
    setSlideDir('next');
    setCurrentIndex((prev) => (prev < activeVocabList.length - 1 ? prev + 1 : prev));
  };

  const handlePrev = () => {
    setHasInteracted(true);
    setSlideDir('prev');
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : prev));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setHasInteracted(true);
    setInputValue(e.target.value);
    const val = parseInt(e.target.value);
    if (!isNaN(val) && val >= 1 && val <= activeVocabList.length) {
      setCurrentIndex(val - 1);
    }
  };

  return (
    <div className="flex flex-col items-center h-full relative p-4 max-w-3xl mx-auto w-full">
      {/* Top Header & View Switcher Bar */}
      <div className="w-full mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 px-3.5 py-2 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors font-medium border border-gray-200 shadow-sm bg-white self-start"
        >
          <Home size={18} /> เลือกระดับใหม่
        </button>

        {/* TOP-RIGHT VIEW SWITCHER (Outside Flashcard) */}
        <div className="flex items-center gap-1.5 bg-gray-100 p-1.5 rounded-2xl border border-gray-200 shadow-xs self-center md:self-auto">
          <button
            id="tutorial-flashcard-tab-all"
            onClick={() => setViewTab('all')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs md:text-sm font-bold transition-all ${
              viewTab === 'all'
                ? 'bg-white text-indigo-700 shadow-sm border border-indigo-100'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <BookOpen size={16} />
            <span>ทั้งหมด</span>
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-indigo-50 text-indigo-600 font-semibold">
              {allLevelVocab.length}
            </span>
          </button>

          <button
            id="tutorial-flashcard-tab-unlearned"
            onClick={() => setViewTab('review')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs md:text-sm font-bold transition-all ${
              viewTab === 'review'
                ? 'bg-white text-red-600 shadow-sm border border-red-100'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <XCircle size={16} className="text-red-500" />
            <span>ยังจำไม่ได้</span>
            <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
              reviewList.length > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-200 text-gray-600'
            }`}>
              {reviewList.length}
            </span>
          </button>

          <button
            id="tutorial-flashcard-tab-learned"
            onClick={() => setViewTab('mastered')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs md:text-sm font-bold transition-all ${
              viewTab === 'mastered'
                ? 'bg-white text-emerald-700 shadow-sm border border-emerald-100'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <CheckCircle2 size={16} className="text-emerald-500" />
            <span>จำได้แล้ว</span>
            <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
              masteredList.length > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'
            }`}>
              {masteredList.length}
            </span>
          </button>
        </div>
      </div>

      {/* Main Flashcard Container or Empty State */}
      {activeVocabList.length === 0 ? (
        <div className="w-full bg-white rounded-3xl shadow-sm border border-gray-100 p-12 flex flex-col items-center justify-center min-h-[360px] text-center">
          {viewTab === 'review' ? (
            <>
              <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4 border border-emerald-100">
                <CheckCircle2 size={36} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">ไม่มีคำศัพท์ที่ยังจำไม่ได้ในระดับนี้</h3>
              <p className="text-gray-500 max-w-md">คุณสุดยอดมาก! เมื่อคุณกดปุ่ม "ยังจำไม่ได้" บนการ์ดใดๆ คำศัพท์จะถูกเพิ่มเข้ามาทบทวนในหน้านี้โดยอัตโนมัติ</p>
            </>
          ) : viewTab === 'mastered' ? (
            <>
              <div className="w-16 h-16 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4 border border-indigo-100">
                <BookOpen size={36} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">ยังไม่มีคำศัพท์ที่บันทึกว่าจำได้แล้ว</h3>
              <p className="text-gray-500 max-w-md">ขณะท่องจำแฟลชการ์ด สามารถกดปุ่ม "จำได้แล้ว" บนการ์ด เพื่อบันทึกคำศัพท์เข้าสู่หน้านี้ได้ทันที</p>
            </>
          ) : (
            <>
              <h3 className="text-xl font-bold text-gray-900 mb-2">ไม่พบข้อมูลคำศัพท์ในระดับ {level}</h3>
            </>
          )}
        </div>
      ) : (
        <>
          {/* Header Info */}
          <div className="w-full flex items-center justify-between mb-3 px-2">
            <span className="text-xs font-bold px-3 py-1 bg-indigo-50 text-indigo-700 rounded-lg border border-indigo-100">
              แฟลชการ์ด {level} {viewTab === 'review' ? '• โหมดทบทวน' : viewTab === 'mastered' ? '• โหมดจำได้แล้ว' : ''}
            </span>
            <p className="text-sm font-semibold text-gray-500">
              คำศัพท์ที่ <span className="text-indigo-600 font-bold">{currentIndex + 1}</span> / {activeVocabList.length}
            </p>
          </div>

          {/* THE FLASHCARD ELEMENT */}
          <div className="w-full bg-white rounded-3xl shadow-sm border border-gray-100 flex flex-col items-center justify-center min-h-[420px] relative overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentIndex}
                initial={{ opacity: 0, x: slideDir === 'next' ? 40 : -40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: slideDir === 'next' ? -40 : 40 }}
                transition={{ duration: 0.15 }}
                className="w-full flex-1 flex flex-col items-center justify-center p-8 absolute inset-0"
              >
            
            {/* Ask AI Button */}
            <button 
              onClick={() => onAskAI?.(currentWord.word)}
              className="absolute top-4 left-4 p-2 bg-purple-50 text-purple-600 rounded-full hover:bg-purple-600 hover:text-white transition-colors"
              title="ถามติวเตอร์ AI"
            >
              <Bot size={20} />
            </button>

            {/* SAVE BUTTONS: "ยังจำไม่ได้" & "จำได้แล้ว" (SAVE ONLY - DOES NOT GO TO NEXT CARD) */}
            <div className="absolute top-4 right-4 flex items-center gap-2">
              <button
                id="tutorial-flashcard-dont-know"
                onClick={() => toggleReview(currentWord)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                  reviewWords[getWordKey(currentWord)]
                    ? 'bg-red-500 text-white border-red-600 shadow-sm scale-105'
                    : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                }`}
                title="กดเพื่อบันทึกคำนี้ว่ายังจำไม่ได้ (อยู่หน้าเดิม)"
              >
                <XCircle size={15} />
                <span>{reviewWords[getWordKey(currentWord)] ? 'ยังจำไม่ได้ (บันทึกแล้ว)' : 'ยังจำไม่ได้'}</span>
              </button>

              <button
                id={masteredWords[getWordKey(currentWord)] ? 'tutorial-flashcard-unmark-learned' : 'tutorial-flashcard-know'}
                onClick={() => toggleMastered(currentWord)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                  masteredWords[getWordKey(currentWord)]
                    ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm scale-105'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                }`}
                title="กดเพื่อบันทึกคำนี้ว่าจำได้แล้ว (อยู่หน้าเดิม)"
              >
                <CheckCircle2 size={15} />
                <span>{masteredWords[getWordKey(currentWord)] ? 'จำได้แล้ว (บันทึกแล้ว)' : 'จำได้แล้ว'}</span>
              </button>
            </div>
            
            {/* Phonetic / Pinyin Section */}
            <div className="w-full relative flex justify-center mb-6 min-h-[48px] items-center gap-3 mt-4">
              {!hidePinyin && (
                <p className="text-2xl font-medium text-indigo-600 font-mono tracking-wide">
                  {lang === 'EN' ? currentWord.phonetic : currentWord.pinyin}
                </p>
              )}
              <button
                id="tutorial-word-audio-1"
                onClick={() => speakWord(currentWord.word)}
                className="w-10 h-10 sm:w-12 sm:h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center shrink-0 hover:bg-indigo-600 hover:text-white transition-all shadow-sm hover:scale-105 active:scale-95 cursor-pointer border border-indigo-100"
                title="ฟังเสียงคำศัพท์"
              >
                <Volume2 size={20} className={isPlayingAudio ? 'animate-pulse' : ''} />
              </button>
              <button 
                id={hidePinyin ? (lang === 'CN' ? 'tutorial-flashcard-cn-show-pinyin' : 'tutorial-flashcard-show-phonetic') : (lang === 'CN' ? 'tutorial-flashcard-cn-hide-pinyin' : 'tutorial-flashcard-hide-phonetic')}
                onClick={() => setHidePinyin(!hidePinyin)}
                className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                title={lang === 'EN' ? "ซ่อน/แสดงคำอ่าน" : "ซ่อน/แสดงพินอิน"}
              >
                {hidePinyin ? <Eye size={20} /> : <EyeOff size={20} />}
              </button>
            </div>

            {/* Word / Character Section */}
            <div className="w-full relative flex justify-center py-6 my-4 border-y border-gray-50 min-h-[160px]">
              {lang === 'CN' ? (
                <>
                  {!hideWord ? (
                    <HanziWordAnimation word={currentWord.word} isAnimating={!hideAnimation} />
                  ) : (
                    <div className="min-h-[120px]" />
                  )}
                  <button 
                    id={hideWord ? 'tutorial-flashcard-cn-show-word' : 'tutorial-flashcard-cn-hide-word'}
                    onClick={() => setHideWord(!hideWord)}
                    className="absolute left-0 top-2 text-gray-400 hover:text-gray-600 p-1 bg-white rounded-full shadow-sm z-10"
                    title={hideWord ? "แสดงตัวอักษรจีน" : "ซ่อนตัวอักษรจีน"}
                  >
                    {hideWord ? <Eye size={20} /> : <EyeOff size={20} />}
                  </button>
                  <button 
                    id={hideAnimation ? 'tutorial-flashcard-cn-show-anim' : 'tutorial-flashcard-cn-hide-anim'}
                    onClick={() => setHideAnimation(!hideAnimation)}
                    className="absolute right-0 top-2 text-gray-400 hover:text-gray-600 p-1 bg-white rounded-full shadow-sm z-10"
                    title="ซ่อน/แสดงอนิเมชั่น"
                  >
                    {hideAnimation ? <Eye size={20} /> : <EyeOff size={20} />}
                  </button>
                </>
              ) : (
                <>
                  {!hideWord ? (
                    <div className="flex flex-col justify-center items-center min-h-[120px] px-8">
                      <div 
                        onClick={() => speakWord(currentWord.word)}
                        className="text-[60px] md:text-[80px] font-bold text-gray-900 leading-none select-text text-center break-words max-w-full cursor-pointer hover:text-indigo-600 transition-colors"
                        title="กดเพื่อฟังเสียงคำศัพท์"
                      >
                        {currentWord.word}
                      </div>
                    </div>
                  ) : (
                    <div className="min-h-[120px]" />
                  )}
                  <button 
                    id={hideWord ? 'tutorial-flashcard-show-word' : 'tutorial-flashcard-hide-word'}
                    onClick={() => setHideWord(!hideWord)}
                    className="absolute right-0 top-2 text-gray-400 hover:text-gray-600 p-1 bg-white rounded-full shadow-sm z-10"
                    title={hideWord ? "แสดงคำศัพท์ภาษาอังกฤษ" : "ซ่อนคำศัพท์ภาษาอังกฤษ"}
                  >
                    {hideWord ? <Eye size={20} /> : <EyeOff size={20} />}
                  </button>
                </>
              )}
            </div>

            {/* Translation Section */}
            <div className="w-full relative flex justify-center mt-6 min-h-[80px]">
              {!hideTranslation ? (
                <div className="text-center px-8">
                  <p className="text-xl font-bold text-gray-800 mb-1">{currentWord.th}</p>
                  {lang === 'EN' && currentWord.type && (
                    <p className="text-sm text-indigo-500 font-medium mb-1">({currentWord.type})</p>
                  )}
                </div>
              ) : (
                <div className="w-32 h-12"></div>
              )}
              <button 
                id={hideTranslation ? (lang === 'CN' ? 'tutorial-flashcard-cn-show-meaning' : 'tutorial-flashcard-show-meaning') : (lang === 'CN' ? 'tutorial-flashcard-cn-hide-meaning' : 'tutorial-flashcard-hide-meaning')}
                onClick={() => setHideTranslation(!hideTranslation)}
                className="absolute right-0 top-0 text-gray-400 hover:text-gray-600 p-1.5 bg-white rounded-full shadow-xs z-10"
                title="ซ่อน/แสดงคำแปล"
              >
                {hideTranslation ? <Eye size={20} /> : <EyeOff size={20} />}
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
          {/* Navigation Controls (Separate from Save Status Buttons) */}
          <div className="flex flex-row items-center justify-between w-full mt-6 gap-4">
            <button 
              onClick={handlePrev}
              disabled={currentIndex === 0}
              className="flex-1 max-w-[150px] flex items-center justify-center py-3 px-4 rounded-2xl bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-white transition-colors font-bold border border-gray-200 shadow-sm"
            >
              <ChevronLeft size={20} className="mr-1" /> ก่อนหน้า
            </button>
            
            <div id="tutorial-flashcard-jump-index" className="text-sm font-medium text-gray-500 flex items-center gap-1 bg-white px-3 py-1.5 rounded-xl border border-gray-200 shadow-sm">
              <input 
                type="number" 
                min={1} 
                max={activeVocabList.length}
                value={inputValue}
                onChange={handleInputChange}
                className="w-16 text-center text-gray-900 font-bold bg-transparent border-none appearance-none focus:outline-none focus:ring-0"
                style={{ MozAppearance: 'textfield' }}
              />
              <span className="text-gray-400">/</span>
              <span className="text-gray-700">{activeVocabList.length}</span>
            </div>

            <button 
              onClick={handleNext}
              disabled={currentIndex === activeVocabList.length - 1}
              className="flex-1 max-w-[150px] flex items-center justify-center py-3 px-4 rounded-2xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:hover:bg-indigo-600 transition-colors font-bold shadow-sm"
            >
              ถัดไป <ChevronRight size={20} className="ml-1" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function FlashcardsArea({ activeLang, onAskAI }: { activeLang: string, onAskAI?: (word: string) => void }) {
  const [selectedLevel, setSelectedLevel] = useState<string | null>(null);
  const [isGoodnotesMode, setIsGoodnotesMode] = useState<boolean>(false);
  const [lastBookmark, setLastBookmark] = useState<FlashcardProgress | null>(null);
  const [gnReminder, setGnReminder] = useState<{type: 'resume'|'review'|'next', level: string, deckIndex: number} | null>(null);
  const [directLaunch, setDirectLaunch] = useState<{deckIndex: number, mode: 'resume'|'review'|'next'} | null>(null);

  useEffect(() => {
    let isMounted = true;
    const unsubscribe = onAuthStateChanged(auth, async () => {
      if (activeLang) {
        const bm = await loadLastFlashcardBookmark(activeLang);
        if (isMounted) setLastBookmark(bm);
      }
    });
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [selectedLevel, activeLang]);

  useEffect(() => {
    setSelectedLevel(null);
    setDirectLaunch(null);
  }, [activeLang]);

  useEffect(() => {
    if (isGoodnotesMode && !selectedLevel) {
      let isMounted = true;
      loadAllGoodnotesStates(activeLang).then(states => {
        if (!isMounted) return;
        if (states.length === 0) {
          setGnReminder(null);
          return;
        }
        
        states.sort((a, b) => b.updatedAt - a.updatedAt);
        const latest = states[0];
        
        let type: 'resume'|'review'|'next' | null = null;
        let deckIndex = latest.deckIndex;
        
        if (latest.currentIndex > 0 && !latest.isCompleted) {
          type = 'resume';
        } else if (latest.isCompleted && latest.reviewKeys && latest.reviewKeys.length > 0) {
          type = 'review';
        } else if (latest.isCompleted && (!latest.reviewKeys || latest.reviewKeys.length === 0)) {
          type = 'next';
          deckIndex = latest.deckIndex + 1; // Assuming they should move to the next deck
        }
        
        if (type) {
          setGnReminder({ type, level: latest.level, deckIndex });
        } else {
          setGnReminder(null);
        }
      });
      return () => { isMounted = false; };
    }
  }, [isGoodnotesMode, activeLang, selectedLevel]);

  if (activeLang !== 'CN' && activeLang !== 'EN') {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[50vh] p-6 max-w-4xl mx-auto w-full">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">แฟลชการ์ด</h2>
        <p className="text-gray-500">ระบบแฟลชการ์ดรองรับเฉพาะภาษาจีนและภาษาอังกฤษในขณะนี้</p>
      </div>
    );
  }

  let levels: { id: string, data: any[], color: string }[] = [];

  if (activeLang === 'CN') {
    levels = [
      { id: 'HSK 1', data: mockHsk1Data, color: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100 hover:border-red-300 ring-red-400' },
      { id: 'HSK 2', data: hsk2Data, color: 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100 hover:border-orange-300 ring-orange-400' },
      { id: 'HSK 3', data: hsk3Data, color: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 hover:border-amber-300 ring-amber-400' },
      { id: 'HSK 4', data: hsk4Data, color: 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100 hover:border-green-300 ring-green-400' },
      { id: 'HSK 5', data: hsk5Data, color: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 hover:border-blue-300 ring-blue-400' },
      { id: 'HSK 6', data: hsk6Data, color: 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 hover:border-indigo-300 ring-indigo-400' },
      { id: 'HSK 7-9', data: hsk7to9Data, color: 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100 hover:border-purple-300 ring-purple-400' },
    ];
  } else if (activeLang === 'EN') {
    levels = [
      { id: 'CEFR A1', data: cefrVocab['A1'] || [], color: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 hover:border-blue-300 ring-blue-400' },
      { id: 'CEFR A2', data: cefrVocab['A2'] || [], color: 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100 hover:border-green-300 ring-green-400' },
      { id: 'CEFR B1', data: cefrVocab['B1'] || [], color: 'bg-yellow-50 text-yellow-700 border-yellow-200 hover:bg-yellow-100 hover:border-yellow-300 ring-yellow-400' },
      { id: 'CEFR B2', data: cefrVocab['B2'] || [], color: 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100 hover:border-orange-300 ring-orange-400' },
      { id: 'CEFR C1', data: cefrVocab['C1'] || [], color: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100 hover:border-red-300 ring-red-400' },
      { id: 'CEFR C2', data: c2FlatData, color: 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100 hover:border-purple-300 ring-purple-400' },
      { id: 'IELTS Part 1', data: ieltsPart1, color: 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 hover:border-indigo-300 ring-indigo-400' },
      { id: 'IELTS Part 2', data: ieltsPart2, color: 'bg-pink-50 text-pink-700 border-pink-200 hover:bg-pink-100 hover:border-pink-300 ring-pink-400' },
    ].filter(l => l.data.length > 0);
  }

  if (!selectedLevel) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[50vh] p-6 max-w-4xl mx-auto w-full">
        {!isGoodnotesMode && lastBookmark && (
          <div className="w-full bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700 text-white rounded-3xl p-6 mb-8 flex flex-col sm:flex-row items-center justify-between shadow-xl border border-indigo-400/30 gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-md">
                <BookmarkCheck size={28} className="text-amber-300" />
              </div>
              <div>
                <div className="text-xs text-indigo-200 font-bold uppercase tracking-wider">เรียนค้างไว้ล่าสุด (บันทึกลงบัญชีอัตโนมัติ)</div>
                <div className="text-xl font-black">{lastBookmark.level} — คำที่ {lastBookmark.currentIndex + 1} / {lastBookmark.totalCards}</div>
              </div>
            </div>
            <button
              onClick={() => setSelectedLevel(lastBookmark.level)}
              className="w-full sm:w-auto px-6 py-3 bg-white text-indigo-700 font-extrabold rounded-2xl shadow-lg hover:bg-amber-300 hover:text-slate-950 transition-all flex items-center justify-center gap-2 text-sm hover:scale-105 active:scale-95 shrink-0"
            >
              <Play size={18} /> เรียนต่อจุดเดิมทันที
            </button>
          </div>
        )}
        <div className="w-full flex justify-end mb-4">
          <button
            onClick={() => setIsGoodnotesMode(!isGoodnotesMode)}
            className={`px-4 py-2 rounded-xl font-bold border transition-colors shadow-sm flex items-center gap-2 ${isGoodnotesMode ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}
          >
            {isGoodnotesMode ? <CheckCircle2 size={18} /> : <div className="w-[18px] h-[18px] rounded-full border-2 border-gray-400"></div>}
            เปิดใช้ Goodnotes Mode
          </button>
        </div>
        {isGoodnotesMode && gnReminder && (
          <div className="w-full bg-amber-50 text-amber-800 border border-amber-200 rounded-3xl p-6 mb-8 flex flex-col sm:flex-row items-center justify-between shadow-xl gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/50 rounded-2xl">
                <BookmarkCheck size={28} className="text-amber-500" />
              </div>
              <div>
                <div className="text-xs text-amber-700 font-bold uppercase tracking-wider">แจ้งเตือน Goodnote Mode</div>
                <div className="text-lg font-bold">
                  {gnReminder.type === 'resume' && `ปัดต่อจากจุดเดิม ในระดับ ${gnReminder.level} ด่านที่ ${gnReminder.deckIndex + 1}`}
                  {gnReminder.type === 'review' && `ทบทวนคำที่ยังจำไม่ได้ ในระดับ ${gnReminder.level} ด่านที่ ${gnReminder.deckIndex + 1}`}
                  {gnReminder.type === 'next' && `ดูแฟลชการ์ดด่านถัดไป ในระดับ ${gnReminder.level} ด่านที่ ${gnReminder.deckIndex + 1}`}
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                setDirectLaunch({ deckIndex: gnReminder.deckIndex, mode: gnReminder.type });
                setSelectedLevel(gnReminder.level);
              }}
              className="w-full sm:w-auto px-6 py-3 bg-amber-500 text-white font-extrabold rounded-2xl shadow-lg hover:bg-amber-600 transition-all flex items-center justify-center gap-2 text-sm hover:scale-105 active:scale-95 shrink-0"
            >
              <Play size={18} /> {gnReminder.type === 'resume' ? 'เรียนต่อ' : gnReminder.type === 'next' ? 'ด่านถัดไป' : 'ไปทบทวน'}
            </button>
          </div>
        )}
        <h2 className="text-3xl font-bold text-gray-900 mb-8 pb-3 border-b-2 border-indigo-500 inline-block px-12">
          {activeLang === 'CN' ? 'เลือกระดับ HSK' : 'เลือกระดับ CEFR / IELTS'}
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 w-full">
           {levels.map(level => (
             <button
               key={level.id}
               id={level.id.includes('HSK 1') ? 'tutorial-flashcard-hsk1' : (level.id.includes('A1') ? 'tutorial-flashcard-cefr1' : undefined)}
               onClick={() => setSelectedLevel(level.id)}
               className={`py-8 px-4 rounded-3xl border-2 font-bold text-xl transition-all duration-200 transform hover:scale-[1.02] active:scale-95 shadow-sm flex flex-col items-center justify-center ${level.color} focus:outline-none focus:ring-4`}
             >
                <span>{level.id}</span>
                <span className="text-sm font-medium mt-1 opacity-80">{level.data.length} คำศัพท์</span>
             </button>
           ))}
        </div>
      </div>
    );
  }

  const selectedLevelData = levels.find(l => l.id === selectedLevel)?.data || [];

  if (isGoodnotesMode) {
    return (
      <GoodnotesMode
        level={selectedLevel}
        lang={activeLang}
        allLevelVocab={selectedLevelData}
        onBack={() => { setSelectedLevel(null); setDirectLaunch(null); }}
        directLaunch={directLaunch}
      />
    );
  }

  return (
    <FlashcardPlayer 
      lang={activeLang}
      level={selectedLevel} 
      allLevelVocab={selectedLevelData} 
      onBack={() => setSelectedLevel(null)} 
      onAskAI={onAskAI}
    />
  );
}
