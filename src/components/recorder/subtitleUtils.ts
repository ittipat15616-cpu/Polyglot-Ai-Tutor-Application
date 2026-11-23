import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { SubtitleCue } from './types';

/**
 * Extracts audio from a recorded video Blob and encodes it as a compact
 * 16 kHz Mono 16-bit PCM WAV base64 string (~1.9 MB/min) for fast Gemini transcription.
 */
export async function extractAudioAsWavBase64(
  videoBlob: Blob
): Promise<{ base64: string; mimeType: string }> {
  const arrayBuffer = await videoBlob.arrayBuffer();

  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const decodeCtx = new AudioContextClass();
    const audioBuffer = await decodeCtx.decodeAudioData(arrayBuffer.slice(0));
    decodeCtx.close().catch(() => {});

    const targetRate = 16000;
    const frameCount = Math.max(1, Math.ceil(audioBuffer.duration * targetRate));
    const offline = new OfflineAudioContext(1, frameCount, targetRate);
    const source = offline.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offline.destination);
    source.start(0);

    const rendered = await offline.startRendering();
    const samples = rendered.getChannelData(0);
    const wavBuffer = encodeMonoWav16(samples, targetRate);

    return {
      base64: arrayBufferToBase64(wavBuffer),
      mimeType: 'audio/wav',
    };
  } catch (err) {
    console.warn('[Subtitle] WAV decode fallback to raw blob:', err);
    return {
      base64: arrayBufferToBase64(arrayBuffer),
      mimeType: videoBlob.type || 'video/webm',
    };
  }
}

function encodeMonoWav16(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const byteLength = 44 + samples.length * 2;
  const buffer = new ArrayBuffer(byteLength);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)));
  }
  return btoa(chunks.join(''));
}

// Module-level cached Thai/multilingual word segmenter (avoids recreating Intl.Segmenter per frame)
let cachedWordSegmenter:
  | { segment: (input: string) => Iterable<{ segment: string }> }
  | null
  | undefined = undefined;

function getWordSegmenter() {
  if (cachedWordSegmenter !== undefined) return cachedWordSegmenter;
  const IntlAny = Intl as unknown as {
    Segmenter?: new (
      locale?: string,
      opts?: { granularity: 'word' | 'grapheme' }
    ) => { segment: (input: string) => Iterable<{ segment: string }> };
  };
  if (IntlAny.Segmenter) {
    try {
      cachedWordSegmenter = new IntlAny.Segmenter('th', { granularity: 'word' });
      return cachedWordSegmenter;
    } catch {
      // fallback below
    }
  }
  cachedWordSegmenter = null;
  return null;
}

/**
 * Splits Thai, Chinese, and English text into natural wrap tokens using cached Intl.Segmenter
 * when supported, falling back cleanly to space/char chunking.
 */
