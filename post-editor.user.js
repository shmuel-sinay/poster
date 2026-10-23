// ==UserScript==
// @name         עורך פוסטים עם Claude
// @namespace    https://github.com/shmuel-sinay/poster
// @version      1.0.0
// @description  עריכה אוטומטית של פוסטים בעזרת Claude: מסדר את הטקסט כמו מדריך מעוצב, ושומר על הניסוח המקורי.
// @author       shmuel-sinay
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @connect      api.anthropic.com
// @run-at       document-idle
// @noframes
// @updateURL    https://raw.githubusercontent.com/shmuel-sinay/poster/main/post-editor.user.js
// @downloadURL  https://raw.githubusercontent.com/shmuel-sinay/poster/main/post-editor.user.js
// @supportURL   https://github.com/shmuel-sinay/poster/issues
// ==/UserScript==

(function () {
  'use strict';

  // ---------- הגדרות ----------
  const DEFAULTS = {
    apiKey: '',
    model: 'claude-sonnet-5-5',
    format: 'plain', // plain = פייסבוק/וואטסאפ, markdown = אתרים שתומכים ב-Markdown
    extra: '',
    showButton: true,
  };
  const MODELS = [
    ['claude-sonnet-5-5', 'Sonnet 5.5 (מומלץ: מהיר ואיכותי)'],
    ['claude-opus-5-5', 'Opus 5.5 (הכי חזק, איטי ויקר יותר)'],
    ['claude-haiku-5-5', 'Haiku 5.5 (הכי מהיר וזול)'],
  ];
  const get = (k) => GM_getValue(k, DEFAULTS[k]);
  const set = (k, v) => GM_setValue(k, v);

  // ---------- ההנחיה ל-Claude ----------
  function systemPrompt() {
    const fmt = get('format') === 'markdown'
      ? `פורמט פלט: Markdown (כותרות עם #, רשימות עם -, הדגשה עם **).`
      : `פורמט פלט: טקסט רגיל שמוצג יפה בפייסבוק, וואטסאפ ופורומים, בלי סימני Markdown כמו # או **.
השתמש בשורות ריקות בין חלקים, בכותרות קצרות בשורה נפרדת, ברשימות ממוספרות (1. 2. 3.) או בתבליטים (•), ובאימוג'י עניינים ומעטים בתחילת כותרות כשזה מתאים.`;
    const extra = (get('extra') || '').trim();
    return `אתה עורך פוסטים. המשתמש ישלח טקסט של פוסט, ותפקידך להחזיר אותו ערוך כך שייראה כמו מדריך מסודר ומעוצב.

כללים:
- שמור על הניסוח, הסגנון והתוכן המקוריים ככל האפשר. אל תוסיף מידע חדש ואל תשמיט מידע.
- מותר: לתקן שגיאות כתיב ופיסוק, לחלק לפסקאות, להוסיף כותרת ראשית וכותרות משנה קצרות, להפוך רצף שלבים לרשימה ממוספרת ורצף פריטים לרשימת תבליטים, ולהדגיש את העיקר.
- כתוב באותה שפה של הפוסט המקורי.
- החזר רק את הפוסט הערוך, בלי הקדמה, בלי הסברים ובלי מרכאות סביבו.
${fmt}${extra ? `\n\nהנחיות נוספות מהמשתמש:\n${extra}` : ''}`;
  }

  // ---------- קריאה ל-API ----------
  function callClaude(text) {
    return new Promise((resolve, reject) => {
      const apiKey = get('apiKey');
      if (!apiKey) return reject(new Error('לא הוגדר מפתח API. לחץ על ⚙️ כדי להגדיר.'));
      GM_xmlhttpRequest({
        method: 'POST',
        url: 'https://api.anthropic.com/v1/messages',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        data: JSON.stringify({
          model: get('model'),
          max_tokens: 8000,
          system: systemPrompt(),
          messages: [{ role: 'user', content: text }],
        }),
        timeout: 180000,
        onload: (res) => {
          let body;
          try { body = JSON.parse(res.responseText); } catch (e) {
            return reject(new Error('תשובה לא תקינה מהשרת (' + res.status + ')'));
          }
          if (res.status !== 200) {
            const msg = (body && body.error && body.error.message) || ('שגיאה ' + res.status);
            if (res.status === 401) return reject(new Error('מפתח ה-API שגוי. בדוק אותו בהגדרות.'));
            return reject(new Error(msg));
          }
          const out = (body.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
          if (!out) return reject(new Error('התקבלה תשובה ריקה.'));
          resolve(out);
        },
        onerror: () => reject(new Error('שגיאת רשת. בדוק את החיבור לאינטרנט.')),
        ontimeout: () => reject(new Error('הבקשה לקחה יותר מדי זמן. נסה שוב.')),
      });
    });
  }

  // ---------- זיהוי שדה הטקסט שהמשתמש עובד בו ----------
  let lastField = null; // השדה האחרון שהיה בפוקוס (textarea / input / contenteditable)
  function editableRoot(el) {
    if (!el || el.nodeType !== 1) return null;
    if (el.closest && el.closest('#pe-root')) return null;
    if (el.tagName === 'TEXTAREA') return el;
    if (el.tagName === 'INPUT' && /^(text|search|)$/i.test(el.type)) return el;
    if (el.isContentEditable) {
      let r = el;
      while (r.parentElement && r.parentElement.isContentEditable) r = r.parentElement;
      return r;
    }
    return null;
  }
  document.addEventListener('focusin', (e) => {
    const f = editableRoot(e.target);
    if (f) lastField = f;
  }, true);

  function fieldText(f) {
    if (!f) return '';
    return (f.value !== undefined && (f.tagName === 'TEXTAREA' || f.tagName === 'INPUT')) ? f.value : f.innerText;
  }

  function currentSelection() {
    const a = document.activeElement;
    if (a && (a.tagName === 'TEXTAREA' || a.tagName === 'INPUT') && a.selectionStart !== a.selectionEnd) {
      return a.value.substring(a.selectionStart, a.selectionEnd);
    }
    const s = window.getSelection();
    return s ? s.toString() : '';
  }

  function insertIntoField(f, text) {
    if (!f || !document.contains(f)) return false;
    f.focus();
    if (f.tagName === 'TEXTAREA' || f.tagName === 'INPUT') {
      const proto = f.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(f, text); // עובד גם באתרים שבנויים ב-React
      f.dispatchEvent(new Event('input', { bubbles: true }));
      f.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    // contenteditable (פייסבוק, ג'ימייל וכו'): בוחרים הכל ומדביקים, כדי שהאתר יזהה את השינוי
    const range = document.createRange();
    range.selectNodeContents(f);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    const pasted = f.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    if (!pasted) return true; // האתר טיפל בהדבקה בעצמו
    return document.execCommand('insertText', false, text);
  }

  // ---------- ממשק ----------
  const css = `
  #pe-root, #pe-root * { box-sizing: border-box; font-family: system-ui, "Segoe UI", Arial, sans-serif; }
  #pe-fab { position: fixed; bottom: 20px; left: 20px; z-index: 2147483646; width: 48px; height: 48px; border-radius: 50%;
    border: none; background: #d97757; color: #fff; font-size: 22px; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,.25); }
  #pe-fab:hover { transform: scale(1.06); }
  #pe-panel { position: fixed; bottom: 80px; left: 20px; z-index: 2147483647; width: min(520px, calc(100vw - 40px));
    max-height: calc(100vh - 100px); display: none; flex-direction: column; gap: 8px; direction: rtl; text-align: right;
    background: #fff; color: #1f1f1f; border-radius: 12px; padding: 14px; box-shadow: 0 8px 30px rgba(0,0,0,.3); font-size: 14px; }
  #pe-panel.open { display: flex; }
  #pe-panel h3 { margin: 0; font-size: 16px; display: flex; justify-content: space-between; align-items: center; }
  #pe-panel textarea { width: 100%; min-height: 140px; resize: vertical; padding: 8px; border: 1px solid #ccc; border-radius: 8px;
    font-size: 14px; line-height: 1.5; direction: auto; background: #fff; color: #1f1f1f; }
  #pe-panel input[type=password], #pe-panel input[type=text], #pe-panel select { width: 100%; padding: 6px 8px; border: 1px solid #ccc;
    border-radius: 8px; font-size: 14px; background: #fff; color: #1f1f1f; }
  #pe-panel label { font-weight: 600; font-size: 13px; }
  #pe-panel .row { display: flex; gap: 6px; flex-wrap: wrap; }
  #pe-panel button.b { padding: 7px 12px; border-radius: 8px; border: 1px solid #ccc; background: #f5f5f5; color: #1f1f1f; cursor: pointer; font-size: 13px; }
  #pe-panel button.b.primary { background: #d97757; border-color: #d97757; color: #fff; }
  #pe-panel button.b:disabled { opacity: .5; cursor: default; }
  #pe-panel button.x { background: none; border: none; font-size: 18px; cursor: pointer; color: #666; }
  #pe-panel .msg { font-size: 13px; min-height: 18px; }
  #pe-panel .msg.err { color: #c0392b; } #pe-panel .msg.ok { color: #1e8449; }
  #pe-panel .settings { display: none; flex-direction: column; gap: 6px; border-top: 1px solid #eee; padding-top: 8px; }
  #pe-panel .settings.open { display: flex; }
  #pe-panel .hint { font-size: 12px; color: #666; }
  @media (prefers-color-scheme: dark) {
    #pe-panel { background: #262624; color: #eee; }
    #pe-panel textarea, #pe-panel input[type=password], #pe-panel input[type=text], #pe-panel select { background: #1f1e1d; color: #eee; border-color: #555; }
    #pe-panel button.b { background: #3a3936; color: #eee; border-color: #555; }
    #pe-panel .hint { color: #aaa; } #pe-panel .settings { border-color: #444; }
  }`;

  const root = document.createElement('div');
  root.id = 'pe-root';
  root.innerHTML = `
    <style>${css}</style>
    <button id="pe-fab" title="עורך פוסטים (Alt+Shift+E)">✨</button>
    <div id="pe-panel">
      <h3><span>✨ עורך פוסטים</span><span><button class="x" data-a="gear" title="הגדרות">⚙️</button><button class="x" data-a="close" title="סגור">✕</button></span></h3>
      <label>הפוסט המקורי</label>
      <textarea id="pe-in" placeholder="הדבק כאן את הפוסט, או סמן טקסט בדף / עמוד בתוך תיבת כתיבה ופתח את העורך"></textarea>
      <div class="row">
        <button class="b primary" data-a="run">ערוך עם Claude</button>
        <button class="b" data-a="grab">קח מהשדה בדף</button>
      </div>
      <div class="msg" id="pe-msg"></div>
      <label>הגרסה הערוכה</label>
      <textarea id="pe-out" placeholder="כאן תופיע הגרסה הערוכה. אפשר לתקן אותה ידנית לפני שמכניסים."></textarea>
      <div class="row">
        <button class="b primary" data-a="insert">הכנס לשדה בדף</button>
        <button class="b" data-a="copy">העתק</button>
      </div>
      <div class="settings" id="pe-settings">
        <label>מפתח API של Claude</label>
        <input type="password" id="pe-key" placeholder="sk-ant-..." autocomplete="off">
        <div class="hint">המפתח נשמר רק בדפדפן שלך (באחסון של התוסף), ונשלח רק לשרת של Anthropic.</div>
        <label>מודל</label>
        <select id="pe-model">${MODELS.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>
        <label>פורמט הפלט</label>
        <select id="pe-format">
          <option value="plain">טקסט רגיל (פייסבוק, וואטסאפ, פורומים)</option>
          <option value="markdown">Markdown (אתרים שתומכים בו)</option>
        </select>
        <label>הנחיות נוספות (לא חובה)</label>
        <textarea id="pe-extra" style="min-height:60px" placeholder="למשל: בלי אימוג'י / תמיד לסיים בשורת סיכום"></textarea>
        <label style="font-weight:400"><input type="checkbox" id="pe-showbtn"> הצג את הכפתור הצף בכל אתר</label>
        <div class="row"><button class="b primary" data-a="save">שמור הגדרות</button></div>
      </div>
    </div>`;
  document.documentElement.appendChild(root);

  const $ = (id) => root.querySelector('#' + id);
  const panel = $('pe-panel');
  const fab = $('pe-fab');
  const inEl = $('pe-in');
  const outEl = $('pe-out');
  const msg = (t, cls) => { const m = $('pe-msg'); m.textContent = t || ''; m.className = 'msg ' + (cls || ''); };

  function applyFabVisibility() { fab.style.display = get('showButton') ? '' : 'none'; }
  applyFabVisibility();

  function loadSettings() {
    $('pe-key').value = get('apiKey');
    $('pe-model').value = get('model');
    if (!$('pe-model').value) $('pe-model').value = DEFAULTS.model;
    $('pe-format').value = get('format');
    $('pe-extra').value = get('extra');
    $('pe-showbtn').checked = !!get('showButton');
  }

  function openPanel(showSettings) {
    const sel = currentSelection().trim();
    if (sel) inEl.value = sel;
    else if (!inEl.value.trim() && lastField) inEl.value = fieldText(lastField).trim();
    loadSettings();
    $('pe-settings').classList.toggle('open', !!showSettings || !get('apiKey'));
    if (!get('apiKey')) msg('כדי להתחיל, הדבק את מפתח ה-API שלך בהגדרות למטה ולחץ "שמור הגדרות".');
    panel.classList.add('open');
  }
  function closePanel() { panel.classList.remove('open'); }

  // שומרים את הבחירה לפני שהלחיצה על הכפתור מבטלת אותה
  fab.addEventListener('mousedown', (e) => e.preventDefault());
  fab.addEventListener('click', () => (panel.classList.contains('open') ? closePanel() : openPanel()));

  root.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-a]');
    if (!a) return;
    switch (a.dataset.a) {
      case 'close': closePanel(); break;
      case 'gear': loadSettings(); $('pe-settings').classList.toggle('open'); break;
      case 'grab': {
        const t = fieldText(lastField).trim();
        if (t) { inEl.value = t; msg(''); } else msg('לא נמצא שדה כתיבה עם טקסט. לחץ קודם בתוך תיבת הפוסט בדף.', 'err');
        break;
      }
      case 'save':
        set('apiKey', $('pe-key').value.trim());
        set('model', $('pe-model').value);
        set('format', $('pe-format').value);
        set('extra', $('pe-extra').value);
        set('showButton', $('pe-showbtn').checked);
        applyFabVisibility();
        $('pe-settings').classList.remove('open');
        msg('ההגדרות נשמרו.', 'ok');
        break;
      case 'run': {
        const text = inEl.value.trim();
        if (!text) { msg('אין טקסט לעריכה.', 'err'); break; }
        a.disabled = true;
        msg('Claude עורך את הפוסט...');
        try {
          outEl.value = await callClaude(text);
          msg('מוכן! אפשר לתקן ידנית, ואז להכניס לשדה או להעתיק.', 'ok');
        } catch (err) {
          msg(err.message, 'err');
          if (!get('apiKey')) $('pe-settings').classList.add('open');
        } finally { a.disabled = false; }
        break;
      }
      case 'copy':
        if (!outEl.value) { msg('אין עדיין גרסה ערוכה.', 'err'); break; }
        GM_setClipboard(outEl.value, 'text');
        msg('הועתק ללוח.', 'ok');
        break;
      case 'insert': {
        if (!outEl.value) { msg('אין עדיין גרסה ערוכה.', 'err'); break; }
        if (insertIntoField(lastField, outEl.value)) msg('הטקסט הוכנס לשדה.', 'ok');
        else {
          GM_setClipboard(outEl.value, 'text');
          msg('לא מצאתי שדה כתיבה בדף, אז העתקתי ללוח. הדבק עם Ctrl+V.', 'ok');
        }
        break;
      }
    }
  });

  // קיצור מקלדת: Alt+Shift+E
  document.addEventListener('keydown', (e) => {
    if (e.altKey && e.shiftKey && (e.code === 'KeyE')) {
      e.preventDefault();
      panel.classList.contains('open') ? closePanel() : openPanel();
    }
  }, true);

  GM_registerMenuCommand('✨ פתח את עורך הפוסטים', () => openPanel());
  GM_registerMenuCommand('⚙️ הגדרות (מפתח API, מודל)', () => openPanel(true));
  GM_registerMenuCommand('👁️ הצג/הסתר כפתור צף', () => { set('showButton', !get('showButton')); applyFabVisibility(); });
})();
