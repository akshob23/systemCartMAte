export interface Product {
  id: number;
  name: string;
  price: number; // in cents
  barcode: string;
  visionLabel: string;
  category: string;
  taxable: boolean;
  ageRestricted: boolean;
  stock: number;
  imageUrl?: string;
  lastUpdated: string;
}

export interface VisionSample {
  id: string;
  label: string;
  session: number;
  features: number[];
  timestamp: number;
}

export interface CartItem {
  product: Product;
  qty: number;
}

export interface SaleItem {
  productId: number;
  name: string;
  qty: number;
  unitPrice: number;
  taxable: boolean;
}

export interface Transaction {
  id: number;
  timestamp: string;
  subtotal: number;
  tax: number;
  total: number;
  cashGiven: number;
  change: number;
  ageVerified: boolean;
  deviceId?: string;
  deviceName?: string;
  items: SaleItem[];
}

export interface ScanAudit {
  id: string;
  timestamp: number;
  source: 'vision' | 'barcode' | 'manual' | 'ai_scanner';
  value: string;
  productId: number | null;
  productName?: string;
  deviceId?: string;
  deviceName?: string;
}

export interface ConnectedDevice {
  id: string;
  name: string;
  role: 'kiosk' | 'mobile_scanner' | 'manager' | 'display';
  lastSeen: number;
  userAgent?: string;
  ip?: string;
}

export interface AppConfig {
  taxRate: number;
  matchDistanceThreshold: number;
  storeName: string;
  currencySymbol: string;
  autoScanCooldownMs: number;
}

export interface DatabaseState {
  version: number;
  lastModified: string;
  config: AppConfig;
  products: Product[];
  visionSamples: VisionSample[];
  transactions: Transaction[];
  recentScans: ScanAudit[];
  devices: ConnectedDevice[];
}

export interface TrackingHUDState {
  status: 'searching' | 'tracking' | 'locked' | 'empty' | 'added';
  label: string;
  distance: number;
  confidencePercent: number;
  stabilityProgress: number; // 0 to 100%
  fps: number;
  latencyMs: number;
  lastDetectedCode?: string;
}