function segmentTextForWrap(text: string): string[] {
  const seg = getWordSegmenter();
  if (seg) {
    try {
      return Array.from(seg.segment(text), (s) => s.segment);
    } catch {
      // fallback below
    }
  }
  return text.split(/(\s+)/);
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  firstLineIndent: number
): string[] {
  const tokens = segmentTextForWrap(text);
  const lines: string[] = [];
  let current = '';

  for (const token of tokens) {
    const allowedW = lines.length === 0 ? maxWidth - firstLineIndent : maxWidth;
    const candidate = current + token;
    if (ctx.measureText(candidate).width <= allowedW || current === '') {
      current = candidate;
    } else {
      lines.push(current.trim());
      current = token.trimStart();
    }
  }
  if (current.trim()) {
    lines.push(current.trim());
  }
  return lines.length > 0 ? lines : [text];
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

interface SubtitleBoxGeometry {
  scale: number;
  fontSize: number;
  lineHeight: number;
  padX: number;
  padY: number;
  radius: number;
  prefixText: string;
  prefixColor: string;
  bodyColor: string;
  prefixFont: string;
  bodyFont: string;
  prefixWidth: number;
  lines: string[];
  lineWidths: number[];
  boxW: number;
  boxH: number;
  boxX: number;
  boxY: number;
  isAI: boolean;
}

function measureSubtitleBox(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  cue: SubtitleCue
): SubtitleBoxGeometry {
  const refHeight = Math.min(canvasHeight, canvasWidth * 0.9);
  const scale = Math.max(0.75, refHeight / 720);
  const fontSize = Math.round(24 * scale);
  const lineHeight = Math.round(fontSize * 1.38);
  const padX = Math.round(22 * scale);
  const padY = Math.round(13 * scale);
  const radius = Math.round(14 * scale);
  const maxTextWidth = Math.min(canvasWidth * 0.82, Math.round(1120 * scale));

  const isAI = cue.speaker === 'AI';
  const prefixText = isAI ? 'AI: ' : 'You: ';
  const prefixColor = isAI ? '#34D399' : '#38BDF8';
  const bodyColor = isAI ? '#FEF08A' : '#FFFFFF';

  const prefixFont = `700 ${fontSize}px "Prompt", "Noto Sans Thai", system-ui, -apple-system, sans-serif`;
  const bodyFont = `600 ${fontSize}px "Prompt", "Noto Sans Thai", system-ui, -apple-system, sans-serif`;

  ctx.font = prefixFont;
  const prefixWidth = ctx.measureText(prefixText).width;

  ctx.font = bodyFont;
  const lines = wrapLines(ctx, cue.text, maxTextWidth, prefixWidth);

  let maxLineW = 0;
  const lineWidths = lines.map((line, idx) => {
    const textW = ctx.measureText(line).width;
    const totalW = textW + (idx === 0 ? prefixWidth : 0);
    if (totalW > maxLineW) maxLineW = totalW;
    return textW;
  });

  const boxW = Math.min(canvasWidth * 0.9, maxLineW + padX * 2);
  const boxH = lines.length * lineHeight + padY * 2;
  const boxX = (canvasWidth - boxW) / 2;
  const boxY = canvasHeight - boxH - Math.round(38 * scale);

  return {
    scale,
    fontSize,
    lineHeight,
    padX,
    padY,
    radius,
    prefixText,
    prefixColor,
    bodyColor,
    prefixFont,
    bodyFont,
    prefixWidth,
    lines,
    lineWidths,
    boxW,
    boxH,
    boxX,
    boxY,
    isAI,
  };
}

function renderMeasuredSubtitleBox(
  ctx: CanvasRenderingContext2D,
  g: SubtitleBoxGeometry,
  originX: number,
  originY: number
) {
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  // Dark black editor subtitle backdrop with subtle border & drop shadow
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = Math.round(16 * g.scale);
  ctx.shadowOffsetY = Math.round(4 * g.scale);
  ctx.fillStyle = 'rgba(8, 10, 16, 0.86)';
  drawRoundedRect(ctx, originX, originY, g.boxW, g.boxH, g.radius);
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.lineWidth = Math.max(1, Math.round(1.5 * g.scale));
  ctx.strokeStyle = g.isAI
    ? 'rgba(52, 211, 153, 0.35)'
    : 'rgba(56, 189, 248, 0.35)';
  drawRoundedRect(ctx, originX, originY, g.boxW, g.boxH, g.radius);
  ctx.stroke();

  // Render each line centered inside the black box
  g.lines.forEach((line, idx) => {
    const lineY = originY + g.padY + idx * g.lineHeight + g.lineHeight / 2;
    const textW = g.lineWidths[idx];
    const totalLineW = idx === 0 ? g.prefixWidth + textW : textW;
    const startX = originX + (g.boxW - totalLineW) / 2;

    if (idx === 0) {
      ctx.font = g.prefixFont;
      ctx.fillStyle = g.prefixColor;
      ctx.fillText(g.prefixText, startX, lineY);

      ctx.font = g.bodyFont;
      ctx.fillStyle = g.bodyColor;
      ctx.fillText(line, startX + g.prefixWidth, lineY);
    } else {
      ctx.font = g.bodyFont;
      ctx.fillStyle = g.bodyColor;
      ctx.fillText(line, startX, lineY);
    }
  });

  ctx.restore();
}

/**
 * Draws pro editor-style real-time subtitle box onto Canvas 2D:
 * - Semi-transparent rounded dark black box
 * - Distinct colored speaker prefix ("You:" vs "AI:") and distinct body text color
 * Scales naturally for both 16:9 desktop landscape and 9:16 mobile portrait videos.
 */
export function drawSubtitleOnCanvas(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  cue: SubtitleCue
) {
  const g = measureSubtitleBox(ctx, canvasWidth, canvasHeight, cue);
  renderMeasuredSubtitleBox(ctx, g, g.boxX, g.boxY);
}

interface PreRenderedSubtitle {
  cue: SubtitleCue;
  canvas: HTMLCanvasElement;
  drawX: number;
  drawY: number;
}

/**
 * Fast subtitle overlay renderer for video export:
 * Pre-renders each cue ONCE onto a compact offscreen canvas (shadowBlur + text wrap happen
 * once per cue instead of 30x/second), making per-frame burn-in a single <0.2ms drawImage!
 */
class SubtitleOverlayCache {
  private readonly sortedCues: SubtitleCue[];
  private readonly canvasWidth: number;
  private readonly canvasHeight: number;
  private readonly measureCtx: CanvasRenderingContext2D | null;
  private readonly cache = new Map<string, PreRenderedSubtitle>();
  private readonly preRenderedAll: boolean;
  private cursor = 0;

  constructor(subtitles: SubtitleCue[], canvasWidth: number, canvasHeight: number) {
    this.sortedCues = [...subtitles]
      .filter((c) => c.text && c.text.trim().length > 0 && c.endSec > c.startSec)
      .sort((a, b) => a.startSec - b.startSec);
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;

    const scratch = document.createElement('canvas');
    scratch.width = 16;
    scratch.height = 16;
    this.measureCtx = scratch.getContext('2d');

    // Pre-render all cues upfront for typical clips (<= 160 cues) so there is zero
    // transition spike during playback; larger cue lists lazily render & recycle.
    this.preRenderedAll = this.sortedCues.length <= 160;
    if (this.preRenderedAll) {
      for (const cue of this.sortedCues) {
        this.renderCue(cue);
      }
    }
  }

  private renderCue(cue: SubtitleCue): PreRenderedSubtitle | null {
    const existing = this.cache.get(cue.id);
    if (existing) return existing;
    if (!this.measureCtx) return null;

    const g = measureSubtitleBox(
      this.measureCtx,
      this.canvasWidth,
      this.canvasHeight,
      cue
    );
    const shadowPad = Math.ceil(26 * g.scale);
    const offCanvas = document.createElement('canvas');
    offCanvas.width = Math.max(2, Math.ceil(g.boxW + shadowPad * 2));
    offCanvas.height = Math.max(2, Math.ceil(g.boxH + shadowPad * 2));
    const offCtx = offCanvas.getContext('2d');
    if (!offCtx) return null;

    renderMeasuredSubtitleBox(offCtx, g, shadowPad, shadowPad);

    const entry: PreRenderedSubtitle = {
      cue,
      canvas: offCanvas,
      drawX: Math.round(g.boxX - shadowPad),
      drawY: Math.round(g.boxY - shadowPad),
    };

    // Keep memory bounded if rendering lazily on very long videos
    if (!this.preRenderedAll && this.cache.size >= 8) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        const old = this.cache.get(oldestKey);
        if (old) {
          old.canvas.width = 0;
          old.canvas.height = 0;
        }
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(cue.id, entry);
    return entry;
  }

  /**
   * Returns the active pre-rendered subtitle overlay at `sec` in amortized O(1) time.
   */
  getOverlayAt(sec: number): PreRenderedSubtitle | null {
    const list = this.sortedCues;
    const len = list.length;
    if (len === 0) return null;

    // Reset cursor if time jumped backwards
    if (this.cursor >= len || (this.cursor > 0 && sec < list[this.cursor].startSec)) {
      this.cursor = 0;
    }

    // Advance cursor past cues that have already ended
    while (this.cursor < len && list[this.cursor].endSec < sec) {
      this.cursor++;
    }

    // Check active cue at or near cursor (handles minor overlaps cleanly)
    for (let i = this.cursor; i < len; i++) {
      const cue = list[i];
      if (sec < cue.startSec) break;
      if (sec >= cue.startSec && sec <= cue.endSec) {
        return this.renderCue(cue);
      }
    }
    return null;
  }

  dispose() {
    for (const item of this.cache.values()) {
      item.canvas.width = 0;
      item.canvas.height = 0;
    }
    this.cache.clear();
  }
}

/**
 * Computes clean even output dimensions capped at 1920px on the longest edge
 * (required by H.264 YUV420p encoders and prevents 4K Retina captures from choking CPU/GPU).
 */
function computeExportDimensions(rawW: number, rawH: number): { w: number; h: number } {
  const safeW = rawW > 0 ? rawW : 1280;
  const safeH = rawH > 0 ? rawH : 720;
  const maxEdge = 1920;
  const scale = Math.min(1, maxEdge / Math.max(safeW, safeH));
  const w = Math.max(2, Math.floor((safeW * scale) / 2) * 2);
  const h = Math.max(2, Math.floor((safeH * scale) / 2) * 2);
  return { w, h };
}

/**
 * Attaches an export <video> inside the viewport at compositor-active dimensions (320x180)
 * behind the modal backdrop so Chromium/Safari NEVER throttle requestVideoFrameCallback
 * or drop frames irregularly (fixes both 2x2 throttling and detached-video freeze bugs).
 */
function attachHiddenDomVideo(videoUrl: string): HTMLVideoElement {
  const video = document.createElement('video');
  video.src = videoUrl;
  video.crossOrigin = 'anonymous';
  video.playsInline = true;
  video.preload = 'auto';
  video.style.position = 'fixed';
  video.style.left = '0';
  video.style.top = '0';
  video.style.width = '320px';
  video.style.height = '180px';
  video.style.opacity = '0.008';
  video.style.pointerEvents = 'none';
  video.style.zIndex = '-1';
  document.body.appendChild(video);
  return video;
}

function detachDomVideo(video: HTMLVideoElement) {
  try {
    video.pause();
    video.removeAttribute('src');
    video.load();
  } catch {
    // ignore
  }
  if (video.parentNode) {
    video.parentNode.removeChild(video);
  }
}

async function decodeAudioBufferSafe(
  videoUrl: string,
  sourceBlob?: Blob
): Promise<AudioBuffer | null> {
  try {
    const arrayBuffer = sourceBlob
      ? await sourceBlob.arrayBuffer()
      : await (await fetch(videoUrl)).arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength < 64) return null;

    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const decodeCtx = new AudioContextClass();
    try {
      return await decodeCtx.decodeAudioData(arrayBuffer.slice(0));
    } finally {
      decodeCtx.close().catch(() => {});
    }
  } catch (err) {
    console.warn('[SubtitleExport] Video has no decodable audio track:', err);
    return null;
  }
}

