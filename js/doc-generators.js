/**
 * 欠租儀表板內建 PDF 產生器（家訪單、存證信函）
 * 存證信函範本對齊星鴻工具箱 lal-letter-templates.js
 */
(function (global) {
  'use strict';

  const ASSET_BASE = String(
    global.TOOLBOX_ASSET_BASE ||
    global.TOOLBOX_PAGES_URL ||
    'https://cdn.jsdelivr.net/gh/dahwork123-hash/skyfun-toolbox-pages@main/'
  ).replace(/\/?$/, '/');
  const FONT_URL = ASSET_BASE + 'assets/lal/TW-Kai-98_1.ttf';
  const FONT_MANIFEST = ASSET_BASE + 'js/lal-font/manifest.js';
  const FONT_PART_PREFIX = ASSET_BASE + 'js/lal-font/part-';
  const TEMPLATE_URL = ASSET_BASE + 'assets/lal/tw_lal.pdf';

  const PDF_INCH = 72;
  const PAGE_W = 8.2677 * PDF_INCH;
  const PAGE_H = 11.692 * PDF_INCH;
  const CONTENT_X_Y_BEGIN = [1.27 * PDF_INCH, 7.82 * PDF_INCH];
  const CONTENT_X_Y_INTERVAL = [0.33 * PDF_INCH, 0.47 * PDF_INCH];
  const CONTENT_X_Y_FIX = [0.001 * PDF_INCH, 0.001 * PDF_INCH];
  const CONTENT_MAX_CHARACTER_PER_LINE = 20;
  const CONTENT_MAX_LINE_PER_PAGE = 10;
  const NAME_COORDINATE = {
    s_x_y_begin: [4.60 * PDF_INCH, 10.27 * PDF_INCH],
    r_x_y_begin: [4.60 * PDF_INCH, 9.66 * PDF_INCH],
    c_x_y_begin: [4.60 * PDF_INCH, 9.06 * PDF_INCH]
  };
  const ADDR_COORDINATE = {
    s_x_y_begin: [4.72 * PDF_INCH, 9.95 * PDF_INCH],
    r_x_y_begin: [4.72 * PDF_INCH, 9.32 * PDF_INCH],
    c_x_y_begin: [4.72 * PDF_INCH, 8.84 * PDF_INCH]
  };

  const OFFICE_CONTACT_RULES = [
    { test: /^北|^基/, unit: '台北分公司', phone: '0809-092-122', senderAddr: '103 台北市大同區重慶北路一段26巷9弄1號4樓' },
    { test: /^宜/, unit: '宜蘭分公司', phone: '(03) 910-8705', senderAddr: '260 宜蘭縣宜蘭市舊城北路154號2樓' },
    { test: /^桃/, unit: '桃園分公司', phone: '(03) 275-7773', senderAddr: '320 桃園市中壢區環北路400號13樓之6' },
    { test: /^竹/, unit: '新竹分公司', phone: '(03) 622-3937', senderAddr: '302 新竹縣竹北市光明五街342號2樓' },
    { test: /^中|^彰/, unit: '台中分公司', phone: '(04) 3707-2368', senderAddr: '406 台中市北屯區文心路四段698號6樓之1' },
    { test: /^嘉/, unit: '嘉義分公司', phone: '(05) 320-9119', senderAddr: '600 嘉義市西區上海路175號2樓' },
    { test: /^南/, unit: '台南分公司', phone: '(06) 703-2305', senderAddr: '704 台南市北區成功路54號11樓之1' },
    { test: /^高/, unit: '高雄分公司', phone: '(07) 976-3955', senderAddr: '806 高雄市前鎮區一心一路239號11樓之2' }
  ];
  const DEFAULT_CONTACT = {
    unit: '企業總部',
    phone: '(02) 7755-2669',
    senderAddr: '108 台北市萬華區中華路一段106號'
  };

  let fontBytesPromise = null;
  let templateBytesPromise = null;
  let pdfReadyPromise = null;

  function getLetterTemplates() {
    return global.LAL_LETTER_TEMPLATES || [];
  }

  function getTemplateById(id) {
    return getLetterTemplates().find((t) => t.id === id) || null;
  }

  function todayRoc() {
    const d = new Date();
    return { y: d.getFullYear() - 1911, m: d.getMonth() + 1, day: d.getDate() };
  }

  function safeName(s) {
    return String(s || '').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
  }

  function partOrBox(v) {
    return v ? String(v) : '□';
  }

  function resolveContact(office) {
    const o = String(office || '');
    for (const rule of OFFICE_CONTACT_RULES) {
      if (rule.test.test(o)) return { ...DEFAULT_CONTACT, unit: rule.unit, phone: rule.phone, senderAddr: rule.senderAddr };
    }
    return { ...DEFAULT_CONTACT };
  }

  function parseDueToRoc(raw) {
    const s = String(raw || '').trim();
    let m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (m) return { y: String(+m[1] - 1911), m: String(+m[2]), d: String(+m[3]) };
    m = s.match(/^(\d{2,3})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (m) return { y: m[1], m: String(+m[2]), d: String(+m[3]) };
    return null;
  }

  function caseDateToRocParts(raw) {
    if (!raw) return null;
    if (raw instanceof Date && !isNaN(raw)) {
      return { y: String(raw.getFullYear() - 1911), m: String(raw.getMonth() + 1), d: String(raw.getDate()) };
    }
    return parseDueToRoc(raw);
  }

  function rocPartsToDate(p) {
    if (!p) return null;
    const dt = new Date(parseInt(p.y, 10) + 1911, parseInt(p.m, 10) - 1, parseInt(p.d, 10), 12, 0, 0);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  function computeLeaseYearsMonths(startParts, endParts) {
    const start = rocPartsToDate(startParts);
    const end = rocPartsToDate(endParts);
    if (!start || !end) return null;
    const endInclusive = new Date(end);
    endInclusive.setDate(endInclusive.getDate() + 1);
    if (endInclusive.getTime() <= start.getTime()) return null;
    let years = endInclusive.getFullYear() - start.getFullYear();
    let months = endInclusive.getMonth() - start.getMonth();
    if (endInclusive.getDate() < start.getDate()) months--;
    if (months < 0) {
      years--;
      months += 12;
    }
    if (years < 0) return null;
    return { years: String(years), months: String(months) };
  }

  function formatLeaseTerm(startParts, endParts) {
    const term = computeLeaseYearsMonths(startParts, endParts);
    const ly = term?.years || '';
    const lm = term?.months || '';
    if (!startParts && !endParts) return '租期自□年□月□日起至□年□月□日止，計□年□月';
    const seg = (p) => (p ? p.y + '年' + p.m + '月' + p.d + '日' : '□年□月□日');
    let s = '租期自' + seg(startParts) + '起至' + seg(endParts) + '止';
    if (ly || lm) s += '，計' + partOrBox(ly) + '年' + partOrBox(lm) + '月';
    return s;
  }

  function formatLeaseTermRoc(startParts, endParts) {
    if (!startParts && !endParts) return '租期自民國□年□月□日至民國□年□月□日止';
    const seg = (p) => (p ? '民國' + p.y + '年' + p.m + '月' + p.d + '日' : '民國□年□月□日');
    return '租期自' + seg(startParts) + '至' + seg(endParts) + '止';
  }

  function rocDatePhrase(p) {
    if (!p) return '□年□月□日';
    return p.y + '年' + p.m + '月' + p.d + '日';
  }

  function rentOfCase(c) {
    const fromLine = c.lines?.find((l) => l.rent > 0)?.rent;
    if (fromLine) return fromLine;
    if (c.maxDays >= 30) return Math.round(c.amount / Math.max(1, Math.ceil(c.maxDays / 30)));
    return c.amount || 0;
  }

  function payDayOfCase(c) {
    const p = parseDueToRoc(c.lines?.[0]?.dueRaw || c.lines?.[0]?.dueDate || '');
    return p ? String(+p.d) : '5';
  }

  function owedMonthPhrase(c) {
    const p = parseDueToRoc(c.lines?.[0]?.dueRaw || '');
    if (!p) return '□年□月份';
    return p.y + '年' + p.m + '月份';
  }

  function arrearsSincePhrase(c) {
    const p = parseDueToRoc(c.lines?.[0]?.dueRaw || '');
    if (!p) return '於□年□月□日以後';
    return '於' + p.y + '年' + p.m + '月' + p.d + '日以後';
  }

  function isEscrowCase(c) {
    return /代管|代租/.test(String(c.type || ''));
  }

  function suggestTemplateId(c) {
    const note = c.note || '';
    const rent = rentOfCase(c);
    const twoMonth = rent > 0 && c.amount >= rent * 2;
    const escrow = isEscrowCase(c);

    if (/第二封|終止租約|終止租賃|第二封存證/.test(note)) {
      return escrow ? 'escrow-2m-2' : 'arrears-2m-2';
    }
    if (twoMonth || c.maxDays >= 60 || /達二個月|積欠.*二/.test(note)) {
      return escrow ? 'escrow-2m-1' : 'arrears-2m-1';
    }
    if (c.maxDays >= 14 && c.maxDays < 45 && !twoMonth) return 'arrears-under-2m';
    return escrow ? 'escrow-2m-1' : 'arrears-under-2m';
  }

  function buildLetterTokens(c) {
    const start = caseDateToRocParts(c.leaseStart);
    const end = caseDateToRocParts(c.leaseEnd);
    const rent = rentOfCase(c);
    const creditor = '本公司';

    return {
      creditor,
      creditorLabel: '',
      addr: c.address || '□',
      simpleAddr: c.address || '□市□街□號',
      leaseTerm: formatLeaseTerm(start, end),
      leaseTermRoc: formatLeaseTermRoc(start, end),
      rentMonthly: rent ? String(rent) : '□',
      rentPayDay: payDayOfCase(c),
      owedMonth: owedMonthPhrase(c),
      owedAmount: String(Math.round(c.amount || 0)),
      arrearsSince: arrearsSincePhrase(c),
      arrearsTotal: String(Math.round(c.amount || 0)),
      priorLetter: '於□年□月□日以□郵局第□號存證信函',
      landlordName: '(出租人全名)',
      propertyOwner: '(房屋所有權人全名)',
      escrowIntro: '',
      leaseEndDate: rocDatePhrase(end),
      inspectDateTime: '□年□月□日□時□分'
    };
  }

  function buildLalBody(c, templateId) {
    const tpl = getTemplateById(templateId) || getTemplateById(suggestTemplateId(c));
    if (!tpl) throw new Error('找不到存證信函範本');
    const tokens = buildLetterTokens(c);
    return tpl.body.replace(/\{\{(\w+)\}\}/g, (_, key) => (tokens[key] != null ? tokens[key] : ''));
  }

  function inferVisitFlags(c) {
    const note = c.note || '';
    return {
      noAnswer: /家訪|面訪|未遇|貼單/.test(note),
      callMissed: /未接|無人接|忙線|語音/.test(note),
      lineMissed: /已讀|LINE|簡訊/.test(note),
      other: false,
      otherNote: ''
    };
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

  async function ensurePdfLibs() {
    if (pdfReadyPromise) return pdfReadyPromise;
    pdfReadyPromise = (async () => {
      if (!global.PDFLib) {
        await loadScript('https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js');
      }
      if (!global.fontkit) {
        await loadScript('https://unpkg.com/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.js');
      }
      if (!global.PDFLib || !global.fontkit) throw new Error('PDF 函式庫載入失敗');
      return global.PDFLib;
    })();
    return pdfReadyPromise;
  }

  function base64ToArrayBuffer(b64) {
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf.buffer;
  }

  async function loadEmbeddedFontBytes() {
    if (!global.LAL_FONT_PART_COUNT) {
      await loadScript(FONT_MANIFEST);
    }
    const total = global.LAL_FONT_PART_COUNT;
    if (!total) throw new Error('找不到內嵌字型（js/lal-font）');
    global.LAL_FONT_PARTS = global.LAL_FONT_PARTS || [];
    for (let i = global.LAL_FONT_PARTS.length; i < total; i++) {
      await loadScript(FONT_PART_PREFIX + String(i).padStart(3, '0') + '.js');
    }
    return base64ToArrayBuffer(global.LAL_FONT_PARTS.join(''));
  }

  async function getFontBytes() {
    if (!fontBytesPromise) {
      fontBytesPromise = (async () => {
        try {
          return await loadEmbeddedFontBytes();
        } catch (embedErr) {
          try {
            const r = await fetch(FONT_URL);
            if (r.ok) return r.arrayBuffer();
          } catch { /* ignore */ }
          fontBytesPromise = null;
          throw new Error('無法載入字型：' + (embedErr && embedErr.message ? embedErr.message : embedErr));
        }
      })();
    }
    return fontBytesPromise;
  }

  async function getTemplateBytes() {
    if (!templateBytesPromise) {
      templateBytesPromise = fetch(TEMPLATE_URL).then((r) => {
        if (!r.ok) throw new Error('無法載入郵局範本');
        return r.arrayBuffer();
      });
    }
    return templateBytesPromise;
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

  function wrapLines(font, text, size, maxW) {
    const s = String(text || '');
    if (!s) return [''];
    const lines = [];
    let line = '';
    for (const ch of s) {
      const next = line + ch;
      if (font.widthOfTextAtSize(next, size) > maxW && line) {
        lines.push(line);
        line = ch;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }

  function drawWrapped(page, font, text, x, y, size, maxW, lh, color) {
    const lines = wrapLines(font, text, size, maxW);
    let cy = y;
    for (const line of lines) {
      page.drawText(line, { x, y: cy, size, font, color });
      cy -= lh;
    }
    return cy;
  }

  function drawCheckRow(page, font, checked, label, x, y, size, maxW, lh, color) {
    const box = 13;
    page.drawRectangle({
      x,
      y: y - 1,
      width: box,
      height: box,
      borderWidth: 1.2,
      borderColor: color,
      color: undefined
    });
    if (checked) {
      page.drawText('V', { x: x + 2.4, y: y + 0.4, size: 11, font, color });
    }
    return drawWrapped(page, font, label, x + box + 8, y, size, maxW - box - 8, lh, color);
  }

  async function generateVisitNotice(c) {
    if (!c?.address) throw new Error('缺少租賃地址');
    const PDFLib = await ensurePdfLibs();
    const { PDFDocument, rgb } = PDFLib;
    const contact = resolveContact(c.office);
    const t = todayRoc();
    const flags = inferVisitFlags(c);

    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(global.fontkit);
    const font = await pdfDoc.embedFont(await getFontBytes(), { subset: true });

    const page = pdfDoc.addPage([595.28, 841.89]);
    const W = 595.28;
    const H = 841.89;
    const L = 50;
    const R = W - 50;
    const maxW = R - L;
    const ink = rgb(0.1, 0.12, 0.18);
    const muted = rgb(0.35, 0.38, 0.45);

    let y = H - 50;
    const title = '欠租關懷通知單';
    const titleSize = 26;
    const tw = font.widthOfTextAtSize(title, titleSize);
    page.drawText(title, { x: (W - tw) / 2, y, size: titleSize, font, color: ink });
    y -= 40;

    const bodySize = 14.5;
    const lh = 26;
    const paras = [
      '親愛的住戶您好：',
      '　　本公司近期已透過電話、簡訊、LINE及現場訪視等方式嘗試與您聯繫，但截至目前尚未取得回覆。',
      '　　經查目前租金可能有逾期未繳納情形，為避免影響您的租賃權益及後續相關作業，請您於看到本通知後儘速與本公司聯繫，以確認租金繳納情況及後續處理方式。',
      '　　若您近期因工作、出差、身體不適或其他特殊因素暫時無法配合，也請主動與本公司聯繫說明，本公司將協助您了解相關處理流程。'
    ];
    for (const p of paras) {
      y = drawWrapped(page, font, p, L, y, bodySize, maxW, lh, ink) - 8;
    }

    y -= 6;
    y = drawWrapped(page, font, '房屋地址：' + c.address, L, y, bodySize, maxW, lh, ink) - 12;

    const flagRows = [
      { on: flags.noAnswer, label: '本次已到訪但無人應門' },
      { on: flags.callMissed, label: '已撥打電話未接聽' },
      { on: flags.lineMissed, label: '已發送LINE／簡訊未回覆' },
      { on: flags.other, label: '其他：____________________________' }
    ];
    for (const row of flagRows) {
      y = drawCheckRow(page, font, row.on, row.label, L, y, bodySize, maxW, lh, ink) - 8;
    }

    y -= 14;
    const staff = c.staff && c.staff !== '公司' ? c.staff : '';
    [
      `聯絡單位：${contact.unit}`,
      `聯絡人員：${staff || '____________________'}`,
      `聯絡電話：${contact.phone}`,
      `訪視日期：${t.y}年${t.m}月${t.day}日`
    ].forEach((line) => {
      page.drawText(line, { x: L, y, size: bodySize, font, color: ink });
      y -= 28;
    });

    y -= 10;
    page.drawText('※提醒：', { x: L, y, size: 13.5, font, color: muted });
    y -= 24;
    drawWrapped(page, font, '如您已完成繳款、已與本公司聯繫或雙方已有約定處理方式，請忽略本通知。', L, y, 13.5, maxW, 22, muted);

    downloadPdf(await pdfDoc.save(), `欠租關懷通知單_${safeName(c.address)}.pdf`);
  }

  function writeMainArticle(overlayDoc, firstPage, drawText, mainText) {
    const text = String(mainText || '');
    let page = firstPage;
    let x = CONTENT_X_Y_BEGIN[0];
    let y = CONTENT_X_Y_BEGIN[1];
    let lineCounter = 1;
    let charCounter = 1;

    const newPage = () => {
      page = overlayDoc.addPage([PAGE_W, PAGE_H]);
      x = CONTENT_X_Y_BEGIN[0];
      y = CONTENT_X_Y_BEGIN[1];
      lineCounter = 1;
      charCounter = 1;
    };
    const newLine = () => {
      x = CONTENT_X_Y_BEGIN[0];
      y -= CONTENT_X_Y_INTERVAL[1] + CONTENT_X_Y_FIX[1];
      lineCounter += 1;
      charCounter = 1;
    };

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '\n' || charCounter > CONTENT_MAX_CHARACTER_PER_LINE) {
        newLine();
        if (ch === '\n') continue;
      }
      if (lineCounter > CONTENT_MAX_LINE_PER_PAGE) newPage();
      drawText(page, ch, x, y, 20);
      x += CONTENT_X_Y_INTERVAL[0] - CONTENT_X_Y_FIX[0];
      charCounter += 1;
    }
  }

  async function buildLalOverlay(PDFLib, fontBytes, senders, receivers, ccs, mainText) {
    const { PDFDocument, rgb } = PDFLib;
    const overlayDoc = await PDFDocument.create();
    overlayDoc.registerFontkit(global.fontkit);
    const font = await overlayDoc.embedFont(fontBytes);
    const drawText = (page, text, x, y, size) => {
      page.drawText(text, { x, y, size, font, color: rgb(0, 0, 0) });
    };

    let page = overlayDoc.addPage([PAGE_W, PAGE_H]);
    const single = senders.length <= 1 && receivers.length <= 1 && ccs.length <= 1;

    if (single) {
      if (senders[0]?.name) drawText(page, senders[0].name, NAME_COORDINATE.s_x_y_begin[0], NAME_COORDINATE.s_x_y_begin[1], 10);
      if (senders[0]?.addr) drawText(page, senders[0].addr, ADDR_COORDINATE.s_x_y_begin[0], ADDR_COORDINATE.s_x_y_begin[1], 10);
      if (receivers[0]?.name) drawText(page, receivers[0].name, NAME_COORDINATE.r_x_y_begin[0], NAME_COORDINATE.r_x_y_begin[1], 10);
      if (receivers[0]?.addr) drawText(page, receivers[0].addr, ADDR_COORDINATE.r_x_y_begin[0], ADDR_COORDINATE.r_x_y_begin[1], 10);
      if (ccs[0]?.name) drawText(page, ccs[0].name, NAME_COORDINATE.c_x_y_begin[0], NAME_COORDINATE.c_x_y_begin[1], 10);
      if (ccs[0]?.addr) drawText(page, ccs[0].addr, ADDR_COORDINATE.c_x_y_begin[0], ADDR_COORDINATE.c_x_y_begin[1], 10);
    }

    writeMainArticle(overlayDoc, page, drawText, mainText);
    return overlayDoc.save();
  }

  async function mergeLalWithTemplate(PDFLib, overlayBytes, templateBytes) {
    const { PDFDocument } = PDFLib;
    const templateDoc = await PDFDocument.load(templateBytes);
    const overlayDoc = await PDFDocument.load(overlayBytes);
    const outDoc = await PDFDocument.create();
    const pageCount = overlayDoc.getPageCount();
    for (let i = 0; i < pageCount; i++) {
      const [tplPage] = await outDoc.copyPages(templateDoc, [0]);
      const [ovlPage] = await outDoc.copyPages(overlayDoc, [i]);
      const embedded = await outDoc.embedPage(ovlPage);
      tplPage.drawPage(embedded);
      outDoc.addPage(tplPage);
    }
    return outDoc.save();
  }

  async function generateLalLetter(c, templateId) {
    if (!c?.tenant && !c?.address) throw new Error('缺少承租人或地址');
    const tpl = getTemplateById(templateId);
    if (!tpl) throw new Error('請選擇存證信函範本');
    const PDFLib = await ensurePdfLibs();
    const contact = resolveContact(c.office);
    const body = buildLalBody(c, templateId);
    const senders = [{ name: '星鴻股份有限公司', addr: contact.senderAddr }];
    const receivers = [{ name: c.tenant || '', addr: c.address || '' }];
    const [fontBytes, templateBytes] = await Promise.all([getFontBytes(), getTemplateBytes()]);
    const overlayBytes = await buildLalOverlay(PDFLib, fontBytes, senders, receivers, [], body);
    const finalBytes = await mergeLalWithTemplate(PDFLib, overlayBytes, templateBytes);
    const d = new Date();
    const tplShort = String(tpl.title || tpl.id).replace(/[\\/:*?"<>|【】]/g, '').slice(0, 24);
    downloadPdf(finalBytes, `存證信函_${safeName(c.tenant || c.caseId)}_${tplShort}_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.pdf`);
  }

  global.SkyfunDocGen = {
    generateVisitNotice,
    generateLalLetter,
    getLetterTemplates,
    getTemplateById,
    suggestTemplateId,
    buildLalBody,
    buildLetterTokens,
    formatLeaseTerm: (c) => formatLeaseTerm(caseDateToRocParts(c.leaseStart), caseDateToRocParts(c.leaseEnd))
  };
})(window);
