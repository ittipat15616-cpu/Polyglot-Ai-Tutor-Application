import React, { useState, useRef, useEffect } from 'react';
import {
  Mic,
  Square,
  ArrowLeftRight,
  Volume2,
  VolumeX,
  FlipVertical2,
  Trash2,
  Star,
  Loader2,
  Key,
} from 'lucide-react';
import {
  TRANSLATOR_LANGUAGES,
  TRANSLATOR_LANG_MAP,
  TranslatorLang,
  VoiceTurnItem,
} from '../../types/translator';
import {
  toggleSavedPhrase,
  transcribeVoiceAi,
  translateBasic,
  TranslatorAiError,
} from '../../services/translatorService';
import { playTranslatorTTS, stopThaiTTS } from '../../utils/audio';
import { openLoginModal } from '../../services/authHeaders';
import { getByokQuotaStatus, syncByokDailyUsageWithFirestore } from '../../services/byokService';
import { getTotalCredits, loadUserSubscription } from '../../services/subscriptionService';
import { auth } from '../../firebase';
import ByokQuotaFallbackModal, { QuotaFallbackReason } from '../ByokQuotaFallbackModal';

interface VoiceInterpreterPanelProps {
  defaultForeignLang: TranslatorLang;
  onOpenByok: () => void;
  onNotify: (msg: string) => void;
  onSavedListChanged: () => void;
}

