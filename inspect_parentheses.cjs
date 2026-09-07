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
  // Match full object
  const regex = /{[^{}]*"word":\s*"([^"]*([（(][^）)]+[）)])[^"]*)"[^{}]*}/g;
  let match;
  if (content.match(regex)) {
    console.log(`\nFile: ${file}`);
    const matches = content.match(regex);
    matches.forEach(m => console.log(m));
  }
}
