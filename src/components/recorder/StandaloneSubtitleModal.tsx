import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Upload,
  Captions,
  Zap,
  Sparkles,
  Film,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import {
  getTotalCredits,
  loadUserSubscription,
} from '../../services/subscriptionService';
import SubtitlePreviewModal from './SubtitlePreviewModal';
import { RecordedClip, buildExportFilename } from './types';

interface StandaloneSubtitleModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SUBTITLE_CREDIT_COST = 5;

function inferExtension(file: File): 'mp4' | 'webm' {
  const lower = (file.name || '').toLowerCase();
  if (lower.endsWith('.webm') || file.type.includes('webm')) return 'webm';
  return 'mp4';
}

function readVideoMetadata(
  url: string
): Promise<{ durationSec: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    const timer = window.setTimeout(() => {
      cleanup();
      resolve({ durationSec: 0, width: 0, height: 0 });
    }, 8000);

    const cleanup = () => {
      window.clearTimeout(timer);
      video.onloadedmetadata = null;
      video.onerror = null;
      video.src = '';
    };

    video.onloadedmetadata = () => {
      const durationSec = Number.isFinite(video.duration) ? video.duration : 0;
      const width = video.videoWidth || 0;
      const height = video.videoHeight || 0;
      cleanup();
      resolve({ durationSec, width, height });
    };

    video.onerror = () => {
      cleanup();
      reject(new Error('ไม่สามารถอ่านไฟล์วิดีโอนี้ได้ กรุณาเลือกไฟล์ .mp4, .mov หรือ .webm'));
    };

    video.src = url;
  });
}

