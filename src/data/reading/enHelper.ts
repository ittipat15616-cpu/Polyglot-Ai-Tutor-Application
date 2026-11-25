import { EnReadingLevel, ReadingCategory, ReadingStory } from '../../types/reading';

export type EnStorySeed = [
  id: string,
  category: ReadingCategory,
  title: string,
  titleTh: string,
  summaryTh: string,
  sentences: [string, string][],
  vocab: [string, string, string, string][],
  quiz: [string, [string, string, string, string], number, string][]
];

export function buildEnStories(
  level: EnReadingLevel,
  estimatedMinutes: number,
  seeds: EnStorySeed[]
): ReadingStory[] {
  return seeds.map(([id, category, title, titleTh, summaryTh, sentences, vocab, quiz]) => ({
    id,
    lang: 'EN',
    level,
    category,
    title,
    titleTh,
    summaryTh,
    estimatedMinutes,
    sentences: sentences.map(([text, th]) => ({ text, th })),
    vocab: vocab.map(([word, reading, pos, meaningTh]) => ({ word, reading, pos, meaningTh })),
    quiz: quiz.map(([questionTh, options, correctIndex, explanationTh]) => ({
      questionTh,
      options,
      correctIndex,
      explanationTh,
    })),
  }));
}
