const fs = require('fs');
let code = fs.readFileSync('src/components/FlashcardsArea.tsx', 'utf8');

code = code.replace(
  "import GoodnotesMode from './GoodnotesMode';",
  "import GoodnotesMode from './GoodnotesMode';\nimport { loadAllGoodnotesStates } from '../services/userPersistence';"
);

// Add global reminder state
code = code.replace(
  "const [lastBookmark, setLastBookmark] = useState<FlashcardProgress | null>(null);",
  "const [lastBookmark, setLastBookmark] = useState<FlashcardProgress | null>(null);\n  const [gnReminder, setGnReminder] = useState<{level: string, deckIndex: number} | null>(null);"
);

// Fetch global reminder
code = code.replace(
  /useEffect\(\(\) => \{\n    setSelectedLevel\(null\);\n  \}, \[activeLang\]\);/,
  `useEffect(() => {
    setSelectedLevel(null);
  }, [activeLang]);

  useEffect(() => {
    if (isGoodnotesMode) {
      let isMounted = true;
      loadAllGoodnotesStates(activeLang).then(states => {
        const reminder = states.find(s => s.isCompleted && s.reviewKeys && s.reviewKeys.length > 0);
        if (isMounted) {
          if (reminder) setGnReminder({ level: reminder.level, deckIndex: reminder.deckIndex });
          else setGnReminder(null);
        }
      });
      return () => { isMounted = false; };
    }
  }, [isGoodnotesMode, activeLang]);`
);

// Render global reminder and hide regular bookmark
code = code.replace(
  /\{lastBookmark && \(/,
  "{!isGoodnotesMode && lastBookmark && ("
);

// We need to add the Goodnotes global reminder when isGoodnotesMode is true
code = code.replace(
  /<h2 className="text-3xl font-bold text-gray-900/,
  `{isGoodnotesMode && gnReminder && (
          <div className="w-full bg-amber-50 text-amber-800 border border-amber-200 rounded-3xl p-6 mb-8 flex flex-col sm:flex-row items-center justify-between shadow-xl gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/50 rounded-2xl">
                <BookmarkCheck size={28} className="text-amber-500" />
              </div>
              <div>
                <div className="text-xs text-amber-700 font-bold uppercase tracking-wider">แจ้งเตือน Goodnote Mode</div>
                <div className="text-lg font-bold">ทบทวนคำที่ยังจำไม่ได้ในระดับ {gnReminder.level} ด่านที่ {gnReminder.deckIndex + 1}</div>
              </div>
            </div>
            <button
              onClick={() => setSelectedLevel(gnReminder.level)}
              className="w-full sm:w-auto px-6 py-3 bg-amber-500 text-white font-extrabold rounded-2xl shadow-lg hover:bg-amber-600 transition-all flex items-center justify-center gap-2 text-sm hover:scale-105 active:scale-95 shrink-0"
            >
              <Play size={18} /> ไปทบทวน
            </button>
          </div>
        )}
        <h2 className="text-3xl font-bold text-gray-900`
);

fs.writeFileSync('src/components/FlashcardsArea.tsx', code);
