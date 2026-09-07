const fs = require('fs');
let content = fs.readFileSync('./src/data/hsk7to9Data.ts', 'utf-8');
let arrayStr = content.substring(content.indexOf('[')).trim();
if (arrayStr.endsWith(';')) arrayStr = arrayStr.slice(0, -1);
try {
  let data = JSON.parse(arrayStr);
  console.log(`hsk7to9Data.ts: ${data.length}`);
} catch (e) {
  console.log(`error parsing hsk7to9Data.ts: ${e}`);
  // Let's count by occurrences of "word":
  const matches = content.match(/"word":/g) || [];
  console.log(`Occurrences of "word": ${matches.length}`);
}
