import {
  RecordedClip,
  SpeakerRole,
  SubtitleCue,
  WhisperLanguageOption,
} from './types';

export interface LocalSubtitleProgress {
  stage: 'decoding' | 'downloading-model' | 'transcribing-you' | 'transcribing-ai' | 'merging';
  label: string;
  detail?: string;
  percent?: number;
  backend?: 'webgpu' | 'wasm';
  modelId?: string;
}

interface RawWhisperChunk {
  startSec: number;
  endSec: number;
  text: string;
}

let sharedWorker: Worker | null = null;
let jobCounter = 0;

function getWhisperWorker(): Worker {
  if (!sharedWorker) {
    sharedWorker = new Worker(new URL('./whisperWorker.ts', import.meta.url), {
      type: 'module',
    });
  }
  return sharedWorker;
}

/**
 * Decodes any audio/video Blob into a 16 kHz mono Float32Array required by Whisper.
 */
async function decodeBlobTo16kMono(blob: Blob): Promise<Float32Array | null> {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    if (arrayBuffer.byteLength < 64) return null;

    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const decodeCtx = new AudioContextClass();
    let audioBuffer: AudioBuffer;
    try {
      audioBuffer = await decodeCtx.decodeAudioData(arrayBuffer.slice(0));
    } finally {
      decodeCtx.close().catch(() => {});
    }

    const targetRate = 16000;
    const frameCount = Math.max(1, Math.ceil(audioBuffer.duration * targetRate));
    const offline = new OfflineAudioContext(1, frameCount, targetRate);
    const source = offline.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offline.destination);
    source.start(0);

    const rendered = await offline.startRendering();
    return new Float32Array(rendered.getChannelData(0));
  } catch (err) {
    console.warn('[LocalWhisper] Could not decode audio track:', err);
    return null;
  }
}

/**
 * Checks if a 16 kHz PCM track contains meaningful speech energy (not pure silence).
 */
function hasAudibleSpeech(pcm: Float32Array): boolean {
  if (!pcm || pcm.length < 1600) return false;
  const win = 1600; // 100 ms
  let loudWindows = 0;
  for (let i = 0; i + win <= pcm.length; i += win) {
    let sumSq = 0;
    for (let j = 0; j < win; j++) {
      const v = pcm[i + j];
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / win);
    if (rms > 0.008) {
      loudWindows++;
      if (loudWindows >= 2) return true;
    }
  }
  return false;
}

/**
 * Acoustic bleed gate: when the presenter uses speakers instead of headphones,
 * loud AI/app audio can leak softly into the microphone track.
 * This attenuates 100 ms windows on micPCM where appPCM is strongly active
 * while micPCM is noticeably weaker, preventing duplicate "You:" lines.
 */
function suppressSpeakerBleed(micPCM: Float32Array, appPCM: Float32Array): Float32Array {
  const cleaned = new Float32Array(micPCM);
  const win = 1600; // 100 ms at 16 kHz
  const minLen = Math.min(cleaned.length, appPCM.length);

  for (let i = 0; i + win <= minLen; i += win) {
    let micSq = 0;
    let appSq = 0;
    for (let j = 0; j < win; j++) {
      const mv = cleaned[i + j];
      const av = appPCM[i + j];
      micSq += mv * mv;
      appSq += av * av;
    }
    const micRms = Math.sqrt(micSq / win);
    const appRms = Math.sqrt(appSq / win);

    if (appRms > 0.015 && micRms < appRms * 0.45) {
      for (let j = 0; j < win; j++) {
        cleaned[i + j] *= 0.04;
      }
    }
  }

  return cleaned;
}

/**
 * Computes whether an audio interval in appPCM still contains uncaptured speech
 * outside the intervals already covered by exact in-app transcripts.
 */
function hasUncoveredSpeech(
  pcm: Float32Array,
  coveredCues: SubtitleCue[]
): boolean {
  if (!hasAudibleSpeech(pcm)) return false;
  if (coveredCues.length === 0) return true;

  const win = 1600; // 100 ms
  let uncoveredLoudWindows = 0;
  for (let i = 0; i + win <= pcm.length; i += win) {
    const tSec = i / 16000;
    const isCovered = coveredCues.some(
      (c) => tSec >= c.startSec - 0.5 && tSec <= c.endSec + 0.5
    );
    if (isCovered) continue;

    let sumSq = 0;
    for (let j = 0; j < win; j++) {
      const v = pcm[i + j];
      sumSq += v * v;
    }
    if (Math.sqrt(sumSq / win) > 0.012) {
      uncoveredLoudWindows++;
      if (uncoveredLoudWindows >= 5) return true; // at least 0.5s of uncaptured speech
    }
  }
  return false;
}

