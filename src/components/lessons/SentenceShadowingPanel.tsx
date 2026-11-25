import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Headphones,
  Loader2,
  Mic,
  Play,
  RotateCcw,
  Sparkles,
  Square,
  Volume2,
  X,
} from 'lucide-react';
import {
  ShadowingDiffResult,
  ShadowingLang,
  evaluateShadowing,
} from '../../utils/shadowingMatcher';
import { recordShadowingAttempt } from '../../services/shadowingService';
import {
  BYOK_DAILY_LIMITS,
  consumeByokFreeQuota,
  getByokQuotaStatus,
  getResetTimeLabelThai,
  getStoredByokKey,
} from '../../services/byokService';
import { getFirebaseAuthHeaders, openLoginModal } from '../../services/authHeaders';
import { syncByokDailyUsageWithFirestore } from '../../services/byokService';
import { deductCredit, getTotalCredits, loadUserSubscription } from '../../services/subscriptionService';
import { auth } from '../../firebase';
import ByokQuotaFallbackModal, { QuotaFallbackReason } from '../ByokQuotaFallbackModal';

interface SentenceShadowingPanelProps {
  sentence: string;
  translationTh?: string;
  lang: ShadowingLang;
  onClose: () => void;
  onPracticeSaved?: (accuracyPct: number) => void;
}

interface AiShadowingFeedback {
  pronunciationScore: number;
  feedbackTh: string;
  tipsTh: string[];
}

// In-memory cache of synthesized base64 audio so replaying at 0.75x or 1.0x is instant
const modelAudioCache = new Map<string, string>();

type SpeechRecognitionCtor = new () => {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((ev: any) => void) | null;
  onerror: ((ev: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  return (
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition ||
    null
  );
}

function isLikelyIosOrSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(ua);
  return isIOS || isSafari;
}

function pickSupportedAudioMime(): string {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return '';
  }
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ];
  for (const mime of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    } catch {
      // ignore unsupported check errors
    }
  }
  return '';
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์เสียงที่อัดไว้ได้'));
    reader.readAsDataURL(blob);
  });
}

