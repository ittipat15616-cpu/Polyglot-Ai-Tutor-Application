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

for (const file of files) {
  const content = fs.readFileSync(`./src/data/${file}`, 'utf-8');
  const matches = [...content.matchAll(/"word":\s*"([^"]*（[^"]*）[^"]*)"/g)];
  if (matches.length > 0) {
    console.log(`\nFile: ${file}`);
    matches.forEach(m => console.log(m[1]));
  }
}
