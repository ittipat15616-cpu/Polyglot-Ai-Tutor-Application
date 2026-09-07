import { mockHsk1Data } from './src/data/hsk1Data';
import { hsk2Data } from './src/data/hsk2Data';
import { hsk3Data } from './src/data/hsk3Data';
import { hsk4Data } from './src/data/hsk4Data';
import { hsk5Data } from './src/data/hsk5Data';
import { hsk6Data } from './src/data/hsk6Data';
import { hsk7to9Data } from './src/data/hsk7to9Data';

console.log('HSK1:', mockHsk1Data?.length || 0);
console.log('HSK2:', hsk2Data?.length || 0);
console.log('HSK3:', hsk3Data?.length || 0);
console.log('HSK4:', hsk4Data?.length || 0);
console.log('HSK5:', hsk5Data?.length || 0);
console.log('HSK6:', hsk6Data?.length || 0);
console.log('HSK7-9:', hsk7to9Data?.length || 0);

const total = (mockHsk1Data?.length || 0) +
  (hsk2Data?.length || 0) +
  (hsk3Data?.length || 0) +
  (hsk4Data?.length || 0) +
  (hsk5Data?.length || 0) +
  (hsk6Data?.length || 0) +
  (hsk7to9Data?.length || 0);

console.log('Total:', total);
