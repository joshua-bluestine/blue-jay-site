/* Blue Jay Firebase Security Rules checker. Runs entirely in the browser: nothing is sent anywhere. */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const input = $('#fb-rules');
  const out = $('#fb-results');
  const summary = $('#fb-summary');
  if (!input || !out) return;

  const GUIDE = 'firebase-security-rules-check.html';
  const norm = (s) => String(s).replace(/\s+/g, ' ').trim();

  // ---------- text helpers

  // Remove // and /* */ comments that aren't inside strings.
  function stripComments(src) {
    let res = ''; let q = null;
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (q) {
        res += ch;
        if (ch === '\\') { res += src[i + 1] || ''; i++; continue; }
        if (ch === q) q = null;
        continue;
      }
      if (ch === "'" || ch === '"') { q = ch; res += ch; continue; }
      if (ch === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; res += '\n'; continue; }
      if (ch === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 1; res += ' '; continue; }
      res += ch;
    }
    return res;
  }

  // End of the statement starting at i: the next top-level ';', an unmatched '}',
  // or a newline followed by another statement (for rules written without semicolons).
  function stmtEnd(s, i) {
    let depth = 0; let q = null;
    for (; i < s.length; i++) {
      const ch = s[i];
      if (q) { if (ch === '\\') { i++; continue; } if (ch === q) q = null; continue; }
      if (ch === "'" || ch === '"') q = ch;
      else if ('([{'.includes(ch)) depth++;
      else if (')]}'.includes(ch)) { if (depth === 0) return i; depth--; }
      else if (ch === ';' && depth === 0) return i;
      else if (ch === '\n' && depth === 0 && /^\s*(?:allow|match|function)\b/.test(s.slice(i + 1, i + 40))) return i;
    }
    return -1;
  }

  // Index of the bracket that closes the one at s[open], or -1.
  function closing(s, open) {
    const pairs = { '(': ')', '{': '}', '[': ']' };
    const want = pairs[s[open]]; const opener = s[open];
    let depth = 0; let q = null;
    for (let i = open; i < s.length; i++) {
      const ch = s[i];
      if (q) { if (ch === '\\') { i++; continue; } if (ch === q) q = null; continue; }
      if (ch === "'" || ch === '"') q = ch;
      else if (ch === opener) depth++;
      else if (ch === want) { depth--; if (depth === 0) return i; }
    }
    return -1;
  }

  // Split a function's arguments on top-level commas.
  function splitArgs(s) {
    const args = []; let cur = ''; let depth = 0; let q = null;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (q) { cur += ch; if (ch === q) q = null; continue; }
      if (ch === "'" || ch === '"') q = ch;
      else if ('([{'.includes(ch)) depth++;
      else if (')]}'.includes(ch)) depth--;
      else if (ch === ',' && depth === 0) { args.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    if (cur.trim()) args.push(cur.trim());
    return args;
  }

  const wordRe = (w) => new RegExp('(?<![\\w.$])' + w.replace(/[$]/g, '\\$') + '(?![\\w$])', 'g');

  // The expression a rules function returns, with its `let` bindings substituted in.
  function fnReturn(body) {
    const lets = {};
    const letRe = /\blet\s+(\w+)\s*=\s*/g; let m;
    while ((m = letRe.exec(body))) {
      const e = stmtEnd(body, letRe.lastIndex);
      lets[m[1]] = norm(body.slice(letRe.lastIndex, e < 0 ? body.length : e));
    }
    const k = body.search(/\breturn\b(?![\s\S]*\breturn\b)/);
    if (k < 0) return null;
    const start = k + 'return'.length;
    const e = stmtEnd(body, start);
    let expr = norm(body.slice(start, e < 0 ? body.length : e));
    for (const [name, val] of Object.entries(lets)) expr = expr.replace(wordRe(name), '(' + val + ')');
    return expr;
  }

  // Replace calls to the rules' own functions with their bodies, so
  // `allow read: if signedIn()` is checked as `request.auth != null`.
  function expand(cond, fns) {
    let c = cond;
    for (let pass = 0; pass < 6 && c.length < 20000; pass++) {
      const re = /(^|[^.\w])([A-Za-z_]\w*)\s*\(/g;
      let m; let built = ''; let last = 0; let changed = false;
      while ((m = re.exec(c))) {
        const f = fns[m[2]];
        if (!f || f.body == null) continue;
        const open = m.index + m[0].length - 1;
        const close = closing(c, open);
        if (close < 0) continue;
        const args = splitArgs(c.slice(open + 1, close));
        let body = f.body;
        f.params.forEach((p, k) => { body = body.replace(wordRe(p), '(' + (args[k] || p) + ')'); });
        built += c.slice(last, m.index + m[1].length) + '(' + body + ')';
        last = close + 1; re.lastIndex = close + 1; changed = true;
      }
      c = built + c.slice(last);
      if (!changed) break;
    }
    return norm(c);
  }

  // ---------- condition tests
  const isTrue = (c) => /^\(*\s*true\s*\)*$/i.test(c);
  const isFalse = (c) => /^\(*\s*false\s*\)*$/i.test(c);
  const testMode = (c) => /request\.time\s*<\s*timestamp\./.test(c);
  const AUTH_NN = /request\.auth(?:\.uid)?\s*!=\s*null|null\s*!=\s*request\.auth(?:\.uid)?/g;
  const authOnly = (c) => /request\.auth/.test(c) && c.replace(AUTH_NN, '').replace(/&&|[()\s]/g, '') === '';
  const ownerCheck = (c) => /request\.auth\.uid\s*==|==\s*request\.auth\.uid|request\.auth\.uid\s+in\b/.test(c);
  const scoped = (c) => ownerCheck(c) || /request\.auth\.token\.\w+/.test(c);
  const unverifiedEmail = (c) => /\.token\.email\b(?!_verified)/.test(c) && !/email_verified/.test(c);
  // resource.data.<field> compared to the caller's UID (but not request.resource.data).
  const OWN_FIELD = /(?<![\w.])resource\.data\.(\w+)\s*==\s*request\.auth\.uid|request\.auth\.uid\s*==\s*(?<![\w.])resource\.data\.(\w+)/;

  // ---------- Firestore and Cloud Storage rules
  function parseRules(src) {
    const s = stripComments(src);
    const res = { version: null, allows: [], fns: {} };
    const stack = [];
    const RE = {
      version: /rules_version\s*=\s*['"](\d+)['"]\s*;?/y,
      service: /service\s+([\w.]+)\s*\{/y,
      match: /match\s+((?:\/(?:\{[^}]*\}|[^\s/{}]+))+)\s*\{/y,
      fn: /function\s+(\w+)\s*\(([^)]*)\)\s*\{/y,
      allow: /allow\s+([a-z,\s]+?)\s*(:|;|(?=\}))/y,
    };
    const at = (re, i) => { re.lastIndex = i; return re.exec(s); };
    let i = 0;
    while (i < s.length) {
      let m;
      if (/\s/.test(s[i])) { i++; continue; }
      if ((m = at(RE.version, i))) { res.version = m[1]; i += m[0].length; continue; }
      if ((m = at(RE.service, i))) { stack.push({ kind: 'service', name: m[1] }); i += m[0].length; continue; }
      if ((m = at(RE.match, i))) { stack.push({ kind: 'match', path: m[1] }); i += m[0].length; continue; }
      if ((m = at(RE.fn, i))) {
        const open = i + m[0].length - 1;
        const close = closing(s, open);
        res.fns[m[1]] = { params: m[2].split(',').map((x) => x.trim()).filter(Boolean), body: fnReturn(s.slice(open + 1, close < 0 ? s.length : close)) };
        i = close < 0 ? s.length : close + 1;
        continue;
      }
      if ((m = at(RE.allow, i))) {
        const methods = m[1].split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
        let end = i + m[0].length; let cond = 'true';
        if (m[2] === ':') {
          const e = stmtEnd(s, end);
          cond = s.slice(end, e < 0 ? s.length : e).trim().replace(/^if\b\s*/, '');
          end = e < 0 ? s.length : (s[e] === ';' ? e + 1 : e);
        }
        const svc = [...stack].reverse().find((f) => f.kind === 'service');
        res.allows.push({
          methods, cond: norm(cond), raw: norm(s.slice(i, end)),
          service: svc ? svc.name : '',
          path: stack.filter((f) => f.kind === 'match').map((f) => f.path).join(''),
        });
        i = end; continue;
      }
      if (s[i] === '{') { stack.push({ kind: 'block' }); i++; continue; }
      if (s[i] === '}') { stack.pop(); i++; continue; }
      const w = /[^\s{}]+/y; w.lastIndex = i; const t = w.exec(s);
      i += t ? t[0].length : 1;
    }
    return res;
  }

  function checkRules(src, add) {
    const r = parseRules(src);
    const counts = { Firestore: 0, Storage: 0 };
    for (const a of r.allows) {
      const product = /storage/.test(a.service) || /^\/b\//.test(a.path) ? 'Storage' : 'Firestore';
      counts[product]++;
      const rel = a.path.replace(/^\/databases\/\{[^}]*\}\/documents/, '').replace(/^\/b\/\{[^}]*\}\/o/, '') || '/';
      const label = `${product}: allow ${a.methods.join(', ')} on ${rel}`;
      const c = expand(a.cond, r.fns);
      if (isFalse(c)) continue;
      const where = a.raw + (c !== a.cond ? `\n// with your functions filled in: if ${c}` : '');
      const has = (...ms) => a.methods.some((x) => ms.includes(x));
      const writes = has('write', 'create', 'update', 'delete');
      const files = product === 'Storage';
      const wide = /^\/\{[^}]*=\*\*\}$/.test(rel);
      const wideNote = wide
        ? (files ? ' This rule matches every file in your bucket.' : ' This rule matches every document in your database, and because Firestore combines rules with OR, it overrides any stricter rules you wrote for individual collections.')
        : '';
      let open = false;

      if (isTrue(c)) {
        open = true;
        add(writes ? 'high' : 'medium', `${label} is open to everyone`,
          (writes
            ? `Anyone on the internet, signed in or not, can ${files ? 'upload, overwrite and delete these files' : 'create, change and delete this data'}.`
            : `Anyone on the internet can ${files ? 'download these files' : 'read this data'} without signing in. Fine for genuinely public content; a data leak for anything that belongs to users.`) + wideNote,
          where, GUIDE + '#step-2');
      } else if (testMode(c)) {
        open = true;
        add('high', `${label} uses a test-mode date rule`,
          'Test mode opens this to everyone until the date passes, then your app suddenly stops working. Pushing the date forward keeps the data open; replace it with rules that check request.auth.uid.' + wideNote,
          where, GUIDE + '#step-2');
      } else if (authOnly(c)) {
        open = true;
        add(writes ? 'high' : 'medium', `${label} only checks that someone is signed in`,
          `Anyone can create an account. Once they do, this rule lets them ${writes ? 'change' : 'read'} every user's ${files ? 'files' : 'data'}. Compare request.auth.uid to the owner instead, unless every signed-in user really should have this access.` + wideNote,
          where, GUIDE + '#step-3');
      } else if (wide) {
        add('medium', `${label} covers ${files ? 'every file in your bucket' : 'every document in your database'}`,
          files ? 'A catch-all rule applies to every path, including ones you add later. Write rules for each folder instead.'
            : 'Firestore combines rules with OR: if any rule allows a request, it\'s allowed. A catch-all rule on {document=**} applies to every collection, including ones you add later, and overrides stricter rules elsewhere. Write rules for each collection instead.',
          where, GUIDE + '#step-2');
      }
      if (open) continue;

      if (unverifiedEmail(c)) {
        add('medium', `${label} trusts an email address without checking it's verified`,
          'Someone can sign up with an address they don\'t own. Add request.auth.token.email_verified == true.',
          where, GUIDE + '#step-2');
      }

      if (files) {
        if (!scoped(c)) {
          add(writes ? 'medium' : 'info', `${label} doesn't tie files to a user`,
            'Nothing in this rule compares request.auth.uid to the file\'s path, so anyone it lets through can reach every file here. For private uploads, keep files under a /users/{userId}/ folder and check request.auth.uid == userId.',
            where, GUIDE + '#step-3');
        }
        if (has('write', 'create', 'update') && !/request\.resource\.size/.test(c)) {
          add('info', `${label} has no upload size limit`,
            'Without a limit, users can upload files of any size and run up your storage bill. Add a check such as request.resource.size < 5 * 1024 * 1024, and request.resource.contentType.matches(\'image/.*\') for images.',
            where, GUIDE + '#step-3');
        }
      } else {
        const own = OWN_FIELD.exec(c);
        const field = own && (own[1] || own[2]);
        if (field && has('write', 'update') && !new RegExp('request\\.resource\\.data\\.' + field + '\\b').test(c)) {
          add('medium', `${label}: owners can hand documents to someone else`,
            `Nothing stops an update from changing ${field}, so an owner can reassign a document, or plant one on another user. Add request.resource.data.${field} == resource.data.${field} to update rules.`,
            where, GUIDE + '#step-3');
        }
        if (field && has('write', 'create') && !new RegExp('request\\.resource\\.data\\.' + field + '\\b').test(c)) {
          add('info', `${label}: new documents will be rejected`,
            `When a document is created, resource doesn't exist yet, so the check on resource.data.${field} fails. Use request.resource.data.${field} == request.auth.uid in a separate create rule.`,
            where, GUIDE + '#step-3');
        }
        const segs = rel.split('/').filter(Boolean);
        const last = segs[segs.length - 1] || ''; const coll = segs[segs.length - 2] || '';
        if (ownerCheck(c) && has('write', 'update') && /^\{/.test(last) && /^(users|profiles|accounts|members|people|customers)$/i.test(coll)
          && !/affectedKeys|hasOnly|hasAll|diff\s*\(|\.role\b|isAdmin|\.admin\b/.test(c)) {
          add('medium', `${label}: users may be able to change their own role`,
            'If these documents hold fields like role, isAdmin or plan, the owner can edit them and give themselves extra access. Limit which fields can change, for example request.resource.data.diff(resource.data).affectedKeys().hasOnly([\'displayName\', \'photoURL\']).',
            where, GUIDE + '#step-3');
        }
      }

      if (!files && a.methods.includes('write')) {
        add('info', `${label}: consider splitting write`,
          'write covers create, update and delete at once. Separate rules for each make it easier to require the right owner on create and stop owners reassigning data on update.',
          where, GUIDE + '#step-3');
      }
    }
    if (r.allows.length && r.version !== '2') {
      add('info', 'No rules_version = \'2\' at the top',
        'Without it, your rules run as version 1, where recursive wildcards like {document=**} behave differently and some newer features aren\'t available. Start the file with rules_version = \'2\'; and re-test.',
        null, GUIDE + '#step-1');
    }
    return { count: r.allows.length, counts };
  }

  // ---------- Realtime Database rules (JSON)
  const RTDB_AUTH_NN = /auth(?:\.uid)?\s*!==?\s*null|null\s*!==?\s*auth(?:\.uid)?/g;
  function checkRtdb(src, add) {
    let obj;
    try { obj = JSON.parse(stripComments(src)); } catch (e) { return { error: e.message }; }
    const rules = obj && typeof obj.rules === 'object' && obj.rules ? obj.rules : null;
    if (!rules) return { error: 'No top-level "rules" object found.' };
    let count = 0; let anyWrite = false; let hasValidate = false;

    (function walk(node, path) {
      if (!node || typeof node !== 'object') return;
      if ('.validate' in node) hasValidate = true;
      const kids = Object.keys(node).filter((k) => !k.startsWith('.') && node[k] && typeof node[k] === 'object');
      for (const key of ['.read', '.write']) {
        if (!(key in node)) continue;
        count++;
        const v = node[key]; const c = norm(v);
        if (isFalse(c)) continue;
        const writes = key === '.write';
        if (writes) anyWrite = true;
        const where = `"${key}": ${JSON.stringify(v)}`;
        const label = `Realtime Database: ${key} at ${path || '/'}`;
        const cascade = kids.length ? ' Realtime Database rules cascade: access granted here covers everything below it, and stricter rules deeper down can\'t take it away.' : '';
        if (isTrue(c)) {
          add(writes ? 'high' : 'medium', `${label} is open to everyone`,
            (writes ? 'Anyone on the internet, signed in or not, can change and delete this data.'
              : 'Anyone on the internet can read this data without signing in. Fine for genuinely public content; a data leak for anything that belongs to users.') + cascade,
            where, GUIDE + '#step-2');
        } else if (/\bnow\s*<\s*\d/.test(c)) {
          add('high', `${label} uses a test-mode date rule`,
            'This opens the data to everyone until the date passes, then your app suddenly stops working. Replace it with rules that check auth.uid instead of pushing the date forward.' + cascade,
            where, GUIDE + '#step-2');
        } else if (/\bauth\b/.test(c) && c.replace(RTDB_AUTH_NN, '').replace(/&&|[()\s]/g, '') === '') {
          add(writes ? 'high' : 'medium', `${label} only checks that someone is signed in`,
            `Anyone can create an account. Once they do, this rule lets them ${writes ? 'change' : 'read'} every user's data. Put user data under "$uid" and check auth.uid === $uid.` + cascade,
            where, GUIDE + '#step-3');
        } else {
          if (/auth\.token\.email\b(?!_verified)/.test(c) && !/email_verified/.test(c)) {
            add('medium', `${label} trusts an email address without checking it's verified`,
              'Someone can sign up with an address they don\'t own. Add auth.token.email_verified === true.', where, GUIDE + '#step-2');
          }
          if (writes && !/\bauth\b/.test(c)) {
            add('medium', `${label} doesn't check who is writing`,
              'Nothing in this rule looks at auth, so logged-out visitors can write here whenever the rest of the condition is met.', where, GUIDE + '#step-3');
          }
        }
      }
      for (const k of kids) walk(node[k], (path || '') + '/' + k);
    })(rules, '');

    if (anyWrite && !hasValidate) {
      add('info', 'No .validate rules',
        'Realtime Database doesn\'t check the shape of incoming data unless you add .validate rules, so users can write any fields, of any size, wherever they\'re allowed to write.',
        null, GUIDE + '#step-3');
    }
    return { count };
  }

  // ---------- run all checks
  function check(src) {
    const issues = [];
    const add = (sev, title, detail, where, link) => issues.push({ sev, title, detail, where, link });
    if (/-----BEGIN [A-Z ]*PRIVATE KEY-----|"private_key"\s*:|"type"\s*:\s*"service_account"/.test(src)) {
      add('high', 'This looks like it contains a service account key',
        'Service account keys bypass your rules entirely and must never be shared or shipped to clients. Rotate it now in Google Cloud IAM.',
        'Pasted text', 'leaked-api-key-what-to-do.html');
    }
    const body = stripComments(src).trim();
    let kind; let result;
    if (body.startsWith('{')) { kind = 'rtdb'; result = checkRtdb(src, add); }
    else { kind = 'rules'; result = checkRules(src, add); }
    return { issues, kind, ...result };
  }

  // ---------- render
  const SEV = { high: ['High', 'sev-high'], medium: ['Medium', 'sev-medium'], info: ['Note', 'sev-info'] };
  function esc(s) { return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }

  function run() {
    const src = input.value;
    out.innerHTML = '';
    if (!src.trim()) { summary.textContent = 'Paste your rules first.'; return; }
    const r = check(src);
    if (r.error) {
      summary.textContent = `This looks like Realtime Database rules, but it isn't valid JSON (${r.error}). Copy the whole rules file, including the outer { "rules": … }.`;
      return;
    }
    if (!r.count) {
      summary.textContent = 'No allow statements or .read/.write rules found. See "How to get your rules" below.';
      return;
    }
    const order = { high: 0, medium: 1, info: 2 };
    r.issues.sort((a, b) => order[a.sev] - order[b.sev]);
    const n = (s) => r.issues.filter((i) => i.sev === s).length;
    let found;
    if (r.kind === 'rtdb') found = `${r.count} Realtime Database rule${r.count === 1 ? '' : 's'}`;
    else {
      const parts = [];
      if (r.counts.Firestore) parts.push(`${r.counts.Firestore} Firestore`);
      if (r.counts.Storage) parts.push(`${r.counts.Storage} Storage`);
      found = `${parts.join(' and ')} allow rule${r.count === 1 ? '' : 's'}`;
    }
    summary.textContent = r.issues.length
      ? `Checked ${found}: ${n('high')} high, ${n('medium')} medium, ${n('info')} note${n('info') === 1 ? '' : 's'}.`
      : `Checked ${found}: no common problems found. That doesn't prove your data is safe, so still test in the Rules Playground and with two accounts.`;
    for (const i of r.issues) {
      const li = document.createElement('li');
      li.className = 'rls-issue ' + SEV[i.sev][1];
      li.innerHTML = `<span class="rls-sev">${SEV[i.sev][0]}</span><div><strong>${esc(i.title)}</strong><p>${esc(i.detail)}</p>` +
        (i.where ? `<pre><code>${esc(i.where.length > 500 ? i.where.slice(0, 500) + '…' : i.where)}</code></pre>` : '') +
        (i.link ? `<a href="${i.link}">How to fix it →</a>` : '') + '</div>';
      out.appendChild(li);
    }
    summary.focus();
  }

  const SAMPLE_RULES = `// Example: a notes app (sample rules, not a real project)
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() { return request.auth != null; }

    match /notes/{noteId} {
      allow read: if signedIn();
      allow write: if request.auth.uid == resource.data.ownerId;
    }
    match /users/{userId} {
      allow read, update: if request.auth.uid == userId;
    }
    match /staff/{docId} {
      allow read: if request.auth.token.email.matches('.*@example[.]com');
    }
    match /{document=**} {
      allow read, write: if request.time < timestamp.date(2026, 12, 1);
    }
  }
}

service firebase.storage {
  match /b/{bucket}/o {
    match /uploads/{fileName} {
      allow read, write: if request.auth != null;
    }
  }
}`;

  const SAMPLE_RTDB = `{
  // Example: a chat app (sample rules, not a real project)
  "rules": {
    ".read": "auth != null",
    "messages": {
      ".write": true
    },
    "users": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    }
  }
}`;

  $('#fb-run').addEventListener('click', run);
  $('#fb-sample').addEventListener('click', () => { input.value = SAMPLE_RULES; run(); });
  $('#fb-sample-rtdb').addEventListener('click', () => { input.value = SAMPLE_RTDB; run(); });
  $('#fb-clear').addEventListener('click', () => { input.value = ''; out.innerHTML = ''; summary.textContent = ''; input.focus(); });
  input.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') run(); });

  window.__firebaseRulesCheck = check; // exposed for testing
})();
