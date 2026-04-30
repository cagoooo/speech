// 🎤 國語演說訓練平台 Service Worker
// 策略：HTML network-first / 靜態資源 cache-first / API 完全跳過
// 更新流程：不自動 skipWaiting，等主頁送 SKIP_WAITING 訊息才接管
const VERSION = 'v2.8.1.3-2026-04-30';
const CACHE_NAME = `speech-${VERSION}`;
const PRECACHE = [
  './',
  './index.html',
  './favicon.ico',
  './favicon.png',
  './icon-192.png',
  './icon-512.png',
  './og-image.png'
];

// ============ 安裝：預先快取核心檔案 ============
self.addEventListener('install', (e) => {
  // 注意：不呼叫 self.skipWaiting()，等使用者按「立即更新」才接管
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(PRECACHE.map(url => cache.add(url).catch(() => {})))
    )
  );
});

// ============ 啟用：清掉舊版本快取 + 接管現有頁面 ============
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ============ 訊息：接收主頁的「立即更新」指令 ============
self.addEventListener('message', (e) => {
  if (!e.data) return;
  if (e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (e.data.type === 'GET_VERSION' && e.ports && e.ports[0]) {
    e.ports[0].postMessage({ version: VERSION });
  }
});

// ============ Fetch 攔截 ============
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // 🚫 完全跳過第三方 API / 雲端服務（不該被 SW 介入）
  const skipHosts = [
    'supabase.co', 'supabase.in',
    'googleapis.com', 'google.com', 'googleusercontent.com',
    'gstatic.com', 'accounts.google.com',
    'generativelanguage.googleapis.com',
    'cdn.jsdelivr.net', 'unpkg.com'
  ];
  if (skipHosts.some(h => url.host.includes(h))) return;

  // 📄 HTML / 導覽請求：network-first（總是嘗試最新版，斷網才用 cache）
  const isHTML = req.mode === 'navigate'
    || (req.headers.get('accept') || '').includes('text/html')
    || url.pathname.endsWith('.html')
    || url.pathname === '/' || url.pathname.endsWith('/');
  if (isHTML) {
    e.respondWith(
      fetch(req)
        .then(res => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // 🖼️ 其他靜態資源：cache-first（圖示、icon 等）
  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (res && res.status === 200 && res.type !== 'opaque') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached); // 網路掛了還是回快取（如果有）
    })
  );
});
