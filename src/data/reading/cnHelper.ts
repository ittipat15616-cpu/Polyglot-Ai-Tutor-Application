import { CnReadingLevel, ReadingCategory, ReadingStory } from '../../types/reading';

export type CnStorySeed = [
  id: string,
  category: ReadingCategory,
  title: string,
  titlePinyin: string,
  titleTh: string,
  summaryTh: string,
  sentences: [string, string, string][],
  vocab: [string, string, string, string][],
  quiz: [string, [string, string, string, string], number, string][]
];

export function buildCnStories(
  level: CnReadingLevel,
  estimatedMinutes: number,
  seeds: CnStorySeed[]
): ReadingStory[] {
  return seeds.map(
    ([id, category, title, titlePinyin, titleTh, summaryTh, sentences, vocab, quiz]) => ({
      id,
      lang: 'CN',
      level,
      category,
      title,
      titlePinyin,
      titleTh,
      summaryTh,
      estimatedMinutes,
      sentences: sentences.map(([text, pinyin, th]) => ({ text, pinyin, th })),
      vocab: vocab.map(([word, reading, pos, meaningTh]) => ({ word, reading, pos, meaningTh })),
      quiz: quiz.map(([questionTh, options, correctIndex, explanationTh]) => ({
        questionTh,
        options,
        correctIndex,
        explanationTh,
      })),
    })
  );
}
