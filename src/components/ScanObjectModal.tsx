import React, { useState, useRef, useEffect } from 'react';
import {
  Camera,
  X,
  Sparkles,
  Loader2,
  CheckCircle2,
  Barcode,
  Layers,
  DollarSign,
  Package,
  AlertCircle,
  RefreshCw,
  FolderDown
} from 'lucide-react';
import { Product } from '../types';
import { api } from '../services/api';
import { extractFeatures } from '../services/vision';
import { soundEffects } from '../services/audio';

interface ScanObjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProductAdded: (product: Product) => void;
}

export const ScanObjectModal: React.FC<ScanObjectModalProps> = ({
  isOpen,
  onClose,
  onProductAdded
}) => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [burstProgress, setBurstProgress] = useState<number>(0);
  const [burstFeatures, setBurstFeatures] = useState<number[][]>([]);

  // Product Form Fields
  const [name, setName] = useState('');
  const [price, setPrice] = useState('1.99');
  const [category, setCategory] = useState('Produce');
  const [visionLabel, setVisionLabel] = useState('');
  const [barcode, setBarcode] = useState('');
  const [stock, setStock] = useState('60');
  const [taxable, setTaxable] = useState(false);
  const [ageRestricted, setAgeRestricted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Initialize camera when opened
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      resetForm();
      return;
    }

    startCamera();
    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const startCamera = async () => {
    setCameraError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play();
      }
    } catch (err: any) {
      console.warn('Camera access denied or failed:', err);
      setCameraError('Camera access unavailable. You can upload an image file or test with sample products.');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  };

  const resetForm = () => {
    setCapturedImage(null);
    setName('');
    setPrice('1.99');
    setCategory('Produce');
    setVisionLabel('');
    setBarcode('');
    setStock('60');
    setTaxable(false);
    setAgeRestricted(false);
    setBurstFeatures([]);
    setBurstProgress(0);
    setSuccessMessage(null);
    setIsAnalyzing(false);
  };

  // Capture frame and extract visual features
  const captureFrame = (): { dataUrl: string; features: number[] } | null => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const features = extractFeatures(video);

    return { dataUrl, features };
  };

  // Perform AI Object Scan using Gemini 3.8 Flash
  const handleAIScan = async () => {
    const frame = captureFrame();
    if (!frame) {
      setCameraError('Unable to capture camera frame. Ensure camera is active.');
      return;
    }

    setCapturedImage(frame.dataUrl);
    setIsAnalyzing(true);
    setCameraError(null);
    setBurstProgress(10);

    try {
      // 1. Gather a 5-frame burst while analyzing to train visual matching immediately
      const extractedBursts: number[][] = [frame.features];
      for (let i = 1; i <= 4; i++) {
        await new Promise((r) => setTimeout(r, 120));
        if (videoRef.current) {
          extractedBursts.push(extractFeatures(videoRef.current));
          setBurstProgress(15 + i * 15);
        }
      }
      setBurstFeatures(extractedBursts);

      // 2. Call backend Gemini AI endpoint
      const aiResult = await api.scanObjectAI(frame.dataUrl);

      setName(aiResult.name);
      setCategory(aiResult.category || 'Produce');
      setPrice((aiResult.price / 100).toFixed(2));
      setVisionLabel(aiResult.visionLabel);
      setBarcode(aiResult.barcode);
      setTaxable(aiResult.taxable);
      setAgeRestricted(aiResult.ageRestricted);

      soundEffects.beep();
      setBurstProgress(100);
    } catch (err: any) {
      console.error('Scan failed:', err);
      // Fallback sensible defaults
      setName('Scanned Store Object');
      setVisionLabel('scanned_item');
      setPrice('1.99');
      setBarcode('200' + Math.floor(100000000 + Math.random() * 900000000));
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Save Scanned Object to /server/db/database.json and sync across devices
  const handleSaveToDatabase = async () => {
    if (!name.trim()) return;

    setIsSaving(true);
    try {
      const priceCents = Math.round(parseFloat(price) * 100);
      const stockNum = parseInt(stock, 10) || 50;

      // 1. Create product in database
      const created = await api.addProduct({
        name: name.trim(),
        price: priceCents,
        barcode: barcode.trim(),
        visionLabel: visionLabel.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'),
        category,
        taxable,
        ageRestricted,
        stock: stockNum,
        imageUrl: capturedImage || ''
      });

      // 2. Save burst vision samples to DB so it immediately recognizes the object
      if (burstFeatures.length > 0 && visionLabel) {
        const samples = burstFeatures.map((f, i) => ({
          label: visionLabel.trim().toLowerCase(),
          session: Math.floor(Date.now() / 60000),
          features: f
        }));
        await api.saveVisionSamples(samples).catch(() => {});
      }

      soundEffects.success();
      setSuccessMessage(`"${created.name}" saved to /server/db/database.json and synced to all devices!`);
      onProductAdded(created);

      setTimeout(() => {
        setSuccessMessage(null);
        resetForm();
      }, 2000);
    } catch (err: any) {
      alert(`Save failed: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-850">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Scan Object to Database
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold">
                  Auto-Sync Active
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Point camera at any grocery item to classify, train vision, and update <code className="text-emerald-400">/server/db/database.json</code>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {successMessage && (
            <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-sm flex items-center gap-2.5 animate-in slide-in-from-top-2">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Viewfinder Section */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Live Camera Feed */}
            <div className="relative aspect-4/3 bg-slate-950 rounded-xl overflow-hidden border border-slate-700/80 shadow-inner flex items-center justify-center">
              {capturedImage ? (
                <img
                  src={capturedImage}
                  alt="Captured Frame"
                  className="w-full h-full object-cover"
                />
              ) : (
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              )}

              {/* Target Bounding Frame Overlay */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6">
                <div className="w-36 h-36 sm:w-44 sm:h-44 border-2 border-dashed border-emerald-400/80 rounded-2xl relative flex items-center justify-center bg-emerald-500/5">
                  <div className="absolute top-1 left-2 text-[10px] font-mono text-emerald-400 font-semibold bg-slate-900/80 px-1 rounded">
                    SCAN ZONE
                  </div>
                  {isAnalyzing && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/70 backdrop-blur-xs rounded-2xl">
                      <Loader2 className="w-7 h-7 text-emerald-400 animate-spin" />
                      <span className="text-xs text-emerald-300 font-medium mt-2">
                        Analyzing Object...
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Retake Button if captured */}
              {capturedImage && !isAnalyzing && (
                <button
                  onClick={() => setCapturedImage(null)}
                  className="absolute bottom-2 left-2 px-2.5 py-1 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-xs text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors shadow-md"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Retake
                </button>
              )}
            </div>

            {/* Quick Actions & AI Scan Trigger */}
            <div className="flex flex-col justify-between space-y-3 bg-slate-850 p-4 rounded-xl border border-slate-800">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-emerald-400" />
                  Instant Enrollment
                </h3>
                <p className="text-xs text-slate-300 mb-3">
                  Hold the item in the green frame. AI analyzes visual features, identifies product name, assigns a valid barcode, and captures training samples.
                </p>

                {cameraError && (
                  <div className="text-xs text-amber-300 bg-amber-950/40 border border-amber-800/60 p-2.5 rounded-lg mb-3 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{cameraError}</span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleAIScan}
                  disabled={isAnalyzing}
                  className="w-full py-2.5 px-4 rounded-xl font-semibold text-xs sm:text-sm bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 disabled:opacity-60 transition-all cursor-pointer"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Analyzing with Gemini AI...
                    </>
                  ) : (
                    <>
                      <Camera className="w-4 h-4" />
                      Capture & Auto-Analyze Object
                    </>
                  )}
                </button>

                {burstProgress > 0 && burstProgress < 100 && (
                  <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-emerald-400 h-1.5 transition-all duration-200"
                      style={{ width: `${burstProgress}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Form Fields for Verified Enrollment */}
          <div className="border-t border-slate-800 pt-3 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Name */}
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Product Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Organic Gala Apple"
                  className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="Produce">Produce</option>
                  <option value="Beverages">Beverages</option>
                  <option value="Bakery">Bakery</option>
                  <option value="Dairy">Dairy</option>
                  <option value="Snacks">Snacks</option>
                  <option value="Meat & Seafood">Meat & Seafood</option>
                  <option value="Pantry">Pantry</option>
                  <option value="Alcohol & Spirits">Alcohol & Spirits</option>
                  <option value="Household">Household</option>
                </select>
              </div>

              {/* Price */}
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Price ($) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-xs text-slate-400">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="1.99"
                    className="w-full pl-7 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              {/* Barcode */}
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Barcode (EAN-13)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    placeholder="Auto-generated store barcode"
                    className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                  <span className="absolute right-2.5 top-2 text-[10px] text-slate-400">
                    {barcode ? `${barcode.length} digits` : 'Auto'}
                  </span>
                </div>
              </div>

              {/* Vision Label */}
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Vision Label (for camera recognition)
                </label>
                <input
                  type="text"
                  value={visionLabel}
                  onChange={(e) => setVisionLabel(e.target.value)}
                  placeholder="e.g. gala_apple"
                  className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              {/* Initial Stock */}
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Initial Stock
                </label>
                <input
                  type="number"
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                  placeholder="50"
                  className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>
            </div>

            {/* Checkboxes */}
            <div className="flex items-center gap-6 pt-1">
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={taxable}
                  onChange={(e) => setTaxable(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-500 bg-slate-800 border-slate-700"
                />
                Apply Sales Tax
              </label>

              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ageRestricted}
                  onChange={(e) => setAgeRestricted(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-500 bg-slate-800 border-slate-700"
                />
                18+ Restricted (Requires Cashier ID Check)
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-850 flex items-center justify-between">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <FolderDown className="w-3.5 h-3.5 text-emerald-400" />
            <span>Target: <code className="text-slate-300">/server/db/database.json</code></span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveToDatabase}
              disabled={!name.trim() || isSaving}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center gap-1.5 disabled:opacity-50 transition-colors cursor-pointer shadow-md"
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Save & Sync All Devices
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
