declare const chrome: any;

export interface SaveResultData {
    code: string;
    type: string;
    message: string;
    base64?: string;
    webpath?: string;
}

export interface SendEmailData {
    addr: string;
    subject: string;
    text: string;
    file?: string;
}

const vc = {
    /** 
     * Vrati JSON string o Uzivateli s QR kodem code
     * ! použít pro zjištění infromací o přihlášením uživateli - pro profil 
     */
    jsGetVisitorInfo: async (code: string): Promise<string | undefined> => {
        console.log("VpassCloud.ts: jsGetVisitorInfo", code);
        try {
            return await chrome.webview.hostObjects.netclient.jsGetVisitorInfo(code);
        } catch (err) {
            console.error(err);
        }
    },

    jsSetVisitor: (data: any): void => {
        console.log("VpassCloud.ts: jsSetVisitor", data);
        try {
            chrome.webview.hostObjects.netclient.jsSetVisitor(data);
        } catch (err) {
            console.error(err);
        }
    },

    /** 
     * Ulozi vysledek z JSON stringu na server. Vraci ok nebo text chyby.
     * Json: "code": "QRcode" , "type":"text" , "message":"text" , "base64":"zakodovany obsah souboru, ktery chcete ulozit na server. Kopie bude ve slozce /result_files/" , "webpath":"kam ulozit na serveru"
     * Json: Je-li base64 prazdny, ulozi se vysledek bez souboru
     * ! Použít při uložení výsledku na profil 
     */
    jsSaveResult: (data: SaveResultData): void => {
        console.log("VpassCloud.ts: jsSaveResult", data);
        try {
            chrome.webview.hostObjects.netclient.jsSaveResult(data);
        } catch (err) {
            console.error(err);
        }
    },

    /** 
     * Odesle email z JSON stringu. Vraci ok nebo text chyby.
     * Json: "addr": "email adresa" , "subject":"text" , "text":"text zpravy" , "file":"local file name"
     * Json: Je-li file prazdny, odesle se email bez prilohy
     * ! Použít pro odeslání něčeho emailem
     */
    jsSendEmail: (mail: SendEmailData): void => {
        console.log("VpassCloud.ts: jsSendEmail", mail);
        try {
            chrome.webview.hostObjects.netclient.jsSendEmail(mail);
        } catch (err) {
            console.error(err);
        }
    },

    /** 
     * Vrati JSON string o vysledku uzivatele s QR kodem code na tomto kiosku
     * ! Použít ke zjištění výslekdu návštěvníka daného kiosku
     */
    jsGetVisitorResult: async (code: string): Promise<string | undefined> => {
        console.log("VpassCloud.ts: jsGetVisitorResult", code);
        try {
            return await chrome.webview.hostObjects.netclient.jsGetVisitorResult(code);
        } catch (err) {
            console.error(err);
        }
    },

    /** 
     * Vrati JSON string o vysledku uzivatele s QR kodem code na vsech kioscich
     * ! Použív pro zjištění výsledků návštěvníka všech kiosků, kde má výsledek
     */
    jsGetAllVisitorResults: async (code: string): Promise<string | undefined> => {
        console.log("VpassCloud.ts: jsGetAllVisitorResults", code);
        try {
            return await chrome.webview.hostObjects.netclient.jsGetAllVisitorResults(code);
        } catch (err) {
            console.error(err);
        }
    },

    jsGetExpositionExhibits: async (): Promise<string | undefined> => {
        console.log("VpassCloud.ts: jsGetExpositionExhibits");
        try {
            return await chrome.webview.hostObjects.netclient.jsGetExpositionExhibits();
        } catch (err) {
            console.error(err);
        }
    },

    /** 
     * Vrati "1" kdyz QR kod code je platny, "0" kdyz je neplatny, "-1" kdyz nastala chyba v urcovani platnosti
     * ! Použít pro validaci čísla ticketu (dle regex, který je konfigurován na klientu). Použít vždy při obsluze QR čtečky.
     */
    jsIsTicketValid: async (code: string): Promise<string | undefined> => {
        console.log("VpassCloud.ts: jsIsTicketValid", code);
        try {
            return await chrome.webview.hostObjects.netclient.jsIsTicketValid(code);
        } catch (err) {
            console.error(err);
        }
    },

    jsGetAllVisitors: async (): Promise<string | undefined> => {
        console.log("VpassCloud.ts: jsGetAllVisitors");
        try {
            return await chrome.webview.hostObjects.netclient.jsGetAllVisitors();
        } catch (err) {
            console.error(err);
        }
    },

    /** 
     * Zaloguje lokalne (log.txt) a na server (oboje podle nastaveni v Config.xml) START GAME zpravu message
     * ! Zalogovat vždy při začátku hry, vhodně zvolit a i když aplikace technicky hrou není
     */
    jsLogStartGame: (message?: string | null): void => {
        console.log("VpassCloud.ts: jsLogStartGame", message);
        const logMessage = message || 'Návštěvník začal hru.';
        try {
            chrome.webview.hostObjects.netclient.jsLogStartGame(logMessage);
        } catch (err) {
            console.error(err);
        }
    },

    /** 
     * Zaloguje lokalne (log.txt) a na server (oboje podle nastaveni v Config.xml) END GAME zpravu message
     * ! Zalogovat vždy při konci hry, vhodně zvolit a i když aplikace technicky hrou není
     */
    jsLogEndGame: (message?: string | null): void => {
        console.log("VpassCloud.ts: jsLogEndGame", message);
        const logMessage = message || 'Návštěvník úspěšně dokončil hru.';
        try {
            chrome.webview.hostObjects.netclient.jsLogEndGame(logMessage);
        } catch (err) {
            console.error(err);
        }
    },

    /** 
     * Zaloguje lokalne (log.txt) a na server (oboje podle nastaveni v Config.xml) TIMEOUT zpravu message
     * ! Zalogovat při nečinnosti na kiosku a návratu na uvodní stránku aplikace
     */
    jsLogTimeout: (): void => {
        const message = "Návrat na úvodní obrazovku po timeoutu.;";
        console.log("VpassCloud.ts: jsLogTimeout");
        try {
            chrome.webview.hostObjects.netclient.jsLogTimeout(message);
        } catch (err) {
            console.error(err);
        }
    },

    /** 
     * Pres event OnHtml v class ClientAsyncHandler preda do nadrazene .NET aplikace string message
     * ! Jen ve specifických případech
     */
    jsDotNet: (message: string): void => {
        console.log("VpassCloud.ts: jsDotNet", message);
        try {
            chrome.webview.hostObjects.netclient.jsDotNet(message);
        } catch (err) {
            console.error(err);
        }
    },

    /** 
     * Zaloguje lokalne (log.txt) a na server (oboje podle nastaveni v Config.xml) ERROR zpravu message
     *  ! Zalogovat při systémové chybě
     */
    jsLogError: (message: string): void => {
        console.log("VpassCloud.ts: jsLogError", message);
        try {
            chrome.webview.hostObjects.netclient.jsLogError(message);
        } catch (err) {
            console.error(err);
        }
    },

    /** 
     * Zaloguje lokalne (log.txt) a na server (oboje podle nastaveni v Config.xml) SAVE RESULT zpravu message
     * ! Zalogovat vždy při uložení výsledku, pokud je aplikace hrou
     */
    jsLogSaveResult: (value: string | number, message?: string | null): void => {
        const logMessage = message || `Uživatel uložil výsledek s hodnotou: ${value}`;
        console.log("VpassCloud.ts: jsLogSaveResult", logMessage);
        try {
            chrome.webview.hostObjects.netclient.jsLogSaveResult(logMessage);
        } catch (err) {
            console.error(err);
        }
    },

    /** 
     * Zaloguje lokalne (log.txt) a na server (oboje podle nastaveni v Config.xml) CLICK zpravu message
     * !!! používat je ve specifických případech, klient již loguje sám všechny kliky
     */
    jsLogClick: (message: string): void => {
        console.log("VpassCloud.ts: jsLogClick", message);
        try {
            chrome.webview.hostObjects.netclient.jsLogClick(message);
        } catch (err) {
            console.error(err);
        }
    },

    /** 
     * Zaloguje lokalne (log.txt) a na server (oboje podle nastaveni v Config.xml) VALUE zpravu message
     * ! Použít ve specifických případech, kdy je potřeba zalogovat nějakou hodnotu, hodnotu použijte vždy úplně na konci řetezce message za mezerou bez tečky na konci věty.
     */
    jsLogValue: (message: string): void => {
        console.log("VpassCloud.ts: jsLogValue", message);
        try {
            chrome.webview.hostObjects.netclient.jsLogValue(message);
        } catch (err) {
            console.error(err);
        }
    },

    /** 
     * Zaloguje lokalne (log.txt) a na server (oboje podle nastaveni v Config.xml) GENERAL zpravu message
     * ! Zalogovat ve specifických případech speciálního typu
     */
    jsLogGeneral: (message: string, type: string): void => {
        console.log("VpassCloud.ts: jsLogGeneral", message, type);
        try {
            chrome.webview.hostObjects.netclient.jsLogGeneral(message, type);
        } catch (err) {
            console.error(err);
        }
    },

    /** 
     * Zaloguje lokalne (log.txt) a na server (oboje podle nastaveni v Config.xml) USER LOGIN zpravu message
     * ! Zalogovat při přihlášení uživatele, tzn. po načtení qr codu a jeho validaci
     */
    jsLogUserLogin: (message: string): void => {
        console.log("VpassCloud.ts: jsLogUserLogin", message);
        try {
            chrome.webview.hostObjects.netclient.jsLogUserLogin(message);
        } catch (err) {
            console.error(err);
        }
    },

    /** 
     * Zaloguje lokalne (log.txt) a na server (oboje podle nastaveni v Config.xml) INFO zpravu message
     * ! Zalogovat informaci
     */
    jsLogInfo: (message: string): void => {
        console.log("VpassCloud.ts: jsLogInfo", message);
        try {
            chrome.webview.hostObjects.netclient.jsLogInfo(message);
        } catch (err) {
            console.error(err);
        }
    }
};

export default vc;
