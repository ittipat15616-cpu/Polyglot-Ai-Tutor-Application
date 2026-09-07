import { hsk6Data } from './src/data/hsk6Data.ts';
import * as hsk3 from '@leonsilicon/hsk3.0';

const currentHsk6 = new Set(hsk6Data.map(x => x.word));
const officialHsk6 = hsk3.hsk30WordsLevel6;

// Let's count occurrences in official list
const officialCounts = {};
for (const w of officialHsk6) {
    officialCounts[w] = (officialCounts[w] || 0) + 1;
}

const currentCounts = {};
for (const w of hsk6Data.map(x => x.word)) {
    currentCounts[w] = (currentCounts[w] || 0) + 1;
}

console.log('Words that appear more in official than in app:');
for (const w in officialCounts) {
    if (officialCounts[w] > (currentCounts[w] || 0)) {
        console.log(w, `Official: ${officialCounts[w]}, App: ${currentCounts[w] || 0}`);
    }
}
