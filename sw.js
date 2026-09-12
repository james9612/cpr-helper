const CACHE_NAME = 'nfc-cpr-aed-v14';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/metronome.js',
  './js/sw-register.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './images/aed_pads_guide.png',
  './images/aed_pads_guide.jpg',
  './audio/alert_119_aed.mp3'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // 1. HTML 導航頁面：網路優先 (Network First)，若處於飛航模式或無網路則立即退回快取的 HTML
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return networkResponse;
        })
        .catch(() => {
          // 斷網/飛航模式時，回退到快取的 HTML (忽略 URL 上的參數如 ?nfc=1 等)
          return caches.match(event.request, { ignoreSearch: true })
            .then((res) => res || caches.match('./index.html', { ignoreSearch: true }))
            .then((res) => res || caches.match('./', { ignoreSearch: true }));
        })
    );
    return;
  }

  // 2. 靜態資源 (CSS/JS/圖檔/音訊)：快取優先 (Cache First)，支援 ignoreSearch: true 忽略版本號參數
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
      if (cachedResponse) {
        // 快取命中：立即返回本地快取，背景嘗試非同步更新（有網路時）
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, networkResponse.clone());
              });
            }
          })
          .catch(() => {
            // 飛航模式或離線時，背景更新失敗屬正常現象，靜默忽略
          });
        return cachedResponse;
      }

      // 快取未命中：向網路發送請求並儲存至快取
      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      });
    })
  );
});
