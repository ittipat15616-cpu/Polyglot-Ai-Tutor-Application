import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Key, 
  CheckCircle2, 
  XCircle, 
  Eye, 
  EyeOff, 
  ExternalLink, 
  ShieldCheck, 
  Trash2, 
  Sparkles, 
  Info,
  Zap,
  PhoneCall,
  Video,
  Image as ImageIcon,
  Loader2,
  Check,
  Clipboard,
  Cloud,
  Smartphone,
  Laptop,
  PlayCircle,
  FileSignature,
  Clock,
  Music,
  Captions,
  Lock,
  LogIn,
  BookOpen
} from 'lucide-react';
import { 
  getStoredByokKey, 
  setStoredByokKey, 
  removeStoredByokKey, 
  validateApiKeyWithServer,
  getByokCallRates,
  syncByokKeyWithFirestore,
  syncByokDailyUsageWithFirestore,
  getByokDailyUsage,
  BYOK_DAILY_LIMITS,
  ByokDailyUsage,
  getResetTimeLabelThai
} from '../services/byokService';
import { openLoginModal } from '../services/authHeaders';
import { UserSubscriptionState } from '../types/subscription';
import { auth } from '../firebase';

interface ByokModalProps {
  isOpen: boolean;
  onClose: () => void;
  subState: UserSubscriptionState | null;
  onKeyUpdated?: () => void;
}