async function resampleAudioBuffer(
  buffer: AudioBuffer,
  targetRate: number,
  targetChannels: number
): Promise<AudioBuffer> {
  if (
    buffer.sampleRate === targetRate &&
    buffer.numberOfChannels === targetChannels
  ) {
    return buffer;
  }
  const frameCount = Math.max(1, Math.ceil(buffer.duration * targetRate));
  const offline = new OfflineAudioContext(targetChannels, frameCount, targetRate);
  const src = offline.createBufferSource();
  src.buffer = buffer;
  src.connect(offline.destination);
  src.start(0);
  return await offline.startRendering();
}

/**
 * Picks a universally compatible H.264 WebCodecs config (LINE, iOS Photos, Android Gallery, macOS, Windows):
 * - Strongly prefers Constrained Baseline (42e0) / Baseline (4200) / Main (4d00)
 * - Uses `latencyMode: 'realtime'` so the encoder NEVER emits B-frames (strictly PTS === DTS),
 *   preventing out-of-order frame stutter in mobile players and mp4-muxer (which omits ctts).
 */
async function pickWebCodecsVideoConfig(
  width: number,
  height: number
): Promise<VideoEncoderConfig | null> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
    return null;
  }

  const pixels = width * height;
  const bitrate =
    pixels >= 1920 * 1000
      ? 5_000_000
      : pixels >= 1280 * 700
      ? 3_500_000
      : 2_200_000;

  // Pick H.264 levels matched to resolution so hardware encoders don't reject level mismatch
  const codecs =
    pixels <= 1280 * 720
      ? [
          'avc1.42e01f',
          'avc1.42001f',
          'avc1.4d001f',
          'avc1.42e028',
          'avc1.420028',
          'avc1.4d0028',
          'avc1.640028',
        ]
      : [
          'avc1.42e02a',
          'avc1.42002a',
          'avc1.4d002a',
          'avc1.42e028',
          'avc1.420028',
          'avc1.4d0028',
          'avc1.64002a',
          'avc1.640028',
        ];

  const accelModes: HardwareAcceleration[] = [
    'prefer-hardware',
    'no-preference',
    'prefer-software',
  ];
  const latencyModes: Array<LatencyMode | undefined> = ['realtime', undefined];

  for (const latencyMode of latencyModes) {
    for (const hardwareAcceleration of accelModes) {
      for (const codec of codecs) {
        const config: VideoEncoderConfig = {
          codec,
          width,
          height,
          bitrate,
          framerate: 30,
          hardwareAcceleration,
          avc: { format: 'avc' },
          ...(latencyMode ? { latencyMode } : {}),
        };
        try {
          const support = await VideoEncoder.isConfigSupported(config);
          if (support.supported) {
            return support.config || config;
          }
        } catch {
          // try next
        }
      }
    }
  }
  return null;
}

