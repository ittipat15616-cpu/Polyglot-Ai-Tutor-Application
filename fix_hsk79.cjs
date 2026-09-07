const fs = require('fs');
const buf = fs.readFileSync('./src/data/hsk7to9Data.ts');

let cleanChars = [];
for (let i = 0; i < buf.length; i++) {
  if (buf[i] >= 32 || buf[i] === 10 || buf[i] === 13) {
    cleanChars.push(String.fromCharCode(buf[i]));
  }
}
const text = cleanChars.join('');
const regex = /\{\s*"word"\s*:\s*"[^"]*",\s*"pinyin"\s*:\s*"[^"]*",\s*"en"\s*:\s*"[^"]*",\s*"th"\s*:\s*"[^"]*",\s*"example"\s*:\s*"[^"]*",\s*"exampleTh"\s*:\s*"[^"]*"\s*\}/g;
const matches = text.match(regex);

if (matches) {
  const content = `export const hsk7to9Data = [\n  ${matches.join(',\n  ')}\n];\n`;
  fs.writeFileSync('./src/data/hsk7to9Data.ts', content, 'utf8');
  console.log('Fixed! Total words:', matches.length);
}
