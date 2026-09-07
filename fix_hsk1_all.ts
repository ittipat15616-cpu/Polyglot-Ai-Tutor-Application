import fs from 'fs';
import { mockHsk1Data } from './src/data/hsk1Data';

const badItems = mockHsk1Data.filter(x => /[\u4e00-\u9fa5]/.test(x.th));
console.log('Bad items:', badItems.length);
console.log(badItems.map(x => x.word));

const goodItems = mockHsk1Data.filter(x => !/[\u4e00-\u9fa5]/.test(x.th));
console.log('Good items:', goodItems.length);