export default function StandaloneSubtitleModal({
  isOpen,
  onClose,
}: StandaloneSubtitleModalProps) {
  const [uploadedClip, setUploadedClip] = useState<RecordedClip | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let mounted = true;
    loadUserSubscription()
      .then((sub) => {
        if (mounted) setCreditBalance(getTotalCredits(sub));
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [isOpen]);

  // Revoke object URL on cleanup
  useEffect(() => {
    return () => {
      if (uploadedClip?.url) {
        URL.revokeObjectURL(uploadedClip.url);
      }
    };
  }, [uploadedClip]);

  if (!isOpen) return null;

  const handleFile = async (file: File | null | undefined) => {
    if (!file) return;
    setErrorMsg(null);

    const isVideoMime = file.type.startsWith('video/');
    const isVideoExt = /\.(mp4|mov|webm|m4v|mkv)$/i.test(file.name || '');
    if (!isVideoMime && !isVideoExt) {
      setErrorMsg('กรุณาเลือกไฟล์วิดีโอเท่านั้น (รองรับ .mp4, .mov, .webm)');
      return;
    }

    setIsLoadingFile(true);
    const objectUrl = URL.createObjectURL(file);

    try {
      const meta = await readVideoMetadata(objectUrl);
      const qualityLabel =
        meta.height >= 1080
          ? '1080p'
          : meta.height >= 720
          ? '720p'
          : meta.width > 0
          ? `${meta.width}x${meta.height}`
          : 'ต้นฉบับ';

      const clip: RecordedClip = {
        blob: file,
        url: objectUrl,
        mimeType: file.type || 'video/mp4',
        extension: inferExtension(file),
        durationSec: meta.durationSec,
        sizeBytes: file.size,
        qualityLabel,
        hasTabAudio: true,
        createdAt: new Date(),
      };

      setUploadedClip(clip);
    } catch (err: unknown) {
      URL.revokeObjectURL(objectUrl);
      const msg = err instanceof Error ? err.message : 'ไม่สามารถเปิดไฟล์วิดีโอได้';
      setErrorMsg(msg);
    } finally {
      setIsLoadingFile(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    handleFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files?.[0];
    handleFile(file);
  };

  const handleDownloadRaw = () => {
    if (!uploadedClip) return;
    const a = document.createElement('a');
    a.href = uploadedClip.url;
    a.download = buildExportFilename(uploadedClip.extension, uploadedClip.createdAt);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleResetClip = () => {
    setUploadedClip(null);
    setErrorMsg(null);
  };

  const handleCloseAll = () => {
    setUploadedClip(null);
    setErrorMsg(null);
    onClose();
  };

  // Once a video file is chosen, hand off directly to SubtitlePreviewModal
  if (uploadedClip) {
    return (
      <SubtitlePreviewModal
        clip={uploadedClip}
        includeAppAudio={false}
        isExternalUpload={true}
        modalTitle="ใส่ซับวิดีโออัตโนมัติ (วิดีโอจากเครื่อง)"
        replaceLabel="เปลี่ยนไฟล์วิดีโอ"
        onDownloadRaw={handleDownloadRaw}
        onRecordAgain={handleResetClip}
        onClose={handleCloseAll}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
      <div className="w-full max-w-xl bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 py-5 bg-gradient-to-r from-indigo-700 via-indigo-800 to-slate-900 text-white">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
              <Captions size={22} className="text-sky-300" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold tracking-tight">
                  ใส่ซับวิดีโออัตโนมัติ
                </h2>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-400 text-slate-950 text-[11px] font-black">
                  ฟรีบนเครื่อง (0 Cr)
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-400 text-slate-950 text-[11px] font-black">
                  <Zap size={11} /> Gemini AI ({SUBTITLE_CREDIT_COST} Cr)
                </span>
              </div>
              <p className="text-xs text-indigo-100/90 mt-1 leading-relaxed">
                โยนไฟล์วิดีโอใดก็ได้จากคอมพิวเตอร์ iPad หรือมือถือ ไม่จำเป็นต้องอัดจากในแอป
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCloseAll}
            className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="ปิดหน้าต่าง"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Error Banner */}
          {errorMsg && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs leading-relaxed">
              <AlertTriangle size={16} className="text-red-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Drag & Drop / File Picker Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingOver(true);
            }}
            onDragLeave={() => setIsDraggingOver(false)}
            onDrop={handleDrop}
            onClick={() => !isLoadingFile && fileInputRef.current?.click()}
            className={`relative rounded-2xl border-2 border-dashed p-8 text-center transition-all cursor-pointer ${
              isDraggingOver
                ? 'border-indigo-500 bg-indigo-50/80 scale-[1.01]'
                : 'border-slate-300 bg-slate-50/80 hover:border-indigo-400 hover:bg-indigo-50/40'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*,.mp4,.mov,.webm,.m4v"
              onChange={handleInputChange}
              className="hidden"
            />

            {isLoadingFile ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <Loader2 size={32} className="text-indigo-600 animate-spin" />
                <p className="text-sm font-bold text-slate-700">
                  กำลังโหลดวิดีโอ...
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center shadow-xs">
                  <Upload size={26} />
                </div>
                <div>
                  <p className="text-base font-bold text-slate-900">
                    คลิกเลือกไฟล์วิดีโอ หรือลากไฟล์มาวางที่นี่
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    รองรับไฟล์ <span className="font-mono font-semibold">.MP4</span>,{' '}
                    <span className="font-mono font-semibold">.MOV</span>,{' '}
                    <span className="font-mono font-semibold">.WEBM</span> (คลิปที่อัดหน้าจอจาก iPad / iPhone / Android หรือคอมพิวเตอร์)
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold shadow-sm mt-1">
                  <Film size={14} className="text-sky-400" />
                  <span>เลือกไฟล์วิดีโอจากเครื่อง</span>
                </span>
              </div>
            )}
          </div>

          {/* Feature & Pricing Summary */}
          <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-2.5 text-xs text-slate-700">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200/80">
              <span className="font-bold text-slate-900 flex items-center gap-1.5">
                <Sparkles size={14} className="text-indigo-600" />
                เลือกได้ 2 โหมดตามความสะดวก
              </span>
              {creditBalance !== null && (
                <span className="font-semibold tabular-nums text-slate-600">
                  เครดิตของคุณ:{' '}
                  <strong
                    className={
                      creditBalance < SUBTITLE_CREDIT_COST
                        ? 'text-rose-600'
                        : 'text-emerald-700'
                    }
                  >
                    {creditBalance} เครดิต
                  </strong>
                </span>
              )}
            </div>

            <div className="flex items-start gap-2">
              <CheckCircle2 size={14} className="text-indigo-600 shrink-0 mt-0.5" />
              <span>
                <strong>Gemini AI ({SUBTITLE_CREDIT_COST} เครดิต / ครั้ง):</strong> ประมวลผลไว แม่นยำสูง แยกผู้พูด You / AI อัตโนมัติ (หักเครดิตเฉพาะเมื่อสำเร็จ)
              </span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 size={14} className="text-emerald-600 shrink-0 mt-0.5" />
              <span>
                <strong>ทำซับฟรีบนเครื่อง (0 เครดิต):</strong> ใช้เครื่องของคุณเองในการถอดเสียง ฟรี 100% (ความเร็วขึ้นอยู่กับสเปกเครื่องของคุณ อาจต้องรอสักครู่)
              </span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 size={14} className="text-sky-600 shrink-0 mt-0.5" />
              <span>
                แก้ไขคำผิด ปรับช่วงเวลา สลับชื่อผู้พูด และส่งออกไฟล์วิดีโอ MP4 ฝังซับที่ <strong>ซิงค์ภาพกับเสียงตรงกันเป๊ะ</strong> ได้ทันที
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
