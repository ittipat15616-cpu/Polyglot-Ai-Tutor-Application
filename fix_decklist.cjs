const fs = require('fs');

const code = `
function DeckList({ level, lang, decks, onBack, onSelectDeck }: any) {
  const [states, setStates] = useState<Record<number, GoodnotesDeckState>>({});
  const [showPrompt, setShowPrompt] = useState<number | null>(null);

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
    const state = states[index];
    if (!state || state.reviewKeys.length === 0) {
      onSelectDeck(index);
    } else if (state.currentIndex > 0 && !state.isCompleted) {
      onSelectDeck(index);
    } else {
      setShowPrompt(index);
    }
  };

  const handlePromptSelect = (index: number, mode: 'all' | 'review') => {
    const state = states[index];
    if (state) {
      state.runMode = mode;
      state.currentIndex = 0;
      state.isCompleted = false;
      // sessionKeys will be initialized by DeckPlayer
      delete state.sessionKeys; 
      saveGoodnotesDeckState(state).then(() => {
        onSelectDeck(index);
      });
    } else {
      onSelectDeck(index);
    }
  };

  return (
    <div className="flex flex-col items-center h-full p-4 max-w-3xl mx-auto w-full">
      <div className="w-full mb-6 flex items-center justify-between">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 px-3.5 py-2 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors font-medium border border-gray-200 shadow-sm bg-white"
        >
          <Home size={18} /> กลับ
        </button>
        <h2 className="text-xl font-bold text-gray-800">Goodnote Mode</h2>
      </div>

      {showPrompt !== null && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-xl font-bold text-gray-800 mb-4 text-center">เลือกโหมดทบทวน</h3>
            <p className="text-gray-600 text-center mb-6 text-sm">ด่านนี้ยังมีคำที่จำไม่ได้อยู่ คุณต้องการทบทวนแบบไหน?</p>
            <div className="flex flex-col gap-3">
              <button 
                onClick={() => handlePromptSelect(showPrompt, 'all')}
                className="w-full py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors"
              >
                ดูคำในด่านนี้ซ้ำทั้งหมด
              </button>
              <button 
                onClick={() => handlePromptSelect(showPrompt, 'review')}
                className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors"
              >
                ทบทวนเฉพาะคำที่ยังจำไม่ได้
              </button>
              <button 
                onClick={() => setShowPrompt(null)}
                className="w-full py-3 text-gray-500 font-medium rounded-xl hover:bg-gray-50 mt-2 transition-colors"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
        {decks.map((deck: any, i: number) => {
          const s = states[i];
          const hasResume = s && s.currentIndex > 0 && !s.isCompleted;
          return (
            <button
              key={i}
              onClick={() => handleDeckClick(i)}
              className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm hover:shadow-md transition-all text-left group flex flex-col items-start relative overflow-hidden"
            >
              <div className="text-sm font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg mb-3">
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
            </button>
          );
        })}
      </div>
    </div>
  );
}
`;

let original = fs.readFileSync('src/components/GoodnotesMode.tsx', 'utf8');

const regex = /function DeckList\(\{ level, lang, decks, onBack, onSelectDeck \}: any\) \{[\s\S]*?function GoodnotesHanziWord/m;

original = original.replace(regex, code + "\nfunction GoodnotesHanziWord");

fs.writeFileSync('src/components/GoodnotesMode.tsx', original);
