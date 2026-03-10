import React, { useState, useEffect } from 'react';
import {
  Search,
  Package,
  History,
  Settings,
  User as UserIcon,
  QrCode,
  MapPin,
  CheckCircle2,
  AlertCircle,
  LogOut,
  ChevronRight,
  X,
  Plus,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { format } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { User, Asset, Site, CheckoutLog } from './types';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

import { supabase } from './lib/supabase';

// --- Components ---

const Badge = ({ status }: { status: Asset['status'] }) => {
  const styles = {
    available: 'bg-success/20 text-success border-success/30',
    'in-use': 'bg-accent/20 text-accent border-accent/30',
    maintenance: 'bg-danger/20 text-danger border-danger/30',
  };
  return (
    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border", styles[status])}>
      {status.replace('-', ' ')}
    </span>
  );
};

interface AssetCardProps {
  asset: Asset;
  onCheckout: (a: Asset) => void;
  onCheckin: (a: Asset) => Promise<void> | void;
  canAction: boolean;
}

const AssetCard: React.FC<AssetCardProps> = ({ asset, onCheckout, onCheckin, canAction }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-surface p-4 rounded-2xl border border-white/5 space-y-3"
    >
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-bold text-lg leading-tight">{asset.name}</h3>
          <p className="font-mono text-xs text-accent mt-1">{asset.code}</p>
        </div>
        <Badge status={asset.status} />
      </div>

      <div className="space-y-2 text-sm opacity-80">
        <div className="flex items-center gap-2">
          <MapPin size={14} className="text-accent" />
          <span>Home: {asset.homeSite}</span>
        </div>
        <div className="flex items-center gap-2">
          <MapPin size={14} className="text-success" />
          <span>Current: {asset.currentLocation || asset.homeSite}</span>
        </div>
        {asset.currentUser && (
          <div className="flex items-center gap-2">
            <UserIcon size={14} className="text-accent" />
            <span>With: {asset.currentUser}</span>
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-2">
        {asset.status === 'available' && canAction && (
          <button
            onClick={() => onCheckout(asset)}
            className="flex-1 bg-accent text-background font-bold py-3 rounded-xl active:scale-95 transition-transform"
          >
            Check Out
          </button>
        )}
        {asset.status === 'in-use' && canAction && (
          <button
            onClick={() => onCheckin(asset)}
            className="flex-1 bg-surface border border-accent text-accent font-bold py-3 rounded-xl active:scale-95 transition-transform"
          >
            Return Asset
          </button>
        )}
        <div className="bg-white p-1 rounded-lg">
          <QRCodeSVG value={asset.code} size={44} />
        </div>
      </div>
    </motion.div>
  );
};

const BottomSheet = ({ isOpen, onClose, title, children }: {
  isOpen: boolean,
  onClose: () => void,
  title: string,
  children: React.ReactNode
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="bottom-sheet"
          >
            <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto mb-6" />
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">{title}</h2>
              <button onClick={onClose} className="p-2 bg-white/5 rounded-full"><X size={20} /></button>
            </div>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState('search');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [history, setHistory] = useState<CheckoutLog[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Checkout Form State
  const [checkoutLocation, setCheckoutLocation] = useState('');
  const [checkoutPurpose, setCheckoutPurpose] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          name: session.user.user_metadata.name || session.user.email,
          email: session.user.email,
          role: 'worker'
        });
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          name: session.user.user_metadata.name || session.user.email,
          email: session.user.email,
          role: 'worker'
        });
      } else {
        setUser(null);
      }
    });

    loadData();
    return () => subscription.unsubscribe();
  }, []);

  const loadData = async () => {
    try {
      const { data: assetsData, error: assetsError } = await supabase
        .from('assets')
        .select('*');

      if (assetsError) throw assetsError;

      const mappedAssets: Asset[] = (assetsData || []).map(a => ({
        id: a.id,
        code: a.code,
        name: a.name,
        category: a.category,
        homeSite: a.home_site,
        status: a.status,
        currentUser: a.current_user_name,
        currentLocation: a.current_location,
        checkedOutAt: a.checked_out_at
      }));

      setAssets(mappedAssets);

      const { data: sitesData } = await supabase.from('sites').select('*');
      if (sitesData) setSites(sitesData);

      const { data: historyData } = await supabase
        .from('history')
        .select('*')
        .order('created_at', { ascending: false });

      if (historyData) {
        setHistory(historyData.map(h => ({
          id: h.id,
          assetCode: h.asset_code,
          userName: h.user_name,
          action: h.action,
          location: h.location,
          timestamp: h.created_at,
          purpose: h.purpose
        })));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      setIsLoginOpen(false);
      loadData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setActiveTab('search');
  };

  const handleCheckout = async () => {
    if (!selectedAsset || !user) return;
    try {
      setIsLoading(true);

      const { error: assetError } = await supabase
        .from('assets')
        .update({
          status: 'in-use',
          current_user_name: user.name,
          current_location: checkoutLocation,
          checked_out_at: new Date().toISOString()
        })
        .eq('id', selectedAsset.id);

      if (assetError) throw assetError;

      const { error: historyError } = await supabase
        .from('history')
        .insert({
          asset_code: selectedAsset.code,
          asset_name: selectedAsset.name,
          user_name: user.name,
          action: 'checkout',
          location: checkoutLocation,
          purpose: checkoutPurpose
        });

      if (historyError) throw historyError;

      setIsCheckoutOpen(false);
      setCheckoutLocation('');
      setCheckoutPurpose('');
      loadData();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckin = async (asset: Asset) => {
    if (!user) return;
    try {
      const { error: assetError } = await supabase
        .from('assets')
        .update({
          status: 'available',
          current_user_name: null,
          current_location: null,
          checked_out_at: null
        })
        .eq('id', asset.id);

      if (assetError) throw assetError;

      const { error: historyError } = await supabase
        .from('history')
        .insert({
          asset_code: asset.code,
          asset_name: asset.name,
          user_name: user.name,
          action: 'checkin',
          location: asset.homeSite
        });

      if (historyError) throw historyError;

      loadData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const startScanner = () => {
    setIsScannerOpen(true);
    setTimeout(() => {
      const scanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: 250 }, false);
      scanner.render((decodedText) => {
        setSearchQuery(decodedText);
        scanner.clear();
        setIsScannerOpen(false);
      }, (err) => { });
    }, 100);
  };

  const filteredAssets = assets.filter(a =>
    a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const myAssets = assets.filter(a => a.currentUserId === user?.id);

  return (
    <div className="min-h-screen pb-24 max-w-md mx-auto relative overflow-x-hidden">
      {/* Header */}
      <header className="p-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-accent">SiteTrack</h1>
          <p className="text-xs opacity-50 uppercase tracking-widest font-mono">Asset Management</p>
        </div>
        {user ? (
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-bold">{user.name}</p>
              <p className="text-[10px] opacity-50 uppercase">{user.role}</p>
            </div>
            <button onClick={handleLogout} className="p-2 bg-white/5 rounded-xl"><LogOut size={18} /></button>
          </div>
        ) : (
          <button
            onClick={() => setIsLoginOpen(true)}
            className="bg-accent text-background px-4 py-2 rounded-xl font-bold text-sm"
          >
            Sign In
          </button>
        )}
      </header>

      {/* Main Content */}
      <main className="px-6 space-y-6">
        {activeTab === 'search' && (
          <div className="space-y-6">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 opacity-40" size={20} />
              <input
                type="text"
                placeholder="Enter Asset Code or Name"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-surface border border-white/10 rounded-2xl py-4 pl-12 pr-16 focus:outline-none focus:border-accent transition-colors"
              />
              <button
                onClick={startScanner}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-accent/20 text-accent rounded-xl"
              >
                <QrCode size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <h2 className="text-sm font-bold opacity-50 uppercase tracking-widest">
                {searchQuery ? `Results (${filteredAssets.length})` : 'All Assets'}
              </h2>
              {filteredAssets.map(asset => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  canAction={!!user}
                  onCheckout={(a) => {
                    setSelectedAsset(a);
                    setIsCheckoutOpen(true);
                  }}
                  onCheckin={handleCheckin}
                />
              ))}
              {filteredAssets.length === 0 && (
                <div className="text-center py-12 opacity-30">
                  <Package size={48} className="mx-auto mb-2" />
                  <p>No assets found</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'my-assets' && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold">My Checked Out Assets</h2>
            <div className="space-y-4">
              {myAssets.map(asset => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  canAction={true}
                  onCheckout={(_a) => { }}
                  onCheckin={handleCheckin}
                />
              ))}
              {myAssets.length === 0 && (
                <div className="text-center py-12 opacity-30">
                  <CheckCircle2 size={48} className="mx-auto mb-2" />
                  <p>You have no assets checked out</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold">Checkout History</h2>
            <div className="space-y-4">
              {history.map(log => (
                <div key={log.id} className="bg-surface p-4 rounded-2xl border border-white/5 flex gap-4">
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                    log.action === 'checkout' ? "bg-accent/20 text-accent" : "bg-success/20 text-success"
                  )}>
                    {log.action === 'checkout' ? <ChevronRight size={20} /> : <CheckCircle2 size={20} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <p className="font-bold truncate">{log.assetCode}</p>
                      <p className="text-[10px] opacity-40">{format(new Date(log.timestamp), 'MMM d, HH:mm')}</p>
                    </div>
                    <p className="text-sm opacity-60">{log.userName} {log.action === 'checkout' ? 'took' : 'returned'} at {log.location}</p>
                    {log.purpose && <p className="text-xs italic opacity-40 mt-1">"{log.purpose}"</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'admin' && user?.role === 'admin' && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold">Admin Controls</h2>
            <div className="grid grid-cols-2 gap-4">
              <button className="bg-surface p-4 rounded-2xl border border-white/5 flex flex-col items-center gap-2">
                <Plus size={24} className="text-accent" />
                <span className="text-xs font-bold">Add Asset</span>
              </button>
              <button className="bg-surface p-4 rounded-2xl border border-white/5 flex flex-col items-center gap-2">
                <UserIcon size={24} className="text-accent" />
                <span className="text-xs font-bold">Manage Users</span>
              </button>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-bold opacity-50 uppercase tracking-widest">Asset List</h3>
              {assets.map(asset => (
                <div key={asset.id} className="bg-surface p-4 rounded-2xl border border-white/5 flex justify-between items-center">
                  <div>
                    <p className="font-bold">{asset.name}</p>
                    <p className="font-mono text-[10px] text-accent">{asset.code}</p>
                  </div>
                  <button className="p-2 text-danger"><Trash2 size={18} /></button>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-surface/80 backdrop-blur-xl border-t border-white/5 px-6 py-4 flex justify-between items-center z-40">
        <button onClick={() => setActiveTab('search')} className={cn("nav-item", activeTab === 'search' && "active")}>
          <Search size={24} />
          <span>Search</span>
        </button>
        <button
          onClick={() => user ? setActiveTab('my-assets') : setIsLoginOpen(true)}
          className={cn("nav-item", activeTab === 'my-assets' && "active")}
        >
          <Package size={24} />
          <span>My Assets</span>
        </button>
        <button
          onClick={() => user ? setActiveTab('history') : setIsLoginOpen(true)}
          className={cn("nav-item", activeTab === 'history' && "active")}
        >
          <History size={24} />
          <span>History</span>
        </button>
        {user?.role === 'admin' && (
          <button onClick={() => setActiveTab('admin')} className={cn("nav-item", activeTab === 'admin' && "active")}>
            <Settings size={24} />
            <span>Admin</span>
          </button>
        )}
      </nav>

      {/* Modals */}
      <BottomSheet isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} title="Sign In">
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-bold opacity-50 uppercase">Email Address</label>
            <input
              name="email"
              type="email"
              required
              placeholder="worker@site.com"
              className="w-full bg-white/5 border border-white/10 rounded-xl p-4 focus:outline-none focus:border-accent"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold opacity-50 uppercase">Password</label>
            <input
              name="password"
              type="password"
              required
              placeholder="••••••"
              className="w-full bg-white/5 border border-white/10 rounded-xl p-4 focus:outline-none focus:border-accent"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-accent text-background font-bold py-4 rounded-xl mt-4"
          >
            Login to SiteTrack
          </button>
          <p className="text-center text-[10px] opacity-40">
            Demo: admin@site.com / worker@site.com (Pass: 123456)
          </p>
        </form>
      </BottomSheet>

      <BottomSheet isOpen={isCheckoutOpen} onClose={() => setIsCheckoutOpen(false)} title="Check Out Asset">
        <div className="space-y-6">
          {selectedAsset && (
            <div className="bg-white/5 p-4 rounded-2xl flex gap-4">
              <div className="bg-white p-1 rounded-lg shrink-0">
                <QRCodeSVG value={selectedAsset.code} size={48} />
              </div>
              <div>
                <p className="font-bold">{selectedAsset.name}</p>
                <p className="font-mono text-xs text-accent">{selectedAsset.code}</p>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold opacity-50 uppercase">Your Current Site/Location</label>
              <select
                value={checkoutLocation}
                onChange={(e) => setCheckoutLocation(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl p-4 focus:outline-none focus:border-accent appearance-none"
              >
                <option value="" className="bg-surface">Select a Site</option>
                {sites.map(s => <option key={s.id} value={s.name} className="bg-surface">{s.name}</option>)}
                <option value="custom" className="bg-surface">Other (Enter below)</option>
              </select>
              <input
                type="text"
                placeholder="Specific location (e.g. Block 3)"
                value={checkoutLocation === 'custom' ? '' : checkoutLocation}
                onChange={(e) => setCheckoutLocation(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl p-4 focus:outline-none focus:border-accent mt-2"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold opacity-50 uppercase">Purpose (Optional)</label>
              <input
                type="text"
                placeholder="e.g. Site Maintenance"
                value={checkoutPurpose}
                onChange={(e) => setCheckoutPurpose(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl p-4 focus:outline-none focus:border-accent"
              />
            </div>
            <button
              onClick={handleCheckout}
              disabled={!checkoutLocation || isLoading}
              className="w-full bg-accent text-background font-bold py-4 rounded-xl mt-4 disabled:opacity-50"
            >
              {isLoading ? 'Processing...' : 'Confirm Checkout'}
            </button>
          </div>
        </div>
      </BottomSheet>

      <AnimatePresence>
        {isScannerOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black z-[60] flex flex-col"
          >
            <div className="p-6 flex justify-between items-center">
              <h2 className="text-xl font-bold">Scan QR Code</h2>
              <button onClick={() => setIsScannerOpen(false)} className="p-2 bg-white/10 rounded-full"><X /></button>
            </div>
            <div id="reader" className="flex-1"></div>
            <div className="p-12 text-center opacity-50">
              <p>Point camera at the asset's QR code</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
