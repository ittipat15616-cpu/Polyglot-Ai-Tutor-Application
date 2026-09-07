import { mockHsk1Data } from './src/data/hsk1Data';
import { hsk2Data } from './src/data/hsk2Data';
import { hsk3Data } from './src/data/hsk3Data';
import { hsk4Data } from './src/data/hsk4Data';
import { hsk5Data } from './src/data/hsk5Data';
import { hsk6Data } from './src/data/hsk6Data';
import { hsk7to9Data } from './src/data/hsk7to9Data';

const datasets = [
  { name: 'HSK1', data: mockHsk1Data },
  { name: 'HSK2', data: hsk2Data },
  { name: 'HSK3', data: hsk3Data },
  { name: 'HSK4', data: hsk4Data },
  { name: 'HSK5', data: hsk5Data },
  { name: 'HSK6', data: hsk6Data },
  { name: 'HSK7-9', data: hsk7to9Data }
];

for (const ds of datasets) {
  const missing = ds.data.filter(x => !x.pinyin || x.pinyin.trim() === '');
  if (missing.length > 0) {
    console.log(`${ds.name} missing pinyins:`, missing.map(x => x.word));
  }
}
console.log('Done checking all datasets for missing pinyins.');
