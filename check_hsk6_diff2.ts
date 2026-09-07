import { hsk6Data } from './src/data/hsk6Data.ts';
import * as hsk3 from '@leonsilicon/hsk3.0';

const currentHsk6 = new Set(hsk6Data.map(x => x.word));
const officialHsk6 = hsk3.hsk30WordsLevel6;

const missingInCurrent6 = officialHsk6.filter(w => !currentHsk6.has(w));
console.log('Missing (Official words not in app):', missingInCurrent6);

const extraInCurrent6 = [...currentHsk6].filter(w => !officialHsk6.includes(w));
console.log('Extra (App words not in official):', extraInCurrent6);
console.log('App length:', hsk6Data.length, 'Official length:', officialHsk6.length);
