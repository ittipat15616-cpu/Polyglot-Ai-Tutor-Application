import fs from 'fs';
import { hsk2Data } from './src/data/hsk2Data';

const item = hsk2Data[hsk2Data.length - 1];
if (item.word === '家（科学家）') {
  item.word = '科学家';
  item.pinyin = 'kē xué jiā';
  item.en = 'scientist';
  item.th = 'นักวิทยาศาสตร์';
  item.example = '他是一位著名的科学家。';
  item.exampleTh = 'เขาเป็นนักวิทยาศาสตร์ที่มีชื่อเสียง';
}

// Sort the array by pinyin
hsk2Data.sort((a, b) => {
  // strip tones for sorting if we want basic alphabet
  const normalize = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return normalize(a.pinyin).localeCompare(normalize(b.pinyin));
});

const content = `export const hsk2Data = ${JSON.stringify(hsk2Data, null, 2)};\n`;
fs.writeFileSync('./src/data/hsk2Data.ts', content, 'utf8');
console.log('HSK2 fixed and sorted!');
