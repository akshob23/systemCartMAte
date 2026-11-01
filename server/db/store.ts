import fs from 'fs';
import path from 'path';

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
  features: number[]; // 208-length feature vector
  timestamp: number;
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
  subtotal: number; // cents
  tax: number; // cents
  total: number; // cents
  cashGiven: number; // cents
  change: number; // cents
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

export interface AppConfig {
  taxRate: number; // e.g. 0.08 for 8%
  matchDistanceThreshold: number; // default 2.0
  storeName: string;
  currencySymbol: string;
  autoScanCooldownMs: number;
}

export interface ConnectedDevice {
  id: string;
  name: string;
  role: 'kiosk' | 'mobile_scanner' | 'manager' | 'display';
  lastSeen: number;
  userAgent?: string;
  ip?: string;
}

export interface DatabaseSchema {
  version: number;
  lastModified: string;
  config: AppConfig;
  products: Product[];
  visionSamples: VisionSample[];
  transactions: Transaction[];
  recentScans: ScanAudit[];
  devices: ConnectedDevice[];
}

const DB_DIR = path.resolve(process.cwd(), 'server', 'db');
const DB_FILE = path.join(DB_DIR, 'database.json');
const BACKUP_DIR = path.join(DB_DIR, 'backups');

const INITIAL_PRODUCTS: Product[] = [
  {
    id: 1,
    name: 'Fresh Cavendish Bananas (each)',
    price: 59,
    barcode: '4006381333931',
    visionLabel: 'banana',
    category: 'Produce',
    taxable: false,
    ageRestricted: false,
    stock: 65,
    imageUrl: 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=200&auto=format&fit=crop&q=80',
    lastUpdated: new Date().toISOString()
  },
  {
    id: 2,
    name: 'Honeycrisp Apple (each)',
    price: 89,
    barcode: '0012345678905',
    visionLabel: 'apple',
    category: 'Produce',
    taxable: false,
    ageRestricted: false,
    stock: 82,
    imageUrl: 'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=200&auto=format&fit=crop&q=80',
    lastUpdated: new Date().toISOString()
  },
  {
    id: 3,
    name: 'Valencia Orange (each)',
    price: 79,
    barcode: '2000000000039',
    visionLabel: 'orange',
    category: 'Produce',
    taxable: false,
    ageRestricted: false,
    stock: 74,
    imageUrl: 'https://images.unsplash.com/photo-1547514701-42782101795e?w=200&auto=format&fit=crop&q=80',
    lastUpdated: new Date().toISOString()
  },
  {
    id: 4,
    name: 'Artisan Lemon (each)',
    price: 69,
    barcode: '2000000000046',
    visionLabel: 'lemon',
    category: 'Produce',
    taxable: false,
    ageRestricted: false,
    stock: 50,
    imageUrl: 'https://images.unsplash.com/photo-1533038590840-1cde6e668a91?w=200&auto=format&fit=crop&q=80',
    lastUpdated: new Date().toISOString()
  },
  {
    id: 5,
    name: 'Spring Water 500ml',
    price: 149,
    barcode: '5449000000996',
    visionLabel: 'bottle',
    category: 'Beverages',
    taxable: true,
    ageRestricted: false,
    stock: 120,
    imageUrl: 'https://images.unsplash.com/photo-1559839914-ba2ae90d165f?w=200&auto=format&fit=crop&q=80',
    lastUpdated: new Date().toISOString()
  },
  {
    id: 6,
    name: 'Craft IPA 6-Pack',
    price: 1199,
    barcode: '5012345678900',
    visionLabel: 'beer_pack',
    category: 'Alcohol & Spirits',
    taxable: true,
    ageRestricted: true,
    stock: 24,
    imageUrl: 'https://images.unsplash.com/photo-1608270199042-e14b0b1341c2?w=200&auto=format&fit=crop&q=80',
    lastUpdated: new Date().toISOString()
  },
  {
    id: 7,
    name: 'Organic Whole Milk 1L',
    price: 349,
    barcode: '2000000000077',
    visionLabel: 'milk',
    category: 'Dairy',
    taxable: false,
    ageRestricted: false,
    stock: 45,
    imageUrl: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=200&auto=format&fit=crop&q=80',
    lastUpdated: new Date().toISOString()
  },
  {
    id: 8,
    name: 'Fresh Sourdough Bread Loaf',
    price: 429,
    barcode: '2000000000084',
    visionLabel: 'bread',
    category: 'Bakery',
    taxable: false,
    ageRestricted: false,
    stock: 18,
    imageUrl: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=200&auto=format&fit=crop&q=80',
    lastUpdated: new Date().toISOString()
  }
];

const INITIAL_DB: DatabaseSchema = {
  version: 1,
  lastModified: new Date().toISOString(),
  config: {
    taxRate: 0.08,
    matchDistanceThreshold: 2.0,
    storeName: 'CartMate Smart Grocery',
    currencySymbol: '$',
    autoScanCooldownMs: 1600
  },
  products: INITIAL_PRODUCTS,
  visionSamples: [],
  transactions: [],
  recentScans: [],
  devices: []
};

// In-memory cache to guarantee ultra-fast reads & atomic writes
let memoryDb: DatabaseSchema = INITIAL_DB;
let isLoaded = false;

function ensureDirectories() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

export function loadDatabase(): DatabaseSchema {
  if (isLoaded) return memoryDb;
  ensureDirectories();

  if (fs.existsSync(DB_FILE)) {
    try {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(content) as DatabaseSchema;
      if (parsed && Array.isArray(parsed.products)) {
        memoryDb = {
          ...INITIAL_DB,
          ...parsed,
          config: { ...INITIAL_DB.config, ...(parsed.config || {}) }
        };
        isLoaded = true;
        return memoryDb;
      }
    } catch (err) {
      console.error('Error reading database.json, initializing fresh database:', err);
    }
  }

  // File doesn't exist or is invalid: save initial database
  memoryDb = INITIAL_DB;
  saveDatabase(memoryDb);
  isLoaded = true;
  return memoryDb;
}

export function saveDatabase(data: DatabaseSchema): void {
  ensureDirectories();
  data.lastModified = new Date().toISOString();
  memoryDb = data;

  try {
    const tempFile = `${DB_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempFile, DB_FILE);
  } catch (err) {
    console.error('Failed to write database file atomically:', err);
  }
}

export function backupDatabase(): string {
  ensureDirectories();
  const db = loadDatabase();
  const filename = `database-backup-${Date.now()}.json`;
  const backupPath = path.join(BACKUP_DIR, filename);
  fs.writeFileSync(backupPath, JSON.stringify(db, null, 2), 'utf-8');
  return filename;
}

export function resetDatabase(): DatabaseSchema {
  backupDatabase();
  const freshDb: DatabaseSchema = {
    ...INITIAL_DB,
    lastModified: new Date().toISOString()
  };
  saveDatabase(freshDb);
  return freshDb;
}
