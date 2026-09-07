const fs = require('fs');

const replacements = {
  "第（第二）": { word: "第二", pinyin: "dì èr", en: "second", th: "ที่สอง", example: "他是第二名。", exampleTh: "เขาคือที่สอง" },
  "家（科学家）": { word: "科学家", pinyin: "kē xué jiā", en: "scientist", th: "นักวิทยาศาสตร์", example: "他想成为一名科学家。", exampleTh: "เขาอยากเป็นนักวิทยาศาสตร์" },
  "老（老王）": { word: "老王", pinyin: "lǎo wáng", en: "Lao Wang", th: "เหล่าหวัง", example: "老王是我的好朋友。", exampleTh: "เหล่าหวังเป็นเพื่อนสนิทของฉัน" },
  "头（里头）": { word: "里头", pinyin: "lǐ tou", en: "inside", th: "ข้างใน", example: "盒子里头有什么？", exampleTh: "ข้างในกล่องมีอะไร?" },
  "小（小王）": { word: "小王", pinyin: "xiǎo wáng", en: "Xiao Wang", th: "เสี่ยวหวัง", example: "小王今天没来上班。", exampleTh: "เสี่ยวหวังวันนี้ไม่ได้มาทำงาน" },
  "有（一）点儿": { word: "有一点儿", pinyin: "yǒu yì diǎnr", en: "a little bit", th: "นิดหน่อย", example: "我有一点儿累。", exampleTh: "ฉันเหนื่อยนิดหน่อย" },
  "初（初一）": { word: "初一", pinyin: "chū yī", en: "first day of lunar month / grade 7", th: "วันที่หนึ่ง (จันทรคติ) / ม.1", example: "今天是大年初一。", exampleTh: "วันนี้คือวันขึ้น 1 ค่ำ เดือนอ้าย" },
  "化（现代化）": { word: "现代化", pinyin: "xiàn dài huà", en: "modernization", th: "ความทันสมัย", example: "我们的城市正在现代化。", exampleTh: "เมืองของเรากำลังมีความทันสมัยขึ้น" },
  "性（积极性）": { word: "积极性", pinyin: "jī jí xìng", en: "enthusiasm", th: "ความกระตือรือร้น", example: "我们要提高工作积极性。", exampleTh: "พวกเราต้องเพิ่มความกระตือรือร้นในการทำงาน" },
  "员（服务员）": { word: "服务员", pinyin: "fú wù yuán", en: "waiter", th: "พนักงานบริการ", example: "服务员，请结账。", exampleTh: "พนักงาน เช็คบิลด้วย" },
  "者（志愿者）": { word: "志愿者", pinyin: "zhì yuàn zhě", en: "volunteer", th: "อาสาสมัคร", example: "她是一名社区志愿者。", exampleTh: "เธอคืออาสาสมัครของชุมชน" },
  "差（一）点儿": { word: "差一点儿", pinyin: "chà yì diǎnr", en: "almost", th: "เกือบจะ", example: "我差一点儿就迟到了。", exampleTh: "ฉันเกือบจะมาสายแล้ว" },
  "品（工艺品）": { word: "工艺品", pinyin: "gōng yì pǐn", en: "handicraft", th: "งานศิลปหัตถกรรม", example: "这些工艺品非常精美。", exampleTh: "งานศิลปหัตถกรรมเหล่านี้ประณีตมาก" },
  "好（不）容易": { word: "好不容易", pinyin: "hǎo bù róng yì", en: "with great difficulty", th: "ยากลำบากมาก", example: "我好不容易才找到这里。", exampleTh: "ฉันหาที่นี่เจอด้วยความยากลำบากมาก" },
  "界（文艺界）": { word: "文艺界", pinyin: "wén yì jiè", en: "literary and art circles", th: "วงการวรรณกรรมและศิลปะ", example: "他在文艺界很有名。", exampleTh: "เขามีชื่อเสียงมากในวงการวรรณกรรมและศิลปะ" },
  "力（影响力）": { word: "影响力", pinyin: "yǐng xiǎng lì", en: "influence", th: "อิทธิพล", example: "这部电影有很大的影响力。", exampleTh: "ภาพยนตร์เรื่องนี้มีอิทธิพลอย่างมาก" },
  "长（秘书长）": { word: "秘书长", pinyin: "mì shū cháng", en: "secretary-general", th: "เลขาธิการ", example: "他是联合国的秘书长。", exampleTh: "เขาคือเลขาธิการสหประชาชาติ" },
  "族（上班族）": { word: "上班族", pinyin: "shàng bān zú", en: "office worker", th: "มนุษย์เงินเดือน", example: "上班族每天都很忙。", exampleTh: "มนุษย์เงินเดือนยุ่งมากทุกวัน" },
  "度（知名度）": { word: "知名度", pinyin: "zhī míng dù", en: "popularity", th: "ชื่อเสียง", example: "这个品牌的知名度很高。", exampleTh: "แบรนด์นี้มีชื่อเสียงสูงมาก" },
  "非（非金属）": { word: "非金属", pinyin: "fēi jīn shǔ", en: "non-metal", th: "อโลหะ", example: "这是一种非金属材料。", exampleTh: "นี่คือวัสดุอโลหะชนิดหนึ่ง" },
  "感（责任感）": { word: "责任感", pinyin: "zé rèn gǎn", en: "sense of responsibility", th: "ความรับผิดชอบ", example: "他是一个很有责任感的人。", exampleTh: "เขาเป็นคนที่มีความรับผิดชอบมาก" },
  "率（成功率）": { word: "成功率", pinyin: "chéng gōng lǜ", en: "success rate", th: "อัตราความสำเร็จ", example: "手术的成功率很高。", exampleTh: "อัตราความสำเร็จของการผ่าตัดสูงมาก" },
  "茅台（酒）": { word: "茅台酒", pinyin: "máo tái jiǔ", en: "Maotai liquor", th: "เหล้าเหมาไถ", example: "茅台酒是中国名酒。", exampleTh: "เหล้าเหมาไถเป็นเหล้าชื่อดังของจีน" },
  "业（服务业）": { word: "服务业", pinyin: "fú wù yè", en: "service industry", th: "ภาคบริการ", example: "服务业的发展非常迅速。", exampleTh: "การพัฒนาของภาคบริการรวดเร็วมาก" }
};

