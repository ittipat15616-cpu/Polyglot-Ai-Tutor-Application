import { hsk5Data } from './src/data/hsk5Data.ts';
import { hsk6Data } from './src/data/hsk6Data.ts';
import * as hsk3 from '@leonsilicon/hsk3.0';

const currentHsk5 = new Set(hsk5Data.map(x => x.word));
const officialHsk5 = hsk3.hsk30WordsLevel5 || hsk3.default.hsk30WordsLevel5;

const missingInCurrent = officialHsk5.filter(w => !currentHsk5.has(w));
console.log('Missing in current HSK5:', missingInCurrent);

const currentHsk6 = new Set(hsk6Data.map(x => x.word));
const officialHsk6 = hsk3.hsk30WordsLevel6 || hsk3.default.hsk30WordsLevel6;

const missingInCurrent6 = officialHsk6.filter(w => !currentHsk6.has(w));
console.log('Missing in current HSK6:', missingInCurrent6);
