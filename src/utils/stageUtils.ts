import { VocabWord } from '../data/vocabData';

export interface GameStage {
  stageNumber: number;        // 1, 2, 3...
  words: VocabWord[];         // Words slice for this stage
  startIndex: number;         // 1-based start index
  endIndex: number;           // 1-based end index
  isFinalStage: boolean;
  timeLimitSeconds?: number;   // Timer for Match Master (60s or 80s)
}

/**
 * Stage calculation rules requested by user:
 *
 * 1. General Mini-Games (Wall Smasher, Laser Cannon, Audio Bomb, Word Rain, Word Scramble):
 *    - Standard stage size: EXACTLY 20 words per non-final stage.
 *    - Final stage size: MUST be between 10 and 30 words.
 *    - If remainder r >= 10: Final stage gets r words (10..19).
 *    - If remainder 1 <= r < 10: Merged into last full stage, so final stage gets 20 + r words (21..29).
 *
 * 2. Match Master:
 *    - Standard stage size: EXACTLY 10 words per non-final stage. Time limit = 60 seconds.
 *    - Final stage size: MUST be between 5 and 15 words.
 *    - If remainder r >= 5: Final stage gets r words (5..9). Time limit = 60s.
 *    - If remainder 1 <= r < 5: Merged into last full stage, so final stage gets 10 + r words (11..14).
 *      AND if final stage has > 10 words, time limit = 80 seconds!
 */
export function calculateGameStages(vocabList: VocabWord[], isMatchMaster: boolean = false): GameStage[] {
  const totalWords = vocabList.length;
  if (totalWords === 0) return [];

  const standardSize = isMatchMaster ? 10 : 20;
  const minFinalSize = isMatchMaster ? 5 : 10;

  const fullStagesCount = Math.floor(totalWords / standardSize);
  const remainder = totalWords % standardSize;

  let totalStages = fullStagesCount;
  let finalStageHasRemainderAdded = false;

  if (remainder === 0) {
    totalStages = fullStagesCount;
  } else if (remainder >= minFinalSize) {
    totalStages = fullStagesCount + 1;
  } else {
    if (fullStagesCount > 0) {
      totalStages = fullStagesCount;
      finalStageHasRemainderAdded = true;
    } else {
      totalStages = 1;
    }
  }

  const stages: GameStage[] = [];
  let currentOffset = 0;

  for (let i = 1; i <= totalStages; i++) {
    const isFinal = i === totalStages;
    let stageSize = standardSize;

    if (isFinal) {
      if (remainder === 0) {
        stageSize = standardSize;
      } else if (remainder >= minFinalSize) {
        stageSize = remainder;
      } else if (finalStageHasRemainderAdded) {
        stageSize = standardSize + remainder;
      } else {
        stageSize = totalWords;
      }
    }

    const stageWords = vocabList.slice(currentOffset, currentOffset + stageSize);
    const startIdx = currentOffset + 1;
    const endIdx = currentOffset + stageWords.length;

    let timeLimitSeconds: number | undefined;
    if (isMatchMaster) {
      timeLimitSeconds = stageWords.length > 10 ? 80 : 60;
    }

    stages.push({
      stageNumber: i,
      words: stageWords,
      startIndex: startIdx,
      endIndex: endIdx,
      isFinalStage: isFinal,
      timeLimitSeconds
    });

    currentOffset += stageWords.length;
  }

  return stages;
}
