const fs = require('fs');
let code = fs.readFileSync('src/components/FlashcardsArea.tsx', 'utf8');

// Add directLaunch state
code = code.replace(
  "const [gnReminder, setGnReminder] = useState<{type: 'resume'|'review'|'next', level: string, deckIndex: number} | null>(null);",
  "const [gnReminder, setGnReminder] = useState<{type: 'resume'|'review'|'next', level: string, deckIndex: number} | null>(null);\n  const [directLaunch, setDirectLaunch] = useState<{deckIndex: number, mode: 'resume'|'review'|'next'} | null>(null);"
);

// Clear directLaunch when activeLang changes
code = code.replace(
  "setSelectedLevel(null);",
  "setSelectedLevel(null);\n    setDirectLaunch(null);"
);

// Pass directLaunch to GoodnotesMode
code = code.replace(
  "<GoodnotesMode level={selectedLevel} lang={activeLang} allLevelVocab={activeVocabList} onBack={() => setSelectedLevel(null)} />",
  "<GoodnotesMode level={selectedLevel} lang={activeLang} allLevelVocab={activeVocabList} onBack={() => setSelectedLevel(null)} directLaunch={directLaunch} />"
);

// Fix onClick on the Reminder button
code = code.replace(
  "onClick={() => setSelectedLevel(gnReminder.level)}",
  `onClick={() => {
                setDirectLaunch({ deckIndex: gnReminder.deckIndex, mode: gnReminder.type });
                setSelectedLevel(gnReminder.level);
              }}`
);

fs.writeFileSync('src/components/FlashcardsArea.tsx', code);
