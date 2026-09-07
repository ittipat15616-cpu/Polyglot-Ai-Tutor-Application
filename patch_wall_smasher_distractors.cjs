const fs = require('fs');
let code = fs.readFileSync('src/components/games/WallSmasherGame.tsx', 'utf8');

const distractorLogic = `      // Thai translation options
      const otherTrans = vocabList
        .filter((w) => w.id !== currentWord.id)
        .map((w) => w.translations[0])
        .filter(Boolean);
      const shuffledOther = otherTrans.sort(() => Math.random() - 0.5).slice(0, 3);`;

const newDistractorLogic = `      // Thai translation options (Avoid duplicates)
      const correctTrans = currentWord.translations[0] || currentWord.word;
      const otherTrans = vocabList
        .filter((w) => w.id !== currentWord.id)
        .map((w) => w.translations[0])
        .filter(t => t && t !== correctTrans);
      const uniqueOther = Array.from(new Set(otherTrans));
      const shuffledOther = uniqueOther.sort(() => Math.random() - 0.5).slice(0, 3);`;

code = code.replace(distractorLogic, newDistractorLogic);
fs.writeFileSync('src/components/games/WallSmasherGame.tsx', code);
