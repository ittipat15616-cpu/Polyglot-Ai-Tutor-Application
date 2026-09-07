const fs = require('fs');

const files = [
  'hsk1Data.ts',
  'hsk2Data.ts',
  'hsk3Data.ts',
  'hsk4Data.ts',
  'hsk5Data.ts',
  'hsk6Data.ts',
  'hsk7to9Data.ts'
];

let total = 0;
for (const file of files) {
  const content = fs.readFileSync(`./src/data/${file}`, 'utf-8');
  const arrayStart = content.indexOf('[');
  let arrayStr = content.substring(arrayStart).trim();
  if (arrayStr.endsWith(';')) arrayStr = arrayStr.slice(0, -1);
  try {
    const data = JSON.parse(arrayStr);
    console.log(`${file}: ${data.length}`);
    total += data.length;
  } catch(e) {
    console.log(`${file}: error parsing`);
  }
}
console.log(`Total: ${total}`);
