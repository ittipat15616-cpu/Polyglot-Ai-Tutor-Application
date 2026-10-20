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
  dailyCredits: number; // Credits allocated every 10-day cycle
  description: string;
  badgeColor: string;
  allowedTabs: string[]; // Allowed tab IDs ('lessons', 'flashcards', 'vocab', 'vocab_exam', 'vocab_games', 'exercises', 'exams', 'mocktests', 'call', 'contact')
  features: string[];
}

export const TIER_CONFIGS: Record<SubscriptionTier, TierConfig> = {
  TESTING: {
    id: 'TESTING',
    name: 'Testing Plan',
    price: 0,
    dailyCredits: 0,
    description: 'แพ็กเกจทดลองสำหรับบัญชีใหม่ (14 วัน)',
    badgeColor: 'bg-teal-100 text-teal-800 border-teal-200',
    allowedTabs: ['lessons', 'flashcards', 'vocab', 'vocab_exam', 'vocab_games', 'exercises', 'exams', 'mocktests', 'call', 'contact'],
    features: [
      'ปลดล็อคเข้าใช้งานได้ทุกหน้าเป็นเวลา 14 วัน (รวมเกมคำศัพท์)',
      'ไม่มีเครดิต AI ให้ฟรี (หากต้องการใช้งาน AI สามารถซื้อแพ็กเกจหรือเติมเครดิตเพิ่มได้)',
      'เมื่อครบ 14 วัน จะกลับไปใช้ Free Plan',
      'หากมีเครดิตที่เติมไว้ สามารถใช้งานต่อได้'
    ]
  },
  FREE: {
    id: 'FREE',
    name: 'Free Plan',
    price: 0,
    dailyCredits: 0,
    description: 'เข้าถึงคลังคำศัพท์ แฟลชการ์ด คัดศัพท์ และสอบศัพท์ฟรีทั้งภาษาจีนและอังกฤษ',
    badgeColor: 'bg-slate-100 text-slate-700 border-slate-200',
    allowedTabs: ['lessons', 'flashcards', 'vocab', 'vocab_exam', 'exercises', 'exams', 'contact', 'call'],
    features: [
      'เข้าถึงคลังคำศัพท์ แฟลชการ์ด คัดศัพท์ และสอบศัพท์ฟรี (ทั้งภาษาจีนและอังกฤษ)',
      'ทำบทเรียนและข้อสอบภาษาจีนฟรี (CN)',
      'สอบศัพท์ใช้ 1 เครดิตในการส่งตรวจคำตอบ',
      'เข้าถึงหน้าคอลได้ (ใช้งาน AI เมื่อมีเครดิต)',
      'ล็อคเกมคำศัพท์ ระบบจำลองสอบ และบทเรียน/ข้อสอบภาษาอังกฤษ'
    ]
  },
  STARTER: {
    id: 'STARTER',
    name: 'Starter Plan',
    price: 69,
    dailyCredits: 0,
    description: 'ปลดล็อคทุกหน้ารวมเกมคำศัพท์ 100% (ไม่มีเครดิต AI ให้)',
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
    allowedTabs: ['lessons', 'flashcards', 'vocab', 'vocab_exam', 'vocab_games', 'exercises', 'exams', 'mocktests', 'call', 'contact'],
    features: [
      'ปลดล็อคเข้าใช้งานได้ทุกหน้า 100%',
      'รวมหน้าเกมคำศัพท์ แฟลชการ์ด คัดศัพท์ สอบศัพท์ บทเรียน',
      'เข้าถึงระบบจำลองสอบ HSK & IELTS',
      'ไม่มีเครดิต AI ให้ (หากต้องการใช้ AI สามารถซื้อแพลนหรือเติมเครดิตเพิ่ม)'
    ]
  },
  BASIC: {
    id: 'BASIC',
    name: 'Basic Plan',
    price: 129,
    dailyCredits: 40,
    description: 'เปิดครบทุกฟีเจอร์รวมเกมคำศัพท์ พร้อม 40 เครดิต (รีเฟรชทุก 10 วัน)',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    allowedTabs: ['lessons', 'flashcards', 'vocab', 'vocab_exam', 'vocab_games', 'exercises', 'exams', 'mocktests', 'call', 'contact'],
    features: [
      'ปลดล็อคทุกฟีเจอร์รวมเกมคำศัพท์ 100%',
      '⚡ รับ 40 เครดิต AI รีเฟรชทุกๆ 10 วัน',
      'คอลเสียงกับ AI หรือวิดีโอคอล/ตรวจข้อสอบ',
      'อายุใช้งาน 30 วัน'
    ]
  },
  PLUS: {
    id: 'PLUS',
    name: 'Plus Plan',
    price: 199,
    dailyCredits: 65,
    description: 'คุ้มค่าสำหรับเรียนต่อเนื่อง พร้อม 65 เครดิต (รีเฟรชทุก 10 วัน)',
    badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    allowedTabs: ['lessons', 'flashcards', 'vocab', 'vocab_exam', 'vocab_games', 'exercises', 'exams', 'mocktests', 'call', 'contact'],
    features: [
      'ปลดล็อคทุกฟีเจอร์ในแอป 100%',
      '⚡ รับ 65 เครดิต AI รีเฟรชทุกๆ 10 วัน',
      'คอลเสียงกับ AI หรือวิดีโอคอล/ตรวจข้อสอบ',
      'อายุใช้งาน 30 วัน'
    ]
  },
  PREMIUM: {
    id: 'PREMIUM',
    name: 'Premium Plan',
    price: 269,
    dailyCredits: 90,
    description: 'สำหรับผู้เรียนจริงจัง พร้อม 90 เครดิต (รีเฟรชทุก 10 วัน)',
    badgeColor: 'bg-purple-100 text-purple-800 border-purple-200',
    allowedTabs: ['lessons', 'flashcards', 'vocab', 'vocab_exam', 'vocab_games', 'exercises', 'exams', 'mocktests', 'call', 'contact'],
    features: [
      'ปลดล็อคทุกฟีเจอร์ในแอป 100%',
      '⚡ รับ 90 เครดิต AI รีเฟรชทุกๆ 10 วัน',
      'คอลเสียงกับ AI หรือวิดีโอคอล/ตรวจข้อสอบ',
      'อายุใช้งาน 30 วัน'
    ]
  },
  PRO: {
    id: 'PRO',
    name: 'Pro Plan',
    price: 339,
    dailyCredits: 120,
    description: 'สำหรับฝึกฝนเข้มข้น พร้อม 120 เครดิต (รีเฟรชทุก 10 วัน)',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
    allowedTabs: ['lessons', 'flashcards', 'vocab', 'vocab_exam', 'vocab_games', 'exercises', 'exams', 'mocktests', 'call', 'contact'],
    features: [
      'ปลดล็อคทุกฟีเจอร์ในแอป 100%',
      '⚡ รับ 120 เครดิต AI รีเฟรชทุกๆ 10 วัน',
      'คอลเสียงกับ AI หรือวิดีโอคอล/ตรวจข้อสอบ',
      'อายุใช้งาน 30 วัน'
    ]
  },
  ULTRA: {
    id: 'ULTRA',
    name: 'Ultra Plan',
    price: 399,
    dailyCredits: 150,
    description: 'แพ็กเกจสูงสุด ใช้งาน AI เต็มที่ พร้อม 150 เครดิต (รีเฟรชทุก 10 วัน)',
    badgeColor: 'bg-rose-100 text-rose-800 border-rose-200',
    allowedTabs: ['lessons', 'flashcards', 'vocab', 'vocab_exam', 'vocab_games', 'exercises', 'exams', 'mocktests', 'call', 'contact'],
    features: [
      'ปลดล็อคทุกฟีเจอร์ในแอป 100%',
      '⚡ รับ 150 เครดิต AI รีเฟรชทุกๆ 10 วัน',
      'คอลเสียงกับ AI หรือวิดีโอคอล/ตรวจข้อสอบ',
      'สิทธิ์การใช้งานระดับสูงสุด Ultra VIP 30 วัน'
    ]
  }
};

export interface UserSubscriptionState {
  tier: SubscriptionTier;
  dailyCredits: number; // Credits from tier allocation (refreshed every 10 days)
  maxDailyCredits: number; // Max credits allocated per 10-day cycle
  purchasedCredits: number;
  lastDailyResetDate?: string; // Legacy YYYY-MM-DD
  nextCreditResetAt?: number | null; // Timestamp (ms) for next 10-day cycle refresh
  lastCreditResetAt?: number | null; // Timestamp (ms) of the last credit refresh
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
