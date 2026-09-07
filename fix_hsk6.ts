import fs from 'fs';
import { hsk6Data } from './src/data/hsk6Data';

const missingPinyins: Record<string, string> = {
  '好容易': 'hǎo róng yì',
  '很难说': 'hěn nán shuō',
  '力': 'lì',
  '一番': 'yī fān',
  '长': 'cháng',
  '指着': 'zhǐ zhe'
};

let missingCount = 0;
for (const item of hsk6Data) {
  if (!item.pinyin || item.pinyin.trim() === '') {
    if (missingPinyins[item.word]) {
      item.pinyin = missingPinyins[item.word];
      missingCount++;
    }
  }
}
console.log(`Filled in ${missingCount} missing pinyins for HSK6.`);

// Remove number-starting words if any
const filtered = hsk6Data.filter(x => !/^[0-9]/.test(x.word));

const getSortKey = (str: string) => {
    if (!str) return '';
    return str.replace(/[üǖǘǚǜ]/g, 'v').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/gi, '').toLowerCase().trim();
};

filtered.sort((a, b) => {
  const keyA = getSortKey(a.pinyin);
  const keyB = getSortKey(b.pinyin);
  if (keyA !== keyB) {
    return keyA.localeCompare(keyB);
  }
  return a.word.localeCompare(b.word);
});

const fileContent = `export const hsk6Data = ${JSON.stringify(filtered, null, 2)};\n`;
fs.writeFileSync('./src/data/hsk6Data.ts', fileContent, 'utf-8');
console.log('Successfully sorted and updated hsk6Data.ts');

