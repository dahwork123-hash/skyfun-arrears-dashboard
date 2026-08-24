/** 受保護的 Cloudflare Worker 資料 API（需登入後帶 session） */
window.ARREARS_DATA_URL = 'https://skyfun-arrears-rpa.dahwork123.workers.dev/data/latest.json';
window.ARREARS_SYNC_URL = 'https://skyfun-arrears-rpa.dahwork123.workers.dev/sync';
/** Worker 失敗時改載 GitHub Pages 已發布快取 */
window.ARREARS_DATA_URL_FALLBACK = 'https://dahwork123-hash.github.io/skyfun-arrears-dashboard/data/latest.json';
/** 手動同步星鴻 RPA 最長等待秒數（逾時仍會載入快取） */
window.ARREARS_SYNC_TIMEOUT_SEC = 90;
/** 開啟頁面時每隔幾分鐘自動重新載入（0 = 關閉） */
window.AUTO_REFRESH_MINUTES = 15;
/** 存證信函字型／郵局範本資源（由工具箱 Pages 提供） */
window.TOOLBOX_PAGES_URL = 'https://dahwork123-hash.github.io/skyfun-toolbox-pages/';
