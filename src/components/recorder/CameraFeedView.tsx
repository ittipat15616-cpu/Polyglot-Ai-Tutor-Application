import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  BG_PRESETS,
  BgEffectId,
  CAM_FILTER_PRESETS,
  CamFilterId,
} from './types';

const MEDIAPIPE_VISION_CDN =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3';

interface MediaPipeSegmentationResult {
  confidenceMasks?: Array<{
    width: number;
    height: number;
    getAsFloat32Array: () => Float32Array;
  }>;
  close?: () => void;
}

interface MediaPipeImageSegmenter {
  segmentForVideo: (
    video: HTMLVideoElement,
    timestampMs: number
  ) => MediaPipeSegmentationResult;
}

// Singleton MediaPipe segmenter promise so it initializes at most once per session
let segmenterPromise: Promise<MediaPipeImageSegmenter> | null = null;

async function getSelfieSegmenter(): Promise<MediaPipeImageSegmenter> {
  if (segmenterPromise) return segmenterPromise;

  segmenterPromise = (async () => {
    const visionModuleUrl = `${MEDIAPIPE_VISION_CDN}/vision_bundle.mjs`;
    const { FilesetResolver, ImageSegmenter } = await import(
      /* @vite-ignore */ visionModuleUrl
    );
    const vision = await FilesetResolver.forVisionTasks(
      `${MEDIAPIPE_VISION_CDN}/wasm`
    );
    try {
      return await ImageSegmenter.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: '/mediapipe/selfie_segmenter.tflite',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        outputCategoryMask: false,
        outputConfidenceMasks: true,
      });
    } catch {
      // Fallback to CPU delegate if WebGL2/GPU delegate is unavailable
      return await ImageSegmenter.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: '/mediapipe/selfie_segmenter.tflite',
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        outputCategoryMask: false,
        outputConfidenceMasks: true,
      });
    }
  })().catch((err) => {
    segmenterPromise = null;
    throw err;
  });

  return segmenterPromise;
}

interface CameraFeedViewProps {
  stream: MediaStream | null;
  bgEffect: BgEffectId;
  customBgUrl: string | null;
  filterId: CamFilterId;
  isMirrored: boolean;
  highRes?: boolean;
  className?: string;
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number
) {
  const imgRatio = img.naturalWidth / Math.max(1, img.naturalHeight);
  const canvasRatio = w / Math.max(1, h);
  let drawW = w;
  let drawH = h;
  let offsetX = 0;
  let offsetY = 0;

  if (imgRatio > canvasRatio) {
    drawH = h;
    drawW = h * imgRatio;
    offsetX = -(drawW - w) / 2;
  } else {
    drawW = w;
    drawH = w / imgRatio;
    offsetY = -(drawH - h) / 2;
  }
  ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
}

