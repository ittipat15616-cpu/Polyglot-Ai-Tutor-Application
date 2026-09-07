const fs = require('fs');
let code = fs.readFileSync('src/components/games/WordRainGame.tsx', 'utf8');

const distractorLogic = `    // Pick 3 distractors
    const otherTrans = vocabList
      .filter((w) => w.id !== nextObj.id)
      .map((w) => w.translations[0])
      .filter(Boolean);
    const shuffledOther = otherTrans.sort(() => Math.random() - 0.5).slice(0, 3);`;

const newDistractorLogic = `    // Pick 3 distractors (Avoid duplicate meanings)
    const otherTrans = vocabList
      .filter((w) => w.id !== nextObj.id)
      .map((w) => w.translations[0])
      .filter((t) => t && t !== correctTrans);
      
    // Deduplicate array
    const uniqueOther = Array.from(new Set(otherTrans));
    const shuffledOther = uniqueOther.sort(() => Math.random() - 0.5).slice(0, 3);`;

code = code.replace(distractorLogic, newDistractorLogic);
fs.writeFileSync('src/components/games/WordRainGame.tsx', code);
