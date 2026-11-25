import {
  CnReadingLevel,
  EnReadingLevel,
  ReadingLang,
  ReadingLevel,
  ReadingStory,
} from '../../types/reading';

const levelCache = new Map<string, ReadingStory[]>();

export async function loadReadingLevelPack(
  lang: ReadingLang,
  level: ReadingLevel
): Promise<ReadingStory[]> {
  const key = `${lang}:${level}`;
  const cached = levelCache.get(key);
  if (cached) return cached;

  let stories: ReadingStory[] = [];
  if (lang === 'EN') {
    switch (level as EnReadingLevel) {
      case 'A1':
        stories = (await import('./enA1')).EN_A1_STORIES;
        break;
      case 'A2':
        stories = (await import('./enA2')).EN_A2_STORIES;
        break;
      case 'B1':
        stories = (await import('./enB1')).EN_B1_STORIES;
        break;
      case 'B2':
        stories = (await import('./enB2')).EN_B2_STORIES;
        break;
      case 'C1':
        stories = (await import('./enC1')).EN_C1_STORIES;
        break;
    }
  } else {
    switch (level as CnReadingLevel) {
      case 'HSK1':
        stories = (await import('./cnHsk1')).CN_HSK1_STORIES;
        break;
      case 'HSK2':
        stories = (await import('./cnHsk2')).CN_HSK2_STORIES;
        break;
      case 'HSK3':
        stories = (await import('./cnHsk3')).CN_HSK3_STORIES;
        break;
      case 'HSK4':
        stories = (await import('./cnHsk4')).CN_HSK4_STORIES;
        break;
      case 'HSK5':
        stories = (await import('./cnHsk5')).CN_HSK5_STORIES;
        break;
      case 'HSK6':
        stories = (await import('./cnHsk6')).CN_HSK6_STORIES;
        break;
    }
  }

  levelCache.set(key, stories);
  return stories;
}

export async function loadAllReadingStoriesForLang(lang: ReadingLang): Promise<ReadingStory[]> {
  const levels: ReadingLevel[] =
    lang === 'EN'
      ? ['A1', 'A2', 'B1', 'B2', 'C1']
      : ['HSK1', 'HSK2', 'HSK3', 'HSK4', 'HSK5', 'HSK6'];

  const packs = await Promise.all(levels.map((lvl) => loadReadingLevelPack(lang, lvl)));
  return packs.flat();
}