const files = [
  { file: 'hsk1Data.ts', exportName: 'mockHsk1Data' },
  { file: 'hsk2Data.ts', exportName: 'hsk2Data' },
  { file: 'hsk3Data.ts', exportName: 'hsk3Data' },
  { file: 'hsk4Data.ts', exportName: 'hsk4Data' },
  { file: 'hsk5Data.ts', exportName: 'hsk5Data' },
  { file: 'hsk6Data.ts', exportName: 'hsk6Data' },
  { file: 'hsk7to9Data.ts', exportName: 'hsk7to9Data' }
];

function removeTones(pinyin) {
  const toneMap = {
    'ā': 'a', 'á': 'a', 'ǎ': 'a', 'à': 'a',
    'ō': 'o', 'ó': 'o', 'ǒ': 'o', 'ò': 'o',
    'ē': 'e', 'é': 'e', 'ě': 'e', 'è': 'e',
    'ī': 'i', 'í': 'i', 'ǐ': 'i', 'ì': 'i',
    'ū': 'u', 'ú': 'u', 'ǔ': 'u', 'ù': 'u',
    'ǖ': 'v', 'ǘ': 'v', 'ǚ': 'v', 'ǜ': 'v', 'ü': 'v'
  };
  return (pinyin || '').replace(/[āáǎàōóǒòēéěèīíǐìūúǔùǖǘǚǜü]/g, match => toneMap[match] || match);
}

let modifiedCount = 0;

for (const {file, exportName} of files) {
  const filePath = `./src/data/${file}`;
  if (!fs.existsSync(filePath)) continue;
  
  let content = fs.readFileSync(filePath, 'utf-8');
  
  const arrayStartStr = `export const ${exportName} = `;
  const startIndex = content.indexOf(arrayStartStr);
  if (startIndex === -1) {
    console.log(`Could not find export for ${file}`);
    continue;
  }
  
  const arrayStart = startIndex + arrayStartStr.length;
  let arrayStr = content.substring(arrayStart).trim();
  const endsWithSemicolon = arrayStr.endsWith(';');
  if (endsWithSemicolon) arrayStr = arrayStr.slice(0, -1);
  
  let data;
  try {
    data = JSON.parse(arrayStr);
  } catch (e) {
    console.error(`Error parsing JSON in ${file}: ${e}`);
    continue;
  }
  
  let hasModifications = false;
  
  for (let i = 0; i < data.length; i++) {
    const wordObj = data[i];
    if (wordObj && wordObj.word && replacements[wordObj.word]) {
      console.log(`Replacing ${wordObj.word} in ${file}`);
      data[i] = {
        ...wordObj,
        ...replacements[wordObj.word]
      };
      hasModifications = true;
      modifiedCount++;
    }
  }
  
  if (hasModifications) {
    data.sort((a, b) => {
      const pinyinA = removeTones(a.pinyin || '').toLowerCase().replace(/[^a-z ]/g, '').trim();
      const pinyinB = removeTones(b.pinyin || '').toLowerCase().replace(/[^a-z ]/g, '').trim();
      const res = pinyinA.localeCompare(pinyinB, 'en');
      return res !== 0 ? res : (a.pinyin || '').localeCompare(b.pinyin || '', 'en');
    });
    
    // Construct the new array string with JSON stringify
    // To format it nicely like before
    let newDataStr = JSON.stringify(data, null, 2);
    // Replace the old array with the new one
    content = content.substring(0, arrayStart) + newDataStr + (endsWithSemicolon ? ';\n' : '\n');
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`Updated and sorted ${file}`);
  }
}
console.log(`Total replaced: ${modifiedCount}`);
