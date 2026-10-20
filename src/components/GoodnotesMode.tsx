import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, useAnimation, PanInfo } from 'motion/react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { ChevronLeft, Home, Play, RotateCcw, ArrowRight, Volume2, CheckCircle2, XCircle, PenTool, Bot } from 'lucide-react';
import { GoodnotesDeckState, loadGoodnotesDeckState, saveGoodnotesDeckState } from '../services/userPersistence';
import HanziWriter from 'hanzi-writer';
import { useRef } from 'react';

// Utils
function getDecks(totalLength: number) {
  const decks = [];
  let currentStart = 0;
  while (currentStart < totalLength) {
    const remaining = totalLength - currentStart;
    if (remaining <= 75) {
      decks.push({ start: currentStart, end: currentStart + remaining - 1 });
      break;
    } else {
      decks.push({ start: currentStart, end: currentStart + 49 });
      currentStart += 50;
    }
  }
  return decks;
}

export default function GoodnotesMode({
  level,
  lang,
  allLevelVocab,
  onBack,
  directLaunch,
  onAskAI
}: any) {
  const [activeDeckIndex, setActiveDeckIndex] = useState<number | null>(null);
  const [isPreparing, setIsPreparing] = useState(!!directLaunch);
  const decks = getDecks(allLevelVocab.length);

  useEffect(() => {
    let isMounted = true;
    if (directLaunch) {
      async function prep() {
        let s = await loadGoodnotesDeckState(level, lang, directLaunch.deckIndex);
        if (directLaunch.mode === 'review' && s) {
          s.runMode = 'review';
          s.currentIndex = 0;
          s.isCompleted = false;
          s.sessionKeys = [...s.reviewKeys];
          await saveGoodnotesDeckState(s);
        } else if (directLaunch.mode === 'next') {
          if (!s) {
            const deckCards = decks[directLaunch.deckIndex];
            if (deckCards) {
              const deckVocab = allLevelVocab.slice(deckCards.start, deckCards.end + 1);
              s = {
                level, lang, deckIndex: directLaunch.deckIndex,
                masteredKeys: [],
                reviewKeys: deckVocab.map((w: any) => `${level}_${w.word}`),
                sessionKeys: deckVocab.map((w: any) => `${level}_${w.word}`),
                currentIndex: 0, runMode: 'all', isCompleted: false, updatedAt: Date.now()
              };
              await saveGoodnotesDeckState(s);
            }
          }
        }
        if (isMounted) {
          setActiveDeckIndex(directLaunch.deckIndex);
          setIsPreparing(false);
        }
      }
      prep();
    } else {
      if (isMounted) setIsPreparing(false);
    }
    return () => { isMounted = false; };
  }, [directLaunch, level, lang]);

  if (isPreparing) {
    return <div className="flex flex-col items-center justify-center h-full"><div className="text-gray-500 font-bold">กำลังเตรียมข้อมูล...</div></div>;
  }

  if (activeDeckIndex === null) {
    return (
      <DeckList 
        level={level} 
        lang={lang} 
        decks={decks}
        allLevelVocab={allLevelVocab}
        onBack={onBack} 
        onSelectDeck={setActiveDeckIndex} 
      />
    );
  }

  return (
    <DeckPlayer 
      level={level}
      lang={lang}
      deckIndex={activeDeckIndex}
      deckBounds={decks[activeDeckIndex]}
      allLevelVocab={allLevelVocab}
      onBackToDecks={() => setActiveDeckIndex(null)}
      onNextDeck={() => {
        if (activeDeckIndex < decks.length - 1) {
          setActiveDeckIndex(activeDeckIndex + 1);
        } else {
          setActiveDeckIndex(null); // Last deck completed
        }
      }}
      onAskAI={onAskAI}
    />
  );
}


