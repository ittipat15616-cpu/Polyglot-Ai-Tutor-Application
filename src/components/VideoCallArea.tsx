import React, { useState, useEffect, useRef, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Phone, Edit3, Type, Settings2, PlayCircle, Loader2, RefreshCcw, MonitorUp, MonitorOff, Plus, Minus, ImagePlus, Trash2, ChevronLeft, ChevronRight, Maximize2, Minimize2, Clock, Key, X, Sparkles, FileText, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import HanziWriter from 'hanzi-writer';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { auth } from '../firebase';
import { deductCredit, loadUserSubscription, getTotalCredits } from '../services/subscriptionService';
import { getStoredByokKey, hasActiveByokKey, getByokCallRates } from '../services/byokService';
import { isAdminEmail, isSuperAdminEmail } from '../types/subscription';
import InsufficientCreditsModal from './InsufficientCreditsModal';

export type AvatarState = 
  | 'idle'
  | 'talking'
  | 'listening'
  | 'greeting'
  | 'celebrating'
  | 'confused'
  | 'agreeing'
  | 'dancing';

// Configure pdfjs worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;


function ChineseCharacters({ word }: { word: string }) {
  const chars = word.split('');
  
  // Decide size based on string length to fit up to 50 characters nicely
  let size = 120;
  if (chars.length > 20) {
    size = 40;
  } else if (chars.length > 10) {
    size = 60;
  } else if (chars.length > 6) {
    size = 80;
  }

  return (
    <div className="flex gap-1 md:gap-2 justify-center flex-wrap leading-tight">
      {chars.map((char, index) => {
        const isChinese = /[\u4e00-\u9fa5]/.test(char);
        if (isChinese) {
          return <HanziChar key={`${char}-${index}`} char={char} size={size} />;
        } else {
          return (
            <div 
              key={`${char}-${index}`} 
              className="flex items-center justify-center font-bold text-gray-900"
              style={{ width: size, height: size, fontSize: size * 0.7, flexShrink: 0 }}
            >
              {char}
            </div>
          );
        }
      })}
    </div>
  )
}

const HanziChar: React.FC<{ char: string; size: number }> = ({ char, size }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = '';
    const writer = HanziWriter.create(ref.current, char, {
      width: size,
      height: size,
      padding: size * 0.05,
      strokeAnimationSpeed: 1,
      delayBetweenStrokes: 50,
      showOutline: true,
      radicalColor: '#166534',
    });
    writer.loopCharacterAnimation();
  }, [char, size]);

  return <div ref={ref} className="bg-white rounded-md shadow-sm border border-gray-200" style={{ width: size, height: size, flexShrink: 0 }} />;
}

