import { mockHsk1Data } from './src/data/hsk1Data';
const res = mockHsk1Data.filter(x => ['地', '干', '还'].includes(x.word));
console.log(res);
