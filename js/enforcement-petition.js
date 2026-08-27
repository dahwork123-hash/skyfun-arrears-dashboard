/**
 * 欠租強制執行聲請狀（查封屋內動產）套版產生器
 * 填寫欄位 → 產生 PDF 下載列印（字型與存證信函相同之標楷體）
 */
(function () {
    'use strict';

    const PDF_INCH = 72;
    const PAGE_W = 595.28;
    const PAGE_H = 841.89;
    const MARGIN_L = 56;
    const MARGIN_R = 56;
    const MARGIN_T = 52;
    const MARGIN_B = 52;
    const LINE_H = 18;
    const FONT_PATH = 'assets/lal/TW-Kai-98_1.ttf';
    const FONT_MANIFEST = 'js/lal-font/manifest.js';
    const FONT_PART_PREFIX = 'js/lal-font/part-';

    let bound = false;
    let fontBytesPromise = null;

    function $(id) { return document.getElementById(id); }

    function val(id) {
        return String($(id)?.value || '').trim();
    }

    function num(id) {
        const n = Number(String($(id)?.value || '').replace(/[^\d.-]/g, ''));
        return Number.isFinite(n) ? n : 0;
    }

    function esc(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function toolboxAssetBase() {
        const explicit = window.TOOLBOX_ASSET_BASE;
        if (explicit) return String(explicit).replace(/\/?$/, '/');
        // Pages 常因未發布而 404；字型改走 jsDelivr（倉庫 main）
        return 'https://cdn.jsdelivr.net/gh/dahwork123-hash/skyfun-toolbox-pages@main/';
    }

    function resolveAssetUrl(path) {
        const clean = path.replace(/^\.\//, '');
        if (/^(assets\/lal\/|js\/lal-font\/)/.test(clean)) {
            return toolboxAssetBase() + clean;
        }
        return new URL(clean, document.baseURI).href;
    }

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.onload = () => resolve();
            s.onerror = () => reject(new Error('無法載入：' + src));
            document.head.appendChild(s);
        });
    }

    function base64ToArrayBuffer(b64) {
        const bin = atob(b64);
        const buf = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        return buf.buffer;
    }

    async function loadEmbeddedFontBytes() {
        const status = $('ep-status');
        if (!window.LAL_FONT_PART_COUNT) {
            await loadScript(resolveAssetUrl(FONT_MANIFEST));
        }
        const total = window.LAL_FONT_PART_COUNT;
        if (!total) throw new Error('找不到內嵌字型（js/lal-font）');
        window.LAL_FONT_PARTS = window.LAL_FONT_PARTS || [];
        for (let i = window.LAL_FONT_PARTS.length; i < total; i++) {
            if (status) status.textContent = `載入字型中…（${i + 1}/${total}）`;
            await loadScript(resolveAssetUrl(FONT_PART_PREFIX + String(i).padStart(3, '0') + '.js'));
        }
        return base64ToArrayBuffer(window.LAL_FONT_PARTS.join(''));
    }

    async function getFontBytes() {
        if (!fontBytesPromise) {
            fontBytesPromise = (async () => {
                // TTF 在 CDN 可能被擋（403）；優先用內嵌分片（js/lal-font）
                try {
                    return await loadEmbeddedFontBytes();
                } catch (embedErr) {
                    try {
                        const r = await fetch(resolveAssetUrl(FONT_PATH));
                        if (r.ok) return r.arrayBuffer();
                    } catch { /* ignore */ }
                    fontBytesPromise = null;
                    throw embedErr;
                }
            })();
        }
        return fontBytesPromise;
    }

    function amountInFormalText(amount) {
        const n = Math.round(Number(amount) || 0);
        if (n >= 10000) {
            const wan = Math.floor(n / 10000);
            const rest = n % 10000;
            if (!rest) return `${wan} 萬元整`;
            return `${wan} 萬 ${rest} 元整`;
        }
        return `${formatMoney(n)} 元整`;
    }

    function buildExecTitle(d) {
        return `${d.notaryOffice}${d.notaryRef}公證書（債務人願逕受強制執行）。`;
    }

    function extractNotaryOfficeName(full) {
        const s = String(full || '').trim();
        const m = s.match(/民間公證人(.+)$/);
        if (m) return m[1];
        return s.replace(/^臺灣[^所]*地方法院所屬民間公證人/, '').replace(/^民間公證人/, '') || s;
    }

    function buildReasonParagraphs(d) {
        const leaseLabel = d.leaseType === '轉租' ? '房屋租賃（轉租）' : '房屋租賃';
        const contractDate = d.contractY
            ? `民國 ${d.contractY} 年 ${d.contractM || '　'} 月 ${d.contractD || '　'} 日`
            : '民國　　　年　　月　　日';
        const notaryRef = d.notaryRef || '　　　年度　　　字第　　　號';
        const monthlyRentCN = d.monthlyRent ? amountToChineseMoney(d.monthlyRent) : '　　　　　';
        const arrearsStart = d.arrearsStartY
            ? `民國 ${d.arrearsStartY} 年 ${d.arrearsStartM || '　'} 月`
            : '民國　　　年　　月';
        const arrearsEnd = d.arrearsEndY
            ? `民國 ${d.arrearsEndY} 年 ${d.arrearsEndM || '　'} 月 ${d.arrearsEndD || '　'} 日`
            : '民國　　　年　　月　　日';
        return [
            `一、聲請人與債務人於${contractDate}簽訂${leaseLabel}契約，並經臺灣${d.court}地方法院所屬民間公證人${d.notaryOfficeName}辦理公證（${notaryRef}），債務人並於公證書中約定願逕受強制執行。`,
            `二、依契約約定，債務人應按月給付租金新臺幣${monthlyRentCN}。`,
            `三、惟債務人自${arrearsStart}起未依約給付租金，截至${arrearsEnd}止，共積欠租金新臺幣${d.amountCN}（詳如附件「欠租明細表」）。`,
            '四、聲請人已多次以電話、LINE、書面催告（如附件）催討，惟債務人迄今仍未履行給付義務。',
            '五、為保障債權人權益，爰依公證法、強制執行法及其他相關規定，聲請准予強制執行。'
        ];
    }

    function buildExecContentParagraphs(d) {
        return [
            `一、債務人應給付聲請人積欠租金新臺幣${d.amountCN}（詳如欠租明細）。`,
            '二、執行費用由債務人負擔。'
        ];
    }

    function buildExecTargetParagraphs(d) {
        return [
            `請就債務人所有之財產實施強制執行，其中包含位於承租房屋（地址：${d.propertyAddr}）內之動產。`,
            '並請依法就債務人之銀行存款、薪資所得、汽車、機車及其他依法得執行之財產實施強制執行；如有必要，請准依強制執行法第19條第2項調查債務人財產。'
        ];
    }

    function buildEvidenceItems() {
        return [
            '一、公證書正本。',
            '二、租賃（轉租）契約正本。',
            '三、欠租明細表（金流表）。',
            '四、催告紀錄（LINE對話、催繳通知等）。',
            '五、存證信函。',
            '六、其他相關證明文件。'
        ];
    }

    function buildEvidenceChecklist() {
        return [
            { no: 1, name: '公證書正本', qty: '1 份' },
            { no: 2, name: '租賃（轉租）契約正本', qty: '1 份' },
            { no: 3, name: '欠租明細表（金流表）', qty: '1 份' },
            { no: 4, name: '催告紀錄（LINE對話、催繳通知等）', qty: '1 份' },
            { no: 5, name: '存證信函', qty: '1 份' },
            { no: 6, name: '其他相關證明文件', qty: '依需要' }
        ];
    }

    const CN_DIG = ['零', '壹', '貳', '參', '肆', '伍', '陸', '柒', '捌', '玖'];
    const CN_UNIT = ['', '拾', '佰', '仟'];
    const CN_BIG = ['', '萬', '億'];

    function sectionToChinese(n) {
        if (n === 0) return '';
        let s = '';
        const str = String(n);
        for (let i = 0; i < str.length; i++) {
            const d = Number(str[i]);
            const u = CN_UNIT[str.length - 1 - i];
            if (d === 0) {
                if (!s.endsWith('零') && s.length) s += '零';
            } else {
                s += CN_DIG[d] + u;
            }
        }
        return s.replace(/零+$/g, '').replace(/零+/g, '零');
    }

    /** 金額大寫（元整） */
    function amountToChineseMoney(amount) {
        const n = Math.round(Number(amount) || 0);
        if (n <= 0) return '零元整';
        if (n >= 100000000) return String(n) + '元整';
        const wan = Math.floor(n / 10000);
        const rest = n % 10000;
        let out = '';
        if (wan > 0) out += sectionToChinese(wan) + '萬';
        if (rest > 0) {
            const part = sectionToChinese(rest);
            if (wan > 0 && rest < 1000) out += '零';
            out += part;
        }
        return out + '元整';
    }

    function formatMoney(n) {
        return (Number(n) || 0).toLocaleString('zh-TW');
    }

    function parseRocDateText(raw) {
        const s = String(raw || '').trim();
        if (!s) return null;
        const m = s.match(/(\d{2,3})\s*[\/年.-]\s*(\d{1,2})\s*[\/月.-]\s*(\d{1,2})/);
        if (m) return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
        const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (iso) return { y: Number(iso[1]) - 1911, m: Number(iso[2]), d: Number(iso[3]) };
        return null;
    }

    function rocDateLabel(raw) {
        const p = parseRocDateText(raw);
        if (!p) return String(raw || '');
        return `民國 ${p.y} 年 ${p.m} 月 ${p.d} 日`;
    }

    function rocSlash(raw) {
        const p = parseRocDateText(raw);
        if (!p) return String(raw || '');
        return `${p.y}/${String(p.m).padStart(2, '0')}/${String(p.d).padStart(2, '0')}`;
    }

    function todayRocParts() {
        const d = new Date();
        return { y: d.getFullYear() - 1911, m: d.getMonth() + 1, day: d.getDate() };
    }

    function readDebtors() {
        const rows = [];
        document.querySelectorAll('#ep-debtors-list .ep-debtor-row').forEach((row) => {
            const name = String(row.querySelector('.ep-debtor-name')?.value || '').trim();
            const id = String(row.querySelector('.ep-debtor-id')?.value || '').trim();
            if (name || id) rows.push({ name, id });
        });
        return rows;
    }

    function updateAddDebtorButton() {
        const btn = $('ep-btn-add-debtor');
        const count = document.querySelectorAll('#ep-debtors-list .ep-debtor-row').length;
        if (btn) btn.style.display = count >= 2 ? 'none' : '';
    }

    function addDebtorRow(data, index) {
        const wrap = $('ep-debtors-list');
        if (!wrap) return;
        const row = document.createElement('div');
        row.className = 'ep-debtor-row';
        const title = index === 0 ? '第一位債務人' : '第二位債務人';
        const canRemove = index > 0;
        row.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px">
                <span style="font-size:13px;font-weight:800">${title}</span>
                ${canRemove ? '<button type="button" class="btn btn-sm ep-debtor-remove">刪除</button>' : ''}
            </div>
            <div class="ep-grid">
                <label class="practice-field"><span>姓名<span class="req-mark" aria-hidden="true">*</span></span>
                    <input type="text" class="ep-debtor-name" value="${esc(data?.name || '')}" /></label>
                <label class="practice-field"><span>身分證統一編號<span class="req-mark" aria-hidden="true">*</span></span>
                    <input type="text" class="ep-debtor-id" value="${esc(data?.id || '')}" /></label>
            </div>`;
        row.querySelector('.ep-debtor-remove')?.addEventListener('click', () => {
            row.remove();
            updateAddDebtorButton();
        });
        wrap.appendChild(row);
        updateAddDebtorButton();
    }

    function ensureDebtorRows() {
        const wrap = $('ep-debtors-list');
        if (!wrap || wrap.children.length) return;
        addDebtorRow({}, 0);
    }

    function readArrearsRows() {
        const rows = [];
        document.querySelectorAll('#ep-arrears-rows .ep-arrears-row').forEach((row) => {
            const label = row.querySelector('.ep-ar-label')?.value || '';
            const amt = Number(String(row.querySelector('.ep-ar-amt')?.value || '').replace(/[^\d]/g, '')) || 0;
            if (label.trim() || amt) rows.push({ label: label.trim(), amount: amt });
        });
        return rows;
    }

    function sumArrears(rows) {
        return rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    }

    function readAmountTotal() {
        return sumArrears(readArrearsRows());
    }

    function resolveAmountTotal(rows) {
        return sumArrears(rows);
    }

    function buildArrearsDetail(rows) {
        if (!rows.length) return '';
        return rows.map((r) => {
            const label = r.label || '項目';
            return `${label} ${formatMoney(r.amount)} 元`;
        }).join('、');
    }

    function numVal(id) {
        return Number(String(val(id)).replace(/[^\d]/g, '')) || 0;
    }

    function normalizeCaseYear(raw) {
        return String(raw || '').trim().replace(/年度$/,'').replace(/年$/,'');
    }

    function collectFormData() {
        const rows = readArrearsRows();
        const total = resolveAmountTotal(rows);
        const debtors = readDebtors();
        const primary = debtors[0] || {};
        const region = val('ep-region');
        const preset = (window.ENFORCEMENT_REGION_PRESETS || {})[region] || {};
        const notaryOffice = val('ep-notary-exec') || preset.notaryExec || '';
        const notaryRef = val('ep-notary-serial');
        const leaseTypeVal = val('ep-lease-type') || '租賃';
        const propertyAddr = val('ep-property-addr');

        return {
            caseYear: normalizeCaseYear(val('ep-case-year')),
            caseSerial: val('ep-case-serial'),
            handler: val('ep-handler'),
            division: val('ep-division'),
            court: val('ep-court') || preset.court || '',
            amount: total,
            amountCN: amountToChineseMoney(total),
            debtors: debtors.map((t) => ({ ...t, addr: propertyAddr })),
            debtorName: primary.name,
            debtorId: primary.id,
            debtorAddr: propertyAddr,
            landlordName: val('ep-landlord-name'),
            landlordAddr: val('ep-landlord-addr'),
            landlordPhone: val('ep-landlord-phone'),
            tenantName: primary.name,
            tenantId: primary.id,
            tenantAddr: propertyAddr,
            propertyAddr,
            notaryRef,
            notaryOffice,
            notaryExec: notaryOffice,
            notaryOfficeName: extractNotaryOfficeName(notaryOffice),
            arrearsRows: rows,
            arrearsDetail: buildArrearsDetail(rows),
            leaseType: leaseTypeVal,
            contractY: val('ep-contract-y'),
            contractM: val('ep-contract-m'),
            contractD: val('ep-contract-d'),
            monthlyRent: numVal('ep-monthly-rent'),
            monthlyRentCN: amountToChineseMoney(numVal('ep-monthly-rent')),
            arrearsStartY: val('ep-arrears-start-y'),
            arrearsStartM: val('ep-arrears-start-m'),
            arrearsEndY: val('ep-arrears-end-y'),
            arrearsEndM: val('ep-arrears-end-m'),
            arrearsEndD: val('ep-arrears-end-d'),
            petitioner: val('ep-petitioner'),
            filingY: val('ep-filing-y') || String(todayRocParts().y),
            filingM: val('ep-filing-m') || String(todayRocParts().m),
            filingD: val('ep-filing-d') || String(todayRocParts().day)
        };
    }

    function validateData(d) {
        const miss = [];
        if (!d.landlordName) miss.push('聲請人（出租人）姓名');
        if (!d.debtors?.length || !d.debtors[0]?.name) miss.push('相對人（承租人）姓名');
        if (!d.debtors?.[0]?.id) miss.push('相對人（承租人）身分證統一編號');
        if (!d.propertyAddr) miss.push('承租房屋地址');
        if (!d.amount) miss.push('積欠金額明細（至少一筆）');
        if (!d.court) miss.push('管轄地方法院');
        if (!d.notaryRef) miss.push('公證書字號');
        if (!d.notaryOffice) miss.push('公證人事務所');
        if (!d.petitioner) miss.push('具狀人');
        return miss;
    }

    function buildDocumentParagraphs(d) {
        const p1 = [
            '民事聲請狀',
            '（強制執行）',
            '',
            `案號 ${d.caseYear || '　　　'} 年度 ${d.caseSerial || '　　　'} 字第　　　號　　承辦 ${d.handler || '　　　'}　　股別 ${d.division || '　　　'}`,
            '訴訟標的',
            `金額或價額　新台幣 ${d.amountCN}`,
            '',
            '聲請人即債權人',
            `出租人：${d.landlordName}`,
            `地址：${d.landlordAddr}`,
            `電話：${d.landlordPhone}`,
            '',
            '相對人即債務人（承租人）',
            ...(d.debtors || []).flatMap((t, i) => [
                `${d.debtors.length > 1 ? `（${i + 1}）` : ''}承租人：${t.name}`,
                `身分證字號：${t.id}`,
                `地址：${t.addr}`,
                ''
            ]).slice(0, -1)
        ];

        const p2 = [
            '為聲請強制執行事：',
            '一、聲請強制執行之內容：',
            ...buildExecContentParagraphs(d),
            '二、執行名義：',
            buildExecTitle(d),
            '三、執行標的：',
            ...buildExecTargetParagraphs(d),
            '四、事由：',
            ...buildReasonParagraphs(d),
            '',
            '證物：',
            ...buildEvidenceItems(),
            '',
            '謹狀',
            `臺灣${d.court}地方法院民事執行處　　公鑒`,
            '',
            `中華民國${d.filingY}年${d.filingM}月${d.filingD}日`,
            `具狀人：${d.petitioner}`
        ];

        return p1.concat(['', '— 續下頁 —', ''], p2);
    }

    function downloadPdf(bytes, filename) {
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 200);
    }

    async function generatePdf() {
        const status = $('ep-status');
        const btn = $('ep-btn-generate');
        const d = collectFormData();
        const miss = validateDataWithHints(d);
        if (miss.length) {
            alert('請填寫：' + miss.join('、'));
            const first = document.querySelector('#ep-form .practice-field.is-error input, #ep-form .practice-field.is-error select, #ep-form .practice-field.is-error textarea');
            first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }

        try {
            if (status) status.textContent = '載入 PDF 函式庫…';
            if (btn) btn.disabled = true;
            if (!window.PDFLib) {
                await new Promise((resolve, reject) => {
                    const s = document.createElement('script');
                    s.src = 'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js';
                    s.onload = resolve;
                    s.onerror = () => reject(new Error('無法載入 pdf-lib'));
                    document.head.appendChild(s);
                });
            }
            if (!window.fontkit) {
                await new Promise((resolve, reject) => {
                    const s = document.createElement('script');
                    s.src = 'https://unpkg.com/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.js';
                    s.onload = resolve;
                    s.onerror = () => reject(new Error('無法載入 fontkit'));
                    document.head.appendChild(s);
                });
            }
            if (status) status.textContent = '載入字型中…';
            const PDFLib = window.PDFLib;
            if (!PDFLib) throw new Error('PDF 函式庫未載入');
            if (!window.fontkit) throw new Error('字型引擎未載入');
            if (typeof window.buildEnforcementPetitionPdf !== 'function') {
                throw new Error('找不到訴狀排版程式');
            }

            const fontBytes = await getFontBytes();
            if (status) status.textContent = '繪製訴狀表格中…';
            const finalBytes = await window.buildEnforcementPetitionPdf(PDFLib, fontBytes, d, {
                amountInFormalText,
                buildExecTitle,
                buildExecContentParagraphs,
                buildExecTargetParagraphs,
                buildReasonParagraphs,
                buildEvidenceItems,
                buildEvidenceChecklist
            });

            const stamp = new Date();
            const fn = `強制執行聲請_${d.debtorName || '案件'}_${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, '0')}${String(stamp.getDate()).padStart(2, '0')}.pdf`;
            downloadPdf(finalBytes, fn);
            if (status) status.textContent = '已產生訴狀 PDF（含證物清單共 3 頁），請列印後至法院遞狀。';
            updatePreview(d);
        } catch (e) {
            console.error(e);
            alert('產生失敗：' + (e?.message || e));
            if (status) status.textContent = '';
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    function updatePreview(d) {
        const pre = $('ep-preview');
        if (!pre) return;
        const data = d || collectFormData();
        pre.innerHTML = buildDocumentParagraphs(data).map((l) => esc(l)).join('<br>');
    }

    function updateAmountSummary() {
        const rows = readArrearsRows();
        const total = resolveAmountTotal(rows);
        const cn = $('ep-amount-cn');
        const sum = $('ep-amount-sum');
        const detail = $('ep-arrears-detail-preview');
        if (cn) cn.textContent = amountToChineseMoney(total);
        if (sum) sum.textContent = formatMoney(total);
        if (detail) {
            detail.textContent = buildArrearsDetail(rows) || '（請至少新增一筆積欠項目）';
        }
    }

    function applyRegionPreset() {
        const region = val('ep-region');
        const preset = (window.ENFORCEMENT_REGION_PRESETS || {})[region];
        if (!preset) return;
        const set = (id, v) => { const el = $(id); if (el && v) el.value = v; };
        set('ep-court', preset.court);
        const offices = getRegionalNotaryOffices(region);
        const office = offices[0] || preset.notaryExec;
        set('ep-notary-exec', office);
    }

    function addArrearsRow(labelVal, amtVal) {
        const wrap = $('ep-arrears-rows');
        if (!wrap) return;
        const row = document.createElement('div');
        row.className = 'ep-arrears-row';
        row.style.cssText = 'display:grid;grid-template-columns:1fr 7.5rem 2.5rem;gap:8px;align-items:end;margin-bottom:8px';
        row.innerHTML = `
            <label class="practice-field" style="margin:0"><span class="sr-only">積欠項目</span>
                <input type="text" class="ep-ar-label" placeholder="113/12 租金、管理費" value="${esc(labelVal || '')}" /></label>
            <label class="practice-field" style="margin:0"><span class="sr-only">金額</span>
                <input type="number" class="ep-ar-amt" style="text-align:right" min="0" step="1" value="${esc(amtVal || '')}" /></label>
            <button type="button" class="btn btn-sm ep-ar-remove" title="刪除">✕</button>`;
        row.querySelector('.ep-ar-remove')?.addEventListener('click', () => {
            const count = document.querySelectorAll('#ep-arrears-rows .ep-arrears-row').length;
            if (count <= 1) {
                row.querySelector('.ep-ar-label').value = '';
                row.querySelector('.ep-ar-amt').value = '';
                updateAmountSummary();
                return;
            }
            row.remove();
            updateAmountSummary();
        });
        row.querySelectorAll('input').forEach((inp) => {
            inp.addEventListener('input', updateAmountSummary);
        });
        wrap.appendChild(row);
    }

    function ensureArrearsRows() {
        const wrap = $('ep-arrears-rows');
        if (!wrap || wrap.children.length) return;
        addArrearsRow('積欠租金', '');
    }

    function populateRegionSelect() {
        const regions = Object.keys(window.ENFORCEMENT_REGION_PRESETS || {});
        const sel = $('ep-region');
        if (!sel || !regions.length) return;
        const prev = sel.value;
        sel.innerHTML = '<option value="">請選擇地區（帶入法院／公證用語）</option>' +
            regions.map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join('');
        if (prev && regions.includes(prev)) sel.value = prev;
    }

    const COMPANY_BRANCH_PRESETS = {
        '星鴻股份有限公司': [
            { id: 'hq', name: '企業總部', phone: '(02) 7755-2669', addr: '108 台北市萬華區中華路一段106號' },
            { id: 'tp', name: '台北分公司', phone: '0809-092-122', addr: '103 台北市大同區重慶北路一段26巷9弄1號4樓' },
            { id: 'ty', name: '桃園分公司', phone: '(03) 275-7773', addr: '320 桃園市中壢區環北路400號13樓之6' },
            { id: 'tc-1', name: '台中分公司', phone: '(04) 3707-2368', addr: '406 台中市北屯區文心路四段698號6樓之1' },
            { id: 'tc-2', name: '台中營業二處', phone: '(04) 3707-2397', addr: '402 台中市南區忠明南路789號8樓之2' },
            { id: 'tn', name: '台南分公司', phone: '(06) 703-2305', addr: '704 台南市北區成功路54號11樓之1' },
            { id: 'kh', name: '高雄分公司', phone: '(07) 976-3955', addr: '806 高雄市前鎮區一心一路239號11樓之2' },
            { id: 'hsinchu', name: '新竹分公司', phone: '(03) 622-3937', addr: '302 新竹縣竹北市光明五街342號2樓' },
            { id: 'yilan', name: '宜蘭分公司', phone: '(03) 910-8705', addr: '260 宜蘭縣宜蘭市舊城北路154號2樓' },
            { id: 'keelung', name: '基隆分公司', phone: '(02) 7751-7851', addr: '202 基隆市中正區義二路196號2樓' },
            { id: 'nantou', name: '南投分公司', phone: '(049) 700-9327', addr: '542 南投縣草屯鎮中正路755號7樓之1' }
        ],
        '星華股份有限公司': [
            { id: 'tp', name: '台北分公司', phone: '0809-092-122', addr: '103 台北市大同區重慶北路一段26巷9弄1號4樓' },
            { id: 'chiayi', name: '嘉義分公司', phone: '(05) 320-9119', addr: '600 嘉義市西區上海路175號2樓' }
        ]
    };

    // 公證人事務所（可選也可自行輸入）
    const NOTARY_OFFICE_OPTIONS = [
        '臺灣臺北地方法院所屬民間公證人賴靜瑜事務所',
        '臺灣臺北地方法院所屬民間公證人巫芸甄事務所',
        '臺灣桃園地方法院所屬民間公證人謝孟儒事務所',
        '臺灣臺中地方法院所屬民間公證人郭哲嫚事務所',
        '臺灣臺中地方法院所屬民間公證人薛任智事務所',
        '臺灣彰化地方法院所屬民間公證人彰化聯合事務所 郭俊麟公證人',
        '臺灣台南地方法院所屬民間公證人余乾慶事務所',
        '臺灣臺南地方法院所屬民間公證人黃淑芬事務所',
        '臺灣高雄地方法院民間公證人鼓山美術聯合事務所'
    ];

    const NOTARY_OFFICES_BY_REGION = {
        '臺北': [
            '臺灣臺北地方法院所屬民間公證人賴靜瑜事務所',
            '臺灣臺北地方法院所屬民間公證人巫芸甄事務所'
        ],
        '新北': [
            '臺灣臺北地方法院所屬民間公證人賴靜瑜事務所',
            '臺灣臺北地方法院所屬民間公證人巫芸甄事務所'
        ],
        '桃園': ['臺灣桃園地方法院所屬民間公證人謝孟儒事務所'],
        '臺中': [
            '臺灣臺中地方法院所屬民間公證人郭哲嫚事務所',
            '臺灣臺中地方法院所屬民間公證人薛任智事務所'
        ],
        '彰化': ['臺灣彰化地方法院所屬民間公證人彰化聯合事務所 郭俊麟公證人'],
        '臺南': [
            '臺灣台南地方法院所屬民間公證人余乾慶事務所',
            '臺灣臺南地方法院所屬民間公證人黃淑芬事務所'
        ],
        '高雄': ['臺灣高雄地方法院民間公證人鼓山美術聯合事務所']
    };

    function getRegionalNotaryOffices(region) {
        return NOTARY_OFFICES_BY_REGION[region] || [];
    }

    function updateNotaryOfficeDatalists() {
        const execList = $('ep-notary-exec-list');
        if (!execList) return;
        const region = val('ep-region');
        const regional = getRegionalNotaryOffices(region);
        const options = regional.length ? regional : NOTARY_OFFICE_OPTIONS;
        execList.innerHTML = options.map((s) => `<option value="${esc(s)}"></option>`).join('');
    }

    function clearFieldErrorState() {
        document.querySelectorAll('#ep-form .practice-field.is-error').forEach((el) => el.classList.remove('is-error'));
        document.querySelectorAll('#ep-form .field-error').forEach((el) => el.remove());
        document.querySelectorAll('#ep-form [aria-invalid=\"true\"]').forEach((el) => el.removeAttribute('aria-invalid'));
    }

    function markFieldError(el, message) {
        if (!el) return;
        el.setAttribute('aria-invalid', 'true');
        const field = el.closest('.practice-field');
        if (!field) return;
        field.classList.add('is-error');
        const msg = document.createElement('div');
        msg.className = 'field-error';
        msg.textContent = message || '此欄位必填';
        field.appendChild(msg);
    }

    function validateDataWithHints(d) {
        clearFieldErrorState();
        const miss = [];

        if (!d.court) { miss.push('管轄地方法院'); markFieldError($('ep-court'), '必填：管轄地方法院'); }
        if (!d.landlordName) { miss.push('聲請人（出租人）姓名'); markFieldError($('ep-landlord-name'), '必填：出租人姓名／公司名'); }
        if (!d.landlordPhone) { miss.push('出租人電話'); markFieldError($('ep-landlord-phone'), '必填：出租人電話'); }
        if (!d.landlordAddr) { miss.push('出租人地址'); markFieldError($('ep-landlord-addr'), '必填：出租人地址'); }
        if (!d.propertyAddr) { miss.push('承租房屋地址'); markFieldError($('ep-property-addr'), '必填：承租房屋地址'); }
        if (!d.notaryRef) { miss.push('公證書字號'); markFieldError($('ep-notary-serial'), '必填：公證書字號'); }
        if (!d.notaryOffice) { miss.push('公證人事務所'); markFieldError($('ep-notary-exec'), '必填：公證人事務所'); }
        if (!d.petitioner) { miss.push('具狀人'); markFieldError($('ep-petitioner'), '必填：具狀人'); }

        const firstDebtorName = document.querySelector('#ep-debtors-list .ep-debtor-row .ep-debtor-name');
        const firstDebtorId = document.querySelector('#ep-debtors-list .ep-debtor-row .ep-debtor-id');
        if (!d.debtors?.length || !d.debtors[0]?.name) {
            miss.push('相對人（承租人）姓名');
            markFieldError(firstDebtorName, '必填：承租人姓名');
        }
        if (!d.debtors?.[0]?.id) {
            miss.push('相對人（承租人）身分證統一編號');
            markFieldError(firstDebtorId, '必填：承租人身分證統一編號');
        }
        document.querySelectorAll('#ep-debtors-list .ep-debtor-row').forEach((row, i) => {
            if (i === 0) return;
            const name = String(row.querySelector('.ep-debtor-name')?.value || '').trim();
            const idEl = row.querySelector('.ep-debtor-id');
            const id = String(idEl?.value || '').trim();
            if (name && !id) {
                miss.push('第二位債務人身分證統一編號');
                markFieldError(idEl, '必填：身分證統一編號');
            }
        });

        const hasAmount = (d.arrearsRows || []).some((r) => Number(r.amount) > 0);
        if (!hasAmount) {
            miss.push('積欠金額明細（至少一筆）');
            const firstAmt = document.querySelector('#ep-arrears-rows .ep-arrears-row .ep-ar-amt');
            markFieldError(firstAmt, '必填：請填至少一筆金額');
        }

        return miss;
    }

    function resetLandlordBranchSelect() {
        const branchSel = $('ep-landlord-branch');
        if (!branchSel) return;
        branchSel.innerHTML = '<option value="">－ 請先選公司別 －</option>';
        branchSel.disabled = true;
        branchSel.value = '';
    }

    function clearLandlordSection() {
        if ($('ep-landlord-company')) $('ep-landlord-company').value = '';
        resetLandlordBranchSelect();
        if ($('ep-landlord-name')) $('ep-landlord-name').value = '';
        if ($('ep-landlord-phone')) $('ep-landlord-phone').value = '';
        if ($('ep-landlord-addr')) $('ep-landlord-addr').value = '';
    }

    function bind() {
        if (bound) return;
        bound = true;

        populateRegionSelect();
        updateNotaryOfficeDatalists();

        const t = todayRocParts();
        if ($('ep-filing-y') && !$('ep-filing-y').value) $('ep-filing-y').value = String(t.y);
        if ($('ep-filing-m') && !$('ep-filing-m').value) $('ep-filing-m').value = String(t.m);
        if ($('ep-filing-d') && !$('ep-filing-d').value) $('ep-filing-d').value = String(t.day);

        $('ep-region')?.addEventListener('change', () => {
            applyRegionPreset();
            updateNotaryOfficeDatalists();
        });
        $('ep-landlord-company')?.addEventListener('change', () => {
            const company = val('ep-landlord-company');
            const branchSel = $('ep-landlord-branch');
            if (!branchSel) return;
            const branches = COMPANY_BRANCH_PRESETS[company] || [];
            if (!company || !branches.length) {
                resetLandlordBranchSelect();
                return;
            }
            branchSel.disabled = false;
            branchSel.innerHTML = '<option value="">－ 請選擇營業處 －</option>' +
                branches.map((b) => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('');
            $('ep-landlord-name').value = company;
        });
        $('ep-landlord-branch')?.addEventListener('change', () => {
            const company = val('ep-landlord-company');
            const branchId = val('ep-landlord-branch');
            const branches = COMPANY_BRANCH_PRESETS[company] || [];
            const hit = branches.find((b) => b.id === branchId);
            if (!hit) return;
            if ($('ep-landlord-name') && !$('ep-landlord-name').value) $('ep-landlord-name').value = company;
            if ($('ep-landlord-phone')) $('ep-landlord-phone').value = hit.phone;
            if ($('ep-landlord-addr')) $('ep-landlord-addr').value = hit.addr;
        });
        $('ep-btn-clear-landlord')?.addEventListener('click', clearLandlordSection);
        $('ep-btn-add-arrears')?.addEventListener('click', () => addArrearsRow('', ''));
        $('ep-btn-add-debtor')?.addEventListener('click', () => {
            const count = document.querySelectorAll('#ep-debtors-list .ep-debtor-row').length;
            if (count >= 2) return;
            addDebtorRow({}, count);
        });
        $('ep-btn-generate')?.addEventListener('click', generatePdf);
        $('ep-btn-preview')?.addEventListener('click', () => updatePreview());
        $('ep-btn-clear')?.addEventListener('click', () => {
            if (!confirm('清除本頁所有欄位？')) return;
            document.querySelectorAll('#ep-form input, #ep-form textarea').forEach((el) => {
                if (el.type === 'checkbox') el.checked = false;
                else el.value = '';
            });
            $('ep-arrears-rows').innerHTML = '';
            $('ep-debtors-list').innerHTML = '';
            addDebtorRow({}, 0);
            ensureArrearsRows();
            resetLandlordBranchSelect();
            updateAmountSummary();
            $('ep-preview').innerHTML = '';
        });

        ensureDebtorRows();
        ensureArrearsRows();
        updateAmountSummary();
    }

    window.initEnforcementPetition = function () {
        if (!$('ep-form')) return;
        populateRegionSelect();
        ensureDebtorRows();
        ensureArrearsRows();
        bind();
    };

    /** 由呆帳儀表板帶入案件資料（地址／承租人／合約日／欠款等） */
    window.prefillEnforcementPetitionFromCase = function (c) {
        if (!$('ep-form')) return;
        window.initEnforcementPetition();

        function set(id, v) {
            const el = $(id);
            if (el && v != null && v !== '') el.value = String(v);
        }

        function cityToRegion(city) {
            const s = String(city || '');
            const keys = Object.keys(window.ENFORCEMENT_REGION_PRESETS || {});
            for (const k of keys) {
                if (s.includes(k) || s.includes(k.replace('臺', '台'))) return k;
            }
            return '';
        }

        function parseAnyDate(raw) {
            const p = parseRocDateText(raw);
            if (p) return p;
            const d = raw instanceof Date ? raw : null;
            if (d && !isNaN(d)) return { y: d.getFullYear() - 1911, m: d.getMonth() + 1, d: d.getDate() };
            const iso = String(raw || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (iso) return { y: Number(iso[1]) - 1911, m: Number(iso[2]), d: Number(iso[3]) };
            return null;
        }

        const region = cityToRegion(c.city || c.address || '');
        if (region) {
            set('ep-region', region);
            $('ep-region')?.dispatchEvent(new Event('change', { bubbles: true }));
        }

        set('ep-property-addr', c.address || '');
        const lease = parseAnyDate(c.leaseStart);
        if (lease) {
            set('ep-contract-y', lease.y);
            set('ep-contract-m', lease.m);
            set('ep-contract-d', lease.d);
        }
        if (/轉租/.test(String(c.type || ''))) set('ep-lease-type', '轉租');
        else set('ep-lease-type', '租賃');

        const rents = (c.lines || []).map((l) => Number(l.rent) || 0).filter((n) => n > 0);
        if (rents.length) set('ep-monthly-rent', rents[0]);

        const firstDue = parseAnyDate(c.firstDue || c.lines?.[0]?.dueRaw || c.lines?.[0]?.dueDate);
        if (firstDue) {
            set('ep-arrears-start-y', firstDue.y);
            set('ep-arrears-start-m', firstDue.m);
        }
        const today = todayRocParts();
        set('ep-arrears-end-y', today.y);
        set('ep-arrears-end-m', today.m);
        set('ep-arrears-end-d', today.day);
        set('ep-filing-y', today.y);
        set('ep-filing-m', today.m);
        set('ep-filing-d', today.day);
        set('ep-case-year', today.y);

        const wrapD = $('ep-debtors-list');
        if (wrapD) {
            wrapD.innerHTML = '';
            addDebtorRow({ name: c.tenant || '', id: '' }, 0);
        }

        const wrapA = $('ep-arrears-rows');
        if (wrapA) {
            wrapA.innerHTML = '';
            const lines = Array.isArray(c.lines) ? c.lines : [];
            if (lines.length) {
                lines.forEach((l) => {
                    const amt = Number(l.arrears) || 0;
                    if (!amt) return;
                    const label = [l.dueRaw || '', l.item || l.status || '欠租'].filter(Boolean).join(' ').trim() || '欠租';
                    addArrearsRow(label, amt);
                });
            }
            if (!wrapA.children.length && Number(c.amount) > 0) {
                addArrearsRow('欠租合計', Math.round(Number(c.amount)));
            }
            if (!wrapA.children.length) ensureArrearsRows();
            updateAmountSummary();
        }

        // 公證書／出租人／具狀人：留給業務手填
        set('ep-notary-serial', '');
        $('ep-status') && ($('ep-status').textContent = '已帶入案件地址、承租人、合約日與欠款；請補填公證書與聲請人資料後產生 PDF');
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', window.initEnforcementPetition);
    } else {
        window.initEnforcementPetition();
    }
})();