function DeckList({ level, lang, decks, allLevelVocab, onBack, onSelectDeck }: any) {
  const [states, setStates] = useState<Record<number, GoodnotesDeckState>>({});

  useEffect(() => {
    let isMounted = true;
    async function loadStates() {
      const newStates: Record<number, GoodnotesDeckState> = {};
      for (let i = 0; i < decks.length; i++) {
        const state = await loadGoodnotesDeckState(level, lang, i);
        if (state) newStates[i] = state;
      }
      if (isMounted) setStates(newStates);
    }
    loadStates();
    return () => { isMounted = false; };
  }, [level, lang, decks.length]);

  const handleDeckClick = (index: number) => {
    onSelectDeck(index);
  };

  const handlePromptSelect = (index: number, mode: 'all' | 'review') => {
    const state = states[index];
    if (state) {
      state.runMode = mode;
      state.currentIndex = 0;
      state.isCompleted = false;
      if (mode === 'all') {
        const deckCards = decks[index];
        const deckVocab = allLevelVocab.slice(deckCards.start, deckCards.end + 1);
        state.sessionKeys = deckVocab.map((w: any) => `${level}_${w.word}`);
      } else {
        state.sessionKeys = [...state.reviewKeys];
      }
      saveGoodnotesDeckState(state).then(() => {
        onSelectDeck(index);
      });
    }
  };

  return (
    <div className="flex flex-col items-center h-full p-4 max-w-4xl mx-auto w-full">
      <div className="w-full mb-6 flex items-center justify-between">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 px-3.5 py-2 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors font-medium border border-gray-200 shadow-sm bg-white"
        >
          <Home size={18} /> กลับ
        </button>
        <h2 className="text-xl font-bold text-gray-800">Goodnote Mode</h2>
      </div>

      <div className="grid grid-cols-1 w-full gap-4">
        {decks.map((deck: any, i: number) => {
          const s = states[i];
          const hasState = !!s;
          const isInitial = !s || (s.currentIndex === 0 && !s.isCompleted && s.reviewKeys.length === (deck.end - deck.start + 1));
          const hasResume = s && s.currentIndex > 0 && !s.isCompleted;
          const isMastered = s && s.isCompleted && s.reviewKeys.length === 0;
          const hasUnlearned = s && s.reviewKeys.length > 0;
          
          return (
            <div
              key={i}
              className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div 
                className={`flex flex-col items-start ${isInitial || hasResume ? 'cursor-pointer w-full' : ''}`}
                onClick={() => {
                  if (isInitial || hasResume) handleDeckClick(i);
                }}
              >
                <div className="text-sm font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg mb-2">
                  ด่าน {i + 1}
                </div>
                <div className="text-xl font-black text-gray-800 mb-1">
                  คำที่ {deck.start + 1} - {deck.end + 1}
                </div>
                {hasResume && (
                  <div className="text-sm font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded mt-2 border border-amber-200">
                    ปัดต่อจากจุดเดิม
                  </div>
                )}
                {isMastered && (
                  <div className="text-sm font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded mt-2 border border-emerald-200">
                    จำได้หมดแล้ว 🎉
                  </div>
                )}
                {s && s.isCompleted && hasUnlearned && (
                  <div className="text-sm font-medium text-rose-600 bg-rose-50 px-2 py-0.5 rounded mt-2 border border-rose-200">
                    มีคำที่ต้องทบทวน {s.reviewKeys.length} คำ
                  </div>
                )}
              </div>
              
              {!isInitial && !hasResume && (
                <div className="flex flex-row items-center gap-3 shrink-0">
                  <button 
                    onClick={() => handlePromptSelect(i, 'all')}
                    className="px-5 py-2.5 bg-gray-50 text-gray-600 font-bold rounded-xl hover:bg-gray-100 transition-colors border border-gray-200"
                  >
                    ดูคำในด่านนี้
                  </button>
                  {hasUnlearned && (
                    <button 
                      onClick={() => handlePromptSelect(i, 'review')}
                      className="px-5 py-2.5 bg-rose-50 text-rose-600 font-bold rounded-xl hover:bg-rose-100 transition-colors border border-rose-200"
                    >
                      ดูคำที่ยังจำไม่ได้
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GoodnotesHanziWord({ word, isAnimating }: { word: string, isAnimating: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const writersRef = useRef<any[]>([]);

  useEffect(() => {
    let isCancelled = false;
    if (!containerRef.current) return;
    containerRef.current.innerHTML = '';
    writersRef.current = [];

    const charSize = Math.max(80, Math.min(120, 300 / word.length));
    
    word.split('').forEach(char => {
      const charDiv = document.createElement('div');
      charDiv.style.width = `${charSize}px`;
      charDiv.style.height = `${charSize}px`;
      charDiv.style.margin = '2px';
      containerRef.current?.appendChild(charDiv);

      const writer = HanziWriter.create(charDiv, char, {
        width: charSize,
        height: charSize,
        padding: 5,
        showOutline: true,
        outlineColor: '#e5e7eb',
        showCharacter: !isAnimating,
        strokeColor: '#1f2937', // text-gray-800
        strokeAnimationSpeed: 0.6,
        delayBetweenStrokes: 200,
      });
      writersRef.current.push(writer);
    });

    const runAnimation = async () => {
      while (!isCancelled && isAnimating) {
        for (const writer of writersRef.current) {
          if (isCancelled || !isAnimating) break;
          // Hide all characters first to show drawing effect clearly in a loop?
          // Actually HanziWriter animateCharacter will clear the character before animating it
          await new Promise<void>(resolve => {
            writer.animateCharacter({ onComplete: resolve });
          });
        }
        if (isCancelled || !isAnimating) break;
        // Small pause before looping again
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    };

    if (isAnimating) {
      runAnimation();
    } else {
      // Just ensure characters are shown statically
      writersRef.current.forEach(writer => {
        writer.hideOutline();
        writer.showCharacter();
      });
    }

    return () => {
      isCancelled = true;
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, [word, isAnimating]);

  return <div ref={containerRef} className="flex flex-row flex-wrap justify-center items-center gap-2 mb-6" />;
}

function DeckPlayer({ level, lang, deckIndex, deckBounds, allLevelVocab, onBackToDecks, onNextDeck, onAskAI }: any) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [state, setState] = useState<GoodnotesDeckState | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [exitDir, setExitDir] = useState<'left'|'right'|null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        try { audioRef.current.pause(); } catch (e) {}
      }
      if ('speechSynthesis' in window) {
        try { window.speechSynthesis.cancel(); } catch (e) {}
      }
    };
  }, []);

  const deckCards = allLevelVocab.slice(deckBounds.start, deckBounds.end + 1);
  const getWordKey = (w: any) => `${level}_${w.word}`;

  useEffect(() => {
    let isMounted = true;
    async function load() {
      let s = await loadGoodnotesDeckState(level, lang, deckIndex);
      if (!s) {
        s = {
          level,
          lang,
          deckIndex,
          masteredKeys: [],
          reviewKeys: deckCards.map(w => getWordKey(w)),
          sessionKeys: deckCards.map(w => getWordKey(w)),
          currentIndex: 0,
          runMode: 'all',
          isCompleted: false,
          updatedAt: Date.now()
        };
      }
      if (s.isCompleted && s.runMode === 'all') {
         s.currentIndex = 0;
         s.isCompleted = false;
         s.masteredKeys = [];
         s.reviewKeys = [];
         s.sessionKeys = deckCards.map(w => getWordKey(w));
      }
      // Guarantee sessionKeys
      if (!s.sessionKeys) {
        s.sessionKeys = s.runMode === 'all' ? deckCards.map(w => getWordKey(w)) : [...s.reviewKeys];
      }
      if (isMounted) {
        setState(s);
        setIsLoaded(true);
      }
    }
    load();
    return () => { isMounted = false; };
  }, [level, lang, deckIndex]);

  useEffect(() => {
    if (state && isLoaded) {
      saveGoodnotesDeckState(state);
    }
  }, [state, isLoaded]);

  if (!isLoaded || !state) return <div className="p-8 text-center text-gray-500 font-bold">กำลังโหลด...</div>;

  const activeCards = deckCards.filter(w => state.sessionKeys!.includes(getWordKey(w)));
  const isEndScreen = state.isCompleted || state.currentIndex >= activeCards.length;
  
  if (isEndScreen) {
    return <DeckEndScreen state={state} activeCards={activeCards} deckCards={deckCards} onBack={onBackToDecks} onNextDeck={onNextDeck} setState={setState} />;
  }

  const currentWord = activeCards[state.currentIndex];
  if (!currentWord) return null;

  const handleSwipe = (dir: 'left' | 'right') => {
    if (exitDir !== null) return;
    setExitDir(dir);
    
    setTimeout(() => {
      setShowDetails(false);
      setIsAnimating(false);
      const key = getWordKey(currentWord);
      
      setState(prev => {
        if (!prev) return prev;
        const next = { ...prev };
        
        const isMastered = dir === 'right';
        if (isMastered) {
          if (!next.masteredKeys.includes(key)) next.masteredKeys.push(key);
          next.reviewKeys = next.reviewKeys.filter(k => k !== key);
        } else {
          if (!next.reviewKeys.includes(key)) next.reviewKeys.push(key);
          next.masteredKeys = next.masteredKeys.filter(k => k !== key);
        }
        
        next.currentIndex += 1;
        if (next.currentIndex >= activeCards.length) {
          next.isCompleted = true;
        }
        return next;
      });
      setExitDir(null);
    }, 200);
  };



  const playAudio = async () => {
    if (!currentWord) return;
    const wordText = currentWord.word;
    setIsPlayingAudio(true);

    if ('speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch(e) {}
    }
    if (audioRef.current) {
      try { audioRef.current.pause(); } catch(e) {}
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
              v.name.toLowerCase().includes('mark')
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

  return (
    <div className="flex flex-col items-center h-full p-4 max-w-xl mx-auto w-full relative">
      <div className="w-full mb-4 flex items-center justify-between">
        <button onClick={onBackToDecks} className="p-2 text-gray-500 bg-white rounded-full shadow-sm hover:bg-gray-50">
          <ChevronLeft size={24} />
        </button>
        <div className="text-gray-500 font-bold text-sm bg-white px-4 py-1.5 rounded-full shadow-sm">
          คำที่ {state.currentIndex + 1} / {activeCards.length}
        </div>
        <div className="w-10"></div>
      </div>
      
      <div className="relative w-full h-[420px]">
        <AnimatePresence mode="wait">
          <motion.div 
            key={state.currentIndex}
            initial={{ opacity: 0, scale: 0.95, x: 0 }}
            animate={{ opacity: 1, scale: 1, x: 0, rotate: 0 }}
            exit={{ opacity: 0, x: exitDir === 'left' ? -300 : (exitDir === 'right' ? 300 : 0), rotate: exitDir === 'left' ? -15 : (exitDir === 'right' ? 15 : 0) }}
            transition={{ duration: 0.2 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            onDragEnd={(e, { offset }) => {
              const swipe = offset.x;
              if (swipe < -50) handleSwipe('left');
              else if (swipe > 50) handleSwipe('right');
            }}
            className="absolute inset-0 w-full h-full bg-white rounded-3xl shadow-xl border border-gray-100 flex flex-col items-center justify-center p-8 cursor-grab active:cursor-grabbing"
          >
            <button onClick={playAudio} className="absolute top-6 left-6 p-2.5 bg-indigo-50 rounded-full hover:bg-indigo-100 text-indigo-600 transition-colors">
              <Volume2 size={24} className={isPlayingAudio ? 'animate-pulse' : ''} />
            </button>

            {onAskAI && (
              <button 
                onClick={(e) => { e.stopPropagation(); onAskAI(currentWord.word); }}
                className="absolute top-6 left-20 p-2.5 bg-purple-50 text-purple-600 rounded-full hover:bg-purple-600 hover:text-white transition-colors shadow-sm"
                title="ถามติวเตอร์ AI (เปิดสายคอลเพื่อสอนคำนี้ทันที)"
              >
                <Bot size={24} />
              </button>
            )}
            
            {lang === 'CN' && (
              <button 
                onClick={(e) => { e.stopPropagation(); setIsAnimating(!isAnimating); }}
                className={`absolute top-6 right-6 p-2.5 rounded-full transition-colors ${isAnimating ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
              >
                <PenTool size={24} />
              </button>
            )}
            
            <div className="absolute inset-0 pointer-events-none opacity-0 flex justify-between px-6 items-center">
               <div className="text-rose-500 font-black text-2xl -rotate-12 bg-rose-50 px-4 py-2 rounded-xl border border-rose-200">ยังจำไม่ได้</div>
               <div className="text-emerald-500 font-black text-2xl rotate-12 bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-200">จำได้แล้ว</div>
            </div>
            
            {lang === 'CN' ? (
              <GoodnotesHanziWord word={currentWord.word} isAnimating={isAnimating} />
            ) : (
              <div className="text-7xl md:text-8xl font-bold text-gray-800 mb-6 text-center select-none">
                {currentWord.word}
              </div>
            )}
            
            {!showDetails ? (
              <button 
                onClick={() => setShowDetails(true)}
                className="px-6 py-3 bg-gray-50 text-gray-500 font-bold rounded-2xl hover:bg-gray-100 transition-colors border border-gray-200"
              >
                เปิดดูคำแปล
              </button>
            ) : (
              <div className="flex flex-col items-center select-none text-center animate-in fade-in zoom-in duration-300">
                {currentWord.pinyin && <div className="text-xl md:text-2xl text-indigo-600 font-medium mb-3">{currentWord.pinyin}</div>}
                {currentWord.phonetic && <div className="text-xl md:text-2xl text-indigo-600 font-medium mb-3">{currentWord.phonetic}</div>}
                <div className="text-lg text-gray-600">{lang === 'EN' ? currentWord.th : currentWord.en}</div>
                {lang === 'CN' && currentWord.th && <div className="text-lg text-gray-600 mt-1">{currentWord.th}</div>}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      
      <div className="mt-8 flex justify-between w-full gap-4 max-w-sm">
        <button 
          onClick={() => handleSwipe('left')}
          className="flex-1 py-4 bg-white text-rose-500 font-bold rounded-2xl border-2 border-rose-100 hover:bg-rose-50 transition-colors shadow-sm flex items-center justify-center gap-2"
        >
          <XCircle size={24} /> ยังจำไม่ได้
        </button>
        <button 
          onClick={() => handleSwipe('right')}
          className="flex-1 py-4 bg-white text-emerald-500 font-bold rounded-2xl border-2 border-emerald-100 hover:bg-emerald-50 transition-colors shadow-sm flex items-center justify-center gap-2"
        >
          จำได้แล้ว <CheckCircle2 size={24} />
        </button>
      </div>
    </div>
  );
}

function DeckEndScreen({ state, activeCards, deckCards, onBack, onNextDeck, setState }: any) {
  // Compute total mastered vs review across the ENTIRE deck based on latest state
  // Because if they did 'review' mode, some went to mastered, some stayed in review.
  // We want to show stats for the whole deck.
  const total = deckCards.length;
  const masteredCount = deckCards.filter((w: any) => state.masteredKeys.includes(`${state.level}_${w.word}`)).length;
  const reviewCount = deckCards.filter((w: any) => state.reviewKeys.includes(`${state.level}_${w.word}`)).length;
  // Fallback for unassigned words if any? If they played 'all', everything is either mastered or review.
  const unassigned = total - masteredCount - reviewCount;
  
  const actualMastered = masteredCount;
  const actualReview = reviewCount + unassigned; // consider unassigned as review needed
  
  const masteredPercent = Math.round((actualMastered / total) * 100);
  const reviewPercent = Math.round((actualReview / total) * 100);
  
  const data = [
    { name: 'จำได้แล้ว', value: actualMastered, color: '#10B981' },
    { name: 'ยังจำไม่ได้', value: actualReview, color: '#F43F5E' }
  ];

  const handleReviewAll = () => {
    setState((prev: any) => ({
      ...prev,
      currentIndex: 0,
      runMode: 'all',
      sessionKeys: deckCards.map((w: any) => `${prev.level}_${w.word}`),
      isCompleted: false
    }));
  };

  const handleReviewUnlearned = () => {
    setState((prev: any) => ({
      ...prev,
      currentIndex: 0,
      runMode: 'review',
      sessionKeys: [...prev.reviewKeys],
      isCompleted: false
    }));
  };

  const isPerfect = actualMastered === total;

  return (
    <div className="flex flex-col items-center justify-center h-full p-6 max-w-md mx-auto w-full">
      <div className="bg-white rounded-[2rem] shadow-xl border-2 border-gray-100 p-8 w-full flex flex-col items-center">
        <h2 className="text-2xl font-black text-gray-800 mb-6 text-center">สรุปผลด่าน {state.deckIndex + 1}</h2>
        
        <div className="w-full h-[200px] mb-6">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
                stroke="none"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        
        <div className="flex justify-center gap-6 w-full mb-8">
          <div className="flex flex-col items-center">
            <div className="text-3xl font-black text-emerald-500">{masteredPercent}%</div>
            <div className="text-sm font-bold text-gray-500">จำได้แล้ว</div>
          </div>
          <div className="w-px bg-gray-200"></div>
          <div className="flex flex-col items-center">
            <div className="text-3xl font-black text-rose-500">{reviewPercent}%</div>
            <div className="text-sm font-bold text-gray-500">ยังจำไม่ได้</div>
          </div>
        </div>
        
        <div className="flex flex-col gap-3 w-full">
          <button 
            onClick={handleReviewAll}
            className="w-full py-4 bg-gray-100 text-gray-700 font-bold rounded-2xl hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
          >
            <RotateCcw size={20} /> ดูคำในด่านนี้ซ้ำ
          </button>
          
          {!isPerfect ? (
            <button 
              onClick={handleReviewUnlearned}
              className="w-full py-4 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-colors shadow-md flex items-center justify-center gap-2"
            >
              <Play size={20} /> ดูคำที่ยังจำไม่ได้
            </button>
          ) : (
            <button 
              onClick={onNextDeck}
              className="w-full py-4 bg-emerald-500 text-white font-bold rounded-2xl hover:bg-emerald-600 transition-colors shadow-md flex items-center justify-center gap-2"
            >
              ดูแฟลชการ์ดด่านถัดไป <ArrowRight size={20} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
