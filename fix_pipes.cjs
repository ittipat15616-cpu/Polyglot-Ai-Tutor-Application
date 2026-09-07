const fs = require('fs');
const path = require('path');

const dir = './src/data';
const files = fs.readdirSync(dir).filter(f => f.endsWith('Data.ts'));
for (const file of files) {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf-8');
  let newContent = content.replace(/"word":\s*"([^|"]+)\|([^"]+)"/g, '"word": "$1"');
  if (content !== newContent) {
    fs.writeFileSync(filePath, newContent, 'utf-8');
    console.log(`Updated ${file}`);
  }
}
