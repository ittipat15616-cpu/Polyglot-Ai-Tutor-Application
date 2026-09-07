import fs from 'fs';
import { hsk5Data } from './src/data/hsk5Data';

// Remove the two number words
const filtered = hsk5Data.filter(x => !/^[0-9]/.test(x.word));

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

console.log('First 10 words now:');
console.log(filtered.slice(0, 10).map(x => `${x.word} (${x.pinyin})`).join(', '));

const fileContent = `export const hsk5Data = ${JSON.stringify(filtered, null, 2)};\n`;
fs.writeFileSync('./src/data/hsk5Data.ts', fileContent, 'utf-8');
console.log('Successfully updated hsk5Data.ts');
