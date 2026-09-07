import { hsk6Data } from './src/data/hsk6Data.ts';
import * as hsk3 from '@leonsilicon/hsk3.0';

const currentHsk6 = new Set(hsk6Data.map(x => x.word));
const officialHsk6 = hsk3.hsk30WordsLevel6;

// Normalize official words to remove brackets for matching
const normalizedOfficial = officialHsk6.flatMap(w => {
    if (w === '好（不）容易') return ['好不容易', '好容易'];
    if (w.includes('（')) {
        const match = w.match(/^(.*)（(.*)）$/);
        if (match) {
            return [match[1], match[2]];
        }
    }
    return [w];
});

const normalizedOfficialSet = new Set(normalizedOfficial);

const missing = normalizedOfficial.filter(w => !currentHsk6.has(w));
console.log('Missing from current (normalized):', missing);

const extra = [...currentHsk6].filter(w => !normalizedOfficialSet.has(w));
console.log('Extra in current:', extra);
