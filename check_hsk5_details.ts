import { hsk5Data } from './src/data/hsk5Data';
const words = ['差点儿', '称2', '城里'];
console.log(hsk5Data.filter(x => words.includes(x.word)));
