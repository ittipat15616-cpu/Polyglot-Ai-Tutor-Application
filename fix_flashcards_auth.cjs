const fs = require('fs');
let code = fs.readFileSync('src/components/FlashcardsArea.tsx', 'utf8');

if (!code.includes("import { auth }")) {
  code = code.replace(
    "import { loadAllGoodnotesStates } from '../services/userPersistence';",
    "import { loadAllGoodnotesStates } from '../services/userPersistence';\nimport { auth } from '../firebase';\nimport { onAuthStateChanged } from 'firebase/auth';"
  );
}

const oldBookmarkFetch = /useEffect\(\(\) => \{\n    let isMounted = true;\n    async function fetchBookmark\(\) \{\n      if \(activeLang\) \{\n        const bm = await loadLastFlashcardBookmark\(activeLang\);\n        if \(isMounted\) setLastBookmark\(bm\);\n      \}\n    \}\n    fetchBookmark\(\);\n    return \(\) => \{ isMounted = false; \};\n  \}, \[selectedLevel\]\);/;

const newBookmarkFetch = `useEffect(() => {
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
  }, [selectedLevel, activeLang]);`;

code = code.replace(oldBookmarkFetch, newBookmarkFetch);

const oldReminderFetch = /useEffect\(\(\) => \{\n    if \(isGoodnotesMode && !selectedLevel\) \{\n      let isMounted = true;\n      loadAllGoodnotesStates\(activeLang\)\.then\(states => \{[\s\S]*?\}\);\n      return \(\) => \{ isMounted = false; \};\n    \}\n  \}, \[isGoodnotesMode, activeLang, selectedLevel\]\);/;

const newReminderFetch = `useEffect(() => {
    if (isGoodnotesMode && !selectedLevel) {
      let isMounted = true;
      const unsubscribe = onAuthStateChanged(auth, () => {
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
      });
      return () => {
        isMounted = false;
        unsubscribe();
      };
    }
  }, [isGoodnotesMode, activeLang, selectedLevel]);`;

code = code.replace(oldReminderFetch, newReminderFetch);

fs.writeFileSync('src/components/FlashcardsArea.tsx', code);
