const fs = require('fs');
let code = fs.readFileSync('src/components/games/MatchMasterGame.tsx', 'utf8');

const matchLogic = `    if (left.pairId === right.pairId) {`;

const newMatchLogic = `    // Find the original words
    const leftWord = vocabList.find(w => w.id === left.pairId);
    const rightWord = vocabList.find(w => w.id === right.pairId);
    
    // They match if they have the same pairId, OR if their translations are identical, OR if their words are identical (homophones/synonyms fallback)
    const isSamePair = left.pairId === right.pairId;
    const isSameTranslation = leftWord && rightWord && leftWord.translations[0] === rightWord.translations[0];
    const isSameWordText = leftWord && rightWord && leftWord.word.toLowerCase() === rightWord.word.toLowerCase();
    
    if (isSamePair || isSameTranslation || isSameWordText) {`;

code = code.replace(matchLogic, newMatchLogic);
fs.writeFileSync('src/components/games/MatchMasterGame.tsx', code);
