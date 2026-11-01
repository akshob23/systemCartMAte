import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  Barcode as BarcodeIcon,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  CreditCard,
  Banknote,
  Check,
  AlertTriangle,
  Sparkles,
  Printer,
  X,
  Volume2,
  Sliders,
  RotateCcw,
  ShieldAlert,
  Radio,
  Zap
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Product, CartItem, Transaction, VisionSample, TrackingHUDState } from '../types';
import {
  calculateROI,
  extractFeatures,
  classifyFeatures,
  detectBarcodes,
  normalizeBarcode
} from '../services/vision';
import { soundEffects } from '../services/audio';
import { api } from '../services/api';

interface SelfCheckoutProps {
  products: Product[];
  visionSamples: VisionSample[];
  matchDistanceThreshold: number;
  taxRate: number;
  onOpenScanObjectModal: () => void;
  onSaleComplete: (transaction: Transaction) => void;
  onRefreshDb?: () => void;
}

export const SelfCheckout: React.FC<SelfCheckoutProps> = ({
  products,
  visionSamples,
  matchDistanceThreshold,
  taxRate,
  onOpenScanObjectModal,
  onSaleComplete,
  onRefreshDb
}) => {
  // Camera & Video Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Cart & Order State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [manualDistance, setManualDistance] = useState(matchDistanceThreshold);

  // Quick In-Checkout Camera Trainer State
  const [isQuickTrainerOpen, setIsQuickTrainerOpen] = useState(false);
  const [quickTrainTarget, setQuickTrainTarget] = useState<string>('');
  const [isQuickTrainingRunning, setIsQuickTrainingRunning] = useState(false);
  const [quickTrainProgress, setQuickTrainProgress] = useState(0);

  // Tracking HUD State
  const [hudState, setHudState] = useState<TrackingHUDState>({
    status: 'empty',
    label: '',
    distance: 0,
    confidencePercent: 0,
    stabilityProgress: 0,
    fps: 0,
    latencyMs: 0
  });

  // Modals
  const [isCashModalOpen, setIsCashModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [cashTendered, setCashTendered] = useState(0);
  const [isAgeConfirmed, setIsAgeConfirmed] = useState(false);
  const [latestReceipt, setLatestReceipt] = useState<Transaction | null>(null);

  // Internal Tracking Stability Buffers
  const visionHistory = useRef<string[]>([]);
  const lastScannedTime = useRef<Record<string, number>>({});
  const lastDetectedLabel = useRef<string | null>(null);
  const frameCount = useRef(0);
  const lastFpsTimestamp = useRef(Date.now());
  const isBarcodeBusy = useRef(false);
  const animationFrameId = useRef<number | null>(null);

  // Format currency in cents to $X.XX
  const formatMoney = (cents: number): string => {
    return (cents < 0 ? '-' : '') + '$' + (Math.abs(cents) / 100).toFixed(2);
  };

  // Start Video Stream
  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 640 },
          height: { ideal: 480 }
        },
        audio: false
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraActive(true);
      }
    } catch (err: any) {
      console.warn('Camera error:', err);
      setCameraError('Camera access required. Please allow camera permissions or enter barcodes manually below.');
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
    }
  };

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, []);

  // Cart Calculations
  const subtotal = cart.reduce((sum, item) => sum + item.product.price * item.qty, 0);
  const taxableAmount = cart.reduce((sum, item) => (item.product.taxable ? sum + item.product.price * item.qty : sum), 0);
  const calculatedTax = Math.round(taxableAmount * taxRate);
  const grandTotal = subtotal + calculatedTax;
  const hasAgeRestrictedItem = cart.some((item) => item.product.ageRestricted);
  const totalItemsCount = cart.reduce((sum, item) => sum + item.qty, 0);

  // Add Item to Cart
  const addItemToCart = useCallback(
    (product: Product, source: 'vision' | 'barcode' | 'manual', scannedVal: string) => {
      setCart((prev) => {
        const existing = prev.find((i) => i.product.id === product.id);
        if (existing) {
          return prev.map((i) => (i.product.id === product.id ? { ...i, qty: i.qty + 1 } : i));
        }
        return [...prev, { product, qty: 1 }];
      });

      // Sound feedback
      if (product.ageRestricted) {
        soundEffects.ageAlert();
      } else {
        soundEffects.beep();
      }

      // Record audit
      api.recordScan({
        source,
        value: scannedVal,
        productId: product.id,
        productName: product.name
      }).catch(() => {});
    },
    []
  );

  // Handle incoming barcode string
  const handleBarcodeScanned = useCallback(
    (rawCode: string, manual = false) => {
      const code = normalizeBarcode(rawCode);
      const now = Date.now();
      const lastScanned = lastScannedTime.current[code] || 0;

      // Debounce repetitive camera scans within 1.8 seconds
      if (!manual && now - lastScanned < 1800) {
        return;
      }
      lastScannedTime.current[code] = now;

      const product = products.find((p) => p.barcode && normalizeBarcode(p.barcode) === code);
      if (product) {
        addItemToCart(product, manual ? 'manual' : 'barcode', code);
      } else {
        soundEffects.error();
        api.recordScan({
          source: 'barcode',
          value: code,
          productId: null,
          productName: 'Unrecognized Barcode'
        }).catch(() => {});
      }
    },
    [products, addItemToCart]
  );

  // Main High-Efficiency Tracking Loop (Runs on requestAnimationFrame / dynamic tick)
  useEffect(() => {
    let isRunning = true;

    const processFrame = async () => {
      if (!isRunning) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && video.videoWidth > 0 && canvas) {
        const t0 = performance.now();
        const vw = video.videoWidth;
        const vh = video.videoHeight;

        if (canvas.width !== vw || canvas.height !== vh) {
          canvas.width = vw;
          canvas.height = vh;
        }

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, vw, vh);

          const [rx, ry, rs] = calculateROI(vw, vh);

          // 1. Vision Feature Extraction & Classification
          let detectedLabel: string | null = null;
          let currentDist = 999;
          let currentConfidence = 0;

          if (visionSamples.length >= 3) {
            const features = extractFeatures(video);
            const classification = classifyFeatures(features, visionSamples, manualDistance);

            if (classification) {
              currentDist = classification.distance;
              currentConfidence = classification.confidence;

              const isIgnored = classification.label === '?' || classification.label.startsWith('_');
              detectedLabel = isIgnored ? null : classification.label;
            }
          }

          // 2. Barcode Scanning Pipeline (run every ~150ms when idle)
          if (!isBarcodeBusy.current) {
            isBarcodeBusy.current = true;
            detectBarcodes(video)
              .then((codes) => {
                codes.forEach((c) => handleBarcodeScanned(c));
              })
              .catch(() => {})
              .finally(() => {
                isBarcodeBusy.current = false;
              });
          }

          // 3. Temporal Tracking Stability History
          visionHistory.current.push(detectedLabel || '');
          if (visionHistory.current.length > 15) {
            visionHistory.current.shift();
          }

          // Calculate stability streak
          const recent = visionHistory.current.slice(-7);
          const isStable =
            detectedLabel &&
            recent.length >= 7 &&
            recent.every((l) => l === detectedLabel);

          const stabilityProgress = isStable
            ? 100
            : Math.min(90, Math.round((recent.filter((l) => l === detectedLabel).length / 7) * 100));

          // Trigger vision checkout scan on stable lock
          if (isStable && detectedLabel && lastDetectedLabel.current !== detectedLabel) {
            const product = products.find((p) => p.visionLabel === detectedLabel);
            if (product) {
              lastDetectedLabel.current = detectedLabel;
              addItemToCart(product, 'vision', detectedLabel);
            }
          }

          // Reset lock when item removed from scan zone
          if (lastDetectedLabel.current && (!detectedLabel || !visionHistory.current.includes(lastDetectedLabel.current))) {
            lastDetectedLabel.current = null;
          }

          // 4. Render High-Tech Tracking HUD on Canvas
          const isLocked = Boolean(detectedLabel && isStable);
          const isTracking = Boolean(detectedLabel && !isStable);

          // Colors
          const primaryColor = isLocked
            ? '#10b981' // emerald-500
            : isTracking
            ? '#f59e0b' // amber-500
            : '#06b6d4'; // cyan-500

          // ROI Box Reticle
          ctx.lineWidth = 3;
          ctx.strokeStyle = primaryColor;
          ctx.strokeRect(rx, ry, rs, rs);

          // Corner brackets
          const cornerLen = Math.min(24, rs * 0.15);
          ctx.lineWidth = 5;
          ctx.strokeStyle = primaryColor;

          // Top-Left
          ctx.beginPath();
          ctx.moveTo(rx, ry + cornerLen);
          ctx.lineTo(rx, ry);
          ctx.lineTo(rx + cornerLen, ry);
          ctx.stroke();

          // Top-Right
          ctx.beginPath();
          ctx.moveTo(rx + rs - cornerLen, ry);
          ctx.lineTo(rx + rs, ry);
          ctx.lineTo(rx + rs, ry + cornerLen);
          ctx.stroke();

          // Bottom-Left
          ctx.beginPath();
          ctx.moveTo(rx, ry + rs - cornerLen);
          ctx.lineTo(rx, ry + rs);
          ctx.lineTo(rx + cornerLen, ry + rs);
          ctx.stroke();

          // Bottom-Right
          ctx.beginPath();
          ctx.moveTo(rx + rs - cornerLen, ry + rs);
          ctx.lineTo(rx + rs, ry + rs);
          ctx.lineTo(rx + rs, ry + rs - cornerLen);
          ctx.stroke();

          // Center Crosshairs
          const cx = rx + rs / 2;
          const cy = ry + rs / 2;
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.beginPath();
          ctx.moveTo(cx - 10, cy);
          ctx.lineTo(cx + 10, cy);
          ctx.moveTo(cx, cy - 10);
          ctx.lineTo(cx, cy + 10);
          ctx.stroke();

          // Target Label Pill
          if (detectedLabel) {
            const matchedProduct = products.find((p) => p.visionLabel === detectedLabel);
            const labelText = matchedProduct
              ? `${matchedProduct.name} · ${currentConfidence}%`
              : `${detectedLabel} (d: ${currentDist.toFixed(2)})`;

            ctx.font = 'bold 15px system-ui, sans-serif';
            const textWidth = ctx.measureText(labelText).width;

            ctx.fillStyle = isLocked ? 'rgba(16, 185, 129, 0.9)' : 'rgba(245, 158, 11, 0.9)';
            ctx.roundRect(rx, Math.max(10, ry - 32), textWidth + 18, 26, 6);
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.fillText(labelText, rx + 9, Math.max(28, ry - 14));
          }

          // Latency & FPS
          const latency = Math.round(performance.now() - t0);
          frameCount.current++;
          const now = Date.now();
          if (now - lastFpsTimestamp.current >= 1000) {
            const fps = Math.round((frameCount.current * 1000) / (now - lastFpsTimestamp.current));
            frameCount.current = 0;
            lastFpsTimestamp.current = now;

            setHudState({
              status: isLocked ? 'locked' : isTracking ? 'tracking' : detectedLabel ? 'empty' : 'searching',
              label: detectedLabel || '',
              distance: currentDist,
              confidencePercent: currentConfidence,
              stabilityProgress,
              fps,
              latencyMs: latency
            });
          }
        }
      }

      animationFrameId.current = requestAnimationFrame(processFrame);
    };

    animationFrameId.current = requestAnimationFrame(processFrame);

    return () => {
      isRunning = false;
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [products, visionSamples, manualDistance, handleBarcodeScanned, addItemToCart]);

  // Quick In-Checkout Camera Trainer
  const handleQuickCameraTrain = async () => {
    if (!quickTrainTarget || !videoRef.current) return;
    setIsQuickTrainingRunning(true);
    setQuickTrainProgress(0);
    soundEffects.beep();

    const session = Math.floor(Date.now() / 600000);
    const buffer: Partial<VisionSample>[] = [];

    for (let i = 1; i <= 15; i++) {
      await new Promise((r) => setTimeout(r, 160));
      if (videoRef.current) {
        const features = extractFeatures(videoRef.current);
        buffer.push({
          label: quickTrainTarget.trim().toLowerCase(),
          session,
          features
        });
        setQuickTrainProgress(i);
        soundEffects.shutter();
      }
    }

    await api.saveVisionSamples(buffer);
    soundEffects.complete();
    confetti({ particleCount: 50, spread: 50, origin: { y: 0.7 } });
    onRefreshDb?.();
    setIsQuickTrainingRunning(false);
    setTimeout(() => {
      setIsQuickTrainerOpen(false);
      setQuickTrainProgress(0);
    }, 1200);
  };

  // Keypad Tender Handler
  const handleKeypad = (val: string) => {
    if (val === 'DEL') {
      setCashTendered((prev) => Math.floor(prev / 10));
    } else if (val === '00') {
      setCashTendered((prev) => Math.min(prev * 100, 9999900));
    } else {
      const digit = parseInt(val, 10);
      setCashTendered((prev) => Math.min(prev * 10 + digit, 9999900));
    }
  };

  // Complete Cash Checkout
  const handleCompleteSale = async () => {
    if (cashTendered < grandTotal) {
      soundEffects.error();
      alert(`Insufficient cash tendered. Total is ${formatMoney(grandTotal)}.`);
      return;
    }

    if (hasAgeRestrictedItem && !isAgeConfirmed) {
      soundEffects.ageAlert();
      alert('A cashier or staff member must verify the customer is 18+.');
      return;
    }

    try {
      const response = await api.checkout({
        items: cart.map((i) => ({ productId: i.product.id, qty: i.qty })),
        cashGiven: cashTendered,
        ageVerified: isAgeConfirmed
      });

      soundEffects.success();

      // Confetti Celebration
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.6 }
      });

      setLatestReceipt(response.transaction);
      onSaleComplete(response.transaction);
      setIsCashModalOpen(false);
      setIsReceiptModalOpen(true);
      setCart([]);
      setCashTendered(0);
      setIsAgeConfirmed(false);
    } catch (err: any) {
      alert(`Checkout failed: ${err.message}`);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4">
      {/* 2-Column Responsive Layout: Camera/Scanner (Left) & Basket/Checkout (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT COLUMN: Camera & Tracking Viewport (7 Cols on desktop) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            {/* Camera Viewport Header */}
            <div className="px-4 py-3 border-b border-slate-800 bg-slate-850 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                  <Camera className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
                    Live Optical Scanner
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      60 FPS
                    </span>
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Dual Vision Object Tracking & Real-Time Barcode Decoders
                  </p>
                </div>
              </div>

              {/* HUD Stats */}
              <div className="flex items-center gap-2 font-mono text-xs text-slate-400">
                <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700/80">
                  {hudState.fps || 60} FPS
                </span>
                <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700/80 hidden sm:inline">
                  {hudState.latencyMs}ms
                </span>
              </div>
            </div>

            {/* Viewfinder Aspect Box */}
            <div className="relative aspect-4/3 bg-slate-950 flex items-center justify-center overflow-hidden">
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              />

              {/* Camera Off / Error State */}
              {!cameraActive && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-950/90 backdrop-blur-xs">
                  <Camera className="w-12 h-12 text-slate-600 mb-2" />
                  <p className="text-sm text-slate-300 font-medium mb-1">
                    {cameraError || 'Camera is currently suspended.'}
                  </p>
                  <p className="text-xs text-slate-500 mb-4 max-w-sm">
                    Ensure camera permissions are granted. Point item at the camera to automatically identify produce and packages.
                  </p>
                  <button
                    onClick={startCamera}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md transition-colors"
                  >
                    Start Scanner Camera
                  </button>
                </div>
              )}

              {/* Live Tracking Status Badge Overlay */}
              {cameraActive && (
                <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-none">
                  <div className="px-2.5 py-1 rounded-full bg-slate-900/80 backdrop-blur-md border border-slate-700/80 text-[11px] font-mono text-slate-200 flex items-center gap-1.5 shadow-lg">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        hudState.status === 'locked'
                          ? 'bg-emerald-400 animate-pulse'
                          : hudState.status === 'tracking'
                          ? 'bg-amber-400'
                          : 'bg-cyan-400'
                      }`}
                    />
                    <span className="uppercase font-bold tracking-wider">
                      {hudState.status === 'locked'
                        ? 'TARGET LOCKED'
                        : hudState.status === 'tracking'
                        ? 'TRACKING OBJECT'
                        : 'READY FOR OBJECT'}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Scanner Controls Bar */}
            <div className="p-3.5 bg-slate-850 border-t border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {/* Scan Object Quick Trigger */}
                  <button
                    onClick={onOpenScanObjectModal}
                    className="px-3 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-emerald-200" />
                    <span>Scan Object to DB</span>
                  </button>

                  {/* Quick Camera Trainer Toggle */}
                  <button
                    onClick={() => {
                      if (!quickTrainTarget && products.length > 0) {
                        setQuickTrainTarget(products[0].visionLabel);
                      }
                      setIsQuickTrainerOpen(!isQuickTrainerOpen);
                    }}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                      isQuickTrainerOpen
                        ? 'bg-amber-500 text-slate-950 font-bold'
                        : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40'
                    }`}
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span>Quick Camera Train</span>
                  </button>
                </div>

                {/* Match Distance Sensitivity Slider */}
                <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700">
                  <Sliders className="w-3.5 h-3.5 text-slate-400" />
                  <span>Strictness:</span>
                  <input
                    type="range"
                    min="0.5"
                    max="4.0"
                    step="0.1"
                    value={manualDistance}
                    onChange={(e) => setManualDistance(parseFloat(e.target.value))}
                    className="w-20 accent-emerald-500 cursor-pointer"
                  />
                  <span className="font-mono text-slate-200 font-bold w-6 text-right">
                    {manualDistance.toFixed(1)}
                  </span>
                </div>
              </div>

              {/* In-Checkout Quick Camera Trainer Expandable Tray */}
              {isQuickTrainerOpen && (
                <div className="p-3.5 rounded-xl bg-slate-900 border border-amber-500/50 space-y-2.5 animate-in slide-in-from-top-2">
                  <div className="flex items-center justify-between text-xs font-bold text-amber-300">
                    <span className="flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-amber-400" />
                      Quick Camera Trainer
                    </span>
                    <span className="text-[11px] text-slate-400 font-normal">
                      Train directly from checkout camera in 3s
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <select
                      value={quickTrainTarget}
                      onChange={(e) => setQuickTrainTarget(e.target.value)}
                      className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-amber-400"
                    >
                      <option value="_empty">_empty (Empty Counter Baseline)</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.visionLabel || `item_${p.id}`}>
                          {p.name} ({p.visionLabel})
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={handleQuickCameraTrain}
                      disabled={isQuickTrainingRunning || !quickTrainTarget}
                      className="px-4 py-2 rounded-lg text-xs font-bold bg-amber-400 hover:bg-amber-300 text-slate-950 flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-md disabled:opacity-50"
                    >
                      {isQuickTrainingRunning ? (
                        <>
                          <Sparkles className="w-3.5 h-3.5 animate-spin text-slate-950" />
                          <span>Capturing {quickTrainProgress}/15...</span>
                        </>
                      ) : (
                        <>
                          <Camera className="w-3.5 h-3.5" />
                          <span>Hold in Box & Fast-Train (15 Frames)</span>
                        </>
                      )}
                    </button>
                  </div>

                  {isQuickTrainingRunning && (
                    <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-amber-400 h-1.5 transition-all duration-150"
                        style={{ width: `${(quickTrainProgress / 15) * 100}%` }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Barcode Gun / Manual Input Row */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <BarcodeIcon className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && barcodeInput.trim()) {
                        handleBarcodeScanned(barcodeInput.trim(), true);
                        setBarcodeInput('');
                      }
                    }}
                    placeholder="Scan barcode or type digits (e.g. 4006381333931)"
                    className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
                <button
                  onClick={() => {
                    if (barcodeInput.trim()) {
                      handleBarcodeScanned(barcodeInput.trim(), true);
                      setBarcodeInput('');
                    }
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Basket, Pricing, Age Warning, & Cashout (5 Cols on desktop) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl flex flex-col">
            {/* Basket Header */}
            <div className="px-5 py-3.5 border-b border-slate-800 bg-slate-850 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">Your Basket</h3>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300">
                  {totalItemsCount}
                </span>
              </div>

              {cart.length > 0 && (
                <button
                  onClick={() => setCart([])}
                  className="text-xs text-rose-400 hover:text-rose-300 transition-colors flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Clear
                </button>
              )}
            </div>

            {/* Age Verification Notification if alcohol/tobacco */}
            {hasAgeRestrictedItem && (
              <div className="px-4 py-2.5 bg-amber-950/40 border-b border-amber-800/50 flex items-center gap-2 text-xs text-amber-300">
                <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400" />
                <span>
                  <strong>18+ Item in Cart:</strong> Cashier age verification required before completing tender.
                </span>
              </div>
            )}

            {/* Cart Items List */}
            <div className="p-4 overflow-y-auto max-h-[340px] divide-y divide-slate-800/80">
              {cart.length === 0 ? (
                <div className="py-12 text-center text-slate-500 space-y-2">
                  <ShoppingCart className="w-10 h-10 mx-auto text-slate-700" />
                  <p className="text-sm text-slate-400 font-medium">Cart is empty</p>
                  <p className="text-xs text-slate-500 max-w-xs mx-auto">
                    Hold produce in front of the camera, scan a barcode, or choose a product to ring up.
                  </p>
                </div>
              ) : (
                cart.map((item) => (
                  <div key={item.product.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-white truncate">
                          {item.product.name}
                        </span>
                        {item.product.ageRestricted && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            18+
                          </span>
                        )}
                        {item.product.taxable && (
                          <span className="text-[10px] font-mono text-slate-400">tax</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 font-mono mt-0.5">
                        {formatMoney(item.product.price)} each
                      </div>
                    </div>

                    {/* Quantity Selector */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setCart((prev) =>
                            prev
                              .map((i) =>
                                i.product.id === item.product.id ? { ...i, qty: i.qty - 1 } : i
                              )
                              .filter((i) => i.qty > 0)
                          );
                        }}
                        className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-colors"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-6 text-center text-sm font-bold text-white font-mono">
                        {item.qty}
                      </span>
                      <button
                        onClick={() => {
                          setCart((prev) =>
                            prev.map((i) =>
                              i.product.id === item.product.id ? { ...i, qty: i.qty + 1 } : i
                            )
                          );
                        }}
                        className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Total Price */}
                    <div className="text-right min-w-[70px]">
                      <span className="text-sm font-bold text-emerald-400 font-mono">
                        {formatMoney(item.product.price * item.qty)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Subtotals & Pay Action */}
            <div className="p-4 bg-slate-850 border-t border-slate-800 space-y-3">
              <div className="space-y-1.5 text-xs text-slate-400 font-mono">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="text-slate-200">{formatMoney(subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tax ({(taxRate * 100).toFixed(1)}%)</span>
                  <span className="text-slate-200">{formatMoney(calculatedTax)}</span>
                </div>
                <div className="flex justify-between text-base font-bold text-white pt-1 border-t border-slate-700">
                  <span>TOTAL DUE</span>
                  <span className="text-emerald-400">{formatMoney(grandTotal)}</span>
                </div>
              </div>

              {/* Cash Out Button */}
              <button
                disabled={cart.length === 0}
                onClick={() => {
                  setCashTendered(0);
                  setIsAgeConfirmed(false);
                  setIsCashModalOpen(true);
                }}
                className="w-full py-3 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer"
              >
                <Banknote className="w-5 h-5" />
                <span>Pay & Cash Out ({formatMoney(grandTotal)})</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* CASH PAYMENT MODAL */}
      {isCashModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-800 bg-slate-850 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Banknote className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">Cash Payment</h3>
              </div>
              <button
                onClick={() => setIsCashModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Amounts Display */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                <div className="flex justify-between items-center text-xs text-slate-400 font-mono">
                  <span>Total Due</span>
                  <span className="text-base font-bold text-white">{formatMoney(grandTotal)}</span>
                </div>
                <div className="flex justify-between items-center text-xs text-slate-400 font-mono">
                  <span>Cash Given</span>
                  <span className="text-2xl font-bold text-emerald-400 font-mono">
                    {formatMoney(cashTendered)}
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-xs font-mono">
                  <span>Change Due</span>
                  <span
                    className={`font-bold text-sm ${
                      cashTendered >= grandTotal ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {cashTendered >= grandTotal
                      ? formatMoney(cashTendered - grandTotal)
                      : `Short ${formatMoney(grandTotal - cashTendered)}`}
                  </span>
                </div>
              </div>

              {/* Quick Cash Buttons */}
              <div className="grid grid-cols-5 gap-2">
                <button
                  onClick={() => setCashTendered(grandTotal)}
                  className="py-2 px-1 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                >
                  Exact
                </button>
                {[500, 1000, 2000, 5000].map((cents) => (
                  <button
                    key={cents}
                    onClick={() => setCashTendered(cents)}
                    className="py-2 px-1 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors font-mono"
                  >
                    ${cents / 100}
                  </button>
                ))}
              </div>

              {/* Interactive Keypad */}
              <div className="grid grid-cols-3 gap-2">
                {['7', '8', '9', '4', '5', '6', '1', '2', '3', '00', '0', 'DEL'].map((k) => (
                  <button
                    key={k}
                    onClick={() => handleKeypad(k)}
                    className="py-3 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-base font-bold text-white font-mono border border-slate-700/60 transition-colors active:scale-95"
                  >
                    {k === 'DEL' ? '⌫' : k}
                  </button>
                ))}
              </div>

              {/* 18+ Staff Confirmation Checkbox */}
              {hasAgeRestrictedItem && (
                <label className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-950/40 border border-amber-800/60 text-xs text-amber-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isAgeConfirmed}
                    onChange={(e) => setIsAgeConfirmed(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-500 bg-slate-800 border-slate-700"
                  />
                  <span>Staff confirmed customer is 18+ with valid photo ID</span>
                </label>
              )}

              {/* Tender Actions */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setIsCashModalOpen(false)}
                  className="w-1/3 py-2.5 rounded-xl font-semibold text-xs text-slate-300 hover:text-white bg-slate-800 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleCompleteSale}
                  disabled={cashTendered < grandTotal || (hasAgeRestrictedItem && !isAgeConfirmed)}
                  className="w-2/3 py-2.5 rounded-xl font-bold text-xs bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center gap-2 disabled:opacity-40 transition-colors cursor-pointer shadow-lg shadow-emerald-500/20"
                >
                  <Check className="w-4 h-4" />
                  <span>Complete Sale</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PRINTABLE RECEIPT MODAL */}
      {isReceiptModalOpen && latestReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden flex flex-col">
            <div className="px-5 py-3.5 border-b border-slate-800 bg-slate-850 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Printer className="w-4 h-4 text-emerald-400" />
                Customer Receipt
              </h3>
              <button
                onClick={() => setIsReceiptModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Monospaced Receipt Preview */}
            <div className="p-4 bg-white text-slate-900 font-mono text-xs overflow-y-auto max-h-[420px] select-all shadow-inner">
              <div className="text-center pb-2 border-b border-dashed border-slate-300 space-y-0.5">
                <div className="font-bold text-sm tracking-wide">CARTMATE STORE</div>
                <div className="text-[11px] text-slate-600">Autonomous Grocery Concept</div>
                <div className="text-[10px] text-slate-500">
                  Receipt #{String(latestReceipt.id).padStart(6, '0')} · {new Date(latestReceipt.timestamp).toLocaleTimeString()}
                </div>
              </div>

              {/* Items */}
              <div className="py-2 space-y-1 border-b border-dashed border-slate-300">
                {latestReceipt.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span className="truncate pr-2">
                      {item.qty}x {item.name}
                    </span>
                    <span className="font-semibold">{formatMoney(item.qty * item.unitPrice)}</span>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="py-2 space-y-1 border-b border-dashed border-slate-300 font-semibold">
                <div className="flex justify-between font-normal text-slate-600">
                  <span>Subtotal</span>
                  <span>{formatMoney(latestReceipt.subtotal)}</span>
                </div>
                <div className="flex justify-between font-normal text-slate-600">
                  <span>Tax</span>
                  <span>{formatMoney(latestReceipt.tax)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold pt-1">
                  <span>TOTAL PAID</span>
                  <span>{formatMoney(latestReceipt.total)}</span>
                </div>
                <div className="flex justify-between font-normal text-slate-600">
                  <span>Cash Given</span>
                  <span>{formatMoney(latestReceipt.cashGiven)}</span>
                </div>
                <div className="flex justify-between text-slate-800">
                  <span>Change Returned</span>
                  <span>{formatMoney(latestReceipt.change)}</span>
                </div>
              </div>

              <div className="text-center pt-2 text-[10px] text-slate-500">
                Thank you for shopping with CartMate!
              </div>
            </div>

            {/* Receipt Modal Footer */}
            <div className="p-3 bg-slate-850 border-t border-slate-800 flex gap-2">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center justify-center gap-1.5 transition-colors"
              >
                <Printer className="w-3.5 h-3.5" /> Print Receipt
              </button>
              <button
                onClick={() => setIsReceiptModalOpen(false)}
                className="flex-1 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