export const VoiceInterpreterPanel: React.FC<VoiceInterpreterPanelProps> = ({
  defaultForeignLang,
  onOpenByok,
  onNotify,
  onSavedListChanged,
}) => {
  const [langA, setLangA] = useState<TranslatorLang>('TH');
  const [langB, setLangB] = useState<TranslatorLang>(
    defaultForeignLang === 'TH' ? 'EN' : defaultForeignLang
  );
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [flipTopSide, setFlipTopSide] = useState(false);

  const [listeningSide, setListeningSide] = useState<'A' | 'B' | null>(null);
  const [processingSide, setProcessingSide] = useState<'A' | 'B' | null>(null);
  const [interimText, setInterimText] = useState('');
  const [turns, setTurns] = useState<VoiceTurnItem[]>([]);
  const [fallbackNotice, setFallbackNotice] = useState<{
    message: string;
    needsByok?: boolean;
    needsAuth?: boolean;
  } | null>(null);
  const [creditModalReason, setCreditModalReason] = useState<QuotaFallbackReason | null>(null);
  const [pendingAudioJob, setPendingAudioJob] = useState<{
    speaker: 'A' | 'B';
    audioBase64: string;
    mimeType: string;
    lang: TranslatorLang;
  } | null>(null);

  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const stopAllCapture = () => {
    try {
      recognitionRef.current?.stop();
    } catch {}
    recognitionRef.current = null;

    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    } catch {}
    mediaRecorderRef.current = null;

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    setListeningSide(null);
    setInterimText('');
  };

  useEffect(() => {
    return () => {
      stopAllCapture();
      stopThaiTTS();
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [turns.length]);

  const translateSpokenTurn = async (speaker: 'A' | 'B', spokenText: string) => {
    const clean = spokenText.trim();
    if (!clean) {
      setProcessingSide(null);
      return;
    }
    const sourceLang = speaker === 'A' ? langA : langB;
    const targetLang = speaker === 'A' ? langB : langA;

    setProcessingSide(speaker);
    setFallbackNotice(null);

    try {
      const res = await translateBasic({
        text: clean,
        sourceLang,
        targetLang,
      });
      const turn: VoiceTurnItem = {
        id: `turn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        speaker,
        sourceLang,
        targetLang,
        originalText: clean,
        translatedText: res.translatedText,
        reading: res.reading,
        createdAt: Date.now(),
      };
      setTurns((prev) => [...prev, turn]);

      if (autoSpeak && res.translatedText) {
        playTranslatorTTS(res.translatedText, targetLang);
      }
    } catch (err: any) {
      onNotify(err?.message || 'ไม่สามารถแปลคำพูดได้ในขณะนี้');
    } finally {
      setProcessingSide(null);
    }
  };

  // Fallback recorder -> BYOK Flash Lite transcription when browser lacks Web Speech API (e.g. Safari/iOS)
  const startAudioFallbackRecording = async (speaker: 'A' | 'B') => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const preferredMime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : '';

      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);

      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        const chunks = audioChunksRef.current;
        const mimeType = recorder.mimeType || 'audio/webm';
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((t) => t.stop());
          mediaStreamRef.current = null;
        }
        if (chunks.length === 0) return;

        setProcessingSide(speaker);
        try {
          const blob = new Blob(chunks, { type: mimeType });
          const base64: string = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const dataUrl = String(reader.result || '');
              resolve(dataUrl.split(',')[1] || '');
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });

          const spokenLang = speaker === 'A' ? langA : langB;
          const runTranscribeWithMode = async (paidWithCredits: boolean) => {
            const { transcript } = await transcribeVoiceAi({
              audioBase64: base64,
              mimeType,
              lang: spokenLang,
              paidWithCredits,
            });
            if (!transcript) {
              onNotify('ไม่ได้ยินเสียงพูดชัดเจน กรุณากดปุ่มไมค์แล้วลองพูดใหม่อีกครั้ง');
              setProcessingSide(null);
              return;
            }
            if (paidWithCredits) {
              onNotify('ถอดเสียงพูดด้วย AI สำเร็จ (-1 เครดิต)');
            }
            await translateSpokenTurn(speaker, transcript);
          };

          if (!auth.currentUser?.uid) {
            setFallbackNotice({
              message: 'เบราว์เซอร์นี้ต้องใช้ระบบถอดเสียง AI สำรอง กรุณาเข้าสู่ระบบด้วย Google ก่อนครับ',
              needsAuth: true,
            });
            setProcessingSide(null);
            return;
          }

          await syncByokDailyUsageWithFirestore().catch(() => {});
          const quota = getByokQuotaStatus('translate_ai');
          if (quota.hasKey && quota.canUseFree) {
            try {
              await runTranscribeWithMode(false);
            } catch (err: any) {
              if (err instanceof TranslatorAiError && (err.byokQuotaExhausted || err.byokInvalidKey || err.byokRequired)) {
                setPendingAudioJob({ speaker, audioBase64: base64, mimeType, lang: spokenLang });
                setCreditModalReason('byok_google_429');
                setProcessingSide(null);
                return;
              }
              throw err;
            }
          } else if (quota.hasKey && !quota.canUseFree) {
            setPendingAudioJob({ speaker, audioBase64: base64, mimeType, lang: spokenLang });
            setCreditModalReason('byok_daily_exhausted');
            setProcessingSide(null);
          } else {
            const sub = await loadUserSubscription();
            setPendingAudioJob({ speaker, audioBase64: base64, mimeType, lang: spokenLang });
            setCreditModalReason(getTotalCredits(sub) >= 1 ? 'no_byok_credit_confirm' : 'insufficient_credits');
            setProcessingSide(null);
          }
        } catch (err: any) {
          if (err instanceof TranslatorAiError) {
            setFallbackNotice({
              message: err.message,
              needsByok: Boolean(err.byokRequired || err.byokInvalidKey),
              needsAuth: Boolean(err.authRequired),
            });
          } else {
            onNotify(err?.message || 'ไม่สามารถถอดเสียงพูดได้');
          }
          setProcessingSide(null);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setListeningSide(speaker);
      setInterimText('กำลังบันทึกเสียง... แตะปุ่มอีกครั้งเมื่อพูดจบ');
    } catch {
      onNotify('ไม่สามารถเข้าถึงไมโครโฟนได้ กรุณาอนุญาตการใช้ไมโครโฟนในเบราว์เซอร์');
    }
  };

  const handleToggleMic = (speaker: 'A' | 'B') => {
    setFallbackNotice(null);

    // If tapping the currently active speaker, stop & finalize
    if (listeningSide === speaker) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        setListeningSide(null);
        setInterimText('');
        mediaRecorderRef.current.stop();
        return;
      }
      stopAllCapture();
      return;
    }

    // Ensure exclusive mic access
    stopAllCapture();
    stopThaiTTS();

    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      startAudioFallbackRecording(speaker);
      return;
    }

    try {
      const rec = new SpeechRecognitionCtor();
      const spokenLang = speaker === 'A' ? langA : langB;
      rec.lang = TRANSLATOR_LANG_MAP[spokenLang].bcp47;
      rec.interimResults = true;
      rec.continuous = false;

      let finalTranscript = '';

      rec.onstart = () => {
        setListeningSide(speaker);
        setInterimText('');
      };

      rec.onresult = (event: any) => {
        let live = '';
        for (let i = 0; i < event.results.length; i++) {
          const text = event.results[i][0]?.transcript || '';
          live += text;
          if (event.results[i].isFinal) {
            finalTranscript = live;
          }
        }
        setInterimText(live);
      };

      rec.onerror = (event: any) => {
        setListeningSide(null);
        setInterimText('');
        if (event?.error === 'not-allowed') {
          onNotify('กรุณาอนุญาตการใช้ไมโครโฟนในเบราว์เซอร์ก่อนครับ');
        } else if (event?.error !== 'no-speech' && event?.error !== 'aborted') {
          onNotify('ไม่สามารถรับเสียงได้ในขณะนี้ กรุณาลองกดพูดอีกครั้ง');
        }
      };

      rec.onend = () => {
        setListeningSide(null);
        const captured = (finalTranscript || '').trim();
        setInterimText('');
        if (captured) {
          translateSpokenTurn(speaker, captured);
        }
      };

      recognitionRef.current = rec;
      rec.start();
    } catch {
      startAudioFallbackRecording(speaker);
    }
  };

  const handleSwapSides = () => {
    stopAllCapture();
    setLangA(langB);
    setLangB(langA);
  };

  const handleSaveTurn = (turn: VoiceTurnItem) => {
    const res = toggleSavedPhrase({
      sourceLang: turn.sourceLang,
      targetLang: turn.targetLang,
      sourceText: turn.originalText,
      translatedText: turn.translatedText,
      reading: turn.reading,
      noteTh: 'จากโหมดล่าม 2 ฝั่ง',
    });
    onSavedListChanged();
    onNotify(res.saved ? 'บันทึกประโยคลงคลังโปรดแล้ว' : 'นำออกจากคลังโปรดแล้ว');
  };

  const latestTurn = turns.length > 0 ? turns[turns.length - 1] : null;

  return (
    <div className="space-y-4">
      {/* Top Toolbar */}
      <div className="bg-white border border-indigo-100 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <select
            aria-label="ภาษาฝั่งฉัน"
            value={langA}
            onChange={(e) => {
              const next = e.target.value as TranslatorLang;
              setLangA(next);
              if (next === langB) setLangB(next === 'TH' ? 'EN' : 'TH');
            }}
            className="flex-1 bg-indigo-50/70 border border-indigo-200 rounded-xl px-3 py-2 text-xs sm:text-sm font-bold text-indigo-900 focus:outline-none cursor-pointer"
          >
            {TRANSLATOR_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.flag} ฝั่งฉัน: {l.labelTh}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleSwapSides}
            className="p-2.5 rounded-xl bg-slate-100 hover:bg-indigo-100 text-slate-700 hover:text-indigo-700 transition-colors shrink-0 cursor-pointer"
            title="สลับภาษา 2 ฝั่ง"
          >
            <ArrowLeftRight size={15} />
          </button>

          <select
            aria-label="ภาษาฝั่งคู่สนทนา"
            value={langB}
            onChange={(e) => {
              const next = e.target.value as TranslatorLang;
              setLangB(next);
              if (next === langA) setLangA(next === 'TH' ? 'EN' : 'TH');
            }}
            className="flex-1 bg-emerald-50/70 border border-emerald-200 rounded-xl px-3 py-2 text-xs sm:text-sm font-bold text-emerald-900 focus:outline-none cursor-pointer"
          >
            {TRANSLATOR_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.flag} คู่สนทนา: {l.labelTh}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAutoSpeak((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
              autoSpeak
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-white text-slate-500 border-slate-200'
            }`}
            title="อ่านคำแปลออกเสียงอัตโนมัติ"
          >
            {autoSpeak ? <Volume2 size={14} /> : <VolumeX size={14} />}
            <span>{autoSpeak ? 'พูดเสียงแปลอัตโนมัติ' : 'ปิดเสียงอัตโนมัติ'}</span>
          </button>

          <button
            type="button"
            onClick={() => setFlipTopSide((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
              flipTopSide
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-200'
            }`}
            title="กลับหัวฝั่งคู่สนทนา 180 องศาสำหรับวางมือถือคุยกันบนโต๊ะ"
          >
            <FlipVertical2 size={14} />
            <span className="hidden sm:inline">กลับจอคุยตรงหน้า</span>
          </button>

          {turns.length > 0 && (
            <button
              type="button"
              onClick={() => {
                stopThaiTTS();
                setTurns([]);
              }}
              className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
              title="ล้างบทสนทนา"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Fallback Notice */}
      {fallbackNotice && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-2.5">
          <p className="text-xs text-amber-950 font-medium">{fallbackNotice.message}</p>
          <div className="flex items-center gap-2">
            {fallbackNotice.needsAuth && (
              <button
                type="button"
                onClick={() => openLoginModal()}
                className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold cursor-pointer"
              >
                เข้าสู่ระบบ
              </button>
            )}
            {fallbackNotice.needsByok && (
              <button
                type="button"
                onClick={onOpenByok}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold cursor-pointer"
              >
                <Key size={13} />
                <span>ตั้งค่า BYOK ฟรี</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Face-to-Face Top Display (visible when Flip mode is ON) */}
      {flipTopSide && (
        <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-5 rotate-180 text-center space-y-2 min-h-[120px] flex flex-col items-center justify-center">
          <div className="text-xs font-bold text-emerald-700">
            {TRANSLATOR_LANG_MAP[langB].flag} {TRANSLATOR_LANG_MAP[langB].nativeName}
          </div>
          {latestTurn && latestTurn.speaker === 'A' ? (
            <>
              <p className="text-xl font-bold text-slate-900 leading-snug">
                {latestTurn.translatedText}
              </p>
              {latestTurn.reading && (
                <p className="text-xs text-emerald-700">{latestTurn.reading}</p>
              )}
            </>
          ) : (
            <p className="text-sm text-emerald-800/60">
              {listeningSide === 'B'
                ? interimText || 'Listening...'
                : 'Tap the green mic button to speak'}
            </p>
          )}
        </div>
      )}

      {/* Live Conversation Stream */}
      <div className="bg-white border border-indigo-100 rounded-2xl p-4 min-h-[260px] max-h-[420px] overflow-y-auto space-y-3">
        {turns.length === 0 && !listeningSide && !processingSide ? (
          <div className="py-14 text-center space-y-2">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 mx-auto">
              <Mic size={22} />
            </div>
            <h3 className="text-sm font-bold text-slate-800">
              ล่ามเสียงพูด 2 ฝั่งแบบทันที (ฟรี 0 เครดิต)
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
              แตะปุ่มไมโครโฟนด้านล่างตามฝั่งที่กำลังพูด ระบบจะแปลและออกเสียงภาษาของอีกฝั่งให้ทันที รองรับคุยต่อหน้าด้วยปุ่ม "กลับจอคุยตรงหน้า"
            </p>
          </div>
        ) : (
          <>
            {turns.map((turn) => {
              const isSideA = turn.speaker === 'A';
              return (
                <div
                  key={turn.id}
                  className={`flex flex-col ${isSideA ? 'items-start' : 'items-end'}`}
                >
                  <div
                    className={`max-w-[88%] sm:max-w-[78%] rounded-2xl p-3.5 border space-y-1.5 ${
                      isSideA
                        ? 'bg-indigo-50/60 border-indigo-200/80 rounded-tl-sm'
                        : 'bg-emerald-50/70 border-emerald-200/80 rounded-tr-sm'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 text-[11px] font-semibold text-slate-500">
                      <span>
                        {isSideA ? 'ฝั่งฉัน' : 'คู่สนทนา'} ({TRANSLATOR_LANG_MAP[turn.sourceLang].flag}{' '}
                        {turn.sourceLang} → {TRANSLATOR_LANG_MAP[turn.targetLang].flag} {turn.targetLang})
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => playTranslatorTTS(turn.translatedText, turn.targetLang)}
                          className="p-1 rounded-lg hover:bg-white text-slate-500 hover:text-indigo-700 cursor-pointer"
                          title="ฟังเสียงแปลซ้ำ"
                        >
                          <Volume2 size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveTurn(turn)}
                          className="p-1 rounded-lg hover:bg-white text-slate-500 hover:text-amber-500 cursor-pointer"
                          title="บันทึกประโยคนี้"
                        >
                          <Star size={13} />
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-slate-600">{turn.originalText}</p>
                    <p className="text-base font-bold text-slate-900 leading-snug">
                      {turn.translatedText}
                    </p>
                    {turn.reading && (
                      <p className="text-xs font-medium text-indigo-700">{turn.reading}</p>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Live Listening / Translating Status Bubble */}
            {(listeningSide || processingSide) && (
              <div
                className={`flex ${
                  (listeningSide || processingSide) === 'A' ? 'justify-start' : 'justify-end'
                }`}
              >
                <div className="px-4 py-3 rounded-2xl bg-slate-100 border border-slate-200 text-xs text-slate-700 flex items-center gap-2.5">
                  {processingSide ? (
                    <>
                      <Loader2 size={14} className="animate-spin text-indigo-600" />
                      <span>กำลังแปลและเตรียมเสียงอ่าน...</span>
                    </>
                  ) : (
                    <>
                      <span className="flex items-center gap-0.5 h-4">
                        <span className="wave-bar" />
                        <span className="wave-bar" />
                        <span className="wave-bar" />
                      </span>
                      <span className="font-medium">
                        {interimText ||
                          `กำลังฟังภาษา${
                            TRANSLATOR_LANG_MAP[listeningSide === 'A' ? langA : langB].labelTh
                          }...`}
                      </span>
                    </>
                  )}
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </>
        )}
      </div>

      {/* Dual Tactile Mic Buttons */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          disabled={processingSide !== null}
          onClick={() => handleToggleMic('A')}
          className={`py-4 px-4 rounded-2xl border font-bold text-sm flex flex-col items-center justify-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer ${
            listeningSide === 'A'
              ? 'bg-rose-600 text-white border-rose-600 shadow-md pulse-ring'
              : 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600 shadow-sm'
          } disabled:opacity-50`}
        >
          <div className="flex items-center gap-2">
            {listeningSide === 'A' ? <Square size={18} /> : <Mic size={19} />}
            <span>
              {listeningSide === 'A'
                ? 'แตะเพื่อหยุดพูด'
                : `${TRANSLATOR_LANG_MAP[langA].flag} พูดฝั่งฉัน (${TRANSLATOR_LANG_MAP[langA].labelTh})`}
            </span>
          </div>
          <span className="text-[11px] font-medium text-indigo-100">
            แปลเป็น {TRANSLATOR_LANG_MAP[langB].labelTh}
          </span>
        </button>

        <button
          type="button"
          disabled={processingSide !== null}
          onClick={() => handleToggleMic('B')}
          className={`py-4 px-4 rounded-2xl border font-bold text-sm flex flex-col items-center justify-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer ${
            listeningSide === 'B'
              ? 'bg-rose-600 text-white border-rose-600 shadow-md pulse-ring'
              : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 shadow-sm'
          } disabled:opacity-50`}
        >
          <div className="flex items-center gap-2">
            {listeningSide === 'B' ? <Square size={18} /> : <Mic size={19} />}
            <span>
              {listeningSide === 'B'
                ? 'แตะเพื่อหยุดพูด'
                : `${TRANSLATOR_LANG_MAP[langB].flag} คู่สนทนา (${TRANSLATOR_LANG_MAP[langB].labelTh})`}
            </span>
          </div>
          <span className="text-[11px] font-medium text-emerald-100">
            แปลเป็น {TRANSLATOR_LANG_MAP[langA].labelTh}
          </span>
        </button>
      </div>
      <ByokQuotaFallbackModal
        isOpen={Boolean(creditModalReason)}
        onClose={() => {
          setCreditModalReason(null);
          setPendingAudioJob(null);
        }}
        feature="translate_ai"
        reason={creditModalReason || 'no_byok_credit_confirm'}
        creditCost={1}
        isBusy={processingSide !== null}
        onUseCredits={async () => {
          const job = pendingAudioJob;
          setCreditModalReason(null);
          setPendingAudioJob(null);
          if (!job) return;
          setProcessingSide(job.speaker);
          try {
            const { transcript } = await transcribeVoiceAi({
              audioBase64: job.audioBase64,
              mimeType: job.mimeType,
              lang: job.lang,
              paidWithCredits: true,
            });
            if (!transcript) {
              onNotify('ไม่ได้ยินเสียงพูดชัดเจน กรุณากดปุ่มไมค์แล้วลองพูดใหม่อีกครั้ง');
              setProcessingSide(null);
              return;
            }
            onNotify('ถอดเสียงพูดด้วย AI สำเร็จ (-1 เครดิต)');
            await translateSpokenTurn(job.speaker, transcript);
          } catch (err: any) {
            onNotify(err?.message || 'ไม่สามารถถอดเสียงพูดได้');
            setProcessingSide(null);
          }
        }}
      />
    </div>
  );
};

export default VoiceInterpreterPanel;