function pcmToBase64(pcmData: Float32Array): string {
  const buffer = new ArrayBuffer(pcmData.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < pcmData.length; i++) {
    let s = Math.max(-1, Math.min(1, pcmData[i]));
    s = s < 0 ? s * 0x8000 : s * 0x7fff;
    view.setInt16(i * 2, s, true);
  }
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToPcm(base64: string): Float32Array {
  const binary = atob(base64);
  const pcm = new Float32Array(binary.length / 2);
  const view = new DataView(new ArrayBuffer(2));
  for (let i = 0; i < pcm.length; i++) {
    view.setUint8(0, binary.charCodeAt(i * 2));
    view.setUint8(1, binary.charCodeAt(i * 2 + 1));
    pcm[i] = view.getInt16(0, true) / 32768;
  }
  return pcm;
}

interface BoardItem {
  word: string;
  pinyin?: string;
  meaning: string;
  example?: string;
}

interface BoardData {
  items: BoardItem[];
}

export default function VideoCallArea({
  activeLang,
  askWord,
  clearAskWord,
  askPdfUrl,
  clearAskPdfUrl,
  onOpenSubscription
}: {
  activeLang: 'EN' | 'CN' | 'TH';
  askWord?: string | null;
  clearAskWord?: () => void;
  askPdfUrl?: string | null;
  clearAskPdfUrl?: () => void;
  onOpenSubscription?: (initialTab?: 'tiers' | 'topup') => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const [isMicOn, setIsMicOn] = useState(true);
  // Default camera closed as requested: 1 credit = 30 seconds voice call
  const [isVidOn, setIsVidOn] = useState(false);
  const [showInsufficientModal, setShowInsufficientModal] = useState(false);
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [boardData, setBoardData] = useState<BoardData | null>(null);

  const [isCalling, setIsCalling] = useState(false);
  const [isSeriousMode, setIsSeriousMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('polyglot_serious_mode') === 'true';
    }
    return false;
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('polyglot_serious_mode', isSeriousMode ? 'true' : 'false');
    }
  }, [isSeriousMode]);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [reconnectTrigger, setReconnectTrigger] = useState(0);
  const [avatarState, setAvatarState] = useState<AvatarState>('idle');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcripts, setTranscripts] = useState<{ id: string, role: 'user' | 'model', text: string }[]>([]);
  const transcriptContainerRef = useRef<HTMLDivElement | null>(null);
  const [isCcEnabled, setIsCcEnabled] = useState(false);

  useEffect(() => {
    if (transcriptContainerRef.current) {
      transcriptContainerRef.current.scrollTop = 0;
    }
  }, [transcripts]);


  const [isDocBoardOpen, setIsDocBoardOpen] = useState(true);
  const [docImageObj, setDocImageObj] = useState<HTMLImageElement | null>(null);
  const [docImageBase64, setDocImageBase64] = useState<string | null>(null);
  const [docImageError, setDocImageError] = useState(false);
  
  // PDF States
  const [docPdfFile, setDocPdfFile] = useState<File | string | null>(null);
  const [docPdfPage, setDocPdfPage] = useState<number>(1);
  const [docPdfInputPage, setDocPdfInputPage] = useState<string>('1');
  const [docPdfNumPages, setDocPdfNumPages] = useState<number>(0);
  const [isPdfFullscreen, setIsPdfFullscreen] = useState(false);
  const pdfCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pdfPageContainerRef = useRef<HTMLDivElement | null>(null);
  const lastDocImagePayloadRef = useRef<{ data: string; mimeType: string } | null>(null);

  const goToPdfPage = (targetPage: number) => {
    if (!docPdfNumPages) return;
    const clamped = Math.max(1, Math.min(targetPage, docPdfNumPages));
    setDocPdfPage(clamped);
    setDocPdfInputPage(String(clamped));
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'doc_page_change', page: clamped }));
    }
  };

  const [docOverlayText, setDocOverlayText] = useState<string>('');
  const [docScale, setDocScale] = useState(1);
  const [docPan, setDocPan] = useState({ x: 0, y: 0 });
  const [isDraggingDoc, setIsDraggingDoc] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const docImageRef = useRef<HTMLImageElement | null>(null);

  const isMicOnRef = useRef(isMicOn);
  const isVidOnRef = useRef(isVidOn);
  const isLiveConnectedRef = useRef(isLiveConnected);
  const isCallingRef = useRef(isCalling);
  const isDocBoardOpenRef = useRef(isDocBoardOpen);
  const getOrCreateClientId = () => {
    if (typeof window === 'undefined') return 'default';
    let id = localStorage.getItem('ai_tutor_client_id');
    if (!id) {
       id = Math.random().toString(36).substring(2, 15);
       localStorage.setItem('ai_tutor_client_id', id);
    }
    return id;
  };
  const clientIdRef = useRef(getOrCreateClientId());

  useEffect(() => { isMicOnRef.current = isMicOn; }, [isMicOn]);
  useEffect(() => { isVidOnRef.current = isVidOn; }, [isVidOn]);
  useEffect(() => { isLiveConnectedRef.current = isLiveConnected; }, [isLiveConnected]);
  useEffect(() => { isDocBoardOpenRef.current = isDocBoardOpen; }, [isDocBoardOpen]);
  useEffect(() => { 
    isCallingRef.current = isCalling; 
    if (!isCalling) {
      setBoardData(null); 
      setIsLiveConnected(false);
      lastHandledAskWordRef.current = null;
      setTranscripts([]);
      setIsCcEnabled(false);
    } else {
      setIsLiveConnected(true);
      setIsCcEnabled(false);
    }
  }, [isCalling]);

  const [callDurationSeconds, setCallDurationSeconds] = useState(0);
  const [userSub, setUserSub] = useState<any>(null);
  const [isByokActive, setIsByokActive] = useState<boolean>(hasActiveByokKey());
  const [isTestingBannerDismissed, setIsTestingBannerDismissed] = useState(false);

  useEffect(() => {
    loadUserSubscription().then(setUserSub);
    const handleSubUpdate = () => {
      loadUserSubscription().then(setUserSub);
    };
    const handleByokUpdate = () => {
      setIsByokActive(hasActiveByokKey());
    };
    window.addEventListener('subscription_updated', handleSubUpdate);
    window.addEventListener('byok_key_updated', handleByokUpdate);
    return () => {
      window.removeEventListener('subscription_updated', handleSubUpdate);
      window.removeEventListener('byok_key_updated', handleByokUpdate);
    };
  }, []);

  const currentUser = auth.currentUser;
  const isSuperAdmin = isSuperAdminEmail(currentUser?.email);
  const isAdmin = isAdminEmail(currentUser?.email);
  const isRegularAdmin = isAdmin && !isSuperAdmin;
  const activeRates = userSub ? getByokCallRates(userSub.tier) : getByokCallRates('STARTER');

  // AI Voice/Video Call Credit Deductor:
  // - Admin Accounts: 100% FREE calls ONLY when using BYOK. If no BYOK, standard rate applies.
  // - BYOK Mode: Uses tier-based rates (starts deduction at 00:01):
  //   * Premium / Pro / Ultra: Unlimited calls (0 credits deducted)
  //   * Plus: Voice 10 mins (600s) / Video 5 mins (300s) per 1 credit
  //   * Basic: Voice 5 mins (300s) / Video 3 mins (180s) per 1 credit
  //   * Starter: Voice 2 mins (120s) / Video 1 min (60s) per 1 credit
  // - Standard Mode (No BYOK):
  //   * Voice: 1 credit / 30s (00:01, 00:31, ...)
  //   * Video: 3 credits / 30s (00:01, 00:31, ...)
  useEffect(() => {
    let timer: any = null;
    if (isCalling) {
      setCallDurationSeconds(0);
      let sec = 0;

      timer = setInterval(async () => {
        sec += 1;
        setCallDurationSeconds(sec);

        const byokActive = hasActiveByokKey();
        const sub = await loadUserSubscription();
        const user = auth.currentUser;
        const isSuperAdminUser = isSuperAdminEmail(user?.email);
        const isRegularAdminUser = isAdminEmail(user?.email) && !isSuperAdminUser;

        // Regular Admin call is completely FREE when using BYOK
        // Super Admin (Owner) simulates active sub.tier rates!
        if (isRegularAdminUser && byokActive) {
          return;
        }

        if (byokActive) {
          const rates = getByokCallRates(sub.tier);
          
          // Premium, Pro, Ultra BYOK customers have UNLIMITED calls (0 credits)
          if (rates.isCallUnlimited) {
            return;
          }

          // Interval in seconds for 1 credit:
          // Starter: Voice 120s (2m), Video 60s (1m)
          // Basic: Voice 300s (5m), Video 180s (3m)
          // Plus: Voice 600s (10m), Video 300s (5m)
          const interval = isVidOn ? rates.videoCallSecondsPerCredit : rates.audioCallSecondsPerCredit;
          
          // Deduct at sec === 1 (00:01) and every interval seconds thereafter (01:01, 02:01, ...)
          if (interval > 0 && (sec - 1) % interval === 0) {
            const { success } = await deductCredit(1);
            if (!success) {
              setIsCalling(false);
              setShowInsufficientModal(true);
            }
          }
        } else {
          // Standard rate (Non-BYOK):
          // Voice: 1 credit / 30s
          // Video: 3 credits / 30s
          const currentRate = isVidOn ? 'video_call_30s' : 'voice_call_30s';
          if ((sec - 1) % 30 === 0) {
            const { success } = await deductCredit(currentRate);
            if (!success) {
              setIsCalling(false);
              setShowInsufficientModal(true);
            }
          }
        }
      }, 1000);
    } else {
      setCallDurationSeconds(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isCalling, isVidOn]);

  const formatCallTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const startCallWithCreditCheck = async () => {
    const sub = await loadUserSubscription();
    const byokActive = hasActiveByokKey();
    const rates = getByokCallRates(sub.tier);
    const user = auth.currentUser;
    const isSuperAdminUser = isSuperAdminEmail(user?.email);
    const isRegularAdminUser = isAdminEmail(user?.email) && !isSuperAdminUser;

    // If Regular Admin with BYOK, or BYOK user is on an unlimited tier (Premium, Pro, Ultra), allow call even with 0 credits
    const isUnlimited = (isRegularAdminUser && byokActive) || (byokActive && rates.isCallUnlimited);
    const minRequired = isUnlimited ? 0 : 1;
    if (getTotalCredits(sub) < minRequired) {
      setShowInsufficientModal(true);
      return;
    }
    // Always start call with camera OFF
    setIsVidOn(false);
    isVidOnRef.current = false;
    setIsCcEnabled(false);
    if (stream) {
      stream.getVideoTracks().forEach(track => {
        track.enabled = false;
      });
    }
    setIsCalling(true);
  };

  const docExtractedTextRef = useRef<string | null>(null);

  useEffect(() => {
    if (!docImageBase64 && !docPdfFile) {
      lastDocImagePayloadRef.current = null;
    }
  }, [docImageBase64, docPdfFile]);

  useEffect(() => {
    if (docPdfFile) {
      renderPdfPageForAI(docPdfFile, docPdfPage);
    }
  }, [docPdfFile, docPdfPage]);

  // Handle askWord auto start
  useEffect(() => {
    if (askWord) {
      setBoardData({
        items: [{
          word: askWord,
          meaning: 'กำลังดึงคำอธิบายและตัวอย่างจาก AI Tutor...',
          pinyin: activeLang === 'CN' ? '...' : undefined
        }]
      });
      if (!isCalling) {
        startCallWithCreditCheck();
      } else if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && lastHandledAskWordRef.current !== askWord) {
        lastHandledAskWordRef.current = askWord;
        wsRef.current.send(JSON.stringify({
          type: 'ask_word',
          word: askWord
        }));
      }
    }
  }, [askWord, activeLang, isCalling]);

  // Handle askPdfUrl auto start
  useEffect(() => {
    if (askPdfUrl) {
      setDocPdfFile(askPdfUrl);
      setDocImageBase64(null); // Clear image if any
      setDocImageError(false);
      lastDocImagePayloadRef.current = null;
      setIsDocBoardOpen(true);
      extractPdfTextAndSend(askPdfUrl);
      if (!isCalling) {
        setIsCalling(true);
      }
    }
  }, [askPdfUrl, isCalling]);

  const extractPdfTextAndSend = async (fileOrUrl: File | string) => {
     try {
       let data;
       if (typeof fileOrUrl === 'string') {
          const res = await fetch(fileOrUrl);
          data = await res.arrayBuffer();
       } else {
          data = await fileOrUrl.arrayBuffer();
       }
       const loadingTask = pdfjs.getDocument({ data });
       const pdf = await loadingTask.promise;
       let fullText = "";
       const maxPages = Math.min(pdf.numPages, 30);
       for (let i = 1; i <= maxPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const strings = content.items.map((item: any) => item.str);
          fullText += `\n--- Page ${i} ---\n` + strings.join(" ");
       }
       
       docExtractedTextRef.current = fullText;
       
       if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'doc_context', text: fullText }));
       }
     } catch (e) {
        console.error("PDF text extraction failed", e);
     }
  };

  const sendDocImageToAI = (dataUrlOrBase64: string, fallbackMimeType = 'image/jpeg') => {
    const dataUrlMatch = dataUrlOrBase64.match(/^data:([^;]+);base64,(.*)$/);
    const mimeType = dataUrlMatch?.[1] || fallbackMimeType;
    const base64 = dataUrlMatch?.[2] || (dataUrlOrBase64.includes(',') ? dataUrlOrBase64.split(',')[1] : dataUrlOrBase64);
    if (!base64) return;
    lastDocImagePayloadRef.current = { data: base64, mimeType };
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'doc_image', image: base64, mimeType }));
    }
  };

  const renderPdfPageForAI = async (fileOrUrl: File | string, pageNumber: number) => {
    try {
      let data: ArrayBuffer;
      if (typeof fileOrUrl === 'string') {
        const res = await fetch(fileOrUrl);
        data = await res.arrayBuffer();
      } else {
        data = await fileOrUrl.arrayBuffer();
      }

      const pdf = await pdfjs.getDocument({ data }).promise;
      const page = await pdf.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const targetWidth = Math.min(2400, Math.max(1600, baseViewport.width * 2));
      const scale = targetWidth / baseViewport.width;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const context = canvas.getContext('2d');
      if (!context) return;
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      sendDocImageToAI(canvas.toDataURL('image/png'), 'image/png');
    } catch (e) {
      console.error("PDF page image render failed", e);
    }
  };

  const capturePdfPageForAI = () => {
    window.setTimeout(() => {
      const canvas = pdfPageContainerRef.current?.querySelector('canvas');
      if (!canvas) return;
      const dataUrl = canvas.toDataURL('image/png');
      sendDocImageToAI(dataUrl, 'image/png');

      const img = new Image();
      img.onload = () => {
        setDocImageObj(img);
        docImageRef.current = img;
      };
      img.src = dataUrl;
    }, 250);
  };

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const sub = await loadUserSubscription();
    const byokActive = hasActiveByokKey();
    const rates = getByokCallRates(sub.tier);
    const user = auth.currentUser;
    const isSuperAdminUser = isSuperAdminEmail(user?.email);
    const isRegularAdminUser = isAdminEmail(user?.email) && !isSuperAdminUser;

    // BYOK rates: Regular Admin with BYOK = 0, Pro/Ultra = 0 (Free), Premium/Plus/Basic/Starter = 1 credit. Non-BYOK = 3 credits.
    // Super Admin simulates their active sub.tier (e.g. Premium = 1 credit, Pro/Ultra = 0 credits, Free = 1 credit with BYOK)
    const uploadCost = (isRegularAdminUser && byokActive) ? 0 : (byokActive ? rates.docUploadCreditCost : 3);

    if (uploadCost > 0) {
      const { success } = await deductCredit(uploadCost);
      if (!success) {
        setShowInsufficientModal(true);
        if (e.target) e.target.value = '';
        return;
      }
    }

    if (file.type === "application/pdf") {
      setDocPdfFile(file);
      setDocPdfPage(1);
      setDocPdfInputPage('1');
      setDocImageBase64(null); // Clear image
      setDocImageError(false);
      lastDocImagePayloadRef.current = null;
      extractPdfTextAndSend(file);
      renderPdfPageForAI(file, 1);
      setIsDocBoardOpen(true);
    } else {
      // It's an image
      setDocPdfFile(null); // Clear PDF
      setIsDocBoardOpen(true);
      setDocImageError(false);
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        setDocImageBase64(result);
        sendDocImageToAI(result);
        const img = new Image();
        img.onload = () => {
          setDocImageObj(img);
          docImageRef.current = img;
          setDocScale(1);
          setDocPan({ x: 0, y: 0 });
        };
        img.src = result;
      };
      reader.readAsDataURL(file);
    }
  };

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const nextStartTimeRef = useRef(0);
  const activeAudioNodesRef = useRef<AudioBufferSourceNode[]>([]);
  const interruptedTimeRef = useRef(0);
  const silenceOscillatorRef = useRef<OscillatorNode | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const lastHandledAskWordRef = useRef<string | null>(null);
  const lastAudioSentAtRef = useRef(0);
  const lastFrameSentAtRef = useRef(0);

  // Play incoming audio
  const playAudioChunk = (base64Audio: string) => {
    // Ignore lingering audio chunks immediately after an interrupt
    if (Date.now() - interruptedTimeRef.current < 500) return;

    if (!outputAudioCtxRef.current) {
        outputAudioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        nextStartTimeRef.current = 0; // Reset time when new context is created
        
        // Add silent oscillator to keep JS context alive in background (especially for iOS)
        const ctx = outputAudioCtxRef.current;
        const gainNode = ctx.createGain();
        gainNode.gain.value = 0;
        gainNode.connect(ctx.destination);
        const osc = ctx.createOscillator();
        osc.connect(gainNode);
        osc.start();
        silenceOscillatorRef.current = osc;
    }
    const ctx = outputAudioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();

    const pcm = base64ToPcm(base64Audio);
    const buffer = ctx.createBuffer(1, pcm.length, 24000); // Model outputs 24kHz
    buffer.copyToChannel(pcm, 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const currentTime = ctx.currentTime;
    if (nextStartTimeRef.current < currentTime) {
       nextStartTimeRef.current = currentTime + 0.05;
    }

    source.onended = () => {
      activeAudioNodesRef.current = activeAudioNodesRef.current.filter(n => n !== source);
    };
    activeAudioNodesRef.current.push(source);

    source.start(nextStartTimeRef.current);
    nextStartTimeRef.current += buffer.duration;
  };

  useEffect(() => {
    setBoardData(null);
  }, [activeLang]);


  // === GEMINI LIVE API (FRONTEND) ===
  useEffect(() => {
    if (!isCalling) return;

    let sessionActive = true;
    let currentStream: MediaStream | null = null;
    let frameInterval: any = null;

    async function initGemini() {
      try {
        activeAudioNodesRef.current = [];

        const langName = activeLang === 'CN' ? 'Chinese' : activeLang === 'TH' ? 'Thai' : 'English';
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const params = new URLSearchParams({
          lang: langName,
          clientId: clientIdRef.current,
        });
        if (auth.currentUser) {
          params.set('userId', auth.currentUser.uid);
        }
        const includeAskWord = Boolean(askWord && lastHandledAskWordRef.current !== askWord);
        if (includeAskWord) params.set('askWord', askWord);
        if (isSeriousMode) params.set('seriousMode', 'true');

        // BYOK: If user configured their own Gemini API key, pass it to WebSocket
        const activeByokKey = getStoredByokKey();
        if (activeByokKey) {
          params.set('byokKey', activeByokKey);
        }

        const socket = new WebSocket(`${protocol}://${window.location.host}/live?${params.toString()}`);
        wsRef.current = socket;

        await new Promise<void>((resolve, reject) => {
          socket.onopen = () => {
            if (!sessionActive) return;
            if (includeAskWord) lastHandledAskWordRef.current = askWord;
            reconnectAttemptsRef.current = 0;
            setIsLiveConnected(true);
            setAvatarState('listening');
            resolve();
          };
          socket.onerror = () => reject(new Error('?????????????????? AI server ???'));
        });

        socket.onmessage = (event) => {
          let message: any;
          try {
            message = JSON.parse(event.data);
          } catch (e) {
            console.error('Invalid AI message', e);
            return;
          }

          if (message.audio) {
            playAudioChunk(message.audio);
            setIsSpeaking(true);
            setAvatarState('talking');
            clearTimeout((socket as any)._speakTimer);
            (socket as any)._speakTimer = setTimeout(() => {
              setIsSpeaking(false);
              setAvatarState('listening');
            }, 2500);
          }

          if (message.type === 'transcript') {
            setTranscripts(prev => {
              const last = prev[prev.length - 1];
              if (last && last.role === message.role) {
                // Append text to the same role's ongoing message
                return [...prev.slice(0, -1), { ...last, text: last.text + " " + message.text }];
              }
              return [...prev, { id: Math.random().toString(), role: message.role, text: message.text }];
            });
          }

          if (message.type === 'board_update') {
            setBoardData(message.data as any);
            setAvatarState('agreeing');
          } else if (message.type === 'doc_board_update') {
            setDocOverlayText(message.data?.overlayText || '');
            if (!isDocBoardOpenRef.current) setIsDocBoardOpen(true);
          } else if (message.type === 'error') {
            console.error('AI server error:', message.message);
            if (String(message.message || '').toLowerCase().includes('reconnecting')) {
              setIsLiveConnected(false);
              setAvatarState('confused');
            } else {
              alert(message.message || 'AI connection error');
              setIsCalling(false);
            }
          }

          if (message.interrupted) {
            interruptedTimeRef.current = Date.now();
            activeAudioNodesRef.current.forEach(node => {
              try { node.stop(); } catch (e) {}
            });
            activeAudioNodesRef.current = [];
            if (outputAudioCtxRef.current) {
              nextStartTimeRef.current = outputAudioCtxRef.current.currentTime;
            }
          }
        };

        socket.onclose = () => {
          if (!sessionActive) return;
          setIsLiveConnected(false);
          setAvatarState('confused');
          if (isCallingRef.current && reconnectAttemptsRef.current < 20) {
            const delay = Math.min(1000 + reconnectAttemptsRef.current * 1000, 5000);
            reconnectAttemptsRef.current += 1;
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = setTimeout(() => {
              if (isCallingRef.current) setReconnectTrigger(prev => prev + 1);
            }, delay);
          } else if (isCallingRef.current) {
            alert('AI connection stopped. Please end the call and start again.');
            setIsCalling(false);
          }
        };

        if (docExtractedTextRef.current && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'doc_context', text: docExtractedTextRef.current }));
        }
        if (lastDocImagePayloadRef.current && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            type: 'doc_image',
            image: lastDocImagePayloadRef.current.data,
            mimeType: lastDocImagePayloadRef.current.mimeType
          }));
        }
        // ------------------
        // Setup Media 
        // ------------------
        let stream: MediaStream | null = null;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: { ideal: facingMode } }, 
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
          });
        } catch (err) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facingMode } } });
          } catch (err2) {
            try {
              stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
            } catch (err3) {}
          }
        }

        currentStream = stream;
        
        if (currentStream) {
          currentStream.getVideoTracks().forEach(track => track.enabled = isVidOn);
          if (videoRef.current) videoRef.current.srcObject = currentStream;
          setStream(currentStream);
        }

        if (!outputAudioCtxRef.current) {
            const outCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            outputAudioCtxRef.current = outCtx;
            nextStartTimeRef.current = 0;
            const gainNode = outCtx.createGain();
            gainNode.gain.value = 0;
            gainNode.connect(outCtx.destination);
            const osc = outCtx.createOscillator();
            osc.connect(gainNode);
            osc.start();
            silenceOscillatorRef.current = osc;
        }

        const hasAudioTrack = currentStream ? currentStream.getAudioTracks().length > 0 : false;
        
        if (hasAudioTrack && sessionActive) {
          const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
          inputAudioCtxRef.current = audioCtx;
          const source = audioCtx.createMediaStreamSource(currentStream!);
          sourceRef.current = source;
          const processor = audioCtx.createScriptProcessor(4096, 1, 1);
          processorRef.current = processor;
          const gainNode = audioCtx.createGain();
          gainNode.gain.value = 0;
          processor.connect(gainNode);
          gainNode.connect(audioCtx.destination);
          source.connect(processor);

          processor.onaudioprocess = (e) => {
             if (!isMicOnRef.current || !sessionActive || !wsRef.current) return;
             const pcmData = e.inputBuffer.getChannelData(0);
             let sumSquares = 0;
             for (let i = 0; i < pcmData.length; i++) {
               sumSquares += pcmData[i] * pcmData[i];
             }
             const rms = Math.sqrt(sumSquares / pcmData.length);
             const now = Date.now();
             // Removed VAD dropping to stream continuously to Gemini
             const base64 = pcmToBase64(pcmData);
             if (wsRef.current.readyState === WebSocket.OPEN) {
               wsRef.current.send(JSON.stringify({ audio: base64 }));
             }
          };
        }

        frameInterval = setInterval(() => {
          if (!sessionActive || !wsRef.current) return;
          const now = Date.now();
          if (now - lastFrameSentAtRef.current < 1500) return;
          const hasScreen = screenVideoRef.current && screenVideoRef.current.videoWidth > 0 && screenStreamRef.current;
          const hasVideo = isVidOnRef.current && videoRef.current && videoRef.current.videoWidth > 0;
          const hasDoc = isDocBoardOpenRef.current && docImageRef.current;
          if (!hasScreen && !hasVideo && !hasDoc) return;

          let targetWidth = 640;
          let targetHeight = 480;
          let quality = 0.7;
          if (hasScreen || hasDoc) { targetWidth = 1024; targetHeight = 768; quality = 0.8; }
          
          const canvas = document.createElement('canvas');
          canvas.width = hasDoc && (hasScreen || hasVideo) ? targetWidth * 2 : targetWidth;
          canvas.height = targetHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          
          ctx.fillStyle = "#000000";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          
          let currentXOffset = 0;
          if (hasDoc) {
             ctx.fillStyle = "#ffffff";
             ctx.fillRect(currentXOffset, 0, targetWidth, targetHeight);
             const img = docImageRef.current!;
             const aspect = img.width / img.height;
             let drawW = targetWidth;
             let drawH = targetWidth / aspect;
             if (drawH > targetHeight) { drawH = targetHeight; drawW = targetHeight * aspect; }
             const dx = currentXOffset + (targetWidth - drawW) / 2;
             const dy = (targetHeight - drawH) / 2;
             ctx.drawImage(img, dx, dy, drawW, drawH);
             currentXOffset += targetWidth;
          }

          if (hasScreen) {
             const video = screenVideoRef.current!;
             const aspect = video.videoWidth / video.videoHeight;
             let drawW = targetWidth;
             let drawH = targetWidth / aspect;
             if (drawH > targetHeight) { drawH = targetHeight; drawW = targetHeight * aspect; }
             const dx = currentXOffset + (targetWidth - drawW) / 2;
             const dy = (targetHeight - drawH) / 2;
             ctx.drawImage(video, dx, dy, drawW, drawH);
          } else if (hasVideo) {
             const video = videoRef.current!;
             const aspect = video.videoWidth / video.videoHeight;
             let drawW = targetWidth;
             let drawH = targetWidth / aspect;
             if (drawH > targetHeight) { drawH = targetHeight; drawW = targetHeight * aspect; }
             const dx = currentXOffset + (targetWidth - drawW) / 2;
             const dy = (targetHeight - drawH) / 2;
             ctx.drawImage(video, dx, dy, drawW, drawH);
          }

          const base64JPEG = canvas.toDataURL('image/jpeg', quality).split(',')[1];
          if (wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ image: base64JPEG }));
            lastFrameSentAtRef.current = now;
          }
        }, 500);

      } catch (e: any) {
         console.error("Gemini init error", e);
         alert("Gemini Connection Error: " + (e?.message || JSON.stringify(e)));
         setIsCalling(false);
      }
    }

    initGemini();

    return () => {
      sessionActive = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (frameInterval) clearInterval(frameInterval);
      if (processorRef.current) processorRef.current.disconnect();
      if (sourceRef.current) sourceRef.current.disconnect();
      if (inputAudioCtxRef.current && inputAudioCtxRef.current.state !== 'closed') {
         inputAudioCtxRef.current.close().catch(() => {});
      }
      inputAudioCtxRef.current = null;
      if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
      }
      // If we saved the session in wsRef
      if (wsRef.current && (wsRef.current as any).close) {
        // Unfortunately standard close might not exist, but let's try
        try { (wsRef.current as any).close(); } catch(e){}
      }
      wsRef.current = null;
    };
  }, [activeLang, isCalling, reconnectTrigger, facingMode]);

    const toggleMic = () => {
    if (stream) {
      stream.getAudioTracks().forEach(track => track.enabled = !isMicOn);
      setIsMicOn(!isMicOn);
    }
  };

  const toggleVid = async () => {
    const nextVidOn = !isVidOn;

    // Credit check before switching video mode:
    // In BYOK: Unlimited tiers require 0 credits, otherwise 1 credit.
    // In Standard mode: Video requires 3 credits, Voice requires 1 credit.
    const sub = await loadUserSubscription();
    const byokActive = hasActiveByokKey();
    const rates = getByokCallRates(sub.tier);
    const user = auth.currentUser;
    const isSuperAdminUser = isSuperAdminEmail(user?.email);
    const isRegularAdminUser = isAdminEmail(user?.email) && !isSuperAdminUser;
    
    let requiredCredits = 0;
    if (byokActive) {
      requiredCredits = (isRegularAdminUser || rates.isCallUnlimited) ? 0 : 1;
    } else {
      requiredCredits = nextVidOn ? 3 : 1;
    }

    if (getTotalCredits(sub) < requiredCredits) {
      setIsCalling(false); // Disconnect call
      setShowInsufficientModal(true);
      return;
    }

    if (stream) {
      stream.getVideoTracks().forEach(track => {
        track.enabled = nextVidOn;
      });
    }
    setIsVidOn(nextVidOn);
    isVidOnRef.current = nextVidOn;
    // Reset timer on camera toggle per user requirement
    setCallDurationSeconds(0);
  };

  const toggleCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  const toggleScreenShare = async () => {
    if (screenStream) {
      // Stop screen sharing
      screenStream.getTracks().forEach(track => track.stop());
      setScreenStream(null);
      screenStreamRef.current = null;
      if (screenVideoRef.current) screenVideoRef.current.srcObject = null;
    } else {
      // Start screen sharing
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
          throw new Error("เบราว์เซอร์หรือสภาพแวดล้อมนี้ไม่รองรับการแชร์หน้าจอ (กรุณาลองเปิดแอปในแท็บใหม่)");
        }
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        stream.getVideoTracks()[0].onended = () => {
           setScreenStream(null);
           screenStreamRef.current = null;
           if (screenVideoRef.current) screenVideoRef.current.srcObject = null;
        };
        setScreenStream(stream);
        screenStreamRef.current = stream;
        if (screenVideoRef.current) {
          screenVideoRef.current.srcObject = stream;
        }
      } catch (err: any) {
        console.error("Error sharing screen", err);
        alert("ไม่สามารถแชร์หน้าจอได้: " + (err.message || "กรุณาลองเปิดแอปในแท็บใหม่ (Open in New Tab) เพื่ออนุญาตการแชร์หน้าจอ"));
      }
    }
  };

  // --- Dynamic Canvas Normalizer & Renderer ---
  const normalizeBoardData = (raw: any): BoardData | null => {
    if (!raw) return null;
    let itemsArray: BoardItem[] = [];

    if (Array.isArray(raw)) {
      itemsArray = raw;
    } else if (Array.isArray(raw?.items)) {
      itemsArray = raw.items;
    } else if (Array.isArray(raw?.words)) {
      itemsArray = raw.words;
    } else if (Array.isArray(raw?.vocabulary)) {
      itemsArray = raw.vocabulary;
    } else if (typeof raw === 'object') {
      if (raw.word || raw.meaning || raw.pinyin || raw.text) {
        itemsArray = [{
          word: raw.word || raw.text || raw.vocab || raw.chinese || raw.english || '',
          pinyin: raw.pinyin || raw.phonetic || raw.pronunciation,
          meaning: raw.meaning || raw.translation || raw.definition || '',
          example: raw.example || raw.sentence || raw.sample
        }];
      }
    }

    itemsArray = itemsArray
      .map((item: any) => ({
        word: String(item.word || item.vocab || item.chinese || item.english || '').trim(),
        pinyin: item.pinyin ? String(item.pinyin).trim() : undefined,
        meaning: item.meaning ? String(item.meaning).trim() : '',
        example: item.example ? String(item.example).trim() : undefined
      }))
      .filter(item => Boolean(item.word || item.meaning));

    if (itemsArray.length === 0) return null;
    return { items: itemsArray };
  };

  const renderDynamicCanvas = () => {
    const normalized = normalizeBoardData(boardData);
    if (!normalized || !normalized.items || normalized.items.length === 0) return null;

    const items = normalized.items;
    const itemCount = items.length;
    const isDenseBoard = itemCount > 8;
    const isVeryDenseBoard = itemCount > 20;
    
    return (
      <motion.div 
        key={`dynamic-${items[0]?.word || 'board'}-${items.length}`}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        className={`flex flex-col items-center justify-start h-full w-full overflow-y-auto ${isDenseBoard ? 'p-4' : 'p-8'}`}
      >
        <div className={`w-full max-w-6xl grid grid-cols-1 ${isDenseBoard ? 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3' : 'md:grid-cols-2 gap-6'} pb-20`}>
          {items.map((item, idx) => {
            const isChinese = item.word && /[\u4e00-\u9fa5]/.test(item.word);
            const showHanzi = isChinese && item.word.length <= 50 && !isVeryDenseBoard; // Keep large boards responsive

            return (
              <div key={idx} className={`bg-white rounded-lg shadow-sm border border-gray-100 flex flex-col hover:shadow-md transition-shadow ${isDenseBoard ? 'p-3' : 'p-6'} ${items.length === 1 ? 'col-span-1 md:col-span-2' : ''}`}>
                {item.pinyin && (
                  <div className={`${isDenseBoard ? 'text-sm mb-2' : 'text-lg mb-3'} text-gray-500 tracking-widest font-medium font-mono text-center break-words`}>
                    {item.pinyin}
                  </div>
                )}
                
                {showHanzi ? (
                  <div className="mb-4">
                    <ChineseCharacters word={item.word} />
                  </div>
                ) : (
                  <div className={`${isDenseBoard ? 'text-xl sm:text-2xl mb-2' : 'text-3xl sm:text-4xl mb-4'} font-bold text-gray-900 tracking-tight break-words text-center`}>
                    {item.word}
                  </div>
                )}
                
                <div className={`${isDenseBoard ? 'text-sm mb-2 px-3 py-2' : 'text-xl mb-4 px-4 py-2'} text-indigo-700 font-semibold bg-indigo-50 rounded-lg text-center break-words`}>
                  {item.meaning}
                </div>
                
                {item.example && (
                   <div className={`${isDenseBoard ? 'text-sm px-3 py-2' : 'text-base px-4 py-3'} text-gray-600 font-medium border border-gray-100 rounded-lg bg-gray-50 mt-auto break-words`}>
                      {item.example}
                   </div>
                )}
              </div>
            );
          })}
        </div>
      </motion.div>
    );
  };

  return (
    <div className="flex flex-col h-full w-full gap-3 relative p-4" style={{ background: 'transparent' }}>
      {/* ── Testing Plan BYOK Promotion Pill Banner (Slim & Dismissible) ── */}
      {userSub?.tier === 'TESTING' && !isByokActive && !isTestingBannerDismissed && (
        <div className="shrink-0 flex items-center justify-between gap-3 px-3.5 py-2 rounded-2xl bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border border-emerald-300 text-emerald-950 shadow-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base shrink-0">🎁</span>
            <div className="text-xs truncate sm:whitespace-normal leading-snug">
              <span className="font-bold text-emerald-900">สิทธิ์พิเศษบัญชีใหม่ 14 วัน:</span>{' '}
              <span className="text-emerald-800">
                โทรเสียง & วิดีโอคอลฟรีไม่จำกัด (0 เครดิต) เพียงเชื่อมต่อ Google API Key ฟรีของคุณ
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('open-byok-modal'))}
              className="flex items-center gap-1 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded-xl shadow-xs transition-all hover:scale-102 cursor-pointer whitespace-nowrap"
            >
              <span>ดูวิธีทำ 1 นาที</span>
              <ChevronRight size={13} />
            </button>
            <button
              type="button"
              onClick={() => setIsTestingBannerDismissed(true)}
              className="text-emerald-700/60 hover:text-emerald-900 p-1 rounded-lg hover:bg-emerald-200/50 transition-colors"
              title="ปิดการแจ้งเตือนนี้"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-row flex-1 w-full gap-2 md:gap-4 relative min-h-0">
        {/* Left: User & AI Camera Column */}
      <div className="w-28 md:w-1/3 lg:w-1/4 flex flex-col gap-2 md:gap-4 shrink-0">
        <div className="flex justify-between items-center bg-white p-2 rounded-2xl shadow-sm border border-gray-100">
          <span className="text-sm font-bold text-gray-700 ml-2">โหมดฝึกพูดจริงจัง</span>
          <button 
            onClick={() => {
              const nextMode = !isSeriousMode;
              setIsSeriousMode(nextMode);
              if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                  type: 'toggle_serious_mode',
                  seriousMode: nextMode
                }));
              }
            }}
            className={`w-12 h-6 rounded-full transition-colors relative ${isSeriousMode ? 'bg-indigo-600' : 'bg-gray-300'}`}
            title={isSeriousMode ? "คลิกเพื่อสลับกลับเป็นโหมดปกติ (สอนเป็นภาษาไทย)" : "คลิกเพื่อเปิดโหมดฝึกพูดจริงจัง (สอนเป็นภาษาอังกฤษ/จีนล้วน)"}
          >
            <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${isSeriousMode ? 'left-7' : 'left-1'}`}></div>
          </button>
        </div>
        {/* Cameras Wrapper: Always Column */}
        <div className="flex flex-col gap-2 md:gap-4 flex-1 min-h-0 shrink-0">
          {/* AI Panel — Mr.Pe (EN only) or elegant placeholder (CN/TH) */}
          <div
            className="flex-1 overflow-hidden relative rounded-2xl border border-indigo-100"
            style={{ minHeight: 220, background: 'linear-gradient(145deg,#f5f3ff,#ede9fe)' }}
          >
            {activeLang === 'EN' ? (
              /* Elegant placeholder for Mr.Pe (EN) */
              <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-4">
                <div
                  className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg pulse-ring ${
                    isLiveConnected ? 'ring-2 ring-indigo-300' : ''
                  }`}
                  style={{ background: 'linear-gradient(135deg,#4f46e5,#06b6d4)' }}
                >
                  <span className="text-3xl">👨‍🏫</span>
                </div>
                <p className="text-sm font-semibold text-indigo-600 text-center">
                  Mr.Pe (AI English Tutor)
                </p>
                {isLiveConnected && (
                  <div className="flex gap-1 items-end h-4">
                    {[0,1,2,3,4].map(i => <div key={i} className="wave-bar" style={{ animationDelay: `${i*0.12}s` }} />)}
                  </div>
                )}
              </div>
            ) : (
              /* Elegant placeholder for CN / TH */
              <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-4">
                <div
                  className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg pulse-ring ${
                    isLiveConnected ? 'ring-2 ring-indigo-300' : ''
                  }`}
                  style={{ background: 'linear-gradient(135deg,#7c3aed,#5b21b6)' }}
                >
                  {activeLang === 'CN' ? (
                    <span className="text-3xl">🇨🇳</span>
                  ) : (
                    <span className="text-3xl">🇹🇭</span>
                  )}
                </div>
                <p className="text-sm font-semibold text-indigo-600 text-center">
                  {activeLang === 'CN' ? 'AI ครูภาษาจีน' : 'AI ครูภาษาไทย'}
                </p>
                {isLiveConnected && (
                  <div className="flex gap-1 items-end h-4">
                    {[0,1,2,3,4].map(i => <div key={i} className="wave-bar" style={{ animationDelay: `${i*0.12}s` }} />)}
                  </div>
                )}
              </div>
            )}
            {/* Label */}
            <div className="absolute bottom-2 right-2 badge badge-indigo text-[9px]">
              {activeLang === 'EN' ? 'Mr.Pe' : activeLang === 'CN' ? 'ครูจีน AI' : 'ครูไทย AI'}
            </div>
          </div>
          
          {/* User Camera and Screen Share */}
          <div className="shrink-0 bg-black overflow-hidden relative w-1/3 md:w-full md:h-1/3 md:min-h-[160px] rounded-2xl shadow-inner">
            {screenStream && (
              <video 
                 ref={screenVideoRef} 
                 autoPlay 
                 playsInline 
                 muted 
                 className="absolute inset-0 w-full h-full object-contain bg-black z-10" 
              />
            )}
            <video ref={videoRef} autoPlay playsInline muted className={`w-full h-full object-cover ${facingMode === 'user' ? 'transform scale-x-[-1]' : ''}`} />
            {!isVidOn && !screenStream && (
              <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center gap-1.5 z-10 text-slate-300">
                <div className="p-2 rounded-full bg-slate-800 border border-slate-700">
                  <VideoOff className="text-slate-400" size={20} />
                </div>
                <span className="text-[10px] font-medium text-slate-300">ปิดกล้อง (คอลเสียง)</span>
              </div>
            )}
            {/* User camera label */}
            <div className={`absolute bottom-2 left-2 px-2 py-0.5 rounded text-white text-[10px] md:text-xs tracking-widest font-semibold backdrop-blur-sm ${screenStream ? 'z-20 bg-indigo-900/70 border border-indigo-500/30' : 'z-20 bg-black/60'}`}>
              {screenStream ? 'แชร์หน้าจอ' : 'คุณ'}
            </div>
          </div>
        </div>

        {/* ── Call Controls — Elegant Premium ── */}
        <div
          className="flex justify-center gap-2.5 sm:gap-3 shrink-0 flex-wrap p-3 rounded-2xl"
          style={{
            background: 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(124,58,237,0.15)',
            boxShadow: '0 4px 24px rgba(124,58,237,0.12), 0 2px 8px rgba(0,0,0,0.06)',
          }}
        >
          {isCalling ? (
            <>
              {/* Call Timer & Active Rate Badge */}
              <div className="flex items-center gap-1.5 self-center flex-wrap">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-700 font-mono text-xs font-bold shadow-xs">
                  <Clock size={14} className="text-indigo-600 animate-pulse" />
                  <span>{formatCallTime(callDurationSeconds)}</span>
                </div>

                {/* Rate indicator badge */}
                {isSuperAdmin ? (
                  isByokActive ? (
                    <button
                      onClick={() => window.dispatchEvent(new CustomEvent('open-byok-modal'))}
                      className="text-[10px] font-bold px-2.5 py-1 rounded-lg border flex items-center gap-1 transition-all bg-gradient-to-r from-amber-50 to-orange-50 text-amber-950 border-amber-300 hover:brightness-95 shadow-xs"
                      title="สิทธิ์ Owner: กำลังจำลองเรตของแพลนนี้"
                    >
                      <Key size={11} className="text-amber-600" />
                      <span>👑 Owner ({userSub?.tier || 'ULTRA'}): {activeRates.isCallUnlimited ? 'โทรฟรีไม่อั้น (0 เครดิต)' : isVidOn ? `วิดีโอ 1 เครดิต/${Math.round(activeRates.videoCallSecondsPerCredit / 60)} นาที` : `เสียง 1 เครดิต/${Math.round(activeRates.audioCallSecondsPerCredit / 60)} นาที`}</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => window.dispatchEvent(new CustomEvent('open-byok-modal'))}
                      className="text-[10px] font-bold px-2.5 py-1 rounded-lg border flex items-center gap-1 transition-all bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100"
                      title="สิทธิ์ Owner: โหมดปกติ (คลิกเพื่อตั้งค่า BYOK)"
                    >
                      <Key size={11} className="text-amber-600" />
                      <span>👑 Owner ({userSub?.tier || 'ULTRA'}): {isVidOn ? 'วิดีโอ 3 เครดิต/30วิ' : 'เสียง 1 เครดิต/30วิ'}</span>
                    </button>
                  )
                ) : isRegularAdmin ? (
                  isByokActive ? (
                    <button
                      onClick={() => window.dispatchEvent(new CustomEvent('open-byok-modal'))}
                      className="text-[10px] font-bold px-2.5 py-1 rounded-lg border flex items-center gap-1 transition-all bg-gradient-to-r from-amber-50 to-emerald-50 text-emerald-900 border-emerald-300 hover:brightness-95 shadow-xs"
                      title="สิทธิ์แอดมิน: โทรฟรีไม่อั้นทั้งหมดเมื่อเปิดใช้งาน BYOK"
                    >
                      <Key size={11} className="text-amber-600" />
                      <span>Admin BYOK: โทรฟรีไม่อั้น (0 เครดิต)</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => window.dispatchEvent(new CustomEvent('open-byok-modal'))}
                      className="text-[10px] font-bold px-2.5 py-1 rounded-lg border flex items-center gap-1 transition-all bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100 animate-pulse"
                      title="คลิกเพื่อใส่ BYOK และรับสิทธิ์โทรฟรีสำหรับแอดมิน"
                    >
                      <Key size={11} className="text-rose-600" />
                      <span>Admin: คลิกใส่ BYOK เพื่อโทรฟรี (ตอนนี้คิดเรตปกติ)</span>
                    </button>
                  )
                ) : isByokActive ? (
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('open-byok-modal'))}
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border flex items-center gap-1 transition-all ${
                      activeRates.isCallUnlimited
                        ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                        : isVidOn
                        ? 'bg-purple-50 text-purple-800 border-purple-300 hover:bg-purple-100'
                        : 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                    }`}
                    title="คลิกเพื่อตรวจสอบหรือเปลี่ยน Gemini API Key (BYOK)"
                  >
                    <Key size={11} className="text-amber-600" />
                    <span>
                      {activeRates.isCallUnlimited
                        ? 'BYOK: โทรไม่อั้น (0 เครดิต)'
                        : isVidOn
                        ? `BYOK วิดีโอ 1 เครดิต / ${Math.round(activeRates.videoCallSecondsPerCredit / 60)} นาที`
                        : `BYOK เสียง 1 เครดิต / ${Math.round(activeRates.audioCallSecondsPerCredit / 60)} นาที`}
                    </span>
                  </button>
                ) : (
                  <span className={`text-[10px] font-semibold px-2 py-1 rounded-lg border hidden sm:inline-block ${
                    isVidOn 
                      ? 'bg-purple-50 text-purple-700 border-purple-200' 
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}>
                    {isVidOn ? 'วิดีโอ 3 เครดิต/30วิ' : 'เสียง 1 เครดิต/30วิ'}
                  </span>
                )}
              </div>

              {/* Speaking waveform */}
              {isSpeaking && (
                <div className="flex items-center gap-1 mr-1 self-center">
                  {[0,1,2,3,4].map(i => <div key={i} className="wave-bar" style={{ animationDelay: `${i*0.12}s` }} />)}
                </div>
              )}
              <button
                id="tutorial-call-mic"
                onClick={toggleMic}
                className={`p-3 rounded-xl transition-all duration-200 hover:scale-105 ${
                  isMicOn
                    ? 'text-indigo-700 hover:bg-indigo-50'
                    : 'bg-red-50 text-red-500 border border-red-200'
                }`}
                style={isMicOn ? { background: 'var(--c-surface-3)', border: '1px solid rgba(124,58,237,0.15)' } : {}}
              >
                {isMicOn ? <Mic size={20} /> : <MicOff size={20} />}
              </button>
              <button
                id="tutorial-call-video"
                onClick={toggleVid}
                className={`p-3 rounded-xl transition-all duration-200 hover:scale-105 ${
                  isVidOn
                    ? 'text-indigo-700 hover:bg-indigo-50'
                    : 'bg-red-50 text-red-500 border border-red-200'
                }`}
                style={isVidOn ? { background: 'var(--c-surface-3)', border: '1px solid rgba(124,58,237,0.15)' } : {}}
              >
                {isVidOn ? <Video size={20} /> : <VideoOff size={20} />}
              </button>
              <button
                onClick={toggleCamera}
                className="p-3 rounded-xl text-indigo-700 hover:scale-105 transition-all"
                style={{ background: 'var(--c-surface-3)', border: '1px solid rgba(124,58,237,0.15)' }}
                title="สลับกล้อง"
              >
                <RefreshCcw size={20} />
              </button>
              <button
                onClick={toggleScreenShare}
                className={`p-3 rounded-xl transition-all duration-200 hover:scale-105 ${
                  screenStream ? 'text-indigo-600' : 'text-indigo-700'
                }`}
                style={screenStream
                  ? { background: 'var(--c-indigo-pale)', border: '1px solid rgba(124,58,237,0.3)' }
                  : { background: 'var(--c-surface-3)', border: '1px solid rgba(124,58,237,0.15)' }
                }
                title={screenStream ? 'หยุดแชร์' : 'แชร์หน้าจอ'}
              >
                {screenStream ? <MonitorOff size={20} /> : <MonitorUp size={20} />}
              </button>
              <button
                id="tutorial-call-plus"
                onClick={() => setIsDocBoardOpen(!isDocBoardOpen)}
                className={`p-3 rounded-xl transition-all duration-200 hover:scale-105 ${
                  isDocBoardOpen ? 'text-indigo-600' : 'text-indigo-700'
                }`}
                style={isDocBoardOpen
                  ? { background: 'var(--c-indigo-pale)', border: '1px solid rgba(124,58,237,0.3)' }
                  : { background: 'var(--c-surface-3)', border: '1px solid rgba(124,58,237,0.15)' }
                }
                title={isDocBoardOpen ? 'ปิดเอกสาร' : 'เปิดเอกสาร'}
              >
                {isDocBoardOpen ? <Minus size={20} /> : <Plus size={20} />}
              </button>
              <button
                onClick={() => setIsCcEnabled(!isCcEnabled)}
                className={`p-3 rounded-xl transition-all duration-200 hover:scale-105 ${
                  isCcEnabled ? 'text-indigo-600' : 'text-indigo-700'
                }`}
                style={isCcEnabled
                  ? { background: 'var(--c-indigo-pale)', border: '1px solid rgba(124,58,237,0.3)' }
                  : { background: 'var(--c-surface-3)', border: '1px solid rgba(124,58,237,0.15)' }
                }
                title={isCcEnabled ? 'ปิดสคริปต์ / ซับไตเติ้ล' : 'เปิดสคริปต์ / ซับไตเติ้ล'}
              >
                <div className="font-black text-[13px] leading-none w-5 h-5 flex items-center justify-center border-2 rounded-sm border-current">CC</div>
              </button>
              <button
                onClick={() => { 
                  setIsCalling(false); 
                  setIsCcEnabled(false);
                  setAvatarState('idle'); 
                  clearAskWord?.(); 
                  clearAskPdfUrl?.(); 
                }}
                className="p-3 rounded-xl text-white transition-all hover:scale-105"
                style={{ background: 'linear-gradient(135deg,#ef4444,#dc2626)', boxShadow: '0 2px 12px rgba(239,68,68,0.35)' }}
                title="วางสาย"
              >
                <PhoneOff size={20} />
              </button>
            </>
          ) : (
            <motion.button
              id="tutorial-call-start"
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              onClick={async () => {
                await startCallWithCreditCheck();
                setAvatarState('greeting');
              }}
              className="flex items-center gap-2.5 text-white font-bold px-7 py-3 rounded-2xl text-sm"
              style={{ background: 'linear-gradient(135deg,#7c3aed,#5b21b6)', boxShadow: '0 4px 18px rgba(124,58,237,0.4)' }}
            >
              <Phone size={20} fill="currentColor" />
              {activeLang === 'EN'
                ? 'เริ่มสนทนากับ Mr.Pe'
                : activeLang === 'CN'
                  ? 'เริ่มสนทนาภาษาจีน'
                  : 'เริ่มสนทนาภาษาไทย'
              }
            </motion.button>
          )}
        </div>

        {/* ── Subtitles / Script Box (Auto-hidden when call ends) ── */}
        {isCalling && isCcEnabled && (
          <div 
            ref={transcriptContainerRef} 
            className="flex-1 min-h-[120px] max-h-[250px] bg-gray-900 rounded-2xl shadow-inner border border-gray-800 p-3.5 overflow-y-auto flex flex-col gap-2.5 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent shrink-0 text-sm"
          >
            <div className="flex items-center justify-between pb-1.5 border-b border-gray-800 text-xs text-gray-400 shrink-0">
              <span className="font-semibold text-gray-300 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                สคริปต์การสนทนา (Live Script)
              </span>
              <button 
                onClick={() => setIsCcEnabled(false)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition-colors"
                title="ปิดสคริปต์"
              >
                <X size={14} />
              </button>
            </div>
            {transcripts.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-500 font-medium py-3">
                กำลังรอการสนทนา...
              </div>
            ) : (
              [...transcripts].reverse().map(t => (
                <div key={t.id} className={t.role === 'user' ? 'text-right' : 'text-left'}>
                  <span className={t.role === 'user' ? 'text-amber-400 font-bold mr-2' : 'text-emerald-400 font-bold mr-2'}>
                    {t.role === 'user' ? 'คุณ:' : (activeLang === 'CN' ? 'หลี่เหล่าซือ:' : activeLang === 'EN' ? 'Mr.Pe:' : 'ครูไทย AI:')}
                  </span>
                  <span className="text-gray-100 leading-relaxed">{t.text}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Right: Board/Canvas Wrapper */}
      <div className={`flex-1 min-w-0 flex flex-col gap-2 md:gap-4 overflow-y-auto pr-1 pb-4`}>
        
        {/* Doc Board (Optional) */}
        {isDocBoardOpen && (
          <div className="flex-1 bg-white rounded-2xl border border-indigo-100 shadow-sm overflow-hidden flex flex-col relative min-h-[340px] md:min-h-[420px] max-h-[70vh] md:max-h-[78vh] shrink-0">
            {/* Header Toolbar */}
            <div className="bg-indigo-50/70 text-gray-700 border-b border-indigo-100 p-2.5 sm:p-3 flex flex-wrap justify-between items-center gap-2 shrink-0">
               <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-indigo-800">
                 <ImagePlus size={16} className="text-indigo-600 shrink-0" />
                 <span className="truncate">กระดานรูปภาพ / เอกสาร</span>
               </div>
               
               <div className="flex items-center flex-wrap gap-1 sm:gap-2">
                 {/* PDF Page Navigation & Jump */}
                 {docPdfFile && (
                   <div className="flex items-center gap-1 bg-white/80 px-2 py-0.5 rounded-xl border border-indigo-100 shadow-xs">
                     <button 
                       onClick={() => goToPdfPage(docPdfPage - 1)} 
                       disabled={docPdfPage <= 1} 
                       className="p-1 disabled:opacity-30 hover:bg-indigo-50 text-indigo-600 rounded-lg transition-colors"
                       title="หน้าก่อนหน้า"
                     >
                       <ChevronLeft size={17}/>
                     </button>

                     <div className="flex items-center gap-1 text-xs font-bold text-indigo-900">
                       <span>หน้า</span>
                       <input 
                         type="number"
                         min={1}
                         max={docPdfNumPages || 1}
                         value={docPdfInputPage}
                         onChange={(e) => setDocPdfInputPage(e.target.value)}
                         onKeyDown={(e) => {
                           if (e.key === 'Enter') {
                             const num = parseInt(docPdfInputPage, 10);
                             if (!isNaN(num)) goToPdfPage(num);
                           }
                         }}
                         onBlur={() => {
                           const num = parseInt(docPdfInputPage, 10);
                           if (!isNaN(num)) goToPdfPage(num);
                           else setDocPdfInputPage(String(docPdfPage));
                         }}
                         className="w-10 text-center py-0.5 px-1 border border-indigo-200 rounded-md text-xs font-bold text-indigo-700 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
                         title="พิมพ์เลขหน้าแล้วกด Enter เพื่อข้ามหน้า"
                       />
                       <span>/ {docPdfNumPages || 1}</span>
                     </div>

                     <button 
                       onClick={() => goToPdfPage(docPdfPage + 1)} 
                       disabled={docPdfPage >= docPdfNumPages} 
                       className="p-1 disabled:opacity-30 hover:bg-indigo-50 text-indigo-600 rounded-lg transition-colors"
                       title="หน้าถัดไป"
                     >
                       <ChevronRight size={17}/>
                     </button>
                   </div>
                 )}

                 {/* Zoom Controls for Image */}
                 {docImageBase64 && !docPdfFile && (
                   <div className="hidden sm:flex items-center gap-1 bg-white/80 px-1.5 py-0.5 rounded-xl border border-indigo-100 shadow-xs">
                     <button
                       onClick={() => setDocScale(s => Math.min(s + 0.25, 4))}
                       className="p-1 hover:bg-indigo-50 text-indigo-600 rounded-lg transition-colors"
                       title="ซูมเข้า"
                     >
                       <ZoomIn size={15} />
                     </button>
                     <span className="text-[11px] font-bold text-indigo-900 min-w-[34px] text-center">
                       {Math.round(docScale * 100)}%
                     </span>
                     <button
                       onClick={() => setDocScale(s => Math.max(s - 0.25, 0.5))}
                       className="p-1 hover:bg-indigo-50 text-indigo-600 rounded-lg transition-colors"
                       title="ซูมออก"
                     >
                       <ZoomOut size={15} />
                     </button>
                     <button
                       onClick={() => { setDocScale(1); setDocPan({ x: 0, y: 0 }); }}
                       className="p-1 hover:bg-indigo-50 text-gray-500 rounded-lg transition-colors"
                       title="รีเซ็ตขนาด"
                     >
                       <RotateCcw size={13} />
                     </button>
                   </div>
                 )}

                 {/* Fullscreen Button — Top Right */}
                 {(docImageBase64 || docPdfFile) && (
                   <button 
                     onClick={() => setIsPdfFullscreen(true)} 
                     className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
                     title="ดูแบบเต็มจอ"
                   >
                     <Maximize2 size={14}/>
                     <span>ดูแบบเต็มจอ</span>
                   </button>
                 )}

                 {/* Upload / Replace & Remove */}
                 {(docImageBase64 || docPdfFile) && (
                   <div className="flex items-center gap-1 pl-1 border-l border-indigo-200">
                     <label className="cursor-pointer text-indigo-600 hover:text-indigo-800 transition-colors p-1 hover:bg-indigo-100 rounded-lg" title="เปลี่ยนภาพ/เอกสารใหม่">
                       <ImagePlus size={16} />
                       <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleDocUpload} />
                     </label>
                     <button 
                       onClick={() => { 
                         setDocImageBase64(null); 
                         setDocPdfFile(null); 
                         setDocImageObj(null); 
                         docImageRef.current = null; 
                         setDocOverlayText(''); 
                         setDocImageError(false); 
                       }} 
                       className="text-red-500 hover:text-red-700 transition-colors p-1 hover:bg-red-50 rounded-lg" 
                       title="ลบภาพ/เอกสาร"
                     >
                        <Trash2 size={16} />
                     </button>
                   </div>
                 )}
               </div>
            </div>

            {/* Content Display Area (Flexible height & vertically scrollable for clear viewing) */}
            <div className="flex-1 relative overflow-auto bg-slate-50 flex flex-col p-2 sm:p-4 scrollbar-thin scrollbar-thumb-indigo-200">
               {!docImageBase64 && !docPdfFile ? (
                 <label id="tutorial-call-upload" className="flex flex-col items-center justify-center w-full min-h-[220px] border-2 border-dashed border-indigo-200 rounded-2xl cursor-pointer hover:bg-indigo-50/60 transition-colors m-auto p-6">
                   <div className="w-14 h-14 rounded-2xl bg-indigo-100/70 text-indigo-600 flex items-center justify-center mb-3 shadow-inner">
                     <ImagePlus size={28} />
                   </div>
                   <span className="text-sm text-indigo-900 font-bold mb-1">คลิกเพื่ออัปโหลดรูปภาพ หรือ PDF</span>
                   <span className="text-xs text-indigo-400">รูปภาพแบบฝึกหัด การบ้าน เอกสาร หรือข้อสอบ (AI จะอ่านเนื้อหาทันที)</span>
                   <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleDocUpload} />
                 </label>
               ) : docPdfFile ? (
                 <div ref={pdfPageContainerRef} className="w-full flex-1 flex flex-col items-center overflow-y-auto">
                    <Document
                       file={docPdfFile}
                       onLoadSuccess={({ numPages }) => {
                         setDocPdfNumPages(numPages);
                         setDocPdfInputPage(String(docPdfPage));
                       }}
                       loading={<div className="text-gray-400 py-10 font-medium">กำลังโหลด PDF...</div>}
                    >
                       <Page 
                         pageNumber={docPdfPage} 
                         renderTextLayer={false} 
                         renderAnnotationLayer={false} 
                         onRenderSuccess={capturePdfPageForAI}
                         className="shadow-md mb-2 rounded-lg overflow-hidden border border-gray-200" 
                         width={Math.min(window.innerWidth > 768 ? 680 : window.innerWidth - 60, 800)} 
                       />
                    </Document>
                 </div>
               ) : (
                 <div className="w-full flex-1 flex flex-col items-center justify-start overflow-y-auto py-2">
                    {docImageError ? (
                      <div className="flex flex-col items-center justify-center w-full h-full text-indigo-400 py-10">
                        <FileText size={48} className="mb-2 opacity-50" />
                        <span className="text-sm font-medium">ไฟล์ถูกอัปโหลดสำเร็จ (AI มองเห็นเนื้อหา)</span>
                        <span className="text-xs opacity-70 mt-1">บราวเซอร์ไม่รองรับการแสดงผลรูปภาพนี้</span>
                      </div>
                    ) : (
                      <div className="w-full flex flex-col items-center">
                        <img 
                          src={docImageBase64} 
                          alt="Uploaded Doc" 
                          onError={() => setDocImageError(true)}
                          className="w-full max-w-2xl rounded-xl shadow-md border border-gray-200 object-contain cursor-zoom-in transition-transform duration-150"
                          style={{ 
                             transform: `scale(${docScale}) translate(${docPan.x}px, ${docPan.y}px)`,
                             transformOrigin: 'top center'
                          }}
                          onClick={() => setIsPdfFullscreen(true)}
                          title="คลิกเพื่อดูแบบเต็มจอ"
                        />
                        <p className="text-[11px] text-gray-400 mt-2 font-medium">
                          แตะหรือคลิกที่รูปภาพเพื่อเปิดโหมดดูเต็มจอ
                        </p>
                      </div>
                    )}
                    {docOverlayText && (
                      <div className="w-full max-w-2xl mt-3 bg-yellow-50/95 backdrop-blur text-yellow-900 p-3.5 rounded-xl shadow border border-yellow-200 text-xs sm:text-sm font-medium whitespace-pre-wrap">
                         {docOverlayText}
                      </div>
                    )}
                 </div>
               )}
            </div>
          </div>
        )}

        {/* Main Board */}
        <div id="tutorial-call-board" className="flex-1 bg-white rounded-2xl border border-indigo-100 shadow-sm overflow-hidden flex flex-col relative min-h-[250px] md:min-h-[300px] shrink-0">
          {/* Canvas Toolbar */}
          <div className="bg-indigo-50/60 border-b border-indigo-100 p-3 flex justify-between items-center shrink-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-indigo-700">
              <Edit3 size={16} /> บอร์ดการเรียน {activeLang === 'EN' ? 'ภาษาอังกฤษ' : activeLang === 'CN' ? 'ภาษาจีน' : 'ภาษาไทย'}
            </div>
          </div>

        {/* Canvas Content Area */}
        <div className="flex-1 relative overflow-hidden" style={{ background: 'linear-gradient(135deg,#f8f7ff 0%,#f0effe 100%)' }}>
          <AnimatePresence mode="wait">
             {normalizeBoardData(boardData) ? (
               renderDynamicCanvas()
             ) : (
                <motion.div 
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center h-full w-full text-gray-400 p-8 text-center"
                >
                  <Edit3 size={48} className="mb-4 text-indigo-300" />
                  <p className="text-xl font-semibold text-gray-700">กระดานเรียน AI Tutor</p>
                  <p className="text-sm mt-2 max-w-sm mx-auto text-gray-500">รอให้อาจารย์ AI นำคำศัพท์ ไวยากรณ์ หรือประโยคขึ้นหน้ากระดาน...</p>
                  <button
                    onClick={() => {
                      setBoardData(activeLang === 'CN' ? {
                        items: [
                          { word: '你好', pinyin: 'nǐ hǎo', meaning: 'สวัสดี', example: '你好！很高兴认识你。' },
                          { word: '谢谢', pinyin: 'xiè xie', meaning: 'ขอบคุณ', example: '谢谢你的帮助。' },
                          { word: '再见', pinyin: 'zài jiàn', meaning: 'ลาก่อน', example: '明天见，再见！' },
                          { word: '苹果', pinyin: 'píng guǒ', meaning: 'แอปเปิ้ล', example: '我喜欢吃苹果。' }
                        ]
                      } : {
                        items: [
                          { word: 'Welcome', pinyin: '/ˈwel.kəm/', meaning: 'ยินดีต้อนรับ', example: 'Welcome to your AI Tutor session!' },
                          { word: 'Vocabulary', pinyin: '/vəˈkæb.jə.ler.i/', meaning: 'คำศัพท์', example: 'Let us practice 20 vocabulary words together.' },
                          { word: 'Conversation', pinyin: '/ˌkɑːn.vɚˈseɪ.ʃən/', meaning: 'การสนทนา', example: 'Practice real-time speaking conversation.' }
                        ]
                      });
                    }}
                    className="mt-4 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl text-xs font-semibold border border-indigo-200 transition-colors shadow-sm cursor-pointer"
                  >
                    ✨ ทดลองแสดงตัวอย่างคำศัพท์บนกระดาน
                  </button>
                </motion.div>
             )}
          </AnimatePresence>
        </div>
        </div>
      </div>
      </div>

      {/* Fullscreen Document/Image Portal Modal */}
      {isPdfFullscreen && (docImageBase64 || docPdfFile) && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[999999] bg-slate-900/95 flex flex-col h-screen w-screen overflow-hidden backdrop-blur-md select-none">
          {/* Top Bar locked at top with safe-area padding */}
          <div className="shrink-0 z-10 bg-slate-900/90 border-b border-white/10 px-4 sm:px-6 py-3 flex items-center justify-between gap-3 pt-[max(env(safe-area-inset-top),16px)] text-white">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-2 bg-indigo-600/30 text-indigo-400 rounded-xl shrink-0 border border-indigo-500/30">
                <FileText size={18} />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-bold text-white truncate">
                  {docPdfFile ? (typeof docPdfFile === 'string' ? 'PDF Document' : docPdfFile.name) : 'รูปภาพ / เอกสารที่อัปโหลด'}
                </h3>
                <p className="text-[11px] text-indigo-300">โหมดดูเต็มจอ (AI ยังคงเห็นภาพและสนทนาได้ต่อเนื่อง)</p>
              </div>
            </div>

            {/* Middle Controls (Page Navigation or Zoom) */}
            <div className="flex items-center gap-2 sm:gap-3">
              {docPdfFile && (
                <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1 rounded-xl border border-white/15">
                  <button 
                    onClick={() => goToPdfPage(docPdfPage - 1)} 
                    disabled={docPdfPage <= 1} 
                    className="p-1 disabled:opacity-30 hover:bg-white/10 rounded-lg transition-colors text-white"
                    title="หน้าก่อนหน้า"
                  >
                    <ChevronLeft size={18}/>
                  </button>

                  <div className="flex items-center gap-1 text-xs font-bold text-white">
                    <span>หน้า</span>
                    <input 
                      type="number"
                      min={1}
                      max={docPdfNumPages || 1}
                      value={docPdfInputPage}
                      onChange={(e) => setDocPdfInputPage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const num = parseInt(docPdfInputPage, 10);
                          if (!isNaN(num)) goToPdfPage(num);
                        }
                      }}
                      onBlur={() => {
                        const num = parseInt(docPdfInputPage, 10);
                        if (!isNaN(num)) goToPdfPage(num);
                        else setDocPdfInputPage(String(docPdfPage));
                      }}
                      className="w-12 text-center py-0.5 px-1 bg-white/20 border border-white/30 rounded-md text-xs font-bold text-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
                      title="พิมพ์เลขหน้าแล้วกด Enter เพื่อข้ามหน้า"
                    />
                    <span>/ {docPdfNumPages || 1}</span>
                  </div>

                  <button 
                    onClick={() => goToPdfPage(docPdfPage + 1)} 
                    disabled={docPdfPage >= docPdfNumPages} 
                    className="p-1 disabled:opacity-30 hover:bg-white/10 rounded-lg transition-colors text-white"
                    title="หน้าถัดไป"
                  >
                    <ChevronRight size={18}/>
                  </button>
                </div>
              )}

              {docImageBase64 && !docPdfFile && (
                <div className="flex items-center gap-1 bg-white/10 px-2 py-1 rounded-xl border border-white/15">
                  <button
                    onClick={() => setDocScale(s => Math.min(s + 0.25, 5))}
                    className="p-1 hover:bg-white/10 text-white rounded-lg transition-colors"
                    title="ซูมเข้า"
                  >
                    <ZoomIn size={16} />
                  </button>
                  <span className="text-xs font-mono font-bold text-white min-w-[38px] text-center">
                    {Math.round(docScale * 100)}%
                  </span>
                  <button
                    onClick={() => setDocScale(s => Math.max(s - 0.25, 0.5))}
                    className="p-1 hover:bg-white/10 text-white rounded-lg transition-colors"
                    title="ซูมออก"
                  >
                    <ZoomOut size={16} />
                  </button>
                  <button
                    onClick={() => { setDocScale(1); setDocPan({ x: 0, y: 0 }); }}
                    className="p-1 hover:bg-white/10 text-gray-300 rounded-lg transition-colors"
                    title="รีเซ็ตขนาด"
                  >
                    <RotateCcw size={14} />
                  </button>
                </div>
              )}

              {/* Close Fullscreen Button */}
              <button
                onClick={() => setIsPdfFullscreen(false)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs sm:text-sm font-bold shadow-sm transition-colors shrink-0"
                title="ออกเต็มจอ"
              >
                <X size={16} />
                <span>ออกเต็มจอ</span>
              </button>
            </div>
          </div>

          {/* Fullscreen Body Content */}
          <div className="flex-1 w-full overflow-auto p-4 flex flex-col items-center justify-start scrollbar-thin scrollbar-thumb-white/20">
            {docPdfFile ? (
              <div className="w-full flex flex-col items-center justify-start">
                <Document
                  file={docPdfFile}
                  onLoadSuccess={({ numPages }) => {
                    setDocPdfNumPages(numPages);
                    setDocPdfInputPage(String(docPdfPage));
                  }}
                  loading={<div className="text-white/60 py-20 font-medium">กำลังโหลดเอกสาร PDF...</div>}
                >
                  <Page 
                    pageNumber={docPdfPage} 
                    renderTextLayer={false} 
                    renderAnnotationLayer={false} 
                    onRenderSuccess={capturePdfPageForAI}
                    className="shadow-2xl rounded-xl overflow-hidden border border-white/20 mb-8" 
                    width={Math.min(window.innerWidth * 0.94, 1100)} 
                  />
                </Document>
              </div>
            ) : (
              <div className="w-full flex-1 flex flex-col items-center justify-center relative overflow-hidden min-h-[400px]">
                <img 
                  src={docImageBase64 || ''} 
                  alt="Uploaded Doc Fullscreen" 
                  className="max-w-[95vw] max-h-[85vh] object-contain rounded-xl shadow-2xl transition-transform duration-100"
                  style={{ 
                    transform: `scale(${docScale}) translate(${docPan.x}px, ${docPan.y}px)`,
                    cursor: isDraggingDoc ? 'grabbing' : 'grab'
                  }}
                  onMouseDown={(e) => {
                    setIsDraggingDoc(true);
                    setDragStart({ x: e.clientX - docPan.x, y: e.clientY - docPan.y });
                  }}
                  onMouseMove={(e) => {
                    if (!isDraggingDoc) return;
                    setDocPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
                  }}
                  onMouseUp={() => setIsDraggingDoc(false)}
                  onMouseLeave={() => setIsDraggingDoc(false)}
                  onWheel={(e) => {
                    e.preventDefault();
                    const scaleAmount = e.deltaY > 0 ? 0.9 : 1.1;
                    setDocScale(prev => Math.max(0.5, Math.min(prev * scaleAmount, 5)));
                  }}
                />
                {docOverlayText && (
                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 max-w-2xl w-[90%] bg-slate-900/90 border border-yellow-400/40 text-yellow-300 p-4 rounded-2xl shadow-xl text-xs sm:text-sm font-medium backdrop-blur-md">
                    {docOverlayText}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Insufficient Credits Alert Modal */}
      <InsufficientCreditsModal
        isOpen={showInsufficientModal}
        onClose={() => setShowInsufficientModal(false)}
        onUpgradePlan={() => {
          setShowInsufficientModal(false);
          if (onOpenSubscription) {
            onOpenSubscription('tiers');
          } else {
            window.dispatchEvent(new CustomEvent('open-subscription-modal', { detail: { tab: 'tiers' } }));
          }
        }}
        onTopupCredits={() => {
          setShowInsufficientModal(false);
          if (onOpenSubscription) {
            onOpenSubscription('topup');
          } else {
            window.dispatchEvent(new CustomEvent('open-subscription-modal', { detail: { tab: 'topup' } }));
          }
        }}
      />
    </div>
  );
}
