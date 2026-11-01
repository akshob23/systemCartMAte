import React from 'react';
import {
  ShoppingCart,
  Database,
  Camera,
  Cpu,
  BarChart3,
  Barcode,
  Radio,
  Volume2,
  VolumeX,
  Smartphone,
  Sparkles
} from 'lucide-react';
import { ConnectedDevice } from '../types';

interface NavbarProps {
  activeTab: number;
  setActiveTab: (tab: number) => void;
  syncConnected: boolean;
  onlineDevices: ConnectedDevice[];
  currentDeviceName: string;
  isAudioOn: boolean;
  setIsAudioOn: (on: boolean) => void;
  onOpenSyncHub: () => void;
  onOpenScanObjectModal: () => void;
  cartCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  syncConnected,
  onlineDevices,
  currentDeviceName,
  isAudioOn,
  setIsAudioOn,
  onOpenSyncHub,
  onOpenScanObjectModal,
  cartCount
}) => {
  const tabs = [
    { id: 0, label: 'Checkout', icon: ShoppingCart, badge: cartCount > 0 ? cartCount : undefined },
    { id: 1, label: 'Database & Stock', icon: Database },
    { id: 2, label: 'Scan to Database', icon: Camera, highlight: true },
    { id: 3, label: 'AI Vision Training', icon: Cpu },
    { id: 4, label: 'Reports & Audit', icon: BarChart3 },
    { id: 5, label: 'Barcodes', icon: Barcode }
  ];

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-30 shadow-md">
      <div className="max-w-7xl mx-auto px-3 sm:px-4">
        {/* Top bar with store name, device status, and actions */}
        <div className="flex items-center justify-between h-14 sm:h-16 gap-2">
          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <ShoppingCart className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold tracking-tight text-lg sm:text-xl text-white">CartMate</span>
                <span className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  AI POS
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                Ultra-Efficient Object Tracking & Multi-Device Sync
              </p>
            </div>
          </div>

          {/* Quick Actions & Sync Status */}
          <div className="flex items-center gap-2">
            {/* Scan Object Quick Button */}
            <button
              onClick={onOpenScanObjectModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-sm transition-all"
              title="Scan any object with camera and save to database"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Scan Object to DB</span>
              <span className="sm:hidden">Scan DB</span>
            </button>

            {/* Live Device Sync Pill */}
            <button
              onClick={onOpenSyncHub}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                syncConnected
                  ? 'bg-slate-800/80 hover:bg-slate-800 text-slate-200 border-slate-700'
                  : 'bg-rose-950/40 text-rose-300 border-rose-800/60'
              }`}
              title="Click to view connected devices and wireless sync hub"
            >
              <span className="relative flex h-2 w-2">
                {syncConnected && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                )}
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    syncConnected ? 'bg-emerald-500' : 'bg-rose-500'
                  }`}
                ></span>
              </span>
              <Radio className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden md:inline font-mono text-[11px] text-slate-300">
                {onlineDevices.length || 1} {onlineDevices.length === 1 ? 'Device' : 'Devices'} Synced
              </span>
              <Smartphone className="w-3.5 h-3.5 text-slate-400 md:hidden" />
            </button>

            {/* Audio Toggle */}
            <button
              onClick={() => setIsAudioOn(!isAudioOn)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title={isAudioOn ? 'Mute scanner beeps' : 'Enable scanner beeps'}
            >
              {isAudioOn ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center space-x-1 overflow-x-auto pb-2 scrollbar-none text-xs sm:text-sm font-medium">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-emerald-500 text-slate-950 font-semibold shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-slate-950' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span
                    className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      isActive ? 'bg-slate-950 text-emerald-400' : 'bg-emerald-500/20 text-emerald-300'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
