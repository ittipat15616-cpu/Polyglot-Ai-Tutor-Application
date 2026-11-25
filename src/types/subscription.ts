export type SubscriptionTier = 'TESTING' | 'FREE' | 'STARTER' | 'BASIC' | 'PLUS' | 'PREMIUM' | 'PRO' | 'ULTRA';

export const SUPER_ADMIN_EMAIL = 'ittipat15616@gmail.com';

export const ADMIN_EMAILS: string[] = [
  'ittipat15616@gmail.com',
  'weeranan172550@gmail.com',
  'nongrily@gmail.com',
  'mimi.benyapa@gmail.com',
  'tpimlapat69@gmail.com'
];

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase().trim());
}

export function isSuperAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return email.toLowerCase().trim() === SUPER_ADMIN_EMAIL;
}

export interface TierConfig {
  id: SubscriptionTier;
  name: string;
  price: number; // THB / 30 Days
  dailyCredits: number; // Monthly credits allocated for the 30-day plan (expires with plan)
  description: string;
  badgeColor: string;
  allowedTabs: string[]; // Allowed tab IDs ('lessons', 'flashcards', 'vocab', 'vocab_exam', 'vocab_games', 'translate', 'exercises', 'exams', 'mocktests', 'call', 'contact')
  features: string[];
  isLegacy?: boolean; // Hidden from customer purchase options; kept for backward compatibility
}

export const PAID_TIER_IDS: SubscriptionTier[] = ['STARTER', 'BASIC', 'PLUS'];

