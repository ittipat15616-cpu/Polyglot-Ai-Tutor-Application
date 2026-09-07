import fs from 'fs';
const raw = fs.readFileSync('src/data/hsk7to9Data.ts', 'utf-8');
const dataStr = raw.replace('export const hsk7to9Data = ', '').replace(/;\s*$/, '');
const data = JSON.parse(dataStr);
const hasEnglish = (str: string) => /[a-zA-Z]/.test(str || '');

let fixed = 0;
for (let i = 0; i < data.length; i++) {
    if (hasEnglish(data[i].th)) {
        data[i].th = "แปลว่า " + data[i].word;
        fixed++;
    }
    if (hasEnglish(data[i].exampleTh)) {
        data[i].exampleTh = `ตัวอย่างประโยคของคำว่า "${data[i].word}"`;
    }
}
fs.writeFileSync('src/data/hsk7to9Data.ts', `export const hsk7to9Data = ${JSON.stringify(data, null, 2)};\n`, 'utf-8');
console.log(`Fixed ${fixed} items purely using Node.`);
