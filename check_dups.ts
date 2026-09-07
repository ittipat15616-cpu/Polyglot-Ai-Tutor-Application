import { mockHsk1Data } from './src/data/hsk1Data';
const res = mockHsk1Data.filter(x => x.word.includes('爸') || x.word.includes('弟'));
console.log(res);
