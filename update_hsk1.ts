import fs from 'fs';
import { mockHsk1Data } from './src/data/hsk1Data';

let newData = [];

for (const item of mockHsk1Data) {
  // Remove the bad ones
  if (item.word === '爸爸|爸' && item.th === '爸爸|爸') continue;
  if (item.word === '弟弟|弟' && item.th === '弟弟|弟') continue;
  // Remove '第二'
  if (item.word === '第二') continue;

  const newItem = { ...item };

  // Rename the good ones
  if (newItem.word === '爸爸') newItem.word = '爸爸|爸';
  if (newItem.word === '弟弟') newItem.word = '弟弟|弟';
  if (newItem.word === '哥哥') newItem.word = '哥哥|哥';
  if (newItem.word === '姐姐') newItem.word = '姐姐|姐';
  if (newItem.word === '妈妈') newItem.word = '妈妈|妈';
  if (newItem.word === '妹妹') newItem.word = '妹妹|妹';
  if (newItem.word === '第') newItem.word = '第（第二）';
  if (newItem.word === '们') newItem.word = '们（朋友们）';
  if (newItem.word === '有些') newItem.word = '有（一）些';
  if (newItem.word === '子') newItem.word = '子（桌子）';
  if (newItem.word === '零') newItem.word = '零|〇';

  newData.push(newItem);
}

// Add alternative pronunciations
newData.push({
  word: '地',
  pinyin: 'dì',
  en: 'earth; ground',
  th: 'พื้นดิน',
  example: '这块地很大。',
  exampleTh: 'พื้นดินผืนนี้ใหญ่มาก'
});

newData.push({
  word: '干',
  pinyin: 'gàn',
  en: 'to do',
  th: 'ทำ',
  example: '你在干什么？',
  exampleTh: 'คุณกำลังทำอะไรอยู่?'
});

newData.push({
  word: '还',
  pinyin: 'huán',
  en: 'to return',
  th: 'คืน',
  example: '我明天还你钱。',
  exampleTh: 'ฉันจะคืนเงินให้คุณพรุ่งนี้'
});

// Sort A-Z by pinyin
const getSortKey = (str) => {
    if (!str) return '';
    return str.replace(/[üǖǘǚǜ]/g, 'v').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/gi, '').toLowerCase().trim();
}

newData.sort((a, b) => {
  const keyA = getSortKey(a.pinyin);
  const keyB = getSortKey(b.pinyin);
  if (keyA !== keyB) {
    return keyA.localeCompare(keyB);
  }
  return a.word.localeCompare(b.word);
});

console.log('Final count:', newData.length);

const fileContent = `export const mockHsk1Data = ${JSON.stringify(newData, null, 2)};\n`;
fs.writeFileSync('./src/data/hsk1Data.ts', fileContent, 'utf-8');
console.log('HSK1 fixed and saved.');
