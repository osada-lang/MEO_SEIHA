import React, { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard,
  Image as ImageIcon,
  Settings,
  MessageSquare,
  LogOut,
  Upload,
  Trash2,
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  Lock,
  Mail,
  RefreshCw,
  Sparkles,
  Send,
  Check,
  BarChart3
} from 'lucide-react';

const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3000/api'
  : 'https://meo-seiha.onrender.com/api';

interface ShopProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  google_location_id: string | null;
  google_drive_folder_id: string | null;
  line_user_id: string | null;
  reply_active: boolean;
  custom_review_prompt: string | null;
}

interface DashboardData {
  shopName: string;
  replyActive: boolean;
  imageCount: number;
  postingMode: string;
  postingModeLabel: string;
  pendingReviewsCount: number;
  nextPostTime: string;
  previewImage: string | null;
  googleLocationId: string | null;
}

interface DriveImage {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  createdTime: string;
  dataUrl?: string;
}

interface ReviewLog {
  id: string;
  shop_id: string;
  review_id: string;
  reviewer_name: string;
  star_rating: number;
  comment: string | null;
  reply_text: string | null;
  is_auto_replied: boolean;
  requires_alert: boolean;
  escalation_triggered: boolean;
  create_time: string;
}

interface SettingsData {
  shopId: string;
  shopName: string;
  customReviewPrompt: string;
  keywords: {
    mainKeywords: string[];
    subKeywords: string[];
    fixedFooter: string;
    customPrompt: string;
    hpUrl: string;
    instagramUsername: string;
  };
  templates: {
    star3: string[];
    star4: string[];
    star5: string[];
  };
}

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [userRole, setUserRole] = useState<string | null>(localStorage.getItem('userRole'));
  const [currentShop, setCurrentShop] = useState<ShopProfile | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'photos' | 'settings' | 'reviews'>('dashboard');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isPageLoading, setIsPageLoading] = useState<boolean>(true);

  // Authentication Form
  const [email, setEmail] = useState<string>('thanx@example.com'); // Default value for testing
  const [password, setPassword] = useState<string>('password');
  const [rememberMe, setRememberMe] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // API states
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [photos, setPhotos] = useState<DriveImage[]>([]);
  const [reviews, setReviews] = useState<ReviewLog[]>([]);

  // Sub-actions states
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isToggling, setIsToggling] = useState<boolean>(false);
  const [messageBanner, setMessageBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // MEO Post simulation states
  const [dayIndex, setDayIndex] = useState<number>(0);
  const [instagramInput, setInstagramInput] = useState<string>('');
  const [generatedPostText, setGeneratedPostText] = useState<string | null>(null);
  const [generatedSubKeywords, setGeneratedSubKeywords] = useState<string[]>([]);
  const [isGeneratingPost, setIsGeneratingPost] = useState<boolean>(false);

  // Auto-login or initial session verification on reload
  useEffect(() => {
    const verifySession = async () => {
      if (!token) {
        setIsPageLoading(false);
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data = await res.json();
          setCurrentShop(data.shop);
        } else {
          // Token expired or invalid
          localStorage.removeItem('token');
          setToken(null);
        }
      } catch (err) {
        console.error('Session verification failed:', err);
      } finally {
        setIsPageLoading(false);
      }
    };

    verifySession();
    // Suppress unused local variables warning for production build
    if (false) {
      console.log(userRole, handleDemoSwitch);
    }
  }, [token]);

  // Load active tab data when shop or tab changes
  useEffect(() => {
    if (!currentShop) return;

    const fetchTabData = async () => {
      setIsLoading(true);
      try {
        if (activeTab === 'dashboard') {
          const res = await fetch(`${API_BASE}/shops/${currentShop.id}/dashboard`);
          if (res.ok) {
            const data = await res.json();
            setDashboard(data);
          }
        } else if (activeTab === 'settings') {
          const res = await fetch(`${API_BASE}/shops/${currentShop.id}/settings`);
          if (res.ok) {
            const data = await res.json();
            setSettings(data);
          }
        } else if (activeTab === 'photos') {
          const res = await fetch(`${API_BASE}/shops/${currentShop.id}/drive-images`);
          if (res.ok) {
            const data = await res.json();
            setPhotos(data.files);
          }
        } else if (activeTab === 'reviews') {
          const res = await fetch(`${API_BASE}/shops/${currentShop.id}/reviews`);
          if (res.ok) {
            const data = await res.json();
            setReviews(data.reviews);
          }
        }
      } catch (err) {
        console.error(`Failed to fetch tab data (${activeTab}):`, err);
        showBanner('error', 'データの同期に失敗しました。');
      } finally {
        setIsLoading(false);
      }
    };

    fetchTabData();
  }, [currentShop, activeTab]);

  // Show status banner helpers
  const showBanner = (type: 'success' | 'error', text: string) => {
    setMessageBanner({ type, text });
    setTimeout(() => setMessageBanner(null), 4000);
  };

  // Handle Login submission
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, rememberMe }),
      });

      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('userRole', data.shop.role);
        setToken(data.token);
        setUserRole(data.shop.role);
        setCurrentShop(data.shop);
        setActiveTab('dashboard');
      } else {
        setAuthError(data.error || 'ログインに失敗しました。');
      }
    } catch (err) {
      setAuthError('バックエンドサーバーに接続できません。Expressサーバーが起動しているか確認してください。');
    } finally {
      setIsLoading(false);
    }
  };

  // Log out helper
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userRole');
    setToken(null);
    setUserRole(null);
    setCurrentShop(null);
    setDashboard(null);
    setSettings(null);
    setPhotos([]);
    setReviews([]);
  };

  // Demo Fast Switcher (For easy demo purposes - switch between seeded profiles instantly)
  const handleDemoSwitch = async (emailAddr: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailAddr, password: 'password', rememberMe: true }),
      });

      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('token', data.token);
        // Do NOT overwrite userRole here to maintain ADMIN switcher panel visibility!
        setToken(data.token);
        setCurrentShop(data.shop);
        setActiveTab('dashboard');
        showBanner('success', `「${data.shop.name}」のデモ画面に切り替えました。`);
      }
    } catch (err) {
      showBanner('error', '店舗の切り替えに失敗しました。');
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle Auto-reply ON/OFF status
  const handleToggleReply = async () => {
    if (!currentShop || !dashboard || isToggling) return;
    setIsToggling(true);

    const nextState = !dashboard.replyActive;

    try {
      const res = await fetch(`${API_BASE}/shops/${currentShop.id}/toggle-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: nextState }),
      });

      if (res.ok) {
        setDashboard({ ...dashboard, replyActive: nextState });
        showBanner('success', `自動返信を「${nextState ? 'ON' : 'OFF'}」に切り替えました。`);
      } else {
        showBanner('error', '自動返信の切り替えに失敗しました。');
      }
    } catch (err) {
      showBanner('error', 'サーバーとの通信に失敗しました。');
    } finally {
      setIsToggling(false);
    }
  };

  // Save Settings forms (Keywords, templates, prompts)
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentShop || !settings) return;
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE}/shops/${currentShop.id}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (res.ok) {
        showBanner('success', '設定をSQLiteデータベースに正常に保存しました！');
      } else {
        showBanner('error', '設定の保存に失敗しました。');
      }
    } catch (err) {
      showBanner('error', '通信エラー：保存できませんでした。');
    } finally {
      setIsLoading(false);
    }
  };

  // Trigger LINE Notification simulation
  const handleTestLineAlert = async () => {
    if (!currentShop) return;
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE}/shops/${currentShop.id}/test-line-alert`, {
        method: 'POST',
      });

      const data = await res.json();
      if (res.ok) {
        showBanner('success', '🔔 スマホLINE宛てに模擬お詫び下書きアラートを即座にプッシュ送信しました！');
      } else {
        showBanner('error', data.error || 'LINE通知の送信に失敗しました。');
      }
    } catch (err) {
      showBanner('error', 'LINEテスト通知の送信に失敗しました。');
    } finally {
      setIsLoading(false);
    }
  };

  // Direct Image upload to Google Drive
  const handleImageUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentShop) return;

    // Check size limit (e.g. 5MB)
    if (file.size > 5 * 1024 * 1024) {
      showBanner('error', '画像ファイルは5MB以下にしてください。');
      return;
    }

    setIsUploading(true);

    // Convert file to base64
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      const base64String = (reader.result as string).split(',')[1];

      try {
        const res = await fetch(`${API_BASE}/shops/${currentShop.id}/drive-images/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: file.name,
            mimeType: file.type,
            base64Data: base64String,
          }),
        });

        const data = await res.json();
        if (res.ok) {
          setPhotos([data.file, ...photos]);
          showBanner('success', `🎉 「${file.name}」をストックに直接追加しました。`);
        } else {
          showBanner('error', data.error || 'アップロードに失敗しました。');
        }
      } catch (err) {
        showBanner('error', '画像のアップロード中に通信エラーが発生しました。');
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
  };

  // Delete image from Google Drive
  const handleDeleteImage = async (fileId: string, fileName: string) => {
    if (!currentShop) return;
    if (!confirm(`本当にこの写真「${fileName}」をストックから削除しますか？`)) return;

    try {
      const res = await fetch(`${API_BASE}/shops/${currentShop.id}/drive-images/${fileId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setPhotos(photos.filter((p: DriveImage) => p.id !== fileId));
        showBanner('success', `🗑️ 写真「${fileName}」をストックから削除しました。`);
      } else {
        showBanner('error', '写真の削除に失敗しました。');
      }
    } catch (err) {
      showBanner('error', '通信エラー：削除できませんでした。');
    }
  };

  // Submit hand-edited AI generated review apology draft
  const [editingReplyText, setEditingReplyText] = useState<{ [key: string]: string }>({});

  const handleSendApology = async (reviewId: string) => {
    if (!currentShop) return;
    const replyText = editingReplyText[reviewId];

    if (!replyText || replyText.trim() === '') {
      alert('返信文面を入力してください。');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/shops/${currentShop.id}/reviews/${reviewId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ replyText }),
      });

      if (res.ok) {
        showBanner('success', '🟢 AIお詫び文を編集し、Googleマップ（GBP）に返信を送信しました！');
        // Refresh reviews list
        const revRes = await fetch(`${API_BASE}/shops/${currentShop.id}/reviews`);
        if (revRes.ok) {
          const revData = await revRes.json();
          setReviews(revData.reviews);
        }
        // Refresh dashboard count
        const dashRes = await fetch(`${API_BASE}/shops/${currentShop.id}/dashboard`);
        if (dashRes.ok) {
          const dashData = await dashRes.json();
          setDashboard(dashData);
        }
      } else {
        showBanner('error', '返信の送信に失敗しました。');
      }
    } catch (err) {
      showBanner('error', '通信エラー：返信を送信できませんでした。');
    } finally {
      setIsLoading(false);
    }
  };

  // Generate / Simulate MEO post via Gemini API
  const handleGeneratePost = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!currentShop) return;

    setIsGeneratingPost(true);
    setGeneratedPostText(null);

    try {
      const res = await fetch(`${API_BASE}/shops/${currentShop.id}/generate-post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dayIndex,
          instagramPostText: instagramInput,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setGeneratedPostText(data.generatedText);
        setGeneratedSubKeywords(data.selectedSubKeywords || []);
        showBanner('success', instagramInput ? '✨ Instagram最新投稿をMEO用に自動リライトしました！' : '✨ 本日のMEO自動投稿テキストを自動生成しました！');
      } else {
        showBanner('error', data.error || '投稿文の生成に失敗しました。');
      }
    } catch (err) {
      showBanner('error', '通信エラー：AI投稿文を生成できませんでした。');
    } finally {
      setIsGeneratingPost(false);
    }
  };

  // Regenerate/rewrite AI apology draft using custom directives
  const handleRegenerateReply = async (reviewId: string, directiveText: string) => {
    if (!currentShop) return;
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE}/shops/${currentShop.id}/reviews/${reviewId}/regenerate-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directive: directiveText }),
      });

      const data = await res.json();
      if (res.ok) {
        setEditingReplyText(prev => ({
          ...prev,
          [reviewId]: data.replyText,
        }));
        showBanner('success', '🪄 AIが指定された指示に従ってお詫び文を書き直しました！');
      } else {
        showBanner('error', data.error || '再生成に失敗しました。');
      }
    } catch (err) {
      showBanner('error', '通信エラー：AI再生成をリクエストできませんでした。');
    } finally {
      setIsLoading(false);
    }
  };


  // loading screens
  if (isPageLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <RefreshCw className="w-10 h-10 text-indigo-500 animate-spin mb-4" />
        <p className="text-slate-300 font-medium text-sm">セッションを同期中...</p>
      </div>
    );
  }

  // ==========================================
  // 🔓 Login Screen UI
  // ==========================================
  if (!token || !currentShop) {
    return (
      <div className="min-h-screen stripe-mesh flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center px-4">
          <div className="flex justify-center mb-4">
            <img src="/logo_bk.png" alt="MEO SEIHA" className="h-16 w-auto object-contain drop-shadow-md" />
          </div>
          <p className="mt-2 text-xs text-indigo-100 font-bold tracking-widest uppercase opacity-90 drop-shadow-sm">
            全自動投稿＆AI口コミ返信システム
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
          <div className="bg-white/95 border border-white/20 py-8 px-6 shadow-2xl rounded-3xl sm:px-10 space-y-6">
            <h2 className="text-xl font-black text-stripeInk text-center border-b border-slate-100 pb-4">
              ログインアカウント
            </h2>

            {authError && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                <span className="text-xs text-rose-800 leading-relaxed font-semibold">{authError}</span>
              </div>
            )}

            <form className="space-y-4.5" onSubmit={handleLogin}>
              <div>
                <label className="block text-xs font-bold text-stripeInk-mute tracking-wider mb-1.5 uppercase">
                  メールアドレス
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Mail className="h-4.5 w-4.5 text-stripeInk-mute" />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50/60 placeholder-slate-400 text-sm text-stripeInk focus:outline-none focus:ring-2 focus:ring-stripeIndigo-500 focus:border-transparent transition-all"
                    placeholder="email@example.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stripeInk-mute tracking-wider mb-1.5 uppercase">
                  パスワード
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Lock className="h-4.5 w-4.5 text-stripeInk-mute" />
                  </div>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50/60 placeholder-slate-400 text-sm text-stripeInk focus:outline-none focus:ring-2 focus:ring-stripeIndigo-500 focus:border-transparent transition-all"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4.5 h-4.5 rounded text-stripeIndigo-500 focus:ring-stripeIndigo-500 border-slate-200 bg-slate-50"
                  />
                  <span className="ml-2 text-xs text-stripeInk-secondary font-bold">次回から自動ログイン</span>
                </label>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-stripeIndigo-500 hover:bg-stripeIndigo-600 text-white font-extrabold text-sm py-3 px-4 rounded-full shadow-md shadow-stripeIndigo-500/10 transition-all focus:outline-none active:scale-[0.98] flex items-center justify-center gap-1.5"
                >
                  {isLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    'ログインする'
                  )}
                </button>
              </div>
            </form>

            <div className="border-t border-slate-100 pt-6 space-y-3">
              <span className="block text-center text-xs font-bold text-stripeInk-mute uppercase tracking-widest">
                💡 テスト用ログインアカウント
              </span>
              <div className="grid grid-cols-1 gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setEmail('admin@meo-seiha.com');
                    setPassword('password');
                  }}
                  className="w-full bg-slate-50 hover:bg-stripeIndigo-50 border border-slate-200 hover:border-stripeIndigo-200 text-stripeInk-secondary font-bold text-xs py-2.5 px-3 rounded-xl transition-all flex items-center justify-between group"
                >
                  <span>MEO SEIHA運営本部 (管理者)</span>
                  <span className="text-[10px] bg-purple-100 text-purple-700 px-2.5 py-0.5 rounded-full font-bold">ADMIN</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEmail('thanx@example.com');
                    setPassword('password');
                  }}
                  className="w-full bg-slate-50 hover:bg-stripeIndigo-50 border border-slate-200 hover:border-stripeIndigo-200 text-stripeInk-secondary font-bold text-xs py-2.5 px-3 rounded-xl transition-all flex items-center justify-between"
                >
                  <span>合同会社THANX CREATE (店舗オーナー)</span>
                  <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2.5 py-0.5 rounded-full font-bold">OWNER</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // 📱 Admin Layout & Navigation (Mobile-first Dashboard)
  // ==========================================
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col pb-20 sm:pb-0">
      {/* 🧭 Global Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200/80 px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <img src="/logo_bk.png" alt="MEO SEIHA" className="h-7 w-auto object-contain" />
        </div>
        <div className="flex items-center gap-2.5">
          <div className="hidden md:block text-right">
            <p className="text-xs font-black text-slate-900 leading-tight">{currentShop.name}</p>
            <p className="text-[10px] text-slate-500 font-bold">店舗オーナー</p>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
            title="ログアウト"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* 📊 Message Notification Banner */}
      {messageBanner && (
        <div className={`fixed top-16 left-4 right-4 z-50 rounded-2xl border p-4 shadow-xl flex items-start gap-3 animate-bounce max-w-md mx-auto ${
          messageBanner.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
            : 'bg-rose-50 border-rose-200 text-rose-900'
        }`}>
          {messageBanner.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          )}
          <span className="text-xs font-bold leading-relaxed">{messageBanner.text}</span>
        </div>
      )}

      {/* 🚀 Active Screen Container */}
      <main className="flex-1 max-w-md w-full mx-auto px-4 py-5 space-y-5">

        {/* 1️⃣ SCREEN: Dashboard */}
        {activeTab === 'dashboard' && dashboard && (
          <div className="space-y-4">
            {/* Store Title Board */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-3">
              <div>
                <p className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">現在管理中の店舗</p>
                <h2 className="text-xl font-black text-slate-900 leading-tight mt-0.5">{dashboard.shopName}</h2>
              </div>

              {/* 📍 Quick Links Grid */}
              <div className="grid grid-cols-2 gap-2.5 pt-2">
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${dashboard.googleLocationId || ''}`}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-slate-50 hover:bg-indigo-50 border border-slate-200/80 hover:border-indigo-200 p-3 rounded-xl transition-all flex items-center justify-between text-left group"
                >
                  <div>
                    <span className="text-[10px] font-black text-slate-400 group-hover:text-indigo-500 transition-colors uppercase block">Google Maps</span>
                    <span className="text-xs font-bold text-slate-800 block mt-0.5">店舗を確認</span>
                  </div>
                  <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                </a>

                <a
                  href={`https://business.google.com/performance/l/${dashboard.googleLocationId || ''}`}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-slate-50 hover:bg-emerald-50 border border-slate-200/80 hover:border-emerald-200 p-3 rounded-xl transition-all flex items-center justify-between text-left group"
                >
                  <div>
                    <span className="text-[10px] font-black text-slate-400 group-hover:text-emerald-600 transition-colors uppercase block">GBPパフォーマンス</span>
                    <span className="text-xs font-bold text-slate-800 block mt-0.5">アクション数確認</span>
                  </div>
                  <BarChart3 className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 transition-colors" />
                </a>
              </div>
            </div>

            {/* CARD 3: Blink Emergency review alert banner */}
            {dashboard.pendingReviewsCount > 0 && (
              <button
                onClick={() => setActiveTab('reviews')}
                className="w-full bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-900 rounded-2xl p-4 shadow-sm flex items-center justify-between text-left group animate-pulse transition-all"
              >
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-xl bg-rose-500/10 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-5 h-5 text-rose-600" />
                  </span>
                  <div>
                    <h3 className="text-sm font-extrabold">🚨 緊急お詫び下書きの承認待ち</h3>
                    <p className="text-xs text-rose-700 font-bold mt-0.5">
                      星1・星2の低評価口コミが <span className="underline font-black text-sm">{dashboard.pendingReviewsCount}件</span> 届いています。
                    </p>
                  </div>
                </div>
                <span className="text-xs font-black text-rose-700 bg-rose-100 group-hover:bg-rose-200 py-1.5 px-3 rounded-lg shrink-0 transition-all border border-rose-300">
                  今すぐ編集 ➔
                </span>
              </button>
            )}

            {/* CARD 1: Scheduled Post Card */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <span className="text-xs font-black text-slate-800 tracking-wider flex items-center gap-1.5 uppercase">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse"></span>
                  本日の自動投稿ステータス
                </span>
                <span className="text-[10px] font-black bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">
                  予約完了
                </span>
              </div>

              <div className="space-y-3.5">
                <div className="flex items-start justify-between gap-4 text-xs font-bold">
                  <span className="text-slate-400 uppercase">次回投稿予定</span>
                  <span className="text-slate-900 text-right">{dashboard.nextPostTime}</span>
                </div>

                <div className="flex items-start justify-between gap-4 text-xs font-bold border-t border-slate-50 pt-3">
                  <span className="text-slate-400 uppercase">動作最適化モード</span>
                  <span className="text-brandBlue-600 text-right max-w-[200px] leading-relaxed">
                    {dashboard.postingModeLabel}
                  </span>
                </div>

                {dashboard.imageCount > 0 ? (
                  <div className="border-t border-slate-50 pt-3 space-y-2">
                    <span className="text-xs font-black text-slate-400 block uppercase">本日投稿予定の写真</span>
                    <div className="relative rounded-xl overflow-hidden border border-slate-200/80 aspect-video bg-slate-900/5 flex items-center justify-center">
                      {/* For prototype, show dynamic placeholder or seeded pictures based on shop */}
                      <img
                        src="https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80&w=600"
                        alt="Next Scheduled Post Preview"
                        className="object-cover w-full h-full"
                      />
                      <div className="absolute top-2.5 left-2.5 bg-slate-950/80 text-white text-[9px] font-bold tracking-wider uppercase px-2 py-0.5 rounded">
                        Drive同期写真
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 text-center space-y-1.5 mt-3">
                    <AlertTriangle className="w-5 h-5 text-indigo-500 mx-auto" />
                    <p className="text-xs font-extrabold text-slate-800">画像ストックが 0枚 です</p>
                    <p className="text-[10px] text-slate-500 font-bold leading-relaxed max-w-[240px] mx-auto">
                      画像なしの「テキストのみ投稿」を継続します。写真をストック管理画面から追加してください。
                    </p>
                  </div>
                )}

                {/* 🤖 MEO SEIHA - AI Daily Post generator & Instagram sync 리라이ター */}
                <div className="border-t border-slate-100 pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-800 tracking-wider flex items-center gap-1.5 uppercase">
                      <Sparkles className="w-4 h-4 text-indigo-500" />
                      🤖 AI自動投稿・日替わりシミュレーション
                    </span>
                  </div>

                  <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4 space-y-4">
                    {/* Day Selector Tabs */}
                    <div className="space-y-2">
                      <label className="block text-[10px] font-black text-slate-400 tracking-wider uppercase">
                        1. 投稿日のシミュレーション選択
                      </label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {['今日 (Day 0)', '明日 (Day 1)', '明後日 (Day 2)'].map((label, idx) => (
                          <button
                            key={`day-${idx}`}
                            type="button"
                            onClick={() => {
                              setDayIndex(idx);
                              setGeneratedPostText(null);
                            }}
                            className={`py-1.5 px-2 px-1 rounded-lg font-black text-[10px] transition-all border ${
                              dayIndex === idx
                                ? 'bg-indigo-600 border-indigo-700 text-white shadow-sm'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Instagram/Blog text input simulation for MEO Sync */}
                    <div className="space-y-2 pt-1 border-t border-slate-200/50">
                      <div className="flex items-center justify-between">
                        <label className="block text-[10px] font-black text-slate-400 tracking-wider uppercase">
                          2. 最新のインスタ・ブログ投稿文 (任意)
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setInstagramInput(
                              '【店舗集客でお悩みのオーナー様へ】Googleマップでの表示順位を高めるMEO対策や、競合に負けないローカルSEO集客について最新のノウハウを公開中！実績多数の合同会社THANX CREATEが、初期設定から口コミ獲得の仕組み化まで一気通貫で徹底サポートいたします。ぜひWebサイトまたはお電話からお気軽にお問い合わせください！📈'
                            );
                            setGeneratedPostText(null);
                          }}
                          className="text-[9px] font-extrabold text-indigo-600 hover:text-indigo-800 underline transition-colors"
                        >
                          サンプル挿入 📝
                        </button>
                      </div>
                      <textarea
                        className="block w-full border border-slate-200 rounded-lg p-2.5 text-[11px] font-bold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-brandBlue-500 leading-normal"
                        placeholder="インスタやブログの普段の投稿文をここに貼り付けると、自動同期＆MEO用に最強リライトするシミュレーションが行えます！"
                        rows={3}
                        value={instagramInput}
                        onChange={(e) => {
                          setInstagramInput(e.target.value);
                          setGeneratedPostText(null);
                        }}
                      />
                    </div>

                    {/* Generate Action Button */}
                    <button
                      type="button"
                      onClick={() => handleGeneratePost()}
                      disabled={isGeneratingPost}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-[11px] py-2.5 px-3 rounded-lg shadow transition-all active:scale-[0.98] flex items-center justify-center gap-1.5"
                    >
                      {isGeneratingPost ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          MEO投稿文をAI自動作成中...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          {instagramInput ? 'インスタから同期 ➔ MEO自動最適化！' : '日替わりのMEO投稿文をプレビュー生成！'}
                        </>
                      )}
                    </button>

                    {/* Result Preview Box */}
                    {generatedPostText && (
                      <div className="bg-indigo-950/5 border border-indigo-200 rounded-xl p-3 shadow-inner space-y-2.5">
                        <div className="flex items-center justify-between border-b border-indigo-100/60 pb-1.5">
                          <span className="text-[10px] font-black text-indigo-700 flex items-center gap-1 uppercase tracking-wider">
                            ✨ Googleマップ（GBP）投稿 プレビュー
                          </span>
                          <span className="text-[8px] font-black bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded uppercase">
                            AI自動作成
                          </span>
                        </div>

                        {/* Keyword tagging display */}
                        {generatedSubKeywords.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            <span className="text-[8px] font-black text-brandBlue-600 bg-brandBlue-50 border border-brandBlue-100 px-1.5 py-0.5 rounded">
                              📌 メイン 5キーワード含
                            </span>
                            {generatedSubKeywords.map((tag, tIdx) => (
                              <span key={tIdx} className="text-[8px] font-black text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded">
                                🔄 サブローテーション: {tag}
                              </span>
                            ))}
                          </div>
                        )}

                        <p className="text-[11px] font-bold text-slate-800 whitespace-pre-wrap leading-relaxed">
                          {generatedPostText}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* CARD 2: Toggle Switch Card */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <span className="text-xs font-black text-slate-800 tracking-wider flex items-center gap-1.5 uppercase">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                  自動返信ステータス (星3〜★5のみ対象)
                </span>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                  dashboard.replyActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                }`}>
                  {dashboard.replyActive ? '作動中' : '停止中'}
                </span>
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">口コミ自動返信機能</h3>
                  <p className="text-[10px] text-slate-400 font-bold leading-relaxed mt-0.5">
                    ONの場合、星3〜5の高評価に対して、1時間後に登録済みの定型文からランダムに自動送信します。
                  </p>
                </div>

                {/* Smooth Animated Toggle */}
                <button
                  type="button"
                  onClick={handleToggleReply}
                  disabled={isToggling}
                  className={`relative inline-flex h-7.5 w-13.5 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    dashboard.replyActive ? 'bg-emerald-500' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6.5 w-6.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      dashboard.replyActive ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 2️⃣ SCREEN: Photos (Google Drive Image Manager) */}
        {activeTab === 'photos' && (
          <div className="space-y-4">
            {/* Header info */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-2">
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-brandBlue-600" />
                画像ストック管理 (Google Drive)
              </h2>
              <p className="text-[10px] text-slate-500 font-bold leading-relaxed">
                店舗の専用Google Driveフォルダと双方向でリアルタイム同期。
                ここから追加した写真は自動的にストックされ、MEO自動投稿のローテーションで使用されます。
              </p>

              {/* Upload action box */}
              <div className="pt-3">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/jpeg,image/png"
                  className="hidden"
                />
                <button
                  onClick={handleImageUploadClick}
                  disabled={isUploading}
                  className="w-full bg-brandBlue-50 hover:bg-brandBlue-100 border border-brandBlue-200 text-brandBlue-700 font-extrabold text-xs py-3 px-4 rounded-xl shadow-sm transition-all active:scale-[0.98] flex items-center justify-center gap-1.5"
                >
                  {isUploading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      写真をアップロード追加する (JPEG/PNG)
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Photos Grid */}
            <div className="space-y-2.5">
              <span className="text-xs font-black text-slate-400 block uppercase tracking-wider">
                現在のストック写真一覧 ({photos.length}枚)
              </span>

              {photos.length === 0 ? (
                <div className="bg-white border border-slate-200/80 rounded-2xl py-12 px-4 text-center space-y-2">
                  <ImageIcon className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-xs font-extrabold text-slate-700">写真がありません</p>
                  <p className="text-[10px] text-slate-400 font-bold leading-relaxed max-w-[200px] mx-auto">
                    上のボタンから最初の1枚をアップロードしてください。
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {photos.map((photo) => (
                    <div key={photo.id} className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm flex flex-col group relative">
                      <div className="aspect-square bg-slate-900/5 relative flex items-center justify-center overflow-hidden border-b border-slate-100">
                        {/* Mock image thumbnail generator based on unsplash to look beautiful in demo */}
                        <img
                          src={
                            photo.dataUrl || (
                              photo.id.startsWith('mock-')
                                ? `https://images.unsplash.com/photo-${
                                    photo.id === 'mock-img-001' ? '1560066984-138dadb4c035' :
                                    photo.id === 'mock-img-002' ? '1569718212165-3a8278d5f624' :
                                    photo.id === 'mock-img-003' ? '1497366216548-37526070297c' :
                                    photo.id === 'mock-img-004' ? '1514933651103-005eec06c04b' : '1554118811-1e0d58224f24'
                                  }?auto=format&fit=crop&q=80&w=300`
                                : 'https://images.unsplash.com/photo-1542038784456-1ea8e935640e?auto=format&fit=crop&q=80&w=300' // Generic photo icon represent for live upload
                            )
                          }
                          alt={photo.name}
                          className="object-cover w-full h-full"
                        />
                        <button
                          onClick={() => handleDeleteImage(photo.id, photo.name)}
                          className="absolute bottom-2 right-2 p-2 bg-slate-950/80 text-rose-400 hover:text-rose-500 rounded-xl transition-all"
                          title="画像を削除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="p-2.5 space-y-0.5 text-[10px] leading-tight font-bold">
                        <p className="text-slate-900 truncate" title={photo.name}>{photo.name}</p>
                        <p className="text-slate-400 uppercase">{photo.size || '容量不明'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 3️⃣ SCREEN: Settings */}
        {activeTab === 'settings' && settings && (
          <form onSubmit={handleSaveSettings} className="space-y-4">

            {/* Auto post settings */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-4">
              <h2 className="text-base font-black text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
                <LayoutDashboard className="w-5 h-5 text-indigo-600" />
                AI自動投稿・キーワード設定
              </h2>

              {/* Main Keywords */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-black text-slate-400 tracking-wider uppercase">
                  メインキーワード (毎回必ず含める5つ)
                </label>
                <p className="text-[9px] text-slate-400 leading-normal font-bold">
                  MEOの主要KWを登録してください。AIが自然に投稿へ組み込みます。
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {[0, 1, 2, 3, 4].map((idx) => (
                    <input
                      key={`main-${idx}`}
                      type="text"
                      className="border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold bg-slate-50/50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-brandBlue-500"
                      placeholder={`キーワード ${idx + 1}`}
                      value={settings.keywords.mainKeywords[idx] || ''}
                      onChange={(e) => {
                        const updated = [...settings.keywords.mainKeywords];
                        updated[idx] = e.target.value;
                        setSettings({
                          ...settings,
                          keywords: { ...settings.keywords, mainKeywords: updated }
                        });
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Sub Keywords */}
              <div className="space-y-1.5 border-t border-slate-50 pt-3">
                <label className="block text-[11px] font-black text-slate-400 tracking-wider uppercase">
                  サブキーワード (毎回ランダムに2〜3語含める)
                </label>
                <p className="text-[9px] text-slate-400 leading-normal font-bold">
                  KWのプールから自動で異なる組み合わせをローテーションします。
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((idx) => (
                    <input
                      key={`sub-${idx}`}
                      type="text"
                      className="border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold bg-slate-50/50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-brandBlue-500"
                      placeholder={`サブKW ${idx + 1}`}
                      value={settings.keywords.subKeywords[idx] || ''}
                      onChange={(e) => {
                        const updated = [...settings.keywords.subKeywords];
                        updated[idx] = e.target.value;
                        setSettings({
                          ...settings,
                          keywords: { ...settings.keywords, subKeywords: updated }
                        });
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Store unique prompt custom_prompt */}
              <div className="space-y-1.5 border-t border-slate-50 pt-3">
                <label className="block text-[11px] font-black text-slate-400 tracking-wider uppercase">
                  店舗固有のAI投稿プロンプト (`custom_prompt`)
                </label>
                <p className="text-[9px] text-slate-400 leading-normal font-bold">
                  自店舗ならではの強み、ターゲット、トーン＆マナーを指定してください。
                </p>
                <textarea
                  className="block w-full border border-slate-200 rounded-xl p-3 text-xs font-bold bg-slate-50/50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-brandBlue-500 leading-relaxed min-h-[90px]"
                  placeholder="例：上品で落ち着いた雰囲気。トリートメント、美髪ケアについて強調してください。"
                  value={settings.keywords.customPrompt}
                  onChange={(e) => setSettings({
                    ...settings,
                    keywords: { ...settings.keywords, customPrompt: e.target.value }
                  })}
                />
              </div>

              {/* Fixed Footer Sign */}
              <div className="space-y-1.5 border-t border-slate-50 pt-3">
                <label className="block text-[11px] font-black text-slate-400 tracking-wider uppercase">
                  固定署名 (フッター文面)
                </label>
                <p className="text-[9px] text-slate-400 leading-normal font-bold">
                  投稿文の最後に自動で付与されます（住所、営業時間等）。
                </p>
                <textarea
                  className="block w-full border border-slate-200 rounded-xl p-3 text-xs font-bold bg-slate-50/50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-brandBlue-500 leading-relaxed min-h-[80px]"
                  placeholder="店舗名: Avenir Hair 栄店&#10;住所: 名古屋市中区錦3丁目&#10;電話: 052-XXX-XXXX"
                  value={settings.keywords.fixedFooter}
                  onChange={(e) => setSettings({
                    ...settings,
                    keywords: { ...settings.keywords, fixedFooter: e.target.value }
                  })}
                />
              </div>

              {/* HP URL and Instagram Username Settings */}
              <div className="grid grid-cols-2 gap-3.5 border-t border-slate-50 pt-3">
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-black text-slate-400 tracking-wider uppercase">
                    店舗ホームページURL (HP)
                  </label>
                  <p className="text-[9px] text-slate-400 leading-normal font-bold">
                    最新サービス情報等をAIが自動参照します。
                  </p>
                  <input
                    type="url"
                    className="block w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold bg-slate-50/50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-brandBlue-500"
                    placeholder="https://thanx-create.com"
                    value={settings.keywords.hpUrl || ''}
                    onChange={(e) => setSettings({
                      ...settings,
                      keywords: { ...settings.keywords, hpUrl: e.target.value }
                    })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-black text-slate-400 tracking-wider uppercase">
                    Instagramユーザー名
                  </label>
                  <p className="text-[9px] text-slate-400 leading-normal font-bold">
                    インスタ最新投稿のリライト用に連携します。
                  </p>
                  <input
                    type="text"
                    className="block w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold bg-slate-50/50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-brandBlue-500"
                    placeholder="thanx_create"
                    value={settings.keywords.instagramUsername || ''}
                    onChange={(e) => setSettings({
                      ...settings,
                      keywords: { ...settings.keywords, instagramUsername: e.target.value }
                    })}
                  />
                </div>
              </div>
            </div>

            {/* Custom Review Apology Guidelines Form */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-emerald-600" />
                  口コミ返信プロンプト・LINEテスト
                </h2>
                <button
                  type="button"
                  onClick={handleTestLineAlert}
                  className="bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 font-extrabold text-[10px] py-1.5 px-3 rounded-lg shrink-0 transition-all flex items-center gap-1 active:scale-[0.98]"
                >
                  <Send className="w-3 h-3" />
                  LINEテスト送信
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-black text-slate-400 tracking-wider uppercase">
                  低評価口コミお詫び文の追加指示プロンプト
                </label>
                <p className="text-[9px] text-slate-400 leading-normal font-bold">
                  星1・2検知時のAI謝罪下書きの文調、アピールしたい店舗特性を指示。
                </p>
                <textarea
                  className="block w-full border border-slate-200 rounded-xl p-3 text-xs font-bold bg-slate-50/50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-brandBlue-500 leading-relaxed min-h-[100px]"
                  placeholder="例：高級サロンにふさわしい最高に上品な言葉遣いで。お叱りには深く寄り添いつつ、カウンセリング教育を徹底する姿勢を誠意を込めてアピールしてください。"
                  value={settings.customReviewPrompt}
                  onChange={(e) => setSettings({
                    ...settings,
                    customReviewPrompt: e.target.value
                  })}
                />
              </div>
            </div>

            {/* Sticky Actions */}
            <div className="pt-2 no-print">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-brandBlue-600 hover:bg-brandBlue-700 text-white font-extrabold text-sm py-3 px-4 rounded-xl shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-1.5"
              >
                {isLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Check className="w-4.5 h-4.5" />
                    設定をSQLiteに保存する
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* 4️⃣ SCREEN: Review Logs & AI apology list */}
        {activeTab === 'reviews' && (
          <div className="space-y-4">
            {/* Header info */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-2">
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-brandBlue-600" />
                口コミ・返信下書き管理
              </h2>
              <p className="text-[10px] text-slate-500 font-bold leading-relaxed">
                新着の低評価（★1・★2）は自動送信されず、AIが作成した謝罪文をこの画面で安全に編集・承認して送信できます。高評価（★3〜5）は自動ランダム返信ログが表示されます。
              </p>
            </div>

            {/* List */}
            <div className="space-y-3">
              {reviews.length === 0 ? (
                <div className="bg-white border border-slate-200/80 rounded-2xl py-12 px-4 text-center space-y-2">
                  <MessageSquare className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-xs font-extrabold text-slate-700">口コミ履歴がありません</p>
                </div>
              ) : (
                reviews.map((review: ReviewLog) => {
                  const isPendingApology = review.star_rating <= 2 && !review.is_auto_replied;

                  // Sync local text input state dynamically
                  if (isPendingApology && editingReplyText[review.review_id] === undefined) {
                    editingReplyText[review.review_id] = review.reply_text || '';
                  }

                  return (
                    <div
                      key={review.id}
                      className={`bg-white border rounded-2xl p-5 shadow-sm space-y-4 transition-all ${
                        isPendingApology ? 'border-rose-200 bg-rose-50/10' : 'border-slate-200/80'
                      }`}
                    >
                      {/* Customer post header */}
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-extrabold text-slate-900">{review.reviewer_name}様</span>
                            <span className="text-[9px] text-slate-400 font-bold">{new Date(review.create_time).toLocaleDateString()}</span>
                          </div>
                          {/* Star Ratings representation */}
                          <div className="flex items-center gap-0.5 mt-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <span
                                key={`star-${star}`}
                                className={`text-base leading-none select-none ${
                                  star <= review.star_rating ? 'text-amber-400' : 'text-slate-200'
                                }`}
                              >
                                ★
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Status label tag */}
                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                          isPendingApology
                            ? 'bg-rose-100 text-rose-700 border border-rose-200 animate-pulse'
                            : review.star_rating >= 3
                            ? 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                        }`}>
                          {isPendingApology ? '承認待ち (保留中)' : review.star_rating >= 3 ? '自動送信完了' : '手動送信完了'}
                        </span>
                      </div>

                      {/* Customer Review comment */}
                      <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-3.5">
                        <p className="text-xs font-bold text-slate-700 leading-relaxed">
                          「{review.comment || '(本文なし。評価のみ)'}」
                        </p>
                      </div>

                      {/* Reply Area */}
                      {isPendingApology ? (
                        /* Low star apology manual check + editor (AI draft) */
                        <div className="space-y-3.5 border-t border-dashed border-rose-200 pt-3.5">
                          <div className="flex items-center gap-1 text-[11px] font-black text-rose-700 uppercase">
                            <Sparkles className="w-4 h-4 text-rose-500 fill-rose-50" />
                            AI作成されたお詫び文下書き (編集可能)
                          </div>
                          <textarea
                            className="block w-full border border-rose-200 rounded-xl p-3.5 text-xs font-bold bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500 leading-relaxed min-h-[120px]"
                            value={editingReplyText[review.review_id] || ''}
                            onChange={(e) => {
                              setEditingReplyText({
                                ...editingReplyText,
                                [review.review_id]: e.target.value
                              });
                            }}
                          />

                          {/* 🪄 AI Rewrite Presets and custom directive input */}
                          <div className="flex flex-col gap-2.5 bg-slate-50 border border-slate-100 rounded-xl p-3">
                            <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                              <Sparkles className="w-3.5 h-3.5 text-indigo-500 fill-indigo-50" />
                              🪄 トーンを指定してAIで書き直す
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleRegenerateReply(review.review_id, 'より丁寧でフォーマルな謝罪文にしてください。')}
                                disabled={isLoading}
                                className="bg-white hover:bg-indigo-50 border border-slate-200 text-slate-700 text-[10px] font-bold py-1 px-2.5 rounded-lg transition-all active:scale-[0.97] flex items-center gap-1"
                              >
                                💼 よりフォーマル
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRegenerateReply(review.review_id, '150文字以内の非常に簡潔なお詫び文にまとめてください。')}
                                disabled={isLoading}
                                className="bg-white hover:bg-indigo-50 border border-slate-200 text-slate-700 text-[10px] font-bold py-1 px-2.5 rounded-lg transition-all active:scale-[0.97] flex items-center gap-1"
                              >
                                ⚡ 短く簡潔に
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRegenerateReply(review.review_id, 'お客様への真摯な謝罪に加え、今後の技術指導や接客カウンセリング教育を早急に徹底する改善姿勢を強調してください。')}
                                disabled={isLoading}
                                className="bg-white hover:bg-indigo-50 border border-slate-200 text-slate-700 text-[10px] font-bold py-1 px-2.5 rounded-lg transition-all active:scale-[0.97] flex items-center gap-1"
                              >
                                🔧 改善アピール
                              </button>
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <input
                                type="text"
                                id={`custom-directive-${review.review_id}`}
                                placeholder="例: もっと親しみやすく、技術面についてお詫びして"
                                className="flex-1 border border-slate-200 rounded-lg px-2.5 py-1.5 text-[10px] font-bold bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    const target = e.currentTarget;
                                    if (target.value.trim() !== '') {
                                      handleRegenerateReply(review.review_id, target.value);
                                      target.value = '';
                                    }
                                  }
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const input = document.getElementById(`custom-directive-${review.review_id}`) as HTMLInputElement;
                                  if (input && input.value.trim() !== '') {
                                    handleRegenerateReply(review.review_id, input.value);
                                    input.value = '';
                                  }
                                }}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all shadow-sm"
                              >
                                指示する
                              </button>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleSendApology(review.review_id)}
                            disabled={isLoading}
                            className="w-full bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs py-3 px-4 rounded-xl shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 no-print"
                          >
                            {isLoading ? (
                              <RefreshCw className="w-4.5 h-4.5 animate-spin" />
                            ) : (
                              <>
                                <Send className="w-4 h-4" />
                                お詫び文を承認して送信する
                              </>
                            )}
                          </button>
                        </div>
                      ) : (
                        /* Past complete replied logs represent */
                        <div className="space-y-2 border-t border-slate-100 pt-3 text-[11px] leading-relaxed">
                          <span className="font-black text-slate-400 uppercase">返信済みの文面:</span>
                          <p className="bg-slate-50/50 border border-slate-200/40 rounded-xl p-3 font-bold text-slate-600">
                            {review.reply_text || '未返信'}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </main>

      {/* 📱 Mobile Sticky Navigation Bar (Mobile-first Navigation tab switcher) */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200/80 px-4 py-2 shadow-lg flex items-center justify-around sm:hidden no-print">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl transition-all ${
            activeTab === 'dashboard' ? 'text-brandBlue-600' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <LayoutDashboard className="w-5.5 h-5.5" />
          <span className="text-[9px] font-bold">ホーム</span>
        </button>

        <button
          onClick={() => setActiveTab('photos')}
          className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl transition-all ${
            activeTab === 'photos' ? 'text-brandBlue-600' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <ImageIcon className="w-5.5 h-5.5" />
          <span className="text-[9px] font-bold">写真管理</span>
        </button>

        <button
          onClick={() => setActiveTab('reviews')}
          className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl transition-all relative ${
            activeTab === 'reviews' ? 'text-brandBlue-600' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <MessageSquare className="w-5.5 h-5.5" />
          <span className="text-[9px] font-bold">口コミ</span>
          {dashboard && dashboard.pendingReviewsCount > 0 && (
            <span className="absolute top-0.5 right-3 w-4 h-4 bg-rose-500 border border-white text-white text-[9px] font-bold rounded-full flex items-center justify-center animate-pulse">
              {dashboard.pendingReviewsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl transition-all ${
            activeTab === 'settings' ? 'text-brandBlue-600' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <Settings className="w-5.5 h-5.5" />
          <span className="text-[9px] font-bold">設定</span>
        </button>
      </nav>

      {/* 🖥️ Desktop sidebar or global side menu for wide monitors */}
      <aside className="hidden sm:flex fixed top-16 left-0 bottom-0 w-60 bg-white border-r border-slate-200/80 p-4 flex-col justify-between shadow-sm z-30 no-print">
        <div className="space-y-2">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`w-full py-3 px-4 rounded-xl font-bold text-xs flex items-center gap-3 transition-all ${
              activeTab === 'dashboard'
                ? 'bg-brandBlue-500 text-white shadow-md shadow-brandBlue-500/15'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <LayoutDashboard className="w-4.5 h-4.5" />
            ダッシュボード
          </button>

          <button
            onClick={() => setActiveTab('photos')}
            className={`w-full py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-between transition-all ${
              activeTab === 'photos'
                ? 'bg-brandBlue-500 text-white shadow-md shadow-brandBlue-500/15'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center gap-3">
              <ImageIcon className="w-4.5 h-4.5" />
              画像ストック管理
            </div>
          </button>

          <button
            onClick={() => setActiveTab('reviews')}
            className={`w-full py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-between transition-all ${
              activeTab === 'reviews'
                ? 'bg-brandBlue-500 text-white shadow-md shadow-brandBlue-500/15'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center gap-3">
              <MessageSquare className="w-4.5 h-4.5" />
              口コミ・AIお詫び文
            </div>
            {dashboard && dashboard.pendingReviewsCount > 0 && (
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                activeTab === 'reviews' ? 'bg-white text-brandBlue-600' : 'bg-rose-500 text-white animate-pulse'
              }`}>
                {dashboard.pendingReviewsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`w-full py-3 px-4 rounded-xl font-bold text-xs flex items-center gap-3 transition-all ${
              activeTab === 'settings'
                ? 'bg-brandBlue-500 text-white shadow-md shadow-brandBlue-500/15'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Settings className="w-4.5 h-4.5" />
            自動投稿＆返信設定
          </button>
        </div>

        <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 space-y-1">
          <p className="text-[10px] font-black text-slate-400 uppercase leading-none">ログインアカウント</p>
          <p className="text-xs font-black text-slate-800 leading-tight pt-1 truncate" title={currentShop.name}>{currentShop.name}</p>
          <p className="text-[9px] text-slate-400 font-bold truncate" title={currentShop.email}>{currentShop.email}</p>
        </div>
      </aside>

      {/* Adjust viewport spacer for desktop sidebar layout */}
      <style>{`
        @media (min-width: 640px) {
          main {
            margin-left: 15rem; /* Equivalent to w-60 sidebar */
            max-width: calc(100% - 15rem - 2rem);
          }
        }
      `}</style>
    </div>
  );
}
