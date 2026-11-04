/* Blue Jay Supabase RLS policy checker. Runs entirely in the browser: nothing is sent anywhere. */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const input = $('#rls-sql');
  const out = $('#rls-results');
  const summary = $('#rls-summary');
  if (!input || !out) return;

  const GUIDE = 'supabase-rls-check.html';

  // ---------- helpers
  const stripComments = (sql) => sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ');

  // Split on semicolons that are not inside quotes or dollar-quoted bodies.
  function splitStatements(sql) {
    const out = []; let cur = ''; let i = 0; let q = null; let dollar = null;
    while (i < sql.length) {
      const ch = sql[i];
      if (dollar) {
        if (sql.startsWith(dollar, i)) { cur += dollar; i += dollar.length; dollar = null; continue; }
        cur += ch; i++; continue;
      }
      if (q) { cur += ch; if (ch === q) q = null; i++; continue; }
      if (ch === "'" || ch === '"') { q = ch; cur += ch; i++; continue; }
      if (ch === '$') {
        const m = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
        if (m) { dollar = m[0]; cur += dollar; i += dollar.length; continue; }
      }
      if (ch === ';') { if (cur.trim()) out.push(cur.trim()); cur = ''; i++; continue; }
      cur += ch; i++;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }

  // Return the text inside the balanced parentheses that start at or after idx.
  function balanced(s, idx) {
    const start = s.indexOf('(', idx);
    if (start < 0) return null;
    let depth = 0;
    for (let i = start; i < s.length; i++) {
      if (s[i] === '(') depth++;
      else if (s[i] === ')') { depth--; if (depth === 0) return { body: s.slice(start + 1, i), end: i + 1 }; }
    }
    return null;
  }

  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const unq = (s) => s.replace(/"/g, '').toLowerCase();
  function tableName(raw) {
    const t = unq(raw);
    return t.includes('.') ? t : 'public.' + t;
  }
  const isTrue = (e) => e != null && /^\(*\s*true\s*\)*$/i.test(e.trim());

  // ---------- parse
  function parse(sql) {
    const clean = stripComments(sql);
    const stmts = splitStatements(clean);
    const tables = {}; const rlsOn = new Set(); const policies = []; const views = []; const fns = []; const grants = [];
    for (const st of stmts) {
      const s = norm(st);
      let m;
      if ((m = /^create\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?([\w."]+)/i.exec(s))) {
        tables[tableName(m[1])] = s;
      } else if ((m = /^alter\s+table\s+(?:only\s+)?(?:if\s+exists\s+)?([\w."]+)\s+(?:force\s+)?enable\s+row\s+level\s+security/i.exec(s))) {
        rlsOn.add(tableName(m[1]));
      } else if ((m = /^alter\s+table\s+(?:only\s+)?(?:if\s+exists\s+)?([\w."]+)\s+disable\s+row\s+level\s+security/i.exec(s))) {
        rlsOn.delete(tableName(m[1]));
        tables[tableName(m[1])] = tables[tableName(m[1])] || s;
      } else if (/^create\s+policy\b/i.test(s)) {
        policies.push(parsePolicy(s));
      } else if ((m = /^create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+([\w."]+)/i.exec(s))) {
        views.push({ name: unq(m[1]), invoker: /security_invoker\s*=\s*(?:true|on|1)/i.test(s), sql: s });
      } else if ((m = /^create\s+(?:or\s+replace\s+)?function\s+([\w."]+)/i.exec(s))) {
        fns.push({ name: unq(m[1]), definer: /security\s+definer/i.test(st), searchPath: /set\s+search_path/i.test(st), sql: s });
      } else if ((m = /^grant\s+(.+?)\s+on\s+(?:table\s+)?([\w."]+)\s+to\s+(.+)$/i.exec(s))) {
        grants.push({ privs: m[1].toLowerCase(), table: tableName(m[2]), roles: m[3].toLowerCase(), sql: s });
      }
    }
    return { tables, rlsOn, policies, views, fns, grants, count: stmts.length };
  }

  function parsePolicy(s) {
    const p = { sql: s, name: '', table: '', cmd: 'all', roles: ['public'], using: null, check: null, restrictive: false };
    const m = /^create\s+policy\s+("(?:[^"]|"")*"|\S+)\s+on\s+([\w."]+)/i.exec(s);
    if (m) { p.name = m[1].replace(/^"|"$/g, ''); p.table = tableName(m[2]); }
    p.restrictive = /\bas\s+restrictive\b/i.test(s);
    const f = /\bfor\s+(all|select|insert|update|delete)\b/i.exec(s);
    if (f) p.cmd = f[1].toLowerCase();
    const to = /\bto\s+([\w\s,"]+?)(?=\s+(?:using|with\s+check)\b|$)/i.exec(s);
    if (to) p.roles = to[1].split(',').map((r) => unq(r.trim())).filter(Boolean);
    const u = /\busing\s*\(/i.exec(s);
    if (u) { const b = balanced(s, u.index); if (b) p.using = norm(b.body); }
    const c = /\bwith\s+check\s*\(/i.exec(s);
    if (c) { const b = balanced(s, c.index); if (b) p.check = norm(b.body); }
    return p;
  }

  // ---------- rules
  function check(sql) {
    const r = parse(sql);
    const issues = [];
    const add = (sev, title, detail, where, link) => issues.push({ sev, title, detail, where, link });
    const label = (p) => `Policy "${p.name}" on ${p.table} (${p.cmd.toUpperCase()})`;

    if (/sb_secret_[A-Za-z0-9_-]{8,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(sql)) {
      add('high', 'This looks like it contains an API key or token',
        'Never paste keys into tools or share them. If this is a secret or service_role key, rotate it now.',
        'Pasted text', 'leaked-api-key-what-to-do.html');
    }

    // Tables without RLS
    for (const t of Object.keys(r.tables)) {
      if (!t.startsWith('public.')) continue;
      if (!r.rlsOn.has(t)) {
        add('high', `RLS is not enabled on ${t} in this SQL`,
          'Tables in the public schema are reachable through the Supabase API. Without row-level security, anyone with your project URL and publishable key can read and change every row. (If you enable RLS somewhere else, paste that too.)',
          `alter table ${t} enable row level security;`, GUIDE + '#step-1');
      }
    }
    // RLS on but no policies
    for (const t of r.rlsOn) {
      if (!r.policies.some((p) => p.table === t)) {
        add('info', `${t} has RLS on but no policies in this SQL`,
          'That is the safe default: the publishable key can\'t read or write it. If your app needs access, add policies that limit each user to their own rows.',
          t, GUIDE + '#step-2');
      }
    }
    // Policies on tables never given RLS in this SQL (only when the table is created here)
    for (const p of r.policies) {
      if (r.tables[p.table] && !r.rlsOn.has(p.table)) {
        add('medium', `${label(p)} has no effect until RLS is enabled`,
          'Policies only apply once row-level security is enabled on the table.', p.sql, GUIDE + '#step-1');
      }
    }

    for (const p of r.policies) {
      const where = p.sql;
      const pub = p.roles.includes('public') || p.roles.includes('anon');
      const noTo = !/\bto\s+/i.test(p.sql);
      const writes = ['insert', 'update', 'delete', 'all'].includes(p.cmd);

      if (p.cmd === 'all') {
        add('medium', `${label(p)} uses FOR ALL`,
          'FOR ALL applies one rule to reading, creating, editing and deleting. Supabase recommends separate SELECT, INSERT, UPDATE and DELETE policies so each can be checked on its own.',
          where, GUIDE + '#step-2');
      }
      if (isTrue(p.using)) {
        add(writes ? 'high' : 'medium', `${label(p)}: USING (true) lets ${pub ? 'everyone, including logged-out visitors,' : 'every user in this role'} ${p.cmd === 'select' ? 'read every row' : 'act on every row'}`,
          p.cmd === 'select' ? 'Fine for genuinely public data such as published blog posts. A data leak for profiles, messages, orders or documents.' : 'Anyone this policy applies to can change or delete rows that belong to other users.',
          where, GUIDE + '#step-2');
      }
      if (isTrue(p.check)) {
        add('high', `${label(p)}: WITH CHECK (true) accepts any row`,
          'Users can create or edit rows so they claim to belong to someone else. Check ownership instead, for example (select auth.uid()) = user_id.',
          where, GUIDE + '#step-2');
      }
      if (p.cmd === 'insert' && p.check == null) {
        add('high', `${label(p)} has no WITH CHECK`,
          'Nothing in this policy limits what rows a user can create. Add WITH CHECK ((select auth.uid()) = user_id) or the equivalent ownership rule.',
          where, GUIDE + '#step-2');
      }
      if (p.cmd === 'insert' && p.using != null) {
        add('medium', `${label(p)} has a USING clause`,
          'Postgres doesn\'t allow USING on INSERT policies, so this statement will fail. Use WITH CHECK only.', where, GUIDE + '#step-2');
      }
      if (p.cmd === 'update' && p.check == null && p.using != null && !isTrue(p.using)) {
        add('info', `${label(p)} has USING but no WITH CHECK`,
          'Postgres reuses the USING condition to check the edited row, so this is usually fine. Supabase recommends writing WITH CHECK explicitly so the rule for the new row is clear.',
          where, GUIDE + '#step-2');
      }
      if (p.cmd === 'update' && p.check != null && p.using != null && !isTrue(p.check) && norm(p.check) !== norm(p.using)) {
        add('info', `${label(p)}: USING and WITH CHECK differ`,
          'Make sure the WITH CHECK rule is at least as strict as USING, so users can\'t edit a row into one they shouldn\'t own.', where, GUIDE + '#step-2');
      }
      if (pub && writes && !isTrue(p.using) && !isTrue(p.check)) {
        add('medium', `${label(p)} applies to ${noTo ? 'all roles (no TO clause, so it defaults to PUBLIC)' : 'anon / public'}`,
          'Write access usually needs a signed-in user. Add TO authenticated unless logged-out visitors really should be able to change data.',
          where, GUIDE + '#step-2');
      } else if (noTo && !writes && !isTrue(p.using)) {
        add('info', `${label(p)} has no TO clause`,
          'Without TO, a policy applies to every role, including logged-out visitors. Supabase recommends always naming the role, for example TO authenticated.',
          where, GUIDE + '#step-2');
      }
      const exprs = [p.using, p.check].filter(Boolean).join(' ');
      const ownerCheck = /auth\.uid\(\)(?:\s+as\s+\w+)?\s*\)?\s*(?:::\s*\w+\s*)?=|=\s*\(?\s*(?:select\s+)?auth\.uid\(\)/i.test(exprs);
      if (/auth\.uid\(\)\s+is\s+not\s+null|auth\.role\(\)\s*=\s*'authenticated'/i.test(exprs) && !ownerCheck) {
        add('high', `${label(p)} only checks that someone is signed in`,
          'Anyone can create an account. Once they do, this policy gives them every user\'s rows. Compare auth.uid() to the row\'s owner column instead.',
          where, GUIDE + '#step-2');
      }
      if (/raw_user_meta_data|user_metadata/i.test(exprs)) {
        add('high', `${label(p)} trusts user metadata`,
          'Supabase users can update their own user metadata, so a user could give themselves a role or flag. Store authorization data in app metadata (raw_app_meta_data), which users can\'t change.',
          where, GUIDE + '#step-2');
      }
      const calls = (exprs.match(/auth\.(?:uid|jwt)\(\)/gi) || []).length;
      const wrapped = (exprs.match(/\(\s*select\s+auth\.(?:uid|jwt)\(\)/gi) || []).length;
      if (calls > wrapped) {
        add('info', `${label(p)}: wrap auth.uid() in (select …)`,
          'Writing (select auth.uid()) gives the same result but lets Postgres run it once per query instead of once per row. Faster on big tables.',
          where, GUIDE + '#step-2');
      }
      if (p.table === 'storage.objects' && !/auth\.uid\(\)|owner|foldername/i.test(exprs) && !isTrue(p.using)) {
        add('medium', `${label(p)}: storage policy doesn't check who owns the file`,
          'A policy that only checks bucket_id lets anyone it applies to reach every file in that bucket. Fine for genuinely public files like avatars; for private uploads, tie files to a user, for example with (storage.foldername(name))[1] = (select auth.uid())::text.',
          where, GUIDE + '#step-5');
      }
    }

    for (const v of r.views) {
      if (!v.invoker) {
        add('medium', `View ${v.name} bypasses RLS`,
          'Views run with their creator\'s permissions by default, so they skip the policies on the tables underneath. On Postgres 15+, create them WITH (security_invoker = true).',
          v.sql, GUIDE + '#step-5');
      }
    }
    for (const f of r.fns) {
      if (f.definer) {
        add('medium', `Function ${f.name} is SECURITY DEFINER`,
          'It runs with its creator\'s privileges and can skip RLS. Make sure it checks who is calling' + (f.searchPath ? '.' : ', and add SET search_path = \'\' so it can\'t be tricked into using the wrong objects.'),
          f.sql.slice(0, 220) + (f.sql.length > 220 ? '…' : ''), GUIDE + '#step-5');
      }
    }
    for (const g of r.grants) {
      if (/\banon\b|\bpublic\b/.test(g.roles) && /insert|update|delete|all/.test(g.privs)) {
        add('info', `Write privileges granted to anon/public on ${g.table}`,
          'Grants decide what a role may attempt; RLS decides which rows. With these grants, your policies are the only protection, so check them carefully.',
          g.sql, GUIDE + '#step-2');
      }
    }
    return { issues, parsed: r };
  }

  // ---------- render
  const SEV = { high: ['High', 'sev-high'], medium: ['Medium', 'sev-medium'], info: ['Note', 'sev-info'] };
  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function run() {
    const sql = input.value;
    out.innerHTML = '';
    if (!sql.trim()) { summary.textContent = 'Paste some SQL first.'; return; }
    const { issues, parsed } = check(sql);
    const order = { high: 0, medium: 1, info: 2 };
    issues.sort((a, b) => order[a.sev] - order[b.sev]);
    const n = (s) => issues.filter((i) => i.sev === s).length;
    const found = `${parsed.policies.length} polic${parsed.policies.length === 1 ? 'y' : 'ies'}, ${Object.keys(parsed.tables).length} table${Object.keys(parsed.tables).length === 1 ? '' : 's'}`;
    if (!parsed.policies.length && !Object.keys(parsed.tables).length && !parsed.rlsOn.size) {
      summary.textContent = 'No CREATE POLICY, CREATE TABLE or ENABLE ROW LEVEL SECURITY statements found. See "How to get your SQL" below.';
      return;
    }
    summary.textContent = issues.length
      ? `Checked ${found}: ${n('high')} high, ${n('medium')} medium, ${n('info')} notes.`
      : `Checked ${found}: no common problems found. That doesn't prove your data is safe, so still test with two accounts.`;
    for (const i of issues) {
      const li = document.createElement('li');
      li.className = 'rls-issue ' + SEV[i.sev][1];
      li.innerHTML = `<span class="rls-sev">${SEV[i.sev][0]}</span><div><strong>${esc(i.title)}</strong><p>${esc(i.detail)}</p>` +
        (i.where ? `<pre><code>${esc(i.where.length > 400 ? i.where.slice(0, 400) + '…' : i.where)}</code></pre>` : '') +
        (i.link ? `<a href="${i.link}">How to fix it →</a>` : '') + '</div>';
      out.appendChild(li);
    }
    summary.focus();
  }

  const SAMPLE = `-- Example: a notes app (this is sample SQL, not a real project)
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  body text
);
create table public.profiles (id uuid primary key, display_name text, is_admin boolean default false);
alter table public.notes enable row level security;

create policy "Anyone can read notes" on public.notes
  for select using (true);

create policy "Users can add notes" on public.notes
  for insert to authenticated;

create policy "Signed-in users manage notes" on public.notes
  for all to authenticated using (auth.uid() is not null);

create policy "Admins by metadata" on public.notes
  for delete to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');`;

  $('#rls-run').addEventListener('click', run);
  $('#rls-sample').addEventListener('click', () => { input.value = SAMPLE; run(); });
  $('#rls-clear').addEventListener('click', () => { input.value = ''; out.innerHTML = ''; summary.textContent = ''; input.focus(); });
  input.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') run(); });

  window.__rlsCheck = check; // exposed for testing
})();
