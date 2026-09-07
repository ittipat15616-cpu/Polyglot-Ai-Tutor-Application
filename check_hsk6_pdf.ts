import { hsk6Data } from './src/data/hsk6Data.ts';
import * as hsk3 from '@leonsilicon/hsk3.0';

const officialHsk6 = hsk3.hsk30WordsLevel6;
console.log('Total official words:', officialHsk6.length);

const currentWords = hsk6Data.map(x => x.word);
console.log('Total app words:', currentWords.length);

const appCounts = {};
for (const w of currentWords) {
    appCounts[w] = (appCounts[w] || 0) + 1;
}

const offCounts = {};
for (const w of officialHsk6) {
    offCounts[w] = (offCounts[w] || 0) + 1;
}

let missingCount = 0;
for (const w in offCounts) {
    if (w === '好（不）容易' || w.includes('（')) continue;
    const diff = offCounts[w] - (appCounts[w] || 0);
    if (diff > 0) {
        console.log(`Missing ${diff} instance(s) of: ${w}`);
        missingCount += diff;
    }
}
console.log('Total missing normal words:', missingCount);
