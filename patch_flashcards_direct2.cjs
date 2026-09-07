const fs = require('fs');
let code = fs.readFileSync('src/components/FlashcardsArea.tsx', 'utf8');

const target = `<GoodnotesMode
        level={selectedLevel}
        lang={activeLang}
        allLevelVocab={selectedLevelData}
        onBack={() => setSelectedLevel(null)}
      />`;

const replacement = `<GoodnotesMode
        level={selectedLevel}
        lang={activeLang}
        allLevelVocab={selectedLevelData}
        onBack={() => { setSelectedLevel(null); setDirectLaunch(null); }}
        directLaunch={directLaunch}
      />`;

code = code.replace(target, replacement);

fs.writeFileSync('src/components/FlashcardsArea.tsx', code);
