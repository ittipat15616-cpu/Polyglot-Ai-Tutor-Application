const fs = require('fs');
const content = fs.readFileSync('./src/data/hsk1Data.ts', 'utf-8');
const startIndex = content.indexOf('export const mockHsk1Data = ') + 'export const mockHsk1Data = '.length;
let arrayStr = content.substring(startIndex).trim();
if (arrayStr.endsWith(';')) arrayStr = arrayStr.slice(0, -1);
const data = JSON.parse(arrayStr);
for(let i=0; i<10; i++) {
  console.log(data[i].word, data[i].pinyin);
}
