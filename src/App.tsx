import { useState, useEffect, useRef } from 'react';
import { Book, BookOpen, Video, Pencil, Layers, FileSignature, UserCircle, Sparkles, Clock, Phone, Library, MessageSquare, Download, Gamepad2, Bot, LogOut, ZoomIn, ZoomOut, Timer, Shield, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import LoginArea, { UserProfile } from './components/LoginArea';
import LessonsArea from './components/LessonsArea';
import VideoCallArea from './components/VideoCallArea';
import ExercisesArea from './components/ExercisesArea';
import FlashcardsArea from './components/FlashcardsArea';
import ExamsArea from './components/ExamsArea';
import MockTestsTabArea from './components/MockTestsTabArea';
import ContactArea from './components/ContactArea';
import AdminDashboardArea from './components/AdminDashboardArea';
import VocabArea from './components/VocabArea';
import VocabExamArea from './components/VocabExamArea';
import LearningPlanModal from './components/LearningPlanModal';
import VocabGamesArea from './components/VocabGamesArea';
import TutorialOverlay from './components/tutorial/TutorialOverlay';
import { TUTORIAL_SCRIPTS } from './data/tutorialData';
import { initAuth, logout, listenToUserSession } from './firebase';
import SubscriptionModal from './components/SubscriptionModal';
import ByokModal from './components/ByokModal';
import { loadUserSubscription, getTotalCredits, syncAdminSubscriptions } from './services/subscriptionService';
import { hasActiveByokKey, syncByokKeyWithFirestore } from './services/byokService';
import { UserSubscriptionState, TIER_CONFIGS, isAdminEmail, isSuperAdminEmail } from './types/subscription';
import { Crown, Zap, Lock, Key } from 'lucide-react';
import { playThaiTTS } from './utils/audio';
import CountdownTimer from './components/CountdownTimer';
import AIAssistantContext from './components/AIAssistantContext';
import { InAppBrowserOverlay } from './components/InAppBrowserOverlay';
import { InstallPromptModal } from './components/InstallPromptModal';
import { UpdatePrompt } from './components/UpdatePrompt';

const NAV_ITEMS = [
  { id: 'call',       icon: Video,          label: 'วิดีโอคอล'    },
  { id: 'lessons',    icon: Library,        label: 'คลังคำศัพท์' },
  { id: 'flashcards', icon: BookOpen,       label: 'แฟลชการ์ด'    },
  { id: 'vocab',      icon: Pencil,         label: 'คัดศัพท์'     },
  { id: 'vocab_exam', icon: FileSignature,  label: 'สอบศัพท์'     },
  { id: 'vocab_games',icon: Gamepad2,      label: 'เกมคำศัพท์'   },
  { id: 'exercises',  icon: Book,           label: 'บทเรียน'      },
  { id: 'exams',      icon: Layers,         label: 'ข้อสอบ'       },
  { id: 'mocktests',  icon: Clock,          label: 'จำลองสอบ'     },
  { id: 'contact',    icon: Phone,          label: 'ติดต่อ'     },
];

function RealtimeClock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const thDate = time.toLocaleDateString('th-TH', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const thTime = time.toLocaleTimeString('th-TH');

  return (
    <div className="hidden lg:flex items-center gap-1.5 ml-3 px-3 py-1 bg-indigo-50/80 border border-indigo-100 rounded-lg shadow-sm text-xs text-indigo-700 font-medium whitespace-nowrap">
      <Clock size={12} className="text-indigo-500" />
      <span>{thDate} เวลา {thTime}</span>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState('call');
  const [activeLang, setActiveLang] = useState<'EN' | 'CN' | 'TH'>('EN');
  const [askWord, setAskWord] = useState<string | null>(null);
  const [askPdfUrl, setAskPdfUrl] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isTutorialActive, setIsTutorialActive] = useState<boolean>(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [loginPromptState, setLoginPromptState] = useState<'pending' | 'prompting' | 'done'>('pending');
  const [uiScale, setUiScale] = useState(1);
  const [showLearningPlan, setShowLearningPlan] = useState(false);
  const [botMessage, setBotMessage] = useState<string | null>(null);
  const botMessageTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    document.documentElement.style.fontSize = `${uiScale * 16}px`;
  }, [uiScale]);

  const speak = (text: string) => {
    playThaiTTS(text);
    setBotMessage(text);
    if (botMessageTimeoutRef.current) clearTimeout(botMessageTimeoutRef.current);
    // Keep message visible for reading time (roughly 150ms per character, min 4s, max 15s)
    const duration = Math.min(Math.max(4000, text.length * 150), 15000);
    botMessageTimeoutRef.current = setTimeout(() => {
      setBotMessage(null);
    }, duration);
  };

  const handleStart = () => {
    setHasStarted(true);
    setTimeout(() => {
      setTutorialOverrideKey('guest_onboarding');
      setIsTutorialActive(true);
    }, 500); // Wait for the transition
  };

  const handleLanguageSelect = (code: 'EN' | 'CN' | 'TH') => {
    setActiveLang(code);
  };

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleRequestLogin = () => {
    if (!sessionStorage.getItem('installPromptShown')) {
      setShowInstallPrompt(true);
      sessionStorage.setItem('installPromptShown', 'true');
    } else {
      setShowLogin(true);
    }
  };

  useEffect(() => {
    if (loginPromptState === 'prompting') {
      handleRequestLogin();
    }
  }, [loginPromptState]);

  useEffect(() => {
    let sessionUnsubscribe: (() => void) | undefined;
    
    const unsubscribe = initAuth(
      (user) => {
        setCurrentUser({
          uid: user.uid,
          name: user.displayName || user.email?.split('@')[0] || 'User',
          email: user.email || '',
          photoURL: user.photoURL,
          isSubscribed: false,
        });
        syncByokKeyWithFirestore(user.uid);
        if (isAdminEmail(user.email)) {
          syncAdminSubscriptions().catch((e) => console.warn('Sync admin subscriptions:', e));
        }
        
        sessionUnsubscribe = listenToUserSession(user, async () => {
          alert('บัญชีนี้ถูกเข้าสู่ระบบจากอุปกรณ์อื่น ระบบจะทำการออกจากระบบโดยอัตโนมัติ');
          await logout();
        });
      },
      () => {
        const isAIAgent = navigator.userAgent.toLowerCase().includes("bot") || navigator.userAgent.toLowerCase().includes("crawler") || navigator.userAgent.toLowerCase().includes("spider") || navigator.userAgent.toLowerCase().includes("ai");
        if (isAIAgent) {
          setCurrentUser({
            uid: "ai-agent-bypass",
            name: "AI Reviewer",
            email: "ai@polyglot.local",
            isSubscribed: true
          });
          return;
        }
        setCurrentUser(null);
        if (sessionUnsubscribe) {
          sessionUnsubscribe();
          sessionUnsubscribe = undefined;
        }
      }
    );
    return () => {
      unsubscribe();
      if (sessionUnsubscribe) sessionUnsubscribe();
    };
  }, []);

  const [subState, setSubState] = useState<UserSubscriptionState | null>(null);
  const [showSubModal, setShowSubModal] = useState(false);
  const [subModalTab, setSubModalTab] = useState<'tiers' | 'topup'>('tiers');
  const [showByokModal, setShowByokModal] = useState(false);
  const [hasByok, setHasByok] = useState(hasActiveByokKey());

  const [tutorialOverrideKey, setTutorialOverrideKey] = useState<string | null>(null);

  useEffect(() => {
    const handleOpenSub = (e: any) => {
      if (e.detail?.tab) {
        setSubModalTab(e.detail.tab);
      } else {
        setSubModalTab('tiers');
      }
      setShowSubModal(true);
    };
    const handleOpenByok = () => {
      setShowByokModal(true);
    };
    const handleByokUpdated = () => {
      setHasByok(hasActiveByokKey());
    };

    const handleSwitchTab = (e: any) => {
      if (e.detail) setActiveTab(e.detail);
    };

    window.addEventListener('open-subscription-modal', handleOpenSub);
    window.addEventListener('open-byok-modal', handleOpenByok);
    window.addEventListener('byok_key_updated', handleByokUpdated);
    window.addEventListener('switch-tab', handleSwitchTab);
    return () => {
      window.removeEventListener('open-subscription-modal', handleOpenSub);
      window.removeEventListener('open-byok-modal', handleOpenByok);
      window.removeEventListener('byok_key_updated', handleByokUpdated);
      window.removeEventListener('switch-tab', handleSwitchTab);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    async function initSub() {
      const s = await loadUserSubscription();
      if (isMounted) setSubState(s);
    }
    initSub();

    const handleSubUpdated = (e: any) => {
      if (e.detail) {
        setSubState({ ...e.detail });
      } else {
        loadUserSubscription().then(s => { if (isMounted) setSubState(s); });
      }
    };

    window.addEventListener('subscription_updated', handleSubUpdated);
    return () => {
      isMounted = false;
      window.removeEventListener('subscription_updated', handleSubUpdated);
    };
  }, [currentUser]);

  const currentTierConfig = subState ? TIER_CONFIGS[subState.tier] : TIER_CONFIGS.FREE;
  const isFreeTier = !subState || subState.tier === 'FREE';
  const isTabAllowedByTier = currentTierConfig.allowedTabs.includes(activeTab);
  
  // Free tier can access lessons (คลังศัพท์), flashcards, vocab (คัดศัพท์), and vocab_exam (สอบศัพท์) in both CN and EN!
  // Only exercises (บทเรียน) and exams (ข้อสอบ) in English (EN) require a paid plan.
  const isLanguageAllowedForFree = !isFreeTier || activeLang === 'CN' || (activeTab !== 'exercises' && activeTab !== 'exams');

  const isSuperAdmin = isSuperAdminEmail(currentUser?.email);
  const isAdmin = isAdminEmail(currentUser?.email);

  // For Super Admin (Owner - ittipat15616@gmail.com):
  // Simulate the exact restrictions of the selected plan!
  // Tab 'admin' is always accessible so Owner is never locked out of backend settings.
  // When Owner simulates FREE, tabs like Games, Mock Tests, or English exercises/exams WILL be locked, exactly like a real user!
  const isTabLocked = activeTab !== 'admin' && (
    isSuperAdmin
      ? (!isTabAllowedByTier || !isLanguageAllowedForFree)
      : (!isAdmin && (!isTabAllowedByTier || !isLanguageAllowedForFree))
  );

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      alert("เบราว์เซอร์นี้ไม่รองรับการติดตั้งแอปโดยตรงผ่านปุ่มนี้ หรือคุณได้ติดตั้งแอปนี้แล้ว (หากใช้งาน iOS/Safari ให้กดปุ่ม Share ที่แถบด้านล่างแล้วเลือก 'Add to Home Screen' แทน)");
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to install prompt: ${outcome}`);
    setDeferredPrompt(null);
  };

  const handleAskAI = (word: string) => { setAskWord(word); setActiveTab('call'); };
  const handleAskPDF = (url: string)  => { setAskPdfUrl(url); setActiveTab('call'); };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-pattern">
      <UpdatePrompt />
      <InAppBrowserOverlay />
      <AIAssistantContext />

      {/* ── BOT MESSAGE OVERLAY ── */}
      <AnimatePresence>
        {botMessage && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] max-w-md w-[90%] md:w-auto"
          >
            <div className="bg-white/95 backdrop-blur-md shadow-2xl rounded-2xl p-4 border border-indigo-100 flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 shadow-inner">
                <Sparkles size={20} className="text-white" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-indigo-900 mb-1">AG Bot</h3>
                <p className="text-sm text-gray-700 leading-relaxed">{botMessage}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── LEARNING PLAN MODAL ── */}
      <AnimatePresence>
        {showLearningPlan && (
          <LearningPlanModal onClose={() => setShowLearningPlan(false)} activeLang={activeLang} onNavigate={setActiveTab} />
        )}
      </AnimatePresence>

      {/* ── HEADER ── */}
      <header
        className="relative z-10 shrink-0 flex flex-wrap items-center justify-between px-3 sm:px-5 md:px-8 glass py-2 gap-2"
        style={{ minHeight: 64, borderBottom: '1px solid rgba(124,58,237,0.12)', borderRadius: 0 }}
      >
        {/* Logo */}
        <motion.div
          className="flex items-center gap-2.5 cursor-default select-none"
          whileHover={{ scale: 1.02 }}
        >
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shadow-md"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #5b21b6)' }}
          >
            <Sparkles size={16} className="text-white" />
          </div>
          <span className="text-lg font-bold gradient-text tracking-tight hidden sm:inline">Polyglot AI</span>
          <span className="badge badge-gold hidden md:inline-flex">Beta</span>
          <RealtimeClock />
        </motion.div>

        {/* Right controls */}
        <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2 ml-auto">
          {/* Subscription & Wallet Button */}
          <button
            id="btn-subscription-topup"
            onClick={() => setShowSubModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white text-xs font-bold shadow-sm transition-all hover:scale-105"
            title="ดูแพ็กเกจสมาชิกและกระเป๋าเครดิต"
          >
            <Crown size={14} className="text-amber-200" />
            <div className="flex flex-col items-start">
              <span>
                {isSuperAdminEmail(currentUser?.email)
                  ? `${currentTierConfig.name} (Owner)`
                  : isAdminEmail(currentUser?.email)
                  ? 'Starter Plan (Admin)'
                  : currentTierConfig.name}
              </span>
              {subState?.expiresAt && subState.tier !== 'FREE' && (
                <span className="text-[9px] text-amber-100 flex items-center gap-1 font-mono">
                  {isSuperAdminEmail(currentUser?.email) ? (
                    subState.tier === 'ULTRA' ? (
                      <span>ตลอดชีพ</span>
                    ) : (
                      <>
                        <Timer size={10} />
                        <CountdownTimer expiresAt={subState.expiresAt} onExpire={() => loadUserSubscription().then(setSubState)} />
                      </>
                    )
                  ) : isAdminEmail(currentUser?.email) ? (
                    <span>ตลอดชีพ</span>
                  ) : (
                    <>
                      <Timer size={10} />
                      <CountdownTimer expiresAt={subState.expiresAt} onExpire={() => loadUserSubscription().then(setSubState)} />
                    </>
                  )}
                </span>
              )}
            </div>
            <div className="h-3.5 w-px bg-white/30" />
            <Zap size={14} className="text-amber-200" />
            <span>{subState ? getTotalCredits(subState) : 0} เครดิต</span>
          </button>

          {/* BYOK (Bring Your Own Key) Button */}
          <button
            id="btn-byok-settings"
            onClick={() => setShowByokModal(true)}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold shadow-sm transition-all hover:scale-105 ${
              hasByok
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white border border-emerald-400/40'
                : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300'
            }`}
            title="ตั้งค่า Gemini API Key ส่วนตัว (BYOK) เพื่อรับสิทธิพิเศษการโทรสุดคุ้ม"
          >
            <Key size={14} className={hasByok ? "text-emerald-200" : "text-indigo-600"} />
            <div className="flex flex-col items-start text-left">
              <span className="hidden sm:inline">
                {hasByok ? 'BYOK: เปิดใช้' : 'ใส่ API Key (ลดเครดิต)'}
              </span>
              <span className="sm:hidden">
                {hasByok ? 'BYOK' : 'API Key'}
              </span>
            </div>
            {hasByok && (
              <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse shrink-0" />
            )}
          </button>

          {/* PWA Install Button */}
          <button
            onClick={handleInstallClick}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-xs font-bold shadow-sm hover:shadow-md transition-all hover:scale-105 hidden sm:flex"
            title="ติดตั้งแอปพลิเคชันแบบ PWA"
          >
            <Download size={14} />
            <span>ติดตั้งแอป</span>
          </button>
          
          {/* Language selector */}
          <div id="lang-selector" className="flex items-center gap-1 rounded-xl p-1 transition-all duration-500" style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border-soft)' }}>
            {[
              { code: 'EN', flag: '🇬🇧' },
              { code: 'CN', flag: '🇨🇳' },
            ].map(({ code, flag }) => (
              <button
                key={code}
                onClick={() => handleLanguageSelect(code as any)}
                className="text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-all duration-200"
                style={activeLang === code
                  ? { background: 'linear-gradient(135deg,#7c3aed,#5b21b6)', color: 'white', boxShadow: '0 2px 8px rgba(124,58,237,0.35)' }
                  : { color: 'var(--c-text-muted)' }
                }
              >
                {flag} {code}
              </button>
            ))}
          </div>

          {/* Learning Plan Button */}
          <button 
            id="btn-study-plan"
            onClick={() => setShowLearningPlan(true)}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-white border border-indigo-200 text-indigo-700 text-xs font-bold shadow-sm hover:bg-indigo-50 transition-all hover:scale-105"
            title="วางแผนการเรียน 30 วัน"
          >
            <Calendar size={14} />
            <span className="hidden sm:inline">วางแผนการเรียน</span>
            <span className="sm:hidden">วางแผน</span>
          </button>

          {/* Interactive Tutorial Trigger Button */}
          {activeTab !== 'chat' && (
            <button
              id="btn-tutorial-guide"
              onClick={() => setIsTutorialActive(true)}
              className="flex items-center gap-1.5 text-xs font-black px-2 sm:px-3 py-1.5 rounded-xl transition-all bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 shadow-md shadow-amber-500/20 hover:scale-105"
              title="เปิดโหมดแนะนำการใช้งานแบบอินเทอร์แอคทีฟ"
            >
              <Bot size={15} /> <span className="hidden sm:inline">แนะนำการใช้งาน</span><span className="sm:hidden">แนะนำ</span>
            </button>
          )}

          {/* Auth */}
          {currentUser ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-700 shadow-xs">
                {currentUser.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt={currentUser.name}
                    className="w-6 h-6 rounded-full object-cover border border-indigo-200"
                  />
                ) : (
                  <UserCircle size={18} className="text-indigo-600" />
                )}
                <span className="max-w-[110px] truncate">{currentUser.name}</span>
                {isAdminEmail(currentUser.email) && (
                  <span className={`ml-1 px-1.5 py-0.5 font-bold text-[10px] rounded border ${
                    isSuperAdminEmail(currentUser.email)
                      ? 'bg-amber-100 text-amber-900 border-amber-300 shadow-xs'
                      : 'bg-purple-100 text-purple-800 border-purple-200'
                  }`}>
                    {isSuperAdminEmail(currentUser.email) ? 'Owner' : 'Admin'}
                  </span>
                )}
              </div>
              <button
                onClick={async () => {
                  await logout();
                  setCurrentUser(null);
                }}
                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                title="ออกจากระบบ"
              >
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <motion.button
              id="btn-login"
              whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              onClick={handleRequestLogin}
              className="btn-primary text-sm !px-4 !py-2 !rounded-xl"
            >
              เข้าสู่ระบบ
            </motion.button>
          )}
        </div>
      </header>

      {/* ── MAIN ── */}
      <main className="flex-1 overflow-y-auto w-full pb-20 md:pb-0">
        <div className="max-w-5xl mx-auto p-4 md:p-6 w-full flex flex-col min-h-full">
          {isTabLocked ? (
            /* Locked Tab Overlay */
            <div className="flex-1 flex flex-col items-center justify-center p-8 bg-white/80 backdrop-blur-md rounded-3xl border border-slate-200 text-center shadow-lg my-auto">
              <div className="w-16 h-16 bg-amber-100 text-amber-700 rounded-3xl flex items-center justify-center mb-4 shadow-inner">
                <Lock size={32} />
              </div>
              <h2 className="text-2xl font-black text-slate-800 mb-2">
                {!isLanguageAllowedForFree
                  ? 'บทเรียนและข้อสอบภาษาอังกฤษเปิดให้เฉพาะสมาชิก'
                  : 'ปลดล็อคฟีเจอร์นี้ด้วยแพ็กเกจสมาชิก'}
              </h2>
              <p className="text-sm text-slate-600 max-w-md mb-6">
                {!isLanguageAllowedForFree
                  ? 'แพ็กเกจฟรีใช้งานได้เฉพาะบทเรียนและข้อสอบภาษาจีน (CN) เท่านั้น อัปเกรดแพ็กเกจเพื่อเข้าถึงเนื้อหาภาษาอังกฤษ'
                  : 'ฟีเจอร์นี้เปิดให้ใช้งานเฉพาะสมาชิกแพ็กเกจขึ้นไป (เริ่มต้นเพียง 69 บาท / 30 วัน)'}
              </p>
              <button
                onClick={() => setShowSubModal(true)}
                className="px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-extrabold rounded-2xl shadow-lg hover:shadow-xl transition-all flex items-center gap-2 hover:scale-105"
              >
                <Crown size={18} /> ดูแพ็กเกจและปลดล็อคใช้งาน
              </button>
            </div>
          ) : (
            <AnimatePresence mode="wait">
            {activeTab === 'lessons' && (
              <motion.div key={`lessons_${currentUser?.uid || 'guest'}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }} className="h-full">
                <LessonsArea activeLang={activeLang} onAskAI={handleAskAI} />
              </motion.div>
            )}
            {activeTab === 'vocab' && (
              <motion.div key={`vocab_${currentUser?.uid || 'guest'}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }} className="h-full">
                <VocabArea activeLang={activeLang} onAskAI={handleAskAI} />
              </motion.div>
            )}
            {activeTab === 'flashcards' && (
              <motion.div key={`flashcards_${currentUser?.uid || 'guest'}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }} className="h-full">
                <FlashcardsArea activeLang={activeLang} onAskAI={handleAskAI} />
              </motion.div>
            )}
            {activeTab === 'vocab_exam' && (
              <motion.div key={`vocab_exam_${currentUser?.uid || 'guest'}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }} className="h-full">
                <VocabExamArea activeLang={activeLang} onAskAI={handleAskAI} />
              </motion.div>
            )}
            {activeTab === 'vocab_games' && (
              <motion.div key={`vocab_games_${currentUser?.uid || 'guest'}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }} className="h-full">
                <VocabGamesArea activeLang={activeLang} />
              </motion.div>
            )}
            {activeTab === 'exercises' && (
              <motion.div key={`exercises_${currentUser?.uid || 'guest'}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }} className="h-full">
                <ExercisesArea activeLang={activeLang} onAskPDF={handleAskPDF} />
              </motion.div>
            )}
            {activeTab === 'exams' && (
              <motion.div key={`exams_${currentUser?.uid || 'guest'}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }} className="h-full">
                <ExamsArea activeLang={activeLang} onAskAI={handleAskAI} />
              </motion.div>
            )}
            {activeTab === 'mocktests' && (
              <motion.div key={`mocktests_${currentUser?.uid || 'guest'}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }} className="h-full">
                <MockTestsTabArea activeLang={activeLang}
                  onAskAI={(msg) => {
                    setAskWord(msg);
                    setActiveTab('call');
                  }}
                />
              </motion.div>
            )}
            {activeTab === 'contact' && (
              <motion.div key="contact" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }} className="h-full">
                <ContactArea />
              </motion.div>
            )}
            {activeTab === 'admin' && isAdminEmail(currentUser?.email) && (
              <motion.div key="admin" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }} className="h-full">
                <AdminDashboardArea />
              </motion.div>
            )}
          </AnimatePresence>
          )}

          {/* VideoCallArea: always mounted */}
          <div className={activeTab === 'call' ? 'flex-1 h-full block' : 'hidden'}>
            <VideoCallArea
              activeLang={activeLang}
              askWord={askWord}
              clearAskWord={() => setAskWord(null)}
              askPdfUrl={askPdfUrl}
              clearAskPdfUrl={() => setAskPdfUrl(null)}
              onOpenSubscription={(tab) => {
                setSubModalTab(tab || 'tiers');
                setShowSubModal(true);
              }}
            />
          </div>
        </div>
      </main>

      {/* ── BOTTOM NAV ── */}
      <nav
        className="relative z-10 fixed bottom-0 w-full md:static md:w-auto shrink-0 flex overflow-x-auto no-scrollbar glass"
        style={{
          height: 68,
          borderTop: '1px solid rgba(124,58,237,0.12)',
          borderRadius: 0,
        }}
      >
        <div className="flex items-center justify-start sm:justify-center w-max min-w-full px-4 gap-2 sm:gap-4 md:gap-8">
          {[
            ...NAV_ITEMS,
            ...(isAdminEmail(currentUser?.email) ? [{ id: 'admin', icon: Shield, label: 'หลังบ้าน' }] : [])
          ].map(({ id, icon: Icon, label }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex flex-col items-center gap-1 px-2 py-1.5 rounded-xl min-w-[60px] transition-all duration-200 relative ${active ? 'nav-tab-active' : ''}`}
                style={active
                  ? { color: 'var(--c-indigo-mid)' }
                  : { color: 'var(--c-text-subtle)' }
                }
              >
                {active && (
                  <motion.div
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-xl"
                    style={{ background: 'var(--c-indigo-pale)' }}
                    transition={{ type: 'spring', bounce: 0.25, duration: 0.4 }}
                  />
                )}
                <Icon size={21} strokeWidth={active ? 2.5 : 1.8} className="relative z-10" />
                <span className="text-[10px] font-bold tracking-wide relative z-10">{label}</span>
              </button>
            );
          })}
        </div>
        
      </nav>

      {/* Login Modal */}
      <InstallPromptModal 
        isOpen={showInstallPrompt}
        onClose={() => {
          setShowInstallPrompt(false);
          setShowLogin(true);
        }}
        deferredPrompt={deferredPrompt}
      />
      {showLogin && (
        <LoginArea
          onLogin={(user) => { 
            setCurrentUser(user); 
            setShowLogin(false); 
            if (loginPromptState === 'prompting') {
              setLoginPromptState('done');
              speak("ลงชื่อเข้าใช้สำเร็จ ขอให้สนุกกับการเรียนนะครับ");
            }
          }}
          onClose={() => {
            setShowLogin(false);
            if (loginPromptState === 'prompting') {
              setLoginPromptState('done');
              speak("ขอให้สนุกกับการเรียนนะครับ");
            }
          }}
        />
      )}

      {/* Subscription & Credit Modal */}
      <SubscriptionModal
        isOpen={showSubModal}
        initialTab={subModalTab}
        onClose={() => setShowSubModal(false)}
        onSubscriptionUpdated={(s) => setSubState(s)}
      />

      {/* BYOK (Bring Your Own Key) Settings Modal */}
      <ByokModal
        isOpen={showByokModal}
        onClose={() => setShowByokModal(false)}
        subState={subState}
        onKeyUpdated={() => setHasByok(hasActiveByokKey())}
      />

      {/* Welcome Screen Overlay */}
      <AnimatePresence>
        {!hasStarted && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/70 backdrop-blur-xl"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex flex-col items-center gap-6 p-8 bg-white rounded-3xl shadow-2xl border border-indigo-50 max-w-sm text-center"
            >
              <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
                <Bot size={40} className="text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-black bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600 tracking-tight">Polyglot AI</h1>
                <p className="text-slate-500 mt-2 font-medium">ผู้ช่วย AI อัจฉริยะสำหรับการเรียนภาษา</p>
              </div>
              <button
                onClick={handleStart}
                className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-lg rounded-2xl shadow-xl hover:shadow-2xl hover:scale-[1.02] transition-all active:scale-95"
              >
                เริ่มเรียนรู้
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Interactive Robot Tutorial Engine */}
      <TutorialOverlay
        steps={TUTORIAL_SCRIPTS[
          tutorialOverrideKey || (
          activeTab === 'lessons' && activeLang === 'CN' ? 'lessons_cn' :
          activeTab === 'exercises' && activeLang === 'CN' ? 'exercises_cn' :
          activeTab === 'flashcards' && activeLang === 'CN' ? 'flashcards_cn' :
          activeTab === 'exams' && activeLang === 'CN' ? 'exams_cn' :
          activeTab === 'mocktests' && activeLang === 'CN' ? 'mocktests_cn' :
          activeTab === 'call' && activeLang === 'CN' ? 'call_cn' :
          activeTab
          )
        ]?.steps || []}
        isActive={isTutorialActive}
        onClose={() => {
          setIsTutorialActive(false);
          if (tutorialOverrideKey === 'guest_onboarding' && !currentUser && loginPromptState === 'pending') {
            setLoginPromptState('prompting');
          }
          if (tutorialOverrideKey) setTutorialOverrideKey(null);
        }}
      />
    </div>
  );
}
