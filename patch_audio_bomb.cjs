const fs = require('fs');
let code = fs.readFileSync('src/components/games/AudioBombGame.tsx', 'utf8');

if (!code.includes("import { areHomophones }")) {
    code = code.replace("import { saveGameStageStars } from '../../services/userPersistence';", "import { saveGameStageStars } from '../../services/userPersistence';\nimport { areHomophones } from '../../utils/homophones';");
}

const distractorLogic = `    // Pick 3 distractors
    const otherWords = vocabList.filter((w) => w.id !== targetObj.id);
    const shuffledOther = otherWords.sort(() => Math.random() - 0.5).slice(0, 3);`;

const newDistractorLogic = `    // Pick 3 distractors (Avoid Homophones & Synonyms)
    const otherWords = vocabList.filter((w) => {
      if (w.id === targetObj.id) return false;
      if (w.word.toLowerCase() === targetObj.word.toLowerCase()) return false;
      if (activeLang === 'CN' && w.pinyin && targetObj.pinyin) {
        if (w.pinyin.toLowerCase().replace(/\\s/g,'') === targetObj.pinyin.toLowerCase().replace(/\\s/g,'')) return false;
      }
      if (areHomophones(w.word, targetObj.word)) return false;
      return true;
    });
    const shuffledOther = otherWords.sort(() => Math.random() - 0.5).slice(0, 3);`;

code = code.replace(distractorLogic, newDistractorLogic);
fs.writeFileSync('src/components/games/AudioBombGame.tsx', code);
