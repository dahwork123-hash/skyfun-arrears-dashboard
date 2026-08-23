/** Cloudflare Worker 資料 API（防火牆：僅允許儀表板網域或 READ token） */
window.ARREARS_DATA_URL = 'https://skyfun-arrears-rpa.dahwork123.workers.dev/data/latest.json';
window.ARREARS_DATA_URL_FALLBACK = '';
/** 選填：與 Worker secret DATA_READ_SECRET 相同（自動帶入，使用者無需輸入） */
window.ARREARS_READ_TOKEN = '';
/** 開啟頁面時每隔幾分鐘自動重新載入（0 = 關閉） */
window.AUTO_REFRESH_MINUTES = 15;
/** 存證信函字型／郵局範本資源（由工具箱 Pages 提供） */
window.TOOLBOX_PAGES_URL = 'https://dahwork123-hash.github.io/skyfun-toolbox-pages/';
