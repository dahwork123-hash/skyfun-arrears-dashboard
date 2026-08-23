/** 優先讀 GitHub Pages 同 repo 的 data/latest.json；備援 Cloudflare Worker */
window.ARREARS_DATA_URL = './data/latest.json';
window.ARREARS_DATA_URL_FALLBACK = 'https://skyfun-arrears-rpa.dahwork123.workers.dev/data/latest.json';
/** 開啟頁面時每隔幾分鐘自動重新載入（0 = 關閉） */
window.AUTO_REFRESH_MINUTES = 15;
