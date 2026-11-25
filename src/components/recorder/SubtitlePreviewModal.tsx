import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Download,
  RotateCcw,
  CheckCircle2,
  Captions,
  Loader2,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  AlertTriangle,
  Film,
  Sparkles,
  Zap,
  LogIn,
  Cpu,
  Key,
  Clock,
} from 'lucide-react';
import { auth } from '../../firebase';
import { getFirebaseAuthHeaders, openLoginModal } from '../../services/authHeaders';
import {
  deductCredit,
  getTotalCredits,
  loadUserSubscription,
} from '../../services/subscriptionService';
import {
  BYOK_SUBTITLE_MAX_BASE64_BYTES,
  BYOK_SUBTITLE_MAX_DURATION_SEC,
  consumeByokFreeQuota,
  getByokQuotaStatus,
  getResetTimeLabelThai,
  getStoredByokKey,
  syncByokDailyUsageWithFirestore,
} from '../../services/byokService';
import InsufficientCreditsModal from '../InsufficientCreditsModal';
import ByokQuotaFallbackModal, { QuotaFallbackReason } from '../ByokQuotaFallbackModal';
import {
  RecordedClip,
  SubtitleCue,
  SubtitleEngineMode,
  WhisperLanguageOption,
  buildExportFilename,
  formatDuration,
  formatFileSize,
  formatTimePrecise,
} from './types';
import {
  exportStandardMp4Video,
  exportVideoWithSubtitles,
  extractAudioAsWavBase64,
} from './subtitleUtils';
import {
  LocalSubtitleProgress,
  generateHybridLocalSubtitles,
} from './localWhisperService';

const SUBTITLE_CREDIT_COST = 5;

interface SubtitlePreviewModalProps {
  clip: RecordedClip;
  includeAppAudio: boolean;
  onDownloadRaw: () => void;
  onRecordAgain: () => void;
  onClose: () => void;
  /** Optional custom title (e.g. for standalone video upload mode) */
  modalTitle?: string;
  /** Optional custom label for left footer button (defaults to "อัดใหม่อีกครั้ง") */
  replaceLabel?: string;
  /** True when user uploaded an external video file instead of recording inside Desktop Studio */
  isExternalUpload?: boolean;
}