/**
 * Picks standard AAC-LC (`mp4a.40.2`) at 48 kHz or 44.1 kHz — universally required by
 * LINE, iOS Photos, Android Gallery, QuickTime, and social platforms.
 */
async function pickWebCodecsAudioConfig(
  sampleRate: number,
  numberOfChannels: number
): Promise<{
  encoderConfig: AudioEncoderConfig;
  muxerCodec: 'aac' | 'opus';
  targetSampleRate: number;
  targetChannels: number;
} | null> {
  if (typeof AudioEncoder === 'undefined' || typeof AudioData === 'undefined') {
    return null;
  }

  const preferredChannels = Math.min(2, Math.max(1, numberOfChannels));
  const channelCandidates = Array.from(new Set([preferredChannels, 2, 1]));

  // Always standardize to 48000 Hz or 44100 Hz for maximum iOS / LINE / Android compatibility
  const standardRates =
    sampleRate === 44100 ? [44100, 48000] : [48000, 44100];

  // 1. Strongly prefer AAC-LC (universally recognized as standard MP4 video on iOS/LINE/Android)
  for (const channels of channelCandidates) {
    for (const rate of standardRates) {
      const config: AudioEncoderConfig = {
        codec: 'mp4a.40.2',
        sampleRate: rate,
        numberOfChannels: channels,
        bitrate: 128_000,
      };
      try {
        const support = await AudioEncoder.isConfigSupported(config);
        if (support.supported) {
          return {
            encoderConfig: support.config || config,
            muxerCodec: 'aac',
            targetSampleRate: rate,
            targetChannels: channels,
          };
        }
      } catch {
        // try next
      }
    }
  }

  // 2. Last-resort fallback: Opus inside MP4 (if browser has no AAC encoder)
  const opusConfig: AudioEncoderConfig = {
    codec: 'opus',
    sampleRate: 48000,
    numberOfChannels: preferredChannels,
    bitrate: 128_000,
  };
  try {
    const support = await AudioEncoder.isConfigSupported(opusConfig);
    if (support.supported) {
      return {
        encoderConfig: support.config || opusConfig,
        muxerCodec: 'opus',
        targetSampleRate: 48000,
        targetChannels: preferredChannels,
      };
    }
  } catch {
    // unsupported
  }

  return null;
}

/**
 * Primary Smooth Zero-Drift Standard MP4 Engine using WebCodecs + mp4-muxer:
 * - Produces a 100% standard, non-fragmented Fast-Start MP4 (`moov` at file start,
 *   exact duration, 1s keyframe seek index, H.264 Baseline/Main zero-B-frame + AAC-LC)
 *   that LINE recognizes as a normal Video and iOS/Android can scrub & save to Photos.
 * - Pre-renders subtitle overlays ONCE per cue (<0.2ms drawImage per frame, zero stutter).
 * - Uses smooth `video.playbackRate` throttling instead of `video.pause()` so Chrome's
 *   hardware video decoder never flushes or drops frames.
 * - Uses 1-frame lookahead to stamp exact `VideoFrame` durations and smoothly fill any
 *   variable-frame-rate capture gaps so playback is continuously smooth.
 */
