import { hsk5Data } from './src/data/hsk5Data';
console.log('First 10:', hsk5Data.slice(0, 10).map(x => x.word + ' (' + x.pinyin + ')'));
console.log('Missing pinyin:', hsk5Data.filter(x => !x.pinyin || x.pinyin.trim() === '').map(x => x.word));
