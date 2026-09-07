const fs = require('fs');
const buf = fs.readFileSync('./src/data/hsk7to9Data.ts');
// The file is 885882 bytes.
// Let's just try to find all occurrences of "word" by treating it as latin1 and decoding.
const text = buf.toString('latin1');
const unmojibaked = Buffer.from(text, 'latin1').toString('utf8');
const count = (unmojibaked.match(/\"word\"/g) || []).length;
console.log("Count in full unmojibaked:", count);
