import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Download, Share, PlusSquare, X, Smartphone } from 'lucide-react';

interface InstallPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  deferredPrompt: any;
}

export function InstallPromptModal({ isOpen, onClose, deferredPrompt }: InstallPromptModalProps) {
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent || navigator.vendor || (window as any).opera;
    if (/android/i.test(ua)) {
      setIsAndroid(true);
    }
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      alert('แอปนี้ถูกติดตั้งแล้ว หรือเบราว์เซอร์ของคุณอาจไม่รองรับการติดตั้งผ่านปุ่มนี้');
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log('Install outcome:', outcome);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 to-purple-600" />
          
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
          >
            <X size={18} />
          </button>

          <div className="flex flex-col items-center text-center mt-2 mb-4">
            <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mb-4 text-indigo-600">
              <Download size={32} />
            </div>
            <h3 className="text-xl font-black text-slate-800 mb-2">
              ติดตั้งแอปลงเครื่อง
            </h3>
            <p className="text-slate-600 text-sm leading-relaxed mb-6">
              เพื่อประสบการณ์การใช้งานที่ดีที่สุด เราขอแนะนำให้ติดตั้งแอปลงในหน้าจอหลักของคุณก่อนเข้าสู่ระบบ
            </p>
            
            {isAndroid || deferredPrompt ? (
              <div className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-left mb-6">
                 <div className="flex items-center gap-3 mb-2 text-indigo-700 font-bold">
                    <Smartphone size={20} />
                    <span>สำหรับ Android</span>
                 </div>
                 <p className="text-sm text-slate-600 mb-4">
                   คุณสามารถกดปุ่มด้านล่างเพื่อนำแอปไปใส่ในหน้าจอหลักได้เลยครับ
                 </p>
                 <button
                    onClick={handleInstallClick}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
                 >
                    <Download size={18} /> ติดตั้งแอป
                 </button>
              </div>
            ) : (
              <div className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-left mb-6">
                 <div className="flex items-center gap-3 mb-2 text-indigo-700 font-bold">
                    <Smartphone size={20} />
                    <span>สำหรับ iOS หรือระบบอื่นๆ</span>
                 </div>
                 <p className="text-sm text-slate-600 mb-3">
                   หากคุณใช้อย่างอื่นที่ไม่ใช่ Android ให้ทำตามนี้:
                 </p>
                 <ol className="list-decimal pl-5 space-y-2 text-sm text-slate-700">
                    <li>แตะที่ไอคอน <Share size={14} className="inline mx-1 text-slate-500" /> (แชร์) หรือจุดสามจุด มุมขวาบน/ล่าง</li>
                    <li>เลือก <strong className="text-indigo-600 whitespace-nowrap">"เพิ่มไปยังหน้าจอโฮม"</strong> หรือ <strong className="text-indigo-600 whitespace-nowrap"><PlusSquare size={14} className="inline mx-1"/>Add to Home Screen</strong></li>
                 </ol>
                 <p className="text-xs text-slate-500 mt-3 border-t border-slate-200 pt-3">
                   *บางเครื่องอาจมีเมนูหรือปุ่มนี้ขึ้นมาให้เลือกเลยโดยไม่ต้องกดแชร์
                 </p>
              </div>
            )}
            
            <button 
              onClick={onClose}
              className="text-sm font-bold text-slate-400 hover:text-slate-600 underline underline-offset-2"
            >
              ข้ามขั้นตอนนี้และเข้าสู่ระบบ
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
