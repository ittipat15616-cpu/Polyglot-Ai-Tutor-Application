import { hsk1Data } from './src/data/hsk1Data';
import { hsk7to9Data } from './src/data/hsk7to9Data';

console.log('HSK1 total:', hsk1Data.length);
const words = hsk1Data.map(x => x.word);
const duplicates = words.filter((w, i) => words.indexOf(w) !== i);
console.log('Duplicates:', [...new Set(duplicates)]);

const badItems = hsk1Data.filter(x => /[\u4e00-\u9fa5]/.test(x.th));
console.log('Items with Chinese in TH translation:', badItems.map(x => x.word + ' -> ' + x.th));

const startsWithA = hsk1Data.filter(x => x.pinyin && x.pinyin.toLowerCase().startsWith('a'));
console.log('Words starting with A:', startsWithA.map(x => x.word));

console.log('HSK7-9 total:', hsk7to9Data.length);
