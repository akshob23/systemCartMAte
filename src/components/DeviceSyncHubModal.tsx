import React, { useState } from 'react';
import {
  Radio,
  X,
  Smartphone,
  Laptop,
  Tablet,
  CheckCircle2,
  Copy,
  Check,
  RefreshCw,
  Clock,
  ShieldCheck,
  Share2
} from 'lucide-react';
import { ConnectedDevice } from '../types';
import { getOrCreateDeviceId, setDeviceName, api } from '../services/api';
import { soundEffects } from '../services/audio';

interface DeviceSyncHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  syncConnected: boolean;
  onlineDevices: ConnectedDevice[];
  onRefreshDb: () => void;
}

export const DeviceSyncHubModal: React.FC<DeviceSyncHubModalProps> = ({
  isOpen,
  onClose,
  syncConnected,
  onlineDevices,
  onRefreshDb
}) => {
  const currentDevice = getOrCreateDeviceId();
  const [editingName, setEditingName] = useState(currentDevice.name);
  const [copiedUrl, setCopiedUrl] = useState(false);

  if (!isOpen) return null;

  const handleSaveName = async () => {
    if (!editingName.trim()) return;
    setDeviceName(editingName.trim());
    await api.heartbeat();
    soundEffects.beep();
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedUrl(true);
    soundEffects.beep();
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 bg-slate-850 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Multi-Device Sync Hub
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold">
                  Zero Latency
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Live Server-Sent Events stream syncing <code className="text-emerald-400">/server/db/database.json</code>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto max-h-[75vh]">
          {/* Sync Connection Status Banner */}
          <div
            className={`p-3.5 rounded-xl border flex items-center justify-between ${
              syncConnected
                ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-300'
                : 'bg-rose-950/30 border-rose-800/40 text-rose-300'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-3 w-3">
                {syncConnected && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                )}
                <span
                  className={`relative inline-flex rounded-full h-3 w-3 ${
                    syncConnected ? 'bg-emerald-500' : 'bg-rose-500'
                  }`}
                ></span>
              </span>
              <div>
                <div className="font-bold text-xs">
                  {syncConnected ? 'Real-Time Sync Stream Active' : 'Connecting to Server Stream...'}
                </div>
                <div className="text-[11px] text-slate-400">
                  Products, stock, scans, and checkouts broadcast across devices instantly.
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                onRefreshDb();
                soundEffects.beep();
              }}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
              title="Force Sync / Reload DB"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* Current Device Settings */}
          <div className="bg-slate-850 p-4 rounded-xl border border-slate-800 space-y-2">
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
              This Device Identity
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                placeholder="e.g. Front Register #1 or Mintu's Phone Scanner"
                className="flex-1 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
              />
              <button
                onClick={handleSaveName}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors"
              >
                Save
              </button>
            </div>
            <div className="text-[11px] font-mono text-slate-500">
              Device ID: {currentDevice.id}
            </div>
          </div>

          {/* Pair Mobile Scanner Phone */}
          <div className="bg-slate-850 p-4 rounded-xl border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Share2 className="w-4 h-4 text-emerald-400" />
                Connect Phone as Wireless Scanner
              </span>
              <button
                onClick={handleCopyUrl}
                className="text-[11px] font-semibold text-emerald-400 hover:underline flex items-center gap-1"
              >
                {copiedUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedUrl ? 'Copied Link' : 'Copy URL'}
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Open this app URL on any iPhone or Android phone on the same network to use it as a wireless barcode and vision scanner.
            </p>
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 font-mono text-xs text-emerald-300 truncate select-all">
              {typeof window !== 'undefined' ? window.location.href : ''}
            </div>
          </div>

          {/* Connected Online Devices List */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
              Active Connected Devices ({onlineDevices.length || 1})
            </span>

            <div className="space-y-2">
              {onlineDevices.length === 0 ? (
                <div className="p-3 rounded-xl bg-slate-850 border border-slate-800 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Laptop className="w-4 h-4 text-emerald-400" />
                    <div>
                      <div className="font-semibold text-white">{currentDevice.name} (Current)</div>
                      <div className="text-[10px] text-slate-400">Active POS Kiosk Terminal</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400 font-bold">Online</span>
                </div>
              ) : (
                onlineDevices.map((dev) => {
                  const isSelf = dev.id === currentDevice.id;
                  return (
                    <div
                      key={dev.id}
                      className="p-3 rounded-xl bg-slate-850 border border-slate-800 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        {dev.role === 'mobile_scanner' ? (
                          <Smartphone className="w-4 h-4 text-teal-400" />
                        ) : (
                          <Laptop className="w-4 h-4 text-emerald-400" />
                        )}
                        <div>
                          <div className="font-semibold text-white flex items-center gap-1.5">
                            <span>{dev.name}</span>
                            {isSelf && (
                              <span className="text-[9px] px-1.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                                You
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            ID: {dev.id.slice(-6)} · {dev.role}
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] font-mono text-emerald-400 font-bold block">
                          Online
                        </span>
                        <span className="text-[9px] text-slate-500">
                          pinged {Math.round((Date.now() - dev.lastSeen) / 1000)}s ago
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-850 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