export const TIER_CONFIGS: Record<SubscriptionTier, TierConfig> = {
  TESTING: {
    id: 'TESTING',
    name: 'Testing Plan',
    price: 0,
    dailyCredits: 0,
    description: 'แพ็กเกจทดลองสำหรับบัญชีใหม่ ปลดล็อคทุกหน้า 14 วัน + BYOK คอล AI ฟรีไม่อั้น',
    badgeColor: 'bg-teal-100 text-teal-800 border-teal-200',
    allowedTabs: ['lessons', 'flashcards', 'vocab', 'vocab_exam', 'vocab_games', 'translate', 'exercises', 'exams', 'mocktests', 'karaoke', 'reading', 'study_hub', 'call', 'contact'],
    features: [
      'ปลดล็อคเข้าใช้งานได้ทุกหน้าเป็นเวลา 14 วัน (รวม Mock Tests, คาราโอเกะ & เนื้อหา EN)',
      'รองรับ BYOK: คอล AI ฟรีไม่อั้น + สอบศัพท์ 10 • ตรวจข้อสอบ 3 • แปลเพลงใหม่ 10 • อธิบายคำเพลง 100 • Roleplay สร้างด่าน 30/สรุป 100 ต่อวัน',
      'ไม่มีเครดิต AI แถมฟรี (สามารถใช้ BYOK หรือซื้อแพ็กเกจ/เติมเครดิตเพิ่มได้)',
      'เมื่อครบ 14 วัน จะสลับเป็น Free Plan โดยเครดิตที่เติมไว้ยังอยู่ครบ'
    ]
  },
  FREE: {
    id: 'FREE',
    name: 'Free Plan',
    price: 0,
    dailyCredits: 0,
    description: 'ใช้งานคลังคำศัพท์ แฟลชการ์ด คัดศัพท์ สอบศัพท์ เกมคำศัพท์ และคลังเพลงคาราโอเกะฟรี ทั้งจีนและอังกฤษ',
    badgeColor: 'bg-slate-100 text-slate-700 border-slate-200',
    allowedTabs: ['lessons', 'flashcards', 'vocab', 'vocab_exam', 'vocab_games', 'translate', 'exercises', 'exams', 'karaoke', 'reading', 'study_hub', 'contact', 'call'],
    features: [
      'ใช้งานฟรี 100%: คลังคำศัพท์ แฟลชการ์ด คัดศัพท์ สอบศัพท์ เกมคำศัพท์ และคลังเพลงคาราโอเกะ (EN & CN)',
      'เข้าเรียนบทเรียนและทำข้อสอบภาษาจีนได้ฟรี (CN)',
      'รองรับ BYOK: คอล AI ฟรีไม่อั้น + สอบศัพท์ 10 • ตรวจข้อสอบ 3 • แปลเพลงใหม่ 10 • อธิบายคำเพลง 100 • Roleplay สร้างด่าน 30/สรุป 100 ต่อวัน',
      'สอบศัพท์ใช้ 1 เครดิต / แปลเพลงใหม่ใช้ 2 เครดิต (หรือใช้ฟรีผ่าน BYOK ตามสิทธิ์รายวัน)',
      'ล็อคเฉพาะระบบจำลองสอบ (Mock Tests) และบทเรียน/ข้อสอบภาษาอังกฤษ'
    ]
  },
  STARTER: {
    id: 'STARTER',
    name: 'Starter Plan',
    price: 69,
    dailyCredits: 50,
    description: 'เริ่มต้นสุดคุ้ม ปลดล็อคทุกหน้า 100% พร้อม 50 เครดิต AI / เดือน (อายุ 30 วัน)',
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
    allowedTabs: ['lessons', 'flashcards', 'vocab', 'vocab_exam', 'vocab_games', 'translate', 'exercises', 'exams', 'mocktests', 'karaoke', 'reading', 'study_hub', 'call', 'contact'],
    features: [
      'ปลดล็อคทุกหน้า 100% รวมระบบจำลองสอบ (Mock Tests), คาราโอเกะ และเนื้อหาภาษาอังกฤษ',
      '⚡ รับ 50 เครดิต AI / เดือน ใช้ได้ตลอด 30 วัน (หมดอายุพร้อมแพ็กเกจ)',
      'รองรับ BYOK: คอล AI ฟรีไม่อั้น + สอบศัพท์ 10 / ตรวจข้อสอบ 3 / แปลเพลงใหม่ 10 / อธิบายคำเพลง 100 / Roleplay สร้างด่าน 30 ต่อวัน',
      'อายุใช้งาน 30 วัน'
    ]
  },
  BASIC: {
    id: 'BASIC',
    name: 'Basic Plan',
    price: 129,
    dailyCredits: 120,
    description: 'ยอดนิยมสำหรับเรียนต่อเนื่อง ปลดล็อคทุกหน้า พร้อม 120 เครดิต AI / เดือน (อายุ 30 วัน)',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    allowedTabs: ['lessons', 'flashcards', 'vocab', 'vocab_exam', 'vocab_games', 'translate', 'exercises', 'exams', 'mocktests', 'karaoke', 'reading', 'study_hub', 'call', 'contact'],
    features: [
      'ปลดล็อคทุกหน้า 100% รวมระบบจำลองสอบ (Mock Tests), คาราโอเกะ และเนื้อหาภาษาอังกฤษ',
      '⚡ รับ 120 เครดิต AI / เดือน ใช้ได้ตลอด 30 วัน (หมดอายุพร้อมแพ็กเกจ)',
      'รองรับ BYOK: คอล AI ฟรีไม่อั้น + สอบศัพท์ 10 / ตรวจข้อสอบ 3 / แปลเพลงใหม่ 10 / อธิบายคำเพลง 100 / Roleplay สร้างด่าน 30 ต่อวัน',
      'อายุใช้งาน 30 วัน'
    ]
  },
  PLUS: {
    id: 'PLUS',
    name: 'Plus Plan',
    price: 199,
    dailyCredits: 200,
    description: 'คุ้มค่าที่สุดสำหรับฝึกฝนเต็มที่ ปลดล็อคทุกหน้า พร้อม 200 เครดิต AI / เดือน (อายุ 30 วัน)',
    badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    allowedTabs: ['lessons', 'flashcards', 'vocab', 'vocab_exam', 'vocab_games', 'translate', 'exercises', 'exams', 'mocktests', 'karaoke', 'reading', 'study_hub', 'call', 'contact'],
    features: [
      'ปลดล็อคทุกหน้า 100% รวมระบบจำลองสอบ (Mock Tests), คาราโอเกะ และเนื้อหาภาษาอังกฤษ',
      '⚡ รับ 200 เครดิต AI / เดือน ใช้ได้ตลอด 30 วัน (หมดอายุพร้อมแพ็กเกจ)',
      'รองรับ BYOK: คอล AI ฟรีไม่อั้น + สอบศัพท์ 10 / ตรวจข้อสอบ 3 / แปลเพลงใหม่ 10 / อธิบายคำเพลง 100 / Roleplay สร้างด่าน 30 ต่อวัน',
      'อายุใช้งาน 30 วัน'
    ]
  },
  // Legacy & Owner VIP tiers (hidden from customer purchase options; retained for Firestore backward compatibility)
  PREMIUM: {
    id: 'PREMIUM',
    name: 'Premium Plan (Legacy)',
    price: 199,
    dailyCredits: 90,
    description: 'แพ็กเกจเดิมในระบบ (เปิดครบทุกฟีเจอร์)',
    badgeColor: 'bg-purple-100 text-purple-800 border-purple-200',
    allowedTabs: ['lessons', 'flashcards', 'vocab', 'vocab_exam', 'vocab_games', 'translate', 'exercises', 'exams', 'mocktests', 'karaoke', 'reading', 'study_hub', 'call', 'contact'],
    features: [
      'ปลดล็อคทุกหน้า 100%',
      'รองรับ BYOK คอล AI ฟรีไม่อั้น + โควตาฟรีรายวัน (7/3/3)'
    ],
    isLegacy: true
  },
  PRO: {
    id: 'PRO',
    name: 'Pro Plan (Legacy)',
    price: 199,
    dailyCredits: 120,
    description: 'แพ็กเกจเดิมในระบบ (เปิดครบทุกฟีเจอร์)',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
    allowedTabs: ['lessons', 'flashcards', 'vocab', 'vocab_exam', 'vocab_games', 'translate', 'exercises', 'exams', 'mocktests', 'karaoke', 'reading', 'study_hub', 'call', 'contact'],
    features: [
      'ปลดล็อคทุกหน้า 100%',
      'รองรับ BYOK คอล AI ฟรีไม่อั้น + โควตาฟรีรายวัน (7/3/3)'
    ],
    isLegacy: true
  },
  ULTRA: {
    id: 'ULTRA',
    name: 'Owner VIP',
    price: 0,
    dailyCredits: 200,
    description: 'สิทธิ์เจ้าของระบบ (ตลอดชีพ)',
    badgeColor: 'bg-amber-100 text-amber-900 border-amber-300',
    allowedTabs: ['lessons', 'flashcards', 'vocab', 'vocab_exam', 'vocab_games', 'translate', 'exercises', 'exams', 'mocktests', 'karaoke', 'reading', 'study_hub', 'call', 'contact'],
    features: [
      'ปลดล็อคทุกหน้า 100% ตลอดชีพ',
      'รองรับ BYOK คอล AI ฟรีไม่อั้น + โควตาฟรีรายวัน (7/3/3)'
    ],
    isLegacy: true
  }
};

