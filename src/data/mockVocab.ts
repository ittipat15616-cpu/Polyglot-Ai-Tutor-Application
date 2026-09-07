export interface VocabWord {
  id: string;
  word: string;
  pinyin?: string; // For Chinese
  phonetic?: string; // For English
  translations: string[];
  level: string; // e.g. HSK1, CEFR_A1
}

export const mockCNVocab: VocabWord[] = [
  { id: 'c1', word: '你好', pinyin: 'nǐ hǎo', translations: ['สวัสดี', 'ฮัลโหล'], level: 'HSK1' },
  { id: 'c2', word: '谢谢', pinyin: 'xiè xie', translations: ['ขอบคุณ', 'ขอบใจ'], level: 'HSK1' },
  { id: 'c3', word: '再见', pinyin: 'zài jiàn', translations: ['ลาก่อน', 'พบกันใหม่'], level: 'HSK1' },
  { id: 'c4', word: '朋友', pinyin: 'péng you', translations: ['เพื่อน', 'มิตร'], level: 'HSK1' },
  { id: 'c5', word: '电脑', pinyin: 'diàn nǎo', translations: ['คอมพิวเตอร์'], level: 'HSK1' },
  { id: 'c6', word: '学习', pinyin: 'xué xí', translations: ['เรียน', 'ศึกษา'], level: 'HSK1' },
  { id: 'c7', word: '漂亮', pinyin: 'piào liang', translations: ['สวย', 'งดงาม'], level: 'HSK1' },
  { id: 'c8', word: '今天', pinyin: 'jīn tiān', translations: ['วันนี้'], level: 'HSK1' },
  { id: 'c9', word: '高兴', pinyin: 'gāo xìng', translations: ['ดีใจ', 'มีความสุข'], level: 'HSK1' },
  { id: 'c10', word: '我们', pinyin: 'wǒ men', translations: ['พวกเรา'], level: 'HSK1' },
  // 4 character word for testing layout
  { id: 'c11', word: '不可思议', pinyin: 'bù kě sī yì', translations: ['เหลือเชื่อ', 'คาดไม่ถึง'], level: 'HSK6' }
];

export const mockENVocab: VocabWord[] = [
  { id: 'e1', word: 'hello', phonetic: '/həˈloʊ/', translations: ['สวัสดี'], level: 'A1' },
  { id: 'e2', word: 'thank you', phonetic: '/ˈθæŋk ˌju/', translations: ['ขอบคุณ'], level: 'A1' },
  { id: 'e3', word: 'beautiful', phonetic: '/ˈbjuːtɪfl/', translations: ['สวย', 'งดงาม'], level: 'A1' },
  { id: 'e4', word: 'computer', phonetic: '/kəmˈpjuːtər/', translations: ['คอมพิวเตอร์'], level: 'A1' },
  { id: 'e5', word: 'friend', phonetic: '/frend/', translations: ['เพื่อน'], level: 'A1' },
];
