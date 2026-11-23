import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Compass,
  MapPin,
  Plus,
  Search,
  Star,
  User,
  Briefcase,
  Coffee,
  Users,
  GraduationCap,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import {
  ALL_ROLEPLAY_MISSIONS,
  DIFFICULTY_META,
  ROLEPLAY_CATEGORIES,
  RoleplayCategoryId,
  RoleplayDifficulty,
  RoleplayMission,
  RoleplayProgressRecord,
} from '../../data/roleplay';

interface RoleplayLobbyProps {
  activeLang: 'EN' | 'CN';
  progressMap: Record<string, RoleplayProgressRecord>;
  isLoadingProgress?: boolean;
  onSelectMission: (mission: RoleplayMission) => void;
  onOpenCustomMission: () => void;
}

const CATEGORY_ICONS: Record<RoleplayCategoryId, React.ReactNode> = {
  travel: <Compass className="w-4 h-4" />,
  daily: <Coffee className="w-4 h-4" />,
  work: <Briefcase className="w-4 h-4" />,
  social: <Users className="w-4 h-4" />,
  study_emergency: <GraduationCap className="w-4 h-4" />,
};

export const RoleplayLobby: React.FC<RoleplayLobbyProps> = ({
  activeLang,
  progressMap,
  isLoadingProgress = false,
  onSelectMission,
  onOpenCustomMission,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<RoleplayCategoryId>('travel');
  const [difficultyFilter, setDifficultyFilter] = useState<'all' | RoleplayDifficulty>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'todo' | 'done'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const stats = useMemo(() => {
    let completedCount = 0;
    let totalStars = 0;
    const perCategory: Record<RoleplayCategoryId, { done: number; total: number; stars: number }> = {
      travel: { done: 0, total: 0, stars: 0 },
      daily: { done: 0, total: 0, stars: 0 },
      work: { done: 0, total: 0, stars: 0 },
      social: { done: 0, total: 0, stars: 0 },
      study_emergency: { done: 0, total: 0, stars: 0 },
    };

    for (const m of ALL_ROLEPLAY_MISSIONS) {
      perCategory[m.category].total += 1;
      const rec = progressMap[m.id];
      if (rec) {
        if (rec.completed) {
          completedCount += 1;
          perCategory[m.category].done += 1;
        }
        const s = Math.max(0, Math.min(3, rec.stars || 0));
        totalStars += s;
        perCategory[m.category].stars += s;
      }
    }

    return {
      completedCount,
      totalMissions: ALL_ROLEPLAY_MISSIONS.length,
      totalStars,
      maxStars: ALL_ROLEPLAY_MISSIONS.length * 3,
      perCategory,
    };
  }, [progressMap]);

  const trimmedQuery = searchQuery.trim().toLowerCase();

  const filteredMissions = useMemo(() => {
    return ALL_ROLEPLAY_MISSIONS.filter((m) => {
      // When searching globally, search across all 5 categories; otherwise filter by selected category
      if (!trimmedQuery && m.category !== selectedCategory) return false;
      if (difficultyFilter !== 'all' && m.difficulty !== difficultyFilter) return false;

      const rec = progressMap[m.id];
      const isDone = Boolean(rec?.completed);
      if (statusFilter === 'done' && !isDone) return false;
      if (statusFilter === 'todo' && isDone) return false;

      if (trimmedQuery) {
        const hay = `${m.titleTh} ${m.titleEn} ${m.location} ${m.scenarioTh} ${m.aiRoleTitleTh} ${m.aiRoleName}`.toLowerCase();
        if (!hay.includes(trimmedQuery)) return false;
      }
      return true;
    });
  }, [selectedCategory, difficultyFilter, statusFilter, trimmedQuery, progressMap]);

  const activeCategoryMeta = ROLEPLAY_CATEGORIES.find((c) => c.id === selectedCategory) || ROLEPLAY_CATEGORIES[0];
  const progressPercent = stats.totalMissions > 0
    ? Math.round((stats.completedCount / stats.totalMissions) * 100)
    : 0;

  return (
    <div className="w-full max-w-6xl mx-auto flex flex-col gap-5 pb-10">
      {/* Top Overview & Action Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-600">
              <span>Real-Life Roleplay Missions</span>
              <span className="text-slate-300">·</span>
              <span>{activeLang === 'CN' ? 'ฝึกพูดภาษาจีน 100 ด่าน' : 'ฝึกพูดภาษาอังกฤษ 100 ด่าน'}</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              จำลองสถานการณ์จริง ฝึกพูดโต้ตอบกับคู่สนทนา AI
            </h2>
            <p className="text-sm text-slate-600 max-w-2xl">
              เลือกด่านไหนก็ได้ตามใจไม่มีล็อก อ่านการ์ดภารกิจได้ไม่จำกัดเวลา พร้อมระบบติ๊กภารกิจอัตโนมัติและใบสรุปผลหลังจบสายฟรี
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onOpenCustomMission}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-sm transition-colors whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>สร้างด่านเอง</span>
            </button>
          </div>
        </div>

        {/* Progress Summary Bar */}
        <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-700 tabular-nums">
            <span className="font-semibold text-slate-900">
              ผ่านแล้ว {stats.completedCount}/{stats.totalMissions} ด่าน
            </span>
            <span className="text-slate-300">·</span>
            <span className="inline-flex items-center gap-1 font-medium text-amber-700">
              <Star className="w-4 h-4 fill-amber-400 text-amber-500" />
              ดาวสะสม {stats.totalStars}/{stats.maxStars} ดาว
            </span>
            {isLoadingProgress && (
              <span className="text-xs text-slate-400">กำลังซิงค์สถิติ...</span>
            )}
          </div>

          <div className="w-full sm:w-56 flex items-center gap-2.5">
            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-600 rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-xs font-semibold text-slate-600 tabular-nums w-9 text-right">
              {progressPercent}%
            </span>
          </div>
        </div>
      </div>

      {/* 5 Category Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {ROLEPLAY_CATEGORIES.map((cat) => {
          const isSelected = !trimmedQuery && selectedCategory === cat.id;
          const catStats = stats.perCategory[cat.id];
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                setSelectedCategory(cat.id);
                if (searchQuery) setSearchQuery('');
              }}
              className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-sm font-medium transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                isSelected
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300 hover:text-indigo-700'
              }`}
            >
              {CATEGORY_ICONS[cat.id]}
              <span>{cat.shortNameTh}</span>
              <span
                className={`text-xs tabular-nums font-semibold ${
                  isSelected ? 'text-indigo-100' : 'text-slate-400'
                }`}
              >
                {catStats.done}/{catStats.total}
              </span>
            </button>
          );
        })}
      </div>

      {/* Category Description + Search + Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50/80 border border-slate-200/80 rounded-xl px-4 py-3">
        <div className="min-w-0">
          {trimmedQuery ? (
            <div className="text-sm text-slate-700">
              ผลการค้นหา <span className="font-semibold text-slate-900">"{searchQuery}"</span> จากทุกหมวด ({filteredMissions.length} ด่าน)
            </div>
          ) : (
            <div>
              <div className="text-sm font-semibold text-slate-900">{activeCategoryMeta.nameTh}</div>
              <div className="text-xs text-slate-500 mt-0.5">{activeCategoryMeta.descriptionTh}</div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Search input */}
          <div className="relative flex-1 sm:flex-initial">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหาด่าน เช่น สนามบิน, สัมภาษณ์..."
              className="w-full sm:w-52 pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          {/* Difficulty select */}
          <select
            value={difficultyFilter}
            onChange={(e) => setDifficultyFilter(e.target.value as 'all' | RoleplayDifficulty)}
            className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:border-indigo-400 cursor-pointer"
            aria-label="กรองระดับความยาก"
          >
            <option value="all">ทุกระดับ</option>
            <option value="easy">ระดับง่าย</option>
            <option value="medium">ระดับกลาง</option>
            <option value="hard">ระดับสูง</option>
          </select>

          {/* Status select */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'todo' | 'done')}
            className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:border-indigo-400 cursor-pointer"
            aria-label="กรองสถานะการผ่าน"
          >
            <option value="all">ทุกสถานะ</option>
            <option value="todo">ยังไม่ผ่าน</option>
            <option value="done">ผ่านแล้ว</option>
          </select>
        </div>
      </div>

      {/* Missions Grid */}
      {filteredMissions.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center">
          <p className="text-slate-700 font-medium">ไม่พบด่านที่ตรงกับเงื่อนไขการค้นหา</p>
          <p className="text-sm text-slate-500 mt-1">
            ลองล้างตัวกรอง หรือกดปุ่ม "สร้างด่านเอง" เพื่อออกแบบสถานการณ์ที่คุณต้องการได้เลยครับ
          </p>
          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setDifficultyFilter('all');
                setStatusFilter('all');
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              ล้างตัวกรอง
            </button>
            <button
              type="button"
              onClick={onOpenCustomMission}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              สร้างด่านเอง
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMissions.map((mission) => {
            const rec = progressMap[mission.id];
            const isCompleted = Boolean(rec?.completed);
            const stars = rec?.stars || 0;
            const diffMeta = DIFFICULTY_META[mission.difficulty];
            const levelCode = activeLang === 'CN' ? diffMeta.hskCn : diffMeta.cefrEn;

            return (
              <button
                key={mission.id}
                type="button"
                onClick={() => onSelectMission(mission)}
                className={`group text-left bg-white rounded-2xl border p-4 sm:p-5 transition-all flex flex-col justify-between gap-3.5 cursor-pointer hover:shadow-md ${
                  isCompleted
                    ? 'border-emerald-200/90 hover:border-emerald-400'
                    : 'border-slate-200 hover:border-indigo-300'
                }`}
              >
                <div className="space-y-2">
                  {/* Top metadata line: clean inline text with dot separators */}
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1.5 min-w-0 truncate">
                      <span className="font-bold text-slate-400 tabular-nums">
                        #{String(mission.number).padStart(2, '0')}
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className={`font-semibold ${diffMeta.colorClass}`}>
                        {diffMeta.labelTh} ({levelCode})
                      </span>
                    </div>

                    {isCompleted && (
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold shrink-0">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        ผ่านแล้ว
                      </span>
                    )}
                  </div>

                  {/* Title */}
                  <div>
                    <h3 className="text-base font-bold text-slate-900 group-hover:text-indigo-700 transition-colors leading-snug">
                      {mission.titleTh}
                    </h3>
                    <div className="text-xs text-slate-400 font-medium mt-0.5 truncate">
                      {mission.titleEn}
                    </div>
                  </div>

                  {/* Scenario preview */}
                  <p className="text-xs sm:text-sm text-slate-600 line-clamp-2 leading-relaxed">
                    {mission.scenarioTh}
                  </p>
                </div>

                {/* Card Footer: Character & Stars */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-1.5 text-xs text-slate-700 font-medium truncate">
                      <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">
                        {mission.aiRoleName} ({mission.aiRoleTitleTh})
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 truncate">
                      <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="truncate">{mission.location}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {stars > 0 ? (
                      <div className="flex items-center gap-0.5" title={`สถิติสูงสุด ${stars}/3 ดาว`}>
                        {[1, 2, 3].map((n) => (
                          <Star
                            key={n}
                            className={`w-4 h-4 ${
                              n <= stars
                                ? 'fill-amber-400 text-amber-500'
                                : 'text-slate-200'
                            }`}
                          />
                        ))}
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-indigo-600 group-hover:translate-x-0.5 transition-transform whitespace-nowrap">
                        ดูภารกิจ
                        <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
