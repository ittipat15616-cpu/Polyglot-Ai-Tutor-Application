import React, { useState } from 'react';
import { Phone, Mail, MessageCircle, X, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function ContactArea() {
  const [showQR, setShowQR] = useState(false);
  
  // Using an open API to generate QR code on the fly for the LINE ID
  const lineUrl = "https://line.me/ti/p/~ittipat15616";
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(lineUrl)}`;

  return (
    <div className="w-full h-full p-4 md:p-8 flex items-center justify-center bg-gray-50/50">
      <div className="bg-white max-w-lg w-full rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-8 text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl transform translate-x-1/2 -translate-y-1/2"></div>
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-black/10 rounded-full blur-xl transform -translate-x-1/2 translate-y-1/2"></div>
          
          <h2 className="text-3xl font-black text-white relative z-10 drop-shadow-md">ติดต่อผู้พัฒนา</h2>
          <p className="text-indigo-100 mt-2 font-medium relative z-10">หากพบปัญหาหรือมีข้อเสนอแนะ สามารถติดต่อได้ตลอดเวลาครับ</p>
        </div>

        {/* Contact Items */}
        <div className="p-6 md:p-8 flex flex-col gap-4">
          
          {/* 1. Phone */}
          <a 
            href="tel:0955408459" 
            className="flex items-center gap-5 p-5 rounded-2xl bg-gray-50 hover:bg-indigo-50 border border-gray-100 hover:border-indigo-200 transition-all group"
          >
            <div className="w-14 h-14 shrink-0 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
              <Phone size={26} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">เบอร์โทรศัพท์</p>
              <p className="text-xl font-bold text-gray-900 mt-0.5">095-5408459</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-indigo-400 group-hover:text-indigo-600 group-hover:bg-indigo-100 transition-colors">
              <ExternalLink size={18} />
            </div>
          </a>

          {/* 2. Email */}
          <a 
            href="mailto:ittipat15616@gmail.com" 
            className="flex items-center gap-5 p-5 rounded-2xl bg-gray-50 hover:bg-purple-50 border border-gray-100 hover:border-purple-200 transition-all group"
          >
            <div className="w-14 h-14 shrink-0 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
              <Mail size={26} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">อีเมล</p>
              <p className="text-lg font-bold text-gray-900 mt-0.5 break-all">ittipat15616@gmail.com</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-purple-400 group-hover:text-purple-600 group-hover:bg-purple-100 transition-colors">
              <ExternalLink size={18} />
            </div>
          </a>

          {/* 3. LINE */}
          <button 
            onClick={() => setShowQR(true)}
            className="flex items-center text-left gap-5 p-5 rounded-2xl bg-gray-50 hover:bg-green-50 border border-gray-100 hover:border-green-200 transition-all group w-full"
          >
            <div className="w-14 h-14 shrink-0 bg-green-100 text-green-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
              <MessageCircle size={26} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">LINE ID</p>
              <p className="text-xl font-bold text-gray-900 mt-0.5">ittipat15616</p>
            </div>
            <div className="px-4 py-2 rounded-xl bg-white shadow-sm text-sm font-bold text-green-600 group-hover:bg-green-600 group-hover:text-white transition-colors">
              สแกน QR
            </div>
          </button>

        </div>
      </div>

      {/* QR Code Modal */}
      <AnimatePresence>
        {showQR && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowQR(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white p-8 rounded-3xl shadow-2xl flex flex-col items-center max-w-sm w-full"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4">
                <MessageCircle size={32} />
              </div>
              <h3 className="text-2xl font-black text-gray-900 text-center mb-2">สแกนเพื่อเพิ่มเพื่อน</h3>
              <p className="text-gray-500 text-center mb-6">LINE ID: <span className="font-bold text-green-600">ittipat15616</span></p>
              
              <div className="bg-white p-4 rounded-2xl shadow-inner border-2 border-gray-100 mb-6 relative">
                <div className="absolute -top-3 -left-3 w-6 h-6 border-t-4 border-l-4 border-green-500 rounded-tl-xl"></div>
                <div className="absolute -top-3 -right-3 w-6 h-6 border-t-4 border-r-4 border-green-500 rounded-tr-xl"></div>
                <div className="absolute -bottom-3 -left-3 w-6 h-6 border-b-4 border-l-4 border-green-500 rounded-bl-xl"></div>
                <div className="absolute -bottom-3 -right-3 w-6 h-6 border-b-4 border-r-4 border-green-500 rounded-br-xl"></div>
                <img src={qrCodeUrl} alt="LINE QR Code" className="w-48 h-48 block" />
              </div>

              <button 
                onClick={() => setShowQR(false)}
                className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3 rounded-xl transition-colors"
              >
                ปิดหน้าต่าง
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
