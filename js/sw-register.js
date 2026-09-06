// 註冊 Service Worker 並監聽網路狀態
(function() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => {
          console.log('[PWA] Service Worker 註冊成功，範疇:', reg.scope);
        })
        .catch((err) => {
          console.warn('[PWA] Service Worker 註冊失敗:', err);
        });
    });
  }

  // 監聽連線狀態
  function updateNetworkStatus() {
    const isOnline = navigator.onLine;
    const badge = document.getElementById('offline-badge');
    if (badge) {
      if (!isOnline) {
        badge.classList.remove('hidden');
        badge.textContent = '離線模式 (PWA 運作中)';
      } else {
        badge.classList.add('hidden');
      }
    }
  }

  window.addEventListener('online', updateNetworkStatus);
  window.addEventListener('offline', updateNetworkStatus);
  document.addEventListener('DOMContentLoaded', updateNetworkStatus);
})();
