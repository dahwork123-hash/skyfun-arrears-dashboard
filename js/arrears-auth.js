/**
 * 呆帳儀表板登入（Supabase 帳號，與星鴻工具箱共用）
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'skyfun-toolbox-auth-supabase-v1';

  let client = null;
  let session = null;
  let ready = false;

  function $(id) {
    return document.getElementById(id);
  }

  function loadStored() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    } catch {
      return null;
    }
  }

  function saveStored(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function clearStored() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function setGateMessage(msg, isError) {
    const el = $('arrears-auth-msg');
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('is-error', !!isError);
    el.style.display = msg ? 'block' : 'none';
  }

  function setGateLoading(on) {
    const btn = $('arrears-auth-submit');
    if (btn) {
      btn.disabled = on;
      btn.textContent = on ? '驗證中…' : '進入系統';
    }
  }

  function getConfig() {
    const c = window.SKYFUN_SUPABASE || {};
    return {
      url: String(c.url || '').trim().replace(/\/$/, ''),
      anonKey: String(c.anonKey || c.anon_key || '').trim()
    };
  }

  function ensureClient() {
    if (client) return client;
    const { url, anonKey } = getConfig();
    if (!url || !anonKey) throw new Error('Supabase 設定缺失');
    if (!window.supabase?.createClient) throw new Error('Supabase SDK 未載入');
    client = window.supabase.createClient(url, anonKey);
    return client;
  }

  async function rpc(name, args) {
    const sb = ensureClient();
    const { data, error } = await sb.rpc(name, args);
    if (error) throw new Error(error.message || 'Supabase 錯誤');
    return data;
  }

  function applySession(token, user) {
    session = {
      supabaseToken: token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name || user.username,
        role: user.role || 'business'
      },
      supabaseUser: user
    };
    saveStored({
      supabaseToken: token,
      user: session.user,
      supabaseUser: user
    });
  }

  function unlockApp() {
    document.body.classList.remove('arrears-auth-pending');
    $('arrears-auth-gate')?.classList.add('hidden');
    ready = true;
    const label = $('authUserLabel');
    const logoutBtn = $('authLogoutBtn');
    const meta = document.getElementById('sourceMeta');
    const name = session?.user?.name || session?.user?.username || '已登入';
    if (label && session?.user) {
      label.textContent = name;
      label.style.display = 'inline';
    }
    if (logoutBtn) logoutBtn.style.display = 'inline-block';
    if (meta) meta.textContent = `${name} · 正在同步星鴻…`;
    document.dispatchEvent(new CustomEvent('skyfun-auth-ready', { detail: { user: session.user } }));
  }

  function lockApp() {
    document.body.classList.add('arrears-auth-pending');
    $('arrears-auth-gate')?.classList.remove('hidden');
    ready = false;
    const label = $('authUserLabel');
    const logoutBtn = $('authLogoutBtn');
    if (label) label.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'none';
  }

  async function validateStored(stored) {
    const token = stored?.supabaseToken || stored?.token;
    if (!token) return false;
    const data = await rpc('toolbox_me', { p_token: token });
    if (!data?.ok || !data.user) return false;
    applySession(token, data.user);
    return true;
  }

  async function login(username, password) {
    const data = await rpc('toolbox_enter', { p_username: username, p_password: password });
    if (!data?.ok || !data.token) throw new Error(data?.error || '無法登入');
    applySession(data.token, data.user);
    unlockApp();
  }

  async function logout() {
    try {
      if (session?.supabaseToken) {
        await rpc('toolbox_logout', { p_token: session.supabaseToken });
      }
    } catch { /* ignore */ }
    clearStored();
    session = null;
    ready = false;
    lockApp();
    setGateMessage('已登出', false);
    $('arrears-auth-username')?.focus();
  }

  function bindGate() {
    $('arrears-auth-submit')?.addEventListener('click', async () => {
      const username = $('arrears-auth-username')?.value?.trim() || '';
      const password = $('arrears-auth-password')?.value || '';
      if (!username) {
        setGateMessage('請輸入帳號', true);
        return;
      }
      if (!password) {
        setGateMessage('請輸入密碼', true);
        return;
      }
      setGateLoading(true);
      setGateMessage('');
      try {
        await login(username, password);
      } catch (e) {
        setGateMessage(e.message || '登入失敗', true);
      } finally {
        setGateLoading(false);
      }
    });

    ['arrears-auth-username', 'arrears-auth-password'].forEach((id) => {
      $(id)?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') $('arrears-auth-submit')?.click();
      });
    });

    $('authLogoutBtn')?.addEventListener('click', () => logout());
  }

  async function init() {
    document.body.classList.add('arrears-auth-pending');
    bindGate();
    const stored = loadStored();
    if (stored?.supabaseToken || stored?.token) {
      setGateLoading(true);
      try {
        if (await validateStored(stored)) {
          unlockApp();
          return;
        }
        clearStored();
      } catch {
        clearStored();
      } finally {
        setGateLoading(false);
      }
    }
    lockApp();
    $('arrears-auth-username')?.focus();
  }

  window.skyfunArrearsAuth = {
    init,
    getToken: () => session?.supabaseToken || '',
    isReady: () => ready,
    logout
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
