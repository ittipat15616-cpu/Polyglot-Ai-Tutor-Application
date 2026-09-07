import { hsk7to9Data } from './src/data/hsk7to9Data';

let enCount = 0;
let wordCount = 0;
let thaiCount = 0;

for (let i = 2197; i < hsk7to9Data.length; i++) {
    const item = hsk7to9Data[i];
    if (item.th === item.en) enCount++;
    else if (item.th === item.word) wordCount++;
    else thaiCount++;
}
console.log(`From 2198 to ${hsk7to9Data.length}:`);
console.log(`English: ${enCount}`);
console.log(`Same as word: ${wordCount}`);
console.log(`Thai (other): ${thaiCount}`);
