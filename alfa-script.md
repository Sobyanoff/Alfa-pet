const TOKEN = "8762618827:AAHufxsBalN5WNCxtW_XOPAPRE0MrffcoeU";
const DEPLOYMENT_ID = "AKfycbzMRtjBrW22VOtMFcLmDKTe4Hjw3yPkssavdTU8-cm4IC15OKLk3bS0YfipEXSvyaRTPA";
const URI = `https://script.google.com/macros/s/${DEPLOYMENT_ID}/exec`;
const ACTIVE_SPREADSHEET = SpreadsheetApp.getActiveSpreadsheet();
const USER_TAB = ACTIVE_SPREADSHEET.getSheetByName("users");
function getReportTab(chatId) {
    let reportSheets = {};
    const chatIdRange = USER_TAB.getRange("B:B").getValues();
    const sheetNameRange = USER_TAB.getRange("E:E").getValues();
    for (let i = 0; i < chatIdRange.length; i++) {
        let currentChatId = chatIdRange[i][0];
        let currentSheetName = sheetNameRange[i][0];
        if (currentChatId && currentSheetName) {
            reportSheets[currentChatId] = currentSheetName;
        }
    }
    const sheetName = reportSheets[chatId];
    return sheetName ? ACTIVE_SPREADSHEET.getSheetByName(sheetName) : null;
}
function writeValueToCell(sheet, cell, value) {
    sheet.getRange(cell).setValue(value);
}
function getLastRow(sheet) {
    return sheet.getLastRow() + 1;
}
function convertToDate(sec) {
    let date = new Date(sec * 1000);
    return date.toLocaleDateString('ru-RU');
}
// Функция оправки сообщения и кнопок
function sendMessage(chatId, messageForUser, buttons = null ) {
    let payload = {
        method: 'sendMessage',
        chat_id: String(chatId),
        text: messageForUser,
        parse_mode: 'HTML'
    };
    if (buttons) {
        payload.reply_markup = JSON.stringify({
            keyboard: buttons,
            resize_keyboard: true,
            one_time_keyboard: false,
            selective: true
        });
    } else {
        payload.reply_markup = JSON.stringify({
            remove_keyboard: true
        });
    }
    let data = {
        method: 'post',
        payload: payload
    };
    UrlFetchApp.fetch('https://api.telegram.org/bot'
 + TOKEN + '/', data);
}
// Отправка основных кнопок и сообщение 
function sendMessageWithMainButtons(chatId, messageText) {
    const buttons = [
        [{ text: "Результат за день" }],
        [{ text: "Начать встречу" }]
    ];
    sendMessage(chatId, messageText, buttons);
}
// Регистрация нового пользователя
function registerUser(data) {
    let lastRow = getLastRow(USER_TAB);
    let dateRegistered = convertToDate(data.date
);
    let chatId = data.from.id
;
    let username = data.from.username;
    let first_name = data.from.first_name;
    writeValueToCell(USER_TAB, `A${lastRow}`, dateRegistered);
    writeValueToCell(USER_TAB, `B${lastRow}`, chatId);
    writeValueToCell(USER_TAB, `C${lastRow}`, username);
    writeValueToCell(USER_TAB, `D${lastRow}`, first_name);
    let messageForUser = `
Здравствуйте! 👋 Необходимо представиться.
Для этого напишите свою РАБОЧУЮ ПОЧТУ без @аlfаbаnk.ru. 
Пример: YRozhkov
    `;
    sendMessage(chatId, messageForUser);
    USER_TAB.getRange(`F${lastRow}`).setValue("FIO");
}
// Пользователь представляется
function processFIOInput(chatId, fullName) {
    let lastRow = getRowUser(USER_TAB, chatId);
    if (lastRow !== null) {
        writeValueToCell(USER_TAB, `E${lastRow}`, fullName);
        sendMessage(chatId, `
Супер, почти готово!
Осталось добавить вас в таблицу, можете проверить готовность:
        `, [[{ text: "Проверить готовность" }]]);
        USER_TAB.getRange(`F${lastRow}`).setValue("Active");
    }
}
// Проверка наличия таблицы для сотрудника
function checkReadiness(chatId) {
    let lastRow = getRowUser(USER_TAB, chatId);
    if (lastRow !== null) {
        let userName = USER_TAB.getRange(`E${lastRow}`).getValue();
        const sheetExists = checkIfSheetExists(userName);
        if (sheetExists) {
            USER_TAB.getRange(`G${lastRow}`).setValue("Active");
            sendMessage(chatId, `
Отлично, уже можно пользоваться!
Нажмите "Начать встречу", чтобы приступить.
            `, [[{ text: "Начать встречу" }]]);
        } else {
            USER_TAB.getRange(`G${lastRow}`).setValue("N
21:11


ot active");
            sendMessage(chatId, `
Ещё не готово. Пожалуйста, обратитесь к вашему НГ/Эксперту или попробуйте снова.
            `, [[{ text: "Проверить готовность" }]]);
        }
    } else {
        sendMessage(chatId, "Ваши данные не найдены, попробуйте зарегистрироваться заново.", [[{ text: "/start" }]]);
    }
}
// Функция, которая ищет пользователя на отдельном листе 
function checkIfSheetExists(sheetName) {
    const sheets = SpreadsheetApp.getActiveSpreadsheet().getSheets();
    for (let i = 0; i < sheets.length; i++) {
        if (sheets[i].getName() === sheetName) {
            return true;
        }
    }
    return false;
}
function getRowUser(sheet, chatId) {
    let columnB = sheet.getRange("B:B").getValues(); 
    for (let row = 0; row < columnB.length; row++) {
        if (columnB[row][0] == chatId) {
            return row + 1; 
        }
    }
    return null; 
}
// Начало встречи
function handleStartMeeting(message) {
    const chatId = message.from.id
;
    
    let lastRow = getRowUser(USER_TAB, chatId);
    
    if (lastRow === null) {
        sendMessage(chatId, `
Вы ещё не зарегистрированы... 😢  
Нажмите кнопку /start для регистрации.
        `, [[{ text: "/start" }]]);
    } else {
        const REPORT_TAB = getReportTab(chatId);
        REPORT_TAB.getRange("C56:CL56").clearContent();
        const date = convertToDate(Math.floor(Date.now
() / 1000));
        writeValueToCell(REPORT_TAB, `A56`, chatId);
        writeValueToCell(REPORT_TAB, `B56`, date);
    const buttons = [
        [{ text: "ДK" }, { text: "КК1" },{ text: "КК2" }],
        [{ text: "Х5" },{ text: "ЗПК" }, { text: "RE" }],
        [{ text: "СИМ" }, { text: "Семейный" }, { text: "ДК+Детская" }],
        [{ text: "Селфи n2b" }, { text: "Селфи ДК" }, { text: "Селфи КК" }],
        [{ text: "КН" }, { text: "Установка МП" }],
        [{ text: "Отказ банка" }]
    ];
    sendMessage(chatId, "Выберите основной продукт:", buttons);
    REPORT_TAB.getRange(`AW56`).setValue("OP");
    }
}
function handlePrimaryProduct(message) {
    const chatId = message.from.id
;
    const textMessage = message.text;
    const REPORT_TAB = getReportTab(chatId);
        const primaryProductMappings = {
        "ДK": "F",
        "Х5": "G",
        "ЗПК": "H",
        "RE": "I",
        "СИМ": "J",
        "Семейный": "K",
        "ДК+Детская": "L",
        "КК1": "O",
        "КК2": "P",
        "Установка МП": "AI",
        "Селфи n2b": "AC",
        "Селфи ДК": "AD",
        "Селфи КК": "AE",
        "КН": "AK",
        "Отказ банка": "AP"
    };
    const selectedProduct = Object.keys(primaryProductMappings).find(key => textMessage.includes(key));
    if (selectedProduct) {
        const productColumn = primaryProductMappings[selectedProduct];
        // Если выбран "ДК+Детская", добавляем +2
        if (selectedProduct === "ДК+Детская") {
            const currentValue = REPORT_TAB.getRange(`${productColumn}56`).getValue() || 0;
            REPORT_TAB.getRange(`${productColumn}56`).setValue(currentValue + 2);
        } else {
            // Для остальных продуктов добавляем +1
            const currentValue = REPORT_TAB.getRange(`${productColumn}56`).getValue() || 0;
            REPORT_TAB.getRange(`${productColumn}56`).setValue(currentValue + 1);
        }
    }
    const primaryProductMappingss = {
        "ДK": "BO",
        "Х5": "BP",
        "ЗПК": "BQ",
        "RE": "BR",
        "СИМ": "BS",
        "Семейный": "BT",
        "ДК+Детская": "BU",
        "КК1": "BV",
        "КК2": "BW",
        "Установка МП": "BX",
        "Селфи n2b": "BY",
        "Селфи ДК": "BZ",
        "Селфи КК": "CA",
        "КН": "CC"
    };
    const selectedProductt = Object.keys(primaryProductMappingss).find(key => textMessage.includes(key));
    if (selectedProductt) {
        const productColumn = primaryProductMappingss[selectedProductt];
        
        const currentValue = REPORT_TAB.getRange(`${productColumn}56`).getValue() || 0;
        
        REP
21:11
ORT_TAB.getRange(`${productColumn}56`).setValue(currentValue + 1);
    }
    if (textMessage === 'ДK' || textMessage === 'Х5'|| textMessage === 'ЗПК'|| textMessage === 'RE'|| textMessage === 'СИМ'|| textMessage === 'Семейный'|| textMessage === 'ДК+Детская') {
        handleMainProductActivationTransaction_DC(chatId);
        return;
    }
    if (textMessage === 'КК1' || textMessage === 'КК2') {
        handleMainProductActivationTransaction_KK(chatId);
        return;
    }
    if (textMessage === 'Селфи n2b' || textMessage === 'Селфи ДК' || textMessage === 'Селфи КК') {
        handleMainProductActivationTransaction_Self(chatId);
        return;
    }
    if (textMessage === 'Отказ банка') {
        REPORT_TAB.getRange(`CN56`).setValue(1);
    }
    if (textMessage === 'Установка МП' || textMessage === 'Отказ банка' ||  textMessage === 'КН') {
        REPORT_TAB.getRange(`CM56`).setValue(1);
        sendMessageComplite(chatId, "Что дальше?");
        return;
    }
}
// Транзакция и активация основного продукта
function handleMainProductActivationTransaction_DC(chatId) {
    const REPORT_TAB = getReportTab(chatId);
    const buttons = [
        [{ text: "ВА+ ТР+" }, { text: "ВА+ ТР-" }, { text: "В+" }]
    ];
    sendMessage(chatId, "Сделал транзакцию и активацию по основному продукту?", buttons);
    REPORT_TAB.getRange(`AW56`).setValue("DC_ACT_TR");
}
function handleMainProductActivationResponse_DC(message) {
    const chatId = message.from.id
;
    const textMessage = message.text;
    const REPORT_TAB = getReportTab(chatId);
    const values = REPORT_TAB.getRange("M56:N56").getValues()[0];
    let currentActivationValue = values[0] || 0;
    let currentTransactionValue = values[1] || 0;
    if (textMessage === "ВА+ ТР+") {
        currentActivationValue += 1;
        currentTransactionValue += 1;
        REPORT_TAB.getRange("M56:N56").setValues([[currentActivationValue, currentTransactionValue]]);
        REPORT_TAB.getRange("AY56").setValue(2);
    } else if (textMessage === "ВА+ ТР-") {
        currentActivationValue += 1;
        REPORT_TAB.getRange("M56").setValue(currentActivationValue);
        REPORT_TAB.getRange("AY56").setValue(1);
    }
    const buttons = [
        [{ text: "КЛ/ККК" }, { text: "КДК к ДК" }],
        [{ text: "Селфи n2b" }, { text: "Селфи ДК" }, { text: "Селфи КК" }],
        [{ text: "Кросс СИМ" }, { text: "Кросс Детская" }],
        [{ text: "Пропустить" }]
    ];
    sendMessage(chatId, `Выберите доп. продукт:`, buttons);
    REPORT_TAB.getRange("AW56").setValue("CP");
}
function handleMainProductActivationTransaction_KK(chatId) {
    const REPORT_TAB = getReportTab(chatId);
    const buttons = [
        [{ text: "ВА+ ТР+" }, { text: "ВА+ ТР-" }, { text: "В+" }]
    ];
    sendMessage(chatId, "Сделал транзакцию и активацию по основному продукту?", buttons);
    REPORT_TAB.getRange(`AW56`).setValue("KK_ACT_TR");
}
function handleMainProductActivationResponse_KK(message) {
    const chatId = message.from.id
;
    const textMessage = message.text;
    const REPORT_TAB = getReportTab(chatId);
    const values = REPORT_TAB.getRange("Q56:R56").getValues()[0];
    let currentActivationValue = values[0] || 0;
    let currentTransactionValue = values[1] || 0;
    if (textMessage === "ВА+ ТР+") {
        currentActivationValue += 1;
        currentTransactionValue += 1;
        REPORT_TAB.getRange("Q56:R56").setValues([[currentActivationValue, currentTransactionValue]]);
        REPORT_TAB.getRange("AY56").setValue(2);
    } else if (textMessage === "ВА+ ТР-") {
        currentActivationValue += 1;
        REPORT_TAB.getRange("Q56").setValue(currentActivationValue);
        REPORT_TAB.getRange("AY56").setValue(1);
    }
    const buttons = [
        [{ text: "КЛ/ККК" }, { text: "КДК к ДК" }],
        [{ text: "Селфи n2b" }, { text: "Селфи ДК" }, { text: "Селфи КК" }],
        [{ text: "Кросс СИМ" }, { text: "Кросс Детская" }],
        [{ text: "Пропустить" }]
    ];
    sendMessage(chatId, `Выберите до
21:11
п. продукт:`, buttons);
    REPORT_TAB.getRange("AW56").setValue("CP");
}
function handleMainProductActivationTransaction_Self(chatId) {
    const REPORT_TAB = getReportTab(chatId);
    const buttons = [
        [{ text: "ВА+ ТР+" }, { text: "ВА+ ТР-" }, { text: "В+" }]
    ];
    sendMessage(chatId, "Сделал транзакцию и активацию по основному продукту?", buttons);
    REPORT_TAB.getRange(`AW56`).setValue("Self_ACT_TR");
}
function handleMainProductActivationResponse_Self(message) {
    const chatId = message.from.id
;
    const textMessage = message.text;
    const REPORT_TAB = getReportTab(chatId);
    const values = REPORT_TAB.getRange("AF56:AG56").getValues()[0];
    let currentActivationValue = values[0] || 0;
    let currentTransactionValue = values[1] || 0;
    if (textMessage === "ВА+ ТР+") {
        currentActivationValue += 1;
        currentTransactionValue += 1;
        REPORT_TAB.getRange("AF56:AG56").setValues([[currentActivationValue, currentTransactionValue]]);
        REPORT_TAB.getRange("AY56").setValue(2);
    } else if (textMessage === "ВА+ ТР-") {
        currentActivationValue += 1;
        REPORT_TAB.getRange("AF56").setValue(currentActivationValue);
        REPORT_TAB.getRange("AY56").setValue(1);
    }
    const buttons = [
        [{ text: "КЛ/ККК" }, { text: "КДК к ДК" }],
        [{ text: "Селфи n2b" }, { text: "Селфи ДК" }, { text: "Селфи КК" }],
        [{ text: "Кросс СИМ" }, { text: "Кросс Детская" }],
        [{ text: "Пропустить" }]
    ];
    sendMessage(chatId, `Выберите доп. продукт:`, buttons);
    REPORT_TAB.getRange("AW56").setValue("CP");
}
// Выбор кросс продукта
function handleAdditionalProduct(message) {
    const chatId = message.from.id
;
    const textMessage = message.text;
    const REPORT_TAB = getReportTab(chatId);
    if (textMessage.toLowerCase() == 'пропустить') {
        handleExtraSalesSelection(chatId);
        return;
    }
    const additionalProductMappings = {
        "КЛ/ККК": "X",
        "КДК к КК": "T",
        "КДК к ДК": "U",
        "Селфи n2b": "AC",
        "Селфи ДК": "AD",
        "Селфи КК": "AE",
        "Кросс СИМ": "AJ",
        "Кросс Детская": "AN"
    };
    const selectedProduct = Object.keys(additionalProductMappings).find(key => textMessage.includes(key));
    if (selectedProduct) {
        const productColumn = additionalProductMappings[selectedProduct];
        
        const currentValue = REPORT_TAB.getRange(`${productColumn}56`).getValue() || 0;
        
        REPORT_TAB.getRange(`${productColumn}56`).setValue(currentValue + 1);
    }
    const additionalProductMappingss = {
        "КЛ/ККК": "CD",
        "КДК к КК": "CE",
        "КДК к ДК": "CF",
        "Селфи n2b": "CG",
        "Селфи ДК": "CH",
        "Селфи КК": "CI",
        "Кросс СИМ": "CJ",
        "Кросс Детская": "CK"
    };
    const selectedProductt = Object.keys(additionalProductMappingss).find(key => textMessage.includes(key));
    if (selectedProductt) {
        const productColumn = additionalProductMappingss[selectedProductt];
        
        const currentValue = REPORT_TAB.getRange(`${productColumn}56`).getValue() || 0;
        
        REPORT_TAB.getRange(`${productColumn}56`).setValue(currentValue + 1);
    }
    if (textMessage === 'КЛ/ККК') {
        handleAdditionalProductTransaction_KL(chatId);
        return;
    }
    if (textMessage === 'КДК к КК' || textMessage === 'КДК к ДК') {
        handleAdditionalProductTransaction_KDK(chatId);
        return;
    }
    if (textMessage === 'Селфи n2b' || textMessage === 'Селфи ДК' || textMessage === 'Селфи КК') {
        handleAdditionalProductTransaction_Self(chatId);
        return;
    }
    if (textMessage === 'Кросс СИМ' || textMessage === 'Кросс Детская') {
        handleAdditionalProductTransaction_diff(chatId);
        return;
    }
}
// Транзакция и активация кросс продукта
function handleAdditionalProductTransaction_KL(chatId) {
    const REPORT_TAB = getReportTab(chatId);
    const buttons = [
        [{ t
21:11
ext: "ТР+" }, { text: "ТР-" }]
    ];
    sendMessage(chatId, "Сделал транзакцию и активацию по кросс продукту?", buttons);
    REPORT_TAB.getRange(`AW56`).setValue("KL_ACT_TR");
}
function handleAdditionalProductTransactionResponse_KL(message) {
    const chatId = message.from.id
;
    const textMessage = message.text;
    const REPORT_TAB = getReportTab(chatId);
    const currentActivationValue = REPORT_TAB.getRange(`Y56`).getValue() || 0;
    if (textMessage === "ТР+") {
        REPORT_TAB.getRange(`Y56`).setValue(currentActivationValue + 1);
        REPORT_TAB.getRange(`AZ56`).setValue(2);
    }
    handleExtraSalesSelection(chatId);
}
function handleAdditionalProductTransaction_KDK(chatId) {
    const REPORT_TAB = getReportTab(chatId);
    const buttons = [
        [{ text: "ВА+ ТР+" }, { text: "ВА+ ТР-" }, { text: "В+" }]
    ];
    sendMessage(chatId, "Сделал транзакцию и активацию по кросс продукту?", buttons);
    REPORT_TAB.getRange(`AW56`).setValue("KDK_ACT_TR");
}
function handleAdditionalProductTransactionResponse_KDK(message) {
    const chatId = message.from.id
;
    const textMessage = message.text;
    const REPORT_TAB = getReportTab(chatId);
    const currentActivationValue = REPORT_TAB.getRange(`V56`).getValue() || 0;
    const currentTransactionValue = REPORT_TAB.getRange(`W56`).getValue() || 0;
    if (textMessage === "ВА+ ТР+") {
        REPORT_TAB.getRange(`V56`).setValue(currentActivationValue + 1);
        REPORT_TAB.getRange(`W56`).setValue(currentTransactionValue + 1);
        REPORT_TAB.getRange(`AZ56`).setValue(2);
    } else if (textMessage === "ВА+ ТР-") {
        REPORT_TAB.getRange(`V56`).setValue(currentActivationValue + 1);
        REPORT_TAB.getRange(`AZ56`).setValue(1);
    }
    handleExtraSalesSelection(chatId);
}
function handleAdditionalProductTransaction_Self(chatId) {
    const REPORT_TAB = getReportTab(chatId);
    const buttons = [
        [{ text: "ВА+ ТР+" }, { text: "ВА+ ТР-" }, { text: "В+" }]
    ];
    sendMessage(chatId, "Сделал транзакцию и активацию по кросс продукту?", buttons);
    REPORT_TAB.getRange(`AW56`).setValue("Self_ACT_TR_2");
}
function handleAdditionalProductTransactionResponse_Self(message) {
    const chatId = message.from.id
;
    const textMessage = message.text;
    const REPORT_TAB = getReportTab(chatId);
    const currentActivationValue = REPORT_TAB.getRange(`AF56`).getValue() || 0;
    const currentTransactionValue = REPORT_TAB.getRange(`AG56`).getValue() || 0;
    if (textMessage === "ВА+ ТР+") {
        REPORT_TAB.getRange(`AF56`).setValue(currentActivationValue + 1);
        REPORT_TAB.getRange(`AG56`).setValue(currentTransactionValue + 1);
        REPORT_TAB.getRange(`AZ56`).setValue(2);
    } else if (textMessage === "ВА+ ТР-") {
        REPORT_TAB.getRange(`AF56`).setValue(currentActivationValue + 1);
        REPORT_TAB.getRange(`AZ56`).setValue(1);
    }
    handleExtraSalesSelection(chatId);
}
function handleAdditionalProductTransaction_diff(chatId) {
    const REPORT_TAB = getReportTab(chatId);
    const buttons = [
        [{ text: "ВА+ ТР+" }, { text: "ВА+ ТР-" }, { text: "В+" }]
    ];
    sendMessage(chatId, "Сделал транзакцию и активацию по кросс продукту?", buttons);
    REPORT_TAB.getRange(`AW56`).setValue("Diff_ACT_TR");
}
function handleAdditionalProductTransactionResponse_diff(message) {
    const chatId = message.from.id
;
    const textMessage = message.text;
    const REPORT_TAB = getReportTab(chatId);
    if (textMessage === "ВА+ ТР+") {
        REPORT_TAB.getRange(`AZ56`).setValue(2);
    } else if (textMessage === "ВА+ ТР-") {
        REPORT_TAB.getRange(`AZ56`).setValue(1);
    }
    handleExtraSalesSelection(chatId);
}
// Дополнительные продажи
function handleExtraSalesSelection(chatId) {
    const REPORT_TAB = getReportTab(chatId);
    sendMessage(chatId, "БС или Инвесткопилка?", [
        [{ text: "БС (покупка от 1000)" }],
        [{ text: "Инвесткопилка (пополнение от 2500)" }],
        [{ text: "-" }]
    ]);
    REPORT_T
21:11
AB.getRange(`AW56`).setValue("EXTRA_SALES_0");
}
function handleExtraSales1(chatId) {
    const REPORT_TAB = getReportTab(chatId);
    sendMessage(chatId, "ЦП или Вок?", [
        [{ text: "ЦП" }, { text: "Вок" }],
        [{ text: "ЦП и Вок" }],
        [{ text: "-" }]
    ]);
    REPORT_TAB.getRange(`AW56`).setValue("EXTRA_SALES_1");
}
function handleExtraSales2(chatId) {
    const REPORT_TAB = getReportTab(chatId);
    sendMessage(chatId, "Ещё продукты на выбор или «Далее»", [
        [{ text: "Смарт" }, { text: "Комбо 1₽" }],
        [{ text: "Кэш" }, { text: "Защитник" }],
        [{ text: "ПДС" }, { text: "Пенсия" }],
        [{ text: "Установка МП Х5" }],
        [{ text: "Далее" }]
    ]);
    REPORT_TAB.getRange(`AW56`).setValue("EXTRA_SALES_2");
}
function handleExtraSales3(chatId) {
    const REPORT_TAB = getReportTab(chatId);
    const rowData = REPORT_TAB.getRange(`O56:CM56`).getValues()[0];
    const isKKIssued = rowData[0];
    let isSpecialProductSelected = REPORT_TAB.getRange(`CM56`).getValue() === 1;
    if (isKKIssued === 1) {
        sendMessage(chatId, "ФЗ КК1 или УП?", [
            [{ text: "ФЗ КК1" }, { text: "УП" }],
            [{ text: "ФЗ КК1 и УП" }],
            [{ text: "-" }]
        ]);
        REPORT_TAB.getRange(`AW56`).setValue("EXTRA_SALES_3");
    } else if (isSpecialProductSelected) {
        sendMessage(chatId, "Завершить встречу?", [[{ text: "Завершить встречу" }]]);
    } else {
        handleAppInstallationAndPhoneType({ from: { id: chatId } });
    }
}
function handleExtraSales(message) {
    const chatId = message.from.id
;
    const textMessage = message.text.toLowerCase();
    const REPORT_TAB = getReportTab(chatId);
    const rowData = REPORT_TAB.getRange(`AE56:AW56`).getValues()[0];
    const stage = rowData[rowData.length - 1];
    if (stage === "EXTRA_SALES_0") {
        if (textMessage === 'бс (покупка от 1000)') {
            writeValueToCell(REPORT_TAB, `AA56`, 1);
        } else if (textMessage === 'инвесткопилка (пополнение от 2500)') {
            writeValueToCell(REPORT_TAB, `Z56`, 1);
        }
        handleExtraSales1(chatId);
    } else if (stage === "EXTRA_SALES_1") {
        if (textMessage === 'цп') {
            writeValueToCell(REPORT_TAB, `AB56`, 1);
        } else if (textMessage === 'вок') {
            writeValueToCell(REPORT_TAB, `AO56`, 1);
        } else if (textMessage === 'цп и вок') {
            writeValueToCell(REPORT_TAB, `AB56`, 1);
            writeValueToCell(REPORT_TAB, `AO56`, 1);
        }
        handleExtraSales2(chatId);
    } else if (stage === "EXTRA_SALES_2") {
        if (textMessage === 'кэш') {
            writeValueToCell(REPORT_TAB, `AL56`, 1);
        } else if (textMessage === 'защитник') {
            writeValueToCell(REPORT_TAB, `AM56`, 1);
        } else if (textMessage === 'смарт') {
            writeValueToCell(REPORT_TAB, `AQ56`, 1);
        } else if (textMessage === 'установка мп х5') {
            writeValueToCell(REPORT_TAB, `AR56`, 1);
        } else if (textMessage === 'пдс') {
            writeValueToCell(REPORT_TAB, `AS56`, 1);
        } else if (textMessage === 'пенсия') {
            writeValueToCell(REPORT_TAB, `AT56`, 1);
        } else if (textMessage === 'комбо 1₽') {
            writeValueToCell(REPORT_TAB, `AU56`, 1);
        } else if (textMessage === 'далее') {
            handleExtraSales3(chatId);
        }      
    } else if (stage === "EXTRA_SALES_3") {
        if (textMessage === 'фз кк1') {
            writeValueToCell(REPORT_TAB, `S56`, 1);
        } else if (textMessage === 'уп') {
            writeValueToCell(REPORT_TAB, `AP56`, 1);
            writeValueToCell(REPORT_TAB, `CO56`, 1);
        } else if (textMessage === 'фз кк1 и уп') {
            writeValueToCell(REPORT_TAB, `S56`, 1);
            writeValueToCell(REPORT_TAB, `AP56`, 1);
            writeValueToCell(REPORT_TAB, `CO56`, 1);
        } 
        handleAppInstallationAndPhoneType({ from: { id: chatId } }); 
        
    }
}
// Устано
21:11
вка приложения
function handleAppInstallationAndPhoneType(message) {
    const chatId = message.from.id
;
    const buttons = [
        [{ text: "Android установил" }, { text: "Android не установил" }],
        [{ text: "iPhone установил" }, { text: "iPhone не установил" }]
    ];
    sendMessage(chatId, "Установили приложение?", buttons);
    const REPORT_TAB = getReportTab(chatId);
    REPORT_TAB.getRange(`AW56`).setValue("APP");
}
function handleAppInstallationResponse(message) {
    const chatId = message.from.id
;
    const textMessage = message.text.toLowerCase();
    const REPORT_TAB = getReportTab(chatId);
    if (textMessage.includes('android установил')) {
        writeValueToCell(REPORT_TAB, `CL56`, 1);
        writeValueToCell(REPORT_TAB, `AH56`, 1);
    } else if (textMessage.includes('android не установил')) {
        writeValueToCell(REPORT_TAB, `CL56`, 1);
        writeValueToCell(REPORT_TAB, `AH56`, 0);
    } else if (textMessage.includes('iphone установил')) {
        writeValueToCell(REPORT_TAB, `AH56`, 1);
    } else if (textMessage.includes('iphone не установил')) {
        writeValueToCell(REPORT_TAB, `AH56`, 0);
    }
    sendMessage(chatId, "Завершить встречу или добавить ещё продукт?", [
        [{ text: "Удалить встречу" }, { text: "Ещё продукт" }],
        [{ text: "Завершить встречу" }]
    ]);
}
// Первый ещё продукт
function handleFirstMoreProduct(message) {
    const chatId = message.from.id
;
    const REPORT_TAB = getReportTab(chatId);
    const buttons = [
        [{ text: "ДK" }, { text: "Х5" }],
        [{ text: "Кросс СИМ" }, { text: "Кросс Детская" }],
        [{ text: "Селфи n2b" }, { text: "Селфи ДК" }, { text: "Селфи КК" }]
    ];
    sendMessage(chatId, `Выберите первый дополнительный продукт:`, buttons);
    REPORT_TAB.getRange(`AW56`).setValue("MORE_PRODUCT1");
}
function handleFirstProductSelection(message) {
    const chatId = message.from.id
;
    const textMessage = message.text;
    const REPORT_TAB = getReportTab(chatId);
    const productColumns = {
        "ДK": "F",
        "Х5": "G",
        "Селфи n2b": "AC",
        "Селфи ДК": "AD",
        "Селфи КК": "AE",
        "Кросс Детская": "AN",
        "Кросс СИМ": "AJ"
    };
const selectedProduct = Object.keys(productColumns).find(key => textMessage.includes(key));
    if (selectedProduct) {
        const productColumn = productColumns[selectedProduct];
        
        const currentValue = REPORT_TAB.getRange(`${productColumn}56`).getValue() || 0;
        
        REPORT_TAB.getRange(`${productColumn}56`).setValue(currentValue + 1);
    }
    const productColumnss = {
        "ДK": "BC",
        "Х5": "BG",
        "Селфи n2b": "BD",
        "Селфи ДК": "BE",
        "Селфи КК": "BF",
        "Кросс Детская": "BH",
        "Кросс СИМ": "CP"
    };
const selectedProductt = Object.keys(productColumnss).find(key => textMessage.includes(key));
    if (selectedProductt) {
        const productColumn = productColumnss[selectedProductt];
        
        const currentValue = REPORT_TAB.getRange(`${productColumn}56`).getValue() || 0;
        
        REPORT_TAB.getRange(`${productColumn}56`).setValue(currentValue + 1);
    }
    if (textMessage === 'ДK' || textMessage === 'Х5') {
        handleFirstProductActivation_DC_1(chatId);
        return;
    }
    if (textMessage === 'Селфи КК' || textMessage === 'Селфи n2b' || textMessage === 'Селфи ДК') {
        handleFirstProductActivation_Self_1(chatId);
        return;
    }
    if (textMessage === 'Кросс Детская'|| textMessage === 'Кросс СИМ') {
        handleFirstProductActivation_diff_1(chatId);
        return;
    }
}
function handleFirstProductActivation_DC_1(chatId) {
    const REPORT_TAB = getReportTab(chatId);
    const buttons = [
        [{ text: "ВА+ ТР+" }, { text: "ВА+ ТР-" }, { text: "В+" }]
    ];
    sendMessage(chatId, "Сделал транзакцию и активацию по первому доп. продукту?", buttons);
    REPORT_TAB.getRange(`AW56`).setValue("MORE_DC_ACT_TR_1");
}
function handleFir
21:11
stProductActivationResponse_DC_1(message) {
    const chatId = message.from.id
;
    const textMessage = message.text;
    const REPORT_TAB = getReportTab(chatId);
    const currentActivationValue = REPORT_TAB.getRange(`M56`).getValue() || 0;
    const currentTransactionValue = REPORT_TAB.getRange(`N56`).getValue() || 0;
    if (textMessage === "ВА+ ТР+") {
        REPORT_TAB.getRange(`M56`).setValue(currentActivationValue + 1);
        REPORT_TAB.getRange(`N56`).setValue(currentTransactionValue + 1);
        REPORT_TAB.getRange(`BA56`).setValue(2);
    } else if (textMessage === "ВА+ ТР-") {
        REPORT_TAB.getRange(`M56`).setValue(currentActivationValue + 1);
        REPORT_TAB.getRange(`BA56`).setValue(1);
    }
    let isSpecialProductSelected = REPORT_TAB.getRange(`CM56`).getValue() === 1;
    if (isSpecialProductSelected) {
        sendMessage(chatId, "Завершить встречу или ещё продажи?", [[{ text: "Завершить встречу" }], [{ text: "Продажи" }]]);
    } else {
        sendMessage(chatId, "Завершить встречу или добавить ещё продукт?", [
            [{ text: "Удалить встречу" }, { text: "Добавить ещё" }],
            [{ text: "Завершить встречу" }]
        ]);
    }
}
function handleFirstProductActivation_Self_1(chatId) {
    const REPORT_TAB = getReportTab(chatId);
    const buttons = [
        [{ text: "ВА+ ТР+" }, { text: "ВА+ ТР-" }, { text: "В+" }]
    ];
    sendMessage(chatId, "Сделал транзакцию и активацию по первому доп. продукту?", buttons);
    REPORT_TAB.getRange(`AW56`).setValue("MORE_Self_ACT_TR_1");
}
function handleFirstProductActivationResponse_Self_1(message) {
    const chatId = message.from.id
;
    const textMessage = message.text;
    const REPORT_TAB = getReportTab(chatId);
    const currentActivationValue = REPORT_TAB.getRange(`AF56`).getValue() || 0;
    const currentTransactionValue = REPORT_TAB.getRange(`AG56`).getValue() || 0;
    if (textMessage === "ВА+ ТР+") {
        REPORT_TAB.getRange(`AF56`).setValue(currentActivationValue + 1);
        REPORT_TAB.getRange(`AG56`).setValue(currentTransactionValue + 1);
        REPORT_TAB.getRange(`BA56`).setValue(2);
    } else if (textMessage === "ВА+ ТР-") {
        REPORT_TAB.getRange(`AF56`).setValue(currentActivationValue + 1);
        REPORT_TAB.getRange(`BA56`).setValue(1);
    }
    let isSpecialProductSelected = REPORT_TAB.getRange(`CM56`).getValue() === 1;
    if (isSpecialProductSelected) {
        sendMessage(chatId, "Завершить встречу или ещё продажи?", [[{ text: "Завершить встречу" }], [{ text: "Продажи" }]]);
    } else {
        sendMessage(chatId, "Завершить встречу или добавить ещё продукт?", [
            [{ text: "Удалить встречу" }, { text: "Добавить ещё" }],
            [{ text: "Завершить встречу" }]
        ]);
    }
}
function handleFirstProductActivation_diff_1(chatId) {
    const REPORT_TAB = getReportTab(chatId);
    const buttons = [
        [{ text: "ВА+ ТР+" }, { text: "ВА+ ТР-" }, { text: "В+" }]
    ];
    sendMessage(chatId, "Сделал транзакцию и активацию по первому доп. продукту?", buttons);
    REPORT_TAB.getRange(`AW56`).setValue("MORE_Diff_ACT_TR_1");
}
function handleFirstProductActivationResponse_diff_1(message) {
    const chatId = message.from.id
;
    const textMessage = message.text;
    const REPORT_TAB = getReportTab(chatId);
    if (textMessage === "ВА+ ТР+") {
        REPORT_TAB.getRange(`BA56`).setValue(2);
    } else if (textMessage === "ВА+ ТР-") {
        REPORT_TAB.getRange(`BA56`).setValue(1);
    }
let isSpecialProductSelected = REPORT_TAB.getRange(`CM56`).getValue() === 1;
    if (isSpecialProductSelected) {
        sendMessage(chatId, "Завершить встречу или ещё продажи?", [[{ text: "Завершить встречу" }], [{ text: "Продажи" }]]);
    } else {
        sendMessage(chatId, "Завершить встречу или добавить ещё продукт?", [
            [{ text: "Удалить встречу" }, { text: "Добавить ещё" }],
            [{ text: "Завершить встречу" }]
        ]);
    }
}
// Второй ещё продукт
function handleSecondMorePr
21:11
oduct(message) {
    const chatId = message.from.id
;
    const REPORT_TAB = getReportTab(chatId);
    const buttons = [
        [{ text: "ДK" }, { text: "Х5" }],
        [{ text: "Кросс СИМ" }, { text: "Кросс Детская" }],
        [{ text: "Селфи n2b" }, { text: "Селфи ДК" }, { text: "Селфи КК" }]
    ];
    sendMessage(chatId, `Выберите второй дополнительный продукт:`, buttons);
    REPORT_TAB.getRange(`AW56`).setValue("MORE_PRODUCT2");
}
function handleSecondProductSelection(message) {
    const chatId = message.from.id
;
    const textMessage = message.text;
    const REPORT_TAB = getReportTab(chatId);
    const productColumns = {
        "ДK": "F",
        "Х5": "G",
        "Селфи n2b": "AC",
        "Селфи ДК": "AD",
        "Селфи КК": "AE",
        "Кросс Детская": "AN",
        "Кросс СИМ": "AJ"
    };
const selectedProduct = Object.keys(productColumns).find(key => textMessage.includes(key));
    if (selectedProduct) {
        const productColumn = productColumns[selectedProduct];
        
        const currentValue = REPORT_TAB.getRange(`${productColumn}56`).getValue() || 0;
        
        REPORT_TAB.getRange(`${productColumn}56`).setValue(currentValue + 1);
    }
    const productColumnss = {
        "ДK": "BI",
        "Х5": "BM",
        "Селфи n2b": "BJ",
        "Селфи ДК": "BK",
        "Селфи КК": "BL",
        "Кросс Детская": "BN",
        "Кросс СИМ": "CQ"
    };
const selectedProductt = Object.keys(productColumnss).find(key => textMessage.includes(key));
    if (selectedProductt) {
        const productColumn = productColumnss[selectedProductt];
        
        const currentValue = REPORT_TAB.getRange(`${productColumn}56`).getValue() || 0;
        
        REPORT_TAB.getRange(`${productColumn}56`).setValue(currentValue + 1);
    }
    if (textMessage === 'ДK' || textMessage === 'Х5') {
        handleFirstProductActivation_DC_2(chatId);
        return;
    }
    if (textMessage === 'Селфи КК' || textMessage === 'Селфи n2b' || textMessage === 'Селфи ДК') {
        handleFirstProductActivation_Self_2(chatId);
        return;
    }
    if (textMessage === 'Кросс Детская'|| textMessage === 'Кросс СИМ') {
        handleFirstProductActivation_diff_2(chatId);
        return;
    }
}
function handleFirstProductActivation_DC_2(chatId) {
    const REPORT_TAB = getReportTab(chatId);
    const buttons = [
        [{ text: "ВА+ ТР+" }, { text: "ВА+ ТР-" }, { text: "В+" }]
    ];
    sendMessage(chatId, "Сделал транзакцию и активацию по первому доп. продукту?", buttons);
    REPORT_TAB.getRange(`AW56`).setValue("MORE_DC_ACT_TR_2");
}
function handleFirstProductActivationResponse_DC_2(message) {
    const chatId = message.from.id
;
    const textMessage = message.text;
    const REPORT_TAB = getReportTab(chatId);
    const currentActivationValue = REPORT_TAB.getRange(`M56`).getValue() || 0;
    const currentTransactionValue = REPORT_TAB.getRange(`N56`).getValue() || 0;
    if (textMessage === "ВА+ ТР+") {
        REPORT_TAB.getRange(`M56`).setValue(currentActivationValue + 1);
        REPORT_TAB.getRange(`N56`).setValue(currentTransactionValue + 1);
        REPORT_TAB.getRange(`BB56`).setValue(2);
    } else if (textMessage === "ВА+ ТР-") {
        REPORT_TAB.getRange(`M56`).setValue(currentActivationValue + 1);
        REPORT_TAB.getRange(`BB56`).setValue(1);
    }
  sendMessage(chatId, "Завершить встречу?", [[{ text: "Завершить встречу" }]]);
}
function handleFirstProductActivation_Self_2(chatId) {
    const REPORT_TAB = getReportTab(chatId);
    const buttons = [
        [{ text: "ВА+ ТР+" }, { text: "ВА+ ТР-" }, { text: "В+" }]
    ];
    sendMessage(chatId, "Сделал транзакцию и активацию по первому доп. продукту?", buttons);
    REPORT_TAB.getRange(`AW56`).setValue("MORE_Selfe_ACT_TR_2");
}
function handleFirstProductActivationResponse_Self_2(message) {
    const chatId = message.from.id
;
    const textMessage = message.text;
    const REPORT_TAB = getReportTab(chatId);
    const currentActivationValue = REPORT_T
21:11
AB.getRange(`AF56`).getValue() || 0;
    const currentTransactionValue = REPORT_TAB.getRange(`AG56`).getValue() || 0;
    if (textMessage === "ВА+ ТР+") {
        REPORT_TAB.getRange(`AF56`).setValue(currentActivationValue + 1);
        REPORT_TAB.getRange(`AG56`).setValue(currentTransactionValue + 1);
        REPORT_TAB.getRange(`BB56`).setValue(2);
    } else if (textMessage === "ВА+ ТР-") {
        REPORT_TAB.getRange(`AF56`).setValue(currentActivationValue + 1);
        REPORT_TAB.getRange(`BB56`).setValue(1);
    }
  sendMessage(chatId, "Завершить встречу?", [[{ text: "Завершить встречу" }]]);
}
function handleFirstProductActivation_diff_2(chatId) {
    const REPORT_TAB = getReportTab(chatId);
    const buttons = [
        [{ text: "ВА+ ТР+" }, { text: "ВА+ ТР-" }, { text: "В+" }]
    ];
    sendMessage(chatId, "Сделал транзакцию и активацию по первому доп. продукту?", buttons);
    REPORT_TAB.getRange(`AW56`).setValue("MORE_Diff_ACT_TR_2");
}
function handleFirstProductActivationResponse_diff_2(message) {
    const chatId = message.from.id
;
    const textMessage = message.text;
    const REPORT_TAB = getReportTab(chatId);
    if (textMessage === "ВА+ ТР+") {
        REPORT_TAB.getRange(`BB56`).setValue(2);
    } else if (textMessage === "ВА+ ТР-") {
        REPORT_TAB.getRange(`BB56`).setValue(1);
    }
  sendMessage(chatId, "Завершить встречу?", [[{ text: "Завершить встречу" }]]);
}
// Экстренное завершение встречи
function handleStopMeeting(message) {
    const chatId = message.from.id
;
    const REPORT_TAB = getReportTab(chatId);
    REPORT_TAB.getRange(`AW56`).setValue("STOPPED");
    sendMessage(chatId, "Встреча экстренно завершена, в таблицу не внесена. ", [
        [{ text: "Удалить встречу" }, { text: "Результат за день" }],
        [{ text: "Начать встречу" }]
    ]);
}
//Отчет за день
function handleDailyReport(chatId) {
    const REPORT_TAB = getReportTab(chatId);
    const date = convertToDate(Math.floor(Date.now
() / 1000));
    const referenceValue = REPORT_TAB.getRange("AX55").getValue();
    const checkRange = REPORT_TAB.getRange("D3:AH3").getValues()[0];
    let targetColumn = null;
    for (let i = 0; i < checkRange.length; i++) {
        if (checkRange[i] === referenceValue) {
            targetColumn = i + 4; 
            break;
        }
    }
    if (targetColumn === null) {
        sendMessage(chatId, "Искомый столбец не найден.", [
            [{ text: "Результат за день" }],
            [{ text: "Начать встречу" }]
        ]);
        return;
    }
    const totalMeetings = REPORT_TAB.getRange(4, targetColumn).getValue();
    const odk = REPORT_TAB.getRange(5, targetColumn).getValue();
    const kk1 = REPORT_TAB.getRange(15, targetColumn).getValue();
    const fz_kk1 = REPORT_TAB.getRange(18, targetColumn).getValue();
    const fzz_kk1 = REPORT_TAB.getRange(19, targetColumn).getValue();
    const kdk_kk = REPORT_TAB.getRange(20, targetColumn).getValue();
    const kdk_dk = REPORT_TAB.getRange(21, targetColumn).getValue();
    const fz_kdk = REPORT_TAB.getRange(23, targetColumn).getValue();
    const combo = REPORT_TAB.getRange(24, targetColumn).getValue();
    const fz_combo = REPORT_TAB.getRange(25, targetColumn).getValue();
    const cp = REPORT_TAB.getRange(28, targetColumn).getValue();
    const bs = REPORT_TAB.getRange(27, targetColumn).getValue();
    const strata = REPORT_TAB.getRange(44, targetColumn).getValue();
    const inko = REPORT_TAB.getRange(26, targetColumn).getValue();
    const selfieN2B = REPORT_TAB.getRange(29, targetColumn).getValue();
    const selfieOld = REPORT_TAB.getRange(30, targetColumn).getValue();
    const tz_selfie = REPORT_TAB.getRange(33, targetColumn).getValue();
    const crossKids = REPORT_TAB.getRange(40, targetColumn).getValue();
    const crossSIM = REPORT_TAB.getRange(36, targetColumn).getValue();
    const korobka = REPORT_TAB.getRange(47, targetColumn).getValue();
    const pensiy = REPORT_TAB.getRange(46, targetColumn).getValue();
    const smart = R
21:11
EPORT_TAB.getRange(43, targetColumn).getValue();
    const gky = REPORT_TAB.getRange(45, targetColumn).getValue();
    const kb = REPORT_TAB.getRange(38, targetColumn).getValue();
    const voc = REPORT_TAB.getRange(41, targetColumn).getValue();
    const summ = Math.round(REPORT_TAB.getRange(49, targetColumn).getValue());
    const reportMessage = `
Отчёт за: ${date}
Всего встреч: ${totalMeetings}
ДК: ${odk}
КК1: ${kk1}
ТЗ КК1: ${fz_kk1}
ФЗ КК1: ${fzz_kk1}
КДК к КК: ${kdk_kk}
ТЗ КДК: ${fz_kdk}
Комбо: ${combo}
ТЗ Комбо: ${fz_combo}
Комбо 1₽: ${korobka}
ЦП: ${cp}
БС: ${bs}
Инвесткопилка: ${inko}
Установка МП Х5: ${strata}
Селфи N2B: ${selfieN2B}
Селфи OLD: ${selfieOld}
ТЗ Селфи: ${tz_selfie}
Кросс Кидс: ${crossKids}
Кросс СИМ: ${crossSIM}
Пенсия: ${pensiy}
Смарт: ${smart}
ПДС: ${gky}
Кэш: ${kb}
Вок на встрече: ${voc}
Итоговая сумма: ${summ}
    `.trim();
    sendMessage(chatId, reportMessage, [
        [{ text: "Результат за день" }],
        [{ text: "Начать встречу" }]
    ]);
}
// Актуальный аккаунт
function handleActualAccount(message) {
    const chatId = message.from.id
;
    const ADMIN_TAB = ACTIVE_SPREADSHEET.getSheetByName("Учётка");
    const login = ADMIN_TAB.getRange("B1").getValue();
    const password = ADMIN_TAB.getRange("B2").getValue();
    const messageForUser = `
${login}
${password}
‼️ НЕ ЗАБУДЬ ВЫЙТИ‼️     `.trim();
    sendMessage(chatId, messageForUser);
    sendMessage(chatId, "Другие возможности - Не улучшать - Не сохранять",[
        [{ text: "Результат за день" }],
        [{ text: "Начать встречу" }]
    ]);
}
// Альтернативный процесс
function sendMessageComplite(chatId, messageText) {
    const buttons = [
        [{ text: "Завершить встречу" }],
        [{ text: "Удалить встречу" }],
        [{ text: "Ещё продукт" }]
    ];
    sendMessage(chatId, messageText, buttons);
}
function handleDeleteRecordsforUser(message) {
    const chatId = message.from.id
;
    const REPORT_TAB = getReportTab(chatId);
    REPORT_TAB.getRange("C56:DA56").clearContent();
    sendMessage(chatId, "Последняя запись удалена",[
        [{ text: "Результат за день" }],
        [{ text: "Начать встречу" }]
    ]);
}
// ЗАВЕРШЕНИЕ ВСТРЕЧИ __________________________________________________________________________________________________________________________________
function handleCompleteMeeting(message) {
    const chatId = message.from.id
;
    const REPORT_TAB = getReportTab(chatId);
    REPORT_TAB.getRange(`AW56`).setValue("COMPLETED");
    sendMessage(chatId, "Встреча завершена");
}
// Вычисления в строке
function insertCalculatedValues(message) {
    const chatId = message.from.id
;
    const REPORT_TAB = getReportTab(chatId);
    const sumFtoL = REPORT_TAB.getRange("F56:L56").getValues()[0].reduce((acc, val) => acc + (Number(val) || 0), 0);
    REPORT_TAB.getRange("E56").setValue(sumFtoL);
    const E56 = REPORT_TAB.getRange("E56").getValue() || 0;
    const O56 = REPORT_TAB.getRange("O56").getValue() || 0;
    const P56 = REPORT_TAB.getRange("P56").getValue() || 0;
    const AI56 = REPORT_TAB.getRange("AI56").getValue() || 0;
    const sumEOP = E56 + O56 + P56 + AI56;
    REPORT_TAB.getRange("D56").setValue(sumEOP);
    const AW56 = REPORT_TAB.getRange("AW56").getValue();
    if (AW56 === "COMPLETED") {
        const E56 = REPORT_TAB.getRange("E56").getValue() || 0;
        const M56 = REPORT_TAB.getRange("M56").getValue() || 0;
        const O56 = REPORT_TAB.getRange("O56").getValue() || 0;
        const P56 = REPORT_TAB.getRange("P56").getValue() || 0;
        const Q56 = REPORT_TAB.getRange("Q56").getValue() || 0;
        const S56 = REPORT_TAB.getRange("S56").getValue() || 0;
        const T56 = REPORT_TAB.getRange("T56").getValue() || 0;
        const U56 = REPORT_TAB.getRange("U56").getValue() || 0;
        const X56 = REPORT_TAB.getRange("X56").getValue() || 0;
        const Z56 = REPORT_TAB.getRange("Z56").getValue() || 0;
        const AA56 = REPORT_TAB.getRange("AA56").getValue() || 0;
        const AB56 = R
21:11
EPORT_TAB.getRange("AB56").getValue() || 0;
        const AC56 = REPORT_TAB.getRange("AC56").getValue() || 0;
        const AD56 = REPORT_TAB.getRange("AD56").getValue() || 0;
        const AE56 = REPORT_TAB.getRange("AE56").getValue() || 0;
        const AI56 = REPORT_TAB.getRange("AI56").getValue() || 0;
        const AJ56 = REPORT_TAB.getRange("AJ56").getValue() || 0;
        const AK56 = REPORT_TAB.getRange("AK56").getValue() || 0;
        const AL56 = REPORT_TAB.getRange("AL56").getValue() || 0;
        const AM56 = REPORT_TAB.getRange("AM56").getValue() || 0;
        const AN56 = REPORT_TAB.getRange("AN56").getValue() || 0;
        const AP56 = REPORT_TAB.getRange("AP56").getValue() || 0;
        const AQ56 = REPORT_TAB.getRange("AQ56").getValue() || 0;
        const AR56 = REPORT_TAB.getRange("AR56").getValue() || 0;
        const AS56 = REPORT_TAB.getRange("AS56").getValue() || 0;
        const AT56 = REPORT_TAB.getRange("AT56").getValue() || 0;
        const AU56 = REPORT_TAB.getRange("AU56").getValue() || 0;
        const result = ((E56 - M56) * 250 + M56 * 310 + (O56 + P56 - Q56) * 450 + Q56 * 570 +
                        S56 * 100 + T56 * 270 + U56 * 270 + X56 * 570 + Z56 * 270 + AA56 * 270 + 
                        AB56 * 20 + AC56 * 430 + AD56 * 270 + AE56 * 570 + AI56 * 310 + AJ56 * 430 + 
                        AK56 * 570 + AL56 * 10 + AM56 * 100 + AN56 * 430 + AP56 * 230 + AQ56 * 30 + AR56 * 0 + 
                        AS56 * 270 + AT56 * 270 + AU56 * 30) * 0.87;
        REPORT_TAB.getRange("AV56").setValue(result);
    } else {
        REPORT_TAB.getRange("AV56").clearContent();
    }
}
// Результат встречи
function handleMeetingResult(message) {
    const chatId = message.from.id
;
    const REPORT_TAB = getReportTab(chatId);
    const clientName = REPORT_TAB.getRange(`C56`).getValue();
    const result = Math.round(REPORT_TAB.getRange(`AV56`).getValue());
    const primaryProductColumns = {
        CN: "Отказ банка",
        BO: "ДК",
        BP: "Х5",
        BQ: "ЗПК",
        BR: "RE",
        BS: "СИМ по заявке",
        BT: "Семейный",
        BU: "ДК+Детская",
        BV: "КК1",
        BW: "КК2",
        BX: "Установка МП",
        BY: "Селфи n2b",
        BZ: "Селфи ДК",
        CA: "Селфи КК",
        CC: "КН"
    };
    let primaryProduct = "";
    for (let col in primaryProductColumns) {
        if (REPORT_TAB.getRange(`${col}56`).getValue() == 1) {
            const transactionValue = REPORT_TAB.getRange("AY56").getValue();
            primaryProduct = `${primaryProductColumns[col]} ${transactionValue === 2 ? "ВА+ ТР+" : transactionValue === 1 ? "ВА+ ТР-" : "В+"}`;
            break;
        }
    }
    const additionalProductColumns = {
        CD: "КЛ",
        CE: "КДК к КК",
        CF: "КДК к ДК",
        CG: "Селфи n2b",
        CH: "Селфи ДК",
        CI: "Селфи КК",
        CJ: "Кросс СИМ",
        CK: "Кросс Детская"
    };
    let additionalProduct = "";
    for (let col in additionalProductColumns) {
        if (REPORT_TAB.getRange(`${col}56`).getValue() == 1) {
            const transactionValue = REPORT_TAB.getRange("AZ56").getValue();
            additionalProduct = `${additionalProductColumns[col]} ${transactionValue === 2 ? "ВА+ ТР+" : transactionValue === 1 ? "ВА+ ТР-" : "В+"}`;
            break;
        }
    }
    const moreProductColumns = {
        BC: "ДК",
        BG: "X5",
        BD: "Селфи n2b",
        BE: "Селфи ДК",
        BF: "Селфи КК",
        BH: "Кросс Детская",
        CP: "Кросс СИМ"
    };
    let firstMoreProduct = "";
    for (let col in moreProductColumns) {
        if (REPORT_TAB.getRange(`${col}56`).getValue() == 1) {
            const transactionValue = REPORT_TAB.getRange("BA56").getValue();
            firstMoreProduct = `${moreProductColumns[col]} ${transactionValue === 2 ? "ВА+ ТР+" : transactionValue === 1 ? "ВА+ ТР-" : "В+"}`;
            break;
        }
    }
    const secondMoreProductColumns = {
        BI: "ДК",
        BM: "X5",
21:11
BJ: "Селфи n2b",
        BK: "Селфи ДК",
        BL: "Селфи КК",
        BN: "Кросс Детская",
        CQ: "Кросс СИМ"
    };
    let secondMoreProduct = "";
    for (let col in secondMoreProductColumns) {
        if (REPORT_TAB.getRange(`${col}56`).getValue() == 1) {
            const transactionValue = REPORT_TAB.getRange("BB56").getValue();
            secondMoreProduct = `${secondMoreProductColumns[col]} ${transactionValue === 2 ? "ВА+ ТР+" : transactionValue === 1 ? "ВА+ ТР-" : "В+"}`;
            break;
        }
    }
    const extraSalesColumns = {
        AA: "БС(покупка)",
        AB: "ЦП",
        S: REPORT_TAB.getRange(`S56`).getValue() === 1 ? "ФЗ КК1" : null,
        CO: REPORT_TAB.getRange(`CO56`).getValue() === 1 ? "УП" : null,
        AR: REPORT_TAB.getRange(`AR56`).getValue() === 1 ? "Установка МП Х5" : null,
        Z: REPORT_TAB.getRange(`Z56`).getValue() === 1 ? "Инвест копилка" : null,
        AL: REPORT_TAB.getRange(`AL56`).getValue() === 1 ? "Кэш" : null,
        AM: REPORT_TAB.getRange(`AM56`).getValue() === 1 ? "Защитник" : null,
        AQ: REPORT_TAB.getRange(`AQ56`).getValue() === 1 ? "Смарт" : null,
        AS: REPORT_TAB.getRange(`AS56`).getValue() === 1 ? "ПДС" : null,
        AT: REPORT_TAB.getRange(`AT56`).getValue() === 1 ? "Пенсия" : null,
        AU: REPORT_TAB.getRange(`AU56`).getValue() === 1 ? "Комбо 1₽" : null
    };
    let extraSalesResult = "";
    for (let col in extraSalesColumns) {
        if (extraSalesColumns[col]) {
            const value = REPORT_TAB.getRange(`${col}56`).getValue() == 1 ? "✅" : "➖";
            extraSalesResult += `${extraSalesColumns[col]}: ${value}\n`;
        }
    }
    const phoneType = REPORT_TAB.getRange(`CL56`).getValue() == 1 ? "Android" : "iPhone";
    const appInstalled = REPORT_TAB.getRange(`AH56`).getValue() == 1 ? "✅" : "➖";
    const vokValue = REPORT_TAB.getRange(`AO56`).getValue() == 1 ? "Вок ✅" : "Вок ➖";
    const messageArray = [
        `${clientName}`,
        primaryProduct,
        additionalProduct || null,
        firstMoreProduct || null,
        secondMoreProduct || null,
        extraSalesResult.trim(),
        `${phoneType} ${appInstalled}`,
        `Итоговая сумма: ${result}₽`,
        vokValue
    ];
    const messageForUser = messageArray.filter(Boolean).join("\n");
    sendMessage(chatId, messageForUser.trim());
}
// История встреч
function copyAndPasteToLastRow(chatId) {
    const REPORT_TAB = getReportTab(chatId);
    const copyRange = REPORT_TAB.getRange("A56:AW56").getValues();
    const lastRow = REPORT_TAB.getLastRow() + 1;
    const pasteRange = REPORT_TAB.getRange(lastRow, 1, 1, copyRange[0].length);
    pasteRange.setValues(copyRange);
}
// Добавление результата в таблицу
function copyAndPasteIfMatch(chatId) {
    const REPORT_TAB = getReportTab(chatId);
    const referenceValue = REPORT_TAB.getRange("AX55").getValue();
    const valueToAdd = REPORT_TAB.getRange("AV56").getValue();
    const checkRange = REPORT_TAB.getRange("D3:AH3").getValues()[0];
    const copyValues = REPORT_TAB.getRange("D56:AU56").getValues()[0];
    const pasteStartRow = 4;
    const pasteTargetRow = 49;
    let matchFound = false;
    for (let i = 0; i < checkRange.length; i++) {
        if (checkRange[i] === referenceValue) {
            const targetColumn = i + 4;
            const currentCellValue = REPORT_TAB.getRange(pasteTargetRow, targetColumn).getValue();
            REPORT_TAB.getRange(pasteTargetRow, targetColumn).setValue(currentCellValue + valueToAdd);
            const existingValues = REPORT_TAB.getRange(pasteStartRow, targetColumn, copyValues.length, 1).getValues();
            const newValues = copyValues.map
((value, index) => {
                return [existingValues[index][0] + value];
            });
            REPORT_TAB.getRange(pasteStartRow, targetColumn, newValues.length, 1).setValues(newValues);
            matchFound = true;
            break;
        }
    }
    sendMessage(
        chatId, 
        matchFound ? "
21:11
Данные успешно добавлены" : "Значение не найдено, добавление не выполнено", 
        [
            [{ text: "Результат за день" }],
            [{ text: "Начать встречу" }]
        ]
    );
}
// Удалить записи
function handleDeleteRecords(message) {
    const chatId = message.from.id
;
    const REPORT_TAB = getReportTab(chatId);
    REPORT_TAB.getRange("C56:DA56").clearContent();
}
// СКРИПТЫ _______________________________________________________________________________________________________________________________________________
function addAllTriggers() {
    ScriptApp.newTrigger("clearRangeAtNight")
        .timeBased()
        .everyDays(1)
        .atHour(1)
        .create();
    ScriptApp.newTrigger("insertSumValuesToUserSheetsWithCache")
        .timeBased()
        .everyDays(1)
        .atHour(1)
        .create();
    ScriptApp.newTrigger("insertSumValuesToGeneralSheet")
        .timeBased()
        .everyDays(1)
        .atHour(1)
        .create();
    ScriptApp.newTrigger("updateSummarySheetWithCache")
        .timeBased()
        .everyHours(1)
        .create();
    ScriptApp.newTrigger("insertCalculatedValuesToUserSheets")
        .timeBased()
        .everyDays(1)
        .atHour(3)
        .create();
    Logger.log("Все триггеры добавлены.");
}
function deleteAllTriggers() {
    const allTriggers = ScriptApp.getProjectTriggers();
    allTriggers.forEach(trigger => ScriptApp.deleteTrigger(trigger));
    Logger.log("Все триггеры удалены.");
}
function getReportSheetss() {
    let reportSheetss = {};
    const chatIdRange = USER_TAB.getRange("B:B").getValues();
    const sheetNameRange = USER_TAB.getRange("E:E").getValues();
    for (let i = 0; i < chatIdRange.length; i++) {
        let currentChatId = chatIdRange[i][0];
        let currentSheetName = sheetNameRange[i][0];
        if (currentChatId && currentSheetName) {
            reportSheetss[currentChatId] = currentSheetName;
        }
    }
    return reportSheetss;
}
function clearRangeAtNight() {
    const ACTIVE_SPREADSHEET = SpreadsheetApp.getActiveSpreadsheet();
    const reportSheetss = getReportSheetss();
    for (const sheetId in reportSheetss) {
        const sheetName = reportSheetss[sheetId];
        const sheet = ACTIVE_SPREADSHEET.getSheetByName(sheetName);
        if (sheet) {
            // Очистка содержимого в указанном диапазоне
            sheet.getRange("A57:DA100").clearContent();
            Logger.log(`Cleared range A57:DA1000 on sheet: ${sheetName}`);
            
            // Ограничение таблицы до 100 строк
            const numRows = sheet.getMaxRows();
            if (numRows > 100) {
                sheet.deleteRows(101, numRows - 100);
                Logger.log(`Deleted rows 101-${numRows} on sheet: ${sheetName}`);
            }
        } else {
            Logger.log(`Sheet not found: ${sheetName}`);
        }
    }
}
function insertSumValuesToUserSheetsWithCache() {
    const reportSheets = getReportSheetss();
    const sheetIds = Object.values(reportSheets);
    sheetIds.forEach(sheetName => {
        const sheet = ACTIVE_SPREADSHEET.getSheetByName(sheetName);
        
        if (sheet) {
            const sumRange = sheet.getRange("D4:AH49");
            const sumValues = sumRange.getValues();
            const resultValues = sumValues.map
(row => [row.reduce((acc, val) => acc + (Number(val) || 0), 0)]);
            sheet.getRange("AI4:AI49").setValues(resultValues);
        }
    });
}
function insertSumValuesToGeneralSheet() {
    const overallSheet = ACTIVE_SPREADSHEET.getSheetByName("ОБЩИЕ");
    if (overallSheet) {
        const sumRange = overallSheet.getRange("D4:AH49");
        const sumValues = sumRange.getValues();
        const resultValues = sumValues.map
(row => [row.reduce((acc, val) => acc + (Number(val) || 0), 0)]);
        overallSheet.getRange("AI4:AI49").setValues(resultValues);
    }
}
function updateSummarySheetWithCache() {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    c
21:11
onst summarySheet = spreadsheet.getSheetByName("ОБЩИЕ");
    const reportSheets = getReportSheetss();
    const sheetNames = Object.values(reportSheets);
    const startRow = 4;
    const startColumn = 4;
    const numRows = 45;
    const numColumns = 31;
    let finalValues = Array.from({ length: numRows }, () => Array(numColumns).fill(0));
    sheetNames.forEach(name => {
        const userSheet = spreadsheet.getSheetByName(name);
        if (userSheet) {
            const dataRange = userSheet.getRange(startRow, startColumn, numRows, numColumns).getValues();
            for (let row = 0; row < numRows; row++) {
                for (let col = 0; col < numColumns; col++) {
                    finalValues[row][col] += Number(dataRange[row][col]) || 0;
                }
            }
        }
    });
    summarySheet.getRange(startRow, startColumn, numRows, numColumns).setValues(finalValues);
}
function insertCalculatedValuesToUserSheets() {
    const reportSheets = getReportSheetss();
    const sheetIds = Object.values(reportSheets);
    
    const columns = [
        "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", 
        "W", "X", "Y", "Z", "AA", "AB", "AC", "AD", "AE", "AF", "AG", "AH"
    ];
    sheetIds.forEach(sheetName => {
        const sheet = ACTIVE_SPREADSHEET.getSheetByName(sheetName);
        if (sheet) {
            const results = columns.map
(column => {
                const values = [
                    sheet.getRange(`${column}5`).getValue(),
                    sheet.getRange(`${column}13`).getValue(),
                    sheet.getRange(`${column}15`).getValue(),
                    sheet.getRange(`${column}16`).getValue(),
                    sheet.getRange(`${column}17`).getValue(),
                    sheet.getRange(`${column}19`).getValue(),
                    sheet.getRange(`${column}20`).getValue(),
                    sheet.getRange(`${column}21`).getValue(),
                    sheet.getRange(`${column}24`).getValue(),
                    sheet.getRange(`${column}26`).getValue(),
                    sheet.getRange(`${column}27`).getValue(),
                    sheet.getRange(`${column}28`).getValue(),
                    sheet.getRange(`${column}29`).getValue(),
                    sheet.getRange(`${column}30`).getValue(),
                    sheet.getRange(`${column}31`).getValue(),
                    sheet.getRange(`${column}35`).getValue(),
                    sheet.getRange(`${column}36`).getValue(),
                    sheet.getRange(`${column}37`).getValue(),
                    sheet.getRange(`${column}38`).getValue(),
                    sheet.getRange(`${column}39`).getValue(),
                    sheet.getRange(`${column}40`).getValue(),
                    sheet.getRange(`${column}42`).getValue(),
                    sheet.getRange(`${column}43`).getValue(),
                    sheet.getRange(`${column}44`).getValue(),
                    sheet.getRange(`${column}45`).getValue(),
                    sheet.getRange(`${column}46`).getValue(),
                    sheet.getRange(`${column}47`).getValue(),
                    sheet.getRange(`${column}48`).getValue()
                ];
                
                const result = ((values[0] - values[1]) * 250 + values[1] * 310 + 
                               (values[2] + values[3] - values[4]) * 450 + values[4] * 570 +
                               values[5] * 100 + values[6] * 270 + values[7] * 270 + values[8] * 570 +
                               values[9] * 270 + values[10] * 270 + values[11] * 20 + values[12] * 430 +
                               values[13] * 270 + values[14] * 570 + values[15] * 310 + values[16] * 430 +
                               values[17] * 570 + values[18] * 10 + values[19] * 100 + values[20] * 430 +
                               values[21] * 230 + values[22] * 30 + values[23] * 0 +values[24] * 270 +
                               values[25] * 270 + value
21:11
s[26] * 30 + values[27] * 150) * 0.87;
                return result;
            });
            sheet.getRange("D49:AH49").setValues([results]);
        }
    });
}
// ЛОГИКА _______________________________________________________________________________________________________________________________________________
function doPost(e) {
    const update = JSON.parse(e.postData.contents);
    const message = update.message;
    const chatId = message.from.id
;
    const adminIds = [0000, 0001];
    if (message.text.toLowerCase() === 'проверить готовность') {
        checkReadiness(chatId);  
        return;  
    }
    if (adminIds.includes(chatId)) {
        handleAdminCommands(message); 
    
    } else {
        const REPORT_TAB = getReportTab(chatId);
        if (update.hasOwnProperty('message')) {
            if (message.hasOwnProperty('entities') && message.entities[0].type == 'bot_command') {
                if (message.text == '/start') {
                let lastRow = getRowUser(USER_TAB, chatId);
                if (lastRow === null) {
                    registerUser(message);
                }
                } else if (message.text == '/meeting') {
                    handleStartMeeting(message);
                } else if (message.text == '/stop') {
                    handleStopMeeting(message);
                    handleDeleteRecords(message);
                } else if (message.text == '/trigger') {
                    addAllTriggers(); 
                } else if (message.text == '/deltrigger') {
                    deleteAllTriggers(); 
                }
                
            } else if (message.text.toLowerCase() == 'начать встречу') {
                handleStartMeeting(message); 
            } else if (message.text.toLowerCase() == 'пропустить') {
                handleAdditionalProduct(message); 
            } else if (message.text.toLowerCase() == 'завершить встречу') {
                handleCompleteMeeting(message);
                insertCalculatedValues(message);
                handleMeetingResult(message);
                copyAndPasteToLastRow(chatId);
                copyAndPasteIfMatch(chatId);
                handleDeleteRecords(message);
            } else if (message.text.toLowerCase() == 'ещё продукт') {
                handleFirstMoreProduct(message); 
            } else if (message.text.toLowerCase() == 'добавить ещё') {
                handleSecondMoreProduct(message);               
            } else if (message.text.toLowerCase() == 'результат за день') {
                handleDailyReport(chatId); 
            } else if (message.text.toLowerCase() == 'удалить встречу') {
                handleDeleteRecordsforUser(message);
            } else if (message.text.toLowerCase() == 'актуальная учётка') {
                handleActualAccount(message);
            } else if (message.text.toLowerCase() == 'продажи') {
                handleExtraSalesSelection(chatId);
            } else {
                let lastRoww = getRowUser(USER_TAB, chatId);
                if (lastRoww !== null) {
                  const sstage = USER_TAB.getRange(`F${lastRoww}`).getValue();
                    if (sstage === "FIO") {
                      processFIOInput(chatId, message.text);
                    }
                } 
                const stage = REPORT_TAB.getRange(`AW56`).getValue();
                if (stage == "OP") {
                    handlePrimaryProduct(message);
                } else if (stage == "DC_ACT_TR") {
                    handleMainProductActivationResponse_DC(message);
                } else if (stage == "KK_ACT_TR") {
                    handleMainProductActivationResponse_KK(message);
                } else if (stage == "Self_ACT_TR") {
                    handleMainProductActivationResponse_Self(message);
                } else if (stage == "CP") {
                    handleAdditionalProduct(message);
                } else if (stage == "KL_ACT_TR") {
                    handleAd
21:11
ditionalProductTransactionResponse_KL(message); 
                } else if (stage == "KDK_ACT_TR") {
                    handleAdditionalProductTransactionResponse_KDK(message); 
                } else if (stage == "Self_ACT_TR_2") {
                    handleAdditionalProductTransactionResponse_Self(message); 
                } else if (stage == "Diff_ACT_TR") {
                    handleAdditionalProductTransactionResponse_diff(message); 
                } else if (stage.startsWith("EXTRA_SALES")) {
                    handleExtraSales(message);
                } else if (stage == "APP") {
                      handleAppInstallationResponse(message); 
                } else if (stage.startsWith("MORE_PRODUCT1")) {
                    handleFirstProductSelection(message);
                } else if (stage == "MORE_DC_ACT_TR_1") {
                      handleFirstProductActivationResponse_DC_1(message);
                } else if (stage == "MORE_Self_ACT_TR_1") {
                      handleFirstProductActivationResponse_Self_1(message);
                } else if (stage == "MORE_Diff_ACT_TR_1") {
                      handleFirstProductActivationResponse_diff_1(message);
                } else if (stage.startsWith("MORE_PRODUCT2")) {
                    handleSecondProductSelection(message);
                } else if (stage == "MORE_DC_ACT_TR_2") {
                    handleFirstProductActivationResponse_DC_2(message); 
                } else if (stage == "MORE_Selfe_ACT_TR_2") {
                    handleFirstProductActivationResponse_Self_2(message); 
                } else if (stage == "MORE_Diff_ACT_TR_2") {
                    handleFirstProductActivationResponse_diff_2(message); 
                }
            }
        }
    }
}
function setWebhook() {
    UrlFetchApp.fetch(`https://api.telegram.org/bot${TOKEN}/setWebHook?url=${URI}`);
}