import fs from 'fs';
import path from 'path';
import { hsk3Data } from './src/data/hsk3Data';

const item = hsk3Data.find(x => x.word.includes('初一') || x.word === '初（初一）' || x.en.includes('初一'));
if (item) {
  item.word = '初一';
  item.pinyin = 'chū yī';
  item.en = 'first day of lunar month / New Year\'s Day';
  item.th = 'วันแรกของปีใหม่ตามจันทรคติ/วันเที่ยว';
  item.example = '大年初一我们去拜年。';
  item.exampleTh = 'วันแรกของปีใหม่พวกเราไปอวยพรปีใหม่';
  console.log('Fixed:', item);
} else {
  console.log('Not found!');
}

hsk3Data.sort((a, b) => {
  const normalize = (str) => (str || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return normalize(a.pinyin).localeCompare(normalize(b.pinyin));
});

const filePath = path.join(process.cwd(), 'src/data/hsk3Data.ts');
const fileContent = `export const hsk3Data = ${JSON.stringify(hsk3Data, null, 2)};\n`;
fs.writeFileSync(filePath, fileContent, 'utf-8');
console.log('Saved hsk3Data.ts');
