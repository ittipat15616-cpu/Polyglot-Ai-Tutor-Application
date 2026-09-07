import { hsk6Data } from './src/data/hsk6Data.ts';
import * as hsk3 from '@leonsilicon/hsk3.0';

const currentWords = new Set(hsk6Data.map(x => x.word));

const missing = [];
for (const w of hsk3.hsk30WordsLevel6) {
    if (currentWords.has(w)) continue;
    // Check if expanded form is there
    if (w === '好（不）容易' && currentWords.has('好不容易') && currentWords.has('好容易')) continue;
    if (w.includes('（')) {
        const m = w.match(/^(.*)（(.*)）$/);
        if (m && currentWords.has(m[1]) && currentWords.has(m[2])) continue;
    }
    missing.push(w);
}

console.log('Really missing from official:', missing);
