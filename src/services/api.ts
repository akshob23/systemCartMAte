import { Product, Transaction, VisionSample, ScanAudit, DatabaseState } from '../types';

// Persistent Device ID across reloads
export function getOrCreateDeviceId(): { id: string; name: string } {
  if (typeof window === 'undefined') return { id: 'srv_1', name: 'Server' };

  let id = localStorage.getItem('cartmate_device_id') || localStorage.getItem('syncscan_device_id');
  let name = localStorage.getItem('cartmate_device_name') || localStorage.getItem('syncscan_device_name');

  if (!id) {
    id = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    localStorage.setItem('cartmate_device_id', id);
  }

  if (!name) {
    const isMobile = /iPhone|iPad|Android|Mobile/i.test(navigator.userAgent);
    const platform = isMobile ? 'CartMate Mobile' : 'CartMate Kiosk';
    name = `${platform} #${id.slice(-4)}`;
    localStorage.setItem('cartmate_device_name', name);
  }

  return { id, name };
}

export function setDeviceName(newName: string) {
  localStorage.setItem('cartmate_device_name', newName);
}

// REST Client
export const api = {
  async getDb(): Promise<DatabaseState> {
    const res = await fetch('/api/db');
    if (!res.ok) throw new Error('Failed to fetch database');
    return res.json();
  },

  async getProducts(): Promise<Product[]> {
    const res = await fetch('/api/products');
    if (!res.ok) throw new Error('Failed to fetch products');
    return res.json();
  },

  async addProduct(product: Partial<Product>): Promise<Product> {
    const { name: deviceName } = getOrCreateDeviceId();
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...product, deviceName })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to add product');
    }
    return res.json();
  },

  async updateProduct(id: number, updates: Partial<Product>): Promise<Product> {
    const { id: deviceId, name: deviceName } = getOrCreateDeviceId();
    const res = await fetch(`/api/products/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...updates, deviceId, deviceName })
    });
    if (!res.ok) throw new Error('Failed to update product');
    return res.json();
  },

  async deleteProduct(id: number): Promise<void> {
    const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete product');
  },

  async checkout(payload: {
    items: { productId: number; qty: number }[];
    cashGiven: number;
    ageVerified: boolean;
  }): Promise<{ transaction: Transaction; products: Product[] }> {
    const { id: deviceId, name: deviceName } = getOrCreateDeviceId();
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, deviceId, deviceName })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Checkout failed');
    }
    return res.json();
  },

  async recordScan(scan: Partial<ScanAudit>): Promise<ScanAudit> {
    const { id: deviceId, name: deviceName } = getOrCreateDeviceId();
    const res = await fetch('/api/scans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...scan, deviceId, deviceName })
    });
    return res.json();
  },

  async saveVisionSamples(samples: Partial<VisionSample>[]): Promise<void> {
    const res = await fetch('/api/train/samples', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ samples })
    });
    if (!res.ok) throw new Error('Failed to save vision samples');
  },

  async clearVisionSamples(label: string): Promise<void> {
    const res = await fetch(`/api/train/samples/${encodeURIComponent(label)}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to clear samples');
  },

  async scanObjectAI(imageBase64: string): Promise<{
    name: string;
    category: string;
    price: number;
    visionLabel: string;
    description: string;
    barcode: string;
    taxable: boolean;
    ageRestricted: boolean;
    confidence: number;
  }> {
    const res = await fetch('/api/ai/scan-object', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64 })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Object scan failed');
    }
    const json = await res.json();
    return json.data;
  },

  async heartbeat(role: string = 'kiosk'): Promise<void> {
    const { id: deviceId, name } = getOrCreateDeviceId();
    await fetch('/api/devices/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, name, role })
    }).catch(() => {});
  },

  async importDb(database: DatabaseState): Promise<void> {
    const res = await fetch('/api/db/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(database)
    });
    if (!res.ok) throw new Error('Import failed');
  },

  async resetDb(): Promise<void> {
    const res = await fetch('/api/db/reset', { method: 'POST' });
    if (!res.ok) throw new Error('Reset failed');
  }
};

// Real-Time Multi-Device SSE Sync Manager
export type SyncEventListener = (event: { type: string; data: any; timestamp: number }) => void;

class DeviceSyncManager {
  private eventSource: EventSource | null = null;
  private listeners: Set<SyncEventListener> = new Set();
  private isConnected = false;
  private reconnectTimer: any = null;
  private heartbeatTimer: any = null;

  connect() {
    if (this.eventSource) return;

    const { id: deviceId } = getOrCreateDeviceId();
    const url = `/api/sync/events?deviceId=${encodeURIComponent(deviceId)}`;

    try {
      this.eventSource = new EventSource(url);

      this.eventSource.onopen = () => {
        this.isConnected = true;
        this.notify({ type: 'sync_connected', data: { status: 'connected' }, timestamp: Date.now() });
      };

      this.eventSource.onmessage = (e) => {
        try {
          const parsed = JSON.parse(e.data);
          this.notify(parsed);
        } catch (err) {
          console.error('Failed to parse SSE payload:', err);
        }
      };

      this.eventSource.onerror = () => {
        this.isConnected = false;
        this.notify({ type: 'sync_disconnected', data: { status: 'disconnected' }, timestamp: Date.now() });
        this.close();
        // Auto-reconnect with backoff
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => this.connect(), 3000);
      };

      // Periodic heartbeat
      api.heartbeat();
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = setInterval(() => api.heartbeat(), 25000);
    } catch (e) {
      console.error('SSE connect failed:', e);
    }
  }

  subscribe(listener: SyncEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(event: { type: string; data: any; timestamp: number }) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (e) {
        console.error('Sync listener error:', e);
      }
    }
  }

  get connected(): boolean {
    return this.isConnected;
  }

  close() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    clearInterval(this.heartbeatTimer);
  }
}

export const syncManager = new DeviceSyncManager();
