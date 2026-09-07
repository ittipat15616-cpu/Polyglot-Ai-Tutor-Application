import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, CheckCircle, Zap, Shield, Crown, Sparkles, CreditCard, Upload, CheckCircle2,
  AlertCircle, Clock, Copy, Coins, HelpCircle, ArrowRight, Key
} from 'lucide-react';
import generatePayload from 'promptpay-qr';
import QRCode from 'qrcode';
import {
  SubscriptionTier, TIER_CONFIGS, TOPUP_OPTIONS, PROMPTPAY_CONFIG, UserSubscriptionState, isAdminEmail, isSuperAdminEmail
} from '../types/subscription';
import {
  loadUserSubscription, upgradeTier, addTopupCredits, getTotalCredits
} from '../services/subscriptionService';
import CountdownTimer from './CountdownTimer';
import { verifyPaymentSlip } from '../services/slipVerification';
import { soundFx } from '../utils/soundEffects';
import { auth } from '../firebase';

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubscriptionUpdated?: (state: UserSubscriptionState) => void;
  initialTab?: 'tiers' | 'topup';
}

export default function SubscriptionModal({ isOpen, onClose, onSubscriptionUpdated, initialTab }: SubscriptionModalProps) {
  const [subState, setSubState] = useState<UserSubscriptionState | null>(null);
  const [activeTab, setActiveTab] = useState<'tiers' | 'topup'>('tiers');

  // Selected Payment Item
  const [paymentItem, setPaymentItem] = useState<{
    type: 'tier' | 'topup';
    tierId?: SubscriptionTier;
    topupAmount?: number;
    topupCredits?: number;
    price: number;
    title: string;
  } | null>(null);

  // QR Code canvas reference
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Upload Slip State
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ success: boolean; message: string } | null>(null);
  const [copiedAccount, setCopiedAccount] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (initialTab) {
        setActiveTab(initialTab);
      }
      refreshState();
    }
  }, [isOpen, initialTab]);

  const refreshState = async () => {
    const s = await loadUserSubscription();
    setSubState(s);
    if (onSubscriptionUpdated) onSubscriptionUpdated(s);
  };

  // Generate QR Code when payment item changes
  useEffect(() => {
    if (paymentItem && qrCanvasRef.current) {
      try {
        const payload = generatePayload(PROMPTPAY_CONFIG.phoneNumber, { amount: paymentItem.price });
        QRCode.toCanvas(qrCanvasRef.current, payload, {
          width: 240,
          margin: 2,
          color: {
            dark: '#0f172a',
            light: '#ffffff'
          }
        });
      } catch (e) {
        console.error('Error generating QR payload:', e);
      }
    }
  }, [paymentItem]);

  if (!isOpen) return null;

  const currentTierConfig = subState ? TIER_CONFIGS[subState.tier] : TIER_CONFIGS.FREE;
  const totalCredits = subState ? getTotalCredits(subState) : 0;
  const user = auth.currentUser;
  const isPartner = user && user.email?.toLowerCase() === "weeranan172550@gmail.com";
  const getDiscountedPrice = (price: number) => {
    if (isPartner) {
      if (price === 69) return 59;
      if (price === 129) return 115;
      if (price === 199) return 179;
      if (price === 269) return 239;
      if (price === 339) return 299;
      if (price === 399) return 359;
    }
    return price;
  };

  const isSuperAdmin = user && isSuperAdminEmail(user.email);

  const handleSelectTier = async (tierKey: SubscriptionTier) => {
    const cfg = TIER_CONFIGS[tierKey];
    
    if (isSuperAdmin) {
      soundFx.playVictory();
      const newState = await upgradeTier(tierKey);
      setSubState(newState);
      if (onSubscriptionUpdated) onSubscriptionUpdated(newState);
      return;
    }
    
    if (cfg.price === 0) return; // Free tier
    setVerifyResult(null);
    setPaymentItem({
      type: 'tier',
      tierId: tierKey,
      price: getDiscountedPrice(cfg.price),
      title: `สมัครแพ็กเกจ ${cfg.name} (30 วัน)`
    });
  };

  const handleSelectTopup = (opt: typeof TOPUP_OPTIONS[0]) => {
    setVerifyResult(null);
    setPaymentItem({
      type: 'topup',
      topupAmount: opt.amount,
      topupCredits: opt.amount + opt.bonus,
      price: opt.amount,
      title: `เติมเครดิต AI ${opt.amount + opt.bonus} เครดิต`
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !paymentItem) return;

    const file = files[0];
    setIsVerifying(true);
    setVerifyResult(null);

    try {
      const res = await verifyPaymentSlip(file, paymentItem.price);
      setVerifyResult(res);

      if (res.success) {
        soundFx.playVictory();
        let newState: UserSubscriptionState;
        if (paymentItem.type === 'tier' && paymentItem.tierId) {
          newState = await upgradeTier(paymentItem.tierId);
        } else if (paymentItem.type === 'topup' && paymentItem.topupCredits) {
          newState = await addTopupCredits(paymentItem.topupCredits);
        } else {
          newState = await loadUserSubscription();
        }
        setSubState(newState);
        if (onSubscriptionUpdated) onSubscriptionUpdated(newState);
      } else {
        soundFx.playWrong('MATCH');
      }
    } catch (err: any) {
      setVerifyResult({ success: false, message: 'เกิดข้อผิดพลาดในการอ่านสลิป กรุณาลองใหม่อีกครั้ง' });
      soundFx.playWrong('MATCH');
    } finally {
      setIsVerifying(false);
    }
  };

  const copyPromptPayNumber = () => {
    navigator.clipboard.writeText(PROMPTPAY_CONFIG.phoneNumber);
    setCopiedAccount(true);
    setTimeout(() => setCopiedAccount(false), 2000);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden my-6 border border-slate-100 flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-800 text-white p-6 relative">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-all"
            >
              <X size={20} />
            </button>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pr-8">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Crown className="text-amber-300" size={24} />
                  <h2 className="text-2xl font-bold">แพ็กเกจสมาชิก & กระเป๋าเครดิต AI</h2>
                </div>
                <p className="text-indigo-100 text-sm">
                  ปลดล็อคทุกการเรียนรู้ คอลสนทนากับ AI และส่งตรวจข้อสอบย้อนหลัง
                </p>
              </div>

              {/* Wallet Summary */}
              {subState && (
                <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md border border-white/20 px-4 py-2.5 rounded-2xl">
                  <div className="text-right">
                    <div className="text-xs text-indigo-200">เครดิตคงเหลือรวม</div>
                    <div className="text-xl font-extrabold text-amber-300 flex items-center justify-end gap-1">
                      <Zap size={18} /> {totalCredits} เครดิต
                    </div>
                  </div>
                  <div className="h-8 w-px bg-white/20" />
                  <div className="text-left text-xs">
                    <div className="text-indigo-200">
                      ⚡ แพ็กเกจ (10 วัน): <span className="font-bold text-white">{subState.dailyCredits}/{subState.maxDailyCredits}</span>
                    </div>
                    {subState.maxDailyCredits > 0 && subState.nextCreditResetAt && (
                      <div className="text-[10px] text-indigo-300">
                        รีเฟรชใน: <CountdownTimer expiresAt={subState.nextCreditResetAt} onExpire={() => loadUserSubscription().then(setSubState)} />
                      </div>
                    )}
                    <div className="text-indigo-200">
                      💰 เติมเอง: <span className="font-bold text-emerald-300">{subState.purchasedCredits}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Navigation Tabs */}
            <div className="flex gap-2 mt-6 bg-black/20 p-1.5 rounded-2xl w-fit">
              <button
                onClick={() => { setActiveTab('tiers'); setPaymentItem(null); }}
                className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 ${
                  activeTab === 'tiers' ? 'bg-white text-indigo-900 shadow-md' : 'text-white/80 hover:text-white'
                }`}
              >
                <Crown size={16} /> เลือกแพ็กเกจรายเดือน (30 วัน)
              </button>
              <button
                onClick={() => { setActiveTab('topup'); setPaymentItem(null); }}
                className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 ${
                  activeTab === 'topup' ? 'bg-white text-indigo-900 shadow-md' : 'text-white/80 hover:text-white'
                }`}
              >
                <Coins size={16} /> เติมเครดิต AI แยก (1฿ = 1 เครดิต)
              </button>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50">
            {paymentItem ? (
              /* Payment PromptPay QR Screen */
              <div className="max-w-xl mx-auto bg-white p-6 rounded-3xl border border-slate-200 shadow-lg flex flex-col items-center">
                <div className="flex items-center justify-between w-full mb-4">
                  <button
                    onClick={() => setPaymentItem(null)}
                    className="text-sm font-semibold text-slate-500 hover:text-indigo-600 flex items-center gap-1"
                  >
                    ← เลือกแพ็กเกจอื่น
                  </button>
                  <span className="text-xs font-bold px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full">
                    สแกน QR PromptPay
                  </span>
                </div>

                <h3 className="text-lg font-bold text-slate-800 text-center mb-1">{paymentItem.title}</h3>
                <div className="text-3xl font-black text-indigo-600 mb-4">
                  ฿{paymentItem.price}.00 <span className="text-sm font-normal text-slate-500">บาท</span>
                </div>

                {/* PromptPay QR Canvas Container */}
                <div className="p-4 bg-gradient-to-b from-blue-900 to-indigo-950 rounded-2xl flex flex-col items-center shadow-md mb-4 border border-blue-800">
                  <div className="bg-white p-3 rounded-xl shadow-inner mb-2">
                    <canvas ref={qrCanvasRef} width={240} height={240} className="w-56 h-56" />
                  </div>
                  <div className="text-white text-center text-xs font-medium">
                    <div>{PROMPTPAY_CONFIG.accountName}</div>
                    <div className="flex items-center justify-center gap-1 mt-1 text-amber-300 font-mono text-sm font-bold">
                      พร้อมเพย์: {PROMPTPAY_CONFIG.phoneNumber}
                      <button onClick={copyPromptPayNumber} className="hover:text-white p-1" title="คัดลอกเบอร์">
                        <Copy size={14} />
                      </button>
                    </div>
                    {copiedAccount && <span className="text-[10px] text-emerald-400">คัดลอกเบอร์แล้ว!</span>}
                  </div>
                </div>

                {/* Slip Upload & Verification Section */}
                <div className="w-full bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col items-center">
                  <div className="text-sm font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                    <Upload size={16} className="text-indigo-600" /> แนบรูปสลิปเพื่อยืนยันระบบอัตโนมัติ (ฟรี 0฿)
                  </div>
                  <p className="text-xs text-slate-500 text-center mb-3">
                    ระบบจะสแกนรหัสธุรกรรมบนสลิป เช็กสลิปซ้ำ และปลดล็อคให้คุณทันทีโดยไม่มีค่าบริการเพิ่ม
                  </p>

                  <label className="w-full cursor-pointer flex flex-col items-center justify-center p-4 border-2 border-dashed border-indigo-300 hover:border-indigo-500 rounded-xl bg-indigo-50/50 hover:bg-indigo-50 transition-all">
                    <input type="file" accept="image/*" onChange={handleFileUpload} disabled={isVerifying} className="hidden" />
                    {isVerifying ? (
                      <div className="flex items-center gap-2 text-indigo-700 font-semibold text-sm">
                        <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                        กำลังสแกนและตรวจสอบสลิป...
                      </div>
                    ) : (
                      <div className="text-center">
                        <span className="text-indigo-600 font-bold text-sm block">📸 อัปโหลดรูปสลิปโอนเงินที่นี่</span>
                        <span className="text-slate-400 text-xs">รองรับไฟล์ JPG, PNG จากแอปธนาคารทุกแห่ง</span>
                      </div>
                    )}
                  </label>

                  {/* Verification Results Alert */}
                  {verifyResult && (
                    <div className={`mt-4 w-full p-3.5 rounded-xl text-sm font-semibold flex items-start gap-2.5 ${
                      verifyResult.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
                    }`}>
                      {verifyResult.success ? <CheckCircle2 className="text-emerald-600 shrink-0 mt-0.5" size={18} /> : <AlertCircle className="text-rose-600 shrink-0 mt-0.5" size={18} />}
                      <div>
                        <div>{verifyResult.message}</div>
                        {verifyResult.success && (
                          <div className="mt-2 text-xs font-normal">
                            ระบบอัปเดตสิทธิ์การใช้งานลงในบัญชี Google ของคุณเรียบร้อยแล้ว!
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : activeTab === 'tiers' ? (
              /* Tiers List */
              <div>
                {subState?.tier === 'TESTING' && subState.expiresAt && (
                  <div className="mb-4 p-4 rounded-2xl bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start sm:items-center gap-2.5">
                      <span className="px-2.5 py-1 rounded-lg bg-teal-600 text-white font-bold text-xs shrink-0">
                        ทดลองฟรี 14 วัน
                      </span>
                      <div className="text-xs text-teal-950 font-medium">
                        คุณกำลังใช้งานสิทธิ์ทดลองเข้าใช้งานทุกหน้าฟรี (เหลือเวลา{' '}
                        <span className="font-bold text-teal-800 font-mono">
                          <CountdownTimer expiresAt={subState.expiresAt} onExpire={() => loadUserSubscription().then(setSubState)} />
                        </span>
                        )
                      </div>
                    </div>
                    <span className="text-[11px] text-teal-700 font-medium bg-white/70 px-2.5 py-1 rounded-lg border border-teal-100 self-start sm:self-auto">
                      💡 สิทธิ์ทดลองไม่มีเครดิต AI ให้ หากต้องการคอล AI สามารถซื้อแพ็กเกจหรือเติมเครดิตแยกได้
                    </span>
                  </div>
                )}

                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-base font-bold text-slate-800">เลือกแพ็กเกจที่เหมาะกับคุณ (อายุ 30 วัน)</h3>
                  <span className="text-xs text-slate-500">⚡ เครดิตแพ็กเกจจะรีเฟรชกลับมาเต็มทุกๆ 10 วัน</span>
                </div>

                {/* BYOK Promotion Banner */}
                <div className="mb-5 p-3.5 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-purple-950 text-white flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm border border-indigo-800/40">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-400/20 border border-amber-400/40 flex items-center justify-center text-amber-300 shrink-0">
                      <Key size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-white">มี Gemini API Key ส่วนตัว? (โหมด BYOK)</span>
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-400 text-slate-950">คุ้มค่ายิ่งขึ้น</span>
                      </div>
                      <p className="text-[11px] text-indigo-200/80 mt-0.5">
                        คอลนานขึ้นสูงสุด 10 เท่า! และสำหรับแพ็ก Premium, Pro, Ultra รับสิทธิ์คอล AI และวิดีโอคอลไม่อั้น 0 เครดิต (Pro/Ultra อัปโหลดรูปฟรี)
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      onClose();
                      window.dispatchEvent(new CustomEvent('open-byok-modal'));
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs shadow-xs transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5"
                  >
                    <Key size={13} />
                    ตั้งค่า API Key
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {(Object.keys(TIER_CONFIGS) as SubscriptionTier[]).filter(k => k !== 'TESTING').map((tierKey) => {
                    const cfg = TIER_CONFIGS[tierKey];
                    const isCurrent = subState?.tier === tierKey;

                    return (
                      <motion.div
                        key={tierKey}
                        whileHover={{ y: -3 }}
                        className={`bg-white rounded-2xl p-5 border shadow-sm flex flex-col justify-between relative overflow-hidden transition-all ${
                          isCurrent ? 'ring-2 ring-indigo-600 border-indigo-500' : 'border-slate-200 hover:border-indigo-300'
                        }`}
                      >
                        {isCurrent && (
                          <div className="absolute top-0 right-0 bg-indigo-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl shadow flex items-center gap-1">
                            แพ็กเกจปัจจุบัน
                            {subState?.expiresAt && tierKey !== 'FREE' && (
                              <span className="font-mono text-indigo-200">
                                ({isAdminEmail(user?.email) ? (
                                  'ตลอดชีพ'
                                ) : (
                                  <CountdownTimer expiresAt={subState.expiresAt} onExpire={() => loadUserSubscription().then(setSubState)} />
                                )})
                              </span>
                            )}
                          </div>
                        )}

                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${cfg.badgeColor}`}>
                              {cfg.name}
                            </span>
                          </div>

                          <div className="flex items-baseline gap-1 my-3">
                            <span className="text-3xl font-black text-slate-900">
                              {cfg.price === 0 ? 'ฟรี' : isPartner && cfg.price > 0 ? (<span><span className="line-through text-slate-400 text-xl mr-2">฿{cfg.price}</span>฿{getDiscountedPrice(cfg.price)}</span>) : `฿${cfg.price}`}
                            </span>
                            {cfg.price > 0 && <span className="text-xs text-slate-500 font-medium">/ 30 วัน</span>}
                          </div>

                          <p className="text-xs text-slate-600 mb-4 line-clamp-2">{cfg.description}</p>

                          <div className="space-y-2 border-t border-slate-100 pt-3 mb-5">
                            {cfg.features.map((feat, idx) => (
                              <div key={idx} className="flex items-start gap-2 text-xs text-slate-700">
                                <CheckCircle className="text-emerald-500 shrink-0 mt-0.5" size={14} />
                                <span>{feat}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            if (!user) {
                              alert("กรุณาเข้าสู่ระบบด้วยบัญชี Google เพื่อเลือกซื้อแพ็กเกจ");
                              return;
                            }
                            handleSelectTier(tierKey);
                          }}
                          disabled={isCurrent || (!isSuperAdmin && cfg.price === 0) || (!user && cfg.price !== 0)}
                          className={`w-full py-2.5 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-1.5 ${
                            isCurrent
                              ? 'bg-slate-100 text-slate-400 cursor-default'
                              : (!isSuperAdmin && cfg.price === 0)
                              ? 'bg-slate-100 text-slate-500 cursor-default'
                              : (!user && cfg.price !== 0)
                              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                              : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md hover:shadow-lg'
                          }`}
                        >
                          {isCurrent ? 'กำลังใช้อยู่' : (cfg.price === 0 && !isSuperAdmin) ? 'ใช้งานฟรี' : !user ? 'กรุณาเข้าสู่ระบบ' : isSuperAdmin ? 'Dev: สลับแพ็กเกจทันที' : `สแกนชำระ ฿${getDiscountedPrice(cfg.price)}`}
                        </button>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Topup Credits Store */
              <div className="max-w-3xl mx-auto">
                <div className="text-center mb-6">
                  <h3 className="text-xl font-bold text-slate-800">เติมเครดิต AI สกัดเอง (ไม่มีวันหมดอายุ)</h3>
                  <p className="text-sm text-slate-500 mt-1">
                    คอลเสียง (ปิดกล้อง) 1 เครดิต / 30 วิ | วิดีโอคอล (เปิดกล้อง) 3 เครดิต / 30 วิ | ส่งรูปภาพ หรือ ตรวจข้อสอบ 3 เครดิต / ครั้ง
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {TOPUP_OPTIONS.map((opt, idx) => (
                    <motion.div
                      key={idx}
                      whileHover={user ? { scale: 1.02 } : {}}
                      onClick={() => {
                        if (!user) {
                          alert("กรุณาเข้าสู่ระบบด้วยบัญชี Google เพื่อเติมเครดิต");
                          return;
                        }
                        handleSelectTopup(opt);
                      }}
                      className={`bg-white p-5 rounded-2xl border transition-all flex items-center justify-between ${
                        !user ? 'border-slate-200 opacity-60 cursor-not-allowed' : 'border-slate-200 hover:border-indigo-500 shadow-sm hover:shadow-md cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-3 bg-amber-100 text-amber-700 rounded-2xl font-bold">
                          <Coins size={24} />
                        </div>
                        <div>
                          <div className="text-base font-extrabold text-slate-900">
                            {opt.amount + opt.bonus} เครดิต
                          </div>
                          {opt.bonus > 0 && (
                            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                              แถมฟรี +{opt.bonus} เครดิต!
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-xl font-black text-indigo-600">฿{opt.amount}</div>
                        <span className="text-[11px] text-slate-400">สแกน QR จ่าย</span>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Explanation Card */}
                <div className="mt-8 bg-indigo-50/70 p-5 rounded-2xl border border-indigo-100 text-xs text-indigo-900 space-y-2">
                  <div className="font-bold text-sm text-indigo-950 flex items-center gap-1.5">
                    <HelpCircle size={16} /> ลำดับการหักเครดิตในระบบ:
                  </div>
                  <div>
                    1. ระบบจะหักจาก <span className="font-bold text-indigo-700">เครดิตแพ็กเกจ (รีเฟรชทุก 10 วัน)</span> ก่อนเสมอ (ถ้ามี)
                  </div>
                  <div>
                    2. เมื่อเครดิตแพ็กเกจหมด ระบบจึงจะมาหักจาก <span className="font-bold text-emerald-700">เครดิตเติมเอง</span>
                  </div>
                  <div>
                    3. เครดิตเติมเองไม่มีวันหมดอายุ สามารถเก็บบันทึกสะสมในบัญชี Google ได้ตลอดเวลา
                  </div>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