async function exportVideoWithWebCodecs(
  videoUrl: string,
  subtitles: SubtitleCue[],
  onProgress: (percent: number) => void,
  abortSignal?: AbortSignal,
  sourceBlob?: Blob
): Promise<{ blob: Blob; extension: 'mp4' } | null> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
    return null;
  }

  const checkAborted = () => {
    if (abortSignal?.aborted) throw new Error('ABORTED');
  };

  checkAborted();
  onProgress(2);

  // Ensure web fonts (Prompt / Noto Sans Thai) are ready before pre-rendering subtitles
  if (subtitles.length > 0 && typeof document !== 'undefined' && document.fonts?.ready) {
    await Promise.race([
      document.fonts.ready.catch(() => {}),
      new Promise<void>((r) => setTimeout(r, 1200)),
    ]);
  }
  checkAborted();

  // 1. Decode audio offline FIRST for exact sample-accurate timeline & true duration
  const rawAudioBuffer = await decodeAudioBufferSafe(videoUrl, sourceBlob);
  checkAborted();

  let audioSetup: Awaited<ReturnType<typeof pickWebCodecsAudioConfig>> = null;
  let preparedAudio: AudioBuffer | null = null;

  if (rawAudioBuffer && rawAudioBuffer.length > 0) {
    audioSetup = await pickWebCodecsAudioConfig(
      rawAudioBuffer.sampleRate,
      rawAudioBuffer.numberOfChannels
    );
    if (!audioSetup) {
      // Browser has VideoEncoder but lacks AudioEncoder for AAC/Opus — use fallback engine
      return null;
    }
    preparedAudio = await resampleAudioBuffer(
      rawAudioBuffer,
      audioSetup.targetSampleRate,
      audioSetup.targetChannels
    );
  }
  checkAborted();

  // 2. Mount <video> at compositor-active size (320x180, opacity 0.008) so browser never throttles rVFC
  const video = attachHiddenDomVideo(videoUrl);
  video.muted = true;
  video.volume = 0;

  let videoEncoder: VideoEncoder | null = null;
  let audioEncoder: AudioEncoder | null = null;
  let subtitleCache: SubtitleOverlayCache | null = null;

  const cleanupEncodersAndDom = () => {
    try {
      if (videoEncoder && videoEncoder.state !== 'closed') videoEncoder.close();
    } catch {
      // ignore
    }
    try {
      if (audioEncoder && audioEncoder.state !== 'closed') audioEncoder.close();
    } catch {
      // ignore
    }
    if (subtitleCache) {
      subtitleCache.dispose();
      subtitleCache = null;
    }
    detachDomVideo(video);
  };

  try {
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => reject(new Error('ABORTED'));
      if (abortSignal) {
        if (abortSignal.aborted) return reject(new Error('ABORTED'));
        abortSignal.addEventListener('abort', onAbort, { once: true });
      }
      const done = () => {
        abortSignal?.removeEventListener('abort', onAbort);
        resolve();
      };
      if (video.readyState >= 2) {
        done();
        return;
      }
      video.onloadeddata = done;
      video.onerror = () => {
        abortSignal?.removeEventListener('abort', onAbort);
        reject(new Error('ไม่สามารถอ่านไฟล์วิดีโอเพื่อส่งออกได้'));
      };
    });

    checkAborted();

    // Ensure playback begins strictly at t = 0
    if (video.currentTime > 0.01) {
      await new Promise<void>((resolve) => {
        const onSeeked = () => resolve();
        video.addEventListener('seeked', onSeeked, { once: true });
        video.currentTime = 0;
        setTimeout(resolve, 400);
      });
    }

    const { w, h } = computeExportDimensions(video.videoWidth, video.videoHeight);
    const videoConfig = await pickWebCodecsVideoConfig(w, h);
    if (!videoConfig) {
      cleanupEncodersAndDom();
      return null;
    }

    // Separate raw frame buffer + output composite canvas for 1-frame lookahead & gap-filling
    const pendingRawCanvas = document.createElement('canvas');
    pendingRawCanvas.width = w;
    pendingRawCanvas.height = h;
    const pendingRawCtx = pendingRawCanvas.getContext('2d', { alpha: false });

    const outCanvas = document.createElement('canvas');
    outCanvas.width = w;
    outCanvas.height = h;
    const outCtx = outCanvas.getContext('2d', { alpha: false });

    if (!pendingRawCtx || !outCtx) {
      cleanupEncodersAndDom();
      return null;
    }

    // Pre-render all subtitle cues ONCE before video playback begins (zero per-frame shadowBlur/layout!)
    subtitleCache = new SubtitleOverlayCache(subtitles, w, h);

    const target = new ArrayBufferTarget();
    const muxer = new Muxer({
      target,
      video: {
        codec: 'avc',
        width: w,
        height: h,
      },
      audio:
        preparedAudio && audioSetup
          ? {
              codec: audioSetup.muxerCodec,
              numberOfChannels: audioSetup.targetChannels,
              sampleRate: audioSetup.targetSampleRate,
            }
          : undefined,
      // Standard non-fragmented Fast-Start MP4 (`moov` at file start for LINE / iOS / Android)
      fastStart: 'in-memory',
      // Offset ensures AAC priming timestamps or minor hardware offsets NEVER throw & fall back to WebM
      firstTimestampBehavior: 'offset',
    });

    let encoderFatalError: Error | null = null;

    videoEncoder = new VideoEncoder({
      output: (chunk, meta) => {
        muxer.addVideoChunk(chunk, meta);
      },
      error: (err) => {
        encoderFatalError = err instanceof Error ? err : new Error(String(err));
      },
    });
    videoEncoder.configure(videoConfig);

    // 3. Encode the ENTIRE audio buffer offline right away (starts cleanly at t = 0)
    if (preparedAudio && audioSetup) {
      audioEncoder = new AudioEncoder({
        output: (chunk, meta) => {
          muxer.addAudioChunk(chunk, meta);
        },
        error: (err) => {
          encoderFatalError = err instanceof Error ? err : new Error(String(err));
        },
      });
      audioEncoder.configure(audioSetup.encoderConfig);

      const numChannels = preparedAudio.numberOfChannels;
      const sampleRate = preparedAudio.sampleRate;
      const totalFrames = preparedAudio.length;
      const chunkFrames = 4096;

      for (let offset = 0; offset < totalFrames; offset += chunkFrames) {
        checkAborted();
        if (encoderFatalError) throw encoderFatalError;

        const frames = Math.min(chunkFrames, totalFrames - offset);
        const planar = new Float32Array(frames * numChannels);
        for (let ch = 0; ch < numChannels; ch++) {
          const chData = preparedAudio.getChannelData(ch);
          planar.set(chData.subarray(offset, offset + frames), ch * frames);
        }

        const timestampUs = Math.round((offset / sampleRate) * 1_000_000);
        const audioData = new AudioData({
          format: 'f32-planar',
          sampleRate,
          numberOfFrames: frames,
          numberOfChannels: numChannels,
          timestamp: timestampUs,
          data: planar,
        });
        audioEncoder.encode(audioData);
        audioData.close();

        if (audioEncoder.encodeQueueSize > 32) {
          await new Promise<void>((r) => setTimeout(r, 8));
        }
      }

      await audioEncoder.flush();
      audioEncoder.close();
      audioEncoder = null;
    }

    checkAborted();
    onProgress(10);

    // Determine reliable total duration for smooth progress bar (handles WebM Infinity duration)
    const totalDuration =
      Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : preparedAudio?.duration && preparedAudio.duration > 0
        ? preparedAudio.duration
        : Math.max(1, subtitles[subtitles.length - 1]?.endSec || 1);

    // 4. Encode video frames with 1-frame lookahead, exact durations, smooth gap-fill,
    //    pre-rendered subtitle compositing, and smooth playbackRate throttling (zero video.pause!)
    const MIN_FRAME_STEP_US = 14_000; // Filter sub-14ms micro-duplicates while preserving up to 60fps
    const MAX_SINGLE_FRAME_US = 50_000; // Subdivide gaps > 50ms into smooth 30fps (33.3ms) slices
    const FILL_STEP_US = 33_333;
    const KEYFRAME_INTERVAL_US = 1_000_000; // 1.0s GOP for instant scrubbing on LINE / iOS / Android

    let emittedCount = 0;
    let lastEmittedEndUs = 0;
    let lastKeyFrameTsUs = -KEYFRAME_INTERVAL_US;
    let hasPendingFrame = false;
    let pendingTsUs = 0;
    let videoDone = false;

    const baseRate = w * h > 1280 * 720 ? 0.85 : 1.0;

    const adjustPlaybackRate = () => {
      if (!videoEncoder || videoDone || video.ended) return;
      const q = videoEncoder.encodeQueueSize;
      let targetRate = baseRate;
      if (q >= 12) {
        targetRate = 0.25;
      } else if (q >= 6) {
        targetRate = 0.5;
      } else if (q >= 3) {
        targetRate = Math.min(baseRate, 0.75);
      }
      if (Math.abs(video.playbackRate - targetRate) > 0.01) {
        video.playbackRate = targetRate;
      }
    };

    const emitCompositeSlice = (tsUs: number, durationUs: number) => {
      if (!videoEncoder || videoEncoder.state !== 'configured') return;
      const safeDur = Math.max(1_000, Math.round(durationUs));

      outCtx.drawImage(pendingRawCanvas, 0, 0);
      if (subtitleCache) {
        const overlay = subtitleCache.getOverlayAt(tsUs / 1_000_000);
        if (overlay) {
          outCtx.drawImage(overlay.canvas, overlay.drawX, overlay.drawY);
        }
      }

      const frame = new VideoFrame(outCanvas, {
        timestamp: tsUs,
        duration: safeDur,
      });
      const keyFrame =
        emittedCount === 0 || tsUs - lastKeyFrameTsUs >= KEYFRAME_INTERVAL_US;
      videoEncoder.encode(frame, { keyFrame });
      frame.close();

      if (keyFrame) lastKeyFrameTsUs = tsUs;
      lastEmittedEndUs = tsUs + safeDur;
      emittedCount += 1;
    };

    /**
     * Flushes the buffered `pendingRawCanvas` from `pendingTsUs` up to `targetEndUs`,
     * cleanly subdividing any VFR capture gap > 50ms into smooth 33.3ms slices so
     * subtitles update accurately even on static screens and mobile players never stutter.
     */
    const flushPendingUntil = (targetEndUs: number) => {
      if (!hasPendingFrame) return;
      let cursorUs = Math.max(pendingTsUs, lastEmittedEndUs);
      if (targetEndUs <= cursorUs) return;

      while (cursorUs < targetEndUs) {
        const remaining = targetEndUs - cursorUs;
        if (remaining <= MAX_SINGLE_FRAME_US) {
          emitCompositeSlice(cursorUs, remaining);
          cursorUs = targetEndUs;
        } else {
          emitCompositeSlice(cursorUs, FILL_STEP_US);
          cursorUs += FILL_STEP_US;
        }
      }
    };

    const onDecodedVideoFrame = (mediaTimeSec: number) => {
      if (!videoEncoder || videoEncoder.state !== 'configured' || videoDone) return;

      const safeSec = Math.max(0, mediaTimeSec);
      const rawTsUs = Math.round(safeSec * 1_000_000);

      if (!hasPendingFrame) {
        pendingRawCtx.drawImage(video, 0, 0, w, h);
        pendingTsUs = 0;
        hasPendingFrame = true;
        return;
      }

      // If initial t=0 callback repeats before advancing, refresh raw frame in-place
      if (rawTsUs <= pendingTsUs) {
        if (emittedCount === 0) {
          pendingRawCtx.drawImage(video, 0, 0, w, h);
        }
        return;
      }

      // Skip ultra-tight duplicate callbacks (<14ms) on 120Hz displays
      if (rawTsUs - pendingTsUs < MIN_FRAME_STEP_US) {
        return;
      }

      // Flush previous frame with its exact duration up to rawTsUs
      flushPendingUntil(rawTsUs);

      // Capture the new raw video frame into the lookahead buffer
      pendingRawCtx.drawImage(video, 0, 0, w, h);
      pendingTsUs = rawTsUs;

      const pct = Math.min(96, 10 + Math.round((safeSec / totalDuration) * 86));
      onProgress(pct);
    };

    // Capture initial decoded frame at t = 0 into the lookahead buffer
    pendingRawCtx.drawImage(video, 0, 0, w, h);
    pendingTsUs = 0;
    hasPendingFrame = true;

    await new Promise<void>((resolve, reject) => {
      let rvfcHandle: number | null = null;
      let rafHandle: number | null = null;

      const videoWithRVFC = video as HTMLVideoElement & {
        requestVideoFrameCallback?: (
          cb: (now: number, meta: { mediaTime: number }) => void
        ) => number;
        cancelVideoFrameCallback?: (handle: number) => void;
      };
      const hasRVFC = typeof videoWithRVFC.requestVideoFrameCallback === 'function';

      const stopLoop = () => {
        videoDone = true;
        if (rvfcHandle !== null && videoWithRVFC.cancelVideoFrameCallback) {
          videoWithRVFC.cancelVideoFrameCallback(rvfcHandle);
          rvfcHandle = null;
        }
        if (rafHandle !== null) {
          cancelAnimationFrame(rafHandle);
          rafHandle = null;
        }
        abortSignal?.removeEventListener('abort', onAbort);
      };

      const onAbort = () => {
        stopLoop();
        reject(new Error('ABORTED'));
      };

      if (abortSignal) {
        if (abortSignal.aborted) {
          stopLoop();
          return reject(new Error('ABORTED'));
        }
        abortSignal.addEventListener('abort', onAbort, { once: true });
      }

      if (videoEncoder) {
        videoEncoder.ondequeue = () => {
          adjustPlaybackRate();
        };
      }

      const onRVFC = (_now: number, metadata: { mediaTime: number }) => {
        if (videoDone) return;
        if (encoderFatalError) {
          stopLoop();
          reject(encoderFatalError);
          return;
        }

        try {
          onDecodedVideoFrame(metadata.mediaTime);
          adjustPlaybackRate();
        } catch (err) {
          stopLoop();
          reject(err);
          return;
        }

        if (!video.ended && !videoDone && videoWithRVFC.requestVideoFrameCallback) {
          rvfcHandle = videoWithRVFC.requestVideoFrameCallback(onRVFC);
        }
      };

      const onRAF = () => {
        if (videoDone) return;
        if (encoderFatalError) {
          stopLoop();
          reject(encoderFatalError);
          return;
        }

        try {
          onDecodedVideoFrame(video.currentTime);
          adjustPlaybackRate();
        } catch (err) {
          stopLoop();
          reject(err);
          return;
        }

        if (!video.ended && !videoDone) {
          rafHandle = requestAnimationFrame(onRAF);
        }
      };

      video.onended = () => {
        try {
          const videoEndSec = Math.max(
            video.currentTime || 0,
            Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0
          );
          const audioEndSec = preparedAudio?.duration || 0;
          const naturalEndUs = Math.round(Math.max(videoEndSec, audioEndSec) * 1_000_000);
          const finalEndUs = Math.min(
            Math.max(pendingTsUs + FILL_STEP_US, naturalEndUs),
            pendingTsUs + 1_500_000
          );
          flushPendingUntil(finalEndUs);
        } catch {
          // ignore
        }
        stopLoop();
        resolve();
      };

      video.onerror = () => {
        stopLoop();
        reject(new Error('เกิดข้อผิดพลาดระหว่างอ่านเฟรมวิดีโอ'));
      };

      if (hasRVFC && videoWithRVFC.requestVideoFrameCallback) {
        rvfcHandle = videoWithRVFC.requestVideoFrameCallback(onRVFC);
      } else {
        rafHandle = requestAnimationFrame(onRAF);
      }

      video.playbackRate = baseRate;
      video.play().catch((playErr) => {
        stopLoop();
        reject(playErr);
      });
    });

    checkAborted();
    if (encoderFatalError) throw encoderFatalError;

    // Edge case: extremely short video where onended fired before any frame flushed
    if (emittedCount === 0 && hasPendingFrame) {
      flushPendingUntil(Math.max(FILL_STEP_US, Math.round(totalDuration * 1_000_000)));
    }

    onProgress(97);
    await videoEncoder.flush();
    videoEncoder.close();
    videoEncoder = null;

    muxer.finalize();
    const mp4Blob = new Blob([target.buffer], { type: 'video/mp4' });
    cleanupEncodersAndDom();
    onProgress(100);

    return { blob: mp4Blob, extension: 'mp4' };
  } catch (err) {
    cleanupEncodersAndDom();
    throw err;
  }
}

