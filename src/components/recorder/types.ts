import studioBgOffice from '../../assets/images/studio_bg_modern_office_1795366321797.jpg';
import studioBgLibrary from '../../assets/images/studio_bg_cozy_library_1795366320209.jpg';
import studioBgIndigo from '../../assets/images/studio_bg_indigo_studio_1795366321146.jpg';

export type RecorderPhase =
  | 'idle'
  | 'setup'
  | 'countdown'
  | 'recording'
  | 'paused'
  | 'preview';

export type CamMode = 'circle' | 'fullscreen' | 'hidden';
export type CamSize = 'sm' | 'md' | 'lg';
export type VideoQuality = '1080p' | '720p';

export type BgEffectId =
  | 'none'
  | 'blur-soft'
  | 'blur-strong'
  | 'office'
  | 'library'
  | 'indigo-studio'
  | 'custom';

export type CamFilterId = 'none' | 'bright' | 'warm' | 'cool';

export type SpeakerRole = 'YOU' | 'AI';

export interface SubtitleCue {
  id: string;
  startSec: number;
  endSec: number;
  speaker: SpeakerRole;
  text: string;
}

export interface BgPreset {
  id: BgEffectId;
  label: string;
  imageUrl?: string;
}

export const BG_PRESETS: BgPreset[] = [
  { id: 'none', label: 'ฉากจริง' },
  { id: 'blur-soft', label: 'เบลอนุ่ม' },
  { id: 'blur-strong', label: 'เบลอเข้ม' },
  { id: 'office', label: 'ห้องทำงาน', imageUrl: studioBgOffice },
  { id: 'library', label: 'ห้องหนังสือ', imageUrl: studioBgLibrary },
  { id: 'indigo-studio', label: 'สตูดิโอ', imageUrl: studioBgIndigo },
];

export const CAM_FILTER_PRESETS: Record<CamFilterId, { label: string; css: string }> = {
  none: { label: 'ปกติ', css: 'none' },
  bright: {
    label: 'สว่างใส',
    css: 'brightness(1.09) contrast(1.03) saturate(1.06)',
  },
  warm: {
    label: 'อุ่นสตูดิโอ',
    css: 'brightness(1.05) contrast(1.05) saturate(1.1) sepia(0.11)',
  },
  cool: {
    label: 'คลีนคมชัด',
    css: 'brightness(1.04) contrast(1.08) saturate(1.02) hue-rotate(-4deg)',
  },
};

export const CAM_SIZE_PX: Record<CamSize, number> = {
  sm: 140,
  md: 184,
  lg: 244,
};

export type SubtitleEngineMode = 'local-hybrid' | 'gemini-online';
export type WhisperLanguageOption = 'thai' | 'auto' | 'chinese' | 'english';

export interface RecordedClip {
  blob: Blob;
  url: string;
  mimeType: string;
  extension: 'mp4' | 'webm';
  durationSec: number;
  sizeBytes: number;
  qualityLabel: string;
  hasTabAudio: boolean;
  createdAt: Date;
  /** Isolated microphone track (100% human speaker / YOU) for zero-token subtitle diarization */
  micAudioBlob?: Blob | null;
  /** Isolated tab/app audio track (100% AI / in-app audio) for zero-token subtitle diarization */
  appAudioBlob?: Blob | null;
  /** Exact AI utterances captured live from in-app TTS and Live AI Tutor during recording */
  capturedAppCues?: SubtitleCue[];
}

export function pickSupportedMimeType(): { mimeType: string; extension: 'mp4' | 'webm' } {
  if (typeof MediaRecorder === 'undefined') {
    return { mimeType: 'video/webm', extension: 'webm' };
  }

  const candidates: Array<{ mimeType: string; extension: 'mp4' | 'webm' }> = [
    { mimeType: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', extension: 'mp4' },
    { mimeType: 'video/mp4;codecs=avc1,mp4a.40.2', extension: 'mp4' },
    { mimeType: 'video/mp4', extension: 'mp4' },
    { mimeType: 'video/webm;codecs=vp9,opus', extension: 'webm' },
    { mimeType: 'video/webm;codecs=vp8,opus', extension: 'webm' },
    { mimeType: 'video/webm', extension: 'webm' },
  ];

  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate.mimeType)) {
      return candidate;
    }
  }

  return { mimeType: '', extension: 'webm' };
}

export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;

  const pad = (n: number) => String(n).padStart(2, '0');
  if (hrs > 0) {
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}

export function formatTimePrecise(seconds: number): string {
  const safe = Math.max(0, seconds);
  const mins = Math.floor(safe / 60);
  const secs = (safe % 60).toFixed(1).padStart(4, '0');
  return `${String(mins).padStart(2, '0')}:${secs}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function buildExportFilename(
  extension: 'mp4' | 'webm',
  date: Date,
  suffix = ''
): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
  return `PolyglotAI-Promo${suffix ? `-${suffix}` : ''}-${stamp}.${extension}`;
}