export default function CameraFeedView({
  stream,
  bgEffect,
  customBgUrl,
  filterId,
  isMirrored,
  highRes = false,
  className = '',
}: CameraFeedViewProps) {
  const rawVideoRef = useRef<HTMLVideoElement | null>(null);
  const hiddenVideoRef = useRef<HTMLVideoElement | null>(null);
  const outCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [segmenterError, setSegmenterError] = useState(false);

  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const bgEffectRef = useRef<BgEffectId>(bgEffect);
  const filterCssRef = useRef<string>(CAM_FILTER_PRESETS[filterId].css);

  bgEffectRef.current = bgEffect;
  filterCssRef.current = CAM_FILTER_PRESETS[filterId].css;

  const needsSegmentation = bgEffect !== 'none' && !segmenterError;

  // Load background image whenever preset or customBgUrl changes
  useEffect(() => {
    const preset = BG_PRESETS.find((b) => b.id === bgEffect);
    const src = bgEffect === 'custom' ? customBgUrl : preset?.imageUrl || null;

    if (!src) {
      bgImageRef.current = null;
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!cancelled) bgImageRef.current = img;
    };
    img.src = src;

    return () => {
      cancelled = true;
    };
  }, [bgEffect, customBgUrl]);

  // Bind stream to direct raw video when segmentation is OFF
  useEffect(() => {
    if (needsSegmentation) return;
    const el = rawVideoRef.current;
    if (!el || !stream) return;
    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }
    el.play().catch(() => {});
  }, [stream, needsSegmentation]);

  // Run real-time MediaPipe Selfie Segmentation loop when background effect is active
  useEffect(() => {
    if (!needsSegmentation || !stream) {
      setIsLoadingModel(false);
      return;
    }

    let active = true;
    let rafId: number | null = null;
    const videoEl = hiddenVideoRef.current;
    const outCanvas = outCanvasRef.current;
    if (!videoEl || !outCanvas) return;

    if (videoEl.srcObject !== stream) {
      videoEl.srcObject = stream;
    }
    videoEl.play().catch(() => {});

    const targetW = highRes ? 960 : 512;
    const targetH = highRes ? 540 : 384;
    outCanvas.width = targetW;
    outCanvas.height = targetH;

    const outCtx = outCanvas.getContext('2d', { willReadFrequently: false });
    if (!outCtx) return;

    // Reusable off-screen canvases for clean alpha-feathered foreground compositing
    const maskCanvas = document.createElement('canvas');
    const maskCtx = maskCanvas.getContext('2d');
    const fgCanvas = document.createElement('canvas');
    fgCanvas.width = targetW;
    fgCanvas.height = targetH;
    const fgCtx = fgCanvas.getContext('2d');

    if (!maskCtx || !fgCtx) return;

    let maskImageData: ImageData | null = null;
    let lastTimestamp = -1;

    setIsLoadingModel(true);

    getSelfieSegmenter()
      .then((segmenter) => {
        if (!active) return;
        setIsLoadingModel(false);

        const renderFrame = () => {
          if (!active) return;

          if (
            videoEl.readyState >= 2 &&
            videoEl.videoWidth > 0 &&
            videoEl.videoHeight > 0
          ) {
            const nowMs = performance.now();
            // MediaPipe VIDEO mode requires strictly monotonically increasing timestamps
            const ts = nowMs <= lastTimestamp ? lastTimestamp + 1 : nowMs;
            lastTimestamp = ts;

            try {
              const result = segmenter.segmentForVideo(videoEl, ts);
              const masks = result.confidenceMasks;
              const personMask =
                masks && masks.length > 0
                  ? masks.length >= 2
                    ? masks[1]
                    : masks[0]
                  : null;

              if (personMask) {
                const mw = personMask.width;
                const mh = personMask.height;

                if (maskCanvas.width !== mw || maskCanvas.height !== mh) {
                  maskCanvas.width = mw;
                  maskCanvas.height = mh;
                  maskImageData = maskCtx.createImageData(mw, mh);
                }

                const floatData = personMask.getAsFloat32Array();
                if (maskImageData) {
                  const px = maskImageData.data;
                  for (let i = 0; i < floatData.length; i++) {
                    // Smoothstep feathering for clean edges around hair & shoulders
                    const raw = floatData[i];
                    const t = Math.max(0, Math.min(1, (raw - 0.28) / 0.44));
                    const alpha = Math.round(t * t * (3 - 2 * t) * 255);
                    const idx = i * 4;
                    px[idx] = 255;
                    px[idx + 1] = 255;
                    px[idx + 2] = 255;
                    px[idx + 3] = alpha;
                  }
                  maskCtx.putImageData(maskImageData, 0, 0);
                }

                const activeBg = bgEffectRef.current;
                const activeFilter = filterCssRef.current;

                // 1. Draw Background Layer
                outCtx.save();
                outCtx.clearRect(0, 0, targetW, targetH);

                if (activeBg === 'blur-soft' || activeBg === 'blur-strong') {
                  const blurPx = activeBg === 'blur-strong' ? 16 : 8;
                  outCtx.filter = `${activeFilter !== 'none' ? activeFilter + ' ' : ''}blur(${blurPx}px)`;
                  // Slight 1.06x overscan eliminates dark blurred edges
                  const padX = targetW * 0.03;
                  const padY = targetH * 0.03;
                  outCtx.drawImage(
                    videoEl,
                    -padX,
                    -padY,
                    targetW + padX * 2,
                    targetH + padY * 2
                  );
                } else if (bgImageRef.current) {
                  // Draw studio background unmirrored even if canvas CSS flips, so text/room stays natural
                  outCtx.filter = 'none';
                  drawCoverImage(outCtx, bgImageRef.current, targetW, targetH);
                } else {
                  // Fallback sleek slate gradient while custom image loads
                  const grad = outCtx.createLinearGradient(0, 0, targetW, targetH);
                  grad.addColorStop(0, '#1e1b4b');
                  grad.addColorStop(1, '#0f172a');
                  outCtx.fillStyle = grad;
                  outCtx.fillRect(0, 0, targetW, targetH);
                }
                outCtx.restore();

                // 2. Build Masked Person Foreground on fgCanvas
                fgCtx.save();
                fgCtx.globalCompositeOperation = 'source-over';
                fgCtx.clearRect(0, 0, targetW, targetH);
                fgCtx.filter = activeFilter !== 'none' ? activeFilter : 'none';
                fgCtx.drawImage(videoEl, 0, 0, targetW, targetH);

                fgCtx.globalCompositeOperation = 'destination-in';
                fgCtx.filter = 'blur(1.5px)';
                fgCtx.drawImage(maskCanvas, 0, 0, targetW, targetH);
                fgCtx.restore();

                // 3. Composite Foreground Person cleanly over Background
                outCtx.drawImage(fgCanvas, 0, 0, targetW, targetH);
              }

              result.close();
            } catch {
              // On transient frame error, draw raw video so feed never freezes
              outCtx.drawImage(videoEl, 0, 0, targetW, targetH);
            }
          }

          rafId = requestAnimationFrame(renderFrame);
        };

        rafId = requestAnimationFrame(renderFrame);
      })
      .catch((err) => {
        console.warn('[CameraFeedView] MediaPipe segmentation unavailable:', err);
        if (active) {
          setIsLoadingModel(false);
          setSegmenterError(true);
        }
      });

    return () => {
      active = false;
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [needsSegmentation, stream, highRes]);

  const filterCss = CAM_FILTER_PRESETS[filterId].css;

  if (!needsSegmentation) {
    return (
      <video
        ref={rawVideoRef}
        autoPlay
        playsInline
        muted
        style={{ filter: filterCss !== 'none' ? filterCss : undefined }}
        className={`w-full h-full object-cover pointer-events-none ${
          isMirrored ? '-scale-x-100' : ''
        } ${className}`}
      />
    );
  }

  return (
    <div className={`relative w-full h-full overflow-hidden ${className}`}>
      {/* Hidden source video driving segmentation */}
      <video
        ref={hiddenVideoRef}
        autoPlay
        playsInline
        muted
        className="hidden"
      />

      {/* Live segmented output canvas */}
      <canvas
        ref={outCanvasRef}
        className={`w-full h-full object-cover pointer-events-none ${
          isMirrored ? '-scale-x-100' : ''
        }`}
      />

      {isLoadingModel && (
        <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-xs flex flex-col items-center justify-center text-white gap-1.5">
          <Loader2 size={20} className="animate-spin text-indigo-400" />
          <span className="text-[11px] font-medium">กำลังเตรียม AI ตัดฉากหลัง...</span>
        </div>
      )}
    </div>
  );
}
