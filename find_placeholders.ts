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

let totalPlaceholders = 0;
for (const l of levels) {
  const placeholders = (l.data || []).filter((x: any) => x.example && x.example.includes('这是关于'));
  console.log(`${l.name}: ${placeholders.length} placeholder examples out of ${l.data.length}`);
  totalPlaceholders += placeholders.length;
}
console.log(`Total placeholder examples to replace: ${totalPlaceholders}`);
