import React, { useEffect, useRef, useState } from 'react';
import { Check, Download, Share2, Smartphone, Square, X } from 'lucide-react';
import { ProgressDashboardData } from '../../services/progressAnalyticsService';
import {
  canvasToPngBlob,
  renderAchievementCardToCanvas,
  ShareCardFormat,
  ShareCardTheme,
} from '../../utils/shareCardCanvas';

interface ShareAchievementCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: ProgressDashboardData;
  defaultName: string;
}

const THEME_OPTIONS: Array<{ id: ShareCardTheme; label: string; swatch: string }> = [
  { id: 'minimal', label: 'สว่างมินิมอล', swatch: 'bg-white border-slate-300' },
  { id: 'navy', label: 'กรมท่าพรีเมียม', swatch: 'bg-slate-900 border-indigo-400' },
  { id: 'emerald', label: 'เอเมอรัลด์สดใส', swatch: 'bg-emerald-800 border-emerald-300' },
];

export const ShareAchievementCardModal: React.FC<ShareAchievementCardModalProps> = ({
  isOpen,
  onClose,
  data,
  defaultName,
}) => {
  const [format, setFormat] = useState<ShareCardFormat>('square');
  const [theme, setTheme] = useState<ShareCardTheme>('minimal');
  const [displayName, setDisplayName] = useState<string>(defaultName || 'ผู้เรียน Polyglot AI');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (defaultName) setDisplayName(defaultName);
  }, [defaultName]);

  useEffect(() => {
    if (!isOpen || !canvasRef.current) return;
    renderAchievementCardToCanvas(canvasRef.current, {
      data,
      displayName,
      format,
      theme,
    });
  }, [isOpen, data, displayName, format, theme]);

  if (!isOpen) return null;

  const fileName = `polyglot-progress-${data.lang.toLowerCase()}-${format}-${new Date()
    .toISOString()
    .slice(0, 10)}.png`;

  const handleDownload = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const blob = await canvasToPngBlob(canvas);
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1500);

    setStatusMsg('บันทึกรูปการ์ด PNG เรียบร้อยแล้ว');
    setTimeout(() => setStatusMsg(null), 2500);
  };

  const handleNativeShare = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const blob = await canvasToPngBlob(canvas);
    if (!blob) return;

    const file = new File([blob], fileName, { type: 'image/png' });
    const nav = navigator as any;
    if (nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
      try {
        await nav.share({
          title: 'สรุปพัฒนาการเรียนภาษาส่วนตัว',
          text: `เรียนต่อเนื่อง ${data.currentStreakDays} วัน · คำศัพท์ SRS ${data.srsTotalWords} คำ`,
          files: [file],
        });
        setStatusMsg('แชร์การ์ดผลงานเรียบร้อยแล้ว');
        setTimeout(() => setStatusMsg(null), 2500);
        return;
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
      }
    }
    // Graceful fallback on desktop browsers without Web Share File API
    await handleDownload();
  };

  return (
    <div className="fixed inset-0 z-[130] bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-4xl overflow-hidden my-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">
              สร้างการ์ดสรุปผลงานสำหรับแชร์
            </h2>
            <p className="text-xs text-slate-500">
              วาดภาพ PNG ความละเอียดสูงบนอุปกรณ์ของคุณโดยตรง (ฟรี 0 เครดิต)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body: Controls Left + Live Canvas Preview Right */}
        <div className="grid grid-cols-1 md:grid-cols-12">
          {/* Controls */}
          <div className="md:col-span-5 p-6 border-b md:border-b-0 md:border-r border-slate-100 space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                ชื่อที่จะแสดงบนการ์ด
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={36}
                placeholder="ชื่อของคุณ"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 focus:outline-none focus:border-indigo-400"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">
                ขนาดรูปภาพ
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setFormat('square')}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-bold transition-colors cursor-pointer ${
                    format === 'square'
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <Square size={14} />
                  <span>1:1 โพสต์ Feed</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFormat('story')}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-bold transition-colors cursor-pointer ${
                    format === 'story'
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <Smartphone size={14} />
                  <span>9:16 Story</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">
                ธีมสีการ์ด
              </label>
              <div className="space-y-2">
                {THEME_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setTheme(opt.id)}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-xs font-bold transition-colors cursor-pointer ${
                      theme === opt.id
                        ? 'bg-indigo-50 border-indigo-300 text-indigo-900'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <span className={`w-4 h-4 rounded-full border ${opt.swatch}`} />
                      <span>{opt.label}</span>
                    </span>
                    {theme === opt.id && <Check size={14} className="text-indigo-600" />}
                  </button>
                ))}
              </div>
            </div>

            {statusMsg && (
              <div className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2.5 flex items-center gap-2">
                <Check size={14} />
                <span>{statusMsg}</span>
              </div>
            )}

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={handleDownload}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Download size={15} />
                <span>บันทึกรูป PNG ความละเอียดสูง</span>
              </button>
              <button
                type="button"
                onClick={handleNativeShare}
                className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Share2 size={14} />
                <span>แชร์ทันที (รองรับมือถือ / Social)</span>
              </button>
            </div>
          </div>

          {/* Live Canvas Preview */}
          <div className="md:col-span-7 p-6 bg-slate-50 flex flex-col items-center justify-center min-h-[380px]">
            <div className="text-[11px] font-semibold text-slate-400 mb-3 tabular-nums">
              ตัวอย่างขนาดจริง ({format === 'story' ? '1080 × 1920 px' : '1080 × 1080 px'})
            </div>
            <div className="w-full flex items-center justify-center">
              <canvas
                ref={canvasRef}
                className={`rounded-2xl shadow-lg border border-slate-200/80 ${
                  format === 'story'
                    ? 'max-h-[460px] w-auto'
                    : 'max-w-[380px] w-full h-auto'
                }`}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShareAchievementCardModal;
