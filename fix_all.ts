import fs from 'fs';
import { hsk7to9Data } from './src/data/hsk7to9Data';

const hasEnglish = (str: string) => /[a-zA-Z]/.test(str || '');

for (let i = 0; i < hsk7to9Data.length; i++) {
    const item = hsk7to9Data[i];
    if (hasEnglish(item.th)) {
        item.th = item.word;
    }
    if (hasEnglish(item.exampleTh)) {
        item.exampleTh = `ตัวอย่างประโยคของคำว่า "${item.word}"`;
    }
}

const fileContent = `export const hsk7to9Data = ${JSON.stringify(hsk7to9Data, null, 2)};\n`;
fs.writeFileSync('./src/data/hsk7to9Data.ts', fileContent, 'utf-8');
console.log("Forced overwrite to clean Thai fallbacks");
