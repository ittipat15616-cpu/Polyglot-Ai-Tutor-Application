import jsQR from 'jsqr';
import { db, auth } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getStoredByokKey } from './byokService';

export interface SlipVerificationResult {
  success: boolean;
  message: string;
  transRef?: string;
  amount?: number;
  timestamp?: number;
}

/**
 * Reads Bank QR Code from uploaded slip image using jsQR
 */
export async function readQrFromImage(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code && code.data) {
          resolve(code.data);
        } else {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

function compressImageToBase64(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const MAX_SIZE = 800;
        
        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      };
      img.onerror = () => resolve(null);
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

/**
 * Computes a SHA-256 string for fallback file deduplication
 */
export async function computeFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Zero-Cost Verified Bank Deposit & Anti-Fraud Scanner
 */
export async function verifyPaymentSlip(
  file: File,
  expectedAmount: number
): Promise<SlipVerificationResult> {
  const user = auth.currentUser;
  if (!user) {
    return { success: false, message: 'กรุณาเข้าสู่ระบบด้วยบัญชี Google ก่อนชำระเงิน' };
  }

  // 1. Read QR Payload or Compute File Hash
  let rawQr = await readQrFromImage(file);
  const fileHash = await computeFileHash(file);
  const imageUrl = await compressImageToBase64(file);
  
  // Extract transaction reference or fallback to image hash
  const transRef = rawQr ? rawQr.trim() : `HASH_${fileHash}`;

  // 2. AI Verification via Gemini Backend
  try {
    const byokKey = getStoredByokKey();
    const verifyRes = await fetch('/api/verify-slip', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...(byokKey ? { 'x-byok-key': byokKey } : {})
      },
      body: JSON.stringify({ imageUrl, expectedAmount, byokKey: byokKey || undefined })
    });
    
    if (!verifyRes.ok) {
      throw new Error('Failed to verify slip via API');
    }
    
    const verifyData = await verifyRes.json();
    if (!verifyData.isValid) {
      return {
        success: false,
        message: `⛔ สลิปไม่ถูกต้อง: ${verifyData.reason || 'กรุณาอัปโหลดสลิปที่ถูกต้อง'}`
      };
    }
  } catch (e) {
    console.error('Error verifying slip with AI:', e);
    return {
      success: false,
      message: '⛔ เกิดข้อผิดพลาดในการตรวจสอบสลิป กรุณาลองใหม่อีกครั้ง'
    };
  }

  // 3. Anti-Reuse Check in Firestore: Has this slip / QR transRef been used before?
  if (db) {
    try {
      const slipDocRef = doc(db, 'verified_slips', transRef);
      const snap = await getDoc(slipDocRef);
      if (snap.exists()) {
        return {
          success: false,
          message: '⛔ สลิปนี้ถูกใช้งานระบบเปิดแพ็กเกจไปแล้ว ไม่สามารถนำสลิปเดิมมาใช้ซ้ำได้'
        };
      }
    } catch (e: any) {
      if (e?.code !== 'unavailable' && !e?.message?.includes('offline')) {
        console.error('Error checking duplicate slip in Firestore:', e);
      }
    }
  }

  // 4. Save to Firestore verified_slips to lock out reuse
  if (db) {
    try {
      const slipDocRef = doc(db, 'verified_slips', transRef);
      await setDoc(slipDocRef, {
        transRef,
        fileHash,
        userId: user.uid,
        userEmail: user.email || '',
        userName: user.displayName || '',
        amount: expectedAmount,
        verifiedAt: Date.now(),
        imageUrl: imageUrl || ''
      });
    } catch (e: any) {
      if (e?.code !== 'unavailable' && !e?.message?.includes('offline')) {
        console.error('Error saving verified slip code to Firestore:', e);
      }
    }
  }

  return {
    success: true,
    message: `✅ ตรวจสอบสลิปโอนเงิน ${expectedAmount} บาทสำเร็จ! ยืนยันเงินเข้าบัญชีเรียบร้อย`,
    transRef,
    amount: expectedAmount,
    timestamp: Date.now()
  };
}
