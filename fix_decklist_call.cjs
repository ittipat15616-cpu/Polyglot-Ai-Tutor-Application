const fs = require('fs');
let code = fs.readFileSync('src/components/GoodnotesMode.tsx', 'utf8');

const oldCall = `<DeckList 
        level={level} 
        lang={lang} 
        decks={decks} 
        onBack={onBack} 
        onSelectDeck={setActiveDeckIndex} 
      />`;
const newCall = `<DeckList 
        level={level} 
        lang={lang} 
        decks={decks}
        allLevelVocab={allLevelVocab}
        onBack={onBack} 
        onSelectDeck={setActiveDeckIndex} 
      />`;
code = code.replace(oldCall, newCall);

const oldCall2 = `<DeckList 
         level={level} 
         lang={lang} 
         decks={decks}
         allLevelVocab={allLevelVocab}
         onBack={onBack} 
         onSelectDeck={setActiveDeckIndex} 
       />`; // if it was somehow written like this... well, I will just do a regex replace to be safe.

const regexCall = /<DeckList\s+level=\{level\}\s+lang=\{lang\}\s+decks=\{decks\}\s+onBack=\{onBack\}\s+onSelectDeck=\{setActiveDeckIndex\}\s+\/>/;
const replaceCall = `<DeckList 
        level={level} 
        lang={lang} 
        decks={decks} 
        allLevelVocab={allLevelVocab}
        onBack={onBack} 
        onSelectDeck={setActiveDeckIndex} 
      />`;

code = code.replace(regexCall, replaceCall);

fs.writeFileSync('src/components/GoodnotesMode.tsx', code);
