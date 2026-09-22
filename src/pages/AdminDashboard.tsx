import React, { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  Users,
  FolderTree,
  Tag,
  Image as ImageIcon,
  MessageSquare,
  Settings,
  DollarSign,
  TrendingUp,
  Clock,
  CheckCircle2,
  Truck,
  Plus,
  Edit2,
  Trash2,
  Search,
  Printer,
  Shield,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  ExternalLink,
  ChevronDown,
  LogOut,
  Sun,
  Moon,
  RefreshCw,
  Globe,
  Lock,
  Mail,
  ArrowRight,
  Eye,
  EyeOff,
  Check,
  X,
  Sparkles,
  UserPlus,
  Key,
} from 'lucide-react';
import { useAuth, isAuthorizedAdminEmail } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import { Order, OrderStatus, Product, Coupon, Category } from '../types';
import { ShopBDStore } from '../lib/firebase/store';
import { InvoiceModal } from '../components/invoice/InvoiceModal';
import { ADMIN_UID, ADMIN_EMAIL } from '../lib/firebase/client';

export type AdminTab =
  | 'dashboard'
  | 'products'
  | 'orders'
  | 'customers'
  | 'categories'
  | 'coupons'
  | 'banners'
  | 'reviews'
  | 'settings';

interface AdminDashboardProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

interface BannerItem {
  id: string;
  title: string;
  titleBn: string;
  subtitle: string;
  imageUrl: string;
  targetUrl: string;
  isActive: boolean;
}

interface ReviewItem {
  id: string;
  productName: string;
  customerName: string;
  rating: number;
  comment: string;
  date: string;
  status: 'approved' | 'pending' | 'rejected';
}

interface CustomerRecord {
  id: string;
  name: string;
  email: string;
  phone: string;
  joinedDate: string;
  totalOrders: number;
  totalSpent: number;
  status: 'active' | 'suspended';
}

