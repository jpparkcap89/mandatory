/* 서버 통신: config.js 의 API_URL 이 있으면 Google Apps Script 로, 없으면 브라우저 안 데모 서버로 보냅니다. */
(function () {
  var URL = (window.ZERO_ON_CONFIG && window.ZERO_ON_CONFIG.API_URL || '').trim();

  function toError(msg, extra) {
    var m = String(msg || '요청을 처리하지 못했습니다.');
    var code = (m.match(/^(NOT_FOUND|MULTI|AUTH):\s*/) || [])[1] || '';
    var e = new Error(m.replace(/^(NOT_FOUND|MULTI|AUTH):\s*/, ''));
    e.code = code;
    if (extra && extra.candidates) e.candidates = extra.candidates;
    return e;
  }

  async function remote(action, payload) {
    var res;
    try {
      res = await fetch(URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // 미리 확인(preflight) 요청을 피하는 형식
        body: JSON.stringify(Object.assign({ action: action }, payload || {}))
      });
    } catch (err) {
      throw toError('서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.');
    }
    var j;
    try { j = await res.json(); } catch (err) { throw toError('서버 응답을 읽지 못했습니다. 웹 앱 배포 설정(액세스: 모든 사용자)을 확인해 주세요.'); }
    if (!j.ok) throw toError(j.error, j);
    return j.data;
  }

  /* ───────── 데모 서버 (GAS 와 같은 동작) ───────── */
  var KEY = 'zeroon-demo-v2';
  var mem = null;
  function load() {
    if (mem) return mem;
    try { mem = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { mem = null; }
    if (!mem) mem = seed();
    return mem;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) { /* 저장 불가 환경은 메모리만 사용 */ } }
  function seed() {
    var names = [['박종필', '교무기획부', '정규 공립교원'], ['심재희', '1학년부', '정규 공립교원'], ['김하늘', '2학년부', '정규 공립교원'], ['이서준', '3학년부', '기간제'], ['최유진', '4학년부', '정규 공립교원'], ['정민호', '5학년부', '정규 공립교원'], ['한지우', '6학년부', '기간제'], ['오세린', '교과전담', '정규 공립교원']];
    var tr = (window.ZERO_ON_SEED || []).map(function (t, i) { return Object.assign({}, t, { active: t.target !== '대상 제외', order: i + 1 }); });
    var teachers = names.map(function (n, i) { return { id: 'T' + ('00' + (i + 1)).slice(-3), name: n[0], dept: n[1], role: n[2], included: true, pw: i === 4 ? '' : '1234' }; });
    var records = [];
    var rate = [0.9, 0.55, 0.75, 0.3, 0, 1, 0.45, 0.65];
    teachers.forEach(function (t, i) {
      tr.forEach(function (x, k) {
        if (!x.active) return;
        if (((k * 7 + i * 3) % 20) / 20 < rate[i]) records.push({ teacherId: t.id, trainingId: x.id, done: true, date: '2026-0' + (3 + (k % 7)) + '-1' + (k % 9), certNo: String(2300 + k * 11 + i), memo: '', at: new Date().toISOString() });
      });
    });
    return { teachers: teachers, trainings: tr, records: records, requests: [{ id: 'R1', at: new Date().toISOString(), name: '윤다온', dept: '특수학급', role: '정규 공립교원', memo: '10월 전입했습니다' }], tokens: {} };
  }
  function pub(t) { return { id: t.id, name: t.name, role: t.role, dept: t.dept, included: t.included, hasPin: !!t.pw }; }
  function tok(p) { var s = load(); var k = Math.random().toString(36).slice(2) + Date.now().toString(36); s.tokens[k] = p; save(); return k; }
  function auth(token, role) { var p = load().tokens[token]; if (!p || p.role !== role) throw toError('AUTH: 로그인 시간이 지났습니다. 다시 로그인해 주세요.'); return p; }
  function byId(id) { var t = load().teachers.filter(function (x) { return x.id === id; })[0]; if (!t) throw toError('NOT_FOUND: 명단에 없습니다.'); return t; }
  function clean(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
  function importRows(rows, excludeMissing) {
    var s = load(), seen = {}, added = [], updated = [], restored = [], skipped = [], excluded = [];
    var next = s.teachers.reduce(function (m, t) { return Math.max(m, parseInt(t.id.replace(/\D/g, ''), 10) || 0); }, 0);
    rows.forEach(function (r) {
      var t = null, same = s.teachers.filter(function (x) { return x.name === r.name; });
      if (r.id) t = s.teachers.filter(function (x) { return x.id === r.id && x.name === r.name; })[0] || null;
      if (!t && same.length === 1) t = same[0];
      else if (!t && same.length > 1) { var h = same.filter(function (x) { return r.dept && x.dept === r.dept; }); if (h.length === 1) t = h[0]; else { skipped.push(r.name + ' (같은 이름 ' + same.length + '명 · 부서나 교사ID로 구분해 주세요)'); return; } }
      if (t) {
        if (seen[t.id]) { skipped.push(r.name + ' (파일 안에서 중복)'); return; }
        seen[t.id] = 1; var ch = false;
        if (r.role && r.role !== t.role) { t.role = r.role; ch = true; }
        if (r.dept && r.dept !== t.dept) { t.dept = r.dept; ch = true; }
        if (!t.included) { t.included = true; restored.push(t.name); } else if (ch) updated.push(t.name);
      } else {
        next++; var id = 'T' + ('00' + next).slice(-3); seen[id] = 1;
        s.teachers.push({ id: id, name: r.name, role: r.role, dept: r.dept, included: true, pw: '' }); added.push(r.name);
      }
    });
    if (excludeMissing) s.teachers.forEach(function (t) { if (!seen[t.id] && t.included) { t.included = false; excluded.push(t.name); } });
    save();
    return { added: added, updated: updated, restored: restored, excluded: excluded, skipped: skipped };
  }
  var DEMO = {
    ping: function () { return { school: '데모 초등학교', year: '2026', notice: '' }; },
    teacherLogin: function (b) {
      var s = load(), name = clean(b.name);
      var list = s.teachers.filter(function (t) { return t.name === name && t.included; });
      if (b.id) list = list.filter(function (t) { return t.id === b.id; });
      if (!list.length) throw toError('NOT_FOUND: 명단에 없는 이름입니다.');
      if (list.length > 1) throw toError('MULTI: 같은 이름이 ' + list.length + '명 있습니다. 본인을 골라 주세요.', { candidates: list.map(function (t) { return { id: t.id, hint: [t.dept, t.role].filter(Boolean).join(' · ') }; }) });
      var t = list[0];
      if (!t.pw) return { needSet: true, id: t.id, name: t.name };
      if (t.pw !== String(b.password)) throw toError('비밀번호가 맞지 않습니다.');
      return { token: tok({ role: 'teacher', id: t.id }), teacher: pub(t) };
    },
    teacherSetPassword: function (b) {
      var pw = String(b.password || ''); if (pw.length < 4) throw toError('비밀번호는 4~30자로 정해 주세요.');
      var t = byId(b.id); if (t.pw) throw toError('이미 비밀번호가 있습니다.');
      t.pw = pw; save(); return { token: tok({ role: 'teacher', id: t.id }), teacher: pub(t) };
    },
    requestAdd: function (b) {
      var s = load(), name = clean(b.name);
      if (s.requests.some(function (r) { return r.name === name; })) throw toError('이미 요청했습니다. 담당자가 확인할 때까지 기다려 주세요.');
      var r = { id: 'R' + Date.now().toString(36), at: new Date().toISOString(), name: name, dept: clean(b.dept), role: clean(b.role), memo: clean(b.memo) };
      s.requests.push(r); save(); return { id: r.id };
    },
    myDashboard: function (b) {
      var s = load(), p = auth(b.token, 'teacher'), t = byId(p.id);
      return { teacher: pub(t), year: '2026', school: '데모 초등학교', notice: '수료증을 받은 뒤 이수 여부를 표시해 주세요.', trainings: s.trainings.filter(function (x) { return x.active; }), records: s.records.filter(function (r) { return r.teacherId === t.id; }) };
    },
    saveRecord: function (b) {
      var s = load(), p = auth(b.token, 'teacher');
      var r = s.records.filter(function (x) { return x.teacherId === p.id && x.trainingId === b.trainingId; })[0];
      if (!r) { r = { teacherId: p.id, trainingId: b.trainingId }; s.records.push(r); }
      r.done = !!b.done; r.date = b.done ? (b.date || '') : ''; r.certNo = b.done ? clean(b.certNo) : ''; r.memo = clean(b.memo); r.at = new Date().toISOString();
      save(); return r;
    },
    adminLogin: function (b) { if (b.password !== 'demo1234') throw toError('비밀번호가 맞지 않습니다. (데모: demo1234)'); return { token: tok({ role: 'admin' }) }; },
    adminDashboard: function (b) {
      auth(b.token, 'admin'); var s = load();
      return { year: '2026', school: '데모 초등학교', teachers: s.teachers.map(pub), trainings: s.trainings, records: s.records, requests: s.requests };
    },
    importRoster: function (b) { auth(b.token, 'admin'); return importRows((b.rows || []).map(function (r) { return { id: clean(r.id).toUpperCase(), name: clean(r.name), role: clean(r.role), dept: clean(r.dept) }; }).filter(function (r) { return r.name; }), !!b.excludeMissing); },
    resolveRequest: function (b) {
      auth(b.token, 'admin'); var s = load();
      var r = s.requests.filter(function (x) { return x.id === b.id; })[0]; if (!r) throw toError('요청을 찾을 수 없습니다.');
      s.requests = s.requests.filter(function (x) { return x !== r; }); save();
      return { id: r.id, approved: !!b.approve, result: b.approve ? importRows([{ name: r.name, dept: r.dept, role: r.role }], false) : null };
    },
    setTeacherStatus: function (b) { auth(b.token, 'admin'); byId(b.id).included = !!b.included; save(); return { id: b.id, included: !!b.included }; },
    resetPassword: function (b) { auth(b.token, 'admin'); byId(b.id).pw = ''; save(); return { id: b.id }; },
    setTrainingActive: function (b) { auth(b.token, 'admin'); var t = load().trainings.filter(function (x) { return x.id === b.id; })[0]; t.active = !!b.active; save(); return { id: b.id, active: t.active }; }
  };

  async function demo(action, payload) {
    await new Promise(function (r) { setTimeout(r, 250); });
    var fn = DEMO[action];
    if (!fn) throw toError('알 수 없는 요청입니다: ' + action);
    return JSON.parse(JSON.stringify(fn(payload || {})));
  }

  window.API = {
    demo: !URL,
    call: function (action, payload) { return URL ? remote(action, payload) : demo(action, payload); },
    resetDemo: function () { mem = null; try { localStorage.removeItem(KEY); } catch (e) { } }
  };
})();