export interface UserSubscriptionState {
  tier: SubscriptionTier;
  dailyCredits: number; // Monthly credits from tier allocation (valid for 30 days, expires with plan)
  maxDailyCredits: number; // Max monthly credits allocated for the 30-day plan
  purchasedCredits: number;
  lastDailyResetDate?: string; // Legacy YYYY-MM-DD
  nextCreditResetAt?: number | null; // Legacy unused field (no 10-day refresh; credits expire with plan)
  lastCreditResetAt?: number | null; // Timestamp (ms) of the last credit grant/upgrade
  expiresAt: number | null; // Timestamp (ms) for 30-day expiration, null for FREE
  isTrial?: boolean; // True if this is a trial
  hasReceivedTestingTrial?: boolean; // True if they have already claimed the 14-day TESTING plan
  hasReceivedAdminCredits?: boolean; // True if they have received their initial admin VIP credits
  chatMessageCount: number; // Tracks progress towards 5 messages = 1 credit
  callSecondsCount: number; // Tracks progress towards 60s = 1 credit
}

export interface CreditTopupOption {
  amount: number; // THB & Credits
  bonus: number; // Extra credits
  label: string;
}

export const TOPUP_OPTIONS: CreditTopupOption[] = [
  { amount: 20, bonus: 0, label: '20 เครดิต (20 บาท)' },
  { amount: 40, bonus: 10, label: '50 เครดิต (40 บาท)' },
  { amount: 70, bonus: 30, label: '100 เครดิต (70 บาท)' },
  { amount: 90, bonus: 60, label: '150 เครดิต (90 บาท)' },
  { amount: 120, bonus: 80, label: '200 เครดิต (120 บาท)' },
  { amount: 150, bonus: 150, label: '300 เครดิต (150 บาท)' },
];

export const PROMPTPAY_CONFIG = {
  phoneNumber: '0955408459',
  accountName: 'ร้านเรียนภาษาจีน-อังกฤษ (PromptPay 095-540-8459)'
};
