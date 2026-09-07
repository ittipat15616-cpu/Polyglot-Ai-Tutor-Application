const fs = require('fs');

const { hsk7to9Data } = require('./src/data/hsk7to9Data.ts');

const missingPinyinMap = {
  "不利于": "bù lì yú",
  "不肯": "bù kěn",
  "不难": "bù nán",
  "不如说": "bù rú shuō",
  "不予": "bù yǔ",
  "趁着": "chèn zhe",
  "定为": "dìng wéi",
  "度": "dù",
  "飞往": "fēi wǎng",
  "非": "fēi",
  "感": "gǎn",
  "公益性": "gōng yì xìng",
  "怀着": "huái zhe",
  "率": "lǜ",
  "茅台": "máo tái",
  "难以想象": "nán yǐ xiǎng xiàng",
  "说起来": "shuō qǐ lái",
  "业": "yè",
  "度（知名度）": "dù (zhī míng dù)",
  "非（非金属）": "fēi (fēi jīn shǔ)",
  "感（责任感）": "gǎn (zé rèn gǎn)",
  "率（成功率）": "lǜ (chéng gōng lǜ)",
  "茅台（酒）": "máo tái (jiǔ)",
  "业（服务业）": "yè (fú wù yè)",
  "致力于": "zhì lì yú",
  "着眼于": "zhuó yǎn yú"
};

const tones = {
  a: ['a', 'ā', 'á', 'ǎ', 'à', 'a'],
  e: ['e', 'ē', 'é', 'ě', 'è', 'e'],
  i: ['i', 'ī', 'í', 'ǐ', 'ì', 'i'],
  o: ['o', 'ō', 'ó', 'ǒ', 'ò', 'o'],
  u: ['u', 'ū', 'ú', 'ǔ', 'ù', 'u'],
  'ü': ['ü', 'ǖ', 'ǘ', 'ǚ', 'ǜ', 'ü']
};

function convertNumberedPinyin(pinyin) {
  if (!pinyin) return '';
  pinyin = pinyin.replace(/v/g, 'ü');

  return pinyin.split(' ').map(syllable => {
    const match = syllable.match(/^([A-Za-zü]+)(\d)$/i);
    if (!match) return syllable;

    let word = match[1];
    const tone = parseInt(match[2], 10);

    if (tone < 1 || tone > 5) return word; 
    if (tone === 5) return word;

    let toneChar = '';
    const lowerWord = word.toLowerCase();
    
    if (lowerWord.includes('a')) {
      toneChar = 'a';
    } else if (lowerWord.includes('o')) {
      toneChar = 'o';
    } else if (lowerWord.includes('e')) {
      toneChar = 'e';
    } else {
      for (let i = lowerWord.length - 1; i >= 0; i--) {
        if (['i', 'u', 'ü'].includes(lowerWord[i])) {
          toneChar = lowerWord[i];
          break;
        }
      }
    }

    if (toneChar) {
      const lastIndex = lowerWord.lastIndexOf(toneChar);
      const charToReplace = word[lastIndex];
      const isUpper = charToReplace === charToReplace.toUpperCase();
      let replacement = tones[toneChar][tone];
      if (isUpper) replacement = replacement.toUpperCase();
      word = word.substring(0, lastIndex) + replacement + word.substring(lastIndex + 1);
    }

    return word;
  }).join(' ');
}

// Process all items
let convertedCount = 0;
for (let i = 0; i < hsk7to9Data.length; i++) {
  const item = hsk7to9Data[i];
  
  // 1. Add missing pinyins
  if (missingPinyinMap[item.word] && (!item.pinyin || item.pinyin.trim() === '')) {
    item.pinyin = missingPinyinMap[item.word];
  }
  
  // 2. Convert numeric pinyin to tone marks
  const originalPinyin = item.pinyin;
  const newPinyin = convertNumberedPinyin(originalPinyin);
  if (originalPinyin !== newPinyin) {
    item.pinyin = newPinyin;
    convertedCount++;
  }
}

// 3. Sort A-Z by pinyin
const getSortKey = (str) => {
    if (!str) return '';
    return str.replace(/[üǖǘǚǜ]/g, 'v').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '').toLowerCase();
}

hsk7to9Data.sort((a, b) => {
  const keyA = getSortKey(a.pinyin);
  const keyB = getSortKey(b.pinyin);
  if (keyA !== keyB) {
    return keyA.localeCompare(keyB);
  }
  return a.word.localeCompare(b.word);
});

// Write to file
const fileContent = `export const hsk7to9Data = ${JSON.stringify(hsk7to9Data, null, 2)};\n`;
fs.writeFileSync('./src/data/hsk7to9Data.ts', fileContent, 'utf-8');

console.log(`Converted ${convertedCount} numeric pinyin entries.`);
console.log('Successfully sorted and updated hsk7to9Data.ts');