/**
 * Picks a reliable MediaRecorder codec for the fallback path (browsers without WebCodecs).
 */
function pickReliableFallbackMimeType(): { mimeType: string; extension: 'mp4' | 'webm' } {
  if (typeof MediaRecorder === 'undefined') {
    return { mimeType: 'video/webm', extension: 'webm' };
  }
  const candidates: Array<{ mimeType: string; extension: 'mp4' | 'webm' }> = [
    { mimeType: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', extension: 'mp4' },
    { mimeType: 'video/mp4', extension: 'mp4' },
    { mimeType: 'video/webm;codecs=vp8,opus', extension: 'webm' },
    { mimeType: 'video/webm;codecs=vp9,opus', extension: 'webm' },
    { mimeType: 'video/webm', extension: 'webm' },
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c.mimeType)) return c;
  }
  return { mimeType: '', extension: 'webm' };
}

/**
 * Fallback Engine for older browsers without WebCodecs:
 * - Uses pre-rendered SubtitleOverlayCache (no per-frame shadowBlur/layout)
 * - Mounts <video> at 320x180 in DOM so browser never throttles rVFC
 * - Uses captureStream(0) + requestFrame() synced to rVFC
 */
function exportVideoWithMediaRecorderFallback(
  videoUrl: string,
  subtitles: SubtitleCue[],
  onProgress: (percent: number) => void,
  abortSignal?: AbortSignal
): Promise<{ blob: Blob; extension: 'mp4' | 'webm' }> {
  return new Promise((resolve, reject) => {
    const video = attachHiddenDomVideo(videoUrl);
    video.muted = false;

    const videoWithRVFC = video as HTMLVideoElement & {
      requestVideoFrameCallback?: (
        cb: (now: number, meta: { mediaTime: number }) => void
      ) => number;
      cancelVideoFrameCallback?: (handle: number) => void;
    };
    const hasRVFC = typeof videoWithRVFC.requestVideoFrameCallback === 'function';

    let rafId: number | null = null;
    let rvfcId: number | null = null;
    let audioCtx: AudioContext | null = null;
    let recorder: MediaRecorder | null = null;
    let subtitleCache: SubtitleOverlayCache | null = null;
    let finished = false;

    const cleanup = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (rvfcId !== null && videoWithRVFC.cancelVideoFrameCallback) {
        videoWithRVFC.cancelVideoFrameCallback(rvfcId);
        rvfcId = null;
      }
      if (subtitleCache) {
        subtitleCache.dispose();
        subtitleCache = null;
      }
      detachDomVideo(video);
      if (audioCtx) {
        audioCtx.close().catch(() => {});
        audioCtx = null;
      }
    };

    const handleAbort = () => {
      if (finished) return;
      finished = true;
      try {
        if (recorder && recorder.state !== 'inactive') recorder.stop();
      } catch {
        // ignore
      }
      cleanup();
      reject(new Error('ABORTED'));
    };

    if (abortSignal) {
      if (abortSignal.aborted) {
        cleanup();
        reject(new Error('ABORTED'));
        return;
      }
      abortSignal.addEventListener('abort', handleAbort, { once: true });
    }

    video.onerror = () => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(new Error('ไม่สามารถอ่านไฟล์วิดีโอเพื่อส่งออกได้'));
    };

    video.onloadeddata = async () => {
      try {
        const { w, h } = computeExportDimensions(video.videoWidth, video.videoHeight);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) throw new Error('Canvas context unavailable');

        subtitleCache = new SubtitleOverlayCache(subtitles, w, h);

        ctx.drawImage(video, 0, 0, w, h);

        const AudioContextClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        audioCtx = new AudioContextClass();
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume().catch(() => {});
        }
        const source = audioCtx.createMediaElementSource(video);
        const dest = audioCtx.createMediaStreamDestination();
        source.connect(dest);

        const canvasStream = hasRVFC ? canvas.captureStream(0) : canvas.captureStream(30);
        const videoTrack = canvasStream.getVideoTracks()[0] as MediaStreamTrack & {
          requestFrame?: () => void;
        };

        const tracks: MediaStreamTrack[] = [
          ...canvasStream.getVideoTracks(),
          ...dest.stream.getAudioTracks(),
        ];
        const combined = new MediaStream(tracks);

        const picked = pickReliableFallbackMimeType();
        const chunks: Blob[] = [];
        try {
          recorder = new MediaRecorder(combined, {
            mimeType: picked.mimeType || undefined,
            videoBitsPerSecond: 4_000_000,
            audioBitsPerSecond: 128_000,
          });
        } catch {
          recorder = new MediaRecorder(combined);
        }

        recorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) chunks.push(ev.data);
        };

        recorder.onstop = () => {
          if (finished) return;
          finished = true;
          const finalMime = recorder?.mimeType || picked.mimeType || 'video/webm';
          const ext: 'mp4' | 'webm' = finalMime.includes('mp4') ? 'mp4' : 'webm';
          const outBlob = new Blob(chunks, { type: finalMime });
          cleanup();
          onProgress(100);
          resolve({ blob: outBlob, extension: ext });
        };

        const duration =
          Number.isFinite(video.duration) && video.duration > 0
            ? video.duration
            : Math.max(1, subtitles[subtitles.length - 1]?.endSec || 1);

        const paintFrame = (t: number) => {
          ctx.drawImage(video, 0, 0, w, h);
          if (subtitleCache) {
            const overlay = subtitleCache.getOverlayAt(t);
            if (overlay) {
              ctx.drawImage(overlay.canvas, overlay.drawX, overlay.drawY);
            }
          }
          if (hasRVFC && typeof videoTrack?.requestFrame === 'function') {
            videoTrack.requestFrame();
          }
          onProgress(Math.min(99, Math.round((t / duration) * 100)));
        };

        const onRVFC = (_now: number, meta: { mediaTime: number }) => {
          if (finished) return;
          paintFrame(meta.mediaTime);
          if (!video.ended && videoWithRVFC.requestVideoFrameCallback) {
            rvfcId = videoWithRVFC.requestVideoFrameCallback(onRVFC);
          }
        };

        const onRAF = () => {
          if (finished) return;
          paintFrame(video.currentTime);
          if (!video.ended) {
            rafId = requestAnimationFrame(onRAF);
          }
        };

        video.onended = () => {
          paintFrame(video.currentTime);
          setTimeout(() => {
            if (recorder && recorder.state !== 'inactive') {
              recorder.stop();
            }
          }, 120);
        };

        video.addEventListener(
          'playing',
          () => {
            if (finished || !recorder || recorder.state !== 'inactive') return;
            paintFrame(0);
            recorder.start(250);
            if (hasRVFC && videoWithRVFC.requestVideoFrameCallback) {
              rvfcId = videoWithRVFC.requestVideoFrameCallback(onRVFC);
            } else {
              rafId = requestAnimationFrame(onRAF);
            }
          },
          { once: true }
        );

        await video.play();
      } catch (err) {
        if (!finished) {
          finished = true;
          cleanup();
          reject(err);
        }
      }
    };
  });
}

