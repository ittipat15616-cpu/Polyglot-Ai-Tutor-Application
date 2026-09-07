const fs = require('fs');
const { execSync } = require('child_process');

const files = [
  'hsk1Data.ts',
  'hsk2Data.ts',
  'hsk3Data.ts',
  'hsk4Data.ts',
  'hsk5Data.ts',
  'hsk6Data.ts',
  'hsk7to9Data.ts'
];

let totalCurrent = 0;
let totalOriginal = 0;

console.log("File | Original Count | Current Count | Difference");
console.log("--------------------------------------------------");

for (const file of files) {
  const filePath = `./src/data/${file}`;
  
  // Current count
  let currentContent = fs.readFileSync(filePath, 'utf-8');
  let currentMatch = currentContent.match(/export const .*? = (\[[\s\S]*\]);?/);
  let currentCount = 0;
  if (currentMatch) {
    try {
      let arr = JSON.parse(currentMatch[1]);
      currentCount = arr.length;
    } catch(e) {
      // fallback if JSON.parse fails due to trailing comma etc
      currentCount = (currentContent.match(/"word":/g) || []).length;
    }
  } else {
    currentCount = (currentContent.match(/"word":/g) || []).length;
  }
  
  // Original count
  let originalCount = 0;
  try {
    let originalContent = execSync(`git show HEAD:src/data/${file}`).toString();
    let origMatch = originalContent.match(/export const .*? = (\[[\s\S]*\]);?/);
    if (origMatch) {
      try {
        let arr = JSON.parse(origMatch[1]);
        originalCount = arr.length;
      } catch(e) {
        originalCount = (originalContent.match(/"word":/g) || []).length;
      }
    } else {
      originalCount = (originalContent.match(/"word":/g) || []).length;
    }
  } catch(e) {
    console.error(`Error getting git original for ${file}`);
  }
  
  const diff = currentCount - originalCount;
  console.log(`${file.padEnd(15)} | ${originalCount.toString().padStart(14)} | ${currentCount.toString().padStart(13)} | ${diff.toString().padStart(10)}`);
  
  totalCurrent += currentCount;
  totalOriginal += originalCount;
}

console.log("--------------------------------------------------");
console.log(`TOTAL           | ${totalOriginal.toString().padStart(14)} | ${totalCurrent.toString().padStart(13)} | ${(totalCurrent - totalOriginal).toString().padStart(10)}`);

