import React, { useState } from 'react';
import {
  Pause,
  Play,
  Square,
  Mic,
  MicOff,
  Maximize2,
  Circle,
  VideoOff,
  EyeOff,
  ExternalLink,
  Volume2,
  VolumeX,
  Image as ImageIcon,
} from 'lucide-react';
import {
  BG_PRESETS,
  BgEffectId,
  CAM_FILTER_PRESETS,
  CamFilterId,
  CamMode,
  CamSize,
  RecorderPhase,
  formatDuration,
} from './types';

interface StudioControlDockProps {
  phase: RecorderPhase;
  elapsedSec: number;
  micMuted: boolean;
  micLevel: number;
  hasTabAudio: boolean;
  tabAudioMuted: boolean;
  camMode: CamMode;
  camSize: CamSize;
  bgEffect: BgEffectId;
  customBgUrl: string | null;
  filterId: CamFilterId;
  isPoppedOut: boolean;
  supportsPip: boolean;
  isHidden: boolean;
  onTogglePause: () => void;
  onStop: () => void;
  onToggleMic: () => void;
  onToggleTabAudio: () => void;
  onCamModeChange: (mode: CamMode) => void;
  onCamSizeChange: (size: CamSize) => void;
  onBgEffectChange: (bg: BgEffectId) => void;
  onFilterChange: (filter: CamFilterId) => void;
  onTogglePopout: () => void;
  onToggleHide: () => void;
}