export default function SubtitlePreviewModal({
  clip,
  includeAppAudio,
  onDownloadRaw,
  onRecordAgain,
  onClose,
  modalTitle,
  replaceLabel = 'อัดใหม่อีกครั้ง',
  isExternalUpload = false,
}: SubtitlePreviewModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);

  // Engine choice: Gemini AI (5 credits, fast & accurate) vs Free On-Device Whisper (0 credits, speed depends on device specs)
  const [engineMode, setEngineMode] = useState<SubtitleEngineMode>('gemini-online');
  const [whisperLang, setWhisperLang] = useState<WhisperLanguageOption>('thai');

  // User credit balance, BYOK quota & modals
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [showInsufficientModal, setShowInsufficientModal] = useState(false);
  const [needsLoginError, setNeedsLoginError] = useState(false);
  const [byokQuota, setByokQuota] = useState(() => getByokQuotaStatus('video_subtitle'));
  const [fallbackModal, setFallbackModal] = useState<{ open: boolean; reason: QuotaFallbackReason }>({
    open: false,
    reason: 'byok_daily_exhausted',
  });

  // Subtitles state
  const [subtitles, setSubtitles] = useState<SubtitleCue[]>([]);
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState<LocalSubtitleProgress | null>(null);
  const [genSummary, setGenSummary] = useState<string | null>(null);
  const [subError, setSubError] = useState<string | null>(null);
  const [showEditorPanel, setShowEditorPanel] = useState(false);
  const genAbortRef = useRef<AbortController | null>(null);

  // Burn-in / Standard MP4 export state
  const [isExporting, setIsExporting] = useState(false);
  const [exportMode, setExportMode] = useState<'subtitled' | 'raw' | null>(null);
  const [exportProgress, setExportProgress] = useState(0);
  const exportAbortRef = useRef<AbortController | null>(null);

  // Keep credit balance synced with live wallet events
  useEffect(() => {
    let mounted = true;
    const refreshCredits = async () => {
      try {
        const sub = await loadUserSubscription();
        if (mounted) setCreditBalance(getTotalCredits(sub));
      } catch {
        // ignore
      }
    };
    refreshCredits();

    const handleSubUpdated = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && mounted) {
        setCreditBalance(getTotalCredits(detail));
      } else {
        refreshCredits();
      }
    };
    const refreshByokQuota = () => {
      if (mounted) setByokQuota(getByokQuotaStatus('video_subtitle'));
    };
    syncByokDailyUsageWithFirestore().then(refreshByokQuota);

    window.addEventListener('subscription_updated', handleSubUpdated);
    window.addEventListener('byok_key_updated', refreshByokQuota);
    window.addEventListener('byok_quota_updated', refreshByokQuota);
    return () => {
      mounted = false;
      window.removeEventListener('subscription_updated', handleSubUpdated);
      window.removeEventListener('byok_key_updated', refreshByokQuota);
      window.removeEventListener('byok_quota_updated', refreshByokQuota);
    };
  }, []);

  const isWithinByokDuration = clip.durationSec <= BYOK_SUBTITLE_MAX_DURATION_SEC + 1;
  const canUseByokFree = byokQuota.canUseFree && isWithinByokDuration;

  // Smooth real-time sync for live subtitle overlay while video plays
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let rafId: number | null = null;
    const syncTime = () => {
      if (video) setCurrentTime(video.currentTime);
      if (video && !video.paused && !video.ended) {
        rafId = requestAnimationFrame(syncTime);
      }
    };

    const handlePlay = () => {
      rafId = requestAnimationFrame(syncTime);
    };
    const handleUpdate = () => {
      setCurrentTime(video.currentTime);
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('timeupdate', handleUpdate);
    video.addEventListener('seeked', handleUpdate);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('timeupdate', handleUpdate);
      video.removeEventListener('seeked', handleUpdate);
    };
  }, [clip.url]);

  // Abort ongoing generation or export if modal closes
  useEffect(() => {
    return () => {
      genAbortRef.current?.abort();
      exportAbortRef.current?.abort();
    };
  }, []);

  const activeCue =
    showSubtitles && subtitles.length > 0
      ? subtitles.find(
          (cue) => currentTime >= cue.startSec && currentTime <= cue.endSec
        ) || null
      : null;

  const handleCancelGenerate = () => {
    genAbortRef.current?.abort();
  };

  const handleGenerateSubtitles = async (forceUseCredits = false) => {
    if (isGenerating || isExporting) return;

    setSubError(null);
    setNeedsLoginError(false);
    setGenSummary(null);

    if (engineMode === 'local-hybrid') {
      // ── FREE ON-DEVICE MODE (0 Credits — uses user's own CPU/GPU, slower depending on device specs) ──
      setIsGenerating(true);
      const controller = new AbortController();
      genAbortRef.current = controller;

      try {
        const result = await generateHybridLocalSubtitles(
          clip,
          whisperLang,
          (progress) => setGenProgress(progress),
          controller.signal
        );

        if (result.subtitles.length === 0) {
          setSubError(
            'ไม่พบเสียงพูดที่ชัดเจนในวิดีโอนี้ ลองเปลี่ยนภาษาถอดเสียงเป็น "อัตโนมัติ" หรือลองใช้โหมด Gemini AI หรือกด "+ เพิ่มประโยค" เพื่อพิมพ์เองได้ครับ'
          );
          setShowEditorPanel(true);
        } else {
          setSubtitles(result.subtitles);
          setShowSubtitles(true);
          setShowEditorPanel(true);
          const aiTotal =
            result.stats.aiCapturedCount + result.stats.aiWhisperCount;
          const backendLabel =
            result.stats.backend === 'webgpu' ? 'WebGPU' : 'CPU/WASM';
          setGenSummary(
            `สร้างซับฟรีบนเครื่องสำเร็จ (0 เครดิต) · You: ${result.stats.youCount} ประโยค · AI: ${aiTotal} ประโยค (${backendLabel})`
          );
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg !== 'ABORTED' && !msg.toLowerCase().includes('aborted')) {
          setSubError(msg || 'ไม่สามารถสร้างซับบนเครื่องได้ กรุณาลองใหม่อีกครั้ง');
        }
      } finally {
        setIsGenerating(false);
        setGenProgress(null);
        genAbortRef.current = null;
      }
      return;
    }

    // ── GEMINI AI MODE (Free 1 clip/day <= 5 min via BYOK, OR 5 Credits via Owner Server) ──
    if (!auth.currentUser) {
      setNeedsLoginError(true);
      setSubError(
        `กรุณาเข้าสู่ระบบด้วยบัญชี Google ก่อนใช้โหมด Gemini AI หรือสิทธิ์ฟรี BYOK (หรือสลับไปใช้โหมด "ฟรีบนเครื่อง 0 เครดิต" ได้ทันทีครับ)`
      );
      return;
    }

    const latestQuota = getByokQuotaStatus('video_subtitle');
    setByokQuota(latestQuota);
    const useByokNow = !forceUseCredits && latestQuota.canUseFree && isWithinByokDuration;

    // If user has BYOK active and clip is <= 5 min, but daily 1/1 quota is already used, offer credit fallback modal first
    if (!forceUseCredits && latestQuota.hasKey && !latestQuota.canUseFree && isWithinByokDuration) {
      setFallbackModal({ open: true, reason: 'byok_daily_exhausted' });
      return;
    }

    if (!useByokNow) {
      try {
        const subState = await loadUserSubscription();
        const total = getTotalCredits(subState);
        setCreditBalance(total);
        if (total < SUBTITLE_CREDIT_COST) {
          setShowInsufficientModal(true);
          return;
        }
      } catch {
        setSubError('ไม่สามารถตรวจสอบยอดเครดิตได้ กรุณาลองใหม่อีกครั้ง');
        return;
      }
    }

    setIsGenerating(true);
    const controller = new AbortController();
    genAbortRef.current = controller;

    try {
      setGenProgress({
        stage: 'decoding',
        label: 'กำลังแยกและบีบอัดเสียงจากวิดีโอ...',
      });
      const { base64, mimeType } = await extractAudioAsWavBase64(clip.blob);
      if (controller.signal.aborted) throw new Error('ABORTED');

      // Double-check base64 audio payload size for BYOK mode (< 18MB safely below Gemini's 20MB inlineData limit)
      if (useByokNow && base64.length > BYOK_SUBTITLE_MAX_BASE64_BYTES) {
        setSubError(
          'ไฟล์เสียงจากคลิปนี้มีขนาดเกินเกณฑ์สิทธิ์ฟรี BYOK (18 MB) กรุณากดใช้ 5 เครดิต หรือสลับไปใช้โหมด "ฟรีบนเครื่อง (0 เครดิต)" แทนครับ'
        );
        return;
      }

      setGenProgress({
        stage: 'transcribing-you',
        label: useByokNow
          ? 'Gemini AI (BYOK ฟรี) กำลังถอดเสียง แยกผู้พูด (You / AI) และจับเวลา...'
          : 'Gemini AI กำลังถอดเสียง แยกผู้พูด (You / AI) และจับเวลา...',
        detail: useByokNow
          ? 'ใช้สิทธิ์ฟรี BYOK 1 คลิป/วัน (0 เครดิต · หักสิทธิ์เฉพาะเมื่อสร้างสำเร็จ)'
          : `หัก ${SUBTITLE_CREDIT_COST} เครดิตเมื่อสร้างซับสำเร็จเท่านั้น`,
      });

      const byokKey = useByokNow ? getStoredByokKey() : null;
      const authHeaders = await getFirebaseAuthHeaders();
      const response = await fetch('/api/generate-subtitles', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          audioBase64: base64,
          mimeType,
          durationSec: clip.durationSec,
          useByokQuota: useByokNow,
          byokKey,
        }),
        signal: controller.signal,
      });

      const rawText = await response.text();
      let data: {
        subtitles?: SubtitleCue[];
        error?: string;
        authRequired?: boolean;
        byokInvalidKey?: boolean;
        byokQuotaExhausted?: boolean;
        usedByok?: boolean;
      } = {};
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error(
          response.status === 413
            ? 'ไฟล์เสียงมีขนาดใหญ่เกินกำหนด กรุณาลองใช้โหมด "ฟรีบนเครื่อง (0 เครดิต)" หรือตัดคลิปให้สั้นลงครับ'
            : `เซิร์ฟเวอร์ตอบกลับไม่สมบูรณ์ (HTTP ${response.status}) กรุณาลองใหม่อีกครั้งครับ`
        );
      }

      if (!response.ok) {
        if (data.authRequired || (response.status === 401 && !data.byokInvalidKey)) {
          setNeedsLoginError(true);
          throw new Error(data.error || 'กรุณาเข้าสู่ระบบด้วยบัญชี Google ก่อนใช้ Gemini AI ครับ');
        }
        if (useByokNow && (response.status === 429 || data.byokQuotaExhausted || data.byokInvalidKey)) {
          setFallbackModal({ open: true, reason: 'byok_google_429' });
          return;
        }
        throw new Error(data.error || 'สร้างซับไตเติ้ลด้วย Gemini AI ไม่สำเร็จ');
      }

      const generated: SubtitleCue[] = Array.isArray(data.subtitles)
        ? data.subtitles
        : [];

      if (generated.length === 0) {
        setSubError(
          'ไม่พบเสียงพูดที่ชัดเจนในวิดีโอนี้ (ไม่ได้หักสิทธิ์ BYOK หรือเครดิต) คุณสามารถกด "+ เพิ่มประโยค" เพื่อพิมพ์เองได้ครับ'
        );
        setShowEditorPanel(true);
      } else {
        // Consume BYOK daily quota OR deduct 5 credits ONLY after Gemini AI returned real subtitles
        let updatedByokQuota = latestQuota;
        if (useByokNow) {
          await consumeByokFreeQuota('video_subtitle');
          updatedByokQuota = getByokQuotaStatus('video_subtitle');
          setByokQuota(updatedByokQuota);
        } else {
          const deductRes = await deductCredit('video_subtitle');
          setCreditBalance(getTotalCredits(deductRes.newState));
        }

        setSubtitles(generated);
        setShowSubtitles(true);
        setShowEditorPanel(true);
        const youCount = generated.filter((c) => c.speaker === 'YOU').length;
        const aiCount = generated.filter((c) => c.speaker === 'AI').length;
        setGenSummary(
          useByokNow
            ? `สร้างซับด้วย Gemini AI สำเร็จ (สิทธิ์ฟรี BYOK · เหลือ ${updatedByokQuota.remaining}/${updatedByokQuota.limit} คลิปวันนี้) · You: ${youCount} ประโยค · AI: ${aiCount} ประโยค`
            : `สร้างซับด้วย Gemini AI สำเร็จ (หัก ${SUBTITLE_CREDIT_COST} เครดิต) · You: ${youCount} ประโยค · AI: ${aiCount} ประโยค`
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg !== 'ABORTED' && !msg.toLowerCase().includes('aborted')) {
        setSubError(msg || 'ไม่สามารถสร้างซับไตเติ้ลอัตโนมัติได้');
      }
    } finally {
      setIsGenerating(false);
      setGenProgress(null);
      genAbortRef.current = null;
    }
  };

  const triggerBlobDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const handleDownloadStandardRawVideo = async () => {
    if (isExporting || isGenerating) return;

    // Older browsers without WebCodecs fall back directly to the raw recording blob
    if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
      onDownloadRaw();
      return;
    }

    setSubError(null);
    setIsExporting(true);
    setExportMode('raw');
    setExportProgress(0);

    const controller = new AbortController();
    exportAbortRef.current = controller;

    try {
      const result = await exportStandardMp4Video(
        clip.url,
        (pct) => setExportProgress(pct),
        controller.signal,
        clip.blob
      );

      if (result) {
        triggerBlobDownload(
          result.blob,
          buildExportFilename(result.extension, clip.createdAt)
        );
      } else {
        onDownloadRaw();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg !== 'ABORTED') {
        console.warn('[RawExport] Standard MP4 conversion failed, falling back:', err);
        onDownloadRaw();
      }
    } finally {
      setIsExporting(false);
      setExportMode(null);
      exportAbortRef.current = null;
    }
  };

  const handleExportSubtitledVideo = async () => {
    if (subtitles.length === 0 || isExporting) return;

    setSubError(null);
    setIsExporting(true);
    setExportMode('subtitled');
    setExportProgress(0);

    const controller = new AbortController();
    exportAbortRef.current = controller;

    try {
      const { blob, extension } = await exportVideoWithSubtitles(
        clip.url,
        subtitles,
        (pct) => setExportProgress(pct),
        controller.signal,
        clip.blob
      );

      triggerBlobDownload(
        blob,
        buildExportFilename(extension, new Date(), 'Subtitled')
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg !== 'ABORTED') {
        setSubError(`ฝังซับไตเติ้ลลงวิดีโอไม่สำเร็จ: ${msg}`);
      }
    } finally {
      setIsExporting(false);
      setExportMode(null);
      exportAbortRef.current = null;
    }
  };

  const handleCancelExport = () => {
    exportAbortRef.current?.abort();
  };

  const handleToggleSpeaker = (id: string) => {
    setSubtitles((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, speaker: c.speaker === 'AI' ? 'YOU' : 'AI' } : c
      )
    );
  };

  const handleUpdateCueText = (id: string, text: string) => {
    setSubtitles((prev) =>
      prev.map((c) => (c.id === id ? { ...c, text } : c))
    );
  };

  const handleUpdateCueTime = (
    id: string,
    field: 'startSec' | 'endSec',
    val: string
  ) => {
    const num = Math.max(0, parseFloat(val) || 0);
    setSubtitles((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: num } : c))
    );
  };

  const handleDeleteCue = (id: string) => {
    setSubtitles((prev) => prev.filter((c) => c.id !== id));
  };

  const handleAddCue = () => {
    const start = Number(currentTime.toFixed(1));
    const end = Number((start + 2.5).toFixed(1));
    const newCue: SubtitleCue = {
      id: `sub_custom_${Date.now()}`,
      startSec: start,
      endSec: end,
      speaker: 'YOU',
      text: 'พิมพ์ข้อความซับไตเติ้ลที่นี่',
    };
    setSubtitles((prev) =>
      [...prev, newCue].sort((a, b) => a.startSec - b.startSec)
    );
    setShowSubtitles(true);
    setShowEditorPanel(true);
  };

  const jumpToTime = (sec: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = sec;
    setCurrentTime(sec);
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-sm">
      <div
        className={`w-full bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[94vh] transition-all ${
          showEditorPanel ? 'max-w-6xl' : 'max-w-4xl'
        }`}
      >
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5 min-w-0">
            <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 truncate">
                {modalTitle || 'พรีวิวคลิปวิดีโอ & ใส่ซับไตเติ้ลอัตโนมัติ'}
              </h2>
              <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
                <span>ความยาว {formatDuration(clip.durationSec)}</span>
                <span aria-hidden="true">·</span>
                <span>{formatFileSize(clip.sizeBytes)}</span>
                <span aria-hidden="true">·</span>
                <span>{clip.extension.toUpperCase()}</span>
                <span aria-hidden="true">·</span>
                <span>{clip.qualityLabel}</span>
                {!isExternalUpload && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>
                      {clip.hasTabAudio ? 'ไมค์ + เสียงแอป' : 'เฉพาะเสียงไมค์'}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {subtitles.length > 0 && (
              <button
                type="button"
                onClick={() => setShowEditorPanel((v) => !v)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors whitespace-nowrap ${
                  showEditorPanel
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {showEditorPanel ? 'ซ่อนแถบแก้ซับ' : `แก้ซับ (${subtitles.length})`}
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              disabled={isExporting}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-40 transition-colors"
              aria-label="ปิดหน้าต่างพรีวิว"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Dual-Mode Subtitle Control Strip (Gemini AI 5 Credits vs Free On-Device) */}
        <div className="px-5 sm:px-6 py-3 bg-slate-50 border-b border-slate-200 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              {/* Engine Switcher */}
              <div className="inline-flex p-0.5 bg-slate-200/80 rounded-xl border border-slate-200">
                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={() => {
                    setEngineMode('gemini-online');
                    setSubError(null);
                    setNeedsLoginError(false);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                    engineMode === 'gemini-online'
                      ? 'bg-white text-indigo-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Sparkles size={13} className="text-indigo-600" />
                  <span>
                    {canUseByokFree
                      ? `Gemini AI (ฟรี BYOK · เหลือ ${byokQuota.remaining}/${byokQuota.limit})`
                      : `Gemini AI (เร็ว · ${SUBTITLE_CREDIT_COST} เครดิต)`}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={() => {
                    setEngineMode('local-hybrid');
                    setSubError(null);
                    setNeedsLoginError(false);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                    engineMode === 'local-hybrid'
                      ? 'bg-white text-emerald-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Cpu size={13} className="text-emerald-600" />
                  <span>ฟรีบนเครื่อง (0 เครดิต)</span>
                </button>
              </div>

              {/* Language selector for Free On-Device Whisper */}
              {engineMode === 'local-hybrid' ? (
                <select
                  value={whisperLang}
                  disabled={isGenerating}
                  onChange={(e) =>
                    setWhisperLang(e.target.value as WhisperLanguageOption)
                  }
                  aria-label="ภาษาหลักในวิดีโอ"
                  className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500"
                >
                  <option value="thai">เน้นภาษาไทย (แนะนำ)</option>
                  <option value="auto">อัตโนมัติ (ไทย/จีน/อังกฤษ)</option>
                  <option value="chinese">เน้นภาษาจีน</option>
                  <option value="english">เน้นภาษาอังกฤษ</option>
                </select>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {canUseByokFree && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold">
                      <Key size={11} className="text-emerald-600" />
                      <span>BYOK ฟรี {byokQuota.remaining}/{byokQuota.limit} คลิปวันนี้ (≤ 5 นาที)</span>
                    </span>
                  )}
                  {byokQuota.hasKey && !byokQuota.canUseFree && isWithinByokDuration && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-bold">
                      <Key size={11} className="text-amber-600" />
                      <span>BYOK ครบโควตาวันนี้ (เหลือ {byokQuota.remaining}/{byokQuota.limit})</span>
                    </span>
                  )}
                  {creditBalance !== null && (
                    <span className="inline-flex items-center gap-1 text-xs text-slate-600 font-medium tabular-nums">
                      <Zap size={12} className="text-amber-500" />
                      คงเหลือ:{' '}
                      <strong
                        className={
                          !canUseByokFree && creditBalance < SUBTITLE_CREDIT_COST
                            ? 'text-rose-600'
                            : 'text-slate-900'
                        }
                      >
                        {creditBalance} เครดิต
                      </strong>
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {isGenerating ? (
                <button
                  type="button"
                  onClick={handleCancelGenerate}
                  className="px-3.5 py-2 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
                >
                  ยกเลิกการสร้างซับ
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleGenerateSubtitles(false)}
                  disabled={isExporting}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl disabled:opacity-50 text-white text-xs font-bold transition-colors whitespace-nowrap shadow-xs cursor-pointer ${
                    engineMode === 'local-hybrid'
                      ? 'bg-emerald-700 hover:bg-emerald-800'
                      : canUseByokFree
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-indigo-700 hover:bg-indigo-800'
                  }`}
                >
                  <Captions size={14} className="text-sky-200" />
                  <span>
                    {subtitles.length > 0
                      ? engineMode === 'local-hybrid'
                        ? 'สร้างซับใหม่ฟรีบนเครื่อง (0 เครดิต)'
                        : canUseByokFree
                        ? 'สร้างซับใหม่ด้วย Gemini AI (ฟรี BYOK)'
                        : `สร้างซับใหม่ด้วย Gemini AI (${SUBTITLE_CREDIT_COST} เครดิต)`
                      : engineMode === 'local-hybrid'
                      ? 'สร้างซับฟรีบนเครื่อง (0 เครดิต)'
                      : canUseByokFree
                      ? 'สร้างซับด้วย Gemini AI (ฟรี BYOK · 0 เครดิต)'
                      : `สร้างซับด้วย Gemini AI (${SUBTITLE_CREDIT_COST} เครดิต)`}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Transparent mode description & BYOK duration/quota notice */}
          {engineMode === 'gemini-online' && byokQuota.hasKey && !isWithinByokDuration && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900">
              <div className="flex items-center gap-1.5">
                <Clock size={13} className="text-amber-600 shrink-0" />
                <span>
                  คลิปนี้ยาว <strong>{formatDuration(clip.durationSec)}</strong> — สิทธิ์ฟรี BYOK รองรับสูงสุด <strong>5:00 นาที</strong> คุณสามารถใช้ <strong>{SUBTITLE_CREDIT_COST} เครดิต</strong> หรือสลับไปโหมด <strong>ฟรีบนเครื่อง (ไม่จำกัดความยาว)</strong> ได้ทันที
                </span>
              </div>
              <button
                type="button"
                onClick={() => setEngineMode('local-hybrid')}
                className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 text-amber-900 font-bold hover:bg-amber-100 transition-colors shrink-0"
              >
                สลับไปฟรีบนเครื่อง
              </button>
            </div>
          )}

          <p className="text-[11px] text-slate-500 leading-relaxed">
            {engineMode === 'local-hybrid' ? (
              <>
                💻 <strong className="text-emerald-800">โหมดฟรีบนเครื่อง (0 เครดิต · ไม่จำกัดความยาว):</strong> ประมวลผลด้วย CPU/GPU ของเครื่องคุณเอง ฟรีไม่เสียเครดิต อาจใช้เวลารอนานขึ้นอยู่กับสเปกเครื่องและความยาวคลิป (ครั้งแรกจะโหลดโมเดลเก็บลงแคชครั้งเดียว)
              </>
            ) : canUseByokFree ? (
              <>
                🔑 <strong className="text-emerald-800">สิทธิ์ฟรี BYOK (0 เครดิต · คลิปไม่เกิน 5 นาที):</strong> ใช้ API Key ส่วนตัวของคุณได้ฟรีวันละ 1 คลิป (รีเซ็ต {getResetTimeLabelThai()}) หักสิทธิ์เฉพาะเมื่อสร้างซับสำเร็จเท่านั้น
              </>
            ) : byokQuota.hasKey && !byokQuota.canUseFree && isWithinByokDuration ? (
              <>
                ⚡ <strong className="text-indigo-800">ใช้สิทธิ์ฟรี BYOK วันนี้ครบ 1/1 คลิปแล้ว (รีเซ็ต {getResetTimeLabelThai()}):</strong> สามารถกดใช้ <strong>{SUBTITLE_CREDIT_COST} เครดิตในแอป</strong> เพื่อทำต่อ หรือสลับไปใช้โหมดฟรีบนเครื่อง (0 เครดิต) ได้ทันที
              </>
            ) : (
              <>
                ⚡ <strong className="text-indigo-800">โหมด Gemini AI ({SUBTITLE_CREDIT_COST} เครดิต / ครั้ง):</strong> ประมวลผลรวดเร็วบนเซิร์ฟเวอร์ แม่นยำสูง แยกผู้พูด You / AI อัตโนมัติ{' '}
                {!byokQuota.hasKey && (
                  <button
                    type="button"
                    onClick={() => window.dispatchEvent(new CustomEvent('open-byok-modal'))}
                    className="text-emerald-700 font-bold hover:underline ml-1"
                  >
                    หรือเชื่อม BYOK ใช้ฟรี 1 คลิป/วัน (≤ 5 นาที)
                  </button>
                )}
              </>
            )}
          </p>
        </div>

        {/* Live Generation Progress Bar */}
        {isGenerating && genProgress && (
          <div className="px-5 sm:px-6 py-3 bg-indigo-50 border-b border-indigo-100 space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-indigo-900 font-medium min-w-0">
                <Loader2
                  size={14}
                  className="animate-spin text-indigo-600 shrink-0"
                />
                <span className="truncate">{genProgress.label}</span>
              </div>
              {typeof genProgress.percent === 'number' && (
                <span className="font-mono font-bold tabular-nums text-indigo-700 shrink-0">
                  {genProgress.percent}%
                </span>
              )}
            </div>
            {genProgress.detail && (
              <p className="text-[11px] text-indigo-700/80 pl-5 truncate">
                {genProgress.detail}
              </p>
            )}
            {typeof genProgress.percent === 'number' && (
              <div className="h-1.5 w-full bg-indigo-200/70 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-600 transition-all duration-150"
                  style={{ width: `${genProgress.percent}%` }}
                />
              </div>
            )}
          </div>
        )}

        {/* Completion Summary Strip */}
        {!isGenerating && genSummary && !subError && (
          <div className="px-5 sm:px-6 py-2 bg-emerald-50 border-b border-emerald-200/80 flex items-center gap-2 text-xs text-emerald-900 font-medium">
            <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
            <span>{genSummary}</span>
          </div>
        )}

        {/* Error Strip */}
        {subError && (
          <div className="px-5 sm:px-6 py-2.5 bg-red-50 border-b border-red-200 flex flex-wrap items-center justify-between gap-2 text-xs text-red-800">
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-red-600 shrink-0" />
              <span>{subError}</span>
            </div>
            {needsLoginError && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  openLoginModal();
                }}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors"
              >
                <LogIn size={12} />
                <span>เข้าสู่ระบบด้วย Google</span>
              </button>
            )}
          </div>
        )}

        {/* Main Content: Video Theater + Optional Subtitle Editor Sidebar */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
          {/* Video Theater */}
          <div className="flex-1 bg-slate-950 p-4 sm:p-5 flex flex-col items-center justify-center relative min-h-[260px]">
            <div className="relative w-full flex items-center justify-center">
              <video
                ref={videoRef}
                src={clip.url}
                controls
                playsInline
                className="w-full max-h-[54vh] rounded-xl bg-black shadow-lg"
              />

              {/* Real-time Pro Editor Black-Box Subtitle Overlay */}
              {activeCue && (
                <div
                  className="pointer-events-none absolute bottom-12 left-1/2 -translate-x-1/2 max-w-[88%] px-4 py-2 rounded-xl bg-black/85 border shadow-2xl text-center backdrop-blur-[2px] transition-opacity duration-100"
                  style={{
                    borderColor:
                      activeCue.speaker === 'AI'
                        ? 'rgba(52, 211, 153, 0.38)'
                        : 'rgba(56, 189, 248, 0.38)',
                  }}
                >
                  <p className="text-sm sm:text-base md:text-lg leading-snug font-semibold">
                    <span
                      className={`font-bold mr-1.5 ${
                        activeCue.speaker === 'AI'
                          ? 'text-emerald-400'
                          : 'text-sky-400'
                      }`}
                    >
                      {activeCue.speaker === 'AI' ? 'AI:' : 'You:'}
                    </span>
                    <span
                      className={
                        activeCue.speaker === 'AI'
                          ? 'text-yellow-200'
                          : 'text-white'
                      }
                    >
                      {activeCue.text}
                    </span>
                  </p>
                </div>
              )}
            </div>

            {/* Subtle subtitle visibility toggle bar when subtitles exist */}
            {subtitles.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center justify-between w-full gap-2 text-xs text-slate-300">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="font-bold text-sky-400">You:</span>
                    <span className="text-white">สีขาว (คนพูด)</span>
                  </span>
                  <span className="text-slate-600">·</span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="font-bold text-emerald-400">AI:</span>
                    <span className="text-yellow-200">สีเหลืองอ่อน (เสียง AI)</span>
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setShowSubtitles((v) => !v)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-slate-200 transition-colors"
                >
                  {showSubtitles ? <Eye size={13} /> : <EyeOff size={13} />}
                  <span>{showSubtitles ? 'กำลังแสดงซับ' : 'ซ่อนซับชั่วคราว'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Collapsible Inline Subtitle Timeline Editor */}
          {showEditorPanel && (
            <div className="w-full lg:w-[370px] border-t lg:border-t-0 lg:border-l border-slate-200 bg-slate-50 flex flex-col max-h-[38vh] lg:max-h-none">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white">
                <span className="text-xs font-bold text-slate-800">
                  รายการซับไตเติ้ล ({subtitles.length} ประโยค)
                </span>
                <button
                  type="button"
                  onClick={handleAddCue}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-semibold transition-colors"
                >
                  <Plus size={12} />
                  <span>เพิ่มประโยค</span>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {subtitles.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-8">
                    ยังไม่มีรายการซับไตเติ้ล กดปุ่มสร้างซับด้านบน หรือกด &ldquo;เพิ่มประโยค&rdquo; ได้เลยครับ
                  </p>
                ) : (
                  subtitles.map((cue) => {
                    const isActive = activeCue?.id === cue.id;
                    const isAI = cue.speaker === 'AI';
                    return (
                      <div
                        key={cue.id}
                        className={`p-2.5 rounded-xl border transition-colors ${
                          isActive
                            ? 'bg-white border-indigo-400 shadow-xs'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1.5 mb-1.5">
                          <div className="flex items-center gap-1.5">
                            {/* Clickable Speaker Switcher */}
                            <button
                              type="button"
                              onClick={() => handleToggleSpeaker(cue.id)}
                              className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-colors ${
                                isAI
                                  ? 'bg-emerald-950 text-emerald-300 hover:bg-emerald-900'
                                  : 'bg-sky-950 text-sky-300 hover:bg-sky-900'
                              }`}
                              title="คลิกเพื่อสลับผู้พูดระหว่าง You กับ AI"
                            >
                              {isAI ? 'AI:' : 'You:'}
                            </button>

                            {/* Clickable Timestamp + Editable End */}
                            <button
                              type="button"
                              onClick={() => jumpToTime(cue.startSec)}
                              className="text-[11px] font-mono tabular-nums text-indigo-600 hover:underline"
                              title="คลิกเพื่อกระโดดไปดูช่วงเวลานี้ในวิดีโอ"
                            >
                              {formatTimePrecise(cue.startSec)}
                            </button>
                            <span className="text-[10px] text-slate-400">–</span>
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              value={cue.endSec}
                              onChange={(e) =>
                                handleUpdateCueTime(cue.id, 'endSec', e.target.value)
                              }
                              className="w-12 px-1 py-0.5 text-[11px] font-mono tabular-nums text-slate-600 bg-slate-50 border border-slate-200 rounded"
                              title="เวลาจบ (วินาที)"
                            />
                            <span className="text-[10px] text-slate-400">วิ</span>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleDeleteCue(cue.id)}
                            className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                            title="ลบประโยคนี้"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>

                        <textarea
                          rows={2}
                          value={cue.text}
                          onChange={(e) => handleUpdateCueText(cue.id, e.target.value)}
                          className="w-full px-2 py-1.5 text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500 resize-none leading-relaxed"
                        />
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Burn-in Export Progress Banner */}
        {isExporting && (
          <div className="px-5 sm:px-6 py-3 bg-slate-900 text-white border-t border-slate-800 flex items-center justify-between gap-4">
            <div className="flex-1 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 font-medium">
                  <Film size={14} className="text-sky-400 animate-pulse" />
                  {exportMode === 'raw'
                    ? 'กำลังจัดรูปแบบเป็นไฟล์ MP4 มาตรฐาน (รองรับ LINE / มือถือ / เลื่อนเวลาได้)...'
                    : 'กำลังเรนเดอร์และฝังซับไตเติ้ลเป็นไฟล์ MP4 มาตรฐาน (ลื่นไหล รองรับ LINE / มือถือ)...'}
                </span>
                <span className="font-mono font-bold tabular-nums text-sky-300">
                  {exportProgress}%
                </span>
              </div>
              <div className="h-1.5 w-full bg-white/15 rounded-full overflow-hidden">
                <div
                  className="h-full bg-sky-400 transition-all duration-150"
                  style={{ width: `${exportProgress}%` }}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleCancelExport}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold whitespace-nowrap transition-colors"
            >
              ยกเลิก
            </button>
          </div>
        )}

        {/* Quiet tip if tab audio was omitted (Desktop studio only) */}
        {!isExternalUpload && includeAppAudio && !clip.hasTabAudio && !isExporting && (
          <div className="px-5 sm:px-6 py-2 bg-amber-50 border-t border-amber-200 text-xs text-amber-900">
            หมายเหตุ: คลิปนี้บันทึกเฉพาะเสียงไมโครโฟน หากต้องการให้มีเสียง AI ในแอปร่วมด้วย ให้ติ๊ก &ldquo;แชร์เสียงของแท็บนี้ด้วย&rdquo; ตอนเลือกหน้าจอในครั้งถัดไป
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-6 py-4 bg-slate-50 border-t border-slate-200">
          <button
            type="button"
            onClick={onRecordAgain}
            disabled={isExporting || isGenerating}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <RotateCcw size={14} />
            <span>{replaceLabel}</span>
          </button>

          <div className="flex flex-wrap items-center gap-2">
            {!isExternalUpload && (
              <button
                type="button"
                onClick={handleDownloadStandardRawVideo}
                disabled={isExporting || isGenerating}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-50 text-slate-800 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
              >
                <Download size={14} />
                <span>ดาวน์โหลดคลิปไม่มีซับ (MP4)</span>
              </button>
            )}

            {subtitles.length > 0 && (
              <button
                type="button"
                onClick={handleExportSubtitledVideo}
                disabled={isExporting || isGenerating}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-700 hover:bg-indigo-800 disabled:opacity-50 text-white text-xs font-bold shadow-md transition-colors whitespace-nowrap cursor-pointer"
              >
                <Captions size={15} />
                <span>ดาวน์โหลดพร้อมฝังซับไตเติ้ล</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Insufficient Credits Modal */}
      <InsufficientCreditsModal
        isOpen={showInsufficientModal}
        onClose={() => setShowInsufficientModal(false)}
        reasonText={`โหมด Gemini AI ใช้ ${SUBTITLE_CREDIT_COST} เครดิตต่อครั้ง — เครดิตของคุณไม่เพียงพอ สามารถอัปเกรดแพลน เติมเครดิต เชื่อม BYOK (ฟรี 1 คลิป/วัน ≤ 5 นาที) หรือเลือกใช้โหมด "ฟรีบนเครื่อง (0 เครดิต)" แทนได้ครับ`}
        onUpgradePlan={() => {
          setShowInsufficientModal(false);
          window.dispatchEvent(
            new CustomEvent('open-subscription-modal', { detail: { tab: 'tiers' } })
          );
        }}
        onTopupCredits={() => {
          setShowInsufficientModal(false);
          window.dispatchEvent(
            new CustomEvent('open-subscription-modal', { detail: { tab: 'topup' } })
          );
        }}
      />

      {/* BYOK Daily Quota / Google 429 Fallback Modal */}
      <ByokQuotaFallbackModal
        isOpen={fallbackModal.open}
        onClose={() => setFallbackModal((prev) => ({ ...prev, open: false }))}
        feature="video_subtitle"
        reason={fallbackModal.reason}
        creditCost={SUBTITLE_CREDIT_COST}
        isBusy={isGenerating}
        onUseCredits={() => {
          setFallbackModal((prev) => ({ ...prev, open: false }));
          handleGenerateSubtitles(true);
        }}
      />
    </div>
  );
}
