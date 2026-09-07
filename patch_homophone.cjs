const fs = require('fs');
let code = fs.readFileSync('src/components/games/WallSmasherGame.tsx', 'utf8');

const homophonesStr = `
// Common homophones groups to solve speech recognition confusion
const homophoneGroups = [
  ['to', 'too', 'two'],
  ['there', 'their', 'theyre', "they're"],
  ['your', 'youre', "you're"],
  ['its', "it's"],
  ['here', 'hear'],
  ['knight', 'night'],
  ['bare', 'bear'],
  ['cell', 'sell'],
  ['cent', 'scent', 'sent'],
  ['eye', 'i'],
  ['for', 'four'],
  ['know', 'no'],
  ['knew', 'new'],
  ['our', 'hour'],
  ['sea', 'see'],
  ['son', 'sun'],
  ['write', 'right'],
  ['wait', 'weight'],
  ['meat', 'meet'],
  ['piece', 'peace'],
  ['week', 'weak'],
  ['hole', 'whole'],
  ['flower', 'flour'],
  ['plain', 'plane'],
  ['break', 'brake'],
  ['eight', 'ate'],
  ['mail', 'male'],
  ['one', 'won'],
  ['pair', 'pear'],
  ['poor', 'pour'],
  ['sail', 'sale'],
  ['tail', 'tale'],
  ['wear', 'where', 'ware'],
  ['by', 'buy', 'bye'],
  ['dear', 'deer'],
  ['hi', 'high'],
  ['red', 'read'],
  ['wood', 'would'],
  ['blew', 'blue'],
  ['board', 'bored'],
  ['hair', 'hare'],
  ['heal', 'heel'],
  ['stair', 'stare'],
  ['steal', 'steel'],
  ['threw', 'through'],
  ['waist', 'waste']
];

function areHomophones(w1: string, w2: string): boolean {
  if (w1 === w2) return true;
  for (const group of homophoneGroups) {
    if (group.includes(w1) && group.includes(w2)) {
      return true;
    }
  }
  return false;
}
`;

const insertIndex = code.indexOf('function normalizeThaiAccent');
code = code.slice(0, insertIndex) + homophonesStr + '\n' + code.slice(insertIndex);

// Add to checkSpokenMatch
const oldTokenCheck = `      if (token === cleanTarget || (cleanPinyin && token === cleanPinyin)) {
        return true;
      }`;
const newTokenCheck = `      if (token === cleanTarget || (cleanPinyin && token === cleanPinyin) || areHomophones(token, cleanTarget)) {
        return true;
      }`;
      
code = code.replace(oldTokenCheck, newTokenCheck);

const oldFullCheck = `    const fullSim = calculateSimilarity(cleanSpoken, cleanTarget);
    if (fullSim >= 0.68) return true;`;
const newFullCheck = `    const fullSim = calculateSimilarity(cleanSpoken, cleanTarget);
    if (fullSim >= 0.68) return true;
    
    // Also check if the whole spoken phrase is a homophone of the target
    if (areHomophones(cleanSpoken, cleanTarget)) return true;`;

code = code.replace(oldFullCheck, newFullCheck);

fs.writeFileSync('src/components/games/WallSmasherGame.tsx', code);
