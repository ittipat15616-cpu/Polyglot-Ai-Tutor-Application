import fs from 'fs';

let content = fs.readFileSync('./src/data/hsk3Data.ts', 'utf-8');
const dataString = content.replace('export const hsk3Data = ', '').replace(/;\n?$/, '');
let hsk3Data = JSON.parse(dataString);

for (let item of hsk3Data) {
  if (item.word === '...极了') {
    item.word = '极';
    item.pinyin = 'jí';
  } else if (item.word === '…极了') {
    item.word = '极了';
    item.pinyin = 'jí le';
  } else if (item.word === '%') {
    item.word = '百分之';
    item.pinyin = 'bǎi fēn zhī';
  }
}

const uniqueWords = new Set();
const filteredData = [];
for (let item of hsk3Data) {
    if (!uniqueWords.has(item.word)) {
        uniqueWords.add(item.word);
        filteredData.push(item);
    }
}

const getSortKey = (str) => {
    if (!str) return '';
    return str.replace(/[üǖǘǚǜ]/g, 'v').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/gi, '').toLowerCase().trim();
};

filteredData.sort((a, b) => {
  const keyA = getSortKey(a.pinyin);
  const keyB = getSortKey(b.pinyin);
  if (keyA !== keyB) {
    return keyA.localeCompare(keyB);
  }
  return a.word.localeCompare(b.word);
});

const fileContent = `export const hsk3Data = ${JSON.stringify(filteredData, null, 2)};\n`;
fs.writeFileSync('./src/data/hsk3Data.ts', fileContent, 'utf-8');
console.log('Fixed HSK3 words and sorted!');
