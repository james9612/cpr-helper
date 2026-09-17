const CACHE_NAME = 'nfc-cpr-aed-v28';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/metronome.js',
  './js/sw-register.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './images/org_emblem_hq.png',
  './images/org_logo_dark_transparent.png',
  './images/aed_pads_guide.png',
  './images/aed_pads_guide.jpg',
  './audio/alert_119_aed.mp3',
  './audio/silence.wav'
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
        // 行動裝置 (Android Chrome / Safari) 播放音訊時常發送 Range 請求，需切片回傳 206 Partial Content
        const rangeHeader = event.request.headers.get('range');
        if (rangeHeader) {
          return cachedResponse.arrayBuffer().then((buffer) => {
            const bytesMatch = rangeHeader.match(/bytes=(\d+)-(\d*)/);
            if (bytesMatch) {
              const start = parseInt(bytesMatch[1], 10);
              const end = bytesMatch[2] ? parseInt(bytesMatch[2], 10) : buffer.byteLength - 1;
              const sliced = buffer.slice(start, end + 1);
              const headers = new Headers(cachedResponse.headers);
              headers.set('Content-Range', `bytes ${start}-${end}/${buffer.byteLength}`);
              headers.set('Content-Length', String(sliced.byteLength));
              headers.set('Accept-Ranges', 'bytes');
              if (event.request.url.includes('.mp3')) {
                headers.set('Content-Type', 'audio/mpeg');
              } else if (event.request.url.includes('.wav')) {
                headers.set('Content-Type', 'audio/wav');
              } else if (!headers.has('Content-Type')) {
                headers.set('Content-Type', 'audio/mpeg');
              }
              return new Response(sliced, {
                status: 206,
                statusText: 'Partial Content',
                headers: headers
              });
            }
            return cachedResponse;
          });
        }

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
