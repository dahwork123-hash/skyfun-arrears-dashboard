/**
 * 民事聲請狀（強制執行）— 重繪法院表格版面
 * 中文：標楷體；英數：Times New Roman
 */
(function () {
    'use strict';

    const W = 595.28;
    const H = 841.89;
    const L = 34;
    const R = 561;
    const TW = R - L;
    const B = 0.85;
    const TITLE_W = 118;
    const LABEL_W = 32;

    const SZ = {
        title: 22,
        subTitle: 17,
        hdr: 12,
        hdrSm: 10,
        body: 14,
        amount: 16,
        p2Title: 16,
        p2Hdr: 15,
        p2Body: 14
    };

    const COL = {
        name: 94,
        gender: 34,
        birth: 64,
        job: 26,
        addr: 160
    };

    function isTimesChar(ch) {
        const c = ch.charCodeAt(0);
        return (c >= 0x30 && c <= 0x39)
            || (c >= 0x41 && c <= 0x5a)
            || (c >= 0x61 && c <= 0x7a);
    }

    function pickFont(ch, fonts) {
        return isTimesChar(ch) ? fonts.times : fonts.kai;
    }

    function widthOfMixed(str, size, fonts) {
        let w = 0;
        for (const ch of String(str || '')) {
            w += pickFont(ch, fonts).widthOfTextAtSize(ch, size);
        }
        return w;
    }

    function tokenizeWrap(str) {
        const s = String(str || '');
        const tokens = s.match(/[\u4e00-\u9fff]|\d+|[A-Za-z]+|[^\u4e00-\u9fff\dA-Za-z\s]|\s+/g);
        return tokens && tokens.length ? tokens : [s];
    }

    function drawMixedLine(page, str, x, y, size, fonts, color) {
        let cx = x;
        for (const ch of String(str || '')) {
            const font = pickFont(ch, fonts);
            page.drawText(ch, { x: cx, y, size, font, color });
            cx += font.widthOfTextAtSize(ch, size);
        }
        return cx;
    }

    function drawMixed(page, str, x, y, size, fonts, color) {
        const s = String(str || '').trim();
        if (!s) return;
        drawMixedLine(page, s, x, y, size, fonts, color);
    }

    function wrapMixed(page, str, x, y, maxW, size, lh, fonts, color) {
        let line = '';
        let cy = y;
        const flush = () => {
            if (!line) return;
            drawMixedLine(page, line, x, cy, size, fonts, color);
            cy -= lh;
            line = '';
        };
        for (const token of tokenizeWrap(str)) {
            const test = line + token;
            if (widthOfMixed(test, size, fonts) > maxW && line.trim()) {
                flush();
                line = token.trimStart();
            } else line = test;
        }
        flush();
        return cy;
    }

    function colsX(bodyL) {
        const start = bodyL || L + LABEL_W;
        let x = start;
        const xs = [x];
        x += COL.name; xs.push(x);
        x += COL.gender; xs.push(x);
        x += COL.birth; xs.push(x);
        x += COL.job; xs.push(x);
        x += COL.addr; xs.push(x);
        xs.push(R);
        return xs;
    }

    function createCtx(page, fonts, rgb) {
        const black = rgb(0, 0, 0);

        const line = (x1, y1, x2, y2) => {
            page.drawLine({
                start: { x: x1, y: y1 },
                end: { x: x2, y: y2 },
                thickness: B,
                color: black
            });
        };

        const rect = (x, y, w, h) => {
            page.drawRectangle({ x, y, width: w, height: h, borderWidth: B, borderColor: black });
        };

        const text = (t, x, y, size = SZ.body) => drawMixed(page, t, x, y, size, fonts, black);

        const textCenter = (t, x1, x2, y, size = SZ.hdr, pad = 3) => {
            const s = String(t || '').trim();
            if (!s) return;
            const left = x1 + pad;
            const right = x2 - pad;
            if (right <= left) return;
            const w = widthOfMixed(s, size, fonts);
            drawMixed(page, s, left + Math.max(0, (right - left - w) / 2), y, size, fonts, black);
        };

        const textCenterWrap = (t, x1, x2, y, size, lh, pad = 3) => {
            const left = x1 + pad;
            const right = x2 - pad;
            const maxW = right - left;
            if (maxW <= 0) return y;
            const tokens = tokenizeWrap(t);
            let line = '';
            let cy = y;
            const flush = () => {
                if (!line.trim()) return;
                const w = widthOfMixed(line, size, fonts);
                drawMixedLine(page, line, left + Math.max(0, (maxW - w) / 2), cy, size, fonts, black);
                cy -= lh;
                line = '';
            };
            for (const token of tokens) {
                const test = line + token;
                if (widthOfMixed(test, size, fonts) > maxW && line.trim()) {
                    flush();
                    line = token.trimStart();
                } else line = test;
            }
            flush();
            return cy;
        };

        const vLabel = (t, x, yTop, yBottom, size = SZ.hdr) => {
            const chars = String(t || '').replace(/\s/g, '').split('');
            const gap = size + 2;
            const total = chars.length * gap;
            let y = yTop - (yTop - yBottom - total) / 2 - size;
            for (const ch of chars) {
                const font = fonts.kai;
                const w = font.widthOfTextAtSize(ch, size);
                page.drawText(ch, { x: x + (LABEL_W - w) / 2, y, size, font, color: black });
                y -= gap;
            }
        };

        const wrap = (t, x, y, maxW, size, lh) => wrapMixed(page, t, x, y, maxW, size, lh, fonts, black);

        const hline = (y, x1 = L, x2 = R) => line(x1, y, x2, y);
        const vline = (x, y1, y2) => line(x, y1, x, y2);

        return { line, rect, text, textCenter, textCenterWrap, vLabel, wrap, hline, vline, black, fonts, page };
    }

    function fitCenterInCell(c, text, x1, x2, y, maxSize, minSize = 11, pad = 8) {
        const s = String(text || '').trim();
        if (!s) return;
        let size = maxSize;
        const fonts = c.fonts;
        const left = x1 + pad;
        const right = x2 - pad;
        while (size > minSize && widthOfMixed(s, size, fonts) > right - left) size -= 1;
        c.textCenter(s, x1, x2, y, size, pad);
    }

    function drawAmountInCell(c, amountCN, x1, x2, yHigh, yLow) {
        const { fonts, page, black } = c;
        const text = `新台幣${amountCN || '零元整'}`;
        const padX = 8;
        const left = x1 + padX;
        const maxW = x2 - left - padX;
        const cellH = yHigh - yLow;
        if (cellH <= 0 || maxW <= 0) return;
        let size = SZ.amount;
        const minSize = 12;
        while (size > minSize && widthOfMixed(text, size, fonts) > maxW) size -= 1;
        const w = widthOfMixed(text, size, fonts);
        const x = left + Math.max(0, (maxW - w) / 2);
        const y = yLow + (cellH - size) / 2;
        drawMixedLine(page, text, x, y, size, fonts, black);
    }

    function normalizeCaseYear(raw) {
        return String(raw || '').trim().replace(/年度$/,'').replace(/年$/,'');
    }

    function wrapLimited(page, fonts, color, str, x, y, maxW, size, lh, minY) {
        let line = '';
        let cy = y;
        const flush = () => {
            if (!line || cy < minY) return;
            drawMixedLine(page, line, x, cy, size, fonts, color);
            cy -= lh;
            line = '';
        };
        for (const token of tokenizeWrap(str)) {
            const test = line + token;
            if (widthOfMixed(test, size, fonts) > maxW && line.trim()) {
                flush();
                if (cy < minY) break;
                line = token.trimStart();
            } else line = test;
        }
        if (cy >= minY) flush();
        return cy;
    }

    function drawParagraphList(c, items, x, y, maxW, size, lh, minY) {
        const { page, fonts, black } = c;
        let cy = y;
        for (const item of items) {
            cy = wrapLimited(page, fonts, black, item, x, cy, maxW, size, lh, minY);
            cy -= 4;
            if (cy < minY) break;
        }
        return cy;
    }

    function debtorList(d) {
        if (Array.isArray(d.debtors) && d.debtors.length) return d.debtors;
        return [{
            name: d.debtorName || d.tenantName || '',
            id: d.debtorId || d.tenantId || '',
            addr: d.debtorAddr || d.tenantAddr || ''
        }];
    }

    function drawDebtorBlock(c, bodyX, yTop, debtor, propertyAddr) {
        const { text, wrap } = c;
        const maxW = TW - (bodyX - L) - 12;
        let cy = yTop - 28;
        text(`承租人：${debtor.name}`, bodyX, cy, SZ.body);
        text(`身分證字號：${debtor.id}`, bodyX + 210, cy, SZ.body);
        cy -= 24;
        text('地址：', bodyX, cy, SZ.body);
        const addr = debtor.addr || propertyAddr || '';
        wrap(addr, bodyX + 42, cy, maxW - 42, SZ.body, 19);
    }

    function drawPartyHeaderRow(c, hdrBottom, amountBottom, bodyL, cx) {
        const { textCenter, textCenterWrap, vline } = c;
        const hdrH = amountBottom - hdrBottom;

        for (let i = 0; i < cx.length - 1; i++) vline(cx[i], hdrBottom, amountBottom);

        textCenter('稱謂', L, bodyL, hdrBottom + hdrH * 0.55, SZ.hdr);
        textCenter('姓名或名稱', cx[0], cx[1], hdrBottom + hdrH * 0.68, SZ.hdrSm);
        textCenter('身分證統一編號', cx[0], cx[1], hdrBottom + hdrH * 0.28, SZ.hdrSm);
        textCenter('性別', cx[1], cx[2], hdrBottom + hdrH * 0.48, SZ.hdrSm);
        textCenterWrap('出生年月日', cx[2], cx[3], hdrBottom + hdrH * 0.58, SZ.hdrSm, 11, 4);
        textCenter('職業', cx[3], cx[4], hdrBottom + hdrH * 0.48, SZ.hdr);
        textCenterWrap(
            '住居所或營業所、郵遞區號及電話號碼',
            cx[4], cx[5], hdrBottom + hdrH * 0.64, SZ.hdrSm, 11, 4
        );
        textCenter('送達代收人', cx[5], cx[6], hdrBottom + hdrH * 0.74, SZ.hdrSm, 4);
        textCenterWrap('姓名、住址、電話', cx[5], cx[6], hdrBottom + hdrH * 0.36, SZ.hdrSm, 10, 5);
    }

    function drawPage1(page, fonts, rgb, d, helpers) {
        const c = createCtx(page, fonts, rgb);
        const { text, textCenter, vLabel, wrap, hline, vline, rect } = c;
        const debtors = debtorList(d);

        const top = H - 44;
        const bottom = 38;
        const titleBottom = top - 66;
        const amountBottom = titleBottom - 40;
        const hdrBottom = amountBottom - 56;
        const bodyL = L + LABEL_W;
        const cx = colsX(bodyL);

        rect(L, bottom, TW, top - bottom);

        rect(L, titleBottom, TITLE_W, top - titleBottom);
        text('民事聲請狀', L + 8, top - 30, SZ.title);
        text('（強制執行）', L + 6, top - 54, SZ.subTitle);

        const caseL = L + TITLE_W;
        const caseW = R - caseL;
        const caseC1 = caseL + 74;
        const caseC2 = caseL + 154;
        rect(caseL, titleBottom, caseW, top - titleBottom);
        vline(caseC1, titleBottom, top);
        vline(caseC2, titleBottom, top);

        const caseLabelY1 = top - 18;
        const caseValueY1 = top - 40;
        const caseLabelY2 = titleBottom + 22;
        const caseValueY2 = titleBottom + 6;

        textCenter('案號', caseL, caseC1, caseLabelY1, SZ.hdr);
        textCenter('年度', caseC1, caseC2, caseLabelY1, SZ.hdr);
        textCenter('字第    號', caseC2, R, caseLabelY1, SZ.hdr);
        textCenter(normalizeCaseYear(d.caseYear), caseC1, caseC2, caseValueY1, SZ.body, 4);
        fitCenterInCell(c, d.caseSerial ? `${d.caseSerial} 號` : '', caseC2, R, caseValueY1, SZ.body);

        textCenter('承辦', caseL, caseC1, caseLabelY2, SZ.hdr);
        textCenter('股別', caseC2, R, caseLabelY2, SZ.hdr);
        textCenter(d.handler, caseL, caseC1, caseValueY2, SZ.body, 4);
        textCenter(d.division, caseC2, R, caseValueY2, SZ.body, 4);

        // 訴訟標的金額列（titleBottom ～ amountBottom）
        // 標籤欄縮窄，金額欄加寬以便完整顯示大字金額
        const amtH = titleBottom - amountBottom;
        const amountSplit = L + 148;
        rect(L, amountBottom, TW, amtH);
        vline(amountSplit, amountBottom, titleBottom);
        const amtY = amountBottom + amtH * 0.38;
        textCenter('訴訟標的金額或價額', L, amountSplit, amtY, SZ.hdr);
        drawAmountInCell(c, d.amountCN, amountSplit, R, titleBottom, amountBottom);

        // 當事人欄位表頭列（amountBottom ～ hdrBottom）
        rect(L, hdrBottom, TW, amountBottom - hdrBottom);
        drawPartyHeaderRow(c, hdrBottom, amountBottom, bodyL, cx);

        const bodyH = hdrBottom - bottom;
        const creditorH = Math.round(bodyH * 0.40);
        const creditorBottom = hdrBottom - creditorH;
        const restH = bodyH - creditorH;
        const debtor1H = debtors.length > 1 ? Math.round(restH * 0.42) : restH;
        const debtor1Bottom = creditorBottom - debtor1H;
        const debtor2Bottom = debtors.length > 1 ? bottom : debtor1Bottom;

        rect(L, debtor2Bottom, TW, hdrBottom - debtor2Bottom);
        vline(bodyL, debtor2Bottom, hdrBottom);
        hline(creditorBottom, bodyL, R);
        if (debtors.length > 1) hline(debtor1Bottom, bodyL, R);

        vLabel('聲請人即債權人', L + 1, hdrBottom - 6, creditorBottom + 6, SZ.hdr);
        vLabel('相對人即債務人', L + 1, creditorBottom - 6, debtor1Bottom + 6, SZ.hdr);
        if (debtors.length > 1) {
            vLabel('相對人即債務人', L + 1, debtor1Bottom - 6, bottom + 6, SZ.hdr);
        }

        const bodyX = bodyL + 14;
        let cy = hdrBottom - 30;
        text(`出租人：${d.landlordName}`, bodyX, cy, SZ.body);
        cy -= 24;
        text('地址：', bodyX, cy, SZ.body);
        wrap(d.landlordAddr, bodyX + 42, cy, TW - (bodyX - L) - 14, SZ.body, 19);
        cy -= 32;
        text(`電話：${d.landlordPhone || ''}`, bodyX, cy, SZ.body);

        drawDebtorBlock(c, bodyX, creditorBottom, debtors[0], d.propertyAddr);
        if (debtors.length > 1 && debtors[1]) {
            drawDebtorBlock(c, bodyX, debtor1Bottom, debtors[1], d.propertyAddr);
        }
    }

    function drawPage2(page, fonts, rgb, d, helpers) {
        const c = createCtx(page, fonts, rgb);
        const { text, wrap, rect, vLabel, black } = c;
        const buildExecTitle = helpers.buildExecTitle;
        const buildExecContentParagraphs = helpers.buildExecContentParagraphs;
        const buildExecTargetParagraphs = helpers.buildExecTargetParagraphs;
        const buildReasonParagraphs = helpers.buildReasonParagraphs;
        const buildEvidenceItems = helpers.buildEvidenceItems;

        const top = H - 44;
        const bottom = 38;
        const DATE_Y = 108;
        const PETITIONER_Y = 92;
        const evidenceItems = buildEvidenceItems();
        const footLineH = 15;
        const footPad = 12;
        const footInnerH = evidenceItems.length * footLineH + footPad;
        const FOOT_BOTTOM = 176;
        const FOOT_TOP = FOOT_BOTTOM + footInnerH;
        const COURT_Y = FOOT_TOP + 22;
        const CLOSE_Y = COURT_Y + 26;
        const REASON_MIN_Y = CLOSE_Y + 22;

        rect(L, bottom, TW, top - bottom);

        let y = top - 30;
        text('為聲請強制執行事：', L + 12, y, SZ.p2Title);
        y -= 28;
        text('一、聲請強制執行之內容：', L + 12, y, SZ.p2Hdr);
        y -= 22;
        y = drawParagraphList(c, buildExecContentParagraphs(d), L + 32, y, TW - 44, SZ.p2Body, 20, REASON_MIN_Y + 120) - 8;
        y -= 10;
        text('二、執行名義：', L + 12, y, SZ.p2Hdr);
        y -= 22;
        y = wrap(buildExecTitle(d), L + 32, y, TW - 44, SZ.p2Body, 20) - 6;
        y -= 10;
        text('三、執行標的：', L + 12, y, SZ.p2Hdr);
        y -= 22;
        y = drawParagraphList(c, buildExecTargetParagraphs(d), L + 32, y, TW - 44, SZ.p2Body, 20, REASON_MIN_Y) - 8;
        y -= 10;
        text('四、事由：', L + 12, y, SZ.p2Hdr);
        y -= 22;
        drawParagraphList(c, buildReasonParagraphs(d), L + 32, y, TW - 44, SZ.p2Body, 20, REASON_MIN_Y);

        const footLabelW = 48;
        rect(L, FOOT_BOTTOM, TW, FOOT_TOP - FOOT_BOTTOM);
        vLabel('證物名稱及件數', L + 2, FOOT_TOP - 4, FOOT_BOTTOM + 4, SZ.hdr);

        const footTextX = L + footLabelW + 6;
        const footTextW = TW - footLabelW - 12;
        let ey = FOOT_TOP - footPad;
        for (const item of evidenceItems) {
            ey = wrap(item, footTextX, ey, footTextW, SZ.body, footLineH) - 1;
        }

        text('謹　狀', L + 12, CLOSE_Y, SZ.p2Hdr);
        text(`臺灣${d.court}地方法院民事執行處　　　　公鑒`, L + 30, COURT_Y, SZ.p2Body);

        text(`中華民國${d.filingY}年${d.filingM}月${d.filingD}日`, L + 12, DATE_Y, SZ.body);
        text(`具狀人：${d.petitioner}`, L + 300, PETITIONER_Y, SZ.p2Hdr);
    }

    function drawPage3Checklist(page, fonts, rgb, d, helpers) {
        const c = createCtx(page, fonts, rgb);
        const { text, textCenter, rect, hline, vline, wrap, black } = c;
        const items = helpers.buildEvidenceChecklist();
        const debtors = debtorList(d);
        const caseName = debtors.map((t) => t.name).filter(Boolean).join('、')
            || d.debtorName || d.tenantName || '';
        const propertyAddr = d.propertyAddr || d.debtorAddr || d.tenantAddr
            || (debtors[0] && debtors[0].addr) || '';
        const notaryRef = d.notaryRef || '';

        const top = H - 52;
        const bottom = 48;
        rect(L, bottom, TW, top - bottom);

        textCenter('證物清單（業務備查用）', L, R, top - 28, 20);
        let metaY = top - 54;
        metaY = wrap(`案件：${caseName}`, L + 14, metaY, TW - 28, SZ.body, 18) - 4;
        metaY = wrap(`承租地址：${propertyAddr}`, L + 14, metaY, TW - 28, SZ.body, 18) - 4;
        metaY = wrap(`公證書字號：${notaryRef}`, L + 14, metaY, TW - 28, SZ.body, 18) - 6;

        const tableTop = Math.min(metaY - 8, top - 96);
        const tableBottom = bottom + 90;
        const colCheck = L + 36;
        const colNo = L + 72;
        const colQty = L + 400;
        const colDone = L + 470;
        const hdrY = tableTop - 22;

        hline(tableTop, L, R);
        hline(hdrY, L, R);
        hline(tableBottom, L, R);
        vline(L, tableBottom, tableTop);
        vline(colCheck, tableBottom, tableTop);
        vline(colNo, tableBottom, tableTop);
        vline(colQty, tableBottom, tableTop);
        vline(colDone, tableBottom, tableTop);
        vline(R, tableBottom, tableTop);

        textCenter('勾選', L, colCheck, hdrY + 4, SZ.hdrSm);
        textCenter('序號', colCheck, colNo, hdrY + 4, SZ.hdrSm);
        textCenter('證物名稱', colNo, colQty, hdrY + 4, SZ.hdrSm);
        textCenter('件數', colQty, colDone, hdrY + 4, SZ.hdrSm);
        textCenter('已備妥', colDone, R, hdrY + 4, SZ.hdrSm);

        const rowH = 36;
        let rowY = hdrY;
        items.forEach((item) => {
            rowY -= rowH;
            hline(rowY, L, R);
            text('□', L + 14, rowY + 10, SZ.body);
            textCenter(String(item.no), colCheck, colNo, rowY + 10, SZ.body);
            wrap(item.name, colNo + 4, rowY + 20, colQty - colNo - 8, SZ.body, 16);
            textCenter(item.qty, colQty, colDone, rowY + 10, SZ.body);
            text('□', colDone + 22, rowY + 10, SZ.body);
        });

        const noteY = bottom + 58;
        wrap('※ 本頁供內部遞狀前確認證物是否備齊，無須隨狀繳法院。', L + 14, noteY, TW - 200, SZ.body, 18);
        text(`列印日期：中華民國${d.filingY}年${d.filingM}月${d.filingD}日`, L + 14, bottom + 18, SZ.hdrSm);

        const signX = R - 168;
        text('主管簽名：', signX, bottom + 52, SZ.body);
        page.drawLine({
            start: { x: signX + 72, y: bottom + 48 },
            end: { x: R - 14, y: bottom + 48 },
            thickness: B,
            color: black
        });
    }

    window.buildEnforcementPetitionPdf = async function (PDFLib, fontBytes, d, helpers) {
        const { PDFDocument, rgb, StandardFonts } = PDFLib;
        const doc = await PDFDocument.create();
        doc.registerFontkit(window.fontkit);
        const fonts = {
            kai: await doc.embedFont(fontBytes),
            times: await doc.embedFont(StandardFonts.TimesRoman)
        };

        const page1 = doc.addPage([W, H]);
        drawPage1(page1, fonts, rgb, d, helpers);

        const page2 = doc.addPage([W, H]);
        drawPage2(page2, fonts, rgb, d, helpers);

        const page3 = doc.addPage([W, H]);
        drawPage3Checklist(page3, fonts, rgb, d, helpers);

        return doc.save();
    };
})();