/**
 * Burns real-time styled subtitles directly into a standard, smooth, LINE/mobile-ready MP4.
 * Uses WebCodecs (H.264 Baseline/Main zero-B-frame + AAC-LC) + mp4-muxer Fast-Start as primary engine,
 * automatically falling back to MediaRecorder only if WebCodecs is unavailable.
 */
export async function exportVideoWithSubtitles(
  videoUrl: string,
  subtitles: SubtitleCue[],
  onProgress: (percent: number) => void,
  abortSignal?: AbortSignal,
  sourceBlob?: Blob
): Promise<{ blob: Blob; extension: 'mp4' | 'webm' }> {
  try {
    const webCodecsResult = await exportVideoWithWebCodecs(
      videoUrl,
      subtitles,
      onProgress,
      abortSignal,
      sourceBlob
    );
    if (webCodecsResult) {
      return webCodecsResult;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'ABORTED') throw err;
    console.warn(
      '[SubtitleExport] WebCodecs export failed, falling back to MediaRecorder:',
      err
    );
  }

  return exportVideoWithMediaRecorderFallback(
    videoUrl,
    subtitles,
    onProgress,
    abortSignal
  );
}

/**
 * Converts a raw Chrome MediaRecorder recording (fragmented fMP4 or WebM lacking duration/seek tables)
 * into a standard, Fast-Start, seekable MP4 (H.264 + AAC) that LINE recognizes as a normal Video
 * and iOS/Android phones can scrub & save directly to Photos.
 * Returns null if WebCodecs is unsupported in the current browser.
 */
export async function exportStandardMp4Video(
  videoUrl: string,
  onProgress: (percent: number) => void,
  abortSignal?: AbortSignal,
  sourceBlob?: Blob
): Promise<{ blob: Blob; extension: 'mp4' } | null> {
  return exportVideoWithWebCodecs(
    videoUrl,
    [],
    onProgress,
    abortSignal,
    sourceBlob
  );
}
