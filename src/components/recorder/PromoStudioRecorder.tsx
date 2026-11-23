import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Video,
  Mic,
  Volume2,
  X,
  FlipHorizontal2,
  Maximize2,
  Circle,
  AlertTriangle,
  ExternalLink,
  Keyboard,
  Image as ImageIcon,
  Upload,
} from 'lucide-react';
import CameraFeedView from './CameraFeedView';
import FloatingFacecam from './FloatingFacecam';
import StudioControlDock from './StudioControlDock';
import SubtitlePreviewModal from './SubtitlePreviewModal';
import { subscribeAppSpeech } from '../../services/appSpeechBus';
import {
  BG_PRESETS,
  BgEffectId,
  CAM_FILTER_PRESETS,
  CamFilterId,
  CamMode,
  CamSize,
  RecordedClip,
  RecorderPhase,
  SubtitleCue,
  VideoQuality,
  buildExportFilename,
  pickSupportedMimeType,
} from './types';

function pickSupportedAudioMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
}

interface PromoStudioRecorderProps {
  openTrigger: number;
  onActiveStateChange?: (isActive: boolean) => void;
}

export default function PromoStudioRecorder({
  openTrigger,
  onActiveStateChange,
}: PromoStudioRecorderProps) {
  const [phase, setPhase] = useState<RecorderPhase>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Media devices & preferences
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [selectedMicId, setSelectedMicId] = useState<string>('');
  const [isMirrored, setIsMirrored] = useState<boolean>(true);
  const [includeAppAudio, setIncludeAppAudio] = useState<boolean>(true);
  const [quality, setQuality] = useState<VideoQuality>('1080p');

  // Virtual Background & Studio Filter state
  const [bgEffect, setBgEffect] = useState<BgEffectId>('none');
  const [customBgUrl, setCustomBgUrl] = useState<string | null>(null);
  const [filterId, setFilterId] = useState<CamFilterId>('none');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Facecam & dock controls
  const [camMode, setCamMode] = useState<CamMode>('circle');
  const [camSize, setCamSize] = useState<CamSize>('md');
  const [micMuted, setMicMuted] = useState<boolean>(false);
  const [tabAudioMuted, setTabAudioMuted] = useState<boolean>(false);
  const [micLevel, setMicLevel] = useState<number>(0);
  const [hasTabAudio, setHasTabAudio] = useState<boolean>(false);
  const [dockHidden, setDockHidden] = useState<boolean>(false);
  const [showShortcutToast, setShowShortcutToast] = useState<boolean>(false);

  // Countdown & elapsed time
  const [countdownNum, setCountdownNum] = useState<number>(3);
  const [elapsedSec, setElapsedSec] = useState<number>(0);

  // Recorded clip for preview modal
  const [recordedClip, setRecordedClip] = useState<RecordedClip | null>(null);

  // Live camera preview stream stored in state
  const [camStream, setCamStream] = useState<MediaStream | null>(null);

  // Document Picture-in-Picture pop-out window
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const supportsPip =
    typeof window !== 'undefined' && 'documentPictureInPicture' in window;

  // Detect embedded iframe environment
  const isInIframe =
    typeof window !== 'undefined' && window.self !== window.top;

  // Mutable media refs
  const camStreamRef = useRef<MediaStream | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const micGainRef = useRef<GainNode | null>(null);
  const tabGainRef = useRef<GainNode | null>(null);
  const meterCtxRef = useRef<AudioContext | null>(null);
  const meterRafRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const micTrackRecorderRef = useRef<MediaRecorder | null>(null);
  const appTrackRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const micChunksRef = useRef<Blob[]>([]);
  const appChunksRef = useRef<Blob[]>([]);
  const micStopPromiseRef = useRef<Promise<Blob | null> | null>(null);
  const appStopPromiseRef = useRef<Promise<Blob | null> | null>(null);

  // High-precision recording timeline & live in-app AI speech capture (Method 2)
  const recordStartPerfRef = useRef<number>(0);
  const pauseStartedPerfRef = useRef<number | null>(null);
  const totalPausedMsRef = useRef<number>(0);
  const capturedAppCuesRef = useRef<SubtitleCue[]>([]);
  const activeTtsCuesRef = useRef<Map<string, SubtitleCue>>(new Map());
  const speechUnsubRef = useRef<(() => void) | null>(null);

  const elapsedSecRef = useRef<number>(0);
  const activeMimeRef = useRef<{ mimeType: string; extension: 'mp4' | 'webm' }>({
    mimeType: 'video/webm',
    extension: 'webm',
  });
  const hasTabAudioRef = useRef<boolean>(false);
  const isStoppingRef = useRef<boolean>(false);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const getRecordingTimeSec = useCallback(() => {
    if (!recordStartPerfRef.current) return 0;
    const now =
      pauseStartedPerfRef.current !== null
        ? pauseStartedPerfRef.current
        : performance.now();
    return Math.max(0, (now - recordStartPerfRef.current - totalPausedMsRef.current) / 1000);
  }, []);

  useEffect(() => {
    onActiveStateChange?.(phase !== 'idle');
  }, [phase, onActiveStateChange]);

  const stopMicMeter = useCallback(() => {
    if (meterRafRef.current !== null) {
      cancelAnimationFrame(meterRafRef.current);
      meterRafRef.current = null;
    }
    if (meterCtxRef.current) {
      meterCtxRef.current.close().catch(() => {});
      meterCtxRef.current = null;
    }
    setMicLevel(0);
  }, []);

  const startMicMeter = useCallback(
    (stream: MediaStream) => {
      stopMicMeter();
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) return;

      try {
        const AudioContextClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        const ctx = new AudioContextClass();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        const source = ctx.createMediaStreamSource(
          new MediaStream([audioTracks[0]])
        );
        source.connect(analyser);
        meterCtxRef.current = ctx;

        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / data.length);
          const pct = Math.min(100, Math.round(rms * 380));
          setMicLevel(pct);
          meterRafRef.current = requestAnimationFrame(tick);
        };
        meterRafRef.current = requestAnimationFrame(tick);
      } catch {
        // Non-fatal
      }
    },
    [stopMicMeter]
  );

  const stopCameraStream = useCallback(() => {
    stopMicMeter();
    if (camStreamRef.current) {
      camStreamRef.current.getTracks().forEach((t) => t.stop());
      camStreamRef.current = null;
    }
    setCamStream(null);
  }, [stopMicMeter]);

  const stopCaptureResources = useCallback(() => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (displayStreamRef.current) {
      displayStreamRef.current.getTracks().forEach((t) => t.stop());
      displayStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (speechUnsubRef.current) {
      speechUnsubRef.current();
      speechUnsubRef.current = null;
    }
    micGainRef.current = null;
    tabGainRef.current = null;
    mediaRecorderRef.current = null;
    micTrackRecorderRef.current = null;
    appTrackRecorderRef.current = null;
    micStopPromiseRef.current = null;
    appStopPromiseRef.current = null;
  }, []);

  const closePipWindow = useCallback(() => {
    setPipWindow((prev) => {
      if (prev && !prev.closed) {
        try {
          prev.close();
        } catch {
          // ignore
        }
      }
      return null;
    });
  }, []);

  const initCameraAndMic = useCallback(
    async (camId?: string, micId?: string) => {
      setErrorMsg(null);
      stopCameraStream();

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setErrorMsg('เบราว์เซอร์นี้ไม่รองรับการเข้าถึงกล้องและไมโครโฟน');
        return null;
      }

      try {
        const constraints: MediaStreamConstraints = {
          video: camId
            ? {
                deviceId: { exact: camId },
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 },
              }
            : {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 },
                facingMode: 'user',
              },
          audio: micId
            ? {
                deviceId: { exact: micId },
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              }
            : {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              },
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        camStreamRef.current = stream;
        setCamStream(stream);
        startMicMeter(stream);

        const devices = await navigator.mediaDevices.enumerateDevices();
        const cams = devices.filter((d) => d.kind === 'videoinput');
        const mics = devices.filter((d) => d.kind === 'audioinput');
        setCameras(cams);
        setMicrophones(mics);

        const activeVid = stream.getVideoTracks()[0]?.getSettings().deviceId;
        const activeAud = stream.getAudioTracks()[0]?.getSettings().deviceId;
        if (activeVid) setSelectedCameraId(activeVid);
        if (activeAud) setSelectedMicId(activeAud);

        return stream;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (
          message.toLowerCase().includes('permission') ||
          message.toLowerCase().includes('denied') ||
          message.toLowerCase().includes('notallowed')
        ) {
          setErrorMsg(
            'ไม่ได้รับอนุญาตเข้าถึงกล้องหรือไมโครโฟน กรุณากดอนุญาตที่ไอคอนกล้องบนแถบที่อยู่เบราว์เซอร์แล้วลองใหม่'
          );
        } else {
          setErrorMsg(`ไม่สามารถเปิดกล้อง/ไมโครโฟนได้: ${message}`);
        }
        return null;
      }
    },
    [startMicMeter, stopCameraStream]
  );

  // Open Setup Modal whenever parent increments openTrigger
  const prevTriggerRef = useRef<number>(openTrigger);
  useEffect(() => {
    if (openTrigger === prevTriggerRef.current) return;
    prevTriggerRef.current = openTrigger;

    if (phase === 'idle') {
      setPhase('setup');
      setErrorMsg(null);
      setMicMuted(false);
      setTabAudioMuted(false);
      setDockHidden(false);
      initCameraAndMic();
    } else if (phase === 'recording' || phase === 'paused') {
      setDockHidden(false);
    }
  }, [openTrigger, phase, initCameraAndMic]);

  // Cleanup everything on unmount
  useEffect(() => {
    return () => {
      stopCaptureResources();
      stopCameraStream();
      closePipWindow();
    };
  }, [stopCaptureResources, stopCameraStream, closePipWindow]);

  useEffect(() => {
    return () => {
      if (recordedClip?.url) {
        URL.revokeObjectURL(recordedClip.url);
      }
    };
  }, [recordedClip]);

  useEffect(() => {
    return () => {
      if (customBgUrl) {
        URL.revokeObjectURL(customBgUrl);
      }
    };
  }, [customBgUrl]);

  // Elapsed timer while actively recording
  useEffect(() => {
    if (phase !== 'recording') return;
    const id = setInterval(() => {
      elapsedSecRef.current += 1;
      setElapsedSec(elapsedSecRef.current);
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  const handleStopRecording = useCallback(() => {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;

    closePipWindow();
    setDockHidden(false);

    const recorder = mediaRecorderRef.current;
    // Close any open in-app TTS cues at the exact stop timestamp
    const stopTimeSec = getRecordingTimeSec();
    activeTtsCuesRef.current.forEach((cue) => {
      cue.endSec = Number(Math.max(cue.startSec + 0.6, stopTimeSec).toFixed(2));
    });
    activeTtsCuesRef.current.clear();

    // Stop isolated mic & app audio track recorders in lockstep
    const micRec = micTrackRecorderRef.current;
    if (micRec && micRec.state !== 'inactive') {
      try {
        micRec.stop();
      } catch {
        // ignore
      }
    }
    const appRec = appTrackRecorderRef.current;
    if (appRec && appRec.state !== 'inactive') {
      try {
        appRec.stop();
      } catch {
        // ignore
      }
    }

    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        stopCaptureResources();
        stopCameraStream();
        isStoppingRef.current = false;
        setPhase('idle');
      }
    } else {
      stopCaptureResources();
      stopCameraStream();
      isStoppingRef.current = false;
      setPhase('idle');
    }
  }, [closePipWindow, getRecordingTimeSec, stopCaptureResources, stopCameraStream]);

  const handleTogglePause = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    if (recorder.state === 'recording') {
      recorder.pause();
      if (micTrackRecorderRef.current?.state === 'recording') {
        try { micTrackRecorderRef.current.pause(); } catch {}
      }
      if (appTrackRecorderRef.current?.state === 'recording') {
        try { appTrackRecorderRef.current.pause(); } catch {}
      }
      pauseStartedPerfRef.current = performance.now();
      setPhase('paused');
    } else if (recorder.state === 'paused') {
      if (pauseStartedPerfRef.current !== null) {
        totalPausedMsRef.current += performance.now() - pauseStartedPerfRef.current;
        pauseStartedPerfRef.current = null;
      }
      recorder.resume();
      if (micTrackRecorderRef.current?.state === 'paused') {
        try { micTrackRecorderRef.current.resume(); } catch {}
      }
      if (appTrackRecorderRef.current?.state === 'paused') {
        try { appTrackRecorderRef.current.resume(); } catch {}
      }
      setPhase('recording');
    }
  }, []);

  const handleToggleMic = useCallback(() => {
    setMicMuted((prev) => {
      const next = !prev;
      if (micGainRef.current) {
        micGainRef.current.gain.value = next ? 0 : 1;
      }
      if (camStreamRef.current) {
        camStreamRef.current.getAudioTracks().forEach((t) => {
          t.enabled = !next;
        });
      }
      return next;
    });
  }, []);

  const handleToggleTabAudio = useCallback(() => {
    setTabAudioMuted((prev) => {
      const next = !prev;
      if (tabGainRef.current) {
        tabGainRef.current.gain.value = next ? 0 : 1;
      }
      return next;
    });
  }, []);

  const handleToggleCamFullscreen = useCallback(() => {
    setCamMode((prev) => (prev === 'fullscreen' ? 'circle' : 'fullscreen'));
  }, []);

  const handleToggleHideDock = useCallback(() => {
    setDockHidden((prev) => {
      const next = !prev;
      if (next) {
        setShowShortcutToast(true);
        setTimeout(() => setShowShortcutToast(false), 2600);
      }
      return next;
    });
  }, []);

  // Keyboard shortcuts while recording / paused
  useEffect(() => {
    if (phase !== 'recording' && phase !== 'paused') return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      const key = e.key.toLowerCase();

      if (key === 'f') {
        e.preventDefault();
        handleToggleCamFullscreen();
      } else if (key === 'p') {
        e.preventDefault();
        handleTogglePause();
      } else if (key === 'm') {
        e.preventDefault();
        handleToggleMic();
      } else if (key === 'h') {
        e.preventDefault();
        handleToggleHideDock();
      } else if (key === 's') {
        e.preventDefault();
        handleStopRecording();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    phase,
    handleToggleCamFullscreen,
    handleTogglePause,
    handleToggleMic,
    handleToggleHideDock,
    handleStopRecording,
  ]);

  const handleTogglePopout = useCallback(async () => {
    if (pipWindow && !pipWindow.closed) {
      closePipWindow();
      return;
    }

    const docPip = (
      window as unknown as {
        documentPictureInPicture?: {
          requestWindow: (opts: { width: number; height: number }) => Promise<Window>;
        };
      }
    ).documentPictureInPicture;

    if (!docPip) return;

    try {
      const win = await docPip.requestWindow({ width: 560, height: 180 });

      Array.from(document.styleSheets).forEach((sheet) => {
        try {
          if (sheet.href) {
            const link = win.document.createElement('link');
            link.rel = 'stylesheet';
            link.href = sheet.href;
            win.document.head.appendChild(link);
          } else if (sheet.cssRules) {
            const style = win.document.createElement('style');
            style.textContent = Array.from(sheet.cssRules)
              .map((rule) => rule.cssText)
              .join('\n');
            win.document.head.appendChild(style);
          }
        } catch {
          // Ignore cross-origin stylesheet restrictions
        }
      });

      win.document.title = 'Polyglot AI — แถบควบคุมอัดคลิป';
      win.document.body.className =
        'bg-slate-950 text-white m-0 p-2.5 flex items-center justify-center min-h-screen';

      win.addEventListener('pagehide', () => {
        setPipWindow(null);
      });

      setPipWindow(win);
      setDockHidden(false);
    } catch (err) {
      console.warn('Could not open Document PiP controls:', err);
    }
  }, [pipWindow, closePipWindow]);

  const handleUploadCustomBackground = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrorMsg('กรุณาเลือกไฟล์รูปภาพ (.jpg, .png, .webp) สำหรับฉากหลัง');
      return;
    }
    const url = URL.createObjectURL(file);
    setCustomBgUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    setBgEffect('custom');
    setErrorMsg(null);
    e.target.value = '';
  };

  const handleStartRecordingFlow = async () => {
    setErrorMsg(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      setErrorMsg(
        'เบราว์เซอร์นี้ไม่รองรับการอัดหน้าจอ กรุณาใช้ Chrome หรือ Edge บนคอมพิวเตอร์'
      );
      return;
    }

    let activeCamStream = camStreamRef.current;
    if (!activeCamStream) {
      activeCamStream = await initCameraAndMic(selectedCameraId, selectedMicId);
      if (!activeCamStream) return;
    }

    const targetWidth = quality === '1080p' ? 1920 : 1280;
    const targetHeight = quality === '1080p' ? 1080 : 720;

    let displayStream: MediaStream;
    try {
      const displayOptions: DisplayMediaStreamOptions & {
        preferCurrentTab?: boolean;
        selfBrowserSurface?: string;
        surfaceSwitching?: string;
      } = {
        video: {
          width: { ideal: targetWidth },
          height: { ideal: targetHeight },
          frameRate: { ideal: 30, max: 60 },
        },
        audio: includeAppAudio
          ? {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            }
          : false,
        preferCurrentTab: true,
        selfBrowserSurface: 'include',
        surfaceSwitching: 'include',
      };

      displayStream = await navigator.mediaDevices.getDisplayMedia(displayOptions);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('disallowed by permissions policy')) {
        setErrorMsg(
          'ไม่สามารถจับภาพหน้าจอในกรอบพรีวิวนี้ได้ กรุณากดเปิดแอปในแท็บเต็มจอก่อนเริ่มอัดครับ'
        );
      } else if (
        msg.toLowerCase().includes('cancel') ||
        msg.toLowerCase().includes('denied') ||
        msg.toLowerCase().includes('notallowed')
      ) {
        setErrorMsg('ยกเลิกการเลือกหน้าจอแล้ว คุณสามารถกด "เลือกแท็บและเริ่มอัดคลิป" ใหม่ได้ตลอดเวลา');
      } else {
        setErrorMsg(`ไม่สามารถเริ่มจับภาพหน้าจอได้: ${msg}`);
      }
      return;
    }

    displayStreamRef.current = displayStream;

    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const audioCtx = new AudioContextClass();
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume().catch(() => {});
    }
    audioCtxRef.current = audioCtx;
    const destination = audioCtx.createMediaStreamDestination();

    const micAudioTracks = activeCamStream.getAudioTracks();
    const tabAudioTracks = displayStream.getAudioTracks();

    let hasAnyMixedAudio = false;
    let micIsolatedStream: MediaStream | null = null;
    let appIsolatedStream: MediaStream | null = null;

    if (micAudioTracks.length > 0) {
      const micSource = audioCtx.createMediaStreamSource(
        new MediaStream([micAudioTracks[0]])
      );
      const micGain = audioCtx.createGain();
      micGain.gain.value = micMuted ? 0 : 1;
      micSource.connect(micGain);
      micGain.connect(destination);

      // Isolated Mic stream (100% YOU) for zero-token subtitle separation
      const micDest = audioCtx.createMediaStreamDestination();
      micGain.connect(micDest);
      micIsolatedStream = micDest.stream;

      micGainRef.current = micGain;
      hasAnyMixedAudio = true;
    }

    const tabHasAudio = tabAudioTracks.length > 0;
    setHasTabAudio(tabHasAudio);
    hasTabAudioRef.current = tabHasAudio;

    if (tabHasAudio) {
      const tabSource = audioCtx.createMediaStreamSource(
        new MediaStream([tabAudioTracks[0]])
      );
      const tabGain = audioCtx.createGain();
      tabGain.gain.value = tabAudioMuted ? 0 : 1;
      tabSource.connect(tabGain);
      tabGain.connect(destination);

      // Isolated App/Tab audio stream (100% AI) for zero-token subtitle separation
      const tabDest = audioCtx.createMediaStreamDestination();
      tabGain.connect(tabDest);
      appIsolatedStream = tabDest.stream;

      tabGainRef.current = tabGain;
      hasAnyMixedAudio = true;
    }

    const combinedTracks: MediaStreamTrack[] = [
      ...displayStream.getVideoTracks(),
      ...(hasAnyMixedAudio ? destination.stream.getAudioTracks() : []),
    ];
    const combinedStream = new MediaStream(combinedTracks);

    const picked = pickSupportedMimeType();
    const audioMime = pickSupportedAudioMimeType();
    activeMimeRef.current = picked;
    chunksRef.current = [];
    micChunksRef.current = [];
    appChunksRef.current = [];
    capturedAppCuesRef.current = [];
    activeTtsCuesRef.current.clear();
    recordStartPerfRef.current = 0;
    pauseStartedPerfRef.current = null;
    totalPausedMsRef.current = 0;
    elapsedSecRef.current = 0;
    setElapsedSec(0);
    isStoppingRef.current = false;

    // Helper to create lightweight isolated audio track recorder
    const createTrackRecorder = (
      stream: MediaStream | null,
      chunkStore: React.MutableRefObject<Blob[]>
    ): {
      recorder: MediaRecorder | null;
      stopPromise: Promise<Blob | null> | null;
    } => {
      if (!stream || stream.getAudioTracks().length === 0) {
        return { recorder: null, stopPromise: null };
      }
      try {
        const rec = audioMime
          ? new MediaRecorder(stream, { mimeType: audioMime, audioBitsPerSecond: 48_000 })
          : new MediaRecorder(stream);
        rec.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) chunkStore.current.push(ev.data);
        };
        const stopPromise = new Promise<Blob | null>((resolve) => {
          rec.onstop = () => {
            if (chunkStore.current.length === 0) {
              resolve(null);
              return;
            }
            const mime = rec.mimeType || audioMime || 'audio/webm';
            resolve(new Blob(chunkStore.current, { type: mime }));
          };
          rec.onerror = () => resolve(null);
        });
        return { recorder: rec, stopPromise };
      } catch {
        return { recorder: null, stopPromise: null };
      }
    };

    const micTrack = createTrackRecorder(micIsolatedStream, micChunksRef);
    const appTrack = createTrackRecorder(appIsolatedStream, appChunksRef);
    micTrackRecorderRef.current = micTrack.recorder;
    appTrackRecorderRef.current = appTrack.recorder;
    micStopPromiseRef.current = micTrack.stopPromise;
    appStopPromiseRef.current = appTrack.stopPromise;

    let recorder: MediaRecorder;
    try {
      const options: MediaRecorderOptions = {
        videoBitsPerSecond: quality === '1080p' ? 6_000_000 : 3_500_000,
        audioBitsPerSecond: 192_000,
      };
      if (picked.mimeType) {
        options.mimeType = picked.mimeType;
      }
      recorder = new MediaRecorder(combinedStream, options);
    } catch {
      recorder = new MediaRecorder(combinedStream);
    }

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.onstop = async () => {
      const finalMime =
        recorder.mimeType || activeMimeRef.current.mimeType || 'video/webm';
      const finalExt: 'mp4' | 'webm' = finalMime.includes('mp4') ? 'mp4' : 'webm';
      const blob = new Blob(chunksRef.current, { type: finalMime });
      const url = URL.createObjectURL(blob);

      // Ensure auxiliary track recorders settle quickly (with 1.5s safety timeout)
      const settleWithTimeout = (p: Promise<Blob | null> | null) => {
        if (!p) return Promise.resolve<Blob | null>(null);
        return Promise.race([
          p,
          new Promise<Blob | null>((res) => setTimeout(() => res(null), 1500)),
        ]);
      };

      const [micAudioBlob, appAudioBlob] = await Promise.all([
        settleWithTimeout(micStopPromiseRef.current),
        settleWithTimeout(appStopPromiseRef.current),
      ]);

      const capturedAppCues = capturedAppCuesRef.current
        .filter((c) => c.text.trim().length > 0)
        .map((c) => ({ ...c }));

      const clip: RecordedClip = {
        blob,
        url,
        mimeType: finalMime,
        extension: finalExt,
        durationSec: elapsedSecRef.current,
        sizeBytes: blob.size,
        qualityLabel: quality === '1080p' ? '1080p HD' : '720p HD',
        hasTabAudio: hasTabAudioRef.current,
        createdAt: new Date(),
        micAudioBlob,
        appAudioBlob,
        capturedAppCues,
      };

      stopCaptureResources();
      stopCameraStream();
      isStoppingRef.current = false;
      setRecordedClip(clip);
      setPhase('preview');
    };

    mediaRecorderRef.current = recorder;

    const displayVideoTrack = displayStream.getVideoTracks()[0];
    if (displayVideoTrack) {
      displayVideoTrack.onended = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          handleStopRecording();
        }
      };
    }

    setCountdownNum(3);
    setPhase('countdown');

    let remaining = 3;
    countdownTimerRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        setCountdownNum(remaining);
      } else {
        if (countdownTimerRef.current) {
          clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
        }
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'inactive') {
          recordStartPerfRef.current = performance.now();
          pauseStartedPerfRef.current = null;
          totalPausedMsRef.current = 0;

          // Subscribe to in-app AI TTS & Live AI Tutor speech events while recording
          if (speechUnsubRef.current) speechUnsubRef.current();
          speechUnsubRef.current = subscribeAppSpeech((ev) => {
            if (!recordStartPerfRef.current || pauseStartedPerfRef.current !== null) return;
            const tSec = Number(getRecordingTimeSec().toFixed(2));

            if (ev.kind === 'tts-start' && ev.text) {
              const estDur = Math.max(1.4, Math.min(10, ev.text.length * 0.085));
              const cue: SubtitleCue = {
                id: ev.id,
                startSec: tSec,
                endSec: Number((tSec + estDur).toFixed(2)),
                speaker: 'AI',
                text: ev.text,
              };
              activeTtsCuesRef.current.set(ev.id, cue);
              capturedAppCuesRef.current.push(cue);
            } else if (ev.kind === 'tts-end') {
              const cue = activeTtsCuesRef.current.get(ev.id);
              if (cue) {
                cue.endSec = Number(Math.max(cue.startSec + 0.5, tSec).toFixed(2));
                activeTtsCuesRef.current.delete(ev.id);
              }
            } else if (ev.kind === 'live-transcript' && ev.speaker === 'AI' && ev.text) {
              // Merge streaming Live AI Tutor transcript chunks arriving within 2.5s
              const list = capturedAppCuesRef.current;
              const last = list[list.length - 1];
              if (
                last &&
                last.id.startsWith('live_ai_') &&
                tSec - last.endSec <= 2.2 &&
                last.text.length + ev.text.length <= 75
              ) {
                const needsSpace =
                  !/[\u0E00-\u0E7F\u4E00-\u9FFF]$/.test(last.text) &&
                  !/^[\u0E00-\u0E7F\u4E00-\u9FFF]/.test(ev.text);
                last.text = `${last.text}${needsSpace ? ' ' : ''}${ev.text}`.trim();
                last.endSec = Number(Math.max(last.startSec + 1.2, tSec + 1.2).toFixed(2));
              } else {
                const estDur = Math.max(1.5, Math.min(5, ev.text.length * 0.09));
                list.push({
                  id: `live_ai_${list.length}_${Math.round(tSec * 10)}`,
                  startSec: Math.max(0, Number((tSec - 0.35).toFixed(2))),
                  endSec: Number((tSec + estDur).toFixed(2)),
                  speaker: 'AI',
                  text: ev.text,
                });
              }
            }
          });

          mediaRecorderRef.current.start(500);
          if (micTrackRecorderRef.current?.state === 'inactive') {
            try { micTrackRecorderRef.current.start(500); } catch {}
          }
          if (appTrackRecorderRef.current?.state === 'inactive') {
            try { appTrackRecorderRef.current.start(500); } catch {}
          }
          setPhase('recording');
        }
      }
    }, 1000);
  };

  const handleCloseSetup = () => {
    stopCaptureResources();
    stopCameraStream();
    setErrorMsg(null);
    setPhase('idle');
  };

  const handleDownloadRawClip = () => {
    if (!recordedClip) return;
    const filename = buildExportFilename(recordedClip.extension, recordedClip.createdAt);
    const a = document.createElement('a');
    a.href = recordedClip.url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleRecordAgain = () => {
    setRecordedClip(null);
    setPhase('setup');
    initCameraAndMic(selectedCameraId, selectedMicId);
  };

  const handleClosePreview = () => {
    setRecordedClip(null);
    setPhase('idle');
  };

  if (phase === 'idle') {
    return null;
  }

  return (
    <>
      {/* ── 1. PRE-FLIGHT STUDIO SETUP MODAL ── */}
      {phase === 'setup' && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="w-full max-w-3xl bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[94vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                  สตูดิโออัดคลิปพร้อมกล้องวงกลม (สำหรับคอมพิวเตอร์)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  เลือกฉากหลังและฟิลเตอร์กล้อง อัดหน้าจอพร้อมเสียงไมค์และเสียง AI แล้วสร้างซับไตเติ้ลได้ทั้งแบบฟรีบนเครื่อง (0 เครดิต) หรือ Gemini AI (5 เครดิต) ทันที
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseSetup}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                aria-label="ปิดหน้าต่างตั้งค่า"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5">
              {/* Embedded iframe notice */}
              {isInIframe && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
                  <div className="flex items-start gap-2.5 text-xs leading-relaxed">
                    <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                    <span>
                      คุณกำลังเปิดผ่านหน้าต่างพรีวิว (Iframe) ซึ่งอาจบล็อกการอัดหน้าจอ แนะนำให้เปิดแอปในแท็บเต็มจอของ Chrome หรือ Edge ก่อนอัดครับ
                    </span>
                  </div>
                  <a
                    href={window.location.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                  >
                    <ExternalLink size={13} />
                    <span>เปิดแท็บเต็มจอ</span>
                  </a>
                </div>
              )}

              {/* Error banner */}
              {errorMsg && (
                <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs leading-relaxed">
                  <AlertTriangle size={16} className="text-red-600 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                {/* Left Column: Live Camera Framing Preview */}
                <div className="md:col-span-5 flex flex-col items-center gap-3">
                  <div className="w-full aspect-square max-w-[244px] rounded-2xl bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden border border-slate-200">
                    {camStream ? (
                      <div
                        className={`overflow-hidden transition-all duration-200 ${
                          camMode === 'circle'
                            ? 'w-48 h-48 rounded-full ring-2 ring-white shadow-xl'
                            : 'w-full h-full rounded-xl'
                        }`}
                      >
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
                      <div className="text-center text-slate-400 text-xs px-4">
                        <Video size={28} className="mx-auto mb-2 opacity-60" />
                        <span>กำลังเชื่อมต่อกล้อง...</span>
                      </div>
                    )}

                    {/* Mirror quick toggle */}
                    <button
                      type="button"
                      onClick={() => setIsMirrored((m) => !m)}
                      className="absolute bottom-2.5 right-2.5 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-white text-[11px] font-medium border border-white/15 backdrop-blur-sm transition-colors"
                      title="กลับด้านภาพกล้องซ้าย-ขวา"
                    >
                      <FlipHorizontal2 size={12} />
                      <span>กลับด้าน</span>
                    </button>
                  </div>

                  {/* Live Mic Volume Meter */}
                  <div className="w-full max-w-[244px] space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-slate-600">
                      <span className="flex items-center gap-1.5 font-medium">
                        <Mic size={13} className="text-emerald-600" />
                        ทดสอบเสียงไมโครโฟน
                      </span>
                      <span className="font-mono text-[11px] tabular-nums text-slate-400">
                        {micLevel > 5 ? 'รับเสียงปกติ' : 'เงียบ'}
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden border border-slate-200/80">
                      <div
                        className="h-full bg-emerald-500 transition-transform duration-75 origin-left w-full"
                        style={{
                          transform: `scaleX(${Math.max(0.03, Math.min(1, micLevel / 100))})`,
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Right Column: Studio Configuration */}
                <div className="md:col-span-7 space-y-4">
                  {/* Camera & Mic selectors in 2-col row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-slate-700">
                        กล้องหน้า (Webcam)
                      </label>
                      <select
                        value={selectedCameraId}
                        onChange={(e) => {
                          const nextCam = e.target.value;
                          setSelectedCameraId(nextCam);
                          initCameraAndMic(nextCam, selectedMicId);
                        }}
                        className="w-full px-3 py-2 text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                      >
                        {cameras.length === 0 ? (
                          <option value="">กล้องเริ่มต้นของอุปกรณ์</option>
                        ) : (
                          cameras.map((cam, idx) => (
                            <option key={cam.deviceId || idx} value={cam.deviceId}>
                              {cam.label || `กล้อง ${idx + 1}`}
                            </option>
                          ))
                        )}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-slate-700">
                        ไมโครโฟนพูดบรรยาย
                      </label>
                      <select
                        value={selectedMicId}
                        onChange={(e) => {
                          const nextMic = e.target.value;
                          setSelectedMicId(nextMic);
                          initCameraAndMic(selectedCameraId, nextMic);
                        }}
                        className="w-full px-3 py-2 text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                      >
                        {microphones.length === 0 ? (
                          <option value="">ไมโครโฟนเริ่มต้นของอุปกรณ์</option>
                        ) : (
                          microphones.map((mic, idx) => (
                            <option key={mic.deviceId || idx} value={mic.deviceId}>
                              {mic.label || `ไมโครโฟน ${idx + 1}`}
                            </option>
                          ))
                        )}
                      </select>
                    </div>
                  </div>

                  {/* Virtual Background Picker */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                        <ImageIcon size={13} className="text-indigo-600" />
                        <span>ฉากหลังกล้อง (ตัดฉากหลัง AI เรียลไทม์)</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 hover:text-indigo-900"
                      >
                        <Upload size={12} />
                        <span>อัปโหลดรูปเอง</span>
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleUploadCustomBackground}
                        className="hidden"
                      />
                    </div>

                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      {BG_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => setBgEffect(preset.id)}
                          className={`relative h-14 rounded-xl overflow-hidden border text-[10px] font-semibold flex items-end justify-center p-1 transition-all ${
                            bgEffect === preset.id
                              ? 'border-indigo-600 ring-2 ring-indigo-500/30'
                              : 'border-slate-200 hover:border-slate-400'
                          }`}
                        >
                          {preset.imageUrl ? (
                            <img
                              src={preset.imageUrl}
                              alt={preset.label}
                              referrerPolicy="no-referrer"
                              className="absolute inset-0 w-full h-full object-cover"
                            />
                          ) : (
                            <div
                              className={`absolute inset-0 ${
                                preset.id === 'none'
                                  ? 'bg-slate-100'
                                  : preset.id === 'blur-soft'
                                  ? 'bg-gradient-to-br from-slate-200 via-slate-300 to-slate-400'
                                  : 'bg-gradient-to-br from-indigo-200 via-slate-400 to-slate-700'
                              }`}
                            />
                          )}
                          <span className="relative z-10 px-1.5 py-0.5 rounded bg-slate-950/75 text-white truncate max-w-full">
                            {preset.label}
                          </span>
                        </button>
                      ))}

                      {customBgUrl && (
                        <button
                          type="button"
                          onClick={() => setBgEffect('custom')}
                          className={`relative h-14 rounded-xl overflow-hidden border text-[10px] font-semibold flex items-end justify-center p-1 transition-all ${
                            bgEffect === 'custom'
                              ? 'border-indigo-600 ring-2 ring-indigo-500/30'
                              : 'border-slate-200 hover:border-slate-400'
                          }`}
                        >
                          <img
                            src={customBgUrl}
                            alt="รูปของฉัน"
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                          <span className="relative z-10 px-1.5 py-0.5 rounded bg-slate-950/75 text-white truncate max-w-full">
                            รูปของฉัน
                          </span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Camera Filter Selector */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700">
                      ฟิลเตอร์โทนสีกล้อง
                    </label>
                    <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 rounded-xl">
                      {(Object.keys(CAM_FILTER_PRESETS) as CamFilterId[]).map(
                        (fid) => (
                          <button
                            key={fid}
                            type="button"
                            onClick={() => setFilterId(fid)}
                            className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap ${
                              filterId === fid
                                ? 'bg-white text-slate-900 shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            {CAM_FILTER_PRESETS[fid].label}
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  {/* Starting Camera Mode */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700">
                      รูปแบบกล้องเมื่อเริ่มอัด
                    </label>
                    <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl">
                      <button
                        type="button"
                        onClick={() => setCamMode('circle')}
                        className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                          camMode === 'circle'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <Circle size={13} />
                        <span>วงกลมมุมซ้ายล่าง</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setCamMode('fullscreen')}
                        className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                          camMode === 'fullscreen'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <Maximize2 size={13} />
                        <span>เต็มจอพูดเปิดคลิป</span>
                      </button>
                    </div>
                  </div>

                  {/* In-App Audio Toggle & Quality */}
                  <div className="flex flex-col sm:flex-row gap-3 pt-1">
                    <label className="flex-1 flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer hover:border-indigo-300 transition-colors">
                      <input
                        type="checkbox"
                        checked={includeAppAudio}
                        onChange={(e) => setIncludeAppAudio(e.target.checked)}
                        className="mt-0.5 accent-indigo-600 w-4 h-4 rounded"
                      />
                      <div className="text-xs">
                        <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                          <Volume2 size={13} className="text-indigo-600" />
                          <span>อัดเสียงจากในแอป (เสียง AI)</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                          ตอนเลือกหน้าจอ ให้เลือกแท็บนี้และติ๊ก &ldquo;แชร์เสียงของแท็บนี้ด้วย&rdquo;
                        </p>
                      </div>
                    </label>

                    <div className="sm:w-32 space-y-1">
                      <span className="block text-[11px] font-semibold text-slate-600">
                        ความคมชัด
                      </span>
                      <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl">
                        {(['1080p', '720p'] as VideoQuality[]).map((q) => (
                          <button
                            key={q}
                            type="button"
                            onClick={() => setQuality(q)}
                            className={`py-1.5 rounded-lg text-[11px] font-mono font-semibold transition-colors ${
                              quality === q
                                ? 'bg-white text-slate-900 shadow-xs'
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Concise Shortcuts Reference */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-3 border-t border-slate-100 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                  <Keyboard size={13} />
                  คีย์ลัดระหว่างอัด:
                </span>
                <span>
                  <kbd className="font-mono text-slate-700">Alt+F</kbd> สลับเต็มจอ/วงกลม
                </span>
                <span>·</span>
                <span>
                  <kbd className="font-mono text-slate-700">Alt+P</kbd> พัก/อัดต่อ
                </span>
                <span>·</span>
                <span>
                  <kbd className="font-mono text-slate-700">Alt+H</kbd> ซ่อนแถบปุ่มอัด
                </span>
                <span>·</span>
                <span>
                  <kbd className="font-mono text-slate-700">Alt+S</kbd> หยุดอัด
                </span>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-200">
              <button
                type="button"
                onClick={handleCloseSetup}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleStartRecordingFlow}
                disabled={!camStream}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-700 hover:bg-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold shadow-md transition-colors whitespace-nowrap"
              >
                <span className="w-2.5 h-2.5 rounded-full bg-red-400" aria-hidden="true" />
                <span>เลือกแท็บและเริ่มอัดคลิป</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 2. 3-2-1 COUNTDOWN OVERLAY ── */}
      {phase === 'countdown' && (
        <div className="fixed inset-0 z-[99] flex flex-col items-center justify-center bg-slate-950/45 backdrop-blur-[2px] pointer-events-none select-none">
          <div className="w-32 h-32 rounded-full bg-slate-900/90 border-2 border-white/25 shadow-2xl flex items-center justify-center">
            <span className="font-mono text-6xl font-bold tabular-nums text-white">
              {countdownNum}
            </span>
          </div>
          <p className="mt-4 text-sm font-semibold text-white drop-shadow">
            เตรียมตัวเริ่มอัดคลิป...
          </p>
        </div>
      )}

      {/* ── 3. LIVE INTERACTIVE FACECAM (With Virtual Background & Filters) ── */}
      {(phase === 'countdown' || phase === 'recording' || phase === 'paused') && (
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
      )}

      {/* ── 4. LIVE CONTROL DOCK (Inline or Popped-out via Document PiP) ── */}
      {(phase === 'recording' || phase === 'paused') &&
        (pipWindow && !pipWindow.closed
          ? createPortal(
              <StudioControlDock
                phase={phase}
                elapsedSec={elapsedSec}
                micMuted={micMuted}
                micLevel={micLevel}
                hasTabAudio={hasTabAudio}
                tabAudioMuted={tabAudioMuted}
                camMode={camMode}
                camSize={camSize}
                bgEffect={bgEffect}
                customBgUrl={customBgUrl}
                filterId={filterId}
                isPoppedOut={true}
                supportsPip={supportsPip}
                isHidden={false}
                onTogglePause={handleTogglePause}
                onStop={handleStopRecording}
                onToggleMic={handleToggleMic}
                onToggleTabAudio={handleToggleTabAudio}
                onCamModeChange={setCamMode}
                onCamSizeChange={setCamSize}
                onBgEffectChange={setBgEffect}
                onFilterChange={setFilterId}
                onTogglePopout={handleTogglePopout}
                onToggleHide={handleToggleHideDock}
              />,
              pipWindow.document.body
            )
          : (
              <StudioControlDock
                phase={phase}
                elapsedSec={elapsedSec}
                micMuted={micMuted}
                micLevel={micLevel}
                hasTabAudio={hasTabAudio}
                tabAudioMuted={tabAudioMuted}
                camMode={camMode}
                camSize={camSize}
                bgEffect={bgEffect}
                customBgUrl={customBgUrl}
                filterId={filterId}
                isPoppedOut={false}
                supportsPip={supportsPip}
                isHidden={dockHidden}
                onTogglePause={handleTogglePause}
                onStop={handleStopRecording}
                onToggleMic={handleToggleMic}
                onToggleTabAudio={handleToggleTabAudio}
                onCamModeChange={setCamMode}
                onCamSizeChange={setCamSize}
                onBgEffectChange={setBgEffect}
                onFilterChange={setFilterId}
                onTogglePopout={handleTogglePopout}
                onToggleHide={handleToggleHideDock}
              />
            ))}

      {/* Brief toast when dock is hidden via Alt+H */}
      {showShortcutToast && (
        <div className="fixed bottom-5 right-5 z-[99] px-4 py-2 rounded-xl bg-slate-900/90 text-white text-xs font-medium border border-white/15 shadow-xl pointer-events-none">
          ซ่อนแถบควบคุมแล้ว · กด <span className="font-mono font-bold">Alt+H</span> เพื่อเรียกกลับ หรือ{' '}
          <span className="font-mono font-bold">Alt+S</span> เพื่อหยุดอัด
        </div>
      )}

      {/* ── 5. POST-RECORDING PREVIEW + AUTO-SUBTITLE STUDIO MODAL ── */}
      {phase === 'preview' && recordedClip && (
        <SubtitlePreviewModal
          clip={recordedClip}
          includeAppAudio={includeAppAudio}
          onDownloadRaw={handleDownloadRawClip}
          onRecordAgain={handleRecordAgain}
          onClose={handleClosePreview}
        />
      )}
    </>
  );
}
