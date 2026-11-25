import { ProgressDashboardData } from '../services/progressAnalyticsService';

export type ShareCardFormat = 'square' | 'story';
export type ShareCardTheme = 'minimal' | 'navy' | 'emerald';

interface ThemePalette {
  bgTop: string;
  bgBottom: string;
  cardBg: string;
  cardBorder: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentSoft: string;
  accentText: string;
  barTrack: string;
  barFill: string;
  streakBg: string;
  streakText: string;
  footerDivider: string;
}

function getPalette(theme: ShareCardTheme, isChinese: boolean): ThemePalette {
  if (theme === 'navy') {
    return {
      bgTop: '#0F172A',
      bgBottom: '#1E1B4B',
      cardBg: 'rgba(255, 255, 255, 0.07)',
      cardBorder: 'rgba(255, 255, 255, 0.14)',
      textPrimary: '#F8FAFC',
      textSecondary: '#CBD5E1',
      textMuted: '#94A3B8',
      accent: isChinese ? '#FB7185' : '#818CF8',
      accentSoft: isChinese ? 'rgba(251, 113, 133, 0.18)' : 'rgba(129, 140, 248, 0.18)',
      accentText: isChinese ? '#FDA4AF' : '#C7D2FE',
      barTrack: 'rgba(255, 255, 255, 0.12)',
      barFill: isChinese ? '#FB7185' : '#818CF8',
      streakBg: 'rgba(251, 191, 36, 0.18)',
      streakText: '#FDE68A',
      footerDivider: 'rgba(255, 255, 255, 0.12)',
    };
  }

  if (theme === 'emerald') {
    return {
      bgTop: '#064E3B',
      bgBottom: '#0F766E',
      cardBg: 'rgba(255, 255, 255, 0.11)',
      cardBorder: 'rgba(255, 255, 255, 0.2)',
      textPrimary: '#FFFFFF',
      textSecondary: '#D1FAE5',
      textMuted: '#A7F3D0',
      accent: '#34D399',
      accentSoft: 'rgba(52, 211, 153, 0.22)',
      accentText: '#ECFDF5',
      barTrack: 'rgba(255, 255, 255, 0.16)',
      barFill: '#6EE7B7',
      streakBg: 'rgba(254, 240, 138, 0.22)',
      streakText: '#FEF08A',
      footerDivider: 'rgba(255, 255, 255, 0.18)',
    };
  }

  // 'minimal' — crisp editorial light theme
  return {
    bgTop: '#F8FAFC',
    bgBottom: isChinese ? '#FFF1F2' : '#EEF2FF',
    cardBg: '#FFFFFF',
    cardBorder: '#E2E8F0',
    textPrimary: '#0F172A',
    textSecondary: '#475569',
    textMuted: '#64748B',
    accent: isChinese ? '#E11D48' : '#4F46E5',
    accentSoft: isChinese ? '#FFE4E6' : '#E0E7FF',
    accentText: isChinese ? '#BE123C' : '#3730A3',
    barTrack: '#E2E8F0',
    barFill: isChinese ? '#E11D48' : '#4F46E5',
    streakBg: '#FEF3C7',
    streakText: '#B45309',
    footerDivider: '#E2E8F0',
  };
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

const FONT_STACK =
  '"Plus Jakarta Sans", "Prompt", "Sarabun", "Noto Sans Thai", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut}…`;
}

/**
 * 100% Client-Side HTML5 Canvas Achievement Card Renderer (0 Baht Cost).
 * Produces high-resolution 1080x1080 (1:1 Feed) or 1080x1920 (9:16 Story) PNG cards.
 */