const HALLUCINATION_PATTERNS = [
  /^\[.*\]$/,
  /^\(.*\)$/,
  /^♪+$/,
  /^[.\s,!?。，！？…-]+$/,
  /^(thank you for watching|thanks for watching|subscribe|subtitles by|amara\.org)\.?$/i,
  /^(ขอบคุณที่รับชม|ฝากกดไลค์|กดติดตาม|ซับไทยโดย)\.?$/i,
];

function cleanWhisperText(raw: string): string {
  const trimmed = raw
    .replace(/\s+/g, ' ')
    .replace(/^(AI|You|YOU|ผู้พูด|เอไอ)\s*[:：]\s*/i, '')
    .trim();
  if (!trimmed) return '';
  if (HALLUCINATION_PATTERNS.some((re) => re.test(trimmed))) return '';
  return trimmed;
}

/**
 * Splits overly long subtitle chunks into crisp, editor-friendly 1-2 line cues.
 */
function splitLongCue(
  startSec: number,
  endSec: number,
  speaker: SpeakerRole,
  text: string,
  idPrefix: string
): SubtitleCue[] {
  const clean = cleanWhisperText(text);
  if (!clean) return [];

  const duration = Math.max(0.5, endSec - startSec);
  const maxChars = 54;

  if (clean.length <= maxChars && duration <= 5.5) {
    return [
      {
        id: `${idPrefix}_0`,
        startSec: Number(startSec.toFixed(2)),
        endSec: Number(Math.max(startSec + 0.5, endSec).toFixed(2)),
        speaker,
        text: clean,
      },
    ];
  }

  // Split naturally using Intl.Segmenter when available
  let tokens: string[];
  const IntlAny = Intl as unknown as {
    Segmenter?: new (
      locale?: string,
      opts?: { granularity: 'word' | 'grapheme' }
    ) => { segment: (input: string) => Iterable<{ segment: string }> };
  };
  if (IntlAny.Segmenter) {
    try {
      const seg = new IntlAny.Segmenter('th', { granularity: 'word' });
      tokens = Array.from(seg.segment(clean), (s) => s.segment);
    } catch {
      tokens = clean.split(/(\s+)/);
    }
  } else {
    tokens = clean.split(/(\s+)/);
  }

  const pieces: string[] = [];
  let current = '';
  for (const tk of tokens) {
    if ((current + tk).length > maxChars && current.trim().length > 0) {
      pieces.push(current.trim());
      current = tk.trimStart();
    } else {
      current += tk;
    }
  }
  if (current.trim()) pieces.push(current.trim());

  const totalChars = pieces.reduce((acc, p) => acc + p.length, 0) || 1;
  let cursor = startSec;
  return pieces.map((piece, idx) => {
    const share = (piece.length / totalChars) * duration;
    const cueStart = cursor;
    const cueEnd =
      idx === pieces.length - 1
        ? Math.max(cueStart + 0.5, endSec)
        : Math.max(cueStart + 0.45, cursor + share);
    cursor = cueEnd;
    return {
      id: `${idPrefix}_${idx}`,
      startSec: Number(cueStart.toFixed(2)),
      endSec: Number(cueEnd.toFixed(2)),
      speaker,
      text: piece,
    };
  });
}

