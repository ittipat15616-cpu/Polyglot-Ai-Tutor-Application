import {
  RoleplayCategoryId,
  RoleplayCategoryMeta,
  RoleplayDifficulty,
  RoleplayMission,
} from './types';
import { TRAVEL_MISSIONS } from './missionsTravel';
import { DAILY_MISSIONS } from './missionsDaily';
import { WORK_MISSIONS } from './missionsWork';
import { SOCIAL_MISSIONS } from './missionsSocial';
import { STUDY_EMERGENCY_MISSIONS } from './missionsStudyEmergency';

export * from './types';

export const ROLEPLAY_CATEGORIES: RoleplayCategoryMeta[] = [
  {
    id: 'travel',
    nameTh: 'ท่องเที่ยว & การเดินทาง',
    shortNameTh: 'ท่องเที่ยว',
    descriptionTh: 'สนามบิน ตม. โรงแรม รถไฟ แท็กซี่ และการแก้ปัญหาเฉพาะหน้าระหว่างทริป',
  },
  {
    id: 'daily',
    nameTh: 'ชีวิตประจำวัน & ร้านค้า',
    shortNameTh: 'ชีวิตประจำวัน',
    descriptionTh: 'คาเฟ่ ร้านอาหาร ช้อปปิ้ง ต่อรองราคา ธนาคาร คอนโด และการบริการทั่วไป',
  },
  {
    id: 'work',
    nameTh: 'การทำงาน & ธุรกิจ',
    shortNameTh: 'การทำงาน',
    descriptionTh: 'สัมภาษณ์งาน ประชุมทีม พรีเซนต์ไอเดีย รับมือลูกค้า และต่อรองธุรกิจ',
  },
  {
    id: 'social',
    nameTh: 'เข้าสังคม & ชีวิตส่วนตัว',
    shortNameTh: 'เข้าสังคม',
    descriptionTh: 'ทำความรู้จักเพื่อนใหม่ นัดเที่ยว ปฏิเสธอย่างสุภาพ เคลียร์ใจ และออกงานสังคม',
  },
  {
    id: 'study_emergency',
    nameTh: 'การเรียน สอบ & เหตุฉุกเฉิน',
    shortNameTh: 'เรียน & ฉุกเฉิน',
    descriptionTh: 'ซ้อมสอบพูด สัมภาษณ์ทุน พบแพทย์ ร้านขายยา แจ้งความ และติดต่อสถานทูต',
  },
];

export const ALL_ROLEPLAY_MISSIONS: RoleplayMission[] = [
  ...TRAVEL_MISSIONS,
  ...DAILY_MISSIONS,
  ...WORK_MISSIONS,
  ...SOCIAL_MISSIONS,
  ...STUDY_EMERGENCY_MISSIONS,
];

export const DIFFICULTY_META: Record<
  RoleplayDifficulty,
  { labelTh: string; cefrEn: string; hskCn: string; colorClass: string }
> = {
  easy: {
    labelTh: 'ระดับง่าย',
    cefrEn: 'A1–A2',
    hskCn: 'HSK 1–2',
    colorClass: 'text-emerald-700',
  },
  medium: {
    labelTh: 'ระดับกลาง',
    cefrEn: 'B1–B2',
    hskCn: 'HSK 3–4',
    colorClass: 'text-amber-700',
  },
  hard: {
    labelTh: 'ระดับสูง',
    cefrEn: 'C1+',
    hskCn: 'HSK 5–6',
    colorClass: 'text-rose-700',
  },
};

export function getCategoryMeta(id: RoleplayCategoryId): RoleplayCategoryMeta {
  return (
    ROLEPLAY_CATEGORIES.find((c) => c.id === id) || ROLEPLAY_CATEGORIES[0]
  );
}

export function getMissionById(id: string): RoleplayMission | undefined {
  return ALL_ROLEPLAY_MISSIONS.find((m) => m.id === id);
}

export function getNextMission(current: RoleplayMission): RoleplayMission | null {
  if (current.isCustom) return null;
  const idx = ALL_ROLEPLAY_MISSIONS.findIndex((m) => m.id === current.id);
  if (idx === -1 || idx + 1 >= ALL_ROLEPLAY_MISSIONS.length) return null;
  return ALL_ROLEPLAY_MISSIONS[idx + 1];
}
