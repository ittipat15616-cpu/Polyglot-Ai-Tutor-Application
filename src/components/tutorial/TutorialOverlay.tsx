import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Volume2, VolumeX, ArrowRight, ArrowLeft, X, Navigation } from 'lucide-react';
import { TutorialStep } from '../../data/tutorialData';
import { playThaiTTS, stopThaiTTS } from '../../utils/audio';

interface TutorialOverlayProps {
  steps: TutorialStep[];
  isActive: boolean;
  onClose: () => void;
}

export default function TutorialOverlay({ steps, isActive, onClose }: TutorialOverlayProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  const currentStep = steps[currentStepIndex];

  // Speech TTS
  const speakThai = (text: string) => {
    if (isMuted) return;
    try {
      playThaiTTS(text);
    } catch (e) {
      console.log('Speech error:', e);
    }
  };

  // Find target element and compute bounding rect
  const updateTargetPosition = () => {
    if (!currentStep) return;
    const el = document.getElementById(currentStep.targetId);
    if (el) {
      const rect = el.getBoundingClientRect();
      setTargetRect(rect);
    } else {
      setTargetRect(null);
    }
  };

  useEffect(() => {
    if (isActive) {
      setCurrentStepIndex(0);
    } else {
      stopThaiTTS();
    }
  }, [isActive]);

  useEffect(() => {
    if (!isActive || !currentStep) return;

    const el = document.getElementById(currentStep.targetId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    }

    updateTargetPosition();
    speakThai(currentStep.robotSpeech);

    let animationFrameId: number;
    const handleUpdate = () => {
      updateTargetPosition();
      animationFrameId = requestAnimationFrame(handleUpdate);
    };

    animationFrameId = requestAnimationFrame(handleUpdate);

    window.addEventListener('resize', updateTargetPosition);
    window.addEventListener('scroll', updateTargetPosition, true);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', updateTargetPosition);
      window.removeEventListener('scroll', updateTargetPosition, true);
    };
  }, [isActive, currentStepIndex, isMuted]);

  const [timerSeconds, setTimerSeconds] = useState<number | null>(null);

  // Initialize practice timer when step changes
  useEffect(() => {
    if (isActive && currentStep?.autoAdvanceTimer) {
      setTimerSeconds(currentStep.autoAdvanceTimer);
    } else {
      setTimerSeconds(null);
    }
  }, [isActive, currentStepIndex]);

  // Ticker countdown (runs once every 1000ms)
  useEffect(() => {
    if (timerSeconds === null || timerSeconds <= 0) return;

    const timeoutId = setTimeout(() => {
      setTimerSeconds((prev) => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [timerSeconds]);

  // Advance to next step once timer reaches 0
  useEffect(() => {
    if (timerSeconds === 0) {
      setTimerSeconds(null);
      setCurrentStepIndex((prev) => {
        if (prev < steps.length - 1) {
          return prev + 1;
        } else {
          onClose();
          return prev;
        }
      });
    }
  }, [timerSeconds, steps.length, onClose]);

  const lastStepAdvanceTimeRef = useRef<number>(0);

  // Interactivity: Listen for click on target element to advance step automatically!
  useEffect(() => {
    if (!isActive || !currentStep) return;
    // Skip click auto-advance for practice steps with autoAdvanceTimer or requireManualNext
    if (currentStep.autoAdvanceTimer || currentStep.requireManualNext) return;

    const el = document.getElementById(currentStep.targetId);
    if (!el) return;

    const handleTargetClick = () => {
      const now = Date.now();
      if (now - lastStepAdvanceTimeRef.current < 600) return;
      lastStepAdvanceTimeRef.current = now;

      setTimeout(() => {
        if (currentStepIndex < steps.length - 1) {
          setCurrentStepIndex((prev) => prev + 1);
        } else {
          onClose();
        }
      }, 300);
    };

    el.addEventListener('click', handleTargetClick);
    return () => el.removeEventListener('click', handleTargetClick);
  }, [isActive, currentStepIndex, steps, currentStep]);

  if (!isActive || !currentStep) return null;

  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[60] pointer-events-none overflow-hidden">
      {/* 1. SPOTLIGHT CUTOUT BACKDROP */}
      {targetRect ? (
        <div
          className="absolute inset-0 bg-slate-950/70 backdrop-blur-[2px] transition-all duration-300 pointer-events-none"
          style={{
            clipPath: `polygon(
              0% 0%,
              0% 100%,
              ${targetRect.left - 8}px 100%,
              ${targetRect.left - 8}px ${targetRect.top - 8}px,
              ${targetRect.right + 8}px ${targetRect.top - 8}px,
              ${targetRect.right + 8}px ${targetRect.bottom + 8}px,
              ${targetRect.left - 8}px ${targetRect.bottom + 8}px,
              ${targetRect.left - 8}px 100%,
              100% 100%,
              100% 0%
            )`,
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-[2px] pointer-events-none" />
      )}

      {/* 2. GLOWING SPOTLIGHT BORDER OVER TARGET */}
      {targetRect && (
        <motion.div
          initial={{ scale: 1.2, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          key={currentStep.targetId}
          style={{
            position: 'absolute',
            left: `${targetRect.left - 8}px`,
            top: `${targetRect.top - 8}px`,
            width: `${targetRect.width + 16}px`,
            height: `${targetRect.height + 16}px`,
          }}
          className="border-2 border-amber-400 rounded-2xl shadow-[0_0_25px_#f59e0b] pointer-events-none animate-pulse"
        />
      )}

      {/* 3. FLOATING ARROW POINTER */}
      {targetRect && (
        <motion.div
          initial={{ y: -10 }}
          animate={{ y: [0, -10, 0] }}
          transition={{ repeat: Infinity, duration: 1.2 }}
          style={{
            position: 'absolute',
            left: `${targetRect.left + targetRect.width / 2 - 16}px`,
            top: `${Math.max(10, targetRect.top - 45)}px`,
          }}
          className="text-amber-400 drop-shadow-[0_0_10px_#f59e0b] z-[45] pointer-events-none"
        >
          <Navigation size={28} className="transform rotate-180 fill-amber-400" />
        </motion.div>
      )}

      {/* 4. AG-BOT ROBOT AVATAR & SPEECH BUBBLE (Compact Horizontal Banner at Top-Right) */}
      <div className={`fixed ${currentStep.placement === 'bottom' ? 'bottom-8 md:bottom-12 left-1/2 -translate-x-1/2' : 'top-2 left-1/2 -translate-x-1/2'} z-[60] pointer-events-auto max-w-xl w-[90%] md:w-auto px-2`}>
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStepIndex}
            initial={{ opacity: 0, y: currentStep.placement === 'bottom' ? 20 : -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: currentStep.placement === 'bottom' ? 20 : -10, scale: 0.95 }}
            className="bg-white/95 backdrop-blur-md shadow-2xl rounded-2xl p-4 border border-indigo-100 flex flex-col gap-3 w-full relative"
          >
            {/* Top Row: Avatar, Title, Actions */}
            <div className="flex items-center gap-3 pr-6">
              {/* Robot Avatar */}
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 shadow-inner">
                <Bot size={22} className="text-white" />
              </div>

              {/* Title */}
              <div className="flex-1 flex flex-wrap items-center gap-2 min-w-0">
                <span className="text-[10px] font-black text-indigo-700 uppercase tracking-wider bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                  {currentStepIndex + 1}/{steps.length} {currentStep.title}
                </span>
                {currentStep.actionHint && (
                  <span className="text-[10px] text-indigo-500 font-bold truncate">
                    👉 {currentStep.actionHint}
                  </span>
                )}
                {timerSeconds !== null && (
                  <span className="text-[10px] bg-indigo-100 text-indigo-700 font-black px-2 py-0.5 rounded-full animate-pulse shadow-sm">
                    ⏳ เหลือ {timerSeconds} วินาที
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => {
                    const nextMute = !isMuted;
                    setIsMuted(nextMute);
                    if (nextMute) {
                      stopThaiTTS();
                    } else {
                      speakThai(currentStep.robotSpeech);
                    }
                  }}
                  className={`p-1.5 rounded-lg border text-xs transition-colors ${
                    isMuted
                      ? 'bg-slate-100 border-slate-200 text-slate-400'
                      : 'bg-indigo-50 border-indigo-200 text-indigo-600'
                  }`}
                  title={isMuted ? 'เปิดเสียงพากย์' : 'ปิดเสียงพากย์'}
                >
                  {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentStepIndex((prev) => Math.max(0, prev - 1))}
                    disabled={isFirstStep}
                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-30 text-slate-700 text-xs font-bold transition-colors"
                    title="ก่อนหน้า"
                  >
                    <ArrowLeft size={14} />
                  </button>

                  {!isLastStep ? (
                    <button
                      onClick={() => setCurrentStepIndex((prev) => Math.min(steps.length - 1, prev + 1))}
                      className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black transition-colors flex items-center gap-1 shadow-sm"
                    >
                      ถัดไป <ArrowRight size={12} />
                    </button>
                  ) : (
                    <button
                      onClick={onClose}
                      className="px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs font-black transition-colors shadow-sm"
                    >
                      เสร็จสิ้น 🎉
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Row: Speech Text */}
            <div className="w-full bg-indigo-50/50 rounded-xl p-3 border border-indigo-100/50">
              <p className="text-sm text-gray-800 font-medium leading-relaxed">
                "{currentStep.robotSpeech}"
              </p>
            </div>

            {/* Close button top right absolute */}
            <button
              onClick={onClose}
              className="absolute top-2 right-2 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
              title="ปิด"
            >
              <X size={14} />
            </button>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
