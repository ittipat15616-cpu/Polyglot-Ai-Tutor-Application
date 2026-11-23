/// <reference lib="webworker" />

interface TranscribeRequest {
  type: 'transcribe';
  id: string;
  audio: Float32Array;
  language: 'thai' | 'auto' | 'chinese' | 'english';
}

interface RawWhisperChunk {
  text?: string;
  timestamp?: [number | null, number | null];
}

interface TransformersModule {
  pipeline: (
    task: string,
    model: string,
    opts?: Record<string, unknown>
  ) => Promise<(audio: Float32Array, opts?: Record<string, unknown>) => Promise<{ text?: string; chunks?: RawWhisperChunk[] }>>;
  env: {
    allowLocalModels: boolean;
    useBrowserCache: boolean;
  };
}

let cachedModule: TransformersModule | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedTranscriber: any = null;
let loadedModelId = '';
let loadedBackend: 'webgpu' | 'wasm' = 'wasm';

async function loadTransformersRuntime(): Promise<TransformersModule> {
  if (cachedModule) return cachedModule;

  const cdnUrls = [
    'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1',
    'https://esm.sh/@huggingface/transformers@3.5.1',
  ];

  let lastErr: unknown = null;
  for (const url of cdnUrls) {
    try {
      const mod = (await import(/* @vite-ignore */ url)) as unknown as TransformersModule;
      if (mod && typeof mod.pipeline === 'function') {
        mod.env.allowLocalModels = false;
        mod.env.useBrowserCache = true;
        cachedModule = mod;
        return mod;
      }
    } catch (err) {
      console.warn(`[WhisperWorker] Failed loading runtime from ${url}:`, err);
      lastErr = err;
    }
  }

  throw lastErr instanceof Error
    ? lastErr
    : new Error('ไม่สามารถโหลดตัวรัน Whisper บนเบราว์เซอร์ได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต');
}

async function detectWebGpuSupport(): Promise<{ available: boolean; hasF16: boolean }> {
  try {
    const nav = navigator as unknown as {
      gpu?: {
        requestAdapter: () => Promise<{ features?: { has: (f: string) => boolean } } | null>;
      };
    };
    if (!nav.gpu) return { available: false, hasF16: false };
    const adapter = await nav.gpu.requestAdapter();
    if (!adapter) return { available: false, hasF16: false };
    const hasF16 = Boolean(adapter.features?.has('shader-f16'));
    return { available: true, hasF16 };
  } catch {
    return { available: false, hasF16: false };
  }
}

async function getOrLoadTranscriber(
  onProgress: (info: {
    status: string;
    file?: string;
    progress?: number;
    loaded?: number;
    total?: number;
    modelId: string;
    backend: 'webgpu' | 'wasm';
  }) => void
) {
  if (cachedTranscriber) {
    return {
      transcriber: cachedTranscriber,
      modelId: loadedModelId,
      backend: loadedBackend,
    };
  }

  const { pipeline } = await loadTransformersRuntime();
  const gpu = await detectWebGpuSupport();

  const attempts: Array<{
    modelId: string;
    device: 'webgpu' | 'wasm';
    dtype: Record<string, string>;
  }> = [];

  if (gpu.available) {
    attempts.push({
      modelId: 'onnx-community/whisper-small',
      device: 'webgpu',
      dtype: {
        encoder_model: gpu.hasF16 ? 'fp16' : 'fp32',
        decoder_model_merged: 'q4',
      },
    });
  }

  // Reliable WASM quantized whisper-small (great Thai/Chinese/English balance, cached locally after 1st load)
  attempts.push({
    modelId: 'onnx-community/whisper-small',
    device: 'wasm',
    dtype: {
      encoder_model: 'q8',
      decoder_model_merged: 'q4',
    },
  });

  // Lightweight fallback if small fails due to memory constraints
  attempts.push({
    modelId: 'onnx-community/whisper-base',
    device: 'wasm',
    dtype: {
      encoder_model: 'q8',
      decoder_model_merged: 'q4',
    },
  });

  let lastError: unknown = null;
  for (const cfg of attempts) {
    try {
      onProgress({
        status: 'loading',
        modelId: cfg.modelId,
        backend: cfg.device,
        progress: 0,
      });

      const transcriber = await pipeline('automatic-speech-recognition', cfg.modelId, {
        device: cfg.device,
        dtype: cfg.dtype,
        progress_callback: (ev: {
          status?: string;
          file?: string;
          progress?: number;
          loaded?: number;
          total?: number;
        }) => {
          onProgress({
            status: ev.status || 'progress',
            file: ev.file,
            progress: typeof ev.progress === 'number' ? ev.progress : undefined,
            loaded: ev.loaded,
            total: ev.total,
            modelId: cfg.modelId,
            backend: cfg.device,
          });
        },
      });

      cachedTranscriber = transcriber;
      loadedModelId = cfg.modelId;
      loadedBackend = cfg.device;
      return {
        transcriber,
        modelId: loadedModelId,
        backend: loadedBackend,
      };
    } catch (err) {
      console.warn(
        `[WhisperWorker] Failed loading ${cfg.modelId} on ${cfg.device}:`,
        err
      );
      lastError = err;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('ไม่สามารถโหลดโมเดล Whisper บนเบราว์เซอร์ได้');
}

self.onmessage = async (event: MessageEvent<TranscribeRequest>) => {
  const msg = event.data;
  if (!msg || msg.type !== 'transcribe') return;

  try {
    const { transcriber, modelId, backend } = await getOrLoadTranscriber((info) => {
      self.postMessage({
        type: 'progress',
        id: msg.id,
        ...info,
      });
    });

    self.postMessage({
      type: 'status',
      id: msg.id,
      stage: 'transcribing',
      modelId,
      backend,
    });

    const options: Record<string, unknown> = {
      task: 'transcribe',
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5,
    };

    if (msg.language && msg.language !== 'auto') {
      options.language = msg.language;
    }

    const result = await transcriber(msg.audio, options);
    const audioDurationSec = msg.audio.length / 16000;

    const rawChunks: RawWhisperChunk[] = Array.isArray(result?.chunks)
      ? result.chunks
      : result?.text
      ? [{ text: String(result.text), timestamp: [0, audioDurationSec] }]
      : [];

    const chunks = rawChunks
      .map((chunk) => {
        const text = String(chunk.text || '').trim();
        const rawStart = chunk.timestamp?.[0];
        const rawEnd = chunk.timestamp?.[1];
        const startSec =
          typeof rawStart === 'number' && Number.isFinite(rawStart)
            ? Math.max(0, rawStart)
            : 0;
        const endSec =
          typeof rawEnd === 'number' && Number.isFinite(rawEnd) && rawEnd > startSec
            ? rawEnd
            : Math.min(audioDurationSec, startSec + Math.max(1.2, text.length * 0.1));
        return {
          startSec: Number(startSec.toFixed(2)),
          endSec: Number(endSec.toFixed(2)),
          text,
        };
      })
      .filter((c) => c.text.length > 0);

    self.postMessage({
      type: 'result',
      id: msg.id,
      chunks,
      modelId,
      backend,
    });
  } catch (err) {
    self.postMessage({
      type: 'error',
      id: msg.id,
      error:
        err instanceof Error
          ? err.message
          : 'เกิดข้อผิดพลาดระหว่างถอดเสียงด้วย Whisper บนเครื่อง',
    });
  }
};
