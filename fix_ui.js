const fs = require('fs');

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Replace top-28 with top-40
  content = content.replace(/top-28 right-6/g, 'top-40 right-6');
  content = content.replace(/top-6 right-6/g, 'top-40 right-6');
  
  // Remove block <a> ... </a> that has "ดาวน์โหลด PDF" or "โหลดไฟล์ PDF" or "โหลด PDF" or "ดาวน์โหลดไฟล์" or "Download Image" or download
  // We can use a regex to match the <a> tag
  content = content.replace(/<a[^>]+download[^>]*>[\s\S]*?<\/a>/g, '');
  
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Processed ${filePath}`);
}

processFile('src/components/ExercisesArea.tsx');
processFile('src/components/ExamsArea.tsx');
processFile('src/components/IeltsPracticeArea.tsx');
processFile('src/components/IeltsMockTestArea.tsx');