function runWorkerTranscribe(
  audio: Float32Array,
  language: WhisperLanguageOption,
  trackLabel: string,
  trackStage: 'transcribing-you' | 'transcribing-ai',
  onProgress: (p: LocalSubtitleProgress) => void,
  abortSignal?: AbortSignal
): Promise<{ chunks: RawWhisperChunk[]; modelId: string; backend: 'webgpu' | 'wasm' }> {
  return new Promise((resolve, reject) => {
    if (abortSignal?.aborted) {
      reject(new Error('ABORTED'));
      return;
    }

    const worker = getWhisperWorker();
    const jobId = `job_${++jobCounter}_${Date.now()}`;

    const cleanup = () => {
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      if (abortSignal) {
        abortSignal.removeEventListener('abort', onAbort);
      }
    };

    const onAbort = () => {
      cleanup();
      // Terminate worker on explicit cancel so CPU/WebGPU stops immediately
      if (sharedWorker) {
        sharedWorker.terminate();
        sharedWorker = null;
      }
      reject(new Error('ABORTED'));
    };

    if (abortSignal) {
      abortSignal.addEventListener('abort', onAbort, { once: true });
    }

    const onError = (err: ErrorEvent) => {
      cleanup();
      reject(new Error(err.message || 'Whisper Worker เกิดข้อผิดพลาด'));
    };

    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.id !== jobId) return;

      if (data.type === 'progress') {
        const pct =
          typeof data.progress === 'number'
            ? Math.min(100, Math.max(0, Math.round(data.progress)))
            : undefined;
        const fileShort = data.file ? String(data.file).split('/').pop() : '';
        const sizeInfo =
          data.loaded && data.total
            ? ` (${(data.loaded / (1024 * 1024)).toFixed(1)} / ${(data.total / (1024 * 1024)).toFixed(1)} MB)`
            : '';

        onProgress({
          stage: 'downloading-model',
          label: 'กำลังเตรียมโมเดล Whisper บนเครื่อง (โหลดครั้งแรกครั้งเดียวแล้วเก็บลงแคช)...',
          detail: fileShort ? `${fileShort}${sizeInfo}` : undefined,
          percent: pct,
          backend: data.backend,
          modelId: data.modelId,
        });
      } else if (data.type === 'status' && data.stage === 'transcribing') {
        onProgress({
          stage: trackStage,
          label: trackLabel,
          detail:
            data.backend === 'webgpu'
              ? 'กำลังประมวลผลด้วย WebGPU บนเครื่องของคุณ (ฟรี ไม่ใช้ Token)'
              : 'กำลังประมวลผลด้วย CPU/WASM บนเครื่องของคุณ (ฟรี ไม่ใช้ Token)',
          backend: data.backend,
          modelId: data.modelId,
        });
      } else if (data.type === 'result') {
        cleanup();
        resolve({
          chunks: Array.isArray(data.chunks) ? data.chunks : [],
          modelId: data.modelId,
          backend: data.backend,
        });
      } else if (data.type === 'error') {
        cleanup();
        reject(new Error(data.error || 'ถอดเสียงไม่สำเร็จ'));
      }
    };

    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);

    // Clone buffer so we can transfer ownership cleanly without mutating caller buffer
    const copy = new Float32Array(audio);
    worker.postMessage(
      {
        type: 'transcribe',
        id: jobId,
        audio: copy,
        language,
      },
      [copy.buffer]
    );
  });
}

/**
 * Hybrid Zero-Token Subtitle Generator (Method 2 + Method 3 Fusion):
 * 1. Uses isolated Microphone audio track -> 100% "YOU" diarization via local Whisper
 * 2. Uses exact in-app captured AI transcripts (TTS / Live AI Tutor) + isolated App audio track -> 100% "AI" diarization via local Whisper
 * 3. Suppresses speaker bleed between tracks and merges all cues chronologically
 */
