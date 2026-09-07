const fs = require('fs');
const txt = fs.readFileSync('./src/data/hsk7to9Data.ts', 'utf8');
const buf = Buffer.from(txt, 'latin1');
console.log(buf.toString('utf8').substring(0, 500));
