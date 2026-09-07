const fs = require('fs');

// We have to mock the data files to count how many words they have
const hsk1 = fs.readFileSync('./src/data/hsk1Data.ts', 'utf8');
const hsk2 = fs.readFileSync('./src/data/hsk2Data.ts', 'utf8');
const hsk3 = fs.readFileSync('./src/data/hsk3Data.ts', 'utf8');
const hsk4 = fs.readFileSync('./src/data/hsk4Data.ts', 'utf8');
const hsk5 = fs.readFileSync('./src/data/hsk5Data.ts', 'utf8');
const hsk6 = fs.readFileSync('./src/data/hsk6Data.ts', 'utf8');

function extractLength(content) {
  return (content.match(/"word":/g) || []).length;
}

console.log("HSK1:", extractLength(hsk1));
console.log("HSK2:", extractLength(hsk2));
console.log("HSK3:", extractLength(hsk3));
console.log("HSK4:", extractLength(hsk4));
console.log("HSK5:", extractLength(hsk5));
console.log("HSK6:", extractLength(hsk6));

const hsk7to9 = fs.readFileSync('./src/data/hsk7to9Data.ts', 'utf8');
console.log("HSK7-9:", extractLength(hsk7to9));

