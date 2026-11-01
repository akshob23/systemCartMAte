import React, { useState } from 'react';
import {
  Database,
  Search,
  Plus,
  Trash2,
  Download,
  Upload,
  RotateCcw,
  Sparkles,
  AlertTriangle,
  FolderArchive,
  Check,
  Package,
  Layers,
  ArrowUpDown
} from 'lucide-react';
import { Product } from '../types';
import { api } from '../services/api';
import { soundEffects } from '../services/audio';

interface DatabaseViewProps {
  products: Product[];
  onOpenScanObjectModal: () => void;
  onRefreshDb: () => void;
}

export const DatabaseView: React.FC<DatabaseViewProps> = ({
  products,
  onOpenScanObjectModal,
  onRefreshDb
}) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [editStock, setEditStock] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  // Manual Add Form State
  const [isAddingOpen, setIsAddingOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('1.99');
  const [newBarcode, setNewBarcode] = useState('');
  const [newVisionLabel, setNewVisionLabel] = useState('');
  const [newCategory, setNewCategory] = useState('Produce');
  const [newStock, setNewStock] = useState('50');
  const [newTaxable, setNewTaxable] = useState(false);
  const [newAge, setNewAge] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Stats
  const totalStockUnits = products.reduce((acc, p) => acc + p.stock, 0);
  const totalInventoryValue = products.reduce((acc, p) => acc + p.stock * p.price, 0);
  const lowStockCount = products.filter((p) => p.stock <= 10).length;

  const categories = ['All', ...new Set(products.map((p) => p.category))];

  const filteredProducts = products.filter((p) => {
    const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.barcode.includes(search) ||
      p.visionLabel.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleUpdate = async (product: Product, updates: Partial<Product>) => {
    try {
      await api.updateProduct(product.id, updates);
      soundEffects.beep();
      onRefreshDb();
    } catch (err: any) {
      alert(`Update failed: ${err.message}`);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.deleteProduct(id);
      soundEffects.beep();
      setConfirmDeleteId(null);
      onRefreshDb();
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  const handleManualAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    setIsSubmitting(true);
    try {
      await api.addProduct({
        name: newName.trim(),
        price: Math.round(parseFloat(newPrice) * 100),
        barcode: newBarcode.trim(),
        visionLabel: newVisionLabel.trim().toLowerCase() || newName.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
        category: newCategory,
        stock: parseInt(newStock, 10) || 50,
        taxable: newTaxable,
        ageRestricted: newAge
      });

      soundEffects.success();
      setIsAddingOpen(false);
      setNewName('');
      setNewPrice('1.99');
      setNewBarcode('');
      setNewVisionLabel('');
      onRefreshDb();
    } catch (err: any) {
      alert(`Add failed: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExport = () => {
    window.location.href = '/api/db/export';
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      await api.importDb(parsed);
      soundEffects.success();
      alert('Database restored successfully from backup!');
      onRefreshDb();
    } catch (err: any) {
      alert(`Import failed: ${err.message}`);
    }
  };

  const handleResetDb = async () => {
    if (confirm('Are you sure you want to reset the database to factory grocery items?')) {
      await api.resetDb();
      soundEffects.beep();
      onRefreshDb();
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 space-y-4">
      {/* Top Banner: Database File Location & Real-Time Sync Status */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold text-white">
                Live Store Database
              </h2>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                /server/db/database.json
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Any scanned object or inventory update persists automatically to the database folder and syncs across all devices.
            </p>
          </div>
        </div>

        {/* Database Export/Import Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenScanObjectModal}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white flex items-center gap-1.5 shadow-sm transition-all"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Scan Object to DB</span>
          </button>

          <button
            onClick={handleExport}
            className="px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors"
            title="Download database.json"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export JSON</span>
          </button>

          <label className="px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 cursor-pointer transition-colors">
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Import</span>
            <input type="file" accept=".json" onChange={handleImportFile} className="hidden" />
          </label>

          <button
            onClick={handleResetDb}
            className="p-1.5 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
            title="Reset database to default items"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl shadow-md">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">
            Total Catalog SKUs
          </span>
          <span className="text-xl sm:text-2xl font-bold text-white font-mono mt-1 block">
            {products.length}
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl shadow-md">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">
            Stock On Hand
          </span>
          <span className="text-xl sm:text-2xl font-bold text-emerald-400 font-mono mt-1 block">
            {totalStockUnits.toLocaleString()} units
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl shadow-md">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">
            Inventory Value
          </span>
          <span className="text-xl sm:text-2xl font-bold text-teal-400 font-mono mt-1 block">
            ${(totalInventoryValue / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl shadow-md">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">
            Low Stock Alerts
          </span>
          <span
            className={`text-xl sm:text-2xl font-bold font-mono mt-1 block ${
              lowStockCount > 0 ? 'text-amber-400' : 'text-slate-400'
            }`}
          >
            {lowStockCount} items
          </span>
        </div>
      </div>

      {/* Filters & Actions */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search Bar */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products by name, barcode, or vision label..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>

          <div className="flex items-center gap-2">
            {/* Category Filter */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <button
              onClick={() => setIsAddingOpen(!isAddingOpen)}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Product</span>
            </button>
          </div>
        </div>

        {/* Manual Product Drawer */}
        {isAddingOpen && (
          <form
            onSubmit={handleManualAdd}
            className="p-4 bg-slate-850 rounded-xl border border-slate-800 space-y-3 animate-in fade-in"
          >
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Package className="w-4 h-4 text-emerald-400" />
              New Product Entry
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Name</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Crisp Fuji Apple"
                  className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Price ($)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                  placeholder="1.99"
                  className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Barcode (EAN-13)</label>
                <input
                  type="text"
                  value={newBarcode}
                  onChange={(e) => setNewBarcode(e.target.value)}
                  placeholder="Leave empty to auto-generate"
                  className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Category</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white"
                >
                  <option value="Produce">Produce</option>
                  <option value="Beverages">Beverages</option>
                  <option value="Bakery">Bakery</option>
                  <option value="Dairy">Dairy</option>
                  <option value="Snacks">Snacks</option>
                  <option value="Alcohol & Spirits">Alcohol & Spirits</option>
                  <option value="Pantry">Pantry</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-4 text-xs text-slate-300">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newTaxable}
                    onChange={(e) => setNewTaxable(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-500 bg-slate-800"
                  />
                  Taxable
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newAge}
                    onChange={(e) => setNewAge(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-500 bg-slate-800"
                  />
                  18+ Restricted
                </label>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddingOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" /> Save Product
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Database Products Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-850 text-slate-400 border-b border-slate-800 font-mono uppercase text-[11px]">
                <th className="py-2.5 px-3">Product Name</th>
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3">Price ($)</th>
                <th className="py-2.5 px-3">Barcode</th>
                <th className="py-2.5 px-3">Vision Label</th>
                <th className="py-2.5 px-3">Stock</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    No matching products in database.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => {
                  const isEditing = editingId === p.id;
                  return (
                    <tr key={p.id} className="hover:bg-slate-850/60 transition-colors">
                      {/* Name */}
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-white flex items-center gap-1.5">
                          <span>{p.name}</span>
                          {p.ageRestricted && (
                            <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                              18+
                            </span>
                          )}
                          {p.taxable && (
                            <span className="text-[9px] font-mono text-slate-400">tax</span>
                          )}
                        </div>
                      </td>

                      {/* Category */}
                      <td className="py-2.5 px-3 text-slate-300">{p.category}</td>

                      {/* Price (Editable) */}
                      <td className="py-2.5 px-3 font-mono">
                        {isEditing ? (
                          <input
                            type="number"
                            step="0.01"
                            value={editPrice}
                            onChange={(e) => setEditPrice(e.target.value)}
                            className="w-16 px-1.5 py-0.5 bg-slate-800 border border-emerald-500 rounded text-emerald-400 font-mono text-xs"
                          />
                        ) : (
                          <span
                            onClick={() => {
                              setEditingId(p.id);
                              setEditPrice((p.price / 100).toFixed(2));
                              setEditStock(String(p.stock));
                            }}
                            className="cursor-pointer hover:underline text-emerald-400 font-bold"
                            title="Click to edit price"
                          >
                            ${(p.price / 100).toFixed(2)}
                          </span>
                        )}
                      </td>

                      {/* Barcode */}
                      <td className="py-2.5 px-3 font-mono text-slate-400">
                        {p.barcode || '—'}
                      </td>

                      {/* Vision Label */}
                      <td className="py-2.5 px-3 font-mono text-slate-400">
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                          {p.visionLabel || '—'}
                        </span>
                      </td>

                      {/* Stock (Editable) */}
                      <td className="py-2.5 px-3 font-mono">
                        {isEditing ? (
                          <input
                            type="number"
                            value={editStock}
                            onChange={(e) => setEditStock(e.target.value)}
                            className="w-14 px-1.5 py-0.5 bg-slate-800 border border-emerald-500 rounded text-white font-mono text-xs"
                          />
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span
                              onClick={() => {
                                setEditingId(p.id);
                                setEditPrice((p.price / 100).toFixed(2));
                                setEditStock(String(p.stock));
                              }}
                              className={`cursor-pointer hover:underline font-bold ${
                                p.stock <= 10 ? 'text-amber-400' : 'text-slate-200'
                              }`}
                              title="Click to edit stock"
                            >
                              {p.stock}
                            </span>
                            {p.stock <= 10 && (
                              <span className="text-[9px] px-1 rounded bg-amber-500/20 text-amber-300">
                                Low
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-3 text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => {
                                handleUpdate(p, {
                                  price: Math.round(parseFloat(editPrice) * 100),
                                  stock: parseInt(editStock, 10) || 0
                                });
                                setEditingId(null);
                              }}
                              className="px-2 py-1 rounded bg-emerald-500 text-slate-950 font-bold text-[10px]"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="px-2 py-1 rounded bg-slate-800 text-slate-400 text-[10px]"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            {confirmDeleteId === p.id ? (
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-rose-400">Sure?</span>
                                <button
                                  onClick={() => handleDelete(p.id)}
                                  className="px-1.5 py-0.5 rounded bg-rose-500 text-white font-bold text-[10px]"
                                >
                                  Yes
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px]"
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmDeleteId(p.id)}
                                className="p-1 rounded text-slate-500 hover:text-rose-400 transition-colors"
                                title="Delete product"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
