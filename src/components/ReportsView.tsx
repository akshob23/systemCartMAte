import React, { useState } from 'react';
import {
  BarChart3,
  Calendar,
  DollarSign,
  TrendingUp,
  Package,
  Receipt,
  AlertTriangle,
  Radio,
  Clock,
  Printer,
  X
} from 'lucide-react';
import { Product, Transaction, ScanAudit } from '../types';
import { api } from '../services/api';
import { soundEffects } from '../services/audio';

interface ReportsViewProps {
  products: Product[];
  transactions: Transaction[];
  recentScans: ScanAudit[];
  onRefreshDb: () => void;
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  products,
  transactions,
  recentScans,
  onRefreshDb
}) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [selectedReceipt, setSelectedReceipt] = useState<Transaction | null>(null);

  const formatMoney = (cents: number): string => {
    return (cents < 0 ? '-' : '') + '$' + (Math.abs(cents) / 100).toFixed(2);
  };

  // Filter transactions by day
  const dailyTransactions = transactions.filter((t) => {
    const tDate = t.timestamp.split('T')[0];
    return tDate === selectedDate;
  });

  const dailyRevenue = dailyTransactions.reduce((acc, t) => acc + t.total, 0);
  const dailyTax = dailyTransactions.reduce((acc, t) => acc + t.tax, 0);
  const avgBasket = dailyTransactions.length ? Math.round(dailyRevenue / dailyTransactions.length) : 0;

  // Aggregate sales by item
  const itemSales: Record<string, { qty: number; revenue: number }> = {};
  for (const t of dailyTransactions) {
    for (const item of t.items) {
      if (!itemSales[item.name]) {
        itemSales[item.name] = { qty: 0, revenue: 0 };
      }
      itemSales[item.name].qty += item.qty;
      itemSales[item.name].revenue += item.qty * item.unitPrice;
    }
  }

  const sortedItemSales = Object.entries(itemSales).sort((a, b) => b[1].revenue - a[1].revenue);

  // Low stock products (< 10)
  const lowStockProducts = products.filter((p) => p.stock <= 10);

  const handleRestock = async (product: Product) => {
    try {
      await api.updateProduct(product.id, { stock: product.stock + 25 });
      soundEffects.beep();
      onRefreshDb();
    } catch (err: any) {
      alert(`Restock failed: ${err.message}`);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 space-y-4">
      {/* Date Header & Quick Summary */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-teal-500/10 text-teal-400">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-white">
              Daily Sales & Audit Trail
            </h2>
            <p className="text-xs text-slate-400">
              Multi-Device register transactions and live hardware scan logs
            </p>
          </div>
        </div>

        {/* Date Selector */}
        <div className="flex items-center gap-2 text-xs text-slate-300 bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700">
          <Calendar className="w-4 h-4 text-slate-400" />
          <span>Report Date:</span>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-transparent text-white font-mono text-xs focus:outline-none cursor-pointer"
          />
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl shadow-md">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">
            Completed Sales
          </span>
          <span className="text-xl sm:text-2xl font-bold text-white font-mono mt-1 block">
            {dailyTransactions.length}
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl shadow-md">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">
            Gross Revenue
          </span>
          <span className="text-xl sm:text-2xl font-bold text-emerald-400 font-mono mt-1 block">
            {formatMoney(dailyRevenue)}
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl shadow-md">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">
            Tax Collected
          </span>
          <span className="text-xl sm:text-2xl font-bold text-teal-400 font-mono mt-1 block">
            {formatMoney(dailyTax)}
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl shadow-md">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">
            Average Basket
          </span>
          <span className="text-xl sm:text-2xl font-bold text-indigo-400 font-mono mt-1 block">
            {formatMoney(avgBasket)}
          </span>
        </div>
      </div>

      {/* 2-Column: Item Revenue & Low Stock Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Item Sales Breakdown */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            Product Sales Breakdown ({selectedDate})
          </h3>

          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-850 text-slate-400 border-b border-slate-800 font-mono uppercase text-[10px]">
                  <th className="py-2 px-3">Item</th>
                  <th className="py-2 px-3">Units Sold</th>
                  <th className="py-2 px-3 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {sortedItemSales.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-slate-500">
                      No sales recorded for this date.
                    </td>
                  </tr>
                ) : (
                  sortedItemSales.map(([name, stat]) => (
                    <tr key={name} className="hover:bg-slate-850/60 transition-colors">
                      <td className="py-2 px-3 font-semibold text-white">{name}</td>
                      <td className="py-2 px-3 font-mono text-slate-300">{stat.qty}</td>
                      <td className="py-2 px-3 font-mono text-right font-bold text-emerald-400">
                        {formatMoney(stat.revenue)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Low Stock Alerts & Recent Receipts */}
        <div className="lg:col-span-5 space-y-4">
          {/* Low Stock Warning Box */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              Low Stock Warnings ({lowStockProducts.length})
            </h3>

            {lowStockProducts.length === 0 ? (
              <p className="text-xs text-slate-500 py-3">All catalog items have healthy inventory.</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {lowStockProducts.map((p) => (
                  <div
                    key={p.id}
                    className="p-2.5 rounded-xl bg-amber-950/30 border border-amber-800/40 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-semibold text-slate-200">{p.name}</div>
                      <div className="text-[11px] text-amber-400 font-mono">
                        {p.stock} units remaining
                      </div>
                    </div>
                    <button
                      onClick={() => handleRestock(p)}
                      className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-[11px] font-bold transition-colors cursor-pointer"
                    >
                      +25 Restock
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Historical Receipts Archive */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Receipt className="w-4 h-4 text-teal-400" />
              Recent Receipts
            </h3>

            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
              {dailyTransactions.length === 0 ? (
                <span className="text-xs text-slate-500">None today</span>
              ) : (
                dailyTransactions
                  .slice(-15)
                  .reverse()
                  .map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedReceipt(t)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs border border-slate-700 transition-colors"
                    >
                      #{t.id} ({formatMoney(t.total)})
                    </button>
                  ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Real-time Hardware Scan Audit Trail */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
            Live Hardware & Vision Scan Stream
          </h3>
          <span className="text-[11px] text-slate-400 font-mono">
            Last {recentScans.length} Scans
          </span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-850 text-slate-400 border-b border-slate-800 font-mono uppercase text-[10px]">
                <th className="py-2 px-3">Time</th>
                <th className="py-2 px-3">Scanner Source</th>
                <th className="py-2 px-3">Scanned Value / Barcode</th>
                <th className="py-2 px-3">Matched Product</th>
                <th className="py-2 px-3">Device</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {recentScans.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-500">
                    No scans recorded yet. Use the camera or type barcodes.
                  </td>
                </tr>
              ) : (
                recentScans.slice(0, 15).map((scan) => (
                  <tr key={scan.id} className="hover:bg-slate-850/60 font-mono transition-colors">
                    <td className="py-2 px-3 text-slate-400">
                      {new Date(scan.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="py-2 px-3">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                          scan.source === 'vision'
                            ? 'bg-purple-500/20 text-purple-300'
                            : scan.source === 'ai_scanner'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-blue-500/20 text-blue-300'
                        }`}
                      >
                        {scan.source}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-200">{scan.value}</td>
                    <td className="py-2 px-3 text-emerald-400 font-semibold font-sans">
                      {scan.productName || 'Unknown'}
                    </td>
                    <td className="py-2 px-3 text-slate-400">
                      {scan.deviceName || 'Local Kiosk'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Receipt Modal Preview */}
      {selectedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-800 bg-slate-850 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Receipt className="w-4 h-4 text-emerald-400" />
                Receipt #{selectedReceipt.id}
              </h3>
              <button
                onClick={() => setSelectedReceipt(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-white text-slate-900 font-mono text-xs select-all shadow-inner space-y-2">
              <div className="text-center border-b border-dashed border-slate-300 pb-2">
                <div className="font-bold text-sm">CARTMATE STORE</div>
                <div className="text-[10px] text-slate-500">
                  {new Date(selectedReceipt.timestamp).toLocaleString()}
                </div>
              </div>

              <div className="space-y-1 border-b border-dashed border-slate-300 py-2">
                {selectedReceipt.items.map((it, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span>
                      {it.qty}x {it.name}
                    </span>
                    <span>{formatMoney(it.qty * it.unitPrice)}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-1 font-semibold pt-1">
                <div className="flex justify-between font-normal text-slate-600">
                  <span>Subtotal</span>
                  <span>{formatMoney(selectedReceipt.subtotal)}</span>
                </div>
                <div className="flex justify-between font-normal text-slate-600">
                  <span>Tax</span>
                  <span>{formatMoney(selectedReceipt.tax)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold pt-1">
                  <span>TOTAL</span>
                  <span>{formatMoney(selectedReceipt.total)}</span>
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-850 border-t border-slate-800 flex justify-end gap-2">
              <button
                onClick={() => window.print()}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" /> Print
              </button>
              <button
                onClick={() => setSelectedReceipt(null)}
                className="px-4 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
