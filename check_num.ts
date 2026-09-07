import { hsk5Data } from './src/data/hsk5Data';
console.log('Words starting with numbers:', hsk5Data.filter(x => /^[0-9]/.test(x.word)).map(x => x.word));
