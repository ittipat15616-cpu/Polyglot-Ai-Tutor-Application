import React, { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import { AlertTriangle, RefreshCw, Play, Pause } from 'lucide-react';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady?: () => void;
    __ytApiPromise?: Promise<void>;
  }
}

export interface YouTubePlayerHandle {
  seekTo: (seconds: number, autoPlay?: boolean) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  setPlaybackRate: (rate: number) => void;
  getCurrentTime: () => number;
}

interface YouTubeKaraokePlayerProps {
  videoId: string;
  alternativeVideoIds?: string[];
  playbackRate: number;
  onTimeUpdate: (currentTimeSec: number, isPlaying: boolean) => void;
  onPlayStateChange?: (isPlaying: boolean) => void;
  onDurationReady?: (durationSec: number) => void;
  onVideoSwitched?: (newVideoId: string) => void;
}

function loadYouTubeIframeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (window.__ytApiPromise) return window.__ytApiPromise;

  window.__ytApiPromise = new Promise<void>((resolve) => {
    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (prevReady) prevReady();
      resolve();
    };
    const existingScript = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    if (!existingScript) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;
      document.head.appendChild(tag);
    }
    // Safety poll in case YT already finished loading
    const check = setInterval(() => {
      if (window.YT && window.YT.Player) {
        clearInterval(check);
        resolve();
      }
    }, 150);
  });

  return window.__ytApiPromise;
}

