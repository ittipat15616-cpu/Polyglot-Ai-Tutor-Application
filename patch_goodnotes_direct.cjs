const fs = require('fs');
let code = fs.readFileSync('src/components/GoodnotesMode.tsx', 'utf8');

// Update GoodnotesMode to handle directLaunch
const oldGoodnotesMode = /export default function GoodnotesMode\(\{ level, lang, allLevelVocab, onBack \}: any\) \{\n  const \[activeDeckIndex, setActiveDeckIndex\] = useState<number \| null>\(null\);\n  const decks = getDecks\(allLevelVocab\.length\);/;

const newGoodnotesMode = `export default function GoodnotesMode({ level, lang, allLevelVocab, onBack, directLaunch }: any) {
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
            const deckVocab = allLevelVocab.slice(deckCards.start, deckCards.end + 1);
            s = {
              level, lang, deckIndex: directLaunch.deckIndex,
              masteredKeys: [],
              reviewKeys: deckVocab.map((w: any) => \`\${level}_\${w.word}\`),
              sessionKeys: deckVocab.map((w: any) => \`\${level}_\${w.word}\`),
              currentIndex: 0, runMode: 'all', isCompleted: false, updatedAt: Date.now()
            };
            await saveGoodnotesDeckState(s);
          }
        }
        if (isMounted) {
          setActiveDeckIndex(directLaunch.deckIndex);
          setIsPreparing(false);
        }
      }
      prep();
    }
    return () => { isMounted = false; };
  }, [directLaunch, level, lang]);

  if (isPreparing) {
    return <div className="flex flex-col items-center justify-center h-full"><div className="text-gray-500 font-bold">กำลังเตรียมข้อมูล...</div></div>;
  }`;

code = code.replace(oldGoodnotesMode, newGoodnotesMode);

// Fix DeckEndScreen
const oldReviewAll = /const handleReviewAll = \(\) => \{\n    setState\(\(prev: any\) => \(\{\n      \.\.\.prev,\n      currentIndex: 0,\n      runMode: 'all',\n      isCompleted: false\n    \}\)\);\n  \};/;

const newReviewAll = `const handleReviewAll = () => {
    setState((prev: any) => ({
      ...prev,
      currentIndex: 0,
      runMode: 'all',
      sessionKeys: deckCards.map((w: any) => \`\${prev.level}_\${w.word}\`),
      isCompleted: false
    }));
  };`;
code = code.replace(oldReviewAll, newReviewAll);

const oldReviewUnlearned = /const handleReviewUnlearned = \(\) => \{\n    setState\(\(prev: any\) => \(\{\n      \.\.\.prev,\n      currentIndex: 0,\n      runMode: 'review',\n      isCompleted: false\n    \}\)\);\n  \};/;

const newReviewUnlearned = `const handleReviewUnlearned = () => {
    setState((prev: any) => ({
      ...prev,
      currentIndex: 0,
      runMode: 'review',
      sessionKeys: [...prev.reviewKeys],
      isCompleted: false
    }));
  };`;
code = code.replace(oldReviewUnlearned, newReviewUnlearned);

// Fix HanziWord outline
const oldHanzi = /const writer = HanziWriter\.create\(charDiv, char, \{\n        width: charSize,\n        height: charSize,\n        padding: 5,\n        showOutline: false,\n        showCharacter: !isAnimating,\n        strokeColor: '#1f2937',\n        strokeAnimationSpeed: 0\.6,\n        delayBetweenStrokes: 200,\n      \}\);/;

const newHanzi = `const writer = HanziWriter.create(charDiv, char, {
        width: charSize,
        height: charSize,
        padding: 5,
        showOutline: true,
        outlineColor: '#e5e7eb',
        showCharacter: !isAnimating,
        strokeColor: '#1f2937', // text-gray-800
        strokeAnimationSpeed: 0.6,
        delayBetweenStrokes: 200,
      });`;
code = code.replace(oldHanzi, newHanzi);


// Rewrite DeckList UI 
const oldDeckList = /function DeckList\(\{ level, lang, decks, onBack, onSelectDeck \}: any\) \{[\s\S]*?function GoodnotesHanziWord/m;

const newDeckList = `function DeckList({ level, lang, decks, onBack, onSelectDeck }: any) {
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
      delete state.sessionKeys; 
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
                className={\`flex flex-col items-start \${isInitial || hasResume ? 'cursor-pointer w-full' : ''}\`}
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

function GoodnotesHanziWord`;

code = code.replace(oldDeckList, newDeckList);

fs.writeFileSync('src/components/GoodnotesMode.tsx', code);
