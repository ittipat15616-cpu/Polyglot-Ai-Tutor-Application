export type TranslatorLang = 'TH' | 'EN' | 'CN' | 'JP' | 'KR';
export type TranslatorSourceLang = 'AUTO' | TranslatorLang;
export type TranslatorTone = 'polite' | 'formal' | 'casual' | 'chat';
export type TranslatorStudioMode = 'text' | 'polish' | 'photo' | 'voice';
export type ImageTranslateContext = 'general' | 'menu' | 'sign' | 'document';
export type PolishSituation = 'general' | 'work_email' | 'friend_chat' | 'travel_service';

export interface TranslatorLangMeta {
  code: TranslatorLang;
  labelTh: string;
  nativeName: string;
  flag: string;
  bcp47: string;
  isCoreDeep: boolean;
  samplePhrase: string;
  readingLabel: string;
}

export const TRANSLATOR_LANGUAGES: TranslatorLangMeta[] = [
  {
    code: 'TH',
    labelTh: 'ไทย',
    nativeName: 'ภาษาไทย',
    flag: '🇹🇭',
    bcp47: 'th-TH',
    isCoreDeep: true,
    samplePhrase: 'ขอโทษครับ ช่วยแนะนำเมนูยอดนิยมของร้านนี้ให้หน่อยได้ไหมครับ',
    readingLabel: 'คำอ่าน',
  },
  {
    code: 'EN',
    labelTh: 'อังกฤษ',
    nativeName: 'English',
    flag: '🇬🇧',
    bcp47: 'en-US',
    isCoreDeep: true,
    samplePhrase: 'Could you please recommend your most popular dish here?',
    readingLabel: 'Phonetic / Stress',
  },
  {
    code: 'CN',
    labelTh: 'จีนกลาง',
    nativeName: '中文',
    flag: '🇨🇳',
    bcp47: 'zh-CN',
    isCoreDeep: true,
    samplePhrase: '不好意思，请问这家店最受欢迎的菜是什么？',
    readingLabel: 'Pinyin (พินอิน)',
  },
  {
    code: 'JP',
    labelTh: 'ญี่ปุ่น',
    nativeName: '日本語',
    flag: '🇯🇵',
    bcp47: 'ja-JP',
    isCoreDeep: false,
    samplePhrase: 'すみません、このお店で一番人気のメニューは何ですか？',
    readingLabel: 'Romaji',
  },
  {
    code: 'KR',
    labelTh: 'เกาหลี',
    nativeName: '한국어',
    flag: '🇰🇷',
    bcp47: 'ko-KR',
    isCoreDeep: false,
    samplePhrase: '실례합니다, 이 가게에서 가장 인기 있는 메뉴가 무엇인가요?',
    readingLabel: 'Romanization',
  },
];

export const TRANSLATOR_LANG_MAP: Record<TranslatorLang, TranslatorLangMeta> =
  TRANSLATOR_LANGUAGES.reduce((acc, item) => {
    acc[item.code] = item;
    return acc;
  }, {} as Record<TranslatorLang, TranslatorLangMeta>);

export const TRANSLATOR_TONES: Array<{
  id: TranslatorTone;
  labelTh: string;
  shortDesc: string;
}> = [
  { id: 'polite', labelTh: 'สุภาพ', shortDesc: 'ใช้ได้ทุกสถานการณ์' },
  { id: 'formal', labelTh: 'ทางการ', shortDesc: 'งาน อีเมล ติดต่อราชการ' },
  { id: 'casual', labelTh: 'เป็นกันเอง', shortDesc: 'คุยกับเพื่อน คนรู้จัก' },
  { id: 'chat', labelTh: 'แชทธรรมชาติ', shortDesc: 'สั้น กระชับ เหมือนเจ้าของภาษา' },
];

export interface BasicTranslateResponse {
  translatedText: string;
  reading?: string;
  sourceReading?: string;
  detectedSourceLang: TranslatorLang;
  engine: 'google_free' | 'bing_free' | 'simply_free' | 'mymemory_free';
}

export interface VocabBreakdownItem {
  word: string;
  reading?: string;
  meaningTh: string;
  partOfSpeech?: string;
  noteTh?: string;
  wordLang: TranslatorLang;
}

export interface GrammarNoteItem {
  pattern: string;
  explanationTh: string;
  example?: string;
}

export interface AlternativeTranslationItem {
  toneLabelTh: string;
  text: string;
  reading?: string;
  nuanceTh: string;
}

export interface DeepTranslateResponse {
  detectedSourceLang: TranslatorLang;
  translatedText: string;
  reading?: string;
  thaiPhonetic?: string;
  toneNoteTh?: string;
  breakdown: VocabBreakdownItem[];
  grammarNotes: GrammarNoteItem[];
  alternatives: AlternativeTranslationItem[];
  modelUsed?: string;
}

export interface PolishChangeItem {
  original: string;
  improved: string;
  reasonTh: string;
}

export interface PolishResponse {
  polishedText: string;
  reading?: string;
  thaiPhonetic?: string;
  meaningTh: string;
  overallFeedbackTh: string;
  changes: PolishChangeItem[];
  alternatives: AlternativeTranslationItem[];
  modelUsed?: string;
}

export interface ImageLineItem {
  original: string;
  reading?: string;
  translated: string;
  noteTh?: string;
}

export interface ImageTranslateResponse {
  detectedSourceLang: TranslatorLang;
  extractedText: string;
  translatedSummary: string;
  culturalNoteTh?: string;
  items: ImageLineItem[];
  keyVocab: VocabBreakdownItem[];
  modelUsed?: string;
}

export interface TranslatorHistoryItem {
  id: string;
  sourceLang: TranslatorLang;
  targetLang: TranslatorLang;
  sourceText: string;
  translatedText: string;
  reading?: string;
  thaiPhonetic?: string;
  tone?: TranslatorTone;
  isAiDeep?: boolean;
  createdAt: number;
}

export interface SavedPhraseItem {
  id: string;
  sourceLang: TranslatorLang;
  targetLang: TranslatorLang;
  sourceText: string;
  translatedText: string;
  reading?: string;
  thaiPhonetic?: string;
  noteTh?: string;
  createdAt: number;
}

export interface VoiceTurnItem {
  id: string;
  speaker: 'A' | 'B';
  sourceLang: TranslatorLang;
  targetLang: TranslatorLang;
  originalText: string;
  translatedText: string;
  reading?: string;
  createdAt: number;
}
