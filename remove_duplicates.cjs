const fs = require('fs');

const files = [
  'hsk2Data.ts',
  'hsk3Data.ts',
];

for (const file of files) {
  const filePath = `./src/data/${file}`;
  let content = fs.readFileSync(filePath, 'utf-8');
  const arrayStart = content.indexOf('[');
  let arrayStr = content.substring(arrayStart).trim();
  const endsWithSemicolon = arrayStr.endsWith(';');
  if (endsWithSemicolon) arrayStr = arrayStr.slice(0, -1);
  
  let data = JSON.parse(arrayStr);
  const seen = new Set();
  const newData = [];
  
  // We want to keep the one with more information if possible.
  // Actually, I can sort them so the one with "example" or "th" is prioritized, but it's easier to just iterate backwards or merge.
  // Let's just group by word and merge.
  
  const wordMap = new Map();
  for (const item of data) {
    if (wordMap.has(item.word)) {
      const existing = wordMap.get(item.word);
      wordMap.set(item.word, { ...existing, ...item, th: item.th || existing.th, example: item.example || existing.example, exampleTh: item.exampleTh || existing.exampleTh });
    } else {
      wordMap.set(item.word, item);
    }
  }
  
  const finalData = Array.from(wordMap.values());
  // Assuming they are already sorted correctly, but Map.values() might change order if there were duplicates.
  // Wait, no, we should re-sort them.
  function removeTones(pinyin) {
    const toneMap = {
      'ā': 'a', 'á': 'a', 'ǎ': 'a', 'à': 'a',
      'ō': 'o', 'ó': 'o', 'ǒ': 'o', 'ò': 'o',
      'ē': 'e', 'é': 'e', 'ě': 'e', 'è': 'e',
      'ī': 'i', 'í': 'i', 'ǐ': 'i', 'ì': 'i',
      'ū': 'u', 'ú': 'u', 'ǔ': 'u', 'ù': 'u',
      'ǖ': 'v', 'ǘ': 'v', 'ǚ': 'v', 'ǜ': 'v', 'ü': 'v'
    };
    return (pinyin || '').replace(/[āáǎàōóǒòēéěèīíǐìūúǔùǖǘǚǜü]/g, match => toneMap[match] || match);
  }
  
  finalData.sort((a, b) => {
    const pinyinA = removeTones(a.pinyin || '').toLowerCase().replace(/[^a-z ]/g, '').trim();
    const pinyinB = removeTones(b.pinyin || '').toLowerCase().replace(/[^a-z ]/g, '').trim();
    const res = pinyinA.localeCompare(pinyinB, 'en');
    return res !== 0 ? res : (a.pinyin || '').localeCompare(b.pinyin || '', 'en');
  });

  const newDataStr = JSON.stringify(finalData, null, 2);
  content = content.substring(0, arrayStart) + newDataStr + (endsWithSemicolon ? ';\n' : '\n');
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log(`Deduplicated and sorted ${file}`);
}