export default function StudioControlDock({
  phase,
  elapsedSec,
  micMuted,
  micLevel,
  hasTabAudio,
  tabAudioMuted,
  camMode,
  camSize,
  bgEffect,
  customBgUrl,
  filterId,
  isPoppedOut,
  supportsPip,
  isHidden,
  onTogglePause,
  onStop,
  onToggleMic,
  onToggleTabAudio,
  onCamModeChange,
  onCamSizeChange,
  onBgEffectChange,
  onFilterChange,
  onTogglePopout,
  onToggleHide,
}: StudioControlDockProps) {
  const [showBgPopover, setShowBgPopover] = useState(false);
  const isPaused = phase === 'paused';

  if (!isPoppedOut && isHidden) {
    return null;
  }

  const content = (
    <div
      className={`flex flex-wrap items-center gap-2 bg-slate-900/95 text-slate-100 border border-white/15 backdrop-blur-md shadow-2xl select-none ${
        isPoppedOut
          ? 'w-full rounded-xl px-3 py-2.5 justify-between'
          : 'rounded-2xl px-3 py-2'
      }`}
    >
      {/* Live status & tabular elapsed timer */}
      <div className="flex items-center gap-2 pr-2 border-r border-white/10">
        <span
          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
            isPaused ? 'bg-amber-400' : 'bg-red-500 animate-pulse'
          }`}
          aria-hidden="true"
        />
        <span className="font-mono text-sm font-semibold tabular-nums tracking-tight text-white">
          {formatDuration(elapsedSec)}
        </span>
        {isPaused && (
          <span className="text-[11px] font-medium text-amber-300 whitespace-nowrap">
            พักไว้
          </span>
        )}
      </div>

      {/* Transport controls: Pause / Resume & Stop */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onTogglePause}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
            isPaused
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
              : 'bg-white/10 hover:bg-white/15 text-slate-100'
          }`}
          title={isPaused ? 'อัดต่อ (Alt+P)' : 'พักชั่วคราว (Alt+P)'}
        >
          {isPaused ? <Play size={14} /> : <Pause size={14} />}
          <span>{isPaused ? 'อัดต่อ' : 'พัก'}</span>
        </button>

        <button
          type="button"
          onClick={onStop}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-colors whitespace-nowrap shadow-sm"
          title="หยุดอัดและดูพรีวิว (Alt+S)"
        >
          <Square size={12} className="fill-current" />
          <span>หยุดอัด</span>
        </button>
      </div>

      <div className="h-5 w-px bg-white/10 hidden sm:block" />

      {/* Audio controls */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onToggleMic}
          className={`relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
            micMuted
              ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30'
              : 'bg-white/10 hover:bg-white/15 text-slate-100'
          }`}
          title={micMuted ? 'เปิดไมโครโฟน (Alt+M)' : 'ปิดไมโครโฟน (Alt+M)'}
        >
          {micMuted ? <MicOff size={14} /> : <Mic size={14} className="text-emerald-400" />}
          {!micMuted && (
            <span className="w-6 h-1.5 bg-white/15 rounded-full overflow-hidden inline-flex items-center">
              <span
                className="h-full bg-emerald-400 transition-transform duration-75 origin-left w-full"
                style={{ transform: `scaleX(${Math.max(0.08, Math.min(1, micLevel / 100))})` }}
              />
            </span>
          )}
        </button>

        {hasTabAudio && (
          <button
            type="button"
            onClick={onToggleTabAudio}
            className={`p-1.5 rounded-lg transition-colors ${
              tabAudioMuted
                ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
                : 'bg-white/10 hover:bg-white/15 text-slate-200'
            }`}
            title={tabAudioMuted ? 'เปิดเสียงจากในแอป' : 'ปิดเสียงจากในแอปชั่วคราว'}
          >
            {tabAudioMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
        )}
      </div>

      <div className="h-5 w-px bg-white/10 hidden sm:block" />

      {/* Camera Mode Segmented Control */}
      <div className="flex items-center gap-0.5 p-0.5 bg-white/5 rounded-lg border border-white/10">
        <button
          type="button"
          onClick={() => onCamModeChange('circle')}
          className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
            camMode === 'circle'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-300 hover:text-white'
          }`}
          title="กล้องวงกลมมุมซ้ายล่าง (Alt+F)"
        >
          <Circle size={12} />
          <span className="hidden md:inline">วงกลม</span>
        </button>
        <button
          type="button"
          onClick={() => onCamModeChange('fullscreen')}
          className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
            camMode === 'fullscreen'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-300 hover:text-white'
          }`}
          title="สลับกล้องเต็มจอพูดเปิดคลิป (Alt+F)"
        >
          <Maximize2 size={12} />
          <span className="hidden md:inline">เต็มจอ</span>
        </button>
        <button
          type="button"
          onClick={() => onCamModeChange('hidden')}
          className={`p-1.5 rounded-md text-xs transition-colors ${
            camMode === 'hidden'
              ? 'bg-slate-700 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
          title="ซ่อนกล้องชั่วคราว"
        >
          <VideoOff size={12} />
        </button>
      </div>

      {/* Circle Size Selector */}
      {camMode === 'circle' && (
        <div className="flex items-center gap-0.5 p-0.5 bg-white/5 rounded-lg border border-white/10">
          {(['sm', 'md', 'lg'] as CamSize[]).map((sz) => (
            <button
              key={sz}
              type="button"
              onClick={() => onCamSizeChange(sz)}
              className={`px-1.5 py-1 rounded-md text-[11px] font-mono font-semibold uppercase transition-colors ${
                camSize === sz
                  ? 'bg-white text-slate-900'
                  : 'text-slate-400 hover:text-white'
              }`}
              title={`ขนาดกล้องวงกลม ${sz.toUpperCase()}`}
            >
              {sz === 'sm' ? 'S' : sz === 'md' ? 'M' : 'L'}
            </button>
          ))}
        </div>
      )}

      {/* Live Background & Filter Switcher Button */}
      {camMode !== 'hidden' && (
        <button
          type="button"
          onClick={() => setShowBgPopover((v) => !v)}
          className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
            showBgPopover || bgEffect !== 'none'
              ? 'bg-indigo-600/90 text-white'
              : 'bg-white/10 hover:bg-white/15 text-slate-200'
          }`}
          title="สลับฉากหลังและฟิลเตอร์กล้องขณะอัด"
        >
          <ImageIcon size={13} />
          <span className="hidden lg:inline">ฉากหลัง</span>
        </button>
      )}

      {/* Window visibility / Pop-out controls */}
      <div className="flex items-center gap-1 pl-1 border-l border-white/10">
        {supportsPip && !isPoppedOut && (
          <button
            type="button"
            onClick={onTogglePopout}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-slate-200 hover:text-white text-xs font-medium transition-colors whitespace-nowrap"
            title="แยกแถบควบคุมออกเป็นหน้าต่างเล็กนอกจอ เพื่อให้คลิปสะอาดไม่มีปุ่มอัดติดในวิดีโอ"
          >
            <ExternalLink size={13} />
            <span className="hidden lg:inline">แยกแถบออกนอกจอ</span>
          </button>
        )}

        {!isPoppedOut && (
          <button
            type="button"
            onClick={onToggleHide}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-slate-300 hover:text-white transition-colors"
            title="ซ่อนแถบควบคุมจากหน้าจอ (กด Alt+H เพื่อเรียกกลับ)"
          >
            <EyeOff size={14} />
          </button>
        )}
      </div>
    </div>
  );

  const bgPopover = showBgPopover && camMode !== 'hidden' && (
    <div className="mb-2 p-3 rounded-2xl bg-slate-900/95 border border-white/15 text-white shadow-2xl backdrop-blur-md space-y-2.5 w-full max-w-md ml-auto">
      <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300">
        <span>สลับฉากหลังกล้อง (เรียลไทม์)</span>
        <button
          type="button"
          onClick={() => setShowBgPopover(false)}
          className="text-slate-400 hover:text-white"
        >
          ปิด
        </button>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
        {BG_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onBgEffectChange(preset.id)}
            className={`relative h-11 rounded-lg overflow-hidden border text-[10px] font-semibold flex items-end justify-center p-1 transition-all ${
              bgEffect === preset.id
                ? 'border-indigo-400 ring-2 ring-indigo-500/40'
                : 'border-white/15 hover:border-white/40'
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
                    ? 'bg-slate-800'
                    : preset.id === 'blur-soft'
                    ? 'bg-gradient-to-br from-slate-600 to-slate-800'
                    : 'bg-gradient-to-br from-indigo-900 to-slate-900'
                }`}
              />
            )}
            <span className="relative z-10 px-1 rounded bg-black/65 text-white truncate max-w-full">
              {preset.label}
            </span>
          </button>
        ))}
        {customBgUrl && (
          <button
            type="button"
            onClick={() => onBgEffectChange('custom')}
            className={`relative h-11 rounded-lg overflow-hidden border text-[10px] font-semibold flex items-end justify-center p-1 ${
              bgEffect === 'custom'
                ? 'border-indigo-400 ring-2 ring-indigo-500/40'
                : 'border-white/15'
            }`}
          >
            <img
              src={customBgUrl}
              alt="รูปของฉัน"
              className="absolute inset-0 w-full h-full object-cover"
            />
            <span className="relative z-10 px-1 rounded bg-black/65 text-white truncate max-w-full">
              รูปของฉัน
            </span>
          </button>
        )}
      </div>

      {/* Filter row */}
      <div className="flex items-center gap-1.5 pt-1 border-t border-white/10">
        <span className="text-[11px] text-slate-400 mr-1">ฟิลเตอร์:</span>
        {(Object.keys(CAM_FILTER_PRESETS) as CamFilterId[]).map((fid) => (
          <button
            key={fid}
            type="button"
            onClick={() => onFilterChange(fid)}
            className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap ${
              filterId === fid
                ? 'bg-indigo-600 text-white'
                : 'bg-white/10 text-slate-300 hover:text-white'
            }`}
          >
            {CAM_FILTER_PRESETS[fid].label}
          </button>
        ))}
      </div>
    </div>
  );

  if (isPoppedOut) {
    return (
      <div className="w-full flex flex-col gap-1.5">
        {bgPopover}
        {content}
        <p className="text-[11px] text-slate-400 text-center">
          แถบนี้แยกอยู่นอกแท็บที่อัด · คีย์ลัด: Alt+F เต็มจอ · Alt+P พัก · Alt+S หยุด
        </p>
      </div>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-[98] max-w-[calc(100vw-2rem)] flex flex-col items-end">
      {bgPopover}
      {content}
    </div>
  );
}
