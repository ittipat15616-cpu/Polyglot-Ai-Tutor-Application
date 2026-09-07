const fs = require('fs');

let fileContent = fs.readFileSync('./src/data/hsk3Data.ts', 'utf-8');

// Replace the specific words
fileContent = fileContent.replace(/"word": "\.\.\.极了"/g, '"word": "极"');
fileContent = fileContent.replace(/"word": "…极了"/g, '"word": "极了"');
fileContent = fileContent.replace(/"word": "%"/g, '"word": "百分之"');

fileContent = fileContent.replace(/"pinyin": "… jí le"/g, '"pinyin": "jí"');
// Note: wait, …极了 might share the same pinyin in the file. Let's do it cleanly by parsing.

