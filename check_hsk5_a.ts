import { hsk5Data } from './src/data/hsk5Data';
const aWords = hsk5Data.filter(x => x.pinyin && x.pinyin.toLowerCase().startsWith('a'));
console.log('Words starting with a:', aWords.map(x => x.word + ' (' + x.pinyin + ')'));
