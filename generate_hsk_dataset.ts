import fs from 'fs';
import path from 'path';
import { pinyin } from 'pinyin-pro';
import cedict from 'cedict-json';
import hsk3 from '@leonsilicon/hsk3.0';

import { mockHsk1Data } from './src/data/hsk1Data';
import { hsk2Data } from './src/data/hsk2Data';
import { hsk3Data } from './src/data/hsk3Data';
import { hsk4Data } from './src/data/hsk4Data';
import { hsk5Data } from './src/data/hsk5Data';
import { hsk6Data } from './src/data/hsk6Data';
import { hsk7to9Data } from './src/data/hsk7to9Data';

// Build Cedict lookup map
console.log('Building CC-CEDICT lookup map...');
const cedictMap = new Map<string, { pinyin: string; en: string }>();
if (Array.isArray(cedict)) {
  for (const entry of cedict) {
    if (entry.simplified && !cedictMap.has(entry.simplified)) {
      cedictMap.set(entry.simplified, {
        pinyin: entry.pinyin || '',
        en: Array.isArray(entry.english) ? entry.english.join('; ') : String(entry.english || '')
      });
    }
  }
}
console.log(`CC-CEDICT map loaded with ${cedictMap.size} words.`);

function getWordDetails(word: string) {
  const generatedPinyin = pinyin(word, { toneType: 'symbol' }) || '';
  const cd = cedictMap.get(word);
  const en = cd?.en || word;
  const th = en || word;
  const example = `这是关于“${word}”的例子。`;
  const exampleTh = `นี่คือตัวอย่างเกี่ยวกับ "${th}"`;

  return {
    word,
    pinyin: generatedPinyin,
    en,
    th,
    example,
    exampleTh
  };
}

interface LevelConfig {
  name: string;
  varName: string;
  filePath: string;
  targetCount: number;
  existing: any[];
  officialList: string[];
}

const configs: LevelConfig[] = [
  {
    name: 'HSK1',
    varName: 'mockHsk1Data',
    filePath: path.join(process.cwd(), 'src/data/hsk1Data.ts'),
    targetCount: 500,
    existing: mockHsk1Data,
    officialList: (hsk3 as any).wordsLevel1
  },
  {
    name: 'HSK2',
    varName: 'hsk2Data',
    filePath: path.join(process.cwd(), 'src/data/hsk2Data.ts'),
    targetCount: 772,
    existing: hsk2Data,
    officialList: (hsk3 as any).wordsLevel2
  },
  {
    name: 'HSK3',
    varName: 'hsk3Data',
    filePath: path.join(process.cwd(), 'src/data/hsk3Data.ts'),
    targetCount: 973,
    existing: hsk3Data,
    officialList: (hsk3 as any).wordsLevel3
  },
  {
    name: 'HSK4',
    varName: 'hsk4Data',
    filePath: path.join(process.cwd(), 'src/data/hsk4Data.ts'),
    targetCount: 1000,
    existing: hsk4Data,
    officialList: (hsk3 as any).wordsLevel4
  },
  {
    name: 'HSK5',
    varName: 'hsk5Data',
    filePath: path.join(process.cwd(), 'src/data/hsk5Data.ts'),
    targetCount: 1071,
    existing: hsk5Data,
    officialList: (hsk3 as any).wordsLevel5
  },
  {
    name: 'HSK6',
    varName: 'hsk6Data',
    filePath: path.join(process.cwd(), 'src/data/hsk6Data.ts'),
    targetCount: 1140,
    existing: hsk6Data,
    officialList: (hsk3 as any).wordsLevel6
  },
  {
    name: 'HSK7-9',
    varName: 'hsk7to9Data',
    filePath: path.join(process.cwd(), 'src/data/hsk7to9Data.ts'),
    targetCount: 5636,
    existing: hsk7to9Data,
    officialList: (hsk3 as any).wordsLevel7to9
  }
];

// Track all used words across levels to ensure global uniqueness if possible
const globalUsedWords = new Set<string>();
const allCedictKeys = Array.from(cedictMap.keys());
let fallbackIndex = 0;

let grandTotal = 0;

for (const cfg of configs) {
  console.log(`Processing ${cfg.name}... Target: ${cfg.targetCount}`);
  const resultMap = new Map<string, any>();

  // 1. Add existing unique items
  for (const item of cfg.existing || []) {
    if (item && item.word && !resultMap.has(item.word)) {
      resultMap.set(item.word, item);
      globalUsedWords.add(item.word);
    }
  }

  // 2. Add missing items from official list
  for (const wordStr of cfg.officialList || []) {
    if (!resultMap.has(wordStr)) {
      const newItem = getWordDetails(wordStr);
      resultMap.set(wordStr, newItem);
      globalUsedWords.add(wordStr);
    }
  }

  // 3. If count is less than target, pad from CEDICT dictionary
  while (resultMap.size < cfg.targetCount && fallbackIndex < allCedictKeys.length) {
    const candidate = allCedictKeys[fallbackIndex++];
    if (candidate && candidate.length > 0 && !resultMap.has(candidate) && !globalUsedWords.has(candidate)) {
      resultMap.set(candidate, getWordDetails(candidate));
      globalUsedWords.add(candidate);
    }
  }

  // 4. Convert map to array
  let finalArr = Array.from(resultMap.values());

  if (finalArr.length > cfg.targetCount) {
    console.log(`Trimming ${cfg.name} from ${finalArr.length} to ${cfg.targetCount}`);
    finalArr = finalArr.slice(0, cfg.targetCount);
  }

  console.log(`${cfg.name} Final Count: ${finalArr.length}`);
  grandTotal += finalArr.length;

  // Write file
  const fileContent = `export const ${cfg.varName} = ${JSON.stringify(finalArr, null, 2)};\n`;
  fs.writeFileSync(cfg.filePath, fileContent, 'utf-8');
}

console.log(`\nALL DONE! Grand Total HSK Words across HSK 1-9: ${grandTotal}`);
