import hsk3 from '@leonsilicon/hsk3.0';
import { mockHsk1Data } from './src/data/hsk1Data';
import { hsk2Data } from './src/data/hsk2Data';
import { hsk3Data } from './src/data/hsk3Data';
import { hsk4Data } from './src/data/hsk4Data';
import { hsk5Data } from './src/data/hsk5Data';
import { hsk6Data } from './src/data/hsk6Data';
import { hsk7to9Data } from './src/data/hsk7to9Data';

console.log('Sample item from existing hsk1Data:', mockHsk1Data[0]);
console.log('Sample item from existing hsk7to9Data:', hsk7to9Data[0]);
console.log('Sample item from hsk3.wordsLevel1:', (hsk3 as any).wordsLevel1[0]);
console.log('Sample item from hsk3.wordsLevel7to9:', (hsk3 as any).wordsLevel7to9[0]);

const levels = [
  { name: 'HSK1', existing: mockHsk1Data, hsk3List: (hsk3 as any).wordsLevel1 },
  { name: 'HSK2', existing: hsk2Data, hsk3List: (hsk3 as any).wordsLevel2 },
  { name: 'HSK3', existing: hsk3Data, hsk3List: (hsk3 as any).wordsLevel3 },
  { name: 'HSK4', existing: hsk4Data, hsk3List: (hsk3 as any).wordsLevel4 },
  { name: 'HSK5', existing: hsk5Data, hsk3List: (hsk3 as any).wordsLevel5 },
  { name: 'HSK6', existing: hsk6Data, hsk3List: (hsk3 as any).wordsLevel6 },
  { name: 'HSK7-9', existing: hsk7to9Data, hsk3List: (hsk3 as any).wordsLevel7to9 },
];

for (const l of levels) {
  const existingSet = new Set((l.existing || []).map((x: any) => x.word));
  const missingInExisting = (l.hsk3List || []).filter((w: any) => {
    const wordStr = typeof w === 'string' ? w : (w.word || w.simplified || w.hanzi);
    return !existingSet.has(wordStr);
  });
  console.log(`${l.name}: existing=${l.existing.length}, hsk3List=${l.hsk3List.length}, missing=${missingInExisting.length}`);
}
