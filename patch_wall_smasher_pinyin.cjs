const fs = require('fs');
let code = fs.readFileSync('src/components/games/WallSmasherGame.tsx', 'utf8');

const matchLogic = `      if (token === cleanTarget || (cleanPinyin && token === cleanPinyin) || areHomophones(token, cleanTarget)) {
        return true;
      }`;

const newMatchLogic = `      const inputWordObj = vocabList.find(w => w.word.toLowerCase().replace(/[.,/#!$%^&*;:{}=\\-_~()]/g, '') === token);
      const isPinyinHomophone = activeLang === 'CN' && inputWordObj && inputWordObj.pinyin && cleanPinyin && 
         inputWordObj.pinyin.toLowerCase().replace(/\\s/g,'') === cleanPinyin;

      if (token === cleanTarget || (cleanPinyin && token === cleanPinyin) || areHomophones(token, cleanTarget) || isPinyinHomophone) {
        return true;
      }`;

code = code.replace(matchLogic, newMatchLogic);
fs.writeFileSync('src/components/games/WallSmasherGame.tsx', code);
