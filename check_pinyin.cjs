const fs = require('fs');

const files = ['src/data/hsk1Data.ts', 'src/data/hsk2Data.ts', 'src/data/hsk3Data.ts', 'src/data/hsk4Data.ts', 'src/data/hsk5Data.ts', 'src/data/hsk6Data.ts'];

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const content = fs.readFileSync(file, 'utf-8');
  const regex = /"word":\s*"([^"]+)",\s*"pinyin":\s*"([^"]+)"/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const word = match[1];
    const py = match[2];
    
    // Check if py has english words by splitting it
    const parts = py.split(/\s+/);
    for (const part of parts) {
      if (part.length > 5 && !/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü1-4]/.test(part)) {
         console.log(`Suspicious pinyin in ${file}: word=${word}, pinyin=${py}, part=${part}`);
      }
    }
  }
}
