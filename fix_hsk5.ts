import fs from 'fs';
import { hsk5Data } from './src/data/hsk5Data';

const missingPinyins: Record<string, string> = {
  '差点儿': 'chà diǎn r',
  '称2': 'chēng',
  '城里': 'chéng lǐ'
};

let missingCount = 0;
for (const item of hsk5Data) {
  if (!item.pinyin || item.pinyin.trim() === '') {
    if (missingPinyins[item.word]) {
      item.pinyin = missingPinyins[item.word];
      missingCount++;
    } else {
      console.warn('Still missing pinyin for:', item.word);
    }
  }
}
console.log(`Filled in ${missingCount} missing pinyins.`);

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

console.log('First 10 words after sort:');
console.log(hsk5Data.slice(0, 10).map(x => `${x.word} (${x.pinyin})`).join(', '));

const fileContent = `export const hsk5Data = ${JSON.stringify(hsk5Data, null, 2)};\n`;
fs.writeFileSync('./src/data/hsk5Data.ts', fileContent, 'utf-8');
console.log('Successfully sorted and updated hsk5Data.ts');

