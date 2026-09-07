const fs = require('fs');
let code = fs.readFileSync('src/components/FlashcardsArea.tsx', 'utf8');

const oldReminderFetch = /useEffect\(\(\) => \{\n    if \(isGoodnotesMode && !selectedLevel\) \{\n      let isMounted = true;\n      const unsubscribe = onAuthStateChanged\(auth, \(\) => \{\n        loadAllGoodnotesStates\(activeLang\)\.then\(states => \{[\s\S]*?\}\);\n      \}\);\n      return \(\) => \{\n        isMounted = false;\n        unsubscribe\(\);\n      \};\n    \}\n  \}, \[isGoodnotesMode, activeLang, selectedLevel\]\);/;

const newReminderFetch = `useEffect(() => {
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
  }, [isGoodnotesMode, activeLang, selectedLevel]);`;

code = code.replace(oldReminderFetch, newReminderFetch);

fs.writeFileSync('src/components/FlashcardsArea.tsx', code);
