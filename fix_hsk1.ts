import fs from 'fs';
import { mockHsk1Data } from './src/data/hsk1Data';
import { hsk7to9Data } from './src/data/hsk7to9Data';
import hsk3 from '@leonsilicon/hsk3.0';

console.log('HSK1 total:', mockHsk1Data.length);
const words = mockHsk1Data.map(x => x.word);
const duplicates = words.filter((w, i) => words.indexOf(w) !== i);
console.log('Duplicates:', [...new Set(duplicates)]);

const officialHsk1 = hsk3.wordsLevel1;
console.log('Official HSK1 count:', officialHsk1.length);
const missing = officialHsk1.filter(w => !words.includes(w));
console.log('Missing in HSK1:', missing);
