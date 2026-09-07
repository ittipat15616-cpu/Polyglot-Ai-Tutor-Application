const fs = require('fs');
const cefr1 = fs.readFileSync('./src/data/cefrVocab.ts', 'utf8');
const cefr2 = fs.readFileSync('./src/data/cefrC2Vocab.ts', 'utf8');
function extractLength(content) {
  return (content.match(/"word":/g) || []).length;
}
console.log("CEFR:", extractLength(cefr1));
console.log("CEFR C2:", extractLength(cefr2));