export const ByokModal: React.FC<ByokModalProps> = ({
  isOpen,
  onClose,
  subState,
  onKeyUpdated
}) => {
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isPasting, setIsPasting] = useState(false);
  const [pasteSuccess, setPasteSuccess] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    status: 'idle' | 'success' | 'error';
    message: string;
  }>({ status: 'idle', message: '' });
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [dailyUsage, setDailyUsage] = useState<ByokDailyUsage>(() => getByokDailyUsage());
  const [isSignedIn, setIsSignedIn] = useState<boolean>(() => Boolean(auth.currentUser));

  useEffect(() => {
    if (!isOpen) return;
    const signedInNow = Boolean(auth.currentUser);
    setIsSignedIn(signedInNow);

    if (!signedInNow) {
      setActiveKey(null);
      setApiKeyInput('');
      setValidationResult({ status: 'idle', message: '' });
      setDailyUsage(getByokDailyUsage());
      return;
    }

    // Sync latest key & daily usage from Firestore when logged in
    syncByokKeyWithFirestore().then((cloudKey) => {
      const stored = cloudKey || getStoredByokKey();
      setActiveKey(stored);
      setApiKeyInput(stored || '');
      setValidationResult({ status: 'idle', message: '' });
    });
    syncByokDailyUsageWithFirestore().then((usage) => {
      setDailyUsage(usage);
    });

    const handleQuotaUpdated = () => {
      setDailyUsage(getByokDailyUsage());
    };
    const handleKeyUpdated = () => {
      const signed = Boolean(auth.currentUser);
      setIsSignedIn(signed);
      const stored = signed ? getStoredByokKey() : null;
      setActiveKey(stored);
      if (!signed) setApiKeyInput('');
    };

    window.addEventListener('byok_quota_updated', handleQuotaUpdated);
    window.addEventListener('byok_key_updated', handleKeyUpdated);
    return () => {
      window.removeEventListener('byok_quota_updated', handleQuotaUpdated);
      window.removeEventListener('byok_key_updated', handleKeyUpdated);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const currentTier = subState?.tier || 'FREE';
  const currentRates = getByokCallRates(currentTier);

  const handlePasteFromClipboard = async () => {
    if (!auth.currentUser) {
      setValidationResult({
        status: 'error',
        message: 'กรุณาเข้าสู่ระบบด้วยบัญชี Google ก่อนตั้งค่าและใช้งาน BYOK ครับ'
      });
      return;
    }
    setIsPasting(true);
    try {
      let pastedText = '';
      if (navigator.clipboard && navigator.clipboard.readText) {
        try {
          pastedText = await navigator.clipboard.readText();
        } catch (clipErr) {
          console.warn('Clipboard readText permission denied, falling back to prompt', clipErr);
        }
      }

      if (!pastedText || !pastedText.trim()) {
        const promptResult = window.prompt("กรุณากดค้างในช่องนี้แล้วเลือก 'วาง' (Paste) เพื่อใส่ API Key:");
        if (promptResult) {
          pastedText = promptResult;
        }
      }

      if (pastedText && pastedText.trim()) {
        const clean = pastedText.trim();
        setApiKeyInput(clean);
        setPasteSuccess(true);
        setValidationResult({ status: 'idle', message: '' });
        setTimeout(() => setPasteSuccess(false), 2500);
      }
    } catch (err) {
      console.error('Failed to paste from clipboard:', err);
      const promptResult = window.prompt("กรุณากดค้างในช่องนี้แล้วเลือก 'วาง' (Paste) เพื่อใส่ API Key:");
      if (promptResult && promptResult.trim()) {
        setApiKeyInput(promptResult.trim());
        setPasteSuccess(true);
        setValidationResult({ status: 'idle', message: '' });
        setTimeout(() => setPasteSuccess(false), 2500);
      }
    } finally {
      setIsPasting(false);
    }
  };

  const handleValidateAndSave = async () => {
    if (!auth.currentUser) {
      setValidationResult({
        status: 'error',
        message: 'กรุณาเข้าสู่ระบบด้วยบัญชี Google ก่อนตั้งค่าและใช้งาน BYOK ครับ'
      });
      return;
    }
    if (!apiKeyInput || apiKeyInput.trim().length < 15) {
      setValidationResult({
        status: 'error',
        message: 'กรุณากรอก Gemini API Key ที่ถูกต้อง (ความยาวอย่างน้อย 20 ตัวอักษร)'
      });
      return;
    }

    setIsValidating(true);
    setValidationResult({ status: 'idle', message: '' });

    const result = await validateApiKeyWithServer(apiKeyInput.trim());
    setIsValidating(false);

    if (result.valid) {
      try {
        await setStoredByokKey(apiKeyInput.trim());
        setActiveKey(apiKeyInput.trim());
        const emailText = auth.currentUser?.email ? ` และบันทึกผูกกับบัญชี Google (${auth.currentUser.email}) ให้เรียบร้อยแล้ว เข้าสู่ระบบบนอุปกรณ์อื่นก็ใช้งานได้ทันที` : '';
        setValidationResult({
          status: 'success',
          message: `🎉 ยืนยันสำเร็จ! Gemini API Key ใช้งานได้สมบูรณ์ ระบบเปิดโหมด BYOK${emailText}`
        });
        if (onKeyUpdated) onKeyUpdated();
      } catch (e: any) {
        setValidationResult({
          status: 'error',
          message: e?.message || 'ไม่สามารถบันทึกคีย์ได้ กรุณาเข้าสู่ระบบแล้วลองใหม่'
        });
      }
    } else {
      setValidationResult({
        status: 'error',
        message: result.message || 'API Key ไม่ถูกต้อง หรือไม่มีสิทธิ์เข้าถึงจาก Google AI Studio'
      });
    }
  };

  const handleRemoveKey = async () => {
    await removeStoredByokKey();
    setActiveKey(null);
    setApiKeyInput('');
    setValidationResult({
      status: 'idle',
      message: ''
    });
    if (onKeyUpdated) onKeyUpdated();
  };

  const maskKey = (key: string) => {
    if (key.length <= 8) return '••••••••';
    return key.slice(0, 6) + '••••••••••••' + key.slice(-4);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[92vh]"
        >
          {/* Header */}
          <div className="p-6 bg-gradient-to-r from-slate-900 via-indigo-950 to-purple-950 text-white flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
                <Key size={24} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-white">ตั้งค่า Gemini API Key (BYOK)</h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400 text-slate-950 uppercase tracking-wide">
                    Bring Your Own Key
                  </span>
                </div>
                <p className="text-xs text-indigo-200/80 mt-0.5">
                  คอล AI ไม่อั้น + สอบศัพท์ 10 • ตรวจข้อสอบ 3 • แปลเพลงใหม่ 10 • อธิบายคำเพลง 100 • Roleplay สร้างด่าน 30 / สรุปคะแนน 100 • ใส่ซับ AI 1 คลิป/วัน
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Scrollable Content */}
          <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-700 text-sm">
            {/* Current Status Box */}
            <div className={`p-4 rounded-2xl border transition-all ${
              !isSignedIn
                ? 'bg-rose-50/80 border-rose-200'
                : activeKey 
                ? 'bg-emerald-50/80 border-emerald-200' 
                : 'bg-amber-50/70 border-amber-200'
            }`}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2.5">
                  {!isSignedIn ? (
                    <Lock className="text-rose-600 shrink-0" size={20} />
                  ) : activeKey ? (
                    <ShieldCheck className="text-emerald-600 shrink-0" size={20} />
                  ) : (
                    <Info className="text-amber-600 shrink-0" size={20} />
                  )}
                  <div>
                    <div className="font-bold text-slate-800 text-sm flex items-center gap-2 flex-wrap">
                      สถานะโหมด BYOK: 
                      {!isSignedIn ? (
                        <span className="text-rose-700 bg-rose-100/90 px-2.5 py-0.5 rounded-full text-xs font-semibold">
                          ล็อกไว้ — ต้องเข้าสู่ระบบด้วย Google ก่อน
                        </span>
                      ) : activeKey ? (
                        <span className="text-emerald-700 bg-emerald-100/90 px-2.5 py-0.5 rounded-full text-xs font-semibold">
                          ใช้งานอยู่ (Active)
                        </span>
                      ) : (
                        <span className="text-amber-700 bg-amber-100/90 px-2.5 py-0.5 rounded-full text-xs font-semibold">
                          ยังไม่ได้เชื่อมต่อ (ใช้เซิร์ฟเวอร์ระบบ)
                        </span>
                      )}
                    </div>
                    {!isSignedIn ? (
                      <div className="text-xs text-rose-700 mt-1">
                        ทุกฟีเจอร์ที่ใช้งาน AI และโหมด BYOK จำเป็นต้องเข้าสู่ระบบด้วยบัญชี Google ก่อน เพื่อความปลอดภัยและนับสิทธิ์การใช้งานประจำวันได้อย่างถูกต้อง
                      </div>
                    ) : activeKey ? (
                      <div className="text-xs text-slate-500 font-mono mt-0.5">
                        คีย์ที่กำลังใช้งาน: {maskKey(activeKey)}
                      </div>
                    ) : null}
                  </div>
                </div>

                {!isSignedIn ? (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      openLoginModal();
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-colors cursor-pointer"
                  >
                    <LogIn size={14} />
                    เข้าสู่ระบบด้วย Google
                  </button>
                ) : activeKey ? (
                  <button
                    onClick={handleRemoveKey}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-red-600 hover:bg-red-100/60 border border-red-200 transition-colors"
                    title="ลบคีย์ส่วนตัวและกลับไปใช้เซิร์ฟเวอร์ปกติ"
                  >
                    <Trash2 size={14} />
                    ยกเลิกใช้คีย์นี้
                  </button>
                ) : null}
              </div>

              {/* Active Tier Benefits Banner */}
              {isSignedIn && activeKey && (
                <div className="mt-3 pt-3 border-t border-emerald-200/60 text-xs text-emerald-900 flex items-center gap-2">
                  <Sparkles size={16} className="text-emerald-600 shrink-0" />
                  <span>
                    สิทธิ์ปัจจุบันของคุณ ({subState?.tier || 'FREE'}): <strong>{currentRates.label}</strong>
                  </span>
                </div>
              )}
            </div>

            {/* Cloud Sync Status Banner */}
            {isSignedIn && auth.currentUser ? (
              <div className="p-3.5 bg-blue-50/80 border border-blue-200 rounded-2xl flex items-center justify-between text-xs text-blue-900 shadow-2xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                    <Cloud size={18} />
                  </div>
                  <div>
                    <div className="font-bold flex items-center gap-1.5">
                      <span>ซิงค์กับบัญชี Google อัตโนมัติ</span>
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    </div>
                    <div className="text-[11px] text-blue-700 font-mono mt-0.5">
                      {auth.currentUser.email}
                    </div>
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-1 text-[11px] text-blue-600 bg-white/70 px-2.5 py-1 rounded-lg border border-blue-100 font-medium">
                  <Smartphone size={13} />
                  <span>+</span>
                  <Laptop size={13} />
                  <span>ใช้ได้ทุกอุปกรณ์ ไม่ต้องกรอกซ้ำ</span>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-amber-50/90 border border-amber-200 rounded-2xl flex items-center justify-between gap-2.5 text-xs text-amber-900">
                <div className="flex items-center gap-2.5">
                  <Lock size={16} className="text-amber-600 shrink-0" />
                  <span>กรุณาเข้าสู่ระบบด้วยบัญชี Google เพื่อปลดล็อกการใส่ API Key และซิงค์สิทธิ์ฟรีรายวันของคุณ</span>
                </div>
              </div>
            )}

            {/* 3-Step Frictionless Guide */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-50/90 via-purple-50/60 to-emerald-50/70 border border-indigo-100 shadow-2xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                    ⚡
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">3 ขั้นตอนง่ายๆ ขอรับคีย์ฟรี (ใช้เวลา 1 นาที)</h3>
                    <p className="text-[11px] text-slate-500">ใช้ได้ทุกแพ็กเกจรวมถึง Free Plan — คอลเสียงและวิดีโอคอลกับ AI ฟรีไม่อั้น (0 เครดิต)</p>
                  </div>
                </div>
                <div className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-100/90 px-2.5 py-0.5 rounded-full w-fit">
                  <span>✅ ฟรี 100% ไม่ต้องผูกบัตร</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                {/* Step 1 */}
                <div className="p-3 bg-white/95 rounded-xl border border-indigo-100 flex flex-col justify-between space-y-2 shadow-2xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-indigo-700 font-bold text-xs">
                      <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-black">1</span>
                      <span>เปิด AI Studio</span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-snug">
                      ล็อกอินด้วยบัญชี Google ของคุณได้เลยทันที
                    </p>
                  </div>
                  <a
                    href="https://aistudio.google.com/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1 text-[11px] font-bold py-1.5 px-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-all text-center shadow-2xs hover:scale-[1.02]"
                  >
                    <span>เปิด Google AI Studio</span>
                    <ExternalLink size={11} />
                  </a>
                </div>

                {/* Step 2 */}
                <div className="p-3 bg-white/95 rounded-xl border border-purple-100 flex flex-col justify-between space-y-2 shadow-2xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-purple-700 font-bold text-xs">
                      <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-[10px] font-black">2</span>
                      <span>สร้าง & ก็อปปี้คีย์</span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-snug">
                      กดปุ่มสีฟ้า <span className="font-semibold text-purple-900">"Create API key"</span> แล้วกดไอคอนคัดลอก (Copy)
                    </p>
                  </div>
                  <div className="text-[10px] text-purple-700 font-semibold bg-purple-50/80 px-2 py-1 rounded-md text-center border border-purple-100">
                    กดสร้างในคลิกเดียว
                  </div>
                </div>

                {/* Step 3 */}
                <div className="p-3 bg-white/95 rounded-xl border border-emerald-100 flex flex-col justify-between space-y-2 shadow-2xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-emerald-700 font-bold text-xs">
                      <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-black">3</span>
                      <span>วางคีย์ & บันทึก</span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-snug">
                      กลับมากดปุ่ม <span className="font-semibold text-emerald-900">"วางคีย์"</span> ด้านล่างนี้ แล้วกดบันทึก
                    </p>
                  </div>
                  <div className="text-[10px] text-emerald-700 font-bold bg-emerald-50/80 px-2 py-1 rounded-md text-center border border-emerald-100">
                    🎁 ปลดล็อกโทรฟรีทันที!
                  </div>
                </div>
              </div>
            </div>

            {/* Video Tutorial Section */}
            <div className="p-4 rounded-2xl bg-gradient-to-b from-indigo-50/70 to-slate-50 border border-indigo-100/90 shadow-2xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-red-600 text-white flex items-center justify-center shadow-xs shrink-0">
                    <PlayCircle size={18} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                      <span>คลิปสอนวิธีรับ Gemini API Key ฟรี</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-red-100 text-red-700">
                        2 นาที
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      ดูคลิปนี้ในแอปได้ทันที ทำตามได้ง่ายๆ เพื่อรับคีย์ฟรีจาก Google AI Studio
                    </p>
                  </div>
                </div>

                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition-all w-fit shrink-0 hover:scale-102"
                >
                  <span>ไปรับคีย์ที่ Google AI Studio</span>
                  <ExternalLink size={12} />
                </a>
              </div>

              {/* Embedded YouTube Video Container (16:9 Responsive) */}
              <div className="relative w-full rounded-xl overflow-hidden border border-slate-300/80 shadow-md bg-black aspect-video">
                <iframe
                  className="absolute inset-0 w-full h-full"
                  src="https://www.youtube.com/embed/3c8PGB_m32w"
                  title="คลิปสอนวิธีรับ Gemini API Key ฟรีจาก Google AI Studio"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between text-[11px] text-slate-500 pt-0.5 gap-1">
                <span>💡 เมื่อได้คีย์แล้ว กดย้อนกลับมาวางในช่องด้านล่างนี้ได้เลยครับ</span>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    window.dispatchEvent(new CustomEvent('switch-tab', { detail: 'contact' }));
                  }}
                  className="text-indigo-600 hover:text-indigo-800 font-semibold underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>มีข้อสงสัย? ติดต่อแอดมิน 24 ชม.</span>
                </button>
              </div>
            </div>

            {/* Input Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                  <Key size={16} className="text-indigo-600" />
                  ใส่ Gemini API Key ของคุณ
                </label>
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1 hover:underline"
                >
                  <span>วิธีขอรับ API Key ฟรีที่ Google AI Studio</span>
                  <ExternalLink size={12} />
                </a>
              </div>

              {/* Main Input Box with Inline Quick Paste Button */}
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  disabled={!isSignedIn}
                  placeholder={isSignedIn ? "แตะปุ่มวางคีย์ หรือพิมพ์ AIzaSy..." : "เข้าสู่ระบบด้วย Google ก่อนจึงจะใส่ API Key ได้"}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck="false"
                  inputMode="text"
                  className={`w-full pl-4 pr-32 py-3.5 border rounded-2xl text-sm font-mono transition-all shadow-inner ${
                    !isSignedIn
                      ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                      : 'bg-slate-50 border-slate-300 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white'
                  }`}
                />

                <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                  {/* Inline Paste Button */}
                  <button
                    type="button"
                    onClick={handlePasteFromClipboard}
                    disabled={!isSignedIn || isPasting}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all shadow-2xs ${
                      !isSignedIn
                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                        : pasteSuccess
                        ? 'bg-emerald-600 text-white'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white active:scale-95'
                    }`}
                    title={isSignedIn ? "วางคีย์ที่ก็อปปี้ไว้ทันที" : "กรุณาเข้าสู่ระบบก่อน"}
                  >
                    {pasteSuccess ? (
                      <>
                        <Check size={13} />
                        <span>วางแล้ว</span>
                      </>
                    ) : (
                      <>
                        <Clipboard size={13} />
                        <span>วางคีย์</span>
                      </>
                    )}
                  </button>

                  {/* Show/Hide Toggle */}
                  <button
                    type="button"
                    disabled={!isSignedIn}
                    onClick={() => setShowPassword(!showPassword)}
                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg disabled:opacity-40"
                    title={showPassword ? 'ซ่อนคีย์' : 'แสดงคีย์'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* Prominent Wide Paste Button for Mobile/Touch & Fallback */}
              {isSignedIn && (
                <button
                  type="button"
                  onClick={handlePasteFromClipboard}
                  disabled={isPasting}
                  className={`w-full py-2.5 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                    pasteSuccess
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                      : 'bg-indigo-50/70 hover:bg-indigo-100/90 active:bg-indigo-200 border-indigo-200 text-indigo-700'
                  }`}
                >
                  {pasteSuccess ? (
                    <>
                      <CheckCircle2 size={16} className="text-emerald-600" />
                      <span className="font-bold">วาง API Key จากคลิปบอร์ดเรียบร้อยแล้ว!</span>
                    </>
                  ) : (
                    <>
                      <Clipboard size={16} className="text-indigo-600" />
                      <span>📋 แตะที่นี่เพื่อวางคีย์ที่ก็อปปี้ไว้ (Paste from Clipboard)</span>
                    </>
                  )}
                </button>
              )}

              {/* Validation Result Messages */}
              {validationResult.status === 'success' && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-start gap-2">
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                  <div>{validationResult.message}</div>
                </div>
              )}

              {validationResult.status === 'error' && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
                  <XCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold">{validationResult.message}</div>
                    <div className="text-[11px] text-rose-600 mt-1">
                      💡 แนะนำ: ตรวจสอบว่าคีย์มาจาก <strong>Google AI Studio</strong> (สร้างจาก aistudio.google.com/apikey) และไม่ได้ใส่เครื่องหมายวรรคตอนหรือเว้นวรรคส่วนเกิน
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-2">
                {!isSignedIn ? (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      openLoginModal();
                    }}
                    className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-2xl font-bold text-sm shadow-md transition-all bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white hover:scale-[1.01] cursor-pointer"
                  >
                    <LogIn size={18} />
                    <span>เข้าสู่ระบบด้วย Google เพื่อเริ่มตั้งค่า BYOK</span>
                  </button>
                ) : (
                  <button
                    onClick={handleValidateAndSave}
                    disabled={isValidating || !apiKeyInput.trim()}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-2xl font-bold text-sm shadow-md transition-all ${
                      isValidating || !apiKeyInput.trim()
                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                        : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white hover:scale-[1.01]'
                    }`}
                  >
                    {isValidating ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        <span>กำลังทดสอบคีย์กับ Google AI Studio...</span>
                      </>
                    ) : (
                      <>
                        <Check size={18} />
                        <span>ตรวจสอบและบันทึกคีย์ (Validate & Save)</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Long-term Value Note */}
            <div className="p-3.5 bg-gradient-to-r from-amber-500/10 via-amber-50/50 to-emerald-50/50 border border-amber-200/90 rounded-2xl flex items-start gap-2.5 text-xs text-amber-950 shadow-2xs">
              <span className="text-base shrink-0">💡</span>
              <div className="space-y-0.5">
                <div className="font-bold text-amber-900">ทำครั้งเดียวใช้ได้ตลอดไป คุ้มสุดทุกแพ็กเกจ:</div>
                <div className="text-slate-600 leading-relaxed">
                  API Key นี้จะผูกกับบัญชีของคุณตลอดไป ใช้คอลเสียง & วิดีโอคอล AI และสรุปความจำหลังคอลติวเตอร์ <strong>ฟรีไม่อั้น</strong> พร้อมโควตาฟรีประจำวันสำหรับ <strong>สอบศัพท์ ({BYOK_DAILY_LIMITS.vocab_exam} ครั้ง/วัน)</strong>, <strong>วิเคราะห์เสียงฝึกพูดตามประโยค ({BYOK_DAILY_LIMITS.shadowing_analyze} ครั้ง/วัน)</strong>, <strong>ตรวจข้อสอบ AI ({BYOK_DAILY_LIMITS.mock_test} ครั้ง/วัน · Reading/Listening ฟรีไม่จำกัด)</strong>, <strong>แปลเพลงใหม่คาราโอเกะ ({BYOK_DAILY_LIMITS.karaoke_translate} เพลง/วัน)</strong>, <strong>อธิบายคำศัพท์ในเพลงด้วย AI ({BYOK_DAILY_LIMITS.karaoke_explain} คำ/วัน)</strong>, <strong>วิเคราะห์บทความส่วนตัว ({BYOK_DAILY_LIMITS.reading_analyze} บทความ/วัน)</strong>, <strong>Roleplay สร้างด่านเอง ({BYOK_DAILY_LIMITS.roleplay_custom} ด่าน/วัน) & สรุปคะแนน AI ({BYOK_DAILY_LIMITS.roleplay_report} ครั้ง/วัน)</strong> และ <strong>ใส่ซับวิดีโอ AI ({BYOK_DAILY_LIMITS.video_subtitle} คลิป/วัน ≤5 นาที)</strong>
                </div>
              </div>
            </div>

            {/* Privileges Breakdown */}
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Zap size={16} className="text-amber-500" />
                  สิทธิประโยชน์สำหรับผู้เชื่อมต่อ BYOK (ทุกแพ็กเกจ)
                </h3>
                <span className="text-[11px] text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-lg">
                  รีเซ็ตโควตาทุกวัน {getResetTimeLabelThai()}
                </span>
              </div>

              <div className="p-4 rounded-2xl border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 via-teal-50/70 to-white space-y-3 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 pb-2.5 border-b border-emerald-200/70">
                  <div className="flex items-center gap-2">
                    <Sparkles size={16} className="text-emerald-600 shrink-0" />
                    <span className="font-bold text-emerald-950 text-xs sm:text-sm">
                      ครอบคลุมทุกแพ็กเกจในระบบ (ปลอดภัยต่อ Free Tier ของ Google)
                    </span>
                  </div>
                  <span className="text-[11px] text-emerald-800 font-semibold">
                    Free • Testing • Starter • Basic • Plus
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="p-3 rounded-xl bg-white/95 border border-emerald-200/80 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-indigo-700 font-bold text-xs">
                        <PhoneCall size={14} className="shrink-0" />
                        <span>คอลเสียง & วิดีโอคอล AI</span>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">ไม่จำกัด</span>
                    </div>
                    <div className="text-sm font-black text-emerald-700">ฟรีไม่อั้น (0 เครดิต)</div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-2">
                      <span className="inline-flex items-center gap-1"><Video size={11} /> วิดีโอคอล</span>
                      <span className="inline-flex items-center gap-1"><ImageIcon size={11} /> ส่งรูป/เอกสารฟรี</span>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-white/95 border border-emerald-200/80 space-y-1">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 text-blue-700 font-bold text-xs">
                        <FileSignature size={14} className="shrink-0" />
                        <span>ตรวจสอบคำศัพท์ (Vocab)</span>
                      </div>
                      <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">
                        {isSignedIn
                          ? `เหลือ ${Math.max(0, BYOK_DAILY_LIMITS.vocab_exam - dailyUsage.vocab_exam)}/${BYOK_DAILY_LIMITS.vocab_exam} วันนี้`
                          : 'ต้องเข้าสู่ระบบ'}
                      </span>
                    </div>
                    <div className="text-sm font-black text-emerald-700">ฟรี {BYOK_DAILY_LIMITS.vocab_exam} ครั้ง / วัน</div>
                    <div className="text-[11px] text-slate-500">ครบสิทธิ์ใช้ต่อด้วย 1 เครดิต/ครั้ง</div>
                  </div>

                  <div className="p-3 rounded-xl bg-white/95 border border-emerald-200/80 space-y-1">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 text-purple-700 font-bold text-xs">
                        <Clock size={14} className="shrink-0" />
                        <span>ตรวจข้อสอบจำลองสอบ</span>
                      </div>
                      <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md">
                        {isSignedIn
                          ? `เหลือ ${Math.max(0, BYOK_DAILY_LIMITS.mock_test - dailyUsage.mock_test)}/${BYOK_DAILY_LIMITS.mock_test} วันนี้`
                          : 'ต้องเข้าสู่ระบบ'}
                      </span>
                    </div>
                    <div className="text-sm font-black text-emerald-700">ฟรี {BYOK_DAILY_LIMITS.mock_test} ครั้ง / วัน</div>
                    <div className="text-[11px] text-slate-500">ครอบคลุม HSK & IELTS (ครบสิทธิ์ใช้ 3 เครดิต)</div>
                  </div>

                  <div className="p-3 rounded-xl bg-white/95 border border-emerald-200/80 space-y-1">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 text-rose-700 font-bold text-xs">
                        <Music size={14} className="shrink-0" />
                        <span>คาราโอเกะ แปลเพลงใหม่</span>
                      </div>
                      <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md">
                        {isSignedIn
                          ? `เหลือ ${Math.max(0, BYOK_DAILY_LIMITS.karaoke_translate - dailyUsage.karaoke_translate)}/${BYOK_DAILY_LIMITS.karaoke_translate} วันนี้`
                          : 'ต้องเข้าสู่ระบบ'}
                      </span>
                    </div>
                    <div className="text-sm font-black text-emerald-700">ฟรี {BYOK_DAILY_LIMITS.karaoke_translate} เพลงใหม่ / วัน</div>
                    <div className="text-[11px] text-slate-500">คลัง 100 เพลง & เพลงชุมชนฟรีไม่อั้นทุกคน</div>
                  </div>

                  <div className="p-3 rounded-xl bg-white/95 border border-emerald-200/80 space-y-1">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 text-amber-700 font-bold text-xs">
                        <BookOpen size={14} className="shrink-0" />
                        <span>วิเคราะห์บทความส่วนตัว (AI)</span>
                      </div>
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md">
                        {isSignedIn
                          ? `เหลือ ${Math.max(0, BYOK_DAILY_LIMITS.reading_analyze - (dailyUsage.reading_analyze || 0))}/${BYOK_DAILY_LIMITS.reading_analyze} วันนี้`
                          : 'ต้องเข้าสู่ระบบ'}
                      </span>
                    </div>
                    <div className="text-sm font-black text-emerald-700">ฟรี {BYOK_DAILY_LIMITS.reading_analyze} บทความ / วัน</div>
                    <div className="text-[11px] text-slate-500">วางบทความเองให้ AI แปล & สร้างคำถาม (คลังเรื่องสั้นฟรีไม่อั้น)</div>
                  </div>

                  <div className="p-3 rounded-xl bg-white/95 border border-emerald-200/80 space-y-1">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 text-teal-700 font-bold text-xs">
                        <Captions size={14} className="shrink-0" />
                        <span>ใส่ซับวิดีโอด้วย AI</span>
                      </div>
                      <span className="text-[10px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md">
                        {isSignedIn
                          ? `เหลือ ${Math.max(0, BYOK_DAILY_LIMITS.video_subtitle - (dailyUsage.video_subtitle || 0))}/${BYOK_DAILY_LIMITS.video_subtitle} วันนี้`
                          : 'ต้องเข้าสู่ระบบ'}
                      </span>
                    </div>
                    <div className="text-sm font-black text-emerald-700">ฟรี {BYOK_DAILY_LIMITS.video_subtitle} คลิป / วัน (≤5 นาที)</div>
                    <div className="text-[11px] text-slate-500">
                      เกิน 5 นาที หรือครบสิทธิ์ ใช้ 5 เครดิต หรือโหมดฟรีบนเครื่อง (0 เครดิต)
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-white/95 border border-emerald-200/80 space-y-1">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 text-pink-700 font-bold text-xs">
                        <Sparkles size={14} className="shrink-0" />
                        <span>อธิบายคำศัพท์ในเพลง (AI)</span>
                      </div>
                      <span className="text-[10px] font-bold text-pink-700 bg-pink-50 px-2 py-0.5 rounded-md">
                        {isSignedIn
                          ? `เหลือ ${Math.max(0, BYOK_DAILY_LIMITS.karaoke_explain - (dailyUsage.karaoke_explain || 0))}/${BYOK_DAILY_LIMITS.karaoke_explain} วันนี้`
                          : 'ต้องเข้าสู่ระบบ'}
                      </span>
                    </div>
                    <div className="text-sm font-black text-emerald-700">ฟรี {BYOK_DAILY_LIMITS.karaoke_explain} คำ / วัน</div>
                    <div className="text-[11px] text-slate-500">แตะคำนอกพจนานุกรมในคาราโอเกะ (คำในพจนานุกรมแอปฟรีไม่อั้น)</div>
                  </div>

                  <div className="p-3 rounded-xl bg-white/95 border border-emerald-200/80 space-y-1">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 text-violet-700 font-bold text-xs">
                        <Zap size={14} className="shrink-0" />
                        <span>Roleplay สร้างด่าน & สรุปคะแนน AI</span>
                      </div>
                      <span className="text-[10px] font-bold text-violet-700 bg-violet-50 px-2 py-0.5 rounded-md">
                        {isSignedIn
                          ? `ด่าน ${Math.max(0, BYOK_DAILY_LIMITS.roleplay_custom - (dailyUsage.roleplay_custom || 0))}/${BYOK_DAILY_LIMITS.roleplay_custom} • สรุป ${Math.max(0, BYOK_DAILY_LIMITS.roleplay_report - (dailyUsage.roleplay_report || 0))}/${BYOK_DAILY_LIMITS.roleplay_report}`
                          : 'ต้องเข้าสู่ระบบ'}
                      </span>
                    </div>
                    <div className="text-sm font-black text-emerald-700">
                      สร้างด่าน {BYOK_DAILY_LIMITS.roleplay_custom} • สรุปคะแนน {BYOK_DAILY_LIMITS.roleplay_report} / วัน
                    </div>
                    <div className="text-[11px] text-slate-500">คอล Roleplay & สรุปความจำหลังคอลติวเตอร์ฟรีไม่อั้น</div>
                  </div>

                  <div className="p-3 rounded-xl bg-white/95 border border-emerald-200/80 space-y-1 sm:col-span-2">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 text-cyan-700 font-bold text-xs">
                        <Sparkles size={14} className="shrink-0" />
                        <span>วิเคราะห์เสียงฝึกพูดตามประโยคในคลังศัพท์ (Shadowing AI)</span>
                      </div>
                      <span className="text-[10px] font-bold text-cyan-700 bg-cyan-50 px-2 py-0.5 rounded-md">
                        {isSignedIn
                          ? `เหลือ ${Math.max(0, BYOK_DAILY_LIMITS.shadowing_analyze - (dailyUsage.shadowing_analyze || 0))}/${BYOK_DAILY_LIMITS.shadowing_analyze} วันนี้`
                          : 'ต้องเข้าสู่ระบบ'}
                      </span>
                    </div>
                    <div className="text-sm font-black text-emerald-700">ฟรี {BYOK_DAILY_LIMITS.shadowing_analyze} ครั้ง / วัน</div>
                    <div className="text-[11px] text-slate-500">AI ฟังเสียงพูดจริง ตรวจคำต่อคำและแนะนำการออกเสียง/วรรณยุกต์ (อัดฟังเทียบต้นฉบับฟรีไม่อั้นทุกคน)</div>
                  </div>
                </div>

                <div className="text-[11px] text-emerald-800 leading-relaxed space-y-1">
                  <p>
                    *เมื่อใช้โควตาฟรี BYOK ระบบจะเลือกใช้โมเดลตระกูล Flash ที่รองรับ Google Free Tier อัตโนมัติ และหากใช้ครบสิทธิ์รายวันหรือคีย์ติดขีดจำกัด (429) สามารถกดใช้เครดิตในแอปทำต่อได้ทันที
                  </p>
                  <p className="text-slate-600">
                    *หมายเหตุ: ฟีเจอร์นอกเหนือจากโควตาฟรีรายวัน หรือคลิปใส่ซับที่ยาวเกิน 5 นาที จะใช้เซิร์ฟเวอร์แบบเสียเงินของระบบและเครดิตในแอปตามปกติ
                  </p>
                </div>
              </div>
            </div>

            {/* Privacy & Safety Note */}
            <div className="p-3.5 bg-slate-100/80 rounded-2xl text-[11px] text-slate-500 leading-relaxed flex items-start gap-2">
              <ShieldCheck size={16} className="text-slate-400 shrink-0 mt-0.5" />
              <div>
                <strong>ความปลอดภัยและความเป็นส่วนตัว:</strong> API Key ของคุณจะถูกจัดเก็บในเครื่องของคุณ (Browser LocalStorage) และซิงค์เฉพาะในบัญชี Google ของคุณ โดยจะถูกส่งไปยังเซิร์ฟเวอร์เฉพาะเมื่อคุณเรียกใช้งานฟีเจอร์ที่เปิดสิทธิ์ BYOK เท่านั้น ไม่มีการเผยแพร่ให้บุคคลภายนอกใดๆ ทั้งสิ้น
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default ByokModal;
