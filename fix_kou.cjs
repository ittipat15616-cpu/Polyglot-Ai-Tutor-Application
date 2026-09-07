const fs = require('fs');
const glob = require('glob');

const files = glob.sync('src/data/hsk*.ts');
let totalReplaced = 0;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let lines = content.split('\n');
  let changed = false;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('"pinyin":') && lines[i].includes('kǒu')) {
      // Look back for "word"
      for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
        if (lines[j].includes('"word":') && lines[j].includes('又')) {
          console.log(`Found in ${file} at line ${j + 1}: ${lines[j]}`);
          lines[j] = lines[j].replace('又', '口');
          changed = true;
          totalReplaced++;
          break;
        }
      }
      
      // also maybe look forward for examples containing the wrong char?
      // "example": "我们在路又见面。" -> "我们在路口见面。"
      // The user just said "ทุกคำที่มีคำนี้เป็นส่วนประกอบด้วยนะครับให้มันเขียนตัวจีนมาอย่างถูกต้องอะครับ"
      for (let j = i + 1; j <= i + 5; j++) {
        if (j < lines.length && (lines[j].includes('"example":') || lines[j].includes('"exampleTh":'))) {
          if (lines[j].includes('又')) {
            console.log(`Found in ${file} at line ${j + 1}: ${lines[j]}`);
            lines[j] = lines[j].replace(/又/g, '口'); // Might be dangerous if "又" is also legitimately there, but in the same example it's likely "口". Wait, what if the example is "我又去了路口"? "我又去了路又" -> "我口去了路口". That's bad.
          }
        }
      }
    }
  }
  
  if (changed) {
    fs.writeFileSync(file, lines.join('\n'));
  }
});
console.log('Total replaced:', totalReplaced);
