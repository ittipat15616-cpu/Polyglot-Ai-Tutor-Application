import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered:', r);
    },
    onRegisterError(error) {
      console.log('SW registration error', error);
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-8 flex flex-col items-center justify-center text-center shadow-2xl aspect-square w-full max-w-sm">
        <div className="text-6xl mb-6 animate-bounce">🚀</div>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">อัพเดตเวอร์ชั่น</h2>
        <p className="text-gray-600 mb-8 leading-relaxed">
          ขณะนี้คุณกำลังใช้เวอร์ชั่นเก่าอยู่ โปรดทำการกดปุ่มด้านล่างนี้เพื่ออัพเดต
        </p>
        <button 
          onClick={() => updateServiceWorker(true)}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl shadow-lg transition-transform active:scale-95 mt-auto"
        >
          อัพเดตเดี๋ยวนี้
        </button>
      </div>
    </div>
  );
}
