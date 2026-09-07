function removeTones(pinyin) {
  const toneMap = {
    'ā': 'a', 'á': 'a', 'ǎ': 'a', 'à': 'a',
    'ō': 'o', 'ó': 'o', 'ǒ': 'o', 'ò': 'o',
    'ē': 'e', 'é': 'e', 'ě': 'e', 'è': 'e',
    'ī': 'i', 'í': 'i', 'ǐ': 'i', 'ì': 'i',
    'ū': 'u', 'ú': 'u', 'ǔ': 'u', 'ù': 'u',
    'ǖ': 'v', 'ǘ': 'v', 'ǚ': 'v', 'ǜ': 'v', 'ü': 'v'
  };
  return pinyin.replace(/[āáǎàōóǒòēéěèīíǐìūúǔùǖǘǚǜü]/g, match => toneMap[match] || match);
}

const arr = [
  {pinyin: 'ài'},
  {pinyin: 'ài hào'},
  {pinyin: 'bā'},
  {pinyin: 'bàba ｜ bà'},
  {pinyin: 'ba'},
  {pinyin: 'bái'},
  {pinyin: 'bái tiān'},
  {pinyin: 'bǎi'},
  {pinyin: 'bān'},
  {pinyin: 'bàn'}
];

arr.sort((a, b) => {
    // replace non-letters with empty string to compare just the characters
    // actually, let's keep spaces to keep word boundaries?
    const pinyinA = removeTones(a.pinyin.toLowerCase().replace(/[^a-z ]/g, '')).trim();
    const pinyinB = removeTones(b.pinyin.toLowerCase().replace(/[^a-z ]/g, '')).trim();
    // If stripped pinyin is same, fallback to original to maintain some stability
    const res = pinyinA.localeCompare(pinyinB, 'en');
    return res !== 0 ? res : a.pinyin.localeCompare(b.pinyin, 'en');
});

console.log(arr.map(x => x.pinyin));