export async function generateHybridLocalSubtitles(
  clip: RecordedClip,
  language: WhisperLanguageOption,
  onProgress: (p: LocalSubtitleProgress) => void,
  abortSignal?: AbortSignal
): Promise<{
  subtitles: SubtitleCue[];
  stats: {
    youCount: number;
    aiCapturedCount: number;
    aiWhisperCount: number;
    backend?: 'webgpu' | 'wasm';
  };
}> {
  onProgress({
    stage: 'decoding',
    label: 'กำลังแยกแทร็กเสียงไมค์ (You) และเสียงแอป (AI)...',
  });

  const hasDualTracks = Boolean(clip.micAudioBlob || clip.appAudioBlob);
  const rawCapturedAi = (clip.capturedAppCues || [])
    .filter((c) => c.speaker === 'AI' && c.text.trim().length > 0)
    .map((c, idx) => ({
      ...c,
      id: c.id || `cap_ai_${idx}`,
      startSec: Math.max(0, c.startSec),
      endSec: Math.max(c.startSec + 0.6, c.endSec),
    }));

  let micPCM: Float32Array | null = null;
  let appPCM: Float32Array | null = null;

  if (hasDualTracks) {
    [micPCM, appPCM] = await Promise.all([
      clip.micAudioBlob ? decodeBlobTo16kMono(clip.micAudioBlob) : Promise.resolve(null),
      clip.appAudioBlob ? decodeBlobTo16kMono(clip.appAudioBlob) : Promise.resolve(null),
    ]);
  } else {
    // Fallback if a clip has no isolated tracks
    micPCM = await decodeBlobTo16kMono(clip.blob);
  }

  if (abortSignal?.aborted) throw new Error('ABORTED');

  // Reduce acoustic bleed if presenter used speakers instead of headphones
  if (micPCM && appPCM) {
    micPCM = suppressSpeakerBleed(micPCM, appPCM);
  }

  const allCues: SubtitleCue[] = [];
  let youCount = 0;
  let aiWhisperCount = 0;
  let usedBackend: 'webgpu' | 'wasm' | undefined;

  // ── 1. Exact in-app captured AI cues (Method 2 — 100% exact spelling!) ──
  const normalizedCapturedAi: SubtitleCue[] = [];
  rawCapturedAi.forEach((cue, i) => {
    const split = splitLongCue(
      cue.startSec,
      cue.endSec,
      'AI',
      cue.text,
      `ai_cap_${i}`
    );
    normalizedCapturedAi.push(...split);
  });
  allCues.push(...normalizedCapturedAi);

  // ── 2. Transcribe Isolated Microphone Track -> YOU (Method 3 Whisper) ──
  if (micPCM && hasAudibleSpeech(micPCM)) {
    const res = await runWorkerTranscribe(
      micPCM,
      language,
      'กำลังถอดเสียงพูดของคุณ (You) จากแทร็กไมโครโฟน...',
      'transcribing-you',
      onProgress,
      abortSignal
    );
    usedBackend = res.backend;

    res.chunks.forEach((chunk, idx) => {
      const cues = splitLongCue(
        chunk.startSec,
        chunk.endSec,
        'YOU',
        chunk.text,
        `you_w_${idx}`
      );
      youCount += cues.length;
      allCues.push(...cues);
    });
  }

  if (abortSignal?.aborted) throw new Error('ABORTED');

  // ── 3. Transcribe Isolated App/AI Track -> AI (fill any uncaptured AI speech) ──
  if (appPCM && hasUncoveredSpeech(appPCM, normalizedCapturedAi)) {
    const res = await runWorkerTranscribe(
      appPCM,
      'auto', // AI in Polyglot Tutor may speak Thai, Chinese, or English
      'กำลังถอดเสียง AI จากแทร็กเสียงในแอป...',
      'transcribing-ai',
      onProgress,
      abortSignal
    );
    usedBackend = res.backend;

    res.chunks.forEach((chunk, idx) => {
      // Skip chunks that strongly overlap an already-captured exact AI transcript
      const mid = (chunk.startSec + chunk.endSec) / 2;
      const alreadyCaptured = normalizedCapturedAi.some(
        (c) => mid >= c.startSec - 0.35 && mid <= c.endSec + 0.35
      );
      if (alreadyCaptured) return;

      const cues = splitLongCue(
        chunk.startSec,
        chunk.endSec,
        'AI',
        chunk.text,
        `ai_w_${idx}`
      );
      aiWhisperCount += cues.length;
      allCues.push(...cues);
    });
  }

  onProgress({
    stage: 'merging',
    label: 'กำลังเรียงไทม์ไลน์ซับไตเติ้ล You / AI...',
    percent: 100,
    backend: usedBackend,
  });

  // Sort chronologically and clean tiny overlaps for smooth live display
  allCues.sort((a, b) => a.startSec - b.startSec);
  const clampedMax = Math.max(1, clip.durationSec || 9999);
  for (let i = 0; i < allCues.length; i++) {
    const cur = allCues[i];
    cur.startSec = Number(Math.max(0, Math.min(cur.startSec, clampedMax)).toFixed(2));
    cur.endSec = Number(Math.max(cur.startSec + 0.45, Math.min(cur.endSec, clampedMax + 0.5)).toFixed(2));
    if (i < allCues.length - 1) {
      const next = allCues[i + 1];
      if (cur.endSec > next.startSec && next.startSec - cur.startSec >= 0.45) {
        cur.endSec = Number(next.startSec.toFixed(2));
      }
    }
  }

  return {
    subtitles: allCues,
    stats: {
      youCount,
      aiCapturedCount: normalizedCapturedAi.length,
      aiWhisperCount,
      backend: usedBackend,
    },
  };
}
