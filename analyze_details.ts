import hsk3 from '@leonsilicon/hsk3.0';
import { mockHsk1Data } from './src/data/hsk1Data';
import { hsk2Data } from './src/data/hsk2Data';
import { hsk3Data } from './src/data/hsk3Data';
import { hsk4Data } from './src/data/hsk4Data';
import { hsk5Data } from './src/data/hsk5Data';
import { hsk6Data } from './src/data/hsk6Data';
import { hsk7to9Data } from './src/data/hsk7to9Data';

const levels = [
  { name: 'HSK1', target: 500, existing: mockHsk1Data, hsk3List: (hsk3 as any).wordsLevel1 },
  { name: 'HSK2', target: 772, existing: hsk2Data, hsk3List: (hsk3 as any).wordsLevel2 },
  { name: 'HSK3', target: 973, existing: hsk3Data, hsk3List: (hsk3 as any).wordsLevel3 },
  { name: 'HSK4', target: 1000, existing: hsk4Data, hsk3List: (hsk3 as any).wordsLevel4 },
  { name: 'HSK5', target: 1071, existing: hsk5Data, hsk3List: (hsk3 as any).wordsLevel5 },
  { name: 'HSK6', target: 1140, existing: hsk6Data, hsk3List: (hsk3 as any).wordsLevel6 },
  { name: 'HSK7-9', target: 5636, existing: hsk7to9Data, hsk3List: (hsk3 as any).wordsLevel7to9 },
];

for (const l of levels) {
  const wordsArr = (l.existing || []).map((x: any) => x.word);
  const uniqueWords = new Set(wordsArr);
  const dupes = wordsArr.length - uniqueWords.size;

  const hsk3Words = (l.hsk3List || []).map((w: any) => typeof w === 'string' ? w : (w.word || w.simplified || w.hanzi));
  const missingFromHsk3 = hsk3Words.filter(w => !uniqueWords.has(w));
  const extraInExisting = [...uniqueWords].filter(w => !new Set(hsk3Words).has(w));

  console.log(`=== ${l.name} ===`);
  console.log(`Target: ${l.target} | Existing count: ${l.existing.length} | Unique in existing: ${uniqueWords.size} | Dupes: ${dupes}`);
  console.log(`Missing from official list: ${missingFromHsk3.length}`);
  console.log(`Extra in existing not in official list: ${extraInExisting.length}`);
}
