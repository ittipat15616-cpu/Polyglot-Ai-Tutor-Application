const fs = require('fs');
let code = fs.readFileSync('src/components/FlashcardsArea.tsx', 'utf8');

// Update gnReminder state type
code = code.replace(
  "const [gnReminder, setGnReminder] = useState<{level: string, deckIndex: number} | null>(null);",
  "const [gnReminder, setGnReminder] = useState<{type: 'resume'|'review'|'next', level: string, deckIndex: number} | null>(null);"
);

// Update gnReminder fetch logic
const oldFetchRegex = /useEffect\(\(\) => \{\n    if \(isGoodnotesMode\) \{\n      let isMounted = true;\n      loadAllGoodnotesStates\(activeLang\)\.then\(states => \{\n        const reminder = states\.find\(s => s\.isCompleted && s\.reviewKeys && s\.reviewKeys\.length > 0\);\n        if \(isMounted\) \{\n          if \(reminder\) setGnReminder\(\{ level: reminder\.level, deckIndex: reminder\.deckIndex \}\);\n          else setGnReminder\(null\);\n        \}\n      \}\);\n      return \(\) => \{ isMounted = false; \};\n    \}\n  \}, \[isGoodnotesMode, activeLang\]\);/;

const newFetchLogic = `useEffect(() => {
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

code = code.replace(oldFetchRegex, newFetchLogic);

// Update gnReminder UI
const oldReminderUIRegex = /<div className="text-lg font-bold">ทบทวนคำที่ยังจำไม่ได้ในระดับ \{gnReminder\.level\} ด่านที่ \{gnReminder\.deckIndex \+ 1\}<\/div>/;

const newReminderUI = `<div className="text-lg font-bold">
                  {gnReminder.type === 'resume' && \`ปัดต่อจากจุดเดิม ในระดับ \${gnReminder.level} ด่านที่ \${gnReminder.deckIndex + 1}\`}
                  {gnReminder.type === 'review' && \`ทบทวนคำที่ยังจำไม่ได้ ในระดับ \${gnReminder.level} ด่านที่ \${gnReminder.deckIndex + 1}\`}
                  {gnReminder.type === 'next' && \`ดูแฟลชการ์ดด่านถัดไป ในระดับ \${gnReminder.level} ด่านที่ \${gnReminder.deckIndex + 1}\`}
                </div>`;

code = code.replace(oldReminderUIRegex, newReminderUI);

fs.writeFileSync('src/components/FlashcardsArea.tsx', code);
