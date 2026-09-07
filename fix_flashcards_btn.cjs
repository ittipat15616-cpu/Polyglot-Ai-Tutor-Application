const fs = require('fs');
let code = fs.readFileSync('src/components/FlashcardsArea.tsx', 'utf8');

const oldBtn = /<Play size=\{18\} \/> ไปทบทวน/;
const newBtn = `<Play size={18} /> {gnReminder.type === 'resume' ? 'เรียนต่อ' : gnReminder.type === 'next' ? 'ด่านถัดไป' : 'ไปทบทวน'}`;

code = code.replace(oldBtn, newBtn);

fs.writeFileSync('src/components/FlashcardsArea.tsx', code);
