import fs from 'fs';
import { globSync } from 'glob';

const files = globSync('src/components/games/*.tsx');

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');

  // Remove wordCount state
  content = content.replace(/const \[wordCount, setWordCount\] = useState<number>\(\d+\);\n/g, '');

  // Replace countToUse
  content = content.replace(/const countToUse = Math\.min\(wordCount, vocabList\.length\);/g, 'const countToUse = vocabList.length;');
  
  // Also MatchMaster specific:
  content = content.replace(/ใช้เวลา: \{wordCount \* 5\} วินาที/g, 'ใช้เวลา: {timeLimitSeconds || 60} วินาที');

  // Regex to remove the entire Word Count selection div in START SCREEN
  // Look for a div with the label 'ระบุจำนวนคำศัพท์' until the START button
  content = content.replace(/<div className="w-full [^"]+"[^>]*>\s*<div className="flex items-center justify-between mb-2">\s*<label[^>]*>[\s\S]*?ระบุจำนวนคำศัพท์[\s\S]*?<\/label>[\s\S]*?<\/div>[\s\S]*?<\/div>\s*<\/div>\s*<button/g, '<button');

  // AudioBombGame leftovers
  content = content.replace(/<div className="relative mb-4">\s*<input[\s\S]*?<\/div>\s*<div className="flex flex-wrap gap-2 justify-center">[\s\S]*?<\/div>\s*<button/g, '<button');

  fs.writeFileSync(file, content);
}
console.log("Done");