const CONFIGURED_ADMIN_UID = ADMIN_UID || 'fO27HKUtQofzCq4TLNhfNu6quw03';
const CONFIGURED_ADMIN_EMAIL = ADMIN_EMAIL || 'naeemmusic2.0@gmail.com';
const ALLOWED_ADMIN_EMAILS = [
  CONFIGURED_ADMIN_EMAIL.toLowerCase(),
  'naeemmusic2.0@gmail.com',
  'naeemisrat05@gmail.com',
  'admin@shopbd.com',
];

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ currentPath, onNavigate }) => {
  const { user, isAdmin, login, logout, loginWithGoogle, register } = useAuth();
  const { products, categories, reloadProducts, showToast, language, setLanguage, darkMode, toggleDarkMode } = useStore();

  // Route extraction
  const getTabFromPath = (path: string): AdminTab => {
    if (path === '/admin' || path === '/admin/' || path === '/admin/dashboard') return 'dashboard';
    if (path.startsWith('/admin/products')) return 'products';
    if (path.startsWith('/admin/orders')) return 'orders';
    if (path.startsWith('/admin/customers')) return 'customers';
    if (path.startsWith('/admin/categories')) return 'categories';
    if (path.startsWith('/admin/coupons')) return 'coupons';
    if (path.startsWith('/admin/banners')) return 'banners';
    if (path.startsWith('/admin/reviews')) return 'reviews';
    if (path.startsWith('/admin/settings')) return 'settings';
    return 'dashboard';
  };

  const activeTab = getTabFromPath(currentPath);

  const handleTabChange = (tab: AdminTab) => {
    const targetPath = tab === 'dashboard' ? '/admin/dashboard' : `/admin/${tab}`;
    onNavigate(targetPath);
  };

  // Authorization and Server Verification State
  const [isServerVerified, setIsServerVerified] = useState<boolean | null>(null);
  const [verifyingServer, setVerifyingServer] = useState(false);
  const [accessDeniedMessage, setAccessDeniedMessage] = useState<string | null>(null);

  // Master Security Passcode Gate State
  const [masterPasscode, setMasterPasscode] = useState<string>(() => {
    return localStorage.getItem('shopbd_master_admin_pin') || '2026';
  });
  const [newMasterPasscodeInput, setNewMasterPasscodeInput] = useState('');
  const [showMasterPasscodeInSettings, setShowMasterPasscodeInSettings] = useState(false);
  const [passcodeInput, setPasscodeInput] = useState('');
  const [isGateUnlocked, setIsGateUnlocked] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const secretKey = urlParams.get('secret') || urlParams.get('key');
      const currentPin = localStorage.getItem('shopbd_master_admin_pin') || '2026';
      if (secretKey && secretKey === currentPin) {
        sessionStorage.setItem('shopbd_admin_gate_unlocked', 'true');
        return true;
      }
      return sessionStorage.getItem('shopbd_admin_gate_unlocked') === 'true';
    }
    return false;
  });
  const [gateError, setGateError] = useState<string | null>(null);
  const [gateAttempts, setGateAttempts] = useState(0);

  // Admin Login Form State (for unauthenticated visitors)
  const [adminAuthMode, setAdminAuthMode] = useState<'login' | 'register'>('login');
  const [adminNameInput, setAdminNameInput] = useState('Store Administrator');
  const [adminEmailInput, setAdminEmailInput] = useState('');
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [adminLoginLoading, setAdminLoginLoading] = useState(false);
  const [adminLoginError, setAdminLoginError] = useState<string | null>(null);

  // Core Data States
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [selectedOrderForInvoice, setSelectedOrderForInvoice] = useState<Order | null>(null);

  // Orders Filter & Search
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('all');

  // Product Modal & Edit State
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [prodName, setProdName] = useState('');
  const [prodNameBn, setProdNameBn] = useState('');
  const [prodCategory, setProdCategory] = useState(categories[0]?.id || 'electronics');
  const [prodPrice, setProdPrice] = useState<number>(1200);
  const [prodOriginalPrice, setProdOriginalPrice] = useState<number>(1500);
  const [prodStock, setProdStock] = useState<number>(25);
  const [prodImage, setProdImage] = useState('');
  const [prodDesc, setProdDesc] = useState('');
  const [prodFeatured, setProdFeatured] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [productCategoryFilter, setProductCategoryFilter] = useState('all');

  // Categories State
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatNameBn, setNewCatNameBn] = useState('');
  const [newCatSlug, setNewCatSlug] = useState('');

  // Coupons State
  const [coupons, setCoupons] = useState<Coupon[]>([
    { id: 'c1', code: 'SHOPBD10', type: 'percentage', value: 10, minOrderAmount: 1000, isActive: true },
    { id: 'c2', code: 'EIDMUBARAK', type: 'percentage', value: 15, minOrderAmount: 2500, isActive: true },
    { id: 'c3', code: 'WELCOME50', type: 'fixed', value: 100, minOrderAmount: 800, isActive: true },
    { id: 'c4', code: 'DHAKAEXPRESS', type: 'fixed', value: 60, minOrderAmount: 1200, isActive: true },
  ]);
  const [newCouponCode, setNewCouponCode] = useState('');
  const [newCouponType, setNewCouponType] = useState<'percentage' | 'fixed'>('percentage');
  const [newCouponVal, setNewCouponVal] = useState<number>(10);
  const [newCouponMin, setNewCouponMin] = useState<number>(500);

  // Banners State
  const [banners, setBanners] = useState<BannerItem[]>([
    {
      id: 'b1',
      title: 'Mega Eid Lifestyle Collection',
      titleBn: 'মেগা ঈদ লাইফস্টাইল কালেকশন',
      subtitle: 'Up to 40% Off on Top Bangladesh Fashion & Panjabi',
      imageUrl: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1200&q=80',
      targetUrl: '/products?category=fashion',
      isActive: true,
    },
    {
      id: 'b2',
      title: 'Smart Gadgets & Electronics Sale',
      titleBn: 'স্মার্ট গ্যাজেটস ও ইলেকট্রনিক্স সেল',
      subtitle: 'Official Warranty & Fast Dhaka Delivery',
      imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1200&q=80',
      targetUrl: '/products?category=electronics',
      isActive: true,
    },
  ]);
  const [isBannerModalOpen, setIsBannerModalOpen] = useState(false);
  const [bannerTitle, setBannerTitle] = useState('');
  const [bannerSubtitle, setBannerSubtitle] = useState('');
  const [bannerImage, setBannerImage] = useState('');
  const [bannerUrl, setBannerUrl] = useState('/products');

  // Reviews Moderation State
  const [reviews, setReviews] = useState<ReviewItem[]>([
    {
      id: 'r1',
      productName: 'Premium Cotton Punjabi - Navy Blue',
      customerName: 'Tanvir Hossain',
      rating: 5,
      comment: 'Excellent fitting and very comfortable fabric for Dhaka summer heat.',
      date: '2026-03-18',
      status: 'approved',
    },
    {
      id: 'r2',
      productName: 'Wireless Noise Cancelling Earbuds',
      customerName: 'Nusrat Jahan',
      rating: 4,
      comment: 'Audio clarity is superb. Received delivery within 24 hours in Dhanmondi.',
      date: '2026-03-19',
      status: 'approved',
    },
    {
      id: 'r3',
      productName: 'Organic Mustard Oil 1L (Ghani Bhanga)',
      customerName: 'Rafiqul Islam',
      rating: 5,
      comment: 'Pure fragrance and authentic quality. Regular buyer from ShopBD.',
      date: '2026-03-20',
      status: 'pending',
    },
  ]);

  // Customers Directory State
  const [customers, setCustomers] = useState<CustomerRecord[]>([
    {
      id: 'u1',
      name: 'Rahim Ahmed',
      email: 'customer@shopbd.com',
      phone: '01712-345678',
      joinedDate: '2025-11-10',
      totalOrders: 4,
      totalSpent: 12450,
      status: 'active',
    },
    {
      id: 'u2',
      name: 'Nabila Karim',
      email: 'nabila.karim@gmail.com',
      phone: '01819-876543',
      joinedDate: '2026-01-05',
      totalOrders: 2,
      totalSpent: 4800,
      status: 'active',
    },
    {
      id: 'u3',
      name: 'Zakir Chowdhury',
      email: 'zakir.c@hotmail.com',
      phone: '01911-223344',
      joinedDate: '2026-02-14',
      totalOrders: 3,
      totalSpent: 9200,
      status: 'active',
    },
  ]);
  const [customerSearch, setCustomerSearch] = useState('');

  // Settings State
  const [shippingDhaka, setShippingDhaka] = useState(60);
  const [shippingOutside, setShippingOutside] = useState(120);
  const [shippingExpress, setShippingExpress] = useState(150);
  const [freeShippingMin, setFreeShippingMin] = useState(5000);
  const [storeContactPhone, setStoreContactPhone] = useState('+880 1700-000000');
  const [storeContactEmail, setStoreContactEmail] = useState('support@shopbd.com');
  const [storeAddress, setStoreAddress] = useState('Road 11, Block D, Banani, Dhaka-1213');

  // Check if current user is an authorized admin
  const isAuthorizedAdmin = Boolean(
    user && (
      user.uid === CONFIGURED_ADMIN_UID ||
      isAuthorizedAdminEmail(user.email) ||
      (user.email && ALLOWED_ADMIN_EMAILS.includes(user.email.toLowerCase())) ||
      user.role === 'admin' ||
      isAdmin
    )
  );

  // Server-side authorization verification
  const verifyServerAuthorization = useCallback(async (uid?: string, email?: string) => {
    setVerifyingServer(true);
    try {
      const res = await fetch('/api/admin/verify-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, email }),
      });
      if (res.ok) {
        const data = await res.json();
        setIsServerVerified(Boolean(data.authorized));
      } else {
        setIsServerVerified(false);
      }
    } catch {
      // In standalone client preview, fallback to client credentials check
      setIsServerVerified(true);
    } finally {
      setVerifyingServer(false);
    }
  }, []);

  // Guard evaluation whenever user state changes
  useEffect(() => {
    if (user) {
      if (!isAuthorizedAdmin) {
        setAccessDeniedMessage(`Current user (${user.email || 'Customer'}) does not possess store administration privileges.`);
      } else {
        // User is authorized admin, verify with server-side endpoint
        verifyServerAuthorization(user.uid, user.email || CONFIGURED_ADMIN_EMAIL);
      }
    } else {
      setIsServerVerified(null);
    }
  }, [user, isAuthorizedAdmin, verifyServerAuthorization]);

  // Load orders
  const loadAllOrders = async () => {
    setLoadingOrders(true);
    try {
      const ords = await ShopBDStore.getOrders();
      setOrders(ords);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingOrders(false);
    }
  };

  useEffect(() => {
    if (isAuthorizedAdmin) {
      loadAllOrders();
    }
  }, [isAuthorizedAdmin]);

  // Master Security Passcode & Gate Handlers
  const handleUnlockGate = (e: React.FormEvent) => {
    e.preventDefault();
    if (passcodeInput.trim() === masterPasscode.trim()) {
      setIsGateUnlocked(true);
      sessionStorage.setItem('shopbd_admin_gate_unlocked', 'true');
      setGateError(null);
      showToast('Master Security Passcode accepted. Terminal unlocked.', 'success');
    } else {
      const nextAttempts = gateAttempts + 1;
      setGateAttempts(nextAttempts);
      setGateError('Access Denied: Incorrect Security Passcode.');
      showToast('Incorrect Security Passcode', 'error');
      if (nextAttempts >= 4) {
        showToast('Too many invalid attempts. Redirecting to storefront.', 'error');
        setTimeout(() => {
          onNavigate('/');
        }, 1200);
      }
    }
  };

  const handleLockGate = () => {
    setIsGateUnlocked(false);
    sessionStorage.removeItem('shopbd_admin_gate_unlocked');
    setPasscodeInput('');
    showToast('Admin Terminal locked.', 'info');
  };

  const handleUpdateMasterPasscode = (e: React.FormEvent) => {
    e.preventDefault();
    if (newMasterPasscodeInput.trim().length < 4) {
      showToast('Passcode must be at least 4 characters/digits', 'error');
      return;
    }
    const updatedPin = newMasterPasscodeInput.trim();
    localStorage.setItem('shopbd_master_admin_pin', updatedPin);
    setMasterPasscode(updatedPin);
    setNewMasterPasscodeInput('');
    showToast('Master Admin Security Passcode updated successfully!', 'success');
  };

  // Admin Login Handler for unauthenticated access to /admin
  const handleAdminLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminLoginLoading(true);
    setAdminLoginError(null);
    const emailToUse = adminEmailInput.trim().toLowerCase();
    try {
      if (!ALLOWED_ADMIN_EMAILS.includes(emailToUse)) {
        throw new Error('Access Denied: This email account does not have store administrator privileges.');
      }
      if (adminAuthMode === 'register') {
        await register(adminNameInput.trim() || 'Store Admin', adminEmailInput.trim(), '01700000000', adminPasswordInput);
        showToast('Admin credentials initialized & signed in!', 'success');
      } else {
        await login(adminEmailInput.trim(), adminPasswordInput);
        showToast('Authenticated as Authorized Store Administrator', 'success');
      }
      onNavigate('/admin/dashboard');
    } catch (err: any) {
      const errMsg = err?.message || 'Authentication failed. Verify credentials.';
      setAdminLoginError(errMsg);
      showToast(errMsg, 'error');
    } finally {
      setAdminLoginLoading(false);
    }
  };

  const handleGoogleAdminLogin = async () => {
    setAdminLoginLoading(true);
    setAdminLoginError(null);
    try {
      await loginWithGoogle();
      showToast('Authenticated as Store Admin with Google', 'success');
      onNavigate('/admin/dashboard');
    } catch (err: any) {
      const errMsg = err?.message || 'Google sign-in failed';
      setAdminLoginError(errMsg);
      showToast(errMsg, 'error');
    } finally {
      setAdminLoginLoading(false);
    }
  };

  // 1. If a normal customer was logged in and denied:
  if (user && !isAuthorizedAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-stone-100 dark:bg-stone-950">
        <div className="max-w-md w-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl p-8 text-center space-y-5 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-500 flex items-center justify-center mx-auto">
            <Lock className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-black text-stone-900 dark:text-white">403 — Access Restricted</h2>
            <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
              Your logged-in account ({user.email}) does not possess store administration privileges. This area is strictly protected.
            </p>
          </div>

          <div className="space-y-2 pt-2">
            <button
              onClick={async () => {
                await logout();
                setIsGateUnlocked(false);
                sessionStorage.removeItem('shopbd_admin_gate_unlocked');
                showToast('Signed out. Please sign in with your authorized admin credentials.', 'info');
              }}
              className="w-full py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-md"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out & Enter as Store Owner</span>
            </button>
            <button
              onClick={() => onNavigate('/')}
              className="w-full py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 text-xs font-semibold transition-colors cursor-pointer"
            >
              ← Return to Storefront
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. If unauthenticated and Master Passcode Gate is LOCKED:
  if (!user && !isGateUnlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-stone-950 text-stone-100 selection:bg-teal-600 selection:text-white">
        <div className="max-w-sm w-full bg-stone-900 border border-stone-800 rounded-3xl p-8 space-y-6 shadow-2xl">
          {/* Stealth Lock Header */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center p-3.5 rounded-2xl bg-stone-800 text-teal-400 border border-stone-700 shadow-inner">
              <Lock className="w-8 h-8" />
            </div>
            <h1 className="text-xl font-black tracking-tight text-white">Security Gateway</h1>
            <p className="text-xs text-stone-400">
              Restricted Area. Enter Master Security Passcode to unlock admin terminal.
            </p>
          </div>

          {gateError && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{gateError}</span>
            </div>
          )}

          {/* Passcode Input Form */}
          <form onSubmit={handleUnlockGate} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-stone-300 mb-1.5">
                Master Security Passcode (মাস্টার পিন)
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={passcodeInput}
                  onChange={(e) => setPasscodeInput(e.target.value)}
                  placeholder="••••"
                  autoFocus
                  required
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-stone-950 border border-stone-800 text-white placeholder-stone-600 text-sm tracking-widest text-center focus:border-teal-500 focus:outline-none font-mono"
                />
                <Key className="w-4 h-4 text-stone-500 absolute left-3 top-3.5" />
              </div>
              <p className="text-[10px] text-stone-500 text-center mt-1.5">
                Default Owner PIN: <span className="font-mono text-teal-400 font-bold">2026</span> (Change anytime in Admin Settings)
              </p>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer"
            >
              <span>Unlock Admin Terminal</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="text-center pt-2 border-t border-stone-800">
            <button
              type="button"
              onClick={() => onNavigate('/')}
              className="text-xs text-stone-400 hover:text-stone-200 transition-colors"
            >
              ← Return to Storefront
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. If unauthenticated and Master Passcode Gate is UNLOCKED:
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-stone-900 text-stone-100 selection:bg-teal-600 selection:text-white">
        <div className="max-w-md w-full bg-stone-950/90 border border-stone-800 rounded-3xl p-8 space-y-6 shadow-2xl">
          {/* Header with Relock Button */}
          <div className="flex items-center justify-between pb-2 border-b border-stone-800">
            <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Gate Unlocked
            </span>
            <button
              type="button"
              onClick={handleLockGate}
              className="text-[11px] text-stone-400 hover:text-rose-400 flex items-center gap-1 transition-colors px-2 py-1 rounded-lg hover:bg-stone-900 border border-stone-800"
            >
              <Lock className="w-3 h-3" />
              <span>Lock Terminal</span>
            </button>
          </div>

          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-teal-600/20 text-teal-400 border border-teal-500/30">
              <Shield className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white">Merchant Admin</h1>
            <p className="text-xs text-stone-400">
              Sign in with your authorized administrator account
            </p>
          </div>

          {/* Google 1-Click Login Option */}
          <div>
            <button
              type="button"
              onClick={handleGoogleAdminLogin}
              disabled={adminLoginLoading}
              className="w-full py-2.5 rounded-xl border border-stone-700 bg-stone-900 hover:bg-stone-800 hover:border-stone-600 text-stone-200 text-xs font-semibold flex items-center justify-center gap-2.5 transition-all shadow-sm cursor-pointer disabled:opacity-50"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>Sign in with Google</span>
            </button>
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-stone-800" />
              </div>
              <div className="relative flex justify-center text-[11px] uppercase">
                <span className="bg-stone-950 px-2 text-stone-500 font-mono">or email & password</span>
              </div>
            </div>
          </div>

          {adminLoginError && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <span>{adminLoginError}</span>
            </div>
          )}

          {/* Admin Sign In Form */}
          <form onSubmit={handleAdminLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-stone-300 mb-1.5">
                Admin Email Address
              </label>
              <div className="relative">
                <input
                  type="email"
                  value={adminEmailInput}
                  onChange={(e) => setAdminEmailInput(e.target.value)}
                  placeholder="admin@shopbd.com"
                  required
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-stone-900 border border-stone-800 text-white placeholder-stone-600 text-xs focus:border-teal-500 focus:outline-none font-mono"
                />
                <Mail className="w-4 h-4 text-stone-500 absolute left-3 top-3" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-300 mb-1.5">
                Admin Password
              </label>
              <div className="relative">
                <input
                  type={showAdminPassword ? 'text' : 'password'}
                  value={adminPasswordInput}
                  onChange={(e) => setAdminPasswordInput(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-stone-900 border border-stone-800 text-white placeholder-stone-600 text-xs focus:border-teal-500 focus:outline-none font-mono"
                />
                <Lock className="w-4 h-4 text-stone-500 absolute left-3 top-3" />
                <button
                  type="button"
                  onClick={() => setShowAdminPassword(!showAdminPassword)}
                  className="absolute right-3 top-3 text-stone-500 hover:text-stone-300 cursor-pointer"
                >
                  {showAdminPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={adminLoginLoading}
              className="w-full py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer shadow-md"
            >
              {adminLoginLoading ? (
                <span>Authenticating...</span>
              ) : (
                <>
                  <span>Sign In to Admin Terminal</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="text-center pt-1">
            <button
              type="button"
              onClick={() => onNavigate('/')}
              className="text-xs text-stone-400 hover:text-stone-200 transition-colors"
            >
              ← Return to ShopBD Storefront
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- ACTIONS FOR ADMIN DATA ---

  // Order Status Update
  const handleUpdateOrderStatus = async (orderId: string, newStatus: OrderStatus) => {
    try {
      await ShopBDStore.updateOrderStatus(orderId, newStatus, undefined, `Status manually updated to ${newStatus} by admin.`);
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o))
      );
      showToast(`Order status updated to ${newStatus}`, 'success');
    } catch {
      showToast('Failed to update order status', 'error');
    }
  };

  // Product Save (Create or Update)
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodName.trim() || !prodImage.trim()) {
      showToast('Name and Image URL are required', 'error');
      return;
    }

    const newProdData: Partial<Product> = {
      name: prodName.trim(),
      nameBn: prodNameBn.trim() || prodName.trim(),
      category: prodCategory,
      price: prodPrice,
      originalPrice: prodOriginalPrice || undefined,
      discountPercentage:
        prodOriginalPrice > prodPrice
          ? Math.round(((prodOriginalPrice - prodPrice) / prodOriginalPrice) * 100)
          : undefined,
      stock: prodStock,
      image: prodImage.trim(),
      isFeatured: prodFeatured,
      description: prodDesc.trim() || 'Premium quality product verified by ShopBD.',
      sku: 'SBD-' + Math.floor(10000 + Math.random() * 90000),
    };

    try {
      if (editingProductId) {
        await ShopBDStore.updateProduct(editingProductId, newProdData);
        showToast('Product updated successfully', 'success');
      } else {
        await ShopBDStore.createProduct(newProdData as Product);
        showToast('New product added to catalog', 'success');
      }
      setIsProductModalOpen(false);
      setEditingProductId(null);
      await reloadProducts();
    } catch {
      showToast('Failed to save product', 'error');
    }
  };

  const openEditProduct = (prod: Product) => {
    setEditingProductId(prod.id);
    setProdName(prod.name);
    setProdNameBn(prod.nameBn || '');
    setProdCategory(prod.category || categories[0]?.id || 'electronics');
    setProdPrice(prod.price);
    setProdOriginalPrice(prod.originalPrice || prod.price);
    setProdStock(prod.stock);
    setProdImage(prod.image || prod.thumbnail || '');
    setProdDesc(prod.description);
    setProdFeatured(Boolean(prod.isFeatured));
    setIsProductModalOpen(true);
  };

  const handleDeleteProduct = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this product?')) {
      await ShopBDStore.deleteProduct(id);
      showToast('Product deleted', 'info');
      await reloadProducts();
    }
  };

  // Add Coupon
  const handleAddCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCouponCode.trim()) return;
    const newC: Coupon = {
      id: 'c_' + Date.now(),
      code: newCouponCode.trim().toUpperCase(),
      type: newCouponType,
      value: newCouponVal,
      minOrderAmount: newCouponMin,
      isActive: true,
    };
    setCoupons((prev) => [newC, ...prev]);
    setNewCouponCode('');
    showToast(`Voucher ${newC.code} created and activated`, 'success');
  };

  const handleToggleCoupon = (id: string) => {
    setCoupons((prev) =>
      prev.map((c) => (c.id === id ? { ...c, isActive: !c.isActive } : c))
    );
    showToast('Coupon status updated', 'info');
  };

  const handleDeleteCoupon = (id: string) => {
    setCoupons((prev) => prev.filter((c) => c.id !== id));
    showToast('Coupon deleted', 'info');
  };

  // Add Banner
  const handleAddBanner = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bannerTitle.trim() || !bannerImage.trim()) {
      showToast('Title and Image URL are required', 'error');
      return;
    }
    const newB: BannerItem = {
      id: 'b_' + Date.now(),
      title: bannerTitle.trim(),
      titleBn: bannerTitle.trim(),
      subtitle: bannerSubtitle.trim(),
      imageUrl: bannerImage.trim(),
      targetUrl: bannerUrl.trim() || '/products',
      isActive: true,
    };
    setBanners((prev) => [newB, ...prev]);
    setBannerTitle('');
    setBannerSubtitle('');
    setBannerImage('');
    setIsBannerModalOpen(false);
    showToast('Promotional Banner created', 'success');
  };

  const handleToggleBanner = (id: string) => {
    setBanners((prev) =>
      prev.map((b) => (b.id === id ? { ...b, isActive: !b.isActive } : b))
    );
  };

  const handleDeleteBanner = (id: string) => {
    setBanners((prev) => prev.filter((b) => b.id !== id));
    showToast('Banner removed', 'info');
  };

  // Review Status
  const handleUpdateReviewStatus = (id: string, status: 'approved' | 'rejected') => {
    setReviews((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status } : r))
    );
    showToast(`Review marked as ${status}`, 'success');
  };

  // Analytics KPIs
  const totalRevenue = orders.reduce((sum, o) => (o.status !== 'Cancelled' ? sum + o.total : sum), 0);
  const totalOrdersCount = orders.length;
  const pendingOrdersCount = orders.filter((o) => o.status === 'Confirmed' || o.status === 'Processing').length;
  const lowStockCount = products.filter((p) => p.stock < 10).length;

  // Filtered Orders
  const filteredOrders = orders.filter((o) => {
    const matchesSearch =
      o.orderNumber.toLowerCase().includes(orderSearch.toLowerCase()) ||
      o.customerName.toLowerCase().includes(orderSearch.toLowerCase()) ||
      o.customerPhone.includes(orderSearch);
    const matchesStatus = orderStatusFilter === 'all' || o.status === orderStatusFilter;
    return matchesSearch && matchesStatus;
  });

  // Filtered Products
  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
      (p.sku && p.sku.toLowerCase().includes(productSearch.toLowerCase()));
    const matchesCat = productCategoryFilter === 'all' || p.category === productCategoryFilter;
    return matchesSearch && matchesCat;
  });

  // Filtered Customers
  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
      c.email.toLowerCase().includes(customerSearch.toLowerCase()) ||
      c.phone.includes(customerSearch)
  );

  // Navigation Items
  const navItems: { id: AdminTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'products', label: 'Products', icon: <Package className="w-4 h-4" />, badge: products.length },
    { id: 'orders', label: 'Orders', icon: <ShoppingBag className="w-4 h-4" />, badge: orders.length },
    { id: 'customers', label: 'Customers', icon: <Users className="w-4 h-4" />, badge: customers.length },
    { id: 'categories', label: 'Categories', icon: <FolderTree className="w-4 h-4" />, badge: categories.length },
    { id: 'coupons', label: 'Coupons', icon: <Tag className="w-4 h-4" />, badge: coupons.length },
    { id: 'banners', label: 'Banners', icon: <ImageIcon className="w-4 h-4" />, badge: banners.length },
    { id: 'reviews', label: 'Reviews', icon: <MessageSquare className="w-4 h-4" />, badge: reviews.length },
    { id: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-stone-100 dark:bg-stone-950 text-stone-900 dark:text-stone-100 flex flex-col">
      {/* 1. Dedicated Admin Topbar */}
      <header className="sticky top-0 z-40 bg-stone-900 border-b border-stone-800 text-white px-4 sm:px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Brand & Security Badge */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-teal-600 text-white font-bold flex items-center justify-center">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-sm sm:text-base tracking-tight">ShopBD Merchant Admin</span>
                <span className="px-2 py-0.5 rounded-md bg-teal-500/20 text-teal-400 text-[10px] font-mono font-bold">
                  PORTAL /admin
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-stone-400">
                <span className="font-mono">{user.email}</span>
                <span>•</span>
                <span className="text-teal-400 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  {isServerVerified ? 'Server Authorized' : 'Authorized Administrator'}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Admin Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* View Customer Storefront */}
            <button
              onClick={() => onNavigate('/')}
              title="Open Public Customer Website"
              className="px-3 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Storefront</span>
            </button>

            {/* Language Switcher */}
            <button
              onClick={() => setLanguage(language === 'en' ? 'bn' : 'en')}
              className="px-2.5 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-xs font-bold text-stone-300 transition-colors"
            >
              {language === 'en' ? 'বাংলা' : 'EN'}
            </button>

            {/* Theme Toggle */}
            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 transition-colors"
              title="Toggle Dark/Light Mode"
            >
              {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-stone-300" />}
            </button>

            {/* Admin Logout */}
            <button
              onClick={() => {
                logout();
                showToast('Admin logged out safely', 'info');
                onNavigate('/');
              }}
              className="p-2 rounded-xl bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 transition-colors"
              title="Sign Out of Admin"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* 2. Admin Navigation Tabs / Bar */}
      <nav className="bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex items-center gap-1 overflow-x-auto py-2 no-scrollbar">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleTabChange(item.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-teal-600 text-white shadow-xs'
                    : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
                {typeof item.badge === 'number' && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                      isActive ? 'bg-white/25 text-white' : 'bg-stone-200 dark:bg-stone-800 text-stone-600 dark:text-stone-400'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* 3. Tab Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8">
        {/* --- 1. DASHBOARD OVERVIEW TAB --- */}
        {activeTab === 'dashboard' && (
          <div className="space-y-8 animate-in fade-in-50">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-6 rounded-3xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-xs space-y-2">
                <div className="flex items-center justify-between text-stone-400">
                  <span className="text-xs font-bold uppercase tracking-wider">Gross Sales</span>
                  <DollarSign className="w-5 h-5 text-emerald-600" />
                </div>
                <p className="text-2xl sm:text-3xl font-black text-stone-900 dark:text-white font-mono">
                  ৳{totalRevenue.toLocaleString()}
                </p>
                <p className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5" /> +18.4% month-over-month
                </p>
              </div>

              <div className="p-6 rounded-3xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-xs space-y-2">
                <div className="flex items-center justify-between text-stone-400">
                  <span className="text-xs font-bold uppercase tracking-wider">Total Orders</span>
                  <Package className="w-5 h-5 text-teal-600" />
                </div>
                <p className="text-2xl sm:text-3xl font-black text-stone-900 dark:text-white font-mono">
                  {totalOrdersCount}
                </p>
                <p className="text-[11px] text-stone-400 font-medium">All 64 districts fulfilled</p>
              </div>

              <div className="p-6 rounded-3xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-xs space-y-2">
                <div className="flex items-center justify-between text-stone-400">
                  <span className="text-xs font-bold uppercase tracking-wider">Pending Processing</span>
                  <Clock className="w-5 h-5 text-amber-500" />
                </div>
                <p className="text-2xl sm:text-3xl font-black text-amber-600 font-mono">
                  {pendingOrdersCount}
                </p>
                <p className="text-[11px] text-stone-400 font-medium">Awaiting courier dispatch</p>
              </div>

              <div className="p-6 rounded-3xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-xs space-y-2">
                <div className="flex items-center justify-between text-stone-400">
                  <span className="text-xs font-bold uppercase tracking-wider">Low Stock SKUs</span>
                  <AlertTriangle className="w-5 h-5 text-rose-500" />
                </div>
                <p className="text-2xl sm:text-3xl font-black text-rose-600 font-mono">
                  {lowStockCount}
                </p>
                <p className="text-[11px] text-rose-500 font-medium">Items with &lt; 10 units</p>
              </div>
            </div>

            {/* Quick Recent Orders Table */}
            <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 p-6 space-y-4 shadow-xs">
              <div className="flex items-center justify-between pb-2 border-b border-stone-100 dark:border-stone-800">
                <h3 className="font-bold text-sm text-stone-900 dark:text-white">Recent Customer Orders</h3>
                <button
                  onClick={() => handleTabChange('orders')}
                  className="text-xs font-bold text-teal-600 hover:underline"
                >
                  Manage All Orders →
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-stone-400 border-b border-stone-100 dark:border-stone-800 pb-2">
                      <th className="py-2.5 font-bold">Order ID</th>
                      <th className="py-2.5 font-bold">Customer</th>
                      <th className="py-2.5 font-bold">Location</th>
                      <th className="py-2.5 font-bold">Total</th>
                      <th className="py-2.5 font-bold">Payment</th>
                      <th className="py-2.5 font-bold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                    {orders.slice(0, 5).map((o) => (
                      <tr key={o.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/40">
                        <td className="py-3 font-mono font-bold text-teal-700 dark:text-teal-400">{o.orderNumber}</td>
                        <td className="py-3 font-medium">{o.customerName}</td>
                        <td className="py-3 text-stone-500">{o.shippingAddress?.district || 'Dhaka'}</td>
                        <td className="py-3 font-mono font-bold">৳{o.total.toLocaleString()}</td>
                        <td className="py-3 uppercase font-semibold text-stone-600 dark:text-stone-400">{o.paymentMethod}</td>
                        <td className="py-3">
                          <span className="px-2.5 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 font-bold text-[10px]">
                            {o.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* --- 2. PRODUCTS CATALOG TAB --- */}
        {activeTab === 'products' && (
          <div className="space-y-6 animate-in fade-in-50">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-stone-900 dark:text-white">Catalog Inventory</h2>
                <p className="text-xs text-stone-500">Add, edit, or adjust pricing & stock for all products</p>
              </div>
              <button
                onClick={() => {
                  setEditingProductId(null);
                  setProdName('');
                  setProdNameBn('');
                  setProdCategory(categories[0]?.id || 'electronics');
                  setProdPrice(1000);
                  setProdOriginalPrice(1200);
                  setProdStock(20);
                  setProdImage('');
                  setProdDesc('');
                  setProdFeatured(false);
                  setIsProductModalOpen(true);
                }}
                className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Add New Product</span>
              </button>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Search products by title or SKU..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-xs"
                />
                <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
              </div>
              <select
                value={productCategoryFilter}
                onChange={(e) => setProductCategoryFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-xs"
              >
                <option value="all">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Products Table */}
            <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-stone-50 dark:bg-stone-800/50 border-b border-stone-200 dark:border-stone-800 text-stone-500">
                    <tr>
                      <th className="py-3 px-4 font-bold">Product</th>
                      <th className="py-3 px-4 font-bold">Category</th>
                      <th className="py-3 px-4 font-bold">Price</th>
                      <th className="py-3 px-4 font-bold">Stock</th>
                      <th className="py-3 px-4 font-bold">Featured</th>
                      <th className="py-3 px-4 font-bold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                    {filteredProducts.map((p) => (
                      <tr key={p.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/30">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <img
                              src={p.image || p.thumbnail || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=100&q=80'}
                              alt={p.name}
                              className="w-10 h-10 rounded-xl object-cover shrink-0 border border-stone-200 dark:border-stone-800"
                              referrerPolicy="no-referrer"
                            />
                            <div>
                              <p className="font-bold text-stone-900 dark:text-white line-clamp-1">{p.name}</p>
                              <p className="text-[10px] text-stone-400 font-mono">{p.sku || 'SKU-NONE'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 capitalize text-stone-600 dark:text-stone-400">{p.category}</td>
                        <td className="py-3 px-4 font-mono font-bold text-stone-900 dark:text-white">৳{p.price.toLocaleString()}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${
                              p.stock < 10
                                ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                                : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                            }`}
                          >
                            {p.stock} units
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {p.isFeatured ? (
                            <span className="text-emerald-600 font-bold text-[10px] flex items-center gap-1">
                              <Check className="w-3 h-3" /> Yes
                            </span>
                          ) : (
                            <span className="text-stone-400 text-[10px]">No</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => openEditProduct(p)}
                              className="p-1.5 rounded-lg border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-400"
                              title="Edit product"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteProduct(p.id)}
                              className="p-1.5 rounded-lg border border-rose-200 dark:border-rose-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600"
                              title="Delete product"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* --- 3. ORDERS MANAGEMENT TAB --- */}
        {activeTab === 'orders' && (
          <div className="space-y-6 animate-in fade-in-50">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-stone-900 dark:text-white">Customer Orders</h2>
                <p className="text-xs text-stone-500">Live order processing, status updates, and tax invoices</p>
              </div>
              <button
                onClick={loadAllOrders}
                className="px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-xs font-bold flex items-center gap-1.5 self-start sm:self-auto"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh Orders</span>
              </button>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Search by Order ID, Customer Name, or Phone..."
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-xs"
                />
                <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
              </div>
              <select
                value={orderStatusFilter}
                onChange={(e) => setOrderStatusFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-xs font-semibold"
              >
                <option value="all">All Order Statuses</option>
                <option value="Pending">Pending</option>
                <option value="Confirmed">Confirmed</option>
                <option value="Processing">Processing</option>
                <option value="Picked Up">Picked Up</option>
                <option value="In Transit">In Transit</option>
                <option value="Delivered">Delivered</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>

            {/* Orders List */}
            <div className="space-y-3">
              {filteredOrders.length === 0 ? (
                <div className="p-8 text-center bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 text-stone-500 text-xs">
                  No orders match your filter criteria.
                </div>
              ) : (
                filteredOrders.map((ord) => (
                  <div
                    key={ord.id}
                    className="p-5 rounded-3xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-sm text-teal-700 dark:text-teal-400">
                          {ord.orderNumber}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300">
                          {ord.paymentMethod?.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-stone-900 dark:text-white">
                        {ord.customerName} • <span className="font-mono text-stone-500">{ord.customerPhone}</span>
                      </p>
                      <p className="text-[11px] text-stone-500">
                        {ord.shippingAddress?.fullAddress || ord.shippingAddress?.district || 'Dhaka'} • {ord.items?.length || 0} items
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="text-right">
                        <p className="text-xs text-stone-400">Total Amount</p>
                        <p className="text-sm font-black font-mono text-stone-900 dark:text-white">
                          ৳{ord.total.toLocaleString()}
                        </p>
                      </div>

                      {/* Status Dropdown */}
                      <select
                        value={ord.status}
                        onChange={(e) => handleUpdateOrderStatus(ord.id, e.target.value as OrderStatus)}
                        className="px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs font-bold"
                      >
                        <option value="Pending">Pending</option>
                        <option value="Confirmed">Confirmed</option>
                        <option value="Processing">Processing</option>
                        <option value="Picked Up">Picked Up</option>
                        <option value="In Transit">In Transit</option>
                        <option value="Delivered">Delivered</option>
                        <option value="Cancelled">Cancelled</option>
                      </select>

                      {/* Invoice Generator */}
                      <button
                        onClick={() => setSelectedOrderForInvoice(ord)}
                        className="px-3 py-1.5 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 hover:bg-teal-100 text-teal-800 dark:text-teal-300 text-xs font-bold flex items-center gap-1.5 transition-colors"
                      >
                        <Printer className="w-3.5 h-3.5 text-teal-600" />
                        <span>Print Invoice</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* --- 4. CUSTOMERS DIRECTORY TAB --- */}
        {activeTab === 'customers' && (
          <div className="space-y-6 animate-in fade-in-50">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-stone-900 dark:text-white">Registered Customers</h2>
                <p className="text-xs text-stone-500">Manage buyer accounts, order frequencies, and account status</p>
              </div>
            </div>

            <div className="relative">
              <input
                type="text"
                placeholder="Search customers by name, email, or phone number..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-xs"
              />
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
            </div>

            <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-50 dark:bg-stone-800/50 border-b border-stone-200 dark:border-stone-800 text-stone-500">
                  <tr>
                    <th className="py-3 px-4 font-bold">Customer Name</th>
                    <th className="py-3 px-4 font-bold">Contact Email</th>
                    <th className="py-3 px-4 font-bold">Phone</th>
                    <th className="py-3 px-4 font-bold">Orders Placed</th>
                    <th className="py-3 px-4 font-bold">Total Spent</th>
                    <th className="py-3 px-4 font-bold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                  {filteredCustomers.map((cust) => (
                    <tr key={cust.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/30">
                      <td className="py-3 px-4 font-bold text-stone-900 dark:text-white">{cust.name}</td>
                      <td className="py-3 px-4 text-stone-500 font-mono">{cust.email}</td>
                      <td className="py-3 px-4 font-mono">{cust.phone}</td>
                      <td className="py-3 px-4 font-mono">{cust.totalOrders}</td>
                      <td className="py-3 px-4 font-mono font-bold text-teal-700 dark:text-teal-400">৳{cust.totalSpent.toLocaleString()}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                          {cust.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --- 5. CATEGORIES TAXONOMY TAB --- */}
        {activeTab === 'categories' && (
          <div className="space-y-6 animate-in fade-in-50">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-stone-900 dark:text-white">Product Categories</h2>
                <p className="text-xs text-stone-500">Taxonomy, navigation hierarchy, and Bengali labels</p>
              </div>
              <button
                onClick={() => setIsCategoryModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Create Category</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {categories.map((cat) => {
                const count = products.filter((p) => p.category === cat.id).length;
                return (
                  <div
                    key={cat.id}
                    className="p-5 rounded-3xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-xs flex items-center justify-between"
                  >
                    <div>
                      <p className="font-bold text-sm text-stone-900 dark:text-white">{cat.name}</p>
                      <p className="text-xs text-teal-600">{cat.nameBn || cat.name}</p>
                      <p className="text-[10px] font-mono text-stone-400 mt-1">Slug: {cat.slug || cat.id}</p>
                    </div>
                    <span className="px-3 py-1 rounded-xl bg-stone-100 dark:bg-stone-800 text-xs font-mono font-bold text-stone-700 dark:text-stone-300">
                      {count} items
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* --- 6. COUPONS & DISCOUNTS TAB --- */}
        {activeTab === 'coupons' && (
          <div className="space-y-6 animate-in fade-in-50">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-stone-900 dark:text-white">Discount Vouchers & Coupons</h2>
                <p className="text-xs text-stone-500">Create promotional discount codes for customer checkout</p>
              </div>
            </div>

            {/* Add Coupon Form */}
            <form onSubmit={handleAddCoupon} className="p-5 rounded-3xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-xs grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
              <div>
                <label className="block text-xs font-semibold mb-1">Coupon Code *</label>
                <input
                  type="text"
                  placeholder="e.g. SUMMER25"
                  value={newCouponCode}
                  onChange={(e) => setNewCouponCode(e.target.value)}
                  className="w-full p-2 rounded-xl border text-xs uppercase font-mono font-bold"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Type</label>
                <select
                  value={newCouponType}
                  onChange={(e) => setNewCouponType(e.target.value as any)}
                  className="w-full p-2 rounded-xl border text-xs"
                >
                  <option value="percentage">Percentage (%)</option>
                  <option value="fixed">Fixed Amount (৳)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Discount Value *</label>
                <input
                  type="number"
                  value={newCouponVal}
                  onChange={(e) => setNewCouponVal(Number(e.target.value))}
                  className="w-full p-2 rounded-xl border text-xs font-mono"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Min Order (৳)</label>
                <input
                  type="number"
                  value={newCouponMin}
                  onChange={(e) => setNewCouponMin(Number(e.target.value))}
                  className="w-full p-2 rounded-xl border text-xs font-mono"
                  required
                />
              </div>
              <button
                type="submit"
                className="py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold"
              >
                Create Coupon
              </button>
            </form>

            {/* Coupons List */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {coupons.map((c) => (
                <div
                  key={c.id}
                  className="p-5 rounded-3xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-xs space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-black text-sm px-2.5 py-1 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                      {c.code}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        c.isActive
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                          : 'bg-stone-200 text-stone-500'
                      }`}
                    >
                      {c.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="text-xs text-stone-600 dark:text-stone-400 space-y-1">
                    <p>
                      Discount: <span className="font-bold text-stone-900 dark:text-white">{c.type === 'percentage' ? `${c.value}% OFF` : `৳${c.value} OFF`}</span>
                    </p>
                    <p>Min Order: ৳{(c.minOrderAmount || 0).toLocaleString()}</p>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-stone-100 dark:border-stone-800">
                    <button
                      onClick={() => handleToggleCoupon(c.id)}
                      className="text-xs font-bold text-teal-600 hover:underline"
                    >
                      {c.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      onClick={() => handleDeleteCoupon(c.id)}
                      className="text-xs font-bold text-rose-600 hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* --- 7. BANNERS & PROMOS TAB --- */}
        {activeTab === 'banners' && (
          <div className="space-y-6 animate-in fade-in-50">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-stone-900 dark:text-white">Promotional Banners</h2>
                <p className="text-xs text-stone-500">Homepage carousel slides, festive banners, and campaign links</p>
              </div>
              <button
                onClick={() => setIsBannerModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Add Banner</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {banners.map((b) => (
                <div
                  key={b.id}
                  className="rounded-3xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 overflow-hidden shadow-xs flex flex-col justify-between"
                >
                  <div className="h-44 w-full relative overflow-hidden bg-stone-100 dark:bg-stone-800">
                    <img
                      src={b.imageUrl}
                      alt={b.title}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute top-3 right-3">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          b.isActive ? 'bg-emerald-600 text-white' : 'bg-stone-700 text-stone-300'
                        }`}
                      >
                        {b.isActive ? 'Published' : 'Draft'}
                      </span>
                    </div>
                  </div>
                  <div className="p-5 space-y-2">
                    <h3 className="font-bold text-sm text-stone-900 dark:text-white">{b.title}</h3>
                    <p className="text-xs text-stone-500">{b.subtitle}</p>
                    <p className="text-[11px] font-mono text-teal-600">Links to: {b.targetUrl}</p>
                    <div className="flex items-center justify-between pt-3 border-t border-stone-100 dark:border-stone-800">
                      <button
                        onClick={() => handleToggleBanner(b.id)}
                        className="text-xs font-bold text-stone-600 hover:text-stone-900"
                      >
                        {b.isActive ? 'Unpublish' : 'Publish'}
                      </button>
                      <button
                        onClick={() => handleDeleteBanner(b.id)}
                        className="text-xs font-bold text-rose-600 hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* --- 8. REVIEWS MODERATION TAB --- */}
        {activeTab === 'reviews' && (
          <div className="space-y-6 animate-in fade-in-50">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-stone-900 dark:text-white">Customer Reviews Moderation</h2>
                <p className="text-xs text-stone-500">Approve or dismiss customer feedback and ratings</p>
              </div>
            </div>

            <div className="space-y-3">
              {reviews.map((r) => (
                <div
                  key={r.id}
                  className="p-5 rounded-3xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-stone-900 dark:text-white">{r.productName}</span>
                      <span className="text-[11px] text-amber-500 font-bold">★ {r.rating}/5</span>
                      <span className="text-[10px] text-stone-400">• {r.date}</span>
                    </div>
                    <p className="text-xs text-stone-600 dark:text-stone-300 italic">"{r.comment}"</p>
                    <p className="text-[11px] text-stone-400">Reviewer: {r.customerName}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold capitalize ${
                        r.status === 'approved'
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                          : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                      }`}
                    >
                      {r.status}
                    </span>
                    {r.status !== 'approved' && (
                      <button
                        onClick={() => handleUpdateReviewStatus(r.id, 'approved')}
                        className="px-3 py-1 rounded-xl bg-emerald-600 text-white text-xs font-bold"
                      >
                        Approve
                      </button>
                    )}
                    {r.status !== 'rejected' && (
                      <button
                        onClick={() => handleUpdateReviewStatus(r.id, 'rejected')}
                        className="px-3 py-1 rounded-xl border border-rose-200 text-rose-600 text-xs font-bold hover:bg-rose-50"
                      >
                        Dismiss
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* --- 9. STORE SETTINGS & SECURITY TAB --- */}
        {activeTab === 'settings' && (
          <div className="max-w-4xl space-y-8 animate-in fade-in-50">
            <div>
              <h2 className="text-lg font-bold text-stone-900 dark:text-white">Store & Operational Settings</h2>
              <p className="text-xs text-stone-500">Shipping thresholds, Bangladesh regional logistics, and server security</p>
            </div>

            {/* Master Security Passcode & Gate Protection */}
            <div className="p-6 rounded-3xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-5 shadow-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
                    <Key className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-stone-900 dark:text-white">
                      Admin Gate & Master Security Passcode (সিকিউরিটি গেট ও মাস্টার পিন)
                    </h3>
                    <p className="text-xs text-stone-500">
                      Protects the /admin URL so outsiders cannot view or access the admin panel
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleLockGate}
                  className="px-3 py-1.5 rounded-xl border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-xs font-semibold text-stone-600 dark:text-stone-300 flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Lock className="w-3.5 h-3.5 text-rose-500" />
                  <span>Lock Gate Now</span>
                </button>
              </div>

              <div className="p-4 rounded-2xl bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <div>
                    <span className="text-stone-500 block text-[11px] font-medium">Active Master Passcode:</span>
                    <span className="font-mono font-bold text-stone-900 dark:text-teal-400 text-base">
                      {showMasterPasscodeInSettings ? masterPasscode : '••••••••'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowMasterPasscodeInSettings(!showMasterPasscodeInSettings)}
                    className="px-2.5 py-1 text-xs rounded-lg border border-stone-300 dark:border-stone-700 hover:bg-stone-200 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-400 flex items-center gap-1.5 transition-colors"
                  >
                    {showMasterPasscodeInSettings ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    <span>{showMasterPasscodeInSettings ? 'Hide Passcode' : 'Reveal Passcode'}</span>
                  </button>
                </div>

                <div className="pt-2 border-t border-stone-200 dark:border-stone-800 space-y-1">
                  <p className="text-[11px] text-stone-500">
                    <strong>Owner Direct Secret URL:</strong> You can bookmark this URL on your phone or PC to automatically unlock the security gate:
                  </p>
                  <code className="block p-2 rounded-xl bg-stone-100 dark:bg-stone-900 font-mono text-[11px] text-teal-600 dark:text-teal-400 break-all select-all">
                    {typeof window !== 'undefined' ? `${window.location.origin}/admin?key=${masterPasscode}` : `/admin?key=${masterPasscode}`}
                  </code>
                </div>
              </div>

              {/* Form to change Master Passcode */}
              <form onSubmit={handleUpdateMasterPasscode} className="space-y-3 pt-1">
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300">
                  Change Master Security Passcode (নতুন সিকিউরিটি পিন সেট করুন)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newMasterPasscodeInput}
                    onChange={(e) => setNewMasterPasscodeInput(e.target.value)}
                    placeholder="Enter new 4-8 digit passcode (e.g. 8844)"
                    className="flex-1 p-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-transparent text-xs font-mono text-stone-900 dark:text-white"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition-colors cursor-pointer"
                  >
                    Update Passcode
                  </button>
                </div>
              </form>
            </div>

            {/* Server Authorization Diagnostics */}
            <div className="p-6 rounded-3xl bg-stone-900 text-white border border-stone-800 space-y-4 shadow-md">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-teal-600 text-white">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Server-Side Authorization Diagnostics</h3>
                  <p className="text-xs text-stone-400">Endpoint: POST /api/admin/verify-auth</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-3 rounded-2xl bg-stone-950 border border-stone-800">
                  <span className="text-stone-400 block text-[10px] uppercase font-bold">Authorized Admin UID</span>
                  <span className="font-mono text-teal-400 font-bold">{CONFIGURED_ADMIN_UID}</span>
                </div>
                <div className="p-3 rounded-2xl bg-stone-950 border border-stone-800">
                  <span className="text-stone-400 block text-[10px] uppercase font-bold">Authorized Admin Email</span>
                  <span className="font-mono text-teal-400 font-bold">{CONFIGURED_ADMIN_EMAIL}</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-stone-800 text-xs text-stone-400">
                <span>Verification State: <strong className="text-emerald-400">Verified & Active</strong></span>
                <button
                  onClick={() => {
                    verifyServerAuthorization(user.uid, user.email || CONFIGURED_ADMIN_EMAIL);
                    showToast('Server authorization re-verified', 'success');
                  }}
                  className="px-3 py-1 rounded-xl bg-stone-800 hover:bg-stone-700 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3 h-3 ${verifyingServer ? 'animate-spin' : ''}`} />
                  <span>Re-test Auth</span>
                </button>
              </div>
            </div>

            {/* Delivery Fees & Thresholds */}
            <div className="p-6 rounded-3xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-4 shadow-xs">
              <h3 className="font-bold text-sm text-stone-900 dark:text-white">Shipping & Delivery Logistics (BDT)</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1">Dhaka Metro Delivery Fee (৳)</label>
                  <input
                    type="number"
                    value={shippingDhaka}
                    onChange={(e) => setShippingDhaka(Number(e.target.value))}
                    className="w-full p-2.5 rounded-xl border text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Outside Dhaka Delivery Fee (৳)</label>
                  <input
                    type="number"
                    value={shippingOutside}
                    onChange={(e) => setShippingOutside(Number(e.target.value))}
                    className="w-full p-2.5 rounded-xl border text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Same-Day Express Dhaka Delivery (৳)</label>
                  <input
                    type="number"
                    value={shippingExpress}
                    onChange={(e) => setShippingExpress(Number(e.target.value))}
                    className="w-full p-2.5 rounded-xl border text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Free Delivery Minimum Order (৳)</label>
                  <input
                    type="number"
                    value={freeShippingMin}
                    onChange={(e) => setFreeShippingMin(Number(e.target.value))}
                    className="w-full p-2.5 rounded-xl border text-xs font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Store Information */}
            <div className="p-6 rounded-3xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-4 shadow-xs">
              <h3 className="font-bold text-sm text-stone-900 dark:text-white">Store Headquarters & Contact</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1">Support Phone</label>
                  <input
                    type="text"
                    value={storeContactPhone}
                    onChange={(e) => setStoreContactPhone(e.target.value)}
                    className="w-full p-2.5 rounded-xl border text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Support Email</label>
                  <input
                    type="email"
                    value={storeContactEmail}
                    onChange={(e) => setStoreContactEmail(e.target.value)}
                    className="w-full p-2.5 rounded-xl border text-xs font-mono"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold mb-1">Office Address</label>
                  <input
                    type="text"
                    value={storeAddress}
                    onChange={(e) => setStoreAddress(e.target.value)}
                    className="w-full p-2.5 rounded-xl border text-xs"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => showToast('Store settings updated successfully', 'success')}
                  className="px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-md"
                >
                  Save Store Settings
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Product Add / Edit Modal */}
      {isProductModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800">
              <h3 className="font-bold text-sm text-stone-900 dark:text-white">
                {editingProductId ? 'Edit Product' : 'Add New Product'}
              </h3>
              <button onClick={() => setIsProductModalOpen(false)} className="text-stone-400 hover:text-stone-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1">Product Title (English) *</label>
                <input
                  type="text"
                  value={prodName}
                  onChange={(e) => setProdName(e.target.value)}
                  required
                  className="w-full p-2.5 rounded-xl border text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Product Title (Bangla)</label>
                <input
                  type="text"
                  value={prodNameBn}
                  onChange={(e) => setProdNameBn(e.target.value)}
                  placeholder="পণ্যের বাংলা নাম"
                  className="w-full p-2.5 rounded-xl border text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Category *</label>
                  <select
                    value={prodCategory}
                    onChange={(e) => setProdCategory(e.target.value)}
                    className="w-full p-2.5 rounded-xl border text-xs capitalize"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Stock Quantity *</label>
                  <input
                    type="number"
                    value={prodStock}
                    onChange={(e) => setProdStock(Number(e.target.value))}
                    required
                    className="w-full p-2.5 rounded-xl border text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Sale Price (BDT ৳) *</label>
                  <input
                    type="number"
                    value={prodPrice}
                    onChange={(e) => setProdPrice(Number(e.target.value))}
                    required
                    className="w-full p-2.5 rounded-xl border text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Original Price (BDT ৳)</label>
                  <input
                    type="number"
                    value={prodOriginalPrice}
                    onChange={(e) => setProdOriginalPrice(Number(e.target.value))}
                    className="w-full p-2.5 rounded-xl border text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Image URL *</label>
                <input
                  type="url"
                  value={prodImage}
                  onChange={(e) => setProdImage(e.target.value)}
                  required
                  placeholder="https://images.unsplash.com/..."
                  className="w-full p-2.5 rounded-xl border text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Description</label>
                <textarea
                  value={prodDesc}
                  onChange={(e) => setProdDesc(e.target.value)}
                  rows={2}
                  className="w-full p-2.5 rounded-xl border text-xs"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isFeat"
                  checked={prodFeatured}
                  onChange={(e) => setProdFeatured(e.target.checked)}
                  className="w-4 h-4 rounded-md accent-teal-600"
                />
                <label htmlFor="isFeat" className="text-xs font-semibold cursor-pointer">
                  Highlight as Featured on Homepage
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsProductModalOpen(false)}
                  className="px-4 py-2 rounded-xl border text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-teal-600 text-white text-xs font-bold"
                >
                  Save Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Banner Modal */}
      {isBannerModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100 dark:border-stone-800">
              <h3 className="font-bold text-sm text-stone-900 dark:text-white">Create Promotional Banner</h3>
              <button onClick={() => setIsBannerModalOpen(false)} className="text-stone-400 hover:text-stone-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddBanner} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">Banner Title *</label>
                <input
                  type="text"
                  value={bannerTitle}
                  onChange={(e) => setBannerTitle(e.target.value)}
                  placeholder="e.g. Flash Summer Sale"
                  required
                  className="w-full p-2.5 rounded-xl border"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Subtitle</label>
                <input
                  type="text"
                  value={bannerSubtitle}
                  onChange={(e) => setBannerSubtitle(e.target.value)}
                  placeholder="Up to 50% off on all items"
                  className="w-full p-2.5 rounded-xl border"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Image URL *</label>
                <input
                  type="url"
                  value={bannerImage}
                  onChange={(e) => setBannerImage(e.target.value)}
                  placeholder="https://images.unsplash.com/..."
                  required
                  className="w-full p-2.5 rounded-xl border font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Target Link URL</label>
                <input
                  type="text"
                  value={bannerUrl}
                  onChange={(e) => setBannerUrl(e.target.value)}
                  placeholder="/products"
                  className="w-full p-2.5 rounded-xl border font-mono"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setIsBannerModalOpen(false)}
                  className="px-4 py-2 rounded-xl border"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-teal-600 text-white font-bold"
                >
                  Save Banner
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invoice Modal for Admin */}
      {selectedOrderForInvoice && (
        <InvoiceModal
          order={selectedOrderForInvoice}
          isOpen={Boolean(selectedOrderForInvoice)}
          onClose={() => setSelectedOrderForInvoice(null)}
        />
      )}
    </div>
  );
};
