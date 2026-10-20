import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, getDocs, doc, getDoc, setDoc, query, orderBy } from 'firebase/firestore';
import { Shield, Users, RefreshCw, Coins, Calendar, CheckCircle, Lock, Crown, Star } from 'lucide-react';
import { UserSubscriptionState, TIER_CONFIGS, isAdminEmail, isSuperAdminEmail } from '../types/subscription';
import { getEffectiveSubscriptionState } from '../services/subscriptionService';

interface UserData {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  lastLoginAt: number;
}

interface UserWithSub extends UserData {
  subState?: UserSubscriptionState;
}

interface VerifiedSlip {
  transRef: string;
  fileHash: string;
  userId: string;
  userEmail: string;
  userName: string;
  amount: number;
  verifiedAt: number;
  imageUrl?: string; // Optional if we saved url, but slip verification uses local or didn't upload? Let's check slipVerification.ts
}

export default function AdminDashboardArea() {
  const [users, setUsers] = useState<UserWithSub[]>([]);
  const [slips, setSlips] = useState<VerifiedSlip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const loadData = async () => {
    setIsLoading(true);
    try {
      if (!db) return;

      // Load Users
      const usersSnap = await getDocs(collection(db, 'users'));
      const usersList: UserWithSub[] = [];
      for (const userDoc of usersSnap.docs) {
        const data = userDoc.data() as UserData;
        const uid = data.uid || userDoc.id;
        if (!uid) continue;
        
        const subDocRef = doc(db, 'users', uid, 'subscription', 'current');
        const subSnap = await getDoc(subDocRef);
        let userSubState = subSnap.exists() ? (subSnap.data() as UserSubscriptionState) : undefined;
        if (userSubState) {
          const { state: effectiveState } = getEffectiveSubscriptionState(userSubState, data.email);
          userSubState = effectiveState;
        }

        const isSuperAdmin = data.email && isSuperAdminEmail(data.email);
        const isAdmin = data.email && isAdminEmail(data.email);

        // Auto-enforce for other Admins (nongrily@gmail.com, weeranan172550@gmail.com):
        // Ultra plan (Admin) lifetime, 0 free credits, must top up themselves
        if (isAdmin && !isSuperAdmin) {
          let adminNeedsSync = false;
          const lifetimeExpiry = Date.now() + 100 * 365 * 24 * 60 * 60 * 1000;
          if (!userSubState) {
            userSubState = {
              tier: 'ULTRA',
              dailyCredits: 0,
              maxDailyCredits: 0,
              purchasedCredits: 0,
              expiresAt: lifetimeExpiry,
              isTrial: false,
              chatMessageCount: 0,
              callSecondsCount: 0,
            };
            adminNeedsSync = true;
          } else {
            if (userSubState.tier !== 'ULTRA') {
              userSubState.tier = 'ULTRA';
              adminNeedsSync = true;
            }
            if (!userSubState.expiresAt || (userSubState.expiresAt - Date.now() < 50 * 365 * 24 * 60 * 60 * 1000)) {
              userSubState.expiresAt = lifetimeExpiry;
              adminNeedsSync = true;
            }
            if (userSubState.dailyCredits !== 0 || userSubState.maxDailyCredits !== 0) {
              userSubState.dailyCredits = 0;
              userSubState.maxDailyCredits = 0;
              adminNeedsSync = true;
            }
            if (userSubState.isTrial) {
              userSubState.isTrial = false;
              adminNeedsSync = true;
            }
          }
          if (adminNeedsSync) {
            await setDoc(subDocRef, { ...userSubState, updatedAt: Date.now() }, { merge: true }).catch(() => {});
          }
        }

        // Default initialization for regular accounts if they don't have a record yet
        if (!isSuperAdmin && !isAdmin) {
          if (!userSubState) {
            userSubState = {
              tier: 'FREE',
              dailyCredits: 0,
              maxDailyCredits: 0,
              purchasedCredits: 0,
              expiresAt: null,
              isTrial: false,
              chatMessageCount: 0,
              callSecondsCount: 0,
            };
            await setDoc(subDocRef, { ...userSubState, updatedAt: Date.now() }, { merge: true }).catch(() => {});
          }
        }

        usersList.push({
          ...data,
          uid,
          subState: userSubState
        });
      }
      // Sort by lastLoginAt desc
      usersList.sort((a, b) => (b.lastLoginAt || 0) - (a.lastLoginAt || 0));
      setUsers(usersList);

      // Load Slips
      const slipsQ = query(collection(db, 'verified_slips'), orderBy('verifiedAt', 'desc'));
      const slipsSnap = await getDocs(slipsQ);
      const slipsList = slipsSnap.docs.map(doc => doc.data() as VerifiedSlip);
      setSlips(slipsList);

    } catch (e: any) {
      console.error('Error loading admin data', e);
      setErrorMsg(`Error loading data: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const user = auth.currentUser;
    if (user && isAdminEmail(user.email)) {
      setIsUnlocked(true);
    }
  }, []);

  useEffect(() => {
    if (isUnlocked) {
      loadData();
    }
  }, [isUnlocked]);

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === '115280') {
      setIsUnlocked(true);
      setErrorMsg('');
    } else {
      setErrorMsg('รหัสผ่านไม่ถูกต้อง');
    }
  };

  const currentMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const totalRevenue = slips
    .filter(slip => slip.verifiedAt >= currentMonthStart)
    .reduce((sum, slip) => sum + (slip.amount || 0), 0);

  const getTierBadge = (tier: string) => {
    switch (tier) {
      case 'TESTING': return <span className="bg-teal-100 text-teal-800 px-2 py-1 rounded-md text-xs font-bold">TESTING</span>;
      case 'FREE': return <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded-md text-xs font-bold">FREE</span>;
      case 'STARTER': return <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-md text-xs font-bold">STARTER</span>;
      case 'BASIC': return <span className="bg-indigo-100 text-indigo-800 px-2 py-1 rounded-md text-xs font-bold">BASIC</span>;
      case 'PLUS': return <span className="bg-emerald-100 text-emerald-800 px-2 py-1 rounded-md text-xs font-bold">PLUS</span>;
      case 'PREMIUM': return <span className="bg-amber-100 text-amber-800 px-2 py-1 rounded-md text-xs font-bold">PREMIUM</span>;
      case 'PRO': return <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded-md text-xs font-bold">PRO</span>;
      case 'ULTRA': return <span className="bg-rose-100 text-rose-800 px-2 py-1 rounded-md text-xs font-bold">ULTRA</span>;
      default: return <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded-md text-xs font-bold">{tier}</span>;
    }
  };

  if (!isUnlocked) {
    return (
      <div className="flex flex-col h-full items-center justify-center bg-white rounded-3xl shadow-sm border border-slate-200 p-8">
        <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-3xl flex items-center justify-center mb-6">
          <Lock size={32} />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Admin Dashboard</h2>
        <p className="text-slate-500 mb-8 text-center max-w-sm">
          พื้นที่สำหรับผู้ดูแลระบบ กรุณาระบุรหัสผ่านเพื่อเข้าสู่ระบบหลังบ้าน
        </p>
        
        {!showInput ? (
          <button
            onClick={() => setShowInput(true)}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all shadow-md hover:shadow-lg"
          >
            ใส่รหัสเพื่อปลดล็อค
          </button>
        ) : (
          <form onSubmit={handleUnlock} className="flex flex-col gap-4 w-full max-w-sm">
            <div className="flex gap-2">
              <input
                type="password"
                placeholder="รหัสผ่าน"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="flex-1 px-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all text-center tracking-widest text-lg font-mono"
                autoFocus
              />
              <button
                type="submit"
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all shadow-md hover:shadow-lg shrink-0"
              >
                ส่ง
              </button>
            </div>
            {errorMsg && <p className="text-red-500 text-xs text-center">{errorMsg}</p>}
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-4 md:p-6 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center">
            <Shield size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Admin Dashboard</h2>
            <p className="text-sm text-slate-500">Owner Access Only</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          <div className="flex-1 md:flex-none bg-emerald-50 text-emerald-700 px-4 py-2 rounded-xl border border-emerald-200 flex items-center gap-2">
            <Coins size={18} />
            <span className="font-semibold text-sm">ยอดรวมเดือนนี้: ฿{totalRevenue.toLocaleString()}</span>
          </div>
          <button 
            onClick={loadData}
            disabled={isLoading}
            className="p-2 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
            title="รีเฟรชข้อมูล"
          >
            <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {errorMsg && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl">
            <h3 className="font-bold">เกิดข้อผิดพลาดในการดึงข้อมูล</h3>
            <p className="text-sm font-mono mt-1">{errorMsg}</p>
          </div>
        )}
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <RefreshCw size={24} className="animate-spin text-indigo-600" />
          </div>
        ) : (
          <div className="space-y-8">
            
            {/* Users Table */}
            <section>
              <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Users size={20} className="text-indigo-600" />
                ผู้ใช้งานในระบบ ({users.length})
              </h3>
              <div className="overflow-x-auto bg-white border border-slate-200 rounded-2xl">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 font-semibold">ผู้ใช้</th>
                      <th className="px-4 py-3 font-semibold">แพ็กเกจ</th>
                      <th className="px-4 py-3 font-semibold">เครดิต</th>
                      <th className="px-4 py-3 font-semibold">วันหมดอายุ</th>
                      <th className="px-4 py-3 font-semibold">ล่าสุด</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {users.map(u => {
                      const isSuperAdminUser = isSuperAdminEmail(u.email);
                      const isAdminUser = isAdminEmail(u.email);
                      return (
                        <tr key={u.uid} className={`hover:bg-slate-50 ${isSuperAdminUser ? 'bg-amber-50/40' : isAdminUser ? 'bg-purple-50/30' : ''}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              {u.photoURL ? (
                                <img src={u.photoURL} className="w-8 h-8 rounded-full bg-slate-200 border border-slate-200" alt="" />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
                                  {u.displayName?.[0]?.toUpperCase() || '?'}
                                </div>
                              )}
                              <div className="flex flex-col">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-semibold text-slate-800">{u.displayName}</span>
                                  {isSuperAdminUser ? (
                                    <span className="px-1.5 py-0.5 bg-amber-100 text-amber-900 font-bold text-[10px] rounded border border-amber-300">
                                      Owner VIP
                                    </span>
                                  ) : isAdminUser ? (
                                    <span className="px-1.5 py-0.5 bg-purple-100 text-purple-800 font-bold text-[10px] rounded border border-purple-200">
                                      Admin (BYOK Free)
                                    </span>
                                  ) : null}
                                </div>
                                <span className="text-xs text-slate-500">{u.email}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {isSuperAdminUser ? (
                              <span className="bg-gradient-to-r from-amber-100 to-yellow-100 text-amber-900 border border-amber-300 px-2 py-1 rounded-md text-xs font-bold">
                                ULTRA (Owner VIP)
                              </span>
                            ) : isAdminUser ? (
                              <span className="bg-gradient-to-r from-blue-100 to-indigo-100 text-indigo-900 border border-blue-300 px-2 py-1 rounded-md text-xs font-bold">
                                STARTER (Admin)
                              </span>
                            ) : (
                              getTierBadge(u.subState?.tier || 'FREE')
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {u.subState ? (
                              <span className="font-medium text-slate-700">
                                {u.subState.dailyCredits} + {u.subState.purchasedCredits} (รวม {(u.subState.dailyCredits || 0) + (u.subState.purchasedCredits || 0)})
                              </span>
                            ) : '-'}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {isSuperAdminUser ? (
                              <span className="text-emerald-700 font-bold text-xs bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200">
                                ตลอดชีพ (Lifetime VIP)
                              </span>
                            ) : isAdminUser ? (
                              <span className="text-emerald-700 font-bold text-xs bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200">
                                ตลอดชีพ (Lifetime Admin)
                              </span>
                            ) : u.subState?.expiresAt ? (
                              new Date(u.subState.expiresAt).toLocaleDateString('th-TH')
                            ) : (
                              <span className="text-slate-400 text-xs">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-xs">
                            {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('th-TH') : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Slips Table */}
            <section>
              <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <CheckCircle size={20} className="text-emerald-600" />
                ประวัติการโอนเงิน ({slips.length})
              </h3>
              <div className="overflow-x-auto bg-white border border-slate-200 rounded-2xl">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 font-semibold">เวลา</th>
                      <th className="px-4 py-3 font-semibold">สลิป</th>
                      <th className="px-4 py-3 font-semibold">ผู้ใช้</th>
                      <th className="px-4 py-3 font-semibold">อีเมล</th>
                      <th className="px-4 py-3 font-semibold">จำนวนเงิน</th>
                      <th className="px-4 py-3 font-semibold">รหัสอ้างอิง</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {slips.map(s => (
                      <tr key={s.transRef} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-slate-600 text-xs">
                          {s.verifiedAt ? new Date(s.verifiedAt).toLocaleString('th-TH') : '-'}
                        </td>
                        <td className="px-4 py-3">
                          {s.imageUrl ? (
                            <img src={s.imageUrl} className="w-10 h-10 object-cover rounded-md border border-slate-200 cursor-pointer hover:scale-150 transition-transform origin-left" alt="slip" />
                          ) : (
                            <div className="w-10 h-10 bg-slate-100 rounded-md flex items-center justify-center text-[10px] text-slate-400">N/A</div>
                          )}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-800">
                          {s.userName || '-'}
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs">
                          {s.userEmail || '-'}
                        </td>
                        <td className="px-4 py-3 font-bold text-emerald-600">
                          ฿{s.amount.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-400">
                          {s.transRef}
                        </td>
                      </tr>
                    ))}
                    {slips.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                          ยังไม่มีประวัติการโอนเงิน
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

          </div>
        )}
      </div>
    </div>
  );
}
