const fs = require('fs');
const glob = require('glob');

const files = glob.sync('src/data/hsk*.ts');
const pinyinRegex = /^[a-zA-Zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü\s\d,]+$/i;

for (const file of files) {
  const content = fs.readFileSync(file, 'utf-8');
  // quick and dirty regex to extract pinyin
  const regex = /"pinyin":\s*"([^"]+)"/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const py = match[1];
    // if it contains something that is clearly an english word but not a pinyin word...
    // this is harder. But we can just print any pinyin that has no tones at all, but wait, neutral tone has no tones (like "ma").
    // Let's print out pinyin longer than 6 letters that have no tone marks, maybe?
    // Actually, "other" had no tone mark.
    if (!pinyinRegex.test(py)) {
       console.log(`Unrecognized chars in ${file}: ${py}`);
    }
  }
}
