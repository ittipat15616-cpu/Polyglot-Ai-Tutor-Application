const fs = require('fs');
let code = fs.readFileSync('src/components/games/LaserCannonGame.tsx', 'utf8');

if (!code.includes("import { areHomophones }")) {
    code = code.replace("import { saveGameStageStars } from '../../services/userPersistence';", "import { saveGameStageStars } from '../../services/userPersistence';\nimport { areHomophones } from '../../utils/homophones';");
}

const matchLogic = `    const isMatch = cleanInput === cleanTarget || (cleanPinyin && cleanInput === cleanPinyin);`;

const newMatchLogic = `    // Look up if typed word exists in vocabList and is a homophone
    const inputWordObj = vocabList.find(w => w.word.toLowerCase().replace(/[.,/#!$%^&*;:{}=\\-_~()]/g, '') === cleanInput);
    const isPinyinHomophone = activeLang === 'CN' && inputWordObj && inputWordObj.pinyin && currentWord.pinyin && 
       inputWordObj.pinyin.toLowerCase().replace(/\\s/g,'') === currentWord.pinyin.toLowerCase().replace(/\\s/g,'');
       
    const isMatch = cleanInput === cleanTarget 
      || (cleanPinyin && cleanInput === cleanPinyin)
      || areHomophones(cleanInput, cleanTarget)
      || isPinyinHomophone;`;

code = code.replace(matchLogic, newMatchLogic);
fs.writeFileSync('src/components/games/LaserCannonGame.tsx', code);
