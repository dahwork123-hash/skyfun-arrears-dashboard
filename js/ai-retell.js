(function (global) {
  const AI_LS_KEY = 'arrears_ai_config_v1';
  const AI_RES_KEY = 'arrears_ai_results_v1';
  const COLLECTION_STAGES = [
    { id: 1, label: '1～3 天 LINE', min: 1, max: 3 },
    { id: 2, label: '4～7 天 AI 電話', min: 4, max: 7 },
    { id: 3, label: '8～14 天 家訪', min: 8, max: 14 },
    { id: 4, label: '15+ 天 存證', min: 15, max: Infinity },
  ];

  const DEFAULT_AI_CONFIG = () => ({
    middlewareUrl: 'https://ai-collection-api.dahwork123.workers.dev',
    phoneMap: {},
    dialSettings: {
      dailyMaxPerCase: 3,
      dailyMaxTotal: 50,
      lifetimeMaxPerCase: 12,
      callHourStart: 9,
      callHourEnd: 17,
      callWeekdaysOnly: true,
      autoDispatchEnabled: false,
      stageMinDays: 4,
      stageMaxDays: 7,
      retellFromNumber: '+886277449414',
      retellAgentId: 'agent_937afc9495880b262fe9cf5bf8',
    },
  });

  function loadAiConfig() {
    try {
      const saved = JSON.parse(localStorage.getItem(AI_LS_KEY) || '{}');
      return {
        ...DEFAULT_AI_CONFIG(),
        ...saved,
        phoneMap: { ...DEFAULT_AI_CONFIG().phoneMap, ...(saved.phoneMap || {}) },
      };
    } catch {
      return DEFAULT_AI_CONFIG();
    }
  }

  function loadAiResults() {
    try {
      return JSON.parse(localStorage.getItem(AI_RES_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function saveAiConfig() {
    localStorage.setItem(AI_LS_KEY, JSON.stringify(global.state.ai));
  }

  function saveAiResults() {
    localStorage.setItem(AI_RES_KEY, JSON.stringify(global.state.aiResults));
  }

  function collectionStage(days) {
    return COLLECTION_STAGES.find((s) => days >= s.min && days <= s.max) || COLLECTION_STAGES[0];
  }

  function normalizePhone(v) {
    const s = String(v || '').replace(/[^\d+]/g, '');
    if (!s) return '';
    if (s.startsWith('+')) return s;
    if (s.startsWith('09') && s.length === 10) return '+886' + s.slice(1);
    if (s.startsWith('886')) return '+' + s;
    return s;
  }

  function phoneOfCase(c) {
    const fromMap = global.state.ai.phoneMap[c.caseId];
    if (fromMap) return normalizePhone(fromMap);
    if (c.phone) return normalizePhone(c.phone);
    return '';
  }

  function aiResultOf(caseId) {
    return global.state.aiResults[caseId] || null;
  }

  function skipReason(c, s = global.state.ai.dialSettings) {
    if (c.maxDays < s.stageMinDays || c.maxDays > s.stageMaxDays) return '不在 AI 電話階段';
    if (/勿催|已繳|結清/.test(String(c.note || '') + String(c.status || ''))) return '備註/狀態勿催';
    return '';
  }

  function apiBase() {
    return String(global.state.ai.middlewareUrl || '').replace(/\/$/, '');
  }

  async function apiFetch(path, opts = {}) {
    const url = apiBase() + path;
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      ...opts,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.reason || `HTTP ${res.status}`);
    return data;
  }

  async function syncAiSettingsFromServer() {
    if (!apiBase()) return;
    const r = await apiFetch('/api/settings');
    if (r.settings) {
      global.state.ai.dialSettings = { ...global.state.ai.dialSettings, ...r.settings };
      saveAiConfig();
    }
    return r.settings;
  }

  async function pushAiSettingsToServer() {
    if (!apiBase()) throw new Error('請填寫中間層 URL');
    const r = await apiFetch('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(global.state.ai.dialSettings),
    });
    if (r.settings) {
      global.state.ai.dialSettings = { ...global.state.ai.dialSettings, ...r.settings };
      saveAiConfig();
    }
    return r.settings;
  }

  function mergeAiIntoCaseExtras() {
    const all = global.loadAllCaseExtras?.() || {};
    let changed = false;
    for (const [caseId, r] of Object.entries(global.state.aiResults || {})) {
      if (!r || !caseId) continue;
      const prev = all[caseId] || {};
      const logs = prev.aiLogs || [];
      const entry = {
        when: r.updated_at || new Date().toISOString(),
        status: r.ai_progress || '',
        risk: r.risk || '',
        repay: r.repay_date || '',
        summary: (r.aiLogs && r.aiLogs[0]?.summary) || '',
        transcript: (r.aiLogs && r.aiLogs[0]?.transcript) || [],
      };
      if (logs[0]?.status === entry.status && logs[0]?.when === entry.when) continue;
      all[caseId] = {
        ...prev,
        aiProgress: r.ai_progress || prev.aiProgress,
        risk: r.risk || prev.risk,
        repayDate: r.repay_date || prev.repayDate,
        nextAction: r.next_action || prev.nextAction,
        aiLogs: [entry, ...logs].slice(0, 20),
      };
      changed = true;
    }
    if (changed && global.CASE_EXTRAS_KEY) {
      localStorage.setItem(global.CASE_EXTRAS_KEY, JSON.stringify(all));
      global.state.cases.forEach((c) => Object.assign(c, global.enrichCase(c)));
    }
  }

  async function syncAiResultsFromServer() {
    if (!apiBase()) return;
    const r = await apiFetch('/api/calls/results');
    if (r.results) {
      global.state.aiResults = { ...global.state.aiResults, ...r.results };
      saveAiResults();
      mergeAiIntoCaseExtras();
    }
    return r.results;
  }

  async function dialCases(cases, force = false) {
    if (!apiBase()) throw new Error('請填寫中間層 URL');
    const payload = cases.map((c) => ({
      match_id: c.caseId,
      to_number: phoneOfCase(c),
      tenant_name: c.tenant || '',
      rent_address: c.address || '',
      arrears_amount: c.amount,
      overdue_days: c.maxDays,
      skip_reason: skipReason(c),
    }));
    return apiFetch('/api/calls/dispatch', {
      method: 'POST',
      body: JSON.stringify({ cases: payload, force }),
    });
  }

  function fillTestForm(data) {
    const $ = global.$;
    if (!$) return;
    if (data.tenant != null && $('aiTestTenant')) $('aiTestTenant').value = data.tenant;
    if (data.phone != null && $('aiTestPhone')) $('aiTestPhone').value = data.phone;
    if (data.amount != null && $('aiTestAmount')) $('aiTestAmount').value = data.amount;
    if (data.days != null && $('aiTestDays')) $('aiTestDays').value = data.days;
    if (data.address != null && $('aiTestAddress')) $('aiTestAddress').value = data.address;
    if (data.note != null && $('aiTestNote')) $('aiTestNote').value = data.note;
  }

  function renderTestDialCard(esc) {
    const saved = global.state.ai.testDial || {};
    const last = global.state.ai.testDialLast || {};
    const resultText = esc(formatTestCallResult(last));
    return `<article class="settings-card" style="grid-column:span 2"><h4>測試外撥（手動輸入）</h4><p class="field-hint">不需媒合編號。請填寫<strong>承租人、租賃地址、欠款金額</strong>，AI 會確認姓名與地址並說出欠款。</p><div class="test-dial-grid"><div class="field"><label>房客手機</label><input id="aiTestPhone" value="${esc(saved.phone || '')}" placeholder="09xxxxxxxx"></div><div class="field"><label>承租人</label><input id="aiTestTenant" value="${esc(saved.tenant || '')}" placeholder="房客姓名"></div><div class="field"><label>欠款金額</label><input id="aiTestAmount" type="number" min="0" value="${esc(saved.amount ?? '')}" placeholder="元"></div><div class="field"><label>欠租天數</label><input id="aiTestDays" type="number" min="1" value="${esc(saved.days ?? '')}" placeholder="天"></div><div class="field" style="grid-column:span 2"><label>租賃地址</label><input id="aiTestAddress" value="${esc(saved.address || '')}" placeholder="例：桃園市…"></div></div><div class="field" style="margin-top:12px"><label>測試備註（選填）</label><input id="aiTestNote" value="${esc(saved.note || '')}" placeholder="例：QA 測試，非正式催收"></div><div class="field" style="margin-top:12px"><label>Retell 通話結果</label><textarea id="aiTestCallResult" class="test-call-result" readonly rows="10" placeholder="外撥後會自動顯示 Retell 回傳的 AI 進度、摘要與逐字稿">${resultText}</textarea></div><div class="ai-toolbar" style="margin-top:14px"><button class="btn" type="button" onclick="AiRetell.syncRetellPrompt()">同步 Retell 腳本</button><button class="btn" type="button" onclick="AiRetell.refreshTestCallResult()">查詢通話結果</button><button class="btn teal" type="button" onclick="AiRetell.dialTest()">測試外撥</button></div></article>`;
  }

  function readTestDialForm() {
    const $ = global.$;
    if (!$) return null;
    return {
      phone: $('aiTestPhone')?.value?.trim() || '',
      tenant: $('aiTestTenant')?.value?.trim() || '',
      amount: Number($('aiTestAmount')?.value) || 0,
      days: Math.max(1, Number($('aiTestDays')?.value) || 1),
      address: $('aiTestAddress')?.value?.trim() || '',
      note: $('aiTestNote')?.value?.trim() || '',
    };
  }

  function saveTestDialForm() {
    const form = readTestDialForm();
    if (!form || !global.state?.ai) return;
    global.state.ai.testDial = form;
    saveAiConfig();
  }

  function saveTestDialLast(patch) {
    if (!global.state?.ai) return;
    global.state.ai.testDialLast = {
      ...(global.state.ai.testDialLast || {}),
      ...patch,
      at: patch.at || new Date().toISOString(),
    };
    saveAiConfig();
  }

  function formatTestCallResult(last) {
    if (!last?.matchId && !last?.callId && !last?.result) {
      return '尚無測試通話結果。外撥完成後會自動查詢 Retell 回傳。';
    }
    const r = last.result;
    if (!r) {
      const lines = [];
      if (last.matchId) lines.push(`測試編號：${last.matchId}`);
      if (last.callId) lines.push(`Call ID：${last.callId}`);
      if (last.pollStatus) lines.push(`查詢狀態：${last.pollStatus}`);
      return lines.join('\n');
    }
    const log = r.aiLogs?.[0] || {};
    return log.summary || r.summary || r.ai_progress || '—';
  }

  function updateTestCallResultUi() {
    const el = global.$?.('aiTestCallResult');
    if (!el) return;
    el.value = formatTestCallResult(global.state.ai?.testDialLast);
  }

  async function fetchTestCallResult(matchId, callId) {
    const qs = new URLSearchParams();
    if (callId) qs.set("call_id", callId);
    qs.set("pull", "1");
    return apiFetch(`/api/calls/results/${encodeURIComponent(matchId)}?${qs.toString()}`);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function pollTestCallResult(matchId, callId, opts = {}) {
    const maxAttempts = opts.maxAttempts ?? 36;
    const intervalMs = opts.intervalMs ?? 5000;
    saveTestDialLast({ matchId, callId, pollStatus: '等待 Retell 回傳…', result: null });
    updateTestCallResultUi();

    for (let i = 0; i < maxAttempts; i++) {
      if (i > 0) await sleep(intervalMs);
      try {
        const r = await fetchTestCallResult(matchId, callId);
        const result = r.result;
        const log = result?.aiLogs?.[0];
        const hasResult = Boolean(result?.updated_at && (result.ai_progress || log?.summary));
        const callMatches = !callId || !log?.call_id || log.call_id === callId;
        if (hasResult && callMatches) {
          global.state.aiResults = { ...global.state.aiResults, [matchId]: result };
          saveAiResults();
          saveTestDialLast({
            matchId,
            callId: log?.call_id || callId,
            pollStatus: '已收到 Retell 結果',
            result,
          });
          updateTestCallResultUi();
          return result;
        }
      } catch (err) {
        const msg = String(err.message || err);
        if (!/404|not found|202|尚未結束/i.test(msg)) {
          saveTestDialLast({ matchId, callId, pollStatus: `查詢失敗：${msg}`, result: null });
          updateTestCallResultUi();
          throw err;
        }
      }
      saveTestDialLast({
        matchId,
        callId,
        pollStatus: `等待中…（${i + 1}/${maxAttempts}，約每 ${intervalMs / 1000} 秒查一次）`,
        result: null,
      });
      updateTestCallResultUi();
    }

    saveTestDialLast({
      matchId,
      callId,
      pollStatus: '逾時：通話可能尚未結束，或 Webhook 尚未回傳。可稍後再按「查詢通話結果」。',
      result: null,
    });
    updateTestCallResultUi();
    return null;
  }

  function makeTestMatchId(phone) {
    const digits = String(phone || '').replace(/\D/g, '').slice(-10) || 'manual';
    return `TEST-${digits}-${Date.now().toString(36).slice(-4)}`;
  }

  async function dialTestPayload(form, force = true) {
    if (!apiBase()) throw new Error('請填寫中間層 URL');
    const phone = normalizePhone(form.phone);
    if (!phone) throw new Error('請輸入房客手機');
    if (!String(form.tenant || '').trim()) throw new Error('請輸入承租人姓名（AI 會確認姓名）');
    if (!String(form.address || '').trim()) throw new Error('請輸入租賃地址（AI 會完整唸出並確認）');
    if (!(Number(form.amount) > 0)) throw new Error('請輸入欠款金額（AI 會說出金額）');
    const matchId = makeTestMatchId(phone);
    return apiFetch('/api/calls/dispatch', {
      method: 'POST',
      body: JSON.stringify({
        cases: [
          {
            match_id: matchId,
            to_number: phone,
            tenant_name: form.tenant || '',
            rent_address: form.address || '',
            arrears_amount: form.amount,
            overdue_days: form.days,
            skip_reason: '',
          },
        ],
        force,
      }),
    }).then((r) => ({ ...r, matchId }));
  }

  function collectionCases(rows) {
    const s = global.state.ai.dialSettings;
    return rows.filter(
      (c) => c.maxDays >= s.stageMinDays && c.maxDays <= s.stageMaxDays && !skipReason(c)
    );
  }

  function isAutoDialOn() {
    return Boolean(global.state?.ai?.dialSettings?.autoDispatchEnabled);
  }

  function autoDialBannerHtml() {
    const on = isAutoDialOn();
    return `<div class="auto-dial-banner ${on ? 'on' : 'off'}"><div><b>自動撥號：${on ? '已開啟' : '已關閉'}</b><br><span>${on ? '系統可依設定時段自動／批次外撥。測試完成再開啟較安全。' : '目前僅允許「測試外撥」與單案「外撥」。批次／自動撥號已停用。'}</span></div><div class="spacer"></div><button class="btn ${on ? 'danger' : 'success'}" type="button" onclick="AiRetell.toggleAutoDial()">${on ? '關閉自動撥號' : '開啟自動撥號'}</button></div>`;
  }

  function renderCollection(rows) {
    if (!global.state?.ai) global.AiRetell?.init?.();
    const esc = global.esc || ((s) => String(s ?? ''));
    const fmt = global.fmt || ((n) => Number(n || 0).toLocaleString('zh-TW'));
    const moneyFmt = global.moneyFmt || ((n) => '$' + fmt(Math.round(Number(n || 0))));
    const $ = global.$;
    if (!$ || !global.state?.ai) {
      if ($('collection')) $('collection').innerHTML = '<article class="panel"><div class="panel-body">AI 模組尚未就緒，請重新整理頁面。</div></article>';
      return;
    }
    const s = global.state.ai.dialSettings;
    const autoOn = isAutoDialOn();
    const eligible = collectionCases(rows);
    const withPhone = eligible.filter((c) => phoneOfCase(c));
    const missing = eligible.length - withPhone.length;
    const results = eligible.map((c) => aiResultOf(c.caseId)).filter(Boolean);
    const batchBtns = autoOn
      ? `<button class="btn teal" onclick="AiRetell.dialBatch(false)">批次外撥</button><button class="btn warn" onclick="AiRetell.dialBatch(true)">強制外撥</button>`
      : `<button class="btn" disabled title="請先開啟自動撥號">批次外撥（已鎖定）</button>`;
    global.$('collection').innerHTML = `${autoDialBannerHtml()}<div class="view-head"><div><h3>AI 電話催收</h3><p>${s.stageMinDays}～${s.stageMaxDays} 天案件；每案每日 ${s.dailyMaxPerCase} 次；時段 ${s.callHourStart}:00–${s.callHourEnd}:00</p></div><div class="spacer"></div><div class="ai-toolbar"><button class="btn" onclick="AiRetell.syncResults().then(()=>{render();toast('已同步 AI 結果')}).catch(e=>toast(e.message))">同步 AI 結果</button>${batchBtns}<button class="btn" onclick="switchView('aisettings')">調整頻率</button></div></div><div class="ai-kpis"><div class="ai-kpi"><small>AI 階段案件</small><b>${fmt(eligible.length)}</b></div><div class="ai-kpi"><small>已有手機</small><b>${fmt(withPhone.length)}</b></div><div class="ai-kpi"><small>缺手機</small><b class="down">${fmt(missing)}</b></div><div class="ai-kpi"><small>已有 AI 紀錄</small><b>${fmt(results.length)}</b></div></div><article class="panel"><div class="panel-hd"><h3>待 AI 催收清單</h3></div><div class="table-wrap"><table class="data-table"><thead><tr><th class="left">階段</th><th>天數</th><th class="left">編號</th><th class="left">承租人</th><th class="left">手機</th><th>欠款</th><th class="left">AI 進度</th><th class="left">操作</th></tr></thead><tbody>${eligible
      .sort((a, b) => b.maxDays - a.maxDays || b.amount - a.amount)
      .map((c) => {
        const st = collectionStage(c.maxDays);
        const ar = aiResultOf(c.caseId);
        const ph = phoneOfCase(c);
        return `<tr><td class="left"><span class="stage-tag s${st.id}">${st.label}</span></td><td>${fmt(c.maxDays)}</td><td class="left"><b>${esc(c.caseId)}</b></td><td class="left">${esc(c.tenant || '—')}</td><td class="left">${ph ? esc(ph) : '<span class="phone-missing">缺手機</span>'}</td><td class="amount down">${moneyFmt(c.amount)}</td><td class="left"><div class="ai-progress">${esc(ar?.ai_progress || '—')}</div></td><td class="left"><button class="btn btn-sm" onclick="AiRetell.dialOne('${esc(c.caseId)}',false)">外撥</button></td></tr>`;
      })
      .join('') || '<tr><td colspan="8" class="left">目前沒有 AI 階段案件</td></tr>'}</tbody></table></div></article>`;
  }

  function renderAiSettings() {
    if (!global.state?.ai) global.AiRetell?.init?.();
    const esc = global.esc || ((s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
    const $ = global.$;
    if (!$ || !global.state?.ai) {
      if ($('aisettings')) $('aisettings').innerHTML = '<article class="panel"><div class="panel-body">AI 模組尚未就緒，請重新整理頁面。</div></article>';
      return;
    }
    const d = global.state.ai.dialSettings;
    global.$('aisettings').innerHTML = `<div class="view-head"><div><h3>AI 撥打頻率設定</h3><p>同步至 Cloudflare Worker</p></div><div class="spacer"></div><div class="ai-toolbar"><button class="btn" onclick="AiRetell.test()">測試連線</button><button class="btn primary" onclick="AiRetell.saveSettings()">儲存並同步</button></div></div>${autoDialBannerHtml()}<div class="settings-grid">${renderTestDialCard(esc)}<article class="settings-card"><h4>Cloudflare / Retell</h4><div class="field"><label>Worker URL</label><input id="aiMiddlewareUrl" value="${esc(global.state.ai.middlewareUrl)}"></div><div class="field"><label>from_number</label><input id="aiFromNumber" value="${esc(d.retellFromNumber || '')}"></div><div class="field"><label>Agent ID</label><input id="aiAgentId" value="${esc(d.retellAgentId || '')}"></div></article><article class="settings-card"><h4>每日撥打頻率</h4><div class="field"><label>每案每日上限</label><input id="aiDailyPerCase" type="number" min="1" value="${d.dailyMaxPerCase}"></div><div class="field"><label>全系統每日上限</label><input id="aiDailyTotal" type="number" min="1" value="${d.dailyMaxTotal}"></div><div class="field"><label>每案累計上限</label><input id="aiLifetime" type="number" min="1" value="${d.lifetimeMaxPerCase}"></div><div class="field"><label>AI 階段（天）</label><div style="display:flex;gap:8px"><input id="aiStageMin" type="number" value="${d.stageMinDays}"><span>～</span><input id="aiStageMax" type="number" value="${d.stageMaxDays}"></div></div><div class="field"><label>撥打時段</label><div style="display:flex;gap:8px"><input id="aiHourStart" type="number" value="${d.callHourStart}"><span>～</span><input id="aiHourEnd" type="number" value="${d.callHourEnd}"></div></div><label class="check-row"><input id="aiWeekdays" type="checkbox" ${d.callWeekdaysOnly ? 'checked' : ''}> 僅平日</label></article><article class="settings-card" style="grid-column:span 2"><h4>手機對照（編號=手機）</h4><p class="field-hint">同步載入時會自動從星鴻房客資料寫入；亦可手動覆寫。</p><div class="field"><textarea id="aiPhoneMap">${esc(Object.entries(global.state.ai.phoneMap).map(([k, v]) => `${k}=${v}`).join('\n'))}</textarea></div></article></div>`;
  }

  function readAiSettingsForm() {
    global.state.ai.middlewareUrl = global.$('aiMiddlewareUrl').value.trim();
    global.state.ai.dialSettings = {
      ...global.state.ai.dialSettings,
      retellFromNumber: global.$('aiFromNumber').value.trim(),
      retellAgentId: global.$('aiAgentId').value.trim(),
      dailyMaxPerCase: Math.max(1, +(global.$('aiDailyPerCase').value || 3)),
      dailyMaxTotal: Math.max(1, +(global.$('aiDailyTotal').value || 50)),
      lifetimeMaxPerCase: Math.max(1, +(global.$('aiLifetime').value || 12)),
      stageMinDays: Math.max(1, +(global.$('aiStageMin').value || 4)),
      stageMaxDays: Math.max(+(global.$('aiStageMin').value || 4), +(global.$('aiStageMax').value || 7)),
      callHourStart: Math.min(23, Math.max(0, +(global.$('aiHourStart').value || 9))),
      callHourEnd: Math.min(24, Math.max(1, +(global.$('aiHourEnd').value || 17))),
      callWeekdaysOnly: global.$('aiWeekdays').checked,
      autoDispatchEnabled: Boolean(global.state.ai.dialSettings.autoDispatchEnabled),
    };
    const map = {};
    (global.$('aiPhoneMap').value || '').split(/\r?\n/).forEach((line) => {
      const m = line.trim().match(/^([^=]+)=(.+)$/);
      if (m) map[m[1].trim()] = m[2].trim();
    });
    global.state.ai.phoneMap = map;
    saveAiConfig();
  }

  function ingestPhones(cases) {
    if (!global.state.ai) global.state.ai = loadAiConfig();
    if (!global.state.ai.phoneMap) global.state.ai.phoneMap = {};
    (cases || []).forEach((c) => {
      const ph = c.phone || c.tenantPhone;
      if (ph) global.state.ai.phoneMap[c.caseId] = ph;
    });
    try {
      saveAiConfig();
    } catch (err) {
      console.warn('saveAiConfig failed', err);
    }
  }

  global.AiRetell = {
    init() {
      if (!global.state) return;
      if (!global.state.ai) global.state.ai = loadAiConfig();
      if (!global.state.aiResults) global.state.aiResults = loadAiResults();
    },
    ingestPhones,
    phoneOfCase,
    normalizePhone,
    renderCollection,
    renderAiSettings,
    syncSettings: syncAiSettingsFromServer,
    syncResults: syncAiResultsFromServer,
    async saveSettings() {
      readAiSettingsForm();
      await pushAiSettingsToServer();
      global.render();
      global.toast('設定已同步');
    },
    async test() {
      readAiSettingsForm();
      const r = await apiFetch('/health');
      global.toast(`連線 OK｜live=${!r.mock}｜自動撥號=${r.autoDispatchEnabled ? '開' : '關'}`);
    },
    async syncRetellPrompt() {
      try {
        readAiSettingsForm();
        const r = await apiFetch('/api/retell/sync-prompt', { method: 'POST', body: '{}' });
        const voice = r.voice?.voice_name || r.voice?.voice_id || '';
        const model = r.llm_model || '';
        const hint = [model && `模型 ${model}`, voice && `語音 ${voice}`].filter(Boolean).join('｜')
          || r.conversation_flow_id
          || r.llm_id
          || r.agent_id
          || 'OK';
        global.toast(`Retell 腳本已同步｜${hint}`);
      } catch (err) {
        global.toast(err.message || '同步 Retell 腳本失敗');
      }
    },
    async dialOne(caseId, force) {
      const c = global.state.cases.find((x) => x.caseId === caseId);
      if (!c) return global.toast('找不到案件');
      const r = await dialCases([c], force);
      const one = r.results?.[0];
      if (one?.ok) global.toast(`已送出外撥 ${caseId}`);
      else global.toast(one?.reason || r.error || '外撥失敗');
    },
    async dialBatch(force) {
      if (!isAutoDialOn()) {
        return global.toast('自動撥號已關閉。請先開啟自動撥號，或改用單案／測試外撥。');
      }
      const rows = collectionCases(global.filteredCases()).filter((c) => phoneOfCase(c));
      if (!rows.length) return global.toast('沒有可外撥案件');
      if (!global.confirm(`確定要批次外撥 ${rows.length} 通？`)) return;
      const r = await dialCases(rows, force);
      global.toast(`外撥：成功 ${r.dialed || 0} / ${rows.length}`);
      await syncAiResultsFromServer();
      global.render();
    },
    async toggleAutoDial() {
      try {
        if (!global.state?.ai?.dialSettings) global.AiRetell.init();
        const next = !isAutoDialOn();
        if (next && !global.confirm('確定開啟自動撥號？開啟後可使用批次外撥，請確認測試已完成。')) {
          return;
        }
        global.state.ai.dialSettings.autoDispatchEnabled = next;
        saveAiConfig();
        await pushAiSettingsToServer();
        global.render();
        global.toast(next ? '已開啟自動撥號' : '已關閉自動撥號');
      } catch (err) {
        global.toast(err.message || '切換失敗');
      }
    },
    async dialTest() {
      try {
        readAiSettingsForm();
        const form = readTestDialForm();
        saveTestDialForm();
        const r = await dialTestPayload(form, true);
        const one = r.results?.[0];
        if (one?.ok) {
          const matchId = r.matchId || one.match_id;
          const callId = one.call_id || '';
          saveTestDialLast({
            matchId,
            callId,
            pollStatus: '外撥已送出，等待 Retell 回傳…',
            result: null,
          });
          updateTestCallResultUi();
          global.toast(`測試外撥已送出｜${form.phone}`);
          pollTestCallResult(matchId, callId).then((result) => {
            if (result) global.toast('已收到 Retell 通話結果');
          }).catch((err) => global.toast(err.message || '查詢通話結果失敗'));
        } else {
          global.toast(one?.reason || r.error || '外撥失敗');
        }
      } catch (err) {
        global.toast(err.message || '外撥失敗');
      }
    },
    async refreshTestCallResult() {
      try {
        readAiSettingsForm();
        const last = global.state.ai?.testDialLast;
        if (!last?.matchId) return global.toast('尚無測試編號，請先執行測試外撥');
        saveTestDialLast({ pollStatus: '查詢中…', result: null });
        updateTestCallResultUi();
        const result = await pollTestCallResult(last.matchId, last.callId, { maxAttempts: 1, intervalMs: 0 });
        if (result) global.toast('已更新 Retell 通話結果');
        else global.toast('尚未收到 Retell 回傳，請稍後再查');
      } catch (err) {
        global.toast(err.message || '查詢通話結果失敗');
      }
    },
    onSwitchView(view) {
      if (view === 'collection') {
        return syncAiResultsFromServer().then(() => global.render()).catch(() => global.render());
      }
      if (view === 'aisettings') {
        return syncAiSettingsFromServer().then(() => global.render()).catch(() => global.render());
      }
    },
  };
})(window);
