import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  X,
  Camera,
  Smartphone,
  FlipHorizontal2,
  EyeOff,
  Eye,
  Captions,
  AlertTriangle,
  Sparkles,
  Image as ImageIcon,
  CheckCircle2,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import CameraFeedView from './CameraFeedView';
import FloatingFacecam from './FloatingFacecam';
import {
  BG_PRESETS,
  BgEffectId,
  CAM_FILTER_PRESETS,
  CamFilterId,
  CamMode,
  CamSize,
} from './types';

interface MobileCameraOverlayProps {
  openTrigger: number;
  onActiveStateChange?: (active: boolean) => void;
  onOpenStandaloneSubtitles?: () => void;
}

const SIZE_ORDER: CamSize[] = ['sm', 'md', 'lg'];
const SIZE_LABELS: Record<CamSize, string> = { sm: 'S', md: 'M', lg: 'L' };

/**
 * Dedicated iPad / Mobile Floating Camera Mode (Video-Only — ZERO Audio/Screen Capture).
 * Users record their screen + microphone natively via iPadOS/iOS/Android Control Center
 * while this overlay provides the exact same draggable circular real-time facecam bubble
 * on the bottom-left across all tabs in Polyglot AI Tutor.
 */
export default function MobileCameraOverlay({
  openTrigger,
  onActiveStateChange,
  onOpenStandaloneSubtitles,
}: MobileCameraOverlayProps) {
  const [phase, setPhase] = useState<'idle' | 'setup' | 'active'>('idle');
  const [camStream, setCamStream] = useState<MediaStream | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);

  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [camMode, setCamMode] = useState<CamMode>('circle');
  const [camSize, setCamSize] = useState<CamSize>('sm');
  const [isMirrored, setIsMirrored] = useState(true);
  const [bgEffect, setBgEffect] = useState<BgEffectId>('none');
  const [customBgUrl, setCustomBgUrl] = useState<string | null>(null);
  const [filterId, setFilterId] = useState<CamFilterId>('none');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isControlsHidden, setIsControlsHidden] = useState(false);
  const [showBgPopover, setShowBgPopover] = useState(false);

  const customBgInputRef = useRef<HTMLInputElement | null>(null);

  const stopCamera = useCallback(() => {
    if (camStreamRef.current) {
      camStreamRef.current.getTracks().forEach((t) => t.stop());
      camStreamRef.current = null;
    }
    setCamStream(null);
  }, []);

  // STRICTLY VIDEO-ONLY: never requests audio so iOS/iPadOS/Android native Screen Recording
  // and AI Video Calls keep 100% exclusive access to the device microphone!
  const initFrontCameraOnly = useCallback(
    async (deviceId?: string) => {
      setErrorMsg(null);
      stopCamera();

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setErrorMsg(
          'เบราว์เซอร์นี้ไม่รองรับการเปิดกล้อง กรุณาเปิดผ่าน Safari (iPad/iPhone) หรือ Chrome (Android)'
        );
        return;
      }

      try {
        const videoConstraint: MediaTrackConstraints = deviceId
          ? {
              deviceId: { exact: deviceId },
              width: { ideal: 720 },
              height: { ideal: 720 },
            }
          : {
              facingMode: 'user',
              width: { ideal: 720 },
              height: { ideal: 720 },
            };

        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraint,
          audio: false,
        });

        camStreamRef.current = stream;
        setCamStream(stream);

        try {
          const allDevices = await navigator.mediaDevices.enumerateDevices();
          const videoInputs = allDevices.filter((d) => d.kind === 'videoinput');
          setCameras(videoInputs);
          if (!deviceId && videoInputs.length > 0) {
            const activeTrackId = stream.getVideoTracks()[0]?.getSettings()?.deviceId;
            if (activeTrackId) setSelectedCameraId(activeTrackId);
          }
        } catch {
          // ignore enumeration errors
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '';
        if (msg.toLowerCase().includes('denied') || msg.toLowerCase().includes('permission')) {
          setErrorMsg(
            'ยังไม่ได้อนุญาตสิทธิ์กล้อง กรุณากดอนุญาตกล้อง (Camera) ในเบราว์เซอร์แล้วลองใหม่อีกครั้ง'
          );
        } else {
          setErrorMsg(
            'ไม่สามารถเปิดกล้องหน้าได้ กรุณาตรวจสอบว่าไม่มีแอปอื่นใช้งานกล้องอยู่ แล้วลองใหม่อีกครั้ง'
          );
        }
      }
    },
    [stopCamera]
  );

  // Open setup modal whenever parent increments openTrigger
  const prevTriggerRef = useRef(openTrigger);
  useEffect(() => {
    if (openTrigger > prevTriggerRef.current) {
      prevTriggerRef.current = openTrigger;
      if (phase === 'idle') {
        setPhase('setup');
        setCamMode('circle');
        setIsControlsHidden(false);
        setShowBgPopover(false);
        initFrontCameraOnly(selectedCameraId || undefined);
      } else if (phase === 'active') {
        setIsControlsHidden(false);
      }
    }
  }, [openTrigger, phase, initFrontCameraOnly, selectedCameraId]);

  useEffect(() => {
    onActiveStateChange?.(phase === 'active');
  }, [phase, onActiveStateChange]);

  // Cleanup camera & custom bg object URL on unmount
  useEffect(() => {
    return () => {
      stopCamera();
      if (customBgUrl) URL.revokeObjectURL(customBgUrl);
    };
  }, [stopCamera, customBgUrl]);

  const handleClose = () => {
    stopCamera();
    setShowBgPopover(false);
    setErrorMsg(null);
    setPhase('idle');
  };

  const handleActivateOverlay = () => {
    if (!camStream) return;
    setCamMode('circle');
    setIsControlsHidden(false);
    setShowBgPopover(false);
    setPhase('active');
  };

  const handleCustomBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (customBgUrl) URL.revokeObjectURL(customBgUrl);
    const url = URL.createObjectURL(file);
    setCustomBgUrl(url);
    setBgEffect('custom');
  };

  const handleOpenSubtitlesAfterRecord = () => {
    stopCamera();
    setShowBgPopover(false);
    setPhase('idle');
    onOpenStandaloneSubtitles?.();
  };

  const cycleSize = () => {
    const idx = SIZE_ORDER.indexOf(camSize);
    setCamSize(SIZE_ORDER[(idx + 1) % SIZE_ORDER.length]);
  };

  if (phase === 'idle') return null;

  return (
    <>
      <input
        ref={customBgInputRef}
        type="file"
        accept="image/*"
        onChange={handleCustomBgUpload}
        className="hidden"
      />

      {/* ── 1. PRE-FLIGHT SETUP & NATIVE SCREEN RECORDING NOTICE MODAL ── */}
      {phase === 'setup' && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[93vh]">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 px-5 sm:px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center shrink-0">
                  <Smartphone size={20} className="text-sky-300" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold tracking-tight">
                    โหมดกล้องอัดคลิปสำหรับ iPad / โทรศัพท์มือถือ
                  </h2>
                  <p className="text-xs text-slate-300 mt-0.5">
                    เปิดกล้องวงกลมเรียลไทม์มุมซ้ายล่าง — ผู้ใช้กดอัดหน้าจอและเปิดไมค์จากเครื่องเองเท่านั้น
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="ปิดหน้าต่าง"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-5">
              {/* Explicit Mandatory Notice Banner */}
              <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-300/90 text-amber-950 space-y-2">
                <div className="flex items-center gap-2 font-extrabold text-sm text-amber-900">
                  <AlertTriangle size={17} className="text-amber-600 shrink-0" />
                  <span>โหมดนี้ต้องกดอัดหน้าจอและเปิดไมค์จากเครื่องเองเท่านั้น</span>
                </div>
                <p className="text-xs text-amber-900/90 leading-relaxed">
                  แอปจะเปิดเฉพาะ <strong>กล้องวงกลมเรียลไทม์ด้านซ้ายล่าง</strong> โดยจะ <strong>ไม่มีการอัดเสียงหรืออัดวิดีโอในเว็บ</strong> เพื่อไม่ให้แย่งไมโครโฟนจากระบบอัดหน้าจอของ iPad / iPhone / Android และไม่รบกวนเสียงตอนวิดีโอคอลกับ AI ครับ
                </p>
              </div>

              {/* Concise 3-step native recording guide */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <div className="font-bold text-indigo-700 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[11px] font-black">
                      1
                    </span>
                    <span>เปิดกล้องวงกลม</span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-snug">
                    ปรับขนาด/ฉากหลังด้านล่าง แล้วกดปุ่มเปิดกล้อง กล้องจะลอยอยู่มุมซ้ายล่างทุกหน้าในแอป
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <div className="font-bold text-indigo-700 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[11px] font-black">
                      2
                    </span>
                    <span>อัดหน้าจอ + เปิดไมค์เอง</span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-snug">
                    ปัดศูนย์ควบคุม (Control Center) ของเครื่อง กดค้างปุ่มอัดหน้าจอเพื่อ <strong>เปิดไมค์</strong> แล้วเริ่มอัดได้เลย
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <div className="font-bold text-indigo-700 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[11px] font-black">
                      3
                    </span>
                    <span>โยนคลิปใส่ซับ (ฟรี / 5 Cr)</span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-snug">
                    เมื่ออัดเสร็จ กดปุ่ม <strong>&ldquo;ใส่ซับวิดีโอ&rdquo;</strong> เลือกใส่ซับ<strong>ฟรีบนเครื่อง (0 Cr)</strong> หรือ <strong>Gemini AI (5 Cr)</strong> ได้ทันที
                  </p>
                </div>
              </div>

              {errorMsg && (
                <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs">
                  <AlertTriangle size={15} className="text-red-600 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Camera Preview + Quick Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-start">
                {/* Circular Preview */}
                <div className="sm:col-span-5 flex flex-col items-center gap-2.5">
                  <div className="w-full aspect-square max-w-[210px] rounded-2xl bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden border border-slate-200">
                    {camStream ? (
                      <div className="w-40 h-40 rounded-full overflow-hidden ring-2 ring-white shadow-xl">
                        <CameraFeedView
                          stream={camStream}
                          bgEffect={bgEffect}
                          customBgUrl={customBgUrl}
                          filterId={filterId}
                          isMirrored={isMirrored}
                          highRes={false}
                        />
                      </div>
                    ) : (
                      <div className="text-center text-slate-400 text-xs px-3">
                        <Camera size={26} className="mx-auto mb-2 opacity-60" />
                        <span>กำลังเปิดกล้องหน้า...</span>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => setIsMirrored((m) => !m)}
                      className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-white text-[11px] font-medium border border-white/15"
                    >
                      <FlipHorizontal2 size={12} />
                      <span>กลับด้าน</span>
                    </button>
                  </div>

                  <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
                    <CheckCircle2 size={12} />
                    <span>เปิดเฉพาะกล้องหน้า (ไม่ดึงไมค์เครื่อง)</span>
                  </div>
                </div>

                {/* Settings */}
                <div className="sm:col-span-7 space-y-3.5">
                  {cameras.length > 1 && (
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-slate-700">
                        เลือกกล้อง
                      </label>
                      <select
                        value={selectedCameraId}
                        onChange={(e) => {
                          setSelectedCameraId(e.target.value);
                          initFrontCameraOnly(e.target.value);
                        }}
                        className="w-full px-3 py-2 text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-xl"
                      >
                        {cameras.map((cam, idx) => (
                          <option key={cam.deviceId || idx} value={cam.deviceId}>
                            {cam.label || `กล้อง ${idx + 1}`}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Circle Size */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700">
                      ขนาดวงกลมกล้องมุมซ้ายล่าง
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {SIZE_ORDER.map((sz) => (
                        <button
                          key={sz}
                          type="button"
                          onClick={() => setCamSize(sz)}
                          className={`py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                            camSize === sz
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          ขนาด {SIZE_LABELS[sz]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Background presets */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700">
                      ฉากหลังกล้อง
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {BG_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => setBgEffect(preset.id)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                            bgEffect === preset.id
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => customBgInputRef.current?.click()}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                          bgEffect === 'custom'
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <ImageIcon size={11} />
                        <span>รูปเอง</span>
                      </button>
                    </div>
                  </div>

                  {/* Filters */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700">
                      โทนสี / ฟิลเตอร์
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {(Object.keys(CAM_FILTER_PRESETS) as CamFilterId[]).map(
                        (fid) => (
                          <button
                            key={fid}
                            type="button"
                            onClick={() => setFilterId(fid)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                              filterId === fid
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            {CAM_FILTER_PRESETS[fid].label}
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-6 py-4 bg-slate-50 border-t border-slate-200">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 transition-colors"
              >
                ยกเลิก
              </button>

              <button
                type="button"
                onClick={handleActivateOverlay}
                disabled={!camStream}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-45 text-white text-xs sm:text-sm font-bold shadow-md transition-all cursor-pointer"
              >
                <Camera size={16} />
                <span>เปิดกล้องวงกลมลอย (พร้อมอัดหน้าจอเอง)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 2. ACTIVE FLOATING CIRCULAR FACECAM (Bottom-Left, Draggable, Resizable) ── */}
      {phase === 'active' && (
        <>
          <FloatingFacecam
            stream={camStream}
            mode={camMode}
            size={camSize}
            bgEffect={bgEffect}
            customBgUrl={customBgUrl}
            filterId={filterId}
            isMirrored={isMirrored}
            onModeChange={setCamMode}
            onSizeChange={setCamSize}
            onToggleMirror={() => setIsMirrored((m) => !m)}
          />

          {/* Compact Hideable Mini-Control Pill (Top-Right, out of the way for clean screen recording) */}
          {isControlsHidden ? (
            <button
              type="button"
              onClick={() => setIsControlsHidden(false)}
              className="fixed top-3 right-3 z-[98] flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-slate-900/65 hover:bg-slate-900/90 text-white text-[11px] font-semibold backdrop-blur-md border border-white/15 shadow-lg transition-all"
              title="แสดงแถบควบคุมกล้อง iPad/มือถือ"
            >
              <Eye size={13} className="text-sky-300" />
              <span>กล้อง</span>
            </button>
          ) : (
            <div className="fixed top-3 right-3 z-[98] flex flex-col items-end gap-2">
              <div className="flex flex-wrap items-center gap-1.5 px-2.5 py-1.5 rounded-2xl bg-slate-900/90 text-white border border-white/15 shadow-2xl backdrop-blur-md text-xs">
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-sky-500/20 text-sky-300 font-bold text-[11px]">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>อัดจอจากเครื่องเอง</span>
                </span>

                <button
                  type="button"
                  onClick={cycleSize}
                  className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 font-mono font-bold text-[11px]"
                  title="เปลี่ยนขนาดกล้องวงกลม"
                >
                  {SIZE_LABELS[camSize]}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setCamMode((m) => (m === 'fullscreen' ? 'circle' : 'fullscreen'))
                  }
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20"
                  title={camMode === 'fullscreen' ? 'ย่อเป็นวงกลม' : 'ขยายเต็มจอ'}
                >
                  {camMode === 'fullscreen' ? (
                    <Minimize2 size={13} />
                  ) : (
                    <Maximize2 size={13} />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setShowBgPopover((v) => !v)}
                  className={`p-1.5 rounded-lg transition-colors ${
                    showBgPopover
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white/10 hover:bg-white/20'
                  }`}
                  title="ฉากหลัง & ฟิลเตอร์"
                >
                  <Sparkles size={13} />
                </button>

                <button
                  type="button"
                  onClick={handleOpenSubtitlesAfterRecord}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] whitespace-nowrap"
                  title="นำคลิปที่อัดเสร็จแล้วมาใส่ซับอัตโนมัติ (ฟรีบนเครื่อง หรือ Gemini AI 5 เครดิต)"
                >
                  <Captions size={12} />
                  <span>ใส่ซับวิดีโอ</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowBgPopover(false);
                    setIsControlsHidden(true);
                  }}
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white"
                  title="ซ่อนแถบปุ่มนี้ขณะอัดหน้าจอ"
                >
                  <EyeOff size={13} />
                </button>

                <button
                  type="button"
                  onClick={handleClose}
                  className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-[11px] whitespace-nowrap"
                  title="ปิดกล้องวงกลม"
                >
                  ปิดกล้อง
                </button>
              </div>

              {/* Quick Background & Filter Popover */}
              {showBgPopover && (
                <div className="w-72 p-3.5 rounded-2xl bg-slate-900/95 text-white border border-white/15 shadow-2xl backdrop-blur-md space-y-3 text-xs">
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-bold text-slate-300">
                      ฉากหลังกล้อง
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {BG_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => setBgEffect(preset.id)}
                          className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                            bgEffect === preset.id
                              ? 'bg-indigo-600 text-white'
                              : 'bg-white/10 hover:bg-white/20 text-slate-200'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => customBgInputRef.current?.click()}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold ${
                          bgEffect === 'custom'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-white/10 hover:bg-white/20 text-slate-200'
                        }`}
                      >
                        <ImageIcon size={11} />
                        <span>รูปเอง</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-[11px] font-bold text-slate-300">
                      ฟิลเตอร์ภาพ
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(Object.keys(CAM_FILTER_PRESETS) as CamFilterId[]).map(
                        (fid) => (
                          <button
                            key={fid}
                            type="button"
                            onClick={() => setFilterId(fid)}
                            className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                              filterId === fid
                                ? 'bg-indigo-600 text-white'
                                : 'bg-white/10 hover:bg-white/20 text-slate-200'
                            }`}
                          >
                            {CAM_FILTER_PRESETS[fid].label}
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}
