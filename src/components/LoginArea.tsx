import React, { useState } from 'react';
import { X, LogIn } from 'lucide-react';
import { googleSignIn } from '../firebase';

export interface UserProfile {
  uid?: string;
  name: string;
  email: string;
  photoURL?: string | null;
  isSubscribed?: boolean;
}

interface LoginAreaProps {
  onLogin: (user: UserProfile) => void;
  onClose: () => void;
}

export default function LoginArea({ onLogin, onClose }: LoginAreaProps) {
  const [isSigningInWithGoogle, setIsSigningInWithGoogle] = useState(false);

  const handleGoogleSignIn = async () => {
    setIsSigningInWithGoogle(true);
    try {
      const res = await googleSignIn();
      if (res) {
        onLogin({
          uid: res.user.uid,
          name: res.user.displayName || res.user.email?.split('@')[0] || 'User',
          email: res.user.email || '',
          photoURL: res.user.photoURL,
          isSubscribed: false,
        });
        onClose();
      }
    } catch (error: any) {
      console.error('Google Sign In failed:', error);
      alert('การเข้าสู่ระบบด้วย Google ไม่สำเร็จ: ' + (error?.message || 'กรุณาลองใหม่อีกครั้ง'));
    } finally {
      setIsSigningInWithGoogle(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden relative animate-in fade-in zoom-in duration-300">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X size={24} />
        </button>

        <div className="p-8">
          <div className="text-center mb-10">
            <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-inner">
              <LogIn size={40} />
            </div>
            <h2 className="text-3xl font-black text-slate-800 mb-3 tracking-tight">
              เข้าสู่ระบบ
            </h2>
            <p className="text-slate-500 text-sm font-medium">
              เข้าสู่ระบบด้วย Google เพื่อบันทึกประวัติการเรียนและใช้งานฟีเจอร์พรีเมียม
            </p>
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isSigningInWithGoogle}
            className="w-full bg-white hover:bg-slate-50 text-slate-700 font-bold py-4 px-4 rounded-2xl border-2 border-slate-200 transition-all flex items-center justify-center gap-3 shadow-sm hover:border-slate-300 disabled:opacity-50 hover:shadow-md active:scale-95"
          >
            <svg className="w-6 h-6 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#EA4335"
                d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.6 4.418 1.582L19.91 3C17.782 1.145 15.055 0 12 0 7.355 0 3.373 2.673 1.455 6.564l3.81 3.2z"
              />
              <path
                fill="#4285F4"
                d="M16.04 15.345c-1.077.732-2.436 1.164-4.04 1.164-3.11 0-5.74-2.11-6.68-4.964l-3.855 2.99C3.395 19.382 7.373 22 12 22c3.123 0 5.89-.982 7.854-2.782l-3.813-3.873z"
              />
              <path
                fill="#FBBC05"
                d="M5.32 11.545a7.1 7.1 0 0 1 0-3.091l-3.81-2.99a11.97 11.97 0 0 0 0 9.073l3.81-2.992z"
              />
              <path
                fill="#34A853"
                d="M23.527 12.273c0-.818-.082-1.609-.218-2.373H12v4.582h6.486a5.532 5.532 0 0 1-2.4 3.614l3.813 3.873c2.232-2.064 3.628-5.1 3.628-8.696z"
              />
            </svg>
            <span className="text-base">{isSigningInWithGoogle ? 'กำลังเชื่อมต่อ...' : 'ลงชื่อเข้าใช้ด้วย Google'}</span>
          </button>
          
          <div className="mt-8 text-center text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
            การเข้าสู่ระบบแสดงว่าคุณยอมรับเงื่อนไขการให้บริการและนโยบายความเป็นส่วนตัวของเรา
          </div>
        </div>
      </div>
    </div>
  );
}
