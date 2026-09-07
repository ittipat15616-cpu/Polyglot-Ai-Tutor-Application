const fs = require('fs');
let content = fs.readFileSync('./src/data/hsk7to9Data.ts', 'utf8');

const regex = /"word":\s*"([^"（]*)[（\(]([^"）\)]+)[）\)]"/g;
content = content.replace(regex, (match, before, inside) => {
  console.log(`Replaced: ${before}（${inside}） -> ${inside}`);
  return `"word": "${inside}"`;
});

fs.writeFileSync('./src/data/hsk7to9Data.ts', content, 'utf8');
