import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { SelfCheckout } from './components/SelfCheckout';
import { DatabaseView } from './components/DatabaseView';
import { VisionTrainingView } from './components/VisionTrainingView';
import { ReportsView } from './components/ReportsView';
import { BarcodeStudioView } from './components/BarcodeStudioView';
import { ScanObjectModal } from './components/ScanObjectModal';
import { DeviceSyncHubModal } from './components/DeviceSyncHubModal';
import { Product, VisionSample, Transaction, ScanAudit, ConnectedDevice } from './types';
import { api, syncManager, getOrCreateDeviceId } from './services/api';
import { soundEffects } from './services/audio';

export default function App() {
  const [activeTab, setActiveTab] = useState(0);
  const [products, setProducts] = useState<Product[]>([]);
  const [visionSamples, setVisionSamples] = useState<VisionSample[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [recentScans, setRecentScans] = useState<ScanAudit[]>([]);
  const [onlineDevices, setOnlineDevices] = useState<ConnectedDevice[]>([]);
  const [syncConnected, setSyncConnected] = useState(false);
  const [isAudioOn, setIsAudioOn] = useState(true);

  // Global Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'info' | 'success' | 'alert'>('info');

  // Modals
  const [isScanObjectModalOpen, setIsScanObjectModalOpen] = useState(false);
  const [isSyncHubModalOpen, setIsSyncHubModalOpen] = useState(false);

  const showToast = useCallback((msg: string, type: 'info' | 'success' | 'alert' = 'info') => {
    setToastMessage(msg);
    setToastType(type);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 3500);
  }, []);

  // Sync audio toggle with soundEffects singleton
  useEffect(() => {
    soundEffects.enabled = isAudioOn;
  }, [isAudioOn]);

  // Load Database State
  const fetchDatabase = useCallback(async () => {
    try {
      const db = await api.getDb();
      setProducts(db.products || []);
      setVisionSamples(db.visionSamples || []);
      setTransactions(db.transactions || []);
      setRecentScans(db.recentScans || []);
      setOnlineDevices(db.devices || []);
    } catch (err) {
      console.error('Failed to load database state:', err);
    }
  }, []);

  useEffect(() => {
    fetchDatabase();
  }, [fetchDatabase]);

  // Setup Real-Time Multi-Device Sync Stream
  useEffect(() => {
    syncManager.connect();

    const unsubscribe = syncManager.subscribe((event) => {
      switch (event.type) {
        case 'sync_connected':
          setSyncConnected(true);
          break;

        case 'sync_disconnected':
          setSyncConnected(false);
          break;

        case 'product_added':
          fetchDatabase();
          showToast(`⚡ ${event.data.deviceName || 'Another device'} added "${event.data.product.name}" to database!`, 'success');
          break;

        case 'product_updated':
          fetchDatabase();
          showToast(`🔄 "${event.data.product.name}" updated from ${event.data.deviceName || 'device'}`, 'info');
          break;

        case 'product_deleted':
          fetchDatabase();
          break;

        case 'sale_completed':
          fetchDatabase();
          showToast(`🛒 Sale #${event.data.transaction.id} completed ($${(event.data.transaction.total / 100).toFixed(2)})`, 'success');
          break;

        case 'training_updated':
          fetchDatabase();
          break;

        case 'scan_recorded':
          setRecentScans((prev) => [event.data, ...prev.slice(0, 150)]);
          break;

        case 'devices_updated':
          if (event.data.devices) {
            setOnlineDevices(event.data.devices);
          }
          break;

        case 'database_reset_or_imported':
          fetchDatabase();
          showToast('Database reloaded from server', 'info');
          break;

        default:
          break;
      }
    });

    return () => {
      unsubscribe();
    };
  }, [fetchDatabase, showToast]);

  const currentDevice = getOrCreateDeviceId();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased selection:bg-emerald-500 selection:text-slate-950">
      {/* Header Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={(tab) => {
          if (tab === 2) {
            // Tab 2 shortcut opens the Scan Object to Database Modal
            setIsScanObjectModalOpen(true);
          } else {
            setActiveTab(tab);
          }
        }}
        syncConnected={syncConnected}
        onlineDevices={onlineDevices}
        currentDeviceName={currentDevice.name}
        isAudioOn={isAudioOn}
        setIsAudioOn={setIsAudioOn}
        onOpenSyncHub={() => setIsSyncHubModalOpen(true)}
        onOpenScanObjectModal={() => setIsScanObjectModalOpen(true)}
        cartCount={0}
      />

      {/* Main Content Area */}
      <main className="flex-1 pb-16">
        {activeTab === 0 && (
          <SelfCheckout
            products={products}
            visionSamples={visionSamples}
            matchDistanceThreshold={2.0}
            taxRate={0.08}
            onOpenScanObjectModal={() => setIsScanObjectModalOpen(true)}
            onSaleComplete={() => fetchDatabase()}
            onRefreshDb={fetchDatabase}
          />
        )}

        {activeTab === 1 && (
          <DatabaseView
            products={products}
            onOpenScanObjectModal={() => setIsScanObjectModalOpen(true)}
            onRefreshDb={fetchDatabase}
          />
        )}

        {activeTab === 3 && (
          <VisionTrainingView
            products={products}
            visionSamples={visionSamples}
            matchDistanceThreshold={2.0}
            onRefreshDb={fetchDatabase}
          />
        )}

        {activeTab === 4 && (
          <ReportsView
            products={products}
            transactions={transactions}
            recentScans={recentScans}
            onRefreshDb={fetchDatabase}
          />
        )}

        {activeTab === 5 && (
          <BarcodeStudioView
            products={products}
            onRefreshDb={fetchDatabase}
          />
        )}
      </main>

      {/* Multi-Device Toast Banner */}
      {toastMessage && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none animate-in slide-in-from-bottom-3 duration-200">
          <div
            className={`px-4 py-2 rounded-2xl shadow-2xl backdrop-blur-md border text-xs sm:text-sm font-semibold flex items-center gap-2 ${
              toastType === 'success'
                ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/40 shadow-emerald-900/30'
                : 'bg-slate-900/90 text-slate-200 border-slate-700 shadow-slate-950/50'
            }`}
          >
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* Camera Object Scanner to Database Modal */}
      <ScanObjectModal
        isOpen={isScanObjectModalOpen}
        onClose={() => setIsScanObjectModalOpen(false)}
        onProductAdded={(newProd) => {
          fetchDatabase();
          showToast(`"${newProd.name}" added to database and synced across devices!`, 'success');
        }}
      />

      {/* Multi-Device Real-time Wireless Sync Hub Modal */}
      <DeviceSyncHubModal
        isOpen={isSyncHubModalOpen}
        onClose={() => setIsSyncHubModalOpen(false)}
        syncConnected={syncConnected}
        onlineDevices={onlineDevices}
        onRefreshDb={fetchDatabase}
      />
    </div>
  );
}
