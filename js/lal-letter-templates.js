/**
 * 存證信函內文範本（星鴻社宅）
 * 佔位符由 lal-generator.js 依表單欄位替換
 */
(function () {
    'use strict';

    window.LAL_LETTER_FIELD_DEFS = {
        creditor: { label: '催告主體（承租人向）', type: 'select', options: [
            { value: '本公司', label: '本公司（包租／代管）' },
            { value: '本人', label: '本人（出租人直催）' }
        ] },
        landlordName: { label: '出租人全名（代管用）', type: 'text', placeholder: '例：王○○' },
        propertyOwner: { label: '房屋所有權人全名（代管用）', type: 'text', placeholder: '例：李○○' },
        addr: { label: '租賃標的地址', type: 'address' },
        simpleAddr: { label: '房屋坐落（簡式）', type: 'text', placeholder: '例：台北市○○街○○號', fullWidth: true },
        lease: { label: '租期', type: 'lease' },
        leaseRoc: { label: '租期（民國）', type: 'leaseRoc' },
        rentMonthly: { label: '每月租金（元）', type: 'text', placeholder: '例：15000' },
        rentPayDay: { label: '每月給付日（號）', type: 'text', placeholder: '例：5' },
        arrearsSince: { label: '欠租起算日（未付租金自）', type: 'datePick' },
        arrearsTotal: { label: '積欠／應付金額（元）', type: 'text', placeholder: '例：30000' },
        owedMonth: { label: '應給付租金月份', type: 'owedMonth' },
        owedAmount: { label: '請於七日內給付（元）', type: 'text', placeholder: '例：15000' },
        priorLetter: { label: '前次存證信函（寄發資訊）', type: 'priorLetter' },
        leaseEndDate: { label: '租期屆滿／契約終止日', type: 'date' },
        inspectDateTime: { label: '約定點交日期時間', type: 'datetime' }
    };

    window.LAL_LETTER_TEMPLATES = [
        {
            id: 'arrears-under-2m',
            group: '一、欠繳租金',
            title: '【金額扣除押金後未累計至二個月】',
            fields: ['creditor', 'addr', 'lease', 'rentMonthly', 'rentPayDay', 'owedMonth', 'owedAmount'],
            body: '台端向{{creditor}}承租{{addr}}，{{leaseTerm}}，租金為每月{{rentMonthly}}元，並定期於每月{{rentPayDay}}日給付之。頃查台端應給付{{creditorLabel}}{{owedMonth}}租金，迄未蒙台端依約給付，特此通知，請於文到後七日內給付租金{{owedAmount}}元，以為誠信是禱。'
        },
        {
            id: 'arrears-2m-1',
            group: '一、欠繳租金',
            title: '【欠租累計達二個月】第一封',
            fields: ['addr', 'lease', 'rentMonthly', 'rentPayDay', 'arrearsSince', 'arrearsTotal'],
            body: '臺端向本公司承租{{addr}}，{{leaseTerm}}，租金為每月{{rentMonthly}}元，並定期於每月{{rentPayDay}}日給付之。詎臺端{{arrearsSince}}即未曾依約給付租金，迄今積欠金額已達二個月租金額，共計{{arrearsTotal}}元，未蒙臺端依約給付，為此特以本函催告臺端於函到後三日內付清租金，如逾期仍未清償，本公司將依法終止租賃契約。'
        },
        {
            id: 'arrears-2m-2',
            group: '一、欠繳租金',
            title: '【欠租累計達二個月】第二封',
            fields: ['addr', 'lease', 'rentMonthly', 'rentPayDay', 'arrearsSince', 'arrearsTotal', 'priorLetter'],
            body: '臺端向本公司承租{{addr}}，{{leaseTerm}}，租金為每月{{rentMonthly}}元，並定期於每月{{rentPayDay}}日給付之。詎臺端{{arrearsSince}}即未曾依約給付租金，迄今已積欠租金達二個月租金額，共計{{arrearsTotal}}元，經本公司{{priorLetter}}定期催告臺端限期清償租金，惟臺端迄仍未履行，特依法以本函終止租約，並以函到之翌日起算三十日為租賃契約終止之時，逾終止日若臺端仍未點交，本公司將依約計算懲罰性違約金並提起訴訟，不另通知，請臺端於終止前與本公司聯繫辦理點交事並遷讓房屋，以免訟累是禱。'
        },
        {
            id: 'escrow-2m-1',
            group: '一、欠繳租金',
            title: '【代管案件】欠租累計達二個月（第一封）',
            fields: ['landlordName', 'propertyOwner', 'addr', 'lease', 'rentMonthly', 'rentPayDay', 'arrearsSince', 'arrearsTotal'],
            body: '{{escrowIntro}}臺端向{{propertyOwner}}承租{{addr}}，{{leaseTerm}}，租金為每月{{rentMonthly}}元，並定期於每月{{rentPayDay}}日給付之。詎臺端{{arrearsSince}}即未曾依約給付租金，迄今積欠金額已達二個月租金額，共計{{arrearsTotal}}元，未蒙臺端依約給付，為此特以本函催告臺端於函到後三日內付清租金，如逾期仍未清償，{{landlordName}}將依法終止租賃契約。'
        },
        {
            id: 'escrow-2m-2',
            group: '一、欠繳租金',
            title: '【代管案件】欠租達二個月（第二封）',
            fields: ['landlordName', 'propertyOwner', 'addr', 'lease', 'rentMonthly', 'rentPayDay', 'arrearsSince', 'arrearsTotal', 'priorLetter'],
            body: '{{escrowIntro}}臺端向{{propertyOwner}}承租{{addr}}，{{leaseTerm}}，租金為每月{{rentMonthly}}元，並定期於每月{{rentPayDay}}日給付之。詎臺端{{arrearsSince}}即未曾依約給付租金，迄今已積欠租金達二個月租金額，共計{{arrearsTotal}}元，經{{landlordName}}{{priorLetter}}定期催告臺端限期清償租金，惟臺端迄仍未履行，特依法以本函終止租約，並以函到之翌日起算三十日為租賃契約終止之時，逾終止日若臺端仍未點交，{{landlordName}}將依約計算懲罰性違約金並提起訴訟，不另通知，請臺端於終止前與{{landlordName}}及本公司聯繫辦理點交事並遷讓房屋，以免訟累是禱。'
        },
        {
            id: 'art13-1',
            group: '二、依租賃契約第十三條得提前終止',
            title: '第一封',
            fields: ['addr', 'lease', 'rentMonthly', 'rentPayDay'],
            body: '台端向本公司承租{{addr}}，{{leaseTerm}}，租金為每月{{rentMonthly}}元，並定期於每月{{rentPayDay}}日給付之，今日因房屋有收回使用之需要，請台端配合依租賃契約第十三條得提前終止之約定配合辦理，為此特以本函通知台端於函到後三十日租賃契約即行終止，請於前開期限內完成點交並遷讓房屋。'
        },
        {
            id: 'art13-2',
            group: '二、依租賃契約第十三條得提前終止',
            title: '第二封',
            fields: ['addr', 'lease', 'rentMonthly', 'rentPayDay', 'priorLetter'],
            body: '臺端向本公司承租{{addr}}，{{leaseTerm}}，租金為每月{{rentMonthly}}元，並定期於每月{{rentPayDay}}日給付之，今日因房屋有收回使用之需要，經本公司{{priorLetter}}通知臺端配合租賃契約第十三條得提前終止之約定辦理，惟臺端迄今仍未履行，為此特以本函通知臺端，無權占有期間內本公司將依約計算懲罰性違約金並提起訴訟，請臺端於函到後與本公司聯繫會同點交，並遷讓房屋，以免訟累是禱。'
        },
        {
            id: 'handover-tenant',
            group: '三、催告點交',
            title: '催告點交（催告房客）',
            fields: ['addr', 'leaseEndDate'],
            body: '台端向本公司承租{{addr}}，業已於{{leaseEndDate}}租期屆滿，多次聯繫台端共同點交租賃物時間，皆未得到台端之回覆，本公司特以存證信函通知台端於函到五日內與本公司約定共同完成屋況、設備點交返還房屋的時間，台端若仍置之不理，將視為已完成點交，請台端務必配合，切勿自誤。'
        },
        {
            id: 'handover-landlord',
            group: '三、催告點交',
            title: '催告點交（催告房東）',
            fields: ['addr', 'leaseEndDate', 'inspectDateTime'],
            body: '本公司向台端承租{{addr}}，業已於{{leaseEndDate}}租賃契約終止，本公司特以存證信函通知台端於{{inspectDateTime}}與本公司共同完成屋況、設備點交返還房屋的時間，台端若仍置之不理，將視為已完成點交。懇請台端配合！'
        },
        {
            id: 'leftover',
            group: '四、點交後遺留物處理',
            title: '點交後遺留物處理',
            fields: ['addr', 'leaseEndDate'],
            body: '台端向本公司承租{{addr}}，業已於{{leaseEndDate}}租期屆滿，並點交完成後，台端尚有遺留物未取，為避免爾後發生法律糾紛，本公司特以存證信函通知台端於函到五日內取走遺留物品，逾期仍不取回時，視為拋棄其所有權，處理費用將自應返還台端之押金中扣除。請台端務必配合，切勿自誤！'
        },
        {
            id: 'no-renewal',
            group: '五、通知承租人租賃期滿將不為續租',
            title: '租賃期滿不續租',
            fields: ['simpleAddr', 'leaseRoc'],
            body: '台端承租本人所有不動產坐落於{{simpleAddr}}之房屋，雙方並簽具房屋租賃契約書在案，{{leaseTermRoc}}，因本人有使用房屋之必要，依民法第450條第1項租賃定有期限者，其租賃關係，於期限屆滿時消滅之規定，特函通知房屋租賃期滿將不會續租，請台端提前尋找合適房屋，以為後續之遷離，減少相關損失。'
        }
    ];
})();
