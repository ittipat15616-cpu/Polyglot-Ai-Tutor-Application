import React, { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  Award,
  BookMarked,
  Calendar,
  Flame,
  Loader2,
  Music,
  RefreshCw,
  Share2,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import {
  loadProgressDashboardData,
  ProgressDashboardData,
  ScoreTrendPoint,
} from '../../services/progressAnalyticsService';
import { WordbookLang } from '../../types/wordbook';
import ShareAchievementCardModal from './ShareAchievementCardModal';

interface ProgressDashboardViewProps {
  lang: WordbookLang;
  userName?: string;
  onOpenWordbookDue?: () => void;
  onOpenMistakes?: () => void;
  onNavigateTab?: (tabId: string) => void;
}

function SkillRadarSvg({
  skills,
  isChinese,
}: {
  skills: ProgressDashboardData['skills'];
  isChinese: boolean;
}) {
  // 4-axis diamond radar: top = vocab, right = exam, bottom = listening, left = speaking
  const cx = 110;
  const cy = 110;
  const maxR = 76;

  const getVal = (idx: number) => Math.max(8, Math.min(100, skills[idx]?.score || 0)) / 100;

  const pts = [
    [cx, cy - maxR * getVal(0)],
    [cx + maxR * getVal(1), cy],
    [cx, cy + maxR * getVal(2)],
    [cx - maxR * getVal(3), cy],
  ];

  const polygonPoints = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const strokeColor = isChinese ? '#E11D48' : '#4F46E5';
  const fillColor = isChinese ? 'rgba(225, 29, 72, 0.14)' : 'rgba(79, 70, 229, 0.14)';

  return (
    <svg viewBox="0 0 220 220" className="w-48 h-48 mx-auto shrink-0 select-none">
      {/* Concentric reference diamonds */}
      {[0.25, 0.5, 0.75, 1].map((scale) => {
        const r = maxR * scale;
        const dPts = `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`;
        return (
          <polygon
            key={scale}
            points={dPts}
            fill="none"
            stroke="#E2E8F0"
            strokeWidth={scale === 1 ? 1.5 : 1}
          />
        );
      })}
      {/* Cross axes */}
      <line x1={cx} y1={cy - maxR} x2={cx} y2={cy + maxR} stroke="#E2E8F0" strokeWidth="1" />
      <line x1={cx - maxR} y1={cy} x2={cx + maxR} y2={cy} stroke="#E2E8F0" strokeWidth="1" />

      {/* Data polygon */}
      <polygon
        points={polygonPoints}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />

      {/* Vertex dots */}
      {pts.map(([x, y], idx) => (
        <circle
          key={idx}
          cx={x}
          cy={y}
          r="4"
          fill="#FFFFFF"
          stroke={strokeColor}
          strokeWidth="2.5"
        />
      ))}

      {/* Axis labels */}
      <text x={cx} y="16" textAnchor="middle" className="fill-slate-600 text-[11px] font-bold">
        {skills[0]?.shortLabelTh || 'คำศัพท์'}
      </text>
      <text x="214" y={cy + 4} textAnchor="end" className="fill-slate-600 text-[11px] font-bold">
        {skills[1]?.shortLabelTh || 'ข้อสอบ'}
      </text>
      <text x={cx} y="210" textAnchor="middle" className="fill-slate-600 text-[11px] font-bold">
        {skills[2]?.shortLabelTh || 'การฟัง'}
      </text>
      <text x="6" y={cy + 4} textAnchor="start" className="fill-slate-600 text-[11px] font-bold">
        {skills[3]?.shortLabelTh || 'การพูด'}
      </text>
    </svg>
  );
}

function ScoreTrendChart({
  points,
  isChinese,
}: {
  points: ScoreTrendPoint[];
  isChinese: boolean;
}) {
  const [selectedIdx, setSelectedIdx] = useState<number>(Math.max(0, points.length - 1));

  useEffect(() => {
    setSelectedIdx(Math.max(0, points.length - 1));
  }, [points.length]);

  const W = 640;
  const H = 200;
  const padL = 38;
  const padR = 18;
  const padT = 18;
  const padB = 30;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const coords = points.map((p, idx) => {
    const x =
      points.length === 1
        ? padL + innerW / 2
        : padL + (idx / (points.length - 1)) * innerW;
    const y = padT + innerH - (Math.max(0, Math.min(100, p.pct)) / 100) * innerH;
    return { x, y, point: p };
  });

  const linePath = coords
    .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(' ');
  const areaPath =
    coords.length > 1
      ? `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${(padT + innerH).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(padT + innerH).toFixed(1)} Z`
      : '';

  const strokeColor = isChinese ? '#E11D48' : '#4F46E5';
  const fillStop = isChinese ? '#FB7185' : '#818CF8';
  const activePoint = coords[selectedIdx]?.point || points[points.length - 1];

  return (
    <div className="space-y-3">
      {activePoint && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-slate-50 border border-slate-200/80 rounded-xl px-3.5 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                activePoint.kind === 'mock' ? 'bg-amber-500' : isChinese ? 'bg-rose-600' : 'bg-indigo-600'
              }`}
            />
            <span className="font-bold text-slate-800 truncate">{activePoint.title}</span>
            <span className="text-slate-400">· {activePoint.dateLabel}</span>
          </div>
          <span className="font-extrabold text-slate-900 tabular-nums shrink-0">
            คะแนน {activePoint.pct}%
          </span>
        </div>
      )}

      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[340px] h-auto select-none">
          <defs>
            <linearGradient id="scoreTrendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={fillStop} stopOpacity="0.22" />
              <stop offset="100%" stopColor={fillStop} stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Horizontal Y gridlines (0, 50, 100) */}
          {[0, 50, 100].map((val) => {
            const y = padT + innerH - (val / 100) * innerH;
            return (
              <g key={val}>
                <line
                  x1={padL}
                  y1={y}
                  x2={W - padR}
                  y2={y}
                  stroke="#E2E8F0"
                  strokeDasharray={val === 0 ? undefined : '4 4'}
                  strokeWidth="1"
                />
                <text
                  x={padL - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-slate-400 text-[10px] font-mono"
                >
                  {val}%
                </text>
              </g>
            );
          })}

          {areaPath && <path d={areaPath} fill="url(#scoreTrendFill)" />}
          {coords.length > 1 && (
            <path
              d={linePath}
              fill="none"
              stroke={strokeColor}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {coords.map((c, idx) => {
            const isSelected = idx === selectedIdx;
            const showLabel =
              points.length <= 7 ||
              idx === 0 ||
              idx === points.length - 1 ||
              idx === selectedIdx;

            return (
              <g
                key={c.point.id}
                onMouseEnter={() => setSelectedIdx(idx)}
                onClick={() => setSelectedIdx(idx)}
                className="cursor-pointer"
              >
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={isSelected ? 7 : 4.5}
                  fill={isSelected ? strokeColor : '#FFFFFF'}
                  stroke={strokeColor}
                  strokeWidth="2.5"
                />
                {showLabel && (
                  <text
                    x={c.x}
                    y={H - 8}
                    textAnchor="middle"
                    className={`text-[10px] font-medium ${
                      isSelected ? 'fill-slate-800 font-bold' : 'fill-slate-400'
                    }`}
                  >
                    {c.point.dateLabel}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export const ProgressDashboardView: React.FC<ProgressDashboardViewProps> = ({
  lang,
  userName,
  onOpenWordbookDue,
  onOpenMistakes,
  onNavigateTab,
}) => {
  const isChinese = lang === 'CN';
  const [data, setData] = useState<ProgressDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isShareOpen, setIsShareOpen] = useState(false);

  const fetchDashboard = async () => {
    setIsLoading(true);
    try {
      const result = await loadProgressDashboardData(lang);
      setData(result);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
    const onDataChange = () => {
      loadProgressDashboardData(lang).then(setData).catch(() => {});
    };
    window.addEventListener('wordbook_updated', onDataChange);
    window.addEventListener('mistakes_updated', onDataChange);
    window.addEventListener('shadowing_updated', onDataChange);
    window.addEventListener('reading_updated', onDataChange);
    return () => {
      window.removeEventListener('wordbook_updated', onDataChange);
      window.removeEventListener('mistakes_updated', onDataChange);
      window.removeEventListener('shadowing_updated', onDataChange);
      window.removeEventListener('reading_updated', onDataChange);
    };
  }, [lang]);

  if (isLoading && !data) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200 p-12 flex flex-col items-center justify-center gap-3 text-slate-500">
        <Loader2 size={24} className="animate-spin text-indigo-600" />
        <span className="text-sm font-medium">กำลังรวบรวมสถิติพัฒนาการของคุณ...</span>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Header Row with Primary Share Card CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            สรุปพัฒนาการ{isChinese ? 'ภาษาจีนกลาง' : 'ภาษาอังกฤษ'}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            คำนวณจากประวัติการเรียนจริงในบัญชีของคุณทั้งหมด (สมุด SRS, ข้อสอบ, คาราโอเกะ และสถานการณ์พูด)
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={fetchDashboard}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
            title="อัปเดตสถิติล่าสุด"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            <span>รีเฟรช</span>
          </button>

          <button
            type="button"
            onClick={() => setIsShareOpen(true)}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-xs font-extrabold transition-colors cursor-pointer whitespace-nowrap ${
              isChinese
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            <Share2 size={14} />
            <span>สร้างการ์ดแชร์ผลงาน (PNG)</span>
          </button>
        </div>
      </div>

      {/* Top 4 Real KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>เรียนต่อเนื่อง (Streak)</span>
            <Flame size={15} className="text-amber-500" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 tabular-nums mt-1.5">
            {data.currentStreakDays} <span className="text-sm font-bold text-slate-500">วัน</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
            สูงสุด {data.longestStreakDays} วัน · {data.activeDaysLast28}/28 วันล่าสุด
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>สมุดคำศัพท์ SRS</span>
            <BookMarked size={15} className={isChinese ? 'text-rose-600' : 'text-indigo-600'} />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 tabular-nums mt-1.5">
            {data.srsTotalWords} <span className="text-sm font-bold text-slate-500">คำ</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5 tabular-nums flex items-center justify-between gap-1">
            <span>จำแม่น {data.srsMasteredWords} คำ</span>
            {data.srsDueToday > 0 && onOpenWordbookDue && (
              <button
                type="button"
                onClick={onOpenWordbookDue}
                className="text-indigo-600 hover:underline font-bold cursor-pointer"
              >
                ทบทวน {data.srsDueToday} คำ →
              </button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>คะแนนสอบสูงสุด</span>
            <Award size={15} className="text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 tabular-nums mt-1.5">
            {data.totalExamsCount > 0 ? `${data.bestExamPct}%` : '—'}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
            {data.totalExamsCount > 0
              ? `เฉลี่ย ${data.avgExamPct}% จากทั้งหมด ${data.totalExamsCount} ครั้ง`
              : 'ยังไม่มีประวัติการสอบ'}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>พูด & ฟังจากสื่อจริง</span>
            <Music size={15} className="text-sky-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 tabular-nums mt-1.5">
            {data.roleplayCompletedCount}{' '}
            <span className="text-sm font-bold text-slate-500">ภารกิจ</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
            {data.roleplayTotalStars} ดาว · ร้องคาราโอเกะ {data.karaokeSongsPlayed} เพลง
          </div>
        </div>
      </div>

      {/* Mistake Notebook Mastery Strip (shown when user has logged mistakes) */}
      {data.mistakesTotal > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center shrink-0">
              <ShieldCheck size={20} />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-extrabold text-slate-900 tabular-nums">
                กำจัดจุดอ่อนไปแล้ว {data.mistakesMasteryPct}% ({data.mistakesMastered}/{data.mistakesTotal} ข้อ)
              </div>
              <div className="text-xs text-slate-500 tabular-nums">
                {data.mistakesActive > 0
                  ? `ยังเหลือจุดอ่อนรอซ่อมอีก ${data.mistakesActive} ข้อ`
                  : 'ยอดเยี่ยมมาก! คุณซ่อมจุดอ่อนที่มีอยู่ผ่านครบทุกข้อแล้ว'}
              </div>
            </div>
          </div>

          {onOpenMistakes && (
            <button
              type="button"
              onClick={onOpenMistakes}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shrink-0 cursor-pointer"
            >
              <span>{data.mistakesActive > 0 ? 'ไปติวซ่อมจุดอ่อน' : 'ดูสมุดจุดอ่อน'}</span>
              <ArrowUpRight size={13} />
            </button>
          )}
        </div>
      )}

      {/* Two-Column Analytical Section: 4-Skill Balance + 28-Day Calendar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* 4-Skill Balance */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-extrabold text-slate-900">สมดุล 4 ทักษะภาษา</h3>
              <p className="text-xs text-slate-500">
                สะท้อนจากการฝึกจริงในแต่ละหมวดของภาษา{isChinese ? 'จีน' : 'อังกฤษ'}
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-5">
            <SkillRadarSvg skills={data.skills} isChinese={isChinese} />

            <div className="flex-1 w-full space-y-3.5">
              {data.skills.map((skill) => (
                <div key={skill.id} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-slate-800">{skill.labelTh}</span>
                    <span className="font-extrabold text-slate-900 tabular-nums">
                      {skill.score}%
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        isChinese ? 'bg-rose-600' : 'bg-indigo-600'
                      }`}
                      style={{ width: `${skill.score}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                    <span className="truncate">{skill.detailTh}</span>
                    {onNavigateTab && (
                      <button
                        type="button"
                        onClick={() => onNavigateTab(skill.targetTab)}
                        className="inline-flex items-center gap-0.5 font-bold text-indigo-600 hover:text-indigo-800 shrink-0 cursor-pointer"
                      >
                        <span>ฝึกต่อ</span>
                        <ArrowUpRight size={11} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 28-Day Consistency Heatmap */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-1.5">
                <Calendar size={16} className="text-slate-500" />
                <span>ความสม่ำเสมอ 28 วันล่าสุด</span>
              </h3>
              <span className="text-xs font-bold text-slate-700 tabular-nums">
                {data.activeDaysLast28} / 28 วัน
              </span>
            </div>
            <p className="text-xs text-slate-500">
              บันทึกอัตโนมัติทุกวันที่คุณทบทวนศัพท์ ทำข้อสอบ ร้องเพลง หรือฝึกพูด
            </p>
          </div>

          <div className="grid grid-cols-7 gap-2">
            {data.calendar28Days.map((cell) => {
              const colorCls =
                cell.level === 0
                  ? 'bg-slate-100 text-slate-400 border-slate-200/70'
                  : cell.level === 1
                  ? isChinese
                    ? 'bg-rose-100 text-rose-800 border-rose-200'
                    : 'bg-indigo-100 text-indigo-800 border-indigo-200'
                  : cell.level === 2
                  ? isChinese
                    ? 'bg-rose-400 text-white border-rose-500'
                    : 'bg-indigo-400 text-white border-indigo-500'
                  : isChinese
                  ? 'bg-rose-600 text-white border-rose-700'
                  : 'bg-indigo-600 text-white border-indigo-700';

              return (
                <div
                  key={cell.dateKey}
                  title={`${cell.dateKey} (${cell.weekdayTh}): ${cell.count > 0 ? `มีกิจกรรมเรียน (${cell.count} แต้มกิจกรรม)` : 'ยังไม่มีบันทึกกิจกรรม'}`}
                  className={`aspect-square rounded-xl border flex flex-col items-center justify-center text-[11px] font-bold tabular-nums transition-colors ${colorCls} ${
                    cell.isToday ? 'ring-2 ring-amber-400 ring-offset-1' : ''
                  }`}
                >
                  <span>{cell.dayNum}</span>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
            <span>กรอบสีทอง = วันนี้</span>
            <div className="flex items-center gap-1.5">
              <span>น้อย</span>
              <span className="w-3 h-3 rounded bg-slate-100 border border-slate-200" />
              <span
                className={`w-3 h-3 rounded ${isChinese ? 'bg-rose-100' : 'bg-indigo-100'}`}
              />
              <span
                className={`w-3 h-3 rounded ${isChinese ? 'bg-rose-400' : 'bg-indigo-400'}`}
              />
              <span
                className={`w-3 h-3 rounded ${isChinese ? 'bg-rose-600' : 'bg-indigo-600'}`}
              />
              <span>มาก</span>
            </div>
          </div>
        </div>
      </div>

      {/* Score Trend Section */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-1.5">
              <TrendingUp size={16} className={isChinese ? 'text-rose-600' : 'text-indigo-600'} />
              <span>แนวโน้มคะแนนสอบล่าสุด (สอบศัพท์ & จำลองสอบ)</span>
            </h3>
            <p className="text-xs text-slate-500">
              แสดงย้อนหลังสูงสุด 12 ครั้งล่าสุดของภาษา{isChinese ? 'จีน' : 'อังกฤษ'} — แตะที่จุดเพื่อดูรายละเอียดแต่ละครั้ง
            </p>
          </div>
          {data.totalExamsCount > 0 && (
            <div className="text-xs text-slate-500 tabular-nums">
              สอบศัพท์ {data.vocabExamsCount} ครั้ง · จำลองสอบ {data.mockExamsCount} ครั้ง
            </div>
          )}
        </div>

        {data.scoreTrend.length === 0 ? (
          <div className="rounded-2xl bg-slate-50 border border-slate-200/80 p-8 text-center space-y-3">
            <p className="text-sm font-bold text-slate-700">
              ยังไม่มีประวัติคะแนนสอบภาษา{isChinese ? 'จีน' : 'อังกฤษ'}
            </p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              เมื่อคุณทำแบบทดสอบในหน้า “สอบศัพท์” หรือ “จำลองสอบ” กราฟพัฒนาการคะแนนจะอัปเดตให้ที่นี่โดยอัตโนมัติครับ
            </p>
            {onNavigateTab && (
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => onNavigateTab('vocab_exam')}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
                >
                  ไปทำแบบสอบศัพท์
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateTab('mocktests')}
                  className="px-4 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  ไปหน้าจำลองสอบ
                </button>
              </div>
            )}
          </div>
        ) : (
          <ScoreTrendChart points={data.scoreTrend} isChinese={isChinese} />
        )}
      </div>

      {/* Share Achievement Card Modal (100% Client-Side Canvas) */}
      <ShareAchievementCardModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        data={data}
        defaultName={userName || 'ผู้เรียน Polyglot AI'}
      />
    </div>
  );
};

export default ProgressDashboardView;
