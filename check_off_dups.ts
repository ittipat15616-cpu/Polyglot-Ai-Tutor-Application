import hsk3 from '@leonsilicon/hsk3.0';
const official = hsk3.wordsLevel1;
const seen = new Set<string>();
const dups = [];
for(const w of official) {
  if (seen.has(w)) dups.push(w);
  seen.add(w);
}
console.log('Duplicates in official:', dups);
