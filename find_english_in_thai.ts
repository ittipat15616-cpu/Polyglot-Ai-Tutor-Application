import { mockHsk1Data } from './src/data/hsk1Data';
import { hsk2Data } from './src/data/hsk2Data';
import { hsk3Data } from './src/data/hsk3Data';
import { hsk4Data } from './src/data/hsk4Data';
import { hsk5Data } from './src/data/hsk5Data';
import { hsk6Data } from './src/data/hsk6Data';
import { hsk7to9Data } from './src/data/hsk7to9Data';

const levels = [
  { name: 'HSK1', data: mockHsk1Data },
  { name: 'HSK2', data: hsk2Data },
  { name: 'HSK3', data: hsk3Data },
  { name: 'HSK4', data: hsk4Data },
  { name: 'HSK5', data: hsk5Data },
  { name: 'HSK6', data: hsk6Data },
  { name: 'HSK7-9', data: hsk7to9Data },
];

const hasEnglish = (str: string) => /[a-zA-Z]/.test(str || '');

let totalWithEnglishInTh = 0;
let totalWithEnglishInExampleTh = 0;

for (const l of levels) {
  let thCount = 0;
  let exThCount = 0;
  for (const item of l.data || []) {
    if (hasEnglish(item.th)) thCount++;
    if (hasEnglish(item.exampleTh)) exThCount++;
  }
  console.log(`${l.name}: th has English=${thCount}, exampleTh has English=${exThCount}`);
  totalWithEnglishInTh += thCount;
  totalWithEnglishInExampleTh += exThCount;
}

console.log(`Total items where th contains English: ${totalWithEnglishInTh}`);
console.log(`Total items where exampleTh contains English: ${totalWithEnglishInExampleTh}`);
