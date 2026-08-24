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
      arrears_amount: c.amount,
      overdue_days: c.maxDays,
      skip_reason: skipReason(c),
    }));
    return apiFetch('/api/calls/dispatch', {
      method: 'POST',
      body: JSON.stringify({ cases: payload, force }),
    });
  }

  function collectionCases(rows) {
    const s = global.state.ai.dialSettings;
    return rows.filter(
      (c) => c.maxDays >= s.stageMinDays && c.maxDays <= s.stageMaxDays && !skipReason(c)
    );
  }

  function renderCollection(rows) {
    const { esc, fmt, moneyFmt } = global;
    const s = global.state.ai.dialSettings;
    const eligible = collectionCases(rows);
    const withPhone = eligible.filter((c) => phoneOfCase(c));
    const missing = eligible.length - withPhone.length;
    const results = eligible.map((c) => aiResultOf(c.caseId)).filter(Boolean);
    global.$('collection').innerHTML = `<div class="view-head"><div><h3>AI 電話催收</h3><p>${s.stageMinDays}～${s.stageMaxDays} 天案件；每案每日 ${s.dailyMaxPerCase} 次；時段 ${s.callHourStart}:00–${s.callHourEnd}:00</p></div><div class="spacer"></div><div class="ai-toolbar"><button class="btn" onclick="AiRetell.syncResults().then(()=>{render();toast('已同步 AI 結果')}).catch(e=>toast(e.message))">同步 AI 結果</button><button class="btn teal" onclick="AiRetell.dialBatch(false)">批次外撥</button><button class="btn warn" onclick="AiRetell.dialBatch(true)">強制外撥</button><button class="btn" onclick="switchView('aisettings')">調整頻率</button></div></div><div class="ai-kpis"><div class="ai-kpi"><small>AI 階段案件</small><b>${fmt(eligible.length)}</b></div><div class="ai-kpi"><small>已有手機</small><b>${fmt(withPhone.length)}</b></div><div class="ai-kpi"><small>缺手機</small><b class="down">${fmt(missing)}</b></div><div class="ai-kpi"><small>已有 AI 紀錄</small><b>${fmt(results.length)}</b></div></div><article class="panel"><div class="panel-hd"><h3>待 AI 催收清單</h3></div><div class="table-wrap"><table class="data-table"><thead><tr><th class="left">階段</th><th>天數</th><th class="left">編號</th><th class="left">承租人</th><th class="left">手機</th><th>欠款</th><th class="left">AI 進度</th><th class="left">操作</th></tr></thead><tbody>${eligible
      .sort((a, b) => b.maxDays - a.maxDays || b.amount - a.amount)
      .map((c) => {
        const st = collectionStage(c.maxDays);
        const ar = aiResultOf(c.caseId);
        const ph = phoneOfCase(c);
        return `<tr><td class="left"><span class="stage-tag s${st.id}">${st.label}</span></td><td>${fmt(c.maxDays)}</td><td class="left"><b>${esc(c.caseId)}</b></td><td class="left">${esc(c.tenant || '—')}</td><td class="left">${ph ? esc(ph) : '<span class="phone-missing">缺手機</span>'}</td><td class="amount down">${moneyFmt(c.amount)}</td><td class="left"><div class="ai-progress">${esc(ar?.ai_progress || c.aiProgress || '—')}</div></td><td class="left"><button class="btn btn-sm" onclick="AiRetell.dialOne('${esc(c.caseId)}',false)">外撥</button></td></tr>`;
      })
      .join('') || '<tr><td colspan="8" class="left">目前沒有 AI 階段案件</td></tr>'}</tbody></table></div></article>`;
  }

  function renderAiSettings() {
    const { esc } = global;
    const d = global.state.ai.dialSettings;
    global.$('aisettings').innerHTML = `<div class="view-head"><div><h3>AI 撥打頻率設定</h3><p>同步至 Cloudflare Worker</p></div><div class="spacer"></div><div class="ai-toolbar"><button class="btn" onclick="AiRetell.test()">測試連線</button><button class="btn primary" onclick="AiRetell.saveSettings()">儲存並同步</button></div></div><div class="settings-grid"><article class="settings-card"><h4>Cloudflare / Retell</h4><div class="field"><label>Worker URL</label><input id="aiMiddlewareUrl" value="${esc(global.state.ai.middlewareUrl)}"></div><div class="field"><label>from_number</label><input id="aiFromNumber" value="${esc(d.retellFromNumber || '')}"></div><div class="field"><label>Agent ID</label><input id="aiAgentId" value="${esc(d.retellAgentId || '')}"></div></article><article class="settings-card"><h4>每日撥打頻率</h4><div class="field"><label>每案每日上限</label><input id="aiDailyPerCase" type="number" min="1" value="${d.dailyMaxPerCase}"></div><div class="field"><label>全系統每日上限</label><input id="aiDailyTotal" type="number" min="1" value="${d.dailyMaxTotal}"></div><div class="field"><label>每案累計上限</label><input id="aiLifetime" type="number" min="1" value="${d.lifetimeMaxPerCase}"></div><div class="field"><label>AI 階段（天）</label><div style="display:flex;gap:8px"><input id="aiStageMin" type="number" value="${d.stageMinDays}"><span>～</span><input id="aiStageMax" type="number" value="${d.stageMaxDays}"></div></div><div class="field"><label>撥打時段</label><div style="display:flex;gap:8px"><input id="aiHourStart" type="number" value="${d.callHourStart}"><span>～</span><input id="aiHourEnd" type="number" value="${d.callHourEnd}"></div></div><label class="check-row"><input id="aiWeekdays" type="checkbox" ${d.callWeekdaysOnly ? 'checked' : ''}> 僅平日</label></article><article class="settings-card" style="grid-column:span 2"><h4>手機對照（編號=手機）</h4><div class="field"><textarea id="aiPhoneMap">${esc(Object.entries(global.state.ai.phoneMap).map(([k, v]) => `${k}=${v}`).join('\n'))}</textarea></div></article></div>`;
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
      if (c.phone) global.state.ai.phoneMap[c.caseId] = c.phone;
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
      global.toast(`連線 OK｜live=${!r.mock}`);
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
      const rows = collectionCases(global.filteredCases()).filter((c) => phoneOfCase(c));
      if (!rows.length) return global.toast('沒有可外撥案件');
      const r = await dialCases(rows, force);
      global.toast(`外撥：成功 ${r.dialed || 0} / ${rows.length}`);
      await syncAiResultsFromServer();
      global.render();
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