export default function SentenceShadowingPanel({
  sentence,
  translationTh,
  lang,
  onClose,
  onPracticeSaved,
}: SentenceShadowingPanelProps) {
  const [speed, setSpeed] = useState<0.75 | 1.0>(1.0);
  const [isPlayingModel, setIsPlayingModel] = useState(false);
  const [isLoadingModel, setIsLoadingModel] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const [isAnalyzingAi, setIsAnalyzingAi] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [audioLevels, setAudioLevels] = useState<number[]>([15, 22, 18, 26, 20, 16, 24]);

  const [liveTranscript, setLiveTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [diffResult, setDiffResult] = useState<ShadowingDiffResult | null>(null);
  const [aiFeedback, setAiFeedback] = useState<AiShadowingFeedback | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [isPlayingUser, setIsPlayingUser] = useState(false);

  const [byokQuota, setByokQuota] = useState(() => getByokQuotaStatus('shadowing_analyze'));
  const [analysisMode, setAnalysisMode] = useState<'free' | 'ai'>(() => {
    const q = getByokQuotaStatus('shadowing_analyze');
    return q.hasKey && q.canUseFree ? 'ai' : 'free';
  });
  const [needsLoginPrompt, setNeedsLoginPrompt] = useState(false);
  const [fallbackModalReason, setFallbackModalReason] = useState<QuotaFallbackReason | null>(null);
  const [lastUsedPaidCredits, setLastUsedPaidCredits] = useState(false);

  const speechSupported = Boolean(getSpeechRecognitionCtor());
  const mediaRecorderSupported =
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== 'undefined';

  // Refs for strict per-session isolation & resource cleanup
  const sessionIdRef = useRef(0);
  const isStartingRef = useRef(false);
  const usingAiModeRef = useRef(false);
  const modelAudioRef = useRef<HTMLAudioElement | null>(null);
  const userAudioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<InstanceType<SpeechRecognitionCtor> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const evalTimeoutRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordedBlobRef = useRef<{ blob: Blob; mimeType: string } | null>(null);
  const latestTranscriptRef = useRef('');
  const hasEvaluatedRef = useRef(false);
  const recordedUrlRef = useRef<string | null>(null);

  // Keep BYOK quota badge live
  useEffect(() => {
    const refreshQuota = () => {
      setByokQuota(getByokQuotaStatus('shadowing_analyze'));
    };
    refreshQuota();
    window.addEventListener('byok_key_updated', refreshQuota);
    window.addEventListener('byok_quota_updated', refreshQuota);
    return () => {
      window.removeEventListener('byok_key_updated', refreshQuota);
      window.removeEventListener('byok_quota_updated', refreshQuota);
    };
  }, []);

  const stopAllAudioPlayback = () => {
    if (modelAudioRef.current) {
      try {
        modelAudioRef.current.pause();
        modelAudioRef.current.currentTime = 0;
      } catch {
        // ignore
      }
      modelAudioRef.current = null;
    }
    if (userAudioRef.current) {
      try {
        userAudioRef.current.pause();
        userAudioRef.current.currentTime = 0;
      } catch {
        // ignore
      }
      userAudioRef.current = null;
    }
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }
    if ((window as any).currentEdgeAudio) {
      try {
        (window as any).currentEdgeAudio.pause();
        (window as any).currentEdgeAudio.currentTime = 0;
      } catch {
        // ignore
      }
    }
    setIsPlayingModel(false);
    setIsLoadingModel(false);
    setIsPlayingUser(false);
  };

  const cleanupMicResources = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (audioCtxRef.current) {
      try {
        if (audioCtxRef.current.state !== 'closed') {
          audioCtxRef.current.close().catch(() => {});
        }
      } catch {
        // ignore
      }
      audioCtxRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          // ignore
        }
      });
      mediaStreamRef.current = null;
    }
  };

  /**
   * Immediately detaches all handlers from any prior recording session and stops
   * lingering timers, SpeechRecognition, MediaRecorder, and mic tracks so stale
   * callbacks from a previous attempt can NEVER interfere with a new attempt.
   */
  const abortPreviousSession = () => {
    if (evalTimeoutRef.current !== null) {
      window.clearTimeout(evalTimeoutRef.current);
      evalTimeoutRef.current = null;
    }
    if (recognitionRef.current) {
      const oldRec = recognitionRef.current;
      recognitionRef.current = null;
      oldRec.onresult = null;
      oldRec.onerror = null;
      oldRec.onend = null;
      try {
        oldRec.abort();
      } catch {
        // ignore
      }
    }
    if (mediaRecorderRef.current) {
      const oldMr = mediaRecorderRef.current;
      mediaRecorderRef.current = null;
      oldMr.ondataavailable = null;
      oldMr.onstop = null;
      oldMr.onerror = null;
      if (oldMr.state !== 'inactive') {
        try {
          oldMr.stop();
        } catch {
          // ignore
        }
      }
    }
    cleanupMicResources();
  };

  const revokeRecordedUrl = () => {
    if (recordedUrlRef.current) {
      try {
        URL.revokeObjectURL(recordedUrlRef.current);
      } catch {
        // ignore
      }
      recordedUrlRef.current = null;
    }
    setRecordedAudioUrl(null);
  };

  // Reset cleanly if sentence or language changes while panel stays mounted
  useEffect(() => {
    sessionIdRef.current += 1;
    isStartingRef.current = false;
    stopAllAudioPlayback();
    abortPreviousSession();
    revokeRecordedUrl();
    recordedBlobRef.current = null;
    setIsRecording(false);
    setIsAnalyzingAi(false);
    setLiveTranscript('');
    setFinalTranscript('');
    setDiffResult(null);
    setAiFeedback(null);
    setInfoMsg(null);
    setErrorMsg(null);
    setNeedsLoginPrompt(false);
    setFallbackModalReason(null);
    setLastUsedPaidCredits(false);
    setElapsedSec(0);
    latestTranscriptRef.current = '';
    hasEvaluatedRef.current = false;
  }, [sentence, lang]);

  // Full cleanup on unmount
  useEffect(() => {
    return () => {
      sessionIdRef.current += 1;
      stopAllAudioPlayback();
      abortPreviousSession();
      revokeRecordedUrl();
    };
  }, []);

  const playModelAudio = async (rateOverride?: 0.75 | 1.0) => {
    const rateToUse = rateOverride ?? speed;
    if (isPlayingModel && rateOverride === undefined) {
      stopAllAudioPlayback();
      return;
    }

    stopAllAudioPlayback();
    setErrorMsg(null);
    setIsLoadingModel(true);

    const cacheKey = `${lang}:${sentence}`;
    let base64Audio = modelAudioCache.get(cacheKey);

    if (!base64Audio) {
      try {
        const reqBody: Record<string, string> = {
          text: sentence,
          lang: lang === 'CN' ? 'CN' : 'EN',
        };
        if (lang === 'EN') {
          reqBody.voice = 'en-US-ChristopherNeural';
        }
        const res = await fetch('/api/synthesize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reqBody),
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.audio) {
            base64Audio = data.audio as string;
            modelAudioCache.set(cacheKey, base64Audio);
          }
        }
      } catch {
        // Fallback to browser SpeechSynthesis below
      }
    }

    setIsLoadingModel(false);

    if (base64Audio) {
      const audio = new Audio(`data:audio/mp3;base64,${base64Audio}`);
      audio.playbackRate = rateToUse;
      modelAudioRef.current = audio;
      (window as any).currentEdgeAudio = audio;
      setIsPlayingModel(true);
      audio.onended = () => {
        setIsPlayingModel(false);
        modelAudioRef.current = null;
      };
      audio.onerror = () => {
        setIsPlayingModel(false);
        modelAudioRef.current = null;
      };
      audio.play().catch(() => {
        setIsPlayingModel(false);
      });
      return;
    }

    // Fallback: Web Speech Synthesis
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(sentence);
      utterance.lang = lang === 'CN' ? 'zh-CN' : 'en-US';
      utterance.rate = rateToUse === 0.75 ? 0.75 : 0.95;
      setIsPlayingModel(true);
      utterance.onend = () => setIsPlayingModel(false);
      utterance.onerror = () => setIsPlayingModel(false);
      window.speechSynthesis.speak(utterance);
    }
  };

  const playUserRecording = () => {
    if (!recordedAudioUrl) return;
    if (isPlayingUser) {
      stopAllAudioPlayback();
      return;
    }
    stopAllAudioPlayback();
    const audio = new Audio(recordedAudioUrl);
    userAudioRef.current = audio;
    setIsPlayingUser(true);
    audio.onended = () => {
      setIsPlayingUser(false);
      userAudioRef.current = null;
    };
    audio.onerror = () => {
      setIsPlayingUser(false);
      userAudioRef.current = null;
    };
    audio.play().catch(() => setIsPlayingUser(false));
  };

  const finalizeFreeEvaluation = (
    sid: number,
    transcriptText: string,
    hasValidAudioBlob: boolean
  ) => {
    if (sessionIdRef.current !== sid || hasEvaluatedRef.current) return;
    hasEvaluatedRef.current = true;

    const clean = transcriptText.trim();
    setFinalTranscript(clean);

    if (clean) {
      const result = evaluateShadowing(sentence, clean, lang);
      setDiffResult(result);
      recordShadowingAttempt({
        lang,
        sentence,
        accuracyPct: result.accuracyPct,
      })
        .then(() => onPracticeSaved?.(result.accuracyPct))
        .catch(() => {});
      return;
    }

    if (hasValidAudioBlob) {
      // Never show a false "didn't hear you" error when MediaRecorder captured clear audio!
      recordShadowingAttempt({
        lang,
        sentence,
      })
        .then(() => onPracticeSaved?.(80))
        .catch(() => {});

      const latestQuota = getByokQuotaStatus('shadowing_analyze');
      if (latestQuota.hasKey && latestQuota.remaining <= 0) {
        setInfoMsg(
          `อัดเสียงสำเร็จ! กด "ฟังเสียงของฉัน" เทียบกับต้นฉบับได้ฟรีไม่อั้น (สิทธิ์ AI วิเคราะห์เสียงครบ ${BYOK_DAILY_LIMITS.shadowing_analyze}/${BYOK_DAILY_LIMITS.shadowing_analyze} วันนี้แล้ว รีเซ็ต ${getResetTimeLabelThai()})`
        );
      } else {
        setInfoMsg(
          `อัดเสียงสำเร็จ! กด "ฟังเสียงของฉัน" เทียบต้นฉบับได้เลย (หากเชื่อมคีย์ฟรี BYOK จะให้ AI ฟังและตรวจการออกเสียงให้อัตโนมัติฟรี ${BYOK_DAILY_LIMITS.shadowing_analyze} ครั้ง/วัน)`
        );
      }
      return;
    }

    setErrorMsg('ยังไม่ได้รับสัญญาณเสียงจากไมโครโฟน ลองตรวจสอบไมค์แล้วกดเริ่มใหม่อีกครั้ง');
  };

  const executeShadowingAiAnalysis = async (
    sid: number,
    blob: Blob,
    mimeType: string,
    paidWithCredits: boolean
  ) => {
    if (sessionIdRef.current !== sid) return;

    if (blob.size < 800) {
      setErrorMsg('คลิปเสียงสั้นเกินไป ลองกดไมค์พูดให้จบประโยคแล้วค่อยกดหยุดนะ');
      return;
    }

    if (!auth.currentUser?.uid) {
      setNeedsLoginPrompt(true);
      setErrorMsg('กรุณาเข้าสู่ระบบด้วยบัญชี Google ก่อนใช้ AI วิเคราะห์เสียงพูดครับ (คุณยังกด "ฟังเสียงของฉัน" เทียบต้นฉบับได้ฟรี)');
      return;
    }

    if (paidWithCredits) {
      const sub = await loadUserSubscription();
      if (getTotalCredits(sub) < 1) {
        setFallbackModalReason('insufficient_credits');
        return;
      }
    }

    const byokKey = paidWithCredits ? null : getStoredByokKey();
    setIsAnalyzingAi(true);
    setErrorMsg(null);
    setInfoMsg(null);
    setNeedsLoginPrompt(false);

    try {
      const audioBase64 = await blobToBase64(blob);
      if (sessionIdRef.current !== sid) return;

      const headers = await getFirebaseAuthHeaders();
      const res = await fetch('/api/shadowing/analyze', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          audioBase64,
          mimeType,
          sentence,
          lang,
          byokKey: byokKey || undefined,
          paidWithCredits,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (sessionIdRef.current !== sid) return;

      if (!res.ok) {
        if (res.status === 401 && !data?.byokInvalidKey) {
          setNeedsLoginPrompt(true);
          setErrorMsg(data?.error || 'กรุณาเข้าสู่ระบบด้วยบัญชี Google ก่อนใช้ AI วิเคราะห์เสียงพูดครับ');
          return;
        }
        if (!paidWithCredits && (res.status === 429 || data?.byokQuotaExhausted || data?.byokInvalidKey)) {
          setFallbackModalReason('byok_google_429');
          return;
        }
        if (!paidWithCredits && data?.byokRequired) {
          const sub = await loadUserSubscription();
          setFallbackModalReason(getTotalCredits(sub) >= 1 ? 'no_byok_credit_confirm' : 'insufficient_credits');
          return;
        }
        setErrorMsg(
          data?.error ||
            'ไม่สามารถวิเคราะห์เสียงด้วย AI ได้ชั่วคราว แต่คุณยังกด "ฟังเสียงของฉัน" เทียบต้นฉบับได้ปกติ'
        );
        return;
      }

      const transcript = typeof data?.transcript === 'string' ? data.transcript.trim() : '';
      const heardSpeech = Boolean(data?.heardSpeech && transcript.length > 0);

      if (!heardSpeech) {
        setErrorMsg(
          'AI ยังไม่ได้ยินเสียงพูดชัดเจนในคลิปนี้ (ยังไม่หักสิทธิ์/เครดิต) ลองกด "ฟังเสียงของฉัน" เช็กไมค์ หรือพูดใกล้ไมโครโฟนมากขึ้นแล้วลองใหม่นะ'
        );
        return;
      }

      if (paidWithCredits) {
        await deductCredit(1);
        setLastUsedPaidCredits(true);
      } else {
        await consumeByokFreeQuota('shadowing_analyze');
        setLastUsedPaidCredits(false);
      }
      if (sessionIdRef.current !== sid) return;
      setByokQuota(getByokQuotaStatus('shadowing_analyze'));

      hasEvaluatedRef.current = true;
      setFinalTranscript(transcript);
      const diff = evaluateShadowing(sentence, transcript, lang);
      const aiScore =
        typeof data?.pronunciationScore === 'number' && Number.isFinite(data.pronunciationScore)
          ? Math.max(0, Math.min(100, Math.round(data.pronunciationScore)))
          : diff.accuracyPct;
      const mergedGrade: ShadowingDiffResult['grade'] =
        aiScore >= 85 ? 'excellent' : aiScore >= 60 ? 'good' : 'keep_trying';

      setDiffResult({
        ...diff,
        accuracyPct: aiScore,
        grade: mergedGrade,
      });

      setAiFeedback({
        pronunciationScore: aiScore,
        feedbackTh: typeof data?.feedbackTh === 'string' ? data.feedbackTh.trim() : '',
        tipsTh: Array.isArray(data?.tipsTh) ? data.tipsTh : [],
      });

      recordShadowingAttempt({
        lang,
        sentence,
        accuracyPct: aiScore,
      })
        .then(() => onPracticeSaved?.(aiScore))
        .catch(() => {});
    } catch {
      if (sessionIdRef.current !== sid) return;
      setErrorMsg(
        'เชื่อมต่อ AI วิเคราะห์เสียงไม่สำเร็จชั่วคราว แต่คุณยังกด "ฟังเสียงของฉัน" เทียบต้นฉบับได้ทันที'
      );
    } finally {
      if (sessionIdRef.current === sid) {
        setIsAnalyzingAi(false);
      }
    }
  };

  const requestAiAnalysisForRecording = async (sid: number, blob: Blob, mimeType: string) => {
    if (sessionIdRef.current !== sid) return;
    if (blob.size < 800) {
      setErrorMsg('คลิปเสียงสั้นเกินไป ลองกดไมค์พูดให้จบประโยคแล้วค่อยกดหยุดนะ');
      return;
    }
    if (!auth.currentUser?.uid) {
      setNeedsLoginPrompt(true);
      setErrorMsg('กรุณาเข้าสู่ระบบด้วยบัญชี Google ก่อนใช้ AI วิเคราะห์เสียงพูดครับ (คุณยังกด "ฟังเสียงของฉัน" เทียบต้นฉบับได้ฟรี)');
      return;
    }

    await syncByokDailyUsageWithFirestore().catch(() => {});
    const latestQuota = getByokQuotaStatus('shadowing_analyze');
    setByokQuota(latestQuota);

    if (latestQuota.hasKey && latestQuota.canUseFree) {
      await executeShadowingAiAnalysis(sid, blob, mimeType, false);
      return;
    }

    if (latestQuota.hasKey && !latestQuota.canUseFree) {
      setFallbackModalReason('byok_daily_exhausted');
      return;
    }

    const sub = await loadUserSubscription();
    setFallbackModalReason(getTotalCredits(sub) >= 1 ? 'no_byok_credit_confirm' : 'insufficient_credits');
  };

  const stopRecording = () => {
    const sid = sessionIdRef.current;
    setIsRecording(false);

    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (recognitionRef.current) {
      const rec = recognitionRef.current;
      recognitionRef.current = null;
      rec.onend = null;
      try {
        rec.stop();
      } catch {
        // ignore
      }
    }

    const mr = mediaRecorderRef.current;
    const hadActiveRecorder = Boolean(mr && mr.state !== 'inactive');

    if (hadActiveRecorder && mr) {
      try {
        mr.stop();
      } catch {
        cleanupMicResources();
        if (!usingAiModeRef.current) {
          finalizeFreeEvaluation(sid, latestTranscriptRef.current, false);
        }
      }
      // Note: recorder.onstop will create the Blob and trigger either AI analysis or free evaluation
    } else {
      cleanupMicResources();
      if (!usingAiModeRef.current) {
        if (evalTimeoutRef.current !== null) {
          window.clearTimeout(evalTimeoutRef.current);
        }
        evalTimeoutRef.current = window.setTimeout(() => {
          finalizeFreeEvaluation(sid, latestTranscriptRef.current, false);
        }, 300);
      }
    }
  };

  const startRecording = async () => {
    if (isStartingRef.current || isAnalyzingAi) return;
    isStartingRef.current = true;

    // 1. Cleanly terminate any previous session BEFORE starting a new one
    stopAllAudioPlayback();
    abortPreviousSession();
    revokeRecordedUrl();
    recordedBlobRef.current = null;

    const sid = ++sessionIdRef.current;
    const latestQuota = getByokQuotaStatus('shadowing_analyze');
    const shouldUseAiMode = Boolean(mediaRecorderSupported && analysisMode === 'ai');
    usingAiModeRef.current = shouldUseAiMode;
    setByokQuota(latestQuota);

    setErrorMsg(null);
    setInfoMsg(null);
    setNeedsLoginPrompt(false);
    setFallbackModalReason(null);
    setLastUsedPaidCredits(false);
    setLiveTranscript('');
    setFinalTranscript('');
    setDiffResult(null);
    setAiFeedback(null);
    setElapsedSec(0);
    latestTranscriptRef.current = '';
    hasEvaluatedRef.current = false;
    chunksRef.current = [];

    if (!mediaRecorderSupported && !speechSupported) {
      isStartingRef.current = false;
      setErrorMsg('เบราว์เซอร์นี้ไม่รองรับการเข้าถึงไมโครโฟน กรุณาเปิดผ่าน Chrome, Safari หรือ Edge');
      return;
    }

    let gotRecorder = false;

    // 2. Start MediaRecorder + live mic level meter
    if (mediaRecorderSupported) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        // If user closed or restarted while waiting for mic permission, release immediately
        if (sessionIdRef.current !== sid) {
          stream.getTracks().forEach((t) => t.stop());
          isStartingRef.current = false;
          return;
        }

        mediaStreamRef.current = stream;

        // Live visualizer levels
        try {
          const AudioCtx =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          const ctx = new AudioCtx();
          audioCtxRef.current = ctx;
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 32;
          source.connect(analyser);
          const dataArray = new Uint8Array(analyser.frequencyBinCount);

          const tickLevels = () => {
            if (sessionIdRef.current !== sid) return;
            analyser.getByteFrequencyData(dataArray);
            const bars = [0, 1, 2, 3, 4, 5, 6].map((idx) => {
              const val = dataArray[idx % dataArray.length] || 0;
              return Math.max(16, Math.min(100, Math.round((val / 255) * 100)));
            });
            setAudioLevels(bars);
            rafRef.current = requestAnimationFrame(tickLevels);
          };
          tickLevels();
        } catch {
          // Visualizer optional
        }

        const preferredMime = pickSupportedAudioMime();
        const recorder = preferredMime
          ? new MediaRecorder(stream, { mimeType: preferredMime })
          : new MediaRecorder(stream);

        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (ev) => {
          if (sessionIdRef.current !== sid) return;
          if (ev.data && ev.data.size > 0) {
            chunksRef.current.push(ev.data);
          }
        };

        recorder.onstop = () => {
          if (sessionIdRef.current !== sid) return;

          const effectiveMime = recorder.mimeType || preferredMime || 'audio/webm';
          let finalBlob: Blob | null = null;
          if (chunksRef.current.length > 0) {
            finalBlob = new Blob(chunksRef.current, { type: effectiveMime });
            recordedBlobRef.current = { blob: finalBlob, mimeType: effectiveMime };
            const url = URL.createObjectURL(finalBlob);
            recordedUrlRef.current = url;
            setRecordedAudioUrl(url);
          }

          cleanupMicResources();
          mediaRecorderRef.current = null;

          if (shouldUseAiMode) {
            if (finalBlob && finalBlob.size > 0) {
              requestAiAnalysisForRecording(sid, finalBlob, effectiveMime);
            } else {
              setErrorMsg('ยังไม่ได้รับสัญญาณเสียงจากไมโครโฟน กรุณาลองกดเริ่มใหม่อีกครั้ง');
            }
          } else {
            // Free mode: brief grace period for Web Speech final result, then evaluate
            const hasValidBlob = Boolean(finalBlob && finalBlob.size > 1000);
            if (evalTimeoutRef.current !== null) {
              window.clearTimeout(evalTimeoutRef.current);
            }
            evalTimeoutRef.current = window.setTimeout(() => {
              finalizeFreeEvaluation(sid, latestTranscriptRef.current, hasValidBlob);
            }, 300);
          }
        };

        recorder.onerror = () => {
          if (sessionIdRef.current !== sid) return;
          cleanupMicResources();
          mediaRecorderRef.current = null;
          setIsRecording(false);
          setErrorMsg('เกิดข้อผิดพลาดระหว่างอัดเสียง กรุณาลองกดเริ่มใหม่อีกครั้ง');
        };

        recorder.start(250);
        gotRecorder = true;
      } catch (err: any) {
        if (sessionIdRef.current !== sid) {
          isStartingRef.current = false;
          return;
        }
        if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
          isStartingRef.current = false;
          setErrorMsg('กรุณาอนุญาตการใช้ไมโครโฟนในเบราว์เซอร์ก่อนเริ่มฝึกพูด');
          return;
        }
        if (!speechSupported || shouldUseAiMode) {
          isStartingRef.current = false;
          setErrorMsg('ไม่สามารถเปิดไมโครโฟนได้ กรุณาตรวจสอบอุปกรณ์เสียงของคุณ');
          return;
        }
      }
    }

    // 3. Only attach Web Speech API in free mode on non-iOS browsers
    //    so it NEVER competes with MediaRecorder when AI audio capture is active or on Safari/iOS.
    const SpeechRecognition = getSpeechRecognitionCtor();
    if (!shouldUseAiMode && SpeechRecognition && !isLikelyIosOrSafari()) {
      try {
        const recognition = new SpeechRecognition();
        recognition.lang = lang === 'CN' ? 'zh-CN' : 'en-US';
        recognition.interimResults = true;
        recognition.continuous = true;
        recognition.maxAlternatives = 1;

        recognition.onresult = (event: any) => {
          if (sessionIdRef.current !== sid) return;
          let combined = '';
          for (let i = 0; i < event.results.length; i++) {
            combined += event.results[i][0]?.transcript || '';
            if (lang === 'EN' && i < event.results.length - 1) {
              combined += ' ';
            }
          }
          const trimmed = combined.trim();
          latestTranscriptRef.current = trimmed;
          setLiveTranscript(trimmed);
        };

        recognition.onerror = (event: any) => {
          if (sessionIdRef.current !== sid) return;
          if (event?.error === 'not-allowed' || event?.error === 'service-not-allowed') {
            if (!gotRecorder) {
              setErrorMsg('เบราว์เซอร์ไม่อนุญาตให้ใช้ไมโครโฟนสำหรับตรวจเสียงพูด');
            }
          }
          // Silently ignore no-speech/audio-capture/aborted when MediaRecorder is active
        };

        recognition.onend = () => {
          if (sessionIdRef.current !== sid) return;
          recognitionRef.current = null;
          // Do NOT force-stop MediaRecorder on premature Web Speech end — let user press Stop!
        };

        recognitionRef.current = recognition;
        recognition.start();
      } catch {
        // Fallback smoothly to MediaRecorder self-compare mode
      }
    }

    if (sessionIdRef.current !== sid) {
      isStartingRef.current = false;
      return;
    }

    isStartingRef.current = false;
    setIsRecording(true);

    const startTs = Date.now();
    timerRef.current = window.setInterval(() => {
      if (sessionIdRef.current !== sid) return;
      const secs = Math.floor((Date.now() - startTs) / 1000);
      setElapsedSec(secs);
      if (secs >= 20) {
        stopRecording();
      }
    }, 250);
  };

  const resetAttempt = () => {
    sessionIdRef.current += 1;
    isStartingRef.current = false;
    stopAllAudioPlayback();
    abortPreviousSession();
    revokeRecordedUrl();
    recordedBlobRef.current = null;
    setIsRecording(false);
    setIsAnalyzingAi(false);
    setLiveTranscript('');
    setFinalTranscript('');
    setDiffResult(null);
    setAiFeedback(null);
    setInfoMsg(null);
    setErrorMsg(null);
    setNeedsLoginPrompt(false);
    setFallbackModalReason(null);
    setLastUsedPaidCredits(false);
    setElapsedSec(0);
    latestTranscriptRef.current = '';
    hasEvaluatedRef.current = false;
  };

  const formatTimer = (sec: number) => `0:${String(sec).padStart(2, '0')}`;
  const isAiModeReady = analysisMode === 'ai';

  return (
    <div className="mt-4 rounded-2xl border border-indigo-200/80 bg-slate-50/80 p-4 sm:p-5 animate-in fade-in duration-200">
      {/* Panel Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 pb-3 mb-4 border-b border-slate-200/80">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 mt-0.5">
            <Mic size={16} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-bold text-slate-900 leading-tight">
                ฝึกพูดตามประโยคจริง (Shadowing Coach)
              </h4>
              {byokQuota.hasKey ? (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                    byokQuota.canUseFree
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}
                >
                  <Sparkles size={11} />
                  {byokQuota.canUseFree
                    ? `BYOK ฟรีเหลือ ${byokQuota.remaining}/${byokQuota.limit} วันนี้`
                    : `BYOK ครบวันนี้ · ใช้ AI ต่อ 1 เครดิต/ครั้ง`}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                  โหมดฟรี 0 เครดิต · ใช้ AI ตรวจเสียง (BYOK ฟรี / 1 เครดิต)
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              1. ฟังต้นฉบับ → 2. กดไมค์พูดตาม → 3. {isAiModeReady ? 'AI ฟังเสียงจริง ตรวจคำ & แนะนำการออกเสียง' : 'ฟังเสียงตัวเองเทียบต้นฉบับฟรี'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition-colors"
          title="ปิดโหมดฝึกพูด"
        >
          <X size={16} />
        </button>
      </div>

      {/* Clear 2-Button Mode Selector: Free vs AI */}
      <div className="grid grid-cols-2 gap-1.5 p-1 bg-white border border-slate-200 rounded-xl mb-4">
        <button
          type="button"
          disabled={isRecording || isAnalyzingAi}
          onClick={() => setAnalysisMode('free')}
          className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer disabled:opacity-60 ${
            analysisMode === 'free'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Headphones size={14} />
          <span>แบบฟรี (ฟังเทียบ 0 เครดิต)</span>
        </button>
        <button
          type="button"
          disabled={isRecording || isAnalyzingAi}
          onClick={() => setAnalysisMode('ai')}
          className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer disabled:opacity-60 ${
            analysisMode === 'ai'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-indigo-700 hover:bg-indigo-50/50'
          }`}
        >
          <Sparkles size={14} />
          <span>ใช้ AI ตรวจเสียง (BYOK / 1 เครดิต)</span>
        </button>
      </div>

      {/* Step 1: Target Sentence Display (switches to Word-by-Word Diff once evaluated) */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
            {diffResult ? 'ผลการตรวจคำต่อคำ' : 'ประโยคต้นแบบสำหรับพูดตาม'}
          </span>

          {/* Playback Speed Toggle + Listen Button */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setSpeed(0.75);
                  if (isPlayingModel) playModelAudio(0.75);
                }}
                className={`px-2.5 py-1 rounded-md text-xs font-bold tabular-nums transition-all ${
                  speed === 0.75
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                0.75x ช้า
              </button>
              <button
                type="button"
                onClick={() => {
                  setSpeed(1.0);
                  if (isPlayingModel) playModelAudio(1.0);
                }}
                className={`px-2.5 py-1 rounded-md text-xs font-bold tabular-nums transition-all ${
                  speed === 1.0
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                1.0x ปกติ
              </button>
            </div>

            <button
              type="button"
              onClick={() => playModelAudio()}
              disabled={isLoadingModel || isRecording}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 ${
                isPlayingModel
                  ? 'bg-indigo-600 text-white'
                  : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200'
              }`}
            >
              {isPlayingModel ? <Square size={12} fill="currentColor" /> : <Volume2 size={14} />}
              <span>
                {isLoadingModel
                  ? 'กำลังโหลดเสียง...'
                  : isPlayingModel
                  ? 'หยุดฟัง'
                  : `ฟังต้นฉบับ (${speed}x)`}
              </span>
            </button>
          </div>
        </div>

        {/* Sentence Text OR Word-Level Highlighted Diff */}
        {diffResult ? (
          <div>
            <div className="flex flex-wrap items-center gap-1.5 leading-relaxed">
              {diffResult.tokens.map((tok, i) => (
                <span
                  key={`${tok.display}-${i}`}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-base sm:text-lg font-semibold ${
                    tok.matched
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-amber-50 border-amber-300 text-amber-900 underline decoration-amber-400 decoration-dotted underline-offset-4'
                  }`}
                >
                  {tok.matched ? (
                    <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle size={13} className="text-amber-600 shrink-0" />
                  )}
                  <span className={lang === 'CN' ? 'font-serif' : ''}>{tok.display}</span>
                </span>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                <CheckCircle2 size={13} /> ออกเสียงตรง ({diffResult.matchedCount})
              </span>
              <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                <AlertCircle size={13} /> ควรทวนเพิ่ม (
                {diffResult.totalCount - diffResult.matchedCount})
              </span>
            </div>
          </div>
        ) : (
          <p
            className={`text-lg sm:text-xl font-bold text-slate-900 leading-relaxed ${
              lang === 'CN' ? 'font-serif tracking-wide' : ''
            }`}
          >
            {sentence}
          </p>
        )}

        {translationTh && (
          <p className="mt-2 text-xs sm:text-sm text-slate-500">แปล: {translationTh}</p>
        )}
      </div>

      {/* Step 2: Mic Control & Live Recording Feedback */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          {!isRecording ? (
            <button
              type="button"
              onClick={startRecording}
              disabled={isAnalyzingAi}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-bold shadow-xs transition-all cursor-pointer"
            >
              {isAnalyzingAi ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Mic size={16} />
              )}
              <span>
                {isAnalyzingAi
                  ? 'AI กำลังวิเคราะห์เสียง...'
                  : diffResult || recordedAudioUrl || errorMsg || infoMsg
                  ? 'พูดใหม่อีกครั้ง'
                  : 'กดไมค์เพื่อพูดตาม'}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={stopRecording}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold shadow-xs transition-all cursor-pointer"
            >
              <Square size={14} fill="currentColor" />
              <span>{isAiModeReady ? 'หยุดพูดให้ AI ตรวจ' : 'หยุดพูดเพื่อตรวจผล'}</span>
              <span className="ml-1 font-mono text-xs bg-rose-700/80 px-1.5 py-0.5 rounded tabular-nums">
                {formatTimer(elapsedSec)}
              </span>
            </button>
          )}

          {isRecording && (
            <div className="flex items-center gap-1 h-8 px-3 rounded-xl bg-rose-50 border border-rose-200">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse mr-1" />
              {audioLevels.map((lvl, idx) => (
                <span
                  key={idx}
                  className="w-1 rounded-full bg-rose-500 transition-all duration-75"
                  style={{ height: `${Math.max(4, Math.round((lvl / 100) * 20))}px` }}
                />
              ))}
            </div>
          )}

          {(diffResult || recordedAudioUrl || errorMsg || infoMsg) && !isRecording && !isAnalyzingAi && (
            <button
              type="button"
              onClick={resetAttempt}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:border-slate-300 text-xs font-semibold transition-colors"
            >
              <RotateCcw size={14} />
              <span>ล้างผล</span>
            </button>
          )}
        </div>

        {/* Step 3: Self-recording playback comparison */}
        {recordedAudioUrl && !isRecording && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={playUserRecording}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors ${
                isPlayingUser
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50'
              }`}
            >
              {isPlayingUser ? (
                <Square size={12} fill="currentColor" />
              ) : (
                <Headphones size={14} />
              )}
              <span>{isPlayingUser ? 'หยุดเสียงฉัน' : 'ฟังเสียงของฉัน'}</span>
            </button>

            <button
              type="button"
              onClick={() => playModelAudio()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white text-indigo-700 border border-indigo-200 hover:bg-indigo-50 transition-colors"
            >
              <Play size={12} fill="currentColor" />
              <span>เทียบต้นฉบับ</span>
            </button>

            {!aiFeedback && recordedBlobRef.current && !isAnalyzingAi && (
              <button
                type="button"
                onClick={() => {
                  const rec = recordedBlobRef.current;
                  if (rec) {
                    setAnalysisMode('ai');
                    requestAiAnalysisForRecording(sessionIdRef.current, rec.blob, rec.mimeType);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-colors cursor-pointer"
              >
                <Sparkles size={13} />
                <span>ส่งคลิปนี้ให้ AI ตรวจ (BYOK / 1 เครดิต)</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Live Recording Status */}
      {isRecording && (
        <div className="mt-3 px-3.5 py-2.5 rounded-xl bg-white border border-rose-200/80 text-sm text-slate-700">
          <span className="text-xs font-bold text-rose-600 mr-2">กำลังอัดเสียง:</span>
          {usingAiModeRef.current ? (
            <span className="text-slate-500">
              อ่านประโยคด้านบนให้จบแล้วกด <b>หยุดพูดให้ AI ตรวจ</b> ได้เลย (อัดเสียงชัดเจนทุกอุปกรณ์)
            </span>
          ) : liveTranscript ? (
            <span className={lang === 'CN' ? 'font-serif' : ''}>"{liveTranscript}"</span>
          ) : (
            <span className="text-slate-400">
              เริ่มอ่านประโยคด้านบนได้เลย ระบบกำลังบันทึกเสียงของคุณไว้ฟังเทียบต้นฉบับ...
            </span>
          )}
        </div>
      )}

      {/* AI Analyzing Banner */}
      {isAnalyzingAi && (
        <div className="mt-3 px-3.5 py-3 rounded-xl bg-indigo-50 border border-indigo-200 text-xs font-semibold text-indigo-800 flex items-center gap-2.5">
          <Loader2 size={15} className="animate-spin text-indigo-600 shrink-0" />
          <span>AI กำลังฟังเสียงพูดจริงของคุณ เพื่อตรวจคำต่อคำและวิเคราะห์การออกเสียง...</span>
        </div>
      )}

      {/* Friendly Info Message (Self-Compare Success) */}
      {infoMsg && !isRecording && !isAnalyzingAi && (
        <div className="mt-3 px-3.5 py-2.5 rounded-xl bg-blue-50 border border-blue-200 text-xs font-medium text-blue-900 flex items-center gap-2">
          <Headphones size={15} className="text-blue-600 shrink-0" />
          <span>{infoMsg}</span>
        </div>
      )}

      {/* Error Message */}
      {errorMsg && !isRecording && !isAnalyzingAi && (
        <div className="mt-3 px-3.5 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs font-medium text-amber-900 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle size={15} className="text-amber-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          {needsLoginPrompt && (
            <button
              type="button"
              onClick={() => openLoginModal()}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
            >
              เข้าสู่ระบบด้วย Google
            </button>
          )}
        </div>
      )}

      {/* Evaluation Score Banner */}
      {diffResult && !isRecording && !isAnalyzingAi && (
        <div
          className={`mt-3 p-3.5 rounded-xl border space-y-2.5 ${
            diffResult.grade === 'excellent'
              ? 'bg-emerald-50/90 border-emerald-200'
              : diffResult.grade === 'good'
              ? 'bg-indigo-50/80 border-indigo-200'
              : 'bg-amber-50/90 border-amber-200'
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-base tabular-nums shrink-0 ${
                diffResult.grade === 'excellent'
                  ? 'bg-emerald-600 text-white'
                  : diffResult.grade === 'good'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-amber-500 text-white'
              }`}
            >
              {diffResult.accuracyPct}%
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-slate-900">
                  {aiFeedback?.feedbackTh ||
                    (diffResult.grade === 'excellent'
                      ? 'ออกเสียงชัดและครบถ้วนมาก!'
                      : diffResult.grade === 'good'
                      ? 'ใกล้เคียงแล้ว ลองเน้นคำที่ตกหล่นอีกนิด'
                      : 'ลองฟังช้าๆ ที่ 0.75x แล้วพูดตามทีละช่วงดูนะ')}
                </span>
                {aiFeedback && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/80 border border-slate-200/80 text-[10px] font-bold text-indigo-700">
                    <Sparkles size={10} /> AI ฟังเสียงจริง {lastUsedPaidCredits ? '(-1 เครดิต)' : '(BYOK)'}
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-600 mt-1">
                ตรงตามประโยค {diffResult.matchedCount}/{diffResult.totalCount}{' '}
                {lang === 'CN' ? 'ตัวอักษร' : 'คำ'}
                {finalTranscript && (
                  <span className="ml-2 text-slate-500">
                    · {aiFeedback ? 'AI ได้ยิน:' : 'ระบบได้ยิน:'}{' '}
                    <span className={lang === 'CN' ? 'font-serif' : ''}>"{finalTranscript}"</span>
                  </span>
                )}
              </div>
              {diffResult.missedTokens.length > 0 && (
                <div className="text-xs text-amber-800 font-medium mt-1">
                  จุดที่ควรเน้นเพิ่ม: {diffResult.missedTokens.slice(0, 6).join(', ')}
                  {diffResult.missedTokens.length > 6 ? '...' : ''}
                </div>
              )}
            </div>
          </div>

          {/* Actionable Thai pronunciation / tone coaching tips from Gemini AI */}
          {aiFeedback && aiFeedback.tipsTh.length > 0 && (
            <div className="pt-2 border-t border-slate-200/70 space-y-1">
              <div className="text-[11px] font-bold text-slate-700">คำแนะนำการออกเสียงจาก AI:</div>
              <ul className="space-y-1 text-xs text-slate-700 list-disc pl-4">
                {aiFeedback.tipsTh.map((tip, idx) => (
                  <li key={idx}>{tip}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <ByokQuotaFallbackModal
        isOpen={Boolean(fallbackModalReason)}
        onClose={() => setFallbackModalReason(null)}
        feature="shadowing_analyze"
        reason={fallbackModalReason || 'no_byok_credit_confirm'}
        creditCost={1}
        isBusy={isAnalyzingAi}
        onUseCredits={async () => {
          const rec = recordedBlobRef.current;
          setFallbackModalReason(null);
          if (rec) {
            await executeShadowingAiAnalysis(sessionIdRef.current, rec.blob, rec.mimeType, true);
          }
        }}
      />
    </div>
  );
}
