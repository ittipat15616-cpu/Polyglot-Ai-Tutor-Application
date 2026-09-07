import fs from 'fs';
import { hsk5Data } from './src/data/hsk5Data';
import { hsk6Data } from './src/data/hsk6Data';

// 1. Add missing to HSK5
const newHsk5Words = [
  {
    word: '差（一）点儿',
    pinyin: 'chà (yì) diǎn r',
    th: 'เกือบจะ',
    example: '我差（一）点儿迟到了。',
    exampleTh: 'ฉันเกือบจะมาสายแล้ว'
  },
  {
    word: '品（工艺品）',
    pinyin: 'pǐn (gōng yì pǐn)',
    th: 'งานศิลปหัตถกรรม, สิ่งของ',
    example: '这些品（工艺品）非常精美。',
    exampleTh: 'งานศิลปหัตถกรรมเหล่านี้ประณีตมาก'
  }
];

hsk5Data.push(...newHsk5Words);

const getSortKey = (str: string) => {
    if (!str) return '';
    return str.replace(/[üǖǘǚǜ]/g, 'v').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/gi, '').toLowerCase().trim();
};

hsk5Data.sort((a, b) => {
  const keyA = getSortKey(a.pinyin);
  const keyB = getSortKey(b.pinyin);
  if (keyA !== keyB) {
    return keyA.localeCompare(keyB);
  }
  return a.word.localeCompare(b.word);
});

fs.writeFileSync('./src/data/hsk5Data.ts', `export const hsk5Data = ${JSON.stringify(hsk5Data, null, 2)};\n`, 'utf-8');
console.log('HSK5 updated. Length:', hsk5Data.length);

// 2. Add missing to HSK6
// To reach exactly 1140, we add '露' (lòu)
const newHsk6Word = {
  word: '露',
  pinyin: 'lòu',
  th: 'เผย, แสดงให้เห็น',
  example: '他的马脚露出来了。',
  exampleTh: 'ธาตุแท้ของเขาเผยออกมาแล้ว'
};

hsk6Data.push(newHsk6Word);

hsk6Data.sort((a, b) => {
  const keyA = getSortKey(a.pinyin);
  const keyB = getSortKey(b.pinyin);
  if (keyA !== keyB) {
    return keyA.localeCompare(keyB);
  }
  return a.word.localeCompare(b.word);
});

fs.writeFileSync('./src/data/hsk6Data.ts', `export const hsk6Data = ${JSON.stringify(hsk6Data, null, 2)};\n`, 'utf-8');
console.log('HSK6 updated. Length:', hsk6Data.length);

