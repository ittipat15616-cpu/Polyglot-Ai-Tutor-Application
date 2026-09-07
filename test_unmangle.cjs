const fs = require('fs');
const buf = fs.readFileSync('/tmp/hsk7to9_clean.ts');

let cleanChars = [];
for (let i = 0; i < buf.length; i++) {
  if (buf[i] >= 32 || buf[i] === 10 || buf[i] === 13) {
    cleanChars.push(String.fromCharCode(buf[i]));
  }
}
const text = cleanChars.join('');

const lastWord = text.lastIndexOf('"word"');
const mangledPart = text.slice(lastWord, lastWord + 2000);

try {
  const unmangled = Buffer.from(mangledPart, 'latin1').toString('utf8');
  console.log(unmangled.substring(0, 500));
} catch (e) {
  console.log("Error:", e);
}
