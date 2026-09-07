const fs = require('fs');
const buffer = fs.readFileSync('./src/data/hsk7to9Data.ts');
let count = 0;
const target = Buffer.from('"word"');
for (let i = 0; i <= buffer.length - target.length; i++) {
  let match = true;
  for (let j = 0; j < target.length; j++) {
    if (buffer[i+j] !== target[j]) {
      match = false;
      break;
    }
  }
  if (match) count++;
}
console.log("Count of 'word':", count);
