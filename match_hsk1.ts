import { mockHsk1Data } from './src/data/hsk1Data';
import hsk3 from '@leonsilicon/hsk3.0';

const official = hsk3.wordsLevel1;
const goodItems = mockHsk1Data.filter(x => !/[\u4e00-\u9fa5]/.test(x.th));
const goodWords = goodItems.map(x => x.word.replace('｜', '|').trim());

// Find what's in official that is NOT in goodWords
// For words with '|', check if either part matches
const reallyMissing = [];
for (const w of official) {
  if (!goodWords.includes(w)) {
    const parts = w.split('|');
    let found = false;
    for (const gw of goodWords) {
      if (gw === parts[0] || gw === w) {
        found = true;
        break;
      }
    }
    if (!found) {
      reallyMissing.push(w);
    }
  }
}
console.log('Really missing:', reallyMissing);

// Find what's in goodWords that is NOT in official
const reallyExtra = [];
for (const gw of goodWords) {
  let found = false;
  for (const w of official) {
    if (gw === w || gw === w.split('|')[0]) {
      found = true;
      break;
    }
  }
  if (!found) {
    reallyExtra.push(gw);
  }
}
console.log('Really extra:', reallyExtra);
