import {
  RoleplayCategoryId,
  RoleplayDifficulty,
  RoleplayMission,
  SurvivalPhrase,
} from './types';

export type SurvivalSeed = [en: string, cn: string, pinyin: string, th: string];

export type RoleplaySeed = [
  number: number,
  difficulty: RoleplayDifficulty,
  titleTh: string,
  titleEn: string,
  location: string,
  aiRoleName: string,
  aiRoleTitleTh: string,
  aiRoleTitleEn: string,
  aiVoiceGender: 'male' | 'female',
  userRoleTh: string,
  scenarioTh: string,
  objectives: [string, string, string],
  objectivesEn: [string, string, string],
  openingLineEn: string,
  openingLineCn: string,
  survivalKit: SurvivalSeed[],
  twistTh?: string,
  twistEn?: string
];

export function buildRoleplayMissions(
  category: RoleplayCategoryId,
  idPrefix: string,
  seeds: RoleplaySeed[]
): RoleplayMission[] {
  return seeds.map(
    ([
      number,
      difficulty,
      titleTh,
      titleEn,
      location,
      aiRoleName,
      aiRoleTitleTh,
      aiRoleTitleEn,
      aiVoiceGender,
      userRoleTh,
      scenarioTh,
      objectives,
      objectivesEn,
      openingLineEn,
      openingLineCn,
      survivalKit,
      twistTh,
      twistEn,
    ]) => {
      const mission: RoleplayMission = {
        id: `${idPrefix}_${String(number).padStart(2, '0')}`,
        number,
        category,
        difficulty,
        titleTh,
        titleEn,
        location,
        aiRoleName,
        aiRoleTitleTh,
        aiRoleTitleEn,
        aiVoiceGender,
        userRoleTh,
        scenarioTh,
        objectives,
        objectivesEn,
        openingLineEn,
        openingLineCn,
        survivalKit: survivalKit.map<SurvivalPhrase>(([en, cn, pinyin, th]) => ({
          en,
          cn,
          pinyin,
          th,
        })),
      };
      if (twistTh) mission.twistTh = twistTh;
      if (twistEn) mission.twistEn = twistEn;
      return mission;
    }
  );
}
