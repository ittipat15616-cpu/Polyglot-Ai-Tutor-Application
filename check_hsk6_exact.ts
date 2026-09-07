import { hsk6Data } from './src/data/hsk6Data.ts';
import * as hsk3 from '@leonsilicon/hsk3.0';

const currentHsk6 = hsk6Data.map(x => x.word);
const officialHsk6 = hsk3.hsk30WordsLevel6;

// To find what's missing, let's see which words from officialHsk6 are NOT in currentHsk6 at all
const missing = officialHsk6.filter(w => !currentHsk6.includes(w));
console.log('Missing exactly from official:', missing);
