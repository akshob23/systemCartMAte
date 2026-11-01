import { MultiFormatReader, BarcodeFormat, DecodeHintType, HTMLCanvasElementLuminanceSource, HybridBinarizer, BinaryBitmap } from '@zxing/library';
import { VisionSample } from '../types';

// EAN-13 encodings
const EL = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
const EG = ['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
const ER = ['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100'];
const EP = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];

// Check EAN-13 validity
export function isValidEan(code: string): boolean {
  const c = String(code).trim();
  if (!/^\d{13}$/.test(c)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(c[i]) * (i % 2 === 1 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10 === Number(c[12]);
}

export function calcCheckDigit(digits12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(digits12[i]) * (i % 2 === 1 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

export function normalizeBarcode(raw: string): string {
  const c = String(raw).trim();
  if (/^\d{12}$/.test(c)) return `0${c}`;
  return c;
}

// 32x32 feature extraction canvas
let featureCanvas: HTMLCanvasElement | null = null;
let featureCtx: CanvasRenderingContext2D | null = null;

function getFeatureContext(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  if (!featureCanvas) {
    featureCanvas = document.createElement('canvas');
    featureCanvas.width = 32;
    featureCanvas.height = 32;
    featureCtx = featureCanvas.getContext('2d', { willReadFrequently: true });
  }
  return { canvas: featureCanvas, ctx: featureCtx! };
}

// Region of Interest (ROI) box
export function calculateROI(videoWidth: number, videoHeight: number): [number, number, number] {
  const size = Math.round(Math.min(videoWidth, videoHeight) * 0.62);
  const x = Math.round((videoWidth - size) / 2);
  const y = Math.round((videoHeight - size) / 2);
  return [x, y, size];
}

// Extract 208-dimensional visual signature
export function extractFeatures(videoOrCanvas: HTMLVideoElement | HTMLCanvasElement): number[] {
  const { ctx } = getFeatureContext();
  const vw = (videoOrCanvas as HTMLVideoElement).videoWidth || videoOrCanvas.width;
  const vh = (videoOrCanvas as HTMLVideoElement).videoHeight || videoOrCanvas.height;
  if (!vw || !vh) return new Array(208).fill(0);

  const [rx, ry, rs] = calculateROI(vw, vh);

  ctx.drawImage(videoOrCanvas, rx, ry, rs, rs, 0, 0, 32, 32);
  const imgData = ctx.getImageData(0, 0, 32, 32);
  const d = imgData.data;

  const grid = new Float32Array(192); // 8x8 spatial tiles * 3 channels
  const hist = new Float32Array(16);  // 16 hue bins
  let totalMean = 0;

  for (let j = 0; j < 32; j++) {
    for (let i = 0; i < 32; i++) {
      const idx = (j * 32 + i) * 4;
      const r = d[idx];
      const g = d[idx + 1];
      const b = d[idx + 2];

      const cell = ((j >> 2) * 8 + (i >> 2)) * 3;
      grid[cell] += r;
      grid[cell + 1] += g;
      grid[cell + 2] += b;
      totalMean += r + g + b;

      const max = Math.max(r, g, b);
      const diff = max - Math.min(r, g, b);
      const sat = max > 0 ? diff / max : 0;

      if (sat > 0.15) {
        let hue = 0;
        if (max === r) {
          hue = ((g - b) / diff + 6) % 6;
        } else if (max === g) {
          hue = (b - r) / diff + 2;
        } else {
          hue = (r - g) / diff + 4;
        }
        const bin = Math.min(15, Math.floor((hue / 6) * 16));
        hist[bin] += sat;
      }
    }
  }

  const m = totalMean / 3072 || 1;
  const histSum = hist.reduce((acc, v) => acc + v, 0) || 1;

  const result: number[] = new Array(208);
  for (let i = 0; i < 192; i++) {
    result[i] = Number(((grid[i] / 16 / m) * 0.5).toFixed(4));
  }
  for (let i = 0; i < 16; i++) {
    result[192 + i] = Number(((hist[i] / histSum) * 2).toFixed(4));
  }

  return result;
}

// KNN Classifier
export function classifyFeatures(
  targetFeatures: number[],
  samples: VisionSample[],
  distanceThreshold = 2.0,
  skipSession?: number
): { label: string; distance: number; confidence: number } | null {
  if (!samples.length || !targetFeatures.length) return null;

  const distances: { dist: number; label: string }[] = [];

  for (const s of samples) {
    if (skipSession && s.session === skipSession) continue;
    let sum = 0;
    const len = Math.min(s.features.length, targetFeatures.length);
    for (let i = 0; i < len; i++) {
      const diff = s.features[i] - targetFeatures[i];
      sum += diff * diff;
    }
    distances.push({ dist: sum, label: s.label });
  }

  if (!distances.length) return null;
  distances.sort((a, b) => a.dist - b.dist);

  const kNearest = distances.slice(0, 5);
  const bestDist = Math.sqrt(kNearest[0].dist);

  const votes: Record<string, number> = {};
  const maxAllowableDist = distanceThreshold * 1.25;

  for (const item of kNearest) {
    if (Math.sqrt(item.dist) <= maxAllowableDist) {
      votes[item.label] = (votes[item.label] || 0) + 1;
    }
  }

  const sortedVotes = Object.entries(votes).sort((a, b) => b[1] - a[1]);
  if (!sortedVotes.length) {
    return { label: '?', distance: bestDist, confidence: 0 };
  }

  const [topLabel, topVoteCount] = sortedVotes[0];
  const isValidMatch = bestDist <= distanceThreshold && topVoteCount >= 3;

  const confidence = Math.max(0, Math.min(100, Math.round((1 - bestDist / (distanceThreshold * 1.5)) * 100)));

  return {
    label: isValidMatch ? topLabel : '?',
    distance: bestDist,
    confidence
  };
}

// Barcode Decoding Engine (ZXing + Native BarcodeDetector + Native Runs)
let nativeDetector: any = null;
try {
  if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
    nativeDetector = new (window as any).BarcodeDetector({
      formats: ['ean_13', 'upc_a', 'ean_8', 'code_128', 'upc_e']
    });
  }
} catch (e) {}

let zxingReader: MultiFormatReader | null = null;
let zxingCanvas: HTMLCanvasElement | null = null;

function getZXingReader(): MultiFormatReader {
  if (!zxingReader) {
    const hints = new Map();
    hints.set(DecodeHintType.TRY_HARDER, true);
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13,
      BarcodeFormat.UPC_A,
      BarcodeFormat.EAN_8,
      BarcodeFormat.CODE_128
    ]);
    zxingReader = new MultiFormatReader();
    zxingReader.setHints(hints);
  }
  return zxingReader;
}

function decodeZXing(source: HTMLVideoElement | HTMLCanvasElement): string[] {
  try {
    const vw = (source as HTMLVideoElement).videoWidth || source.width;
    const vh = (source as HTMLVideoElement).videoHeight || source.height;
    if (!vw || !vh) return [];

    if (!zxingCanvas) {
      zxingCanvas = document.createElement('canvas');
    }
    zxingCanvas.width = vw;
    zxingCanvas.height = vh;
    const ctx = zxingCanvas.getContext('2d');
    if (!ctx) return [];
    ctx.drawImage(source, 0, 0);

    const lumSource = new HTMLCanvasElementLuminanceSource(zxingCanvas);
    const bitmap = new BinaryBitmap(new HybridBinarizer(lumSource));
    const reader = getZXingReader();
    const result = reader.decode(bitmap);
    return result ? [result.getText()] : [];
  } catch (e) {
    return [];
  }
}

// Built-in EAN-13 algorithmic scan fallback
const scanCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
let patternTable: any = null;

function getPatternTable() {
  if (!patternTable) {
    const toRuns = (s: string) => {
      const runs: number[] = [];
      let cur = s[0], cnt = 0;
      for (const ch of s) {
        if (ch === cur) cnt++;
        else { runs.push(cnt); cur = ch; cnt = 1; }
      }
      runs.push(cnt);
      return runs;
    };
    patternTable = {
      L: EL.map(toRuns),
      G: EG.map(toRuns),
      R: ER.map(toRuns)
    };
  }
  return patternTable;
}

function matchPattern(runs: number[], right: boolean): [number, string] | null {
  const pt = getPatternTable();
  const total = runs[0] + runs[1] + runs[2] + runs[3];
  if (!total) return null;
  const unit = runs.map(r => (r * 7) / total);

  let bestScore = 1e9;
  let bestMatch: [number, string] | null = null;

  const testList = (list: number[][], charType: string) => {
    list.forEach((pat, digit) => {
      let err = 0;
      for (let j = 0; j < 4; j++) err += (unit[j] - pat[j]) ** 2;
      if (err < bestScore) {
        bestScore = err;
        bestMatch = [digit, charType];
      }
    });
  };

  if (right) {
    testList(pt.R, 'R');
  } else {
    testList(pt.L, 'L');
    testList(pt.G, 'G');
  }

  return bestScore < 2.2 ? bestMatch : null;
}

function decodeRuns(runs: number[], offset: number): string | null {
  const m = (runs[offset] + runs[offset + 1] + runs[offset + 2]) / 3;
  if (m < 1.2) return null;

  for (let k = 0; k < 3; k++) {
    if (runs[offset + k] < m * 0.4 || runs[offset + k] > m * 2.0) return null;
    const endGuard = runs[offset + 56 + k];
    if (endGuard < m * 0.4 || endGuard > m * 2.0) return null;
  }

  let centerTotal = 0;
  for (let k = 0; k < 5; k++) centerTotal += runs[offset + 27 + k];
  if (Math.abs(centerTotal / 5 - m) > m * 0.7) return null;

  let digits = '';
  let parity = '';

  for (let half = 0; half < 2; half++) {
    for (let k = 0; k < 6; k++) {
      const o = half ? offset + 32 + k * 4 : offset + 3 + k * 4;
      const matched = matchPattern(runs.slice(o, o + 4), Boolean(half));
      if (!matched) return null;
      digits += matched[0];
      if (!half) parity += matched[1];
    }
  }

  const firstDigit = EP.indexOf(parity);
  if (firstDigit < 0) return null;

  const fullCode = firstDigit + digits;
  return isValidEan(fullCode) ? fullCode : null;
}

function scanFrameAlgorithmic(source: HTMLVideoElement | HTMLCanvasElement): string[] {
  if (!scanCanvas) return [];
  const w0 = (source as HTMLVideoElement).videoWidth || source.width;
  const h0 = (source as HTMLVideoElement).videoHeight || source.height;
  if (!w0 || !h0) return [];

  const scale = Math.min(1, 900 / w0);
  const w = Math.round(w0 * scale);
  const h = Math.round(h0 * scale);
  scanCanvas.width = w;
  scanCanvas.height = h;

  const ctx = scanCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(source, 0, 0, w, h);

  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const gray = new Uint8Array(w * h);

  for (let i = 0; i < w * h; i++) {
    gray[i] = (d[i * 4] * 77 + d[i * 4 + 1] * 150 + d[i * 4 + 2] * 29) >> 8;
  }

  const detected: Record<string, number> = {};

  for (let k = 2; k < 40; k += 2) {
    const y = Math.min(h - 2, Math.max(1, Math.round((h * k) / 40)));
    const row = new Float32Array(w);
    for (let i = 0; i < w; i++) {
      row[i] = (gray[(y - 1) * w + i] + gray[y * w + i] + gray[(y + 1) * w + i]) / 3;
    }

    const sorted = Array.from(row).sort((a, b) => a - b);
    const lo = sorted[Math.floor(w * 0.05)];
    const hi = sorted[Math.floor(w * 0.95)];
    if (hi - lo < 45) continue;

    const threshold = (lo + hi) / 2;
    const runs: number[] = [];
    let cur = row[0] < threshold ? 1 : 0;
    let runLen = 1;

    for (let i = 1; i < w; i++) {
      const b = row[i] < threshold ? 1 : 0;
      if (b === cur) runLen++;
      else { runs.push(runLen); cur = b; runLen = 1; }
    }
    runs.push(runLen);

    for (let i = 0; i + 59 <= runs.length; i++) {
      const code = decodeRuns(runs, i);
      if (code) {
        detected[code] = (detected[code] || 0) + 1;
      }
    }
  }

  return Object.keys(detected).filter(c => detected[c] >= 2);
}

// Master Barcode Scanner (Hybrid Pipeline)
export async function detectBarcodes(source: HTMLVideoElement | HTMLCanvasElement): Promise<string[]> {
  const codes: string[] = [];

  // 1. Try Native BarcodeDetector
  if (nativeDetector) {
    try {
      const detected = await nativeDetector.detect(source);
      for (const item of detected) {
        if (item.rawValue) codes.push(normalizeBarcode(item.rawValue));
      }
    } catch (e) {}
  }

  // 2. Try ZXing MultiFormatReader
  if (!codes.length) {
    try {
      const zxCodes = decodeZXing(source);
      for (const c of zxCodes) {
        codes.push(normalizeBarcode(c));
      }
    } catch (e) {}
  }

  // 3. Try Algorithmic EAN-13 runs fallback
  if (!codes.length) {
    try {
      const nativeRuns = scanFrameAlgorithmic(source);
      for (const c of nativeRuns) {
        codes.push(normalizeBarcode(c));
      }
    } catch (e) {}
  }

  return [...new Set(codes.filter(c => isValidEan(c)))];
}

// Render crisp EAN-13 SVG
export function generateEanSvg(rawCode: string): string {
  const code = normalizeBarcode(rawCode);
  if (!isValidEan(code)) return '';

  const bits =
    '101' +
    Array.from(code.slice(1, 7))
      .map((d, i) => (EP[Number(code[0])][i] === 'L' ? EL : EG)[Number(d)])
      .join('') +
    '01010' +
    Array.from(code.slice(7))
      .map(d => ER[Number(d)])
      .join('') +
    '101';

  let rects = '';
  let i = 0;
  while (i < 95) {
    if (bits[i] === '1') {
      let j = i;
      while (j < 95 && bits[j] === '1') j++;
      rects += `<rect x="${i + 10}" y="6" width="${j - i}" height="64" fill="#000"/>`;
      i = j;
    } else {
      i++;
    }
  }

  return `
    <svg viewBox="0 0 115 92" xmlns="http://www.w3.org/2000/svg" class="w-full h-auto select-none">
      <rect width="115" height="92" fill="#fff" rx="4"/>
      <g shape-rendering="crispEdges">${rects}</g>
      <text x="57.5" y="85" font-size="10" text-anchor="middle" font-family="ui-monospace, monospace" font-weight="bold" fill="#000">${code}</text>
    </svg>
  `;
}
