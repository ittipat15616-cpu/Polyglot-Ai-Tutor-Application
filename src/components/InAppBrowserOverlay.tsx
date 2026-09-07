import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, Copy, ExternalLink, X, Check } from 'lucide-react';

export function InAppBrowserOverlay() {
  const [isInAppBrowser, setIsInAppBrowser] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const checkInAppBrowser = () => {
      const ua = navigator.userAgent || navigator.vendor || (window as any).opera;
      
      // Common in-app browsers
      const rules = [
        'FBAV', // Facebook
        'FBAN', // Facebook
        'FBIOS', // Facebook
        'Instagram', // Instagram
        'Line', // Line
        'musical_ly', // TikTok
        'TikTok', // TikTok
        'Twitter', // Twitter
      ];

      const match = rules.some(rule => new RegExp(rule, 'i').test(ua));
      
      // Check if it's already dismissed in this session
      const dismissed = sessionStorage.getItem('inAppBrowserDismissed') === 'true';
      
      if (match && !dismissed) {
        setIsInAppBrowser(true);
      }
    };

    checkInAppBrowser();
  }, []);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const handleDismiss = () => {
    setIsInAppBrowser(false);
    setIsDismissed(true);
    sessionStorage.setItem('inAppBrowserDismissed', 'true');
  };

  if (!isInAppBrowser) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl relative overflow-hidden"
        >
          {/* Header decoration */}
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-amber-400 to-orange-500" />
          
          <button 
            onClick={handleDismiss}
            className="absolute top-4 right-4 p-2 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
          >
            <X size={18} />
          </button>

          <div className="flex flex-col items-center text-center mt-2 mb-6">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-4 text-amber-500">
              <AlertCircle size={32} />
            </div>
            <h3 className="text-xl font-black text-slate-800 mb-2">
              เปิดในเบราว์เซอร์ภายนอก
            </h3>
            <p className="text-slate-600 text-sm leading-relaxed mb-4">
              คุณกำลังเปิดแอปนี้ผ่าน Line, Facebook หรือ Instagram <strong className="text-rose-500">ซึ่งอาจทำให้เข้าสู่ระบบด้วย Google ไม่ได้</strong>
            </p>
            
            <div className="bg-slate-50 rounded-xl p-4 w-full text-left border border-slate-100 mb-6 text-sm text-slate-700">
              <p className="font-bold mb-2 flex items-center gap-2">
                <ExternalLink size={16} className="text-indigo-500"/> วิธีแก้ไข:
              </p>
              <ol className="list-decimal pl-5 space-y-1">
                <li>แตะที่ไอคอนเมนู <strong className="bg-slate-200 px-1 rounded">⠇</strong> มุมขวาบน</li>
                <li>เลือก <strong className="text-indigo-600">"เปิดในเบราว์เซอร์เริ่มต้น"</strong> (Chrome / Safari)</li>
              </ol>
            </div>

            <p className="text-xs text-slate-500 mb-2">หรือคัดลอกลิงก์ไปเปิดเอง</p>
            <button
              onClick={handleCopyLink}
              className={`w-full py-3 px-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                copied 
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' 
                  : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
              }`}
            >
              {copied ? (
                <>
                  <Check size={18} />
                  คัดลอกลิงก์สำเร็จ!
                </>
              ) : (
                <>
                  <Copy size={18} />
                  คัดลอกลิงก์
                </>
              )}
            </button>
            
            <button 
              onClick={handleDismiss}
              className="mt-4 text-sm font-bold text-slate-400 hover:text-slate-600 underline underline-offset-2"
            >
              ใช้งานต่อโดยไม่ล็อกอิน
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
