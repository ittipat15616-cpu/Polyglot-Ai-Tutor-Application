const fs = require('fs');
let code = fs.readFileSync('src/components/GoodnotesMode.tsx', 'utf8');

// Replace handlePromptSelect
code = code.replace(
  /const handlePromptSelect = \(index: number, mode: 'all' \| 'review'\) => \{[\s\S]*?onSelectDeck\(index\);\n    \}\n  \};/m,
  `const handlePromptSelect = (index: number, mode: 'all' | 'review') => {
    const state = states[index];
    if (state) {
      state.runMode = mode;
      state.currentIndex = 0;
      const deckCards = decks[index];
      const deckVocab = allLevelVocab.slice(deckCards.start, deckCards.end + 1);
      state.sessionKeys = mode === 'all' 
        ? deckVocab.map((w: any) => \`\${level}_\${w.word}\`)
        : [...state.reviewKeys];
      state.isCompleted = false;
      saveGoodnotesDeckState(state).then(() => {
        onSelectDeck(index);
      });
    } else {
      onSelectDeck(index);
    }
  };`
);

// We need to replace function DeckPlayer completely
const deckPlayerRegex = /function DeckPlayer\(\{ level, lang, deckIndex, deckBounds, allLevelVocab, onBackToDecks, onNextDeck \}: any\) \{[\s\S]*?function DeckEndScreen/m;

const newDeckPlayer = `function DeckPlayer({ level, lang, deckIndex, deckBounds, allLevelVocab, onBackToDecks, onNextDeck }: any) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [state, setState] = useState<GoodnotesDeckState | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [exitDir, setExitDir] = useState<'left'|'right'|null>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  const deckCards = allLevelVocab.slice(deckBounds.start, deckBounds.end + 1);
  const getWordKey = (w: any) => \`\${level}_\${w.word}\`;

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

  const playAudio = () => {
    if (!currentWord) return;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const text = currentWord.word;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang === 'CN' ? 'zh-CN' : 'en-US';
      window.speechSynthesis.speak(u);
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
              <Volume2 size={24} />
            </button>
            
            {lang === 'CN' && (
              <button 
                onClick={(e) => { e.stopPropagation(); setIsAnimating(true); }}
                className="absolute top-6 right-6 p-2.5 bg-gray-50 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
              >
                <PenTool size={24} />
              </button>
            )}
            
            <div className="absolute inset-0 pointer-events-none opacity-0 flex justify-between px-6 items-center">
               <div className="text-rose-500 font-black text-2xl -rotate-12 bg-rose-50 px-4 py-2 rounded-xl border border-rose-200">ยังจำไม่ได้</div>
               <div className="text-emerald-500 font-black text-2xl rotate-12 bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-200">จำได้แล้ว</div>
            </div>
            
            {!isAnimating ? (
              <div className="text-7xl md:text-8xl font-bold text-gray-800 mb-6 text-center select-none">
                {currentWord.word}
              </div>
            ) : (
              <GoodnotesHanziWord word={currentWord.word} onComplete={() => setIsAnimating(false)} />
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

function DeckEndScreen`;

code = code.replace(deckPlayerRegex, newDeckPlayer);

fs.writeFileSync('src/components/GoodnotesMode.tsx', code);