export const YouTubeKaraokePlayer = forwardRef<YouTubePlayerHandle, YouTubeKaraokePlayerProps>(
  (
    {
      videoId,
      alternativeVideoIds = [],
      playbackRate,
      onTimeUpdate,
      onPlayStateChange,
      onDurationReady,
      onVideoSwitched,
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const playerRef = useRef<any>(null);
    const isPlayingRef = useRef(false);
    const [activeVideoId, setActiveVideoId] = useState(videoId);
    const [altIndex, setAltIndex] = useState(0);
    const [embedError, setEmbedError] = useState<string | null>(null);
    const [isReady, setIsReady] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);

    const onTimeUpdateRef = useRef(onTimeUpdate);
    onTimeUpdateRef.current = onTimeUpdate;
    const onPlayStateChangeRef = useRef(onPlayStateChange);
    onPlayStateChangeRef.current = onPlayStateChange;
    const onDurationReadyRef = useRef(onDurationReady);
    onDurationReadyRef.current = onDurationReady;
    const onVideoSwitchedRef = useRef(onVideoSwitched);
    onVideoSwitchedRef.current = onVideoSwitched;
    const alternativeVideoIdsRef = useRef(alternativeVideoIds);
    alternativeVideoIdsRef.current = alternativeVideoIds;
    const triedVideoIdsRef = useRef<Set<string>>(new Set([videoId]));

    useEffect(() => {
      triedVideoIdsRef.current = new Set([videoId]);
      setActiveVideoId(videoId);
      setAltIndex(0);
      setEmbedError(null);
    }, [videoId]);

    useImperativeHandle(ref, () => ({
      seekTo(seconds: number, autoPlay = true) {
        const p = playerRef.current;
        if (!p || typeof p.seekTo !== 'function') return;
        const safeSec = Math.max(0, seconds);
        p.seekTo(safeSec, true);
        if (autoPlay && typeof p.playVideo === 'function') {
          p.playVideo();
        }
        onTimeUpdateRef.current(safeSec, autoPlay || isPlayingRef.current);
      },
      play() {
        playerRef.current?.playVideo?.();
      },
      pause() {
        playerRef.current?.pauseVideo?.();
      },
      togglePlay() {
        if (isPlayingRef.current) {
          playerRef.current?.pauseVideo?.();
        } else {
          playerRef.current?.playVideo?.();
        }
      },
      setPlaybackRate(rate: number) {
        try {
          playerRef.current?.setPlaybackRate?.(rate);
        } catch {}
      },
      getCurrentTime() {
        try {
          return Number(playerRef.current?.getCurrentTime?.()) || 0;
        } catch {
          return 0;
        }
      },
    }));

    useEffect(() => {
      let cancelled = false;
      setIsReady(false);
      setEmbedError(null);

      loadYouTubeIframeApi().then(() => {
        if (cancelled || !containerRef.current) return;

        // Destroy previous player cleanly
        if (playerRef.current) {
          try {
            playerRef.current.destroy();
          } catch {}
          playerRef.current = null;
        }

        // Create a dedicated mount node inside containerRef so React DOM never conflicts with YT's iframe replacement
        containerRef.current.innerHTML = '';
        const mountEl = document.createElement('div');
        mountEl.className = 'w-full h-full';
        containerRef.current.appendChild(mountEl);

        playerRef.current = new window.YT.Player(mountEl, {
          videoId: activeVideoId,
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: 0,
            controls: 1,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            enablejsapi: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (e: any) => {
              if (cancelled) return;
              setIsReady(true);
              try {
                e.target.setPlaybackRate(playbackRate);
                const dur = Number(e.target.getDuration?.()) || 0;
                if (dur > 0) onDurationReadyRef.current?.(dur);
              } catch {}
            },
            onStateChange: (e: any) => {
              if (cancelled) return;
              const playing = e.data === window.YT?.PlayerState?.PLAYING;
              isPlayingRef.current = playing;
              setIsPlaying(playing);
              onPlayStateChangeRef.current?.(playing);
              try {
                const t = Number(e.target.getCurrentTime?.()) || 0;
                onTimeUpdateRef.current(t, playing);
              } catch {}
            },
            onError: (e: any) => {
              if (cancelled) return;
              const code = Number(e?.data);
              triedVideoIdsRef.current.add(activeVideoId);

              // Auto-switch silently to next untried backup video on embed/unavailable error (101/150/100/2/5)
              const nextIdx = alternativeVideoIdsRef.current.findIndex(
                (id) => id && !triedVideoIdsRef.current.has(id)
              );
              if (nextIdx !== -1) {
                const nextId = alternativeVideoIdsRef.current[nextIdx];
                triedVideoIdsRef.current.add(nextId);
                setAltIndex(nextIdx + 1);
                setEmbedError(null);
                setActiveVideoId(nextId);
                onVideoSwitchedRef.current?.(nextId);
                return;
              }

              // All backups exhausted -> show recovery UI
              if (code === 101 || code === 150 || code === 100 || code === 2) {
                setEmbedError('วิดีโอต้นฉบับนี้ปิดการเล่นแบบฝัง (Embed) บน YouTube');
              } else {
                setEmbedError('ไม่สามารถโหลดวิดีโอนี้ได้ชั่วคราว');
              }
            },
          },
        });
      });

      return () => {
        cancelled = true;
        if (playerRef.current) {
          try {
            playerRef.current.destroy();
          } catch {}
          playerRef.current = null;
        }
      };
    }, [activeVideoId]);

    // Update playback speed seamlessly without reloading video
    useEffect(() => {
      if (isReady && playerRef.current?.setPlaybackRate) {
        try {
          playerRef.current.setPlaybackRate(playbackRate);
        } catch {}
      }
    }, [playbackRate, isReady]);

    // High-precision 60ms time sync loop for smooth karaoke sweep
    useEffect(() => {
      const timer = setInterval(() => {
        const p = playerRef.current;
        if (!p || typeof p.getCurrentTime !== 'function') return;
        if (isPlayingRef.current) {
          try {
            const t = Number(p.getCurrentTime()) || 0;
            onTimeUpdateRef.current(t, true);
          } catch {}
        }
      }, 60);
      return () => clearInterval(timer);
    }, []);

    const handleSwitchBackupVideo = () => {
      if (altIndex < alternativeVideoIds.length) {
        const nextId = alternativeVideoIds[altIndex];
        setAltIndex((i) => i + 1);
        setEmbedError(null);
        setActiveVideoId(nextId);
        onVideoSwitched?.(nextId);
      }
    };

    const hasBackup = altIndex < alternativeVideoIds.length;

    return (
      <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-slate-900 border border-slate-200 shadow-sm">
        <div ref={containerRef} className="w-full h-full" />

        {/* Embed-disabled auto-recovery overlay */}
        {embedError && (
          <div className="absolute inset-0 z-20 bg-white/95 backdrop-blur-xs flex flex-col items-center justify-center p-5 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center">
              <AlertTriangle size={24} />
            </div>
            <div className="space-y-1 max-w-xs">
              <p className="text-sm font-bold text-slate-900">{embedError}</p>
              <p className="text-xs text-slate-500">
                ไม่ต้องกังวลครับ ระบบเตรียมคลิปสำรองของเพลงเดียวกันไว้ให้แล้ว
              </p>
            </div>
            {hasBackup ? (
              <button
                type="button"
                onClick={handleSwitchBackupVideo}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm transition-all"
              >
                <RefreshCw size={14} />
                <span>สลับวิดีโอสำรองอัตโนมัติ</span>
              </button>
            ) : (
              <p className="text-xs text-rose-600 font-medium">
                กรุณากลับไปค้นหาคลิปเวอร์ชัน Lyric Video อื่นของเพลงนี้แทนครับ
              </p>
            )}
          </div>
        )}

        {/* Quick Play/Pause pill indicator on bottom corner when ready (optional unobtrusive status) */}
        {isReady && !embedError && (
          <button
            type="button"
            onClick={() => (isPlaying ? playerRef.current?.pauseVideo?.() : playerRef.current?.playVideo?.())}
            className="sr-only"
            aria-label={isPlaying ? 'หยุดเพลง' : 'เล่นเพลง'}
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
          </button>
        )}
      </div>
    );
  }
);

YouTubeKaraokePlayer.displayName = 'YouTubeKaraokePlayer';
export default YouTubeKaraokePlayer;
