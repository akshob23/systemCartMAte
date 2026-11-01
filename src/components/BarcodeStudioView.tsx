import React, { useState } from 'react';
import {
  Barcode as BarcodeIcon,
  Printer,
  Sparkles,
  Upload,
  CheckCircle2,
  AlertCircle,
  Download
} from 'lucide-react';
import { Product } from '../types';
import { generateEanSvg, isValidEan, normalizeBarcode, detectBarcodes } from '../services/vision';
import { api } from '../services/api';
import { soundEffects } from '../services/audio';

interface BarcodeStudioViewProps {
  products: Product[];
  onRefreshDb: () => void;
}

export const BarcodeStudioView: React.FC<BarcodeStudioViewProps> = ({
  products,
  onRefreshDb
}) => {
  const [testResult, setTestResult] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  // Generate missing barcodes for any product lacking an EAN-13
  const handleGenerateMissing = async () => {
    let count = 0;
    for (const prod of products) {
      if (!prod.barcode || !isValidEan(normalizeBarcode(prod.barcode))) {
        // Update product via API (server auto-generates EAN-13 if blank)
        await api.updateProduct(prod.id, { barcode: '' });
        count++;
      }
    }

    soundEffects.success();
    alert(count ? `Generated ${count} new standard EAN-13 barcodes!` : 'All products already have valid barcodes.');
    onRefreshDb();
  };

  // Test barcode scanner on an uploaded image file
  const handleTestImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsTesting(true);
    setTestResult('Decoding image barcode...');

    try {
      const img = new Image();
      const reader = new FileReader();

      reader.onload = async () => {
        img.src = reader.result as string;
        img.onload = async () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          ctx.drawImage(img, 0, 0);

          const codes = await detectBarcodes(canvas);
          if (codes.length > 0) {
            soundEffects.beep();
            setTestResult(`Found ${codes.length} barcode(s): ${codes.join(', ')}`);
          } else {
            soundEffects.error();
            setTestResult('No barcode recognized in uploaded photo. Ensure good focus.');
          }
          setIsTesting(false);
        };
      };

      reader.readAsDataURL(file);
    } catch (err: any) {
      setTestResult(`Decode failed: ${err.message}`);
      setIsTesting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 space-y-4">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
            <BarcodeIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-white">
              Barcode Engine & Store Labels
            </h2>
            <p className="text-xs text-slate-400">
              High-resolution EAN-13 vector barcodes for shelf labels and scanner testing
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleGenerateMissing}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Generate Missing</span>
          </button>

          <button
            onClick={() => window.print()}
            className="px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Sheet</span>
          </button>
        </div>
      </div>

      {/* Test Scanner Widget */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="text-xs">
          <span className="font-bold text-white block">Test Decoder on Image File</span>
          <span className="text-slate-400">
            Upload any product barcode photo to test ZXing & algorithmic decoders
          </span>
        </div>

        <div className="flex items-center gap-3">
          <label className="px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 cursor-pointer transition-colors">
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Image</span>
            <input type="file" accept="image/*" onChange={handleTestImage} className="hidden" />
          </label>

          {testResult && (
            <span className="text-xs font-mono text-emerald-400 font-semibold">
              {testResult}
            </span>
          )}
        </div>
      </div>

      {/* Barcode Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5 print:grid-cols-3 print:gap-4">
        {products.map((p) => {
          const code = p.barcode ? normalizeBarcode(p.barcode) : '';
          const isValid = isValidEan(code);
          const svgMarkup = isValid ? generateEanSvg(code) : '';

          return (
            <div
              key={p.id}
              className="bg-white text-slate-950 rounded-xl p-3 border border-slate-200 shadow-sm flex flex-col items-center justify-between text-center print:border-black"
            >
              {/* Product Info */}
              <div className="w-full mb-1">
                <div className="font-bold text-xs truncate">{p.name}</div>
                <div className="text-[11px] font-mono text-slate-600 font-semibold">
                  ${(p.price / 100).toFixed(2)}
                </div>
              </div>

              {/* Barcode Graphic */}
              <div className="w-full my-1 flex items-center justify-center min-h-[90px]">
                {isValid && svgMarkup ? (
                  <div
                    className="w-full flex justify-center"
                    dangerouslySetInnerHTML={{ __html: svgMarkup }}
                  />
                ) : (
                  <div className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">
                    No valid EAN-13
                  </div>
                )}
              </div>

              {/* Vision Label */}
              <div className="w-full text-[10px] text-slate-500 font-mono truncate">
                Label: {p.visionLabel || '—'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
