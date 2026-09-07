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
  const exportName = file.replace('Data.ts', '') + 'Data';
  const arrayStartStr = `export const`;
  const startIndex = content.indexOf(arrayStartStr);
  if (startIndex === -1) continue;
  
  const arrayStart = content.indexOf('[', startIndex);
  let arrayStr = content.substring(arrayStart).trim();
  if (arrayStr.endsWith(';')) arrayStr = arrayStr.slice(0, -1);
  
  let data = JSON.parse(arrayStr);
  const wordCount = {};
  data.forEach(item => {
    wordCount[item.word] = (wordCount[item.word] || 0) + 1;
  });
  
  const duplicates = Object.keys(wordCount).filter(w => wordCount[w] > 1);
  if (duplicates.length > 0) {
    console.log(`Duplicates in ${file}: ${duplicates.join(', ')}`);
  }
}
