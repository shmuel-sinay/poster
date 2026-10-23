// ==UserScript==
// @name         עורך פוסטים עם Claude
// @namespace    https://github.com/shmuel-sinay/poster
// @version      1.2.0
// @description  עריכה אוטומטית של פוסטים בעזרת Claude: מסדר את הטקסט כמו מדריך מעוצב, ושומר על הניסוח המקורי.
// @author       shmuel-sinay
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @connect      api.anthropic.com
// @connect      mitmachim.top
// @connect      *
// @run-at       document-idle
// @noframes
// @updateURL    https://raw.githubusercontent.com/shmuel-sinay/poster/main/post-editor.user.js
// @downloadURL  https://raw.githubusercontent.com/shmuel-sinay/poster/main/post-editor.user.js
// @supportURL   https://github.com/shmuel-sinay/poster/issues
// ==/UserScript==

(function () {
  'use strict';

  // ---------- הגדרות ----------
  // ארגז הכלים: מה הפורום יודע להציג. ה-AI מקבל את הרשימה הזאת בכל עריכה.
  // אפשר לערוך אותה בהגדרות, ולהוסיף כלים שחסרים.
  const DEFAULT_TOOLBOX = `הפורום הוא מתמחים טופ (NodeBB עם התוסף extended-markdown). כותבים ב-Markdown, ואלה כל כלי העיצוב שעומדים לרשותך:

טקסט:
- הדגשה: **טקסט**
- נטוי: *טקסט*
- קו תחתון: ***טקסט***
- קו פוסל (לתיקון טעות): ~~טקסט~~
- צבע: %(#f0300e)[טקסט]   (צבעים נפוצים בפורום: אדום #f0300e או #ff0303, ירוק #13bf0d)
- קוד באמצע משפט: \`טקסט\`
- הסתרה מאורחים (רק משתמשים רשומים רואים): ||טקסט||   (בלי רווח בין הקווים לטקסט)
- אייקון מידע עם טקסט בריחוף: °fa-info°(הטקסט שמוצג בריחוף)
- תיוג משתמש: @שם-משתמש   (במקום רווח בשם שמים מקף, ולפני ה-@ צריך רווח)

כותרות ומבנה:
- פס כותרת כהה ברוחב מלא (כמו בפוסטים המעוצבים, מחלק בין חלקי הפוסט): #anchor(טקסט הכותרת)
  אפשר גם עם קישור בתוכו, למשל פס הורדה: #anchor([להורדה](https://...))
- כותרת רגילה: # גדולה, ## ... עד ###### קטנה (רווח אחרי ה-#, רק בתחילת שורה)
- קו מפריד: ___ בשורה נפרדת, ושורה ריקה אחריו
- שורה ריקה נוספת (הפורום מוחק שורות ריקות כפולות): &nbsp; בשורה נפרדת
- יישור: |- בתחילת פסקה = לשמאל, -| בסוף פסקה = לימין, |- בהתחלה ו -| בסוף = למרכז. חייבת להיות שורה ריקה לפני הפסקה.

רשימות וטבלאות:
- תבליטים: "- " בתחילת שורה. תת-רשימה: שני רווחים לפני המקף.
- רשימה ממוספרת: 1. 2. 3.
- תיבת סימון: [ ]&#160;טקסט   מסומנת: [X]&#160;טקסט
- טבלה (יישור לימין):
| א' | ב' |
|---:|---:|
| תוכן | תוכן |

בלוקים:
- ספוילר (כפתור "Spoiler" שמסתיר תוכן ארוך עד שלוחצים): שורה עם ::: בלבד, התוכן, ושוב שורה עם ::: בלבד. שורה ריקה לפני ואחרי.
:::
תוכן מוסתר
:::
- תיבת הערה צבעונית (המילה בסוגריים המרובעים חייבת להיות באנגלית):
!!! info [Info]: טקסט   (כחול, מידע)
!!! important [Important]: טקסט   (חשוב)
!!! warning [Warning]: טקסט   (אזהרה)
- ציטוט: "> " בתחילת שורה, ושורה ריקה אחרי הציטוט.
- בלוק קוד: בין שתי שורות של שלושה גרשיים הפוכים (\`\`\`).
- קוד בכמה שפות בלשוניות: ===group ואחריו כמה בלוקי קוד, וסוגרים ב-===

קישורים ותמונות:
- קישור: [טקסט](https://...)
- תמונה: ![תיאור](https://...)   (רק קישורים שכבר מופיעים בפוסט המקורי)
- תפריט עם קישורים פנימיים: בכל חלק שמים שורה ###### מילה (מילה אחת, או מילים מחוברות במקף), ובתפריט: [שם החלק](#מילה)

הערות:
- לרוב הכלים צריך שורה ריקה לפני ואחרי. אם משהו לא עובד, זו בדרך כלל הסיבה.
- פוסט מעוצב טוב בפורום בנוי בדרך כלל כך: פתיח קצר, פסי כותרת (#anchor(...)) שמחלקים לחלקים, רשימות תבליטים, הדגשות וצבע לדברים חשובים, ספוילר לפרטים ארוכים או לרשימות ארוכות, תיבת אזהרה לדברים שחייבים לשים לב אליהם, ופס הורדה / קישור בסוף.`;

  const DEFAULTS = {
    apiKey: '',
    model: 'claude-sonnet-5-5',
    format: 'forum', // forum = Markdown של הפורום עם ארגז הכלים, plain = טקסט רגיל לפייסבוק/וואטסאפ
    toolbox: '', // ריק = ארגז הכלים המובנה
    exampleUrls: 'https://mitmachim.top/topic/102072',
    examples: '', // קוד המקור של פוסטים לדוגמה, נמשך מהפורום
    extra: '',
    showButton: true,
  };
  const MODELS = [
    ['claude-sonnet-5-5', 'Sonnet 5.5 (מומלץ: מהיר ואיכותי)'],
    ['claude-opus-5-5', 'Opus 5.5 (הכי חזק, איטי ויקר יותר)'],
    ['claude-haiku-5-5', 'Haiku 5.5 (הכי מהיר וזול)'],
  ];
  const MAX_EXAMPLES_CHARS = 30000;
  const get = (k) => GM_getValue(k, DEFAULTS[k]);
  const set = (k, v) => GM_setValue(k, v);

  // ---------- ההנחיה ל-Claude ----------
  function systemPrompt() {
    const extra = (get('extra') || '').trim();
    const rules = `אתה עורך פוסטים. המשתמש ישלח טקסט של פוסט, ותפקידך להחזיר אותו ערוך כך שייראה כמו מדריך מסודר ומעוצב.

כללים:
- שמור על הניסוח, הסגנון והתוכן המקוריים ככל האפשר. אל תוסיף מידע חדש ואל תשמיט מידע.
- מותר: לתקן שגיאות כתיב ופיסוק, לחלק לפסקאות, להוסיף כותרת ראשית וכותרות לחלקים, להפוך רצף שלבים לרשימה ממוספרת ורצף פריטים לרשימת תבליטים, להדגיש את העיקר, ולהסתיר פרטים ארוכים בספוילר.
- כתוב באותה שפה של הפוסט המקורי.
- החזר רק את הפוסט הערוך, בלי הקדמה, בלי הסברים ובלי מרכאות או גדר קוד סביבו.`;
    if (get('format') === 'plain') {
      return `${rules}
פורמט פלט: טקסט רגיל שמוצג יפה בפייסבוק ובוואטסאפ, בלי סימני Markdown כמו # או **.
השתמש בשורות ריקות בין חלקים, בכותרות קצרות בשורה נפרדת, ברשימות ממוספרות (1. 2. 3.) או בתבליטים (•), ובאימוג'י מעטים בתחילת כותרות כשזה מתאים.${extra ? `\n\nהנחיות נוספות מהמשתמש:\n${extra}` : ''}`;
    }
    const examples = (get('examples') || '').trim().slice(0, MAX_EXAMPLES_CHARS);
    return `${rules}

<ארגז_כלים>
${get('toolbox') || DEFAULT_TOOLBOX}
</ארגז_כלים>
${examples ? `
להלן קוד המקור של פוסטים מעוצבים מהפורום. למד מהם איך כותבים בפורום כל כלי עיצוב (פסי כותרת, ספוילרים, צבעים, קישורי הורדה וכו'), ואיך בנוי פוסט טוב: פתיח, חלקים עם פסי כותרת, רשימות, ספוילרים לפרטים ארוכים, וסיום.
השתמש באותו תחביר בדיוק ובמבנה דומה. אל תעתיק מהם תוכן, רק את העיצוב.
<פוסטים_לדוגמה>
${examples}
</פוסטים_לדוגמה>
` : ''}
פורמט פלט: קוד מקור של פוסט בפורום, מוכן להדבקה בעורך הפורום, תוך שימוש בכלים מארגז הכלים ומהדוגמאות.${extra ? `\n\nהנחיות נוספות מהמשתמש:\n${extra}` : ''}`;
  }

  // ---------- משיכת פוסטים לדוגמה מהפורום ----------
  function httpGet(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET', url, headers: { accept: 'application/json' }, timeout: 30000,
        onload: (r) => {
          if (r.status !== 200) return reject(new Error('שגיאה ' + r.status + ' ב-' + url));
          try { resolve(JSON.parse(r.responseText)); } catch (e) { reject(new Error('תשובה לא תקינה מ-' + url)); }
        },
        onerror: () => reject(new Error('שגיאת רשת ב-' + url)),
        ontimeout: () => reject(new Error('תם הזמן ב-' + url)),
      });
    });
  }
  // מקבל קישור לנושא ב-NodeBB ומחזיר את קוד המקור של ההודעה הראשונה בו
  async function fetchTopicSource(link) {
    const u = new URL(link.trim());
    const m = u.pathname.match(/\/topic\/(\d+)/);
    if (!m) throw new Error('זה לא נראה כמו קישור לנושא בפורום: ' + link);
    const topic = await httpGet(`${u.origin}/api/topic/${m[1]}`);
    const first = topic.posts && topic.posts[0];
    const pid = topic.mainPid || (first && first.pid);
    const title = topic.title || '';
    try {
      const raw = await httpGet(`${u.origin}/api/v3/posts/${pid}/raw`);
      const content = (raw.response && raw.response.content) || raw.content;
      if (content) return `### פוסט לדוגמה: ${title}\n${content}`;
    } catch (e) { /* ננסה את ה-HTML */ }
    if (first && first.content) {
      return `### פוסט לדוגמה (HTML כפי שמוצג בפורום, כי קוד המקור לא היה זמין): ${title}\n${first.content}`;
    }
    throw new Error('לא הצלחתי לקרוא את הפוסט ב-' + link);
  }
  async function learnExamples(urlsText) {
    const urls = urlsText.split(/\s+/).filter(Boolean);
    const out = [];
    const errors = [];
    for (const url of urls) {
      try { out.push(await fetchTopicSource(url)); } catch (e) { errors.push(e.message); }
    }
    return { text: out.join('\n\n---\n\n'), count: out.length, errors };
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
    max-height: calc(100vh - 100px); overflow-y: auto; display: none; flex-direction: column; gap: 8px; direction: rtl; text-align: right;
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
          <option value="forum">פורום (מתמחים טופ) עם ארגז הכלים</option>
          <option value="plain">טקסט רגיל (פייסבוק, וואטסאפ)</option>
        </select>
        <label>ארגז הכלים של הפורום</label>
        <textarea id="pe-toolbox" style="min-height:120px"></textarea>
        <div class="hint">זו הרשימה שה-AI מקבל: אילו כלי עיצוב יש בפורום ואיך כותבים אותם. אפשר להוסיף או לתקן.</div>
        <div class="row"><button class="b" data-a="resettools">החזר את ארגז הכלים לברירת המחדל</button></div>
        <label>פוסטים מעוצבים ללמוד מהם (קישור לנושא בכל שורה)</label>
        <textarea id="pe-exurls" style="min-height:50px" placeholder="https://mitmachim.top/topic/..."></textarea>
        <div class="row"><button class="b" data-a="learn">משוך את קוד המקור מהפורום</button></div>
        <label>קוד המקור של הפוסטים לדוגמה</label>
        <textarea id="pe-examples" style="min-height:80px" placeholder="נמלא אוטומטית בלחיצה על הכפתור למעלה. אפשר גם להדביק כאן ידנית קוד מקור של פוסט (מתוך חלון העריכה של הפורום)."></textarea>
        <div class="hint">מכאן ה-AI לומד את התחביר המדויק של פסי הכותרת, הספוילרים וכל השאר. כדאי להיות מחובר לפורום בזמן המשיכה.</div>
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
    $('pe-format').value = get('format') === 'plain' ? 'plain' : 'forum';
    $('pe-toolbox').value = get('toolbox') || DEFAULT_TOOLBOX;
    $('pe-exurls').value = get('exampleUrls');
    $('pe-examples').value = get('examples');
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
        {
          const tb = $('pe-toolbox').value.trim();
          // שומרים רק אם שונה מברירת המחדל, כדי שעדכונים לארגז הכלים יגיעו אוטומטית
          set('toolbox', tb && tb !== DEFAULT_TOOLBOX.trim() ? tb : '');
        }
        set('exampleUrls', $('pe-exurls').value.trim());
        set('examples', $('pe-examples').value.trim());
        set('extra', $('pe-extra').value);
        set('showButton', $('pe-showbtn').checked);
        applyFabVisibility();
        $('pe-settings').classList.remove('open');
        msg('ההגדרות נשמרו.', 'ok');
        break;
      case 'resettools': $('pe-toolbox').value = DEFAULT_TOOLBOX; msg('ארגז הכלים הוחזר לברירת המחדל. לחץ "שמור הגדרות".'); break;
      case 'learn': {
        a.disabled = true;
        msg('מושך פוסטים לדוגמה מהפורום...');
        const r = await learnExamples($('pe-exurls').value);
        a.disabled = false;
        if (r.count) {
          $('pe-examples').value = r.text;
          set('examples', r.text);
          set('exampleUrls', $('pe-exurls').value.trim());
          msg(`נטענו ${r.count} פוסטים לדוגמה ונשמרו.` + (r.errors.length ? ' חלק נכשלו: ' + r.errors.join(' | ') : ''), 'ok');
        } else msg('לא הצלחתי למשוך: ' + (r.errors.join(' | ') || 'אין קישורים'), 'err');
        break;
      }
      case 'run': {
        const text = inEl.value.trim();
        if (!text) { msg('אין טקסט לעריכה.', 'err'); break; }
        a.disabled = true;
        try {
          // בפעם הראשונה: לומדים לבד את כלי העיצוב מהפוסטים לדוגמה
          if (get('format') !== 'plain' && !get('examples') && get('exampleUrls')) {
            msg('לומד את כלי העיצוב מהפוסטים לדוגמה בפורום...');
            const r = await learnExamples(get('exampleUrls'));
            if (r.count) set('examples', r.text);
          }
          msg('Claude עורך את הפוסט...');
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