export function renderAchievementCardToCanvas(
  canvas: HTMLCanvasElement,
  params: {
    data: ProgressDashboardData;
    displayName: string;
    format: ShareCardFormat;
    theme: ShareCardTheme;
  }
): void {
  const { data, displayName, format, theme } = params;
  const isStory = format === 'story';
  const isChinese = data.lang === 'CN';
  const W = 1080;
  const H = isStory ? 1920 : 1080;

  canvas.width = W;
  canvas.height = H;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const palette = getPalette(theme, isChinese);

  // 1. Background gradient
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, palette.bgTop);
  grad.addColorStop(1, palette.bgBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Subtle decorative geometric accent circles (clean, non-noisy)
  ctx.save();
  ctx.globalAlpha = theme === 'minimal' ? 0.35 : 0.14;
  ctx.fillStyle = palette.accentSoft;
  ctx.beginPath();
  ctx.arc(W - 80, 120, 260, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(90, H - 140, 220, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const padX = 76;
  const contentW = W - padX * 2;
  let y = isStory ? 120 : 72;

  // 2. Top brand row + Language label
  ctx.fillStyle = palette.accentSoft;
  drawRoundedRect(ctx, padX, y, isChinese ? 290 : 320, 52, 16);
  ctx.fill();

  ctx.font = `700 24px ${FONT_STACK}`;
  ctx.fillStyle = palette.accentText;
  ctx.textBaseline = 'middle';
  ctx.fillText(
    isChinese ? 'ภาษาจีนกลาง (CN)' : 'ภาษาอังกฤษ (EN)',
    padX + 24,
    y + 27
  );

  const dateLabel = new Date().toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  ctx.font = `600 22px ${FONT_STACK}`;
  ctx.fillStyle = palette.textMuted;
  ctx.textAlign = 'right';
  ctx.fillText(dateLabel, padX + contentW, y + 27);
  ctx.textAlign = 'left';

  y += isStory ? 102 : 82;

  // 3. Learner Title & Subtitle
  const safeName = (displayName || 'ผู้เรียน Polyglot AI').trim();
  ctx.font = `800 ${isStory ? 60 : 50}px ${FONT_STACK}`;
  ctx.fillStyle = palette.textPrimary;
  ctx.fillText(truncateText(ctx, safeName, contentW), padX, y + 28);

  y += isStory ? 74 : 58;
  ctx.font = `500 ${isStory ? 30 : 25}px ${FONT_STACK}`;
  ctx.fillStyle = palette.textSecondary;
  ctx.fillText('สรุปพัฒนาการการเรียนภาษาส่วนตัว', padX, y + 16);

  y += isStory ? 84 : 60;

  // 4. Hero Streak Banner Card
  const heroH = isStory ? 210 : 148;
  ctx.fillStyle = palette.cardBg;
  drawRoundedRect(ctx, padX, y, contentW, heroH, 28);
  ctx.fill();
  ctx.strokeStyle = palette.cardBorder;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Left: Streak number
  ctx.fillStyle = palette.streakBg;
  drawRoundedRect(ctx, padX + 28, y + (heroH - 96) / 2, 96, 96, 24);
  ctx.fill();

  ctx.font = `800 44px ${FONT_STACK}`;
  ctx.fillStyle = palette.streakText;
  ctx.textAlign = 'center';
  ctx.fillText(String(data.currentStreakDays), padX + 76, y + heroH / 2 + 2);
  ctx.textAlign = 'left';

  ctx.font = `800 ${isStory ? 42 : 34}px ${FONT_STACK}`;
  ctx.fillStyle = palette.textPrimary;
  ctx.fillText(
    `เรียนต่อเนื่อง ${data.currentStreakDays} วัน`,
    padX + 150,
    y + heroH / 2 - 18
  );

  ctx.font = `500 ${isStory ? 26 : 22}px ${FONT_STACK}`;
  ctx.fillStyle = palette.textSecondary;
  ctx.fillText(
    `สถิติสูงสุด ${data.longestStreakDays} วัน  •  เรียนจริง ${data.activeDaysLast28}/28 วันล่าสุด`,
    padX + 150,
    y + heroH / 2 + 28
  );

  y += heroH + (isStory ? 44 : 28);

  // 5. 4-Metric Grid (2x2)
  const gap = 24;
  const cellW = (contentW - gap) / 2;
  const cellH = isStory ? 210 : 148;

  const statCells = [
    {
      label: 'สมุดคำศัพท์ SRS',
      value: `${data.srsTotalWords} คำ`,
      sub: `จำแม่นระยะยาว ${data.srsMasteredWords} คำ`,
    },
    {
      label: 'คะแนนสอบสูงสุด',
      value: data.totalExamsCount > 0 ? `${data.bestExamPct}%` : '-',
      sub:
        data.totalExamsCount > 0
          ? `เฉลี่ย ${data.avgExamPct}% (${data.totalExamsCount} ครั้ง)`
          : 'ยังไม่มีประวัติสอบ',
    },
    {
      label: 'สถานการณ์พูด Roleplay',
      value: `${data.roleplayCompletedCount} ภารกิจ`,
      sub: `สะสม ${data.roleplayTotalStars} ดาว`,
    },
    {
      label: 'ฝึกฟังคาราโอเกะ',
      value: `${data.karaokeSongsPlayed} เพลง`,
      sub: `ฝึกฟังรวม ${data.karaokeTotalPlays} รอบ`,
    },
  ];

  statCells.forEach((cell, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const cx = padX + col * (cellW + gap);
    const cy = y + row * (cellH + gap);

    ctx.fillStyle = palette.cardBg;
    drawRoundedRect(ctx, cx, cy, cellW, cellH, 24);
    ctx.fill();
    ctx.strokeStyle = palette.cardBorder;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = `600 ${isStory ? 25 : 21}px ${FONT_STACK}`;
    ctx.fillStyle = palette.textMuted;
    ctx.fillText(cell.label, cx + 28, cy + (isStory ? 46 : 36));

    ctx.font = `800 ${isStory ? 54 : 42}px ${FONT_STACK}`;
    ctx.fillStyle = palette.textPrimary;
    ctx.fillText(cell.value, cx + 28, cy + (isStory ? 114 : 84));

    ctx.font = `500 ${isStory ? 23 : 19}px ${FONT_STACK}`;
    ctx.fillStyle = palette.textSecondary;
    ctx.fillText(truncateText(ctx, cell.sub, cellW - 56), cx + 28, cy + (isStory ? 168 : 122));
  });

  y += cellH * 2 + gap + (isStory ? 48 : 30);

  // 6. 4-Skill Progress Panel
  const skillsCardH = isStory ? 460 : 268;
  ctx.fillStyle = palette.cardBg;
  drawRoundedRect(ctx, padX, y, contentW, skillsCardH, 28);
  ctx.fill();
  ctx.strokeStyle = palette.cardBorder;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.font = `700 ${isStory ? 30 : 24}px ${FONT_STACK}`;
  ctx.fillStyle = palette.textPrimary;
  ctx.fillText('สมดุล 4 ทักษะภาษา', padX + 32, y + (isStory ? 52 : 40));

  const barStartY = y + (isStory ? 108 : 80);
  const rowStep = isStory ? 84 : 46;
  const barX = padX + 32;
  const barW = contentW - 64;
  const barH = isStory ? 18 : 12;

  data.skills.forEach((skill, idx) => {
    const ry = barStartY + idx * rowStep;

    ctx.font = `600 ${isStory ? 25 : 20}px ${FONT_STACK}`;
    ctx.fillStyle = palette.textSecondary;
    ctx.textAlign = 'left';
    ctx.fillText(skill.labelTh, barX, ry);

    ctx.font = `800 ${isStory ? 26 : 21}px ${FONT_STACK}`;
    ctx.fillStyle = palette.textPrimary;
    ctx.textAlign = 'right';
    ctx.fillText(`${skill.score}%`, barX + barW, ry);
    ctx.textAlign = 'left';

    // Track
    const trackY = ry + (isStory ? 22 : 14);
    ctx.fillStyle = palette.barTrack;
    drawRoundedRect(ctx, barX, trackY, barW, barH, barH / 2);
    ctx.fill();

    // Fill
    if (skill.score > 0) {
      const fillW = Math.max(barH, Math.round((barW * skill.score) / 100));
      ctx.fillStyle = palette.barFill;
      drawRoundedRect(ctx, barX, trackY, fillW, barH, barH / 2);
      ctx.fill();
    }
  });

  // 7. Story-only 28-Day Consistency Mini-Grid
  if (isStory) {
    const gridY = y + skillsCardH + 44;
    const gridCardH = 220;
    ctx.fillStyle = palette.cardBg;
    drawRoundedRect(ctx, padX, gridY, contentW, gridCardH, 28);
    ctx.fill();
    ctx.strokeStyle = palette.cardBorder;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = `700 28px ${FONT_STACK}`;
    ctx.fillStyle = palette.textPrimary;
    ctx.fillText('ความสม่ำเสมอ 28 วันล่าสุด', padX + 32, gridY + 48);

    const cols = 14;
    const dotGap = 12;
    const dotSize = Math.floor((contentW - 64 - dotGap * (cols - 1)) / cols);
    const startX = padX + 32;
    const startY = gridY + 86;

    data.calendar28Days.forEach((cell, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const dx = startX + col * (dotSize + dotGap);
      const dy = startY + row * (dotSize + dotGap);

      ctx.fillStyle =
        cell.level === 0
          ? palette.barTrack
          : cell.level === 1
          ? palette.accentSoft
          : cell.level === 2
          ? palette.accent
          : palette.barFill;
      if (cell.level === 2) ctx.globalAlpha = 0.72;
      drawRoundedRect(ctx, dx, dy, dotSize, dotSize, 10);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
  }

  // 8. Clean Footer Branding
  const footerY = H - (isStory ? 96 : 62);
  ctx.strokeStyle = palette.footerDivider;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padX, footerY - 30);
  ctx.lineTo(padX + contentW, footerY - 30);
  ctx.stroke();

  ctx.font = `800 24px ${FONT_STACK}`;
  ctx.fillStyle = palette.textPrimary;
  ctx.fillText('Polyglot AI', padX, footerY + 6);

  ctx.font = `500 21px ${FONT_STACK}`;
  ctx.fillStyle = palette.textMuted;
  ctx.textAlign = 'right';
  ctx.fillText('บันทึกพัฒนาการภาษาจีน & อังกฤษ', padX + contentW, footerY + 6);
  ctx.textAlign = 'left';
}

export async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png', 1.0);
  });
}
