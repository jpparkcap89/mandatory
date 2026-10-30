/* Zero-ON 법정의무연수 이수 관리 · 화면 동작 */
(function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var today = function () { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  var toast = function (k, t, s, a) { return UI.toast ? UI.toast(k, t, s, a) : null; };
  var store = {
    get: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (e) { } }
  };
  // 화면 안 확인 대화상자 (브라우저 confirm 대신)
  function ask(msg, okLabel) {
    return new Promise(function (resolve) {
      var dlg = $('#askDlg');
      $('#askMsg').textContent = msg;
      $('#askDlg [data-v="1"]').textContent = okLabel || '확인';
      function done(v) { $$('#askDlg button').forEach(function (b) { b.onclick = null; }); dlg.onclose = null; if (dlg.open) dlg.close(); resolve(v); }
      $$('#askDlg button').forEach(function (b) { b.onclick = function () { done(b.getAttribute('data-v') === '1'); }; });
      dlg.onclose = function () { done(false); };
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
      $('#askDlg [data-v="1"]').focus();
    });
  }
  var S = { role: 'teacher', tToken: store.get('zo_t'), aToken: store.get('zo_a'), t: null, a: null, pending: null, chosenId: '', filter: 'all' };


  /* ───────── 공통: 역할 탭 ───────── */
  var tabs = UI.tabs($('#roleTabs'), function (role) { showRole(role); });
  tabs.ids(['teacherView', 'adminView']);
  function showRole(role) {
    S.role = role;
    $('#teacherView').hidden = role !== 'teacher';
    $('#adminView').hidden = role !== 'admin';
    $('#eyebrow').textContent = role === 'admin' ? '🗂️ 담당자 대시보드' : '✨ 나의 법정의무연수';
    try { history.replaceState(null, '', role === 'admin' ? '#admin' : '#'); } catch (e) { }
    if (role === 'admin' && S.aToken && !S.a) loadAdmin();
    if (role === 'teacher' && S.tToken && !S.t) loadTeacher();
    syncLogout();
  }
  function syncLogout() { $('#logoutBtn').hidden = !(S.role === 'admin' ? S.aToken : S.tToken); }
  $('#logoutBtn').addEventListener('click', function () {
    if (S.role === 'admin') { S.aToken = null; S.a = null; store.set('zo_a', null); $('#aDash').hidden = true; $('#aLogin').hidden = false; }
    else { S.tToken = null; S.t = null; store.set('zo_t', null); $('#tDash').hidden = true; $('#tLogin').hidden = false; tStep('Login'); $('#tPw').value = ''; }
    syncLogout();
    toast('info', '로그아웃했습니다');
  });
  function authFail(err, role) {
    if (err.code !== 'AUTH') return false;
    if (role === 'admin') { S.aToken = null; store.set('zo_a', null); $('#aDash').hidden = true; $('#aLogin').hidden = false; }
    else { S.tToken = null; store.set('zo_t', null); $('#tDash').hidden = true; $('#tLogin').hidden = false; tStep('Login'); }
    syncLogout();
    toast('err', err.message);
    return true;
  }

  API.call('ping').then(function (d) { if (d.school) $('#schoolName').textContent = d.school + ' · ' + d.year + '학년도'; }).catch(function () { });

  /* ═════════════ 선생님 ═════════════ */
  function tStep(name) { ['Login', 'Set', 'Req'].forEach(function (n) { $('#tStep' + n).hidden = n !== name; }); }
  $$('[data-back]').forEach(function (b) { b.addEventListener('click', function () { tStep('Login'); $('#tName').focus(); }); });
  $('#tName').addEventListener('input', function () { S.chosenId = ''; $('#tCandidates').hidden = true; });

  function busy(btn, on, label) {
    if (!btn) return;
    if (on) { btn.dataset.label = btn.textContent; btn.textContent = label || '확인 중…'; btn.disabled = true; }
    else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
  }

  $('#tLoginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('#tName').value.trim(), pw = $('#tPw').value;
    var msg = $('#tMsg'); msg.textContent = '';
    if (pw.length < 4) { msg.textContent = '비밀번호는 4자 이상입니다.'; return; }
    var btn = $('#tLoginBtn'); busy(btn, true);
    API.call('teacherLogin', { name: name, password: pw, id: S.chosenId }).then(function (d) {
      busy(btn, false);
      if (d.needSet) {
        S.pending = { id: d.id, name: d.name, current: pw };
        $('#tSetName').textContent = d.name;
        $('#tPwNew').value = ''; $('#tPw2').value = ''; $('#tSetMsg').textContent = '';
        tStep('Set'); $('#tPwNew').focus();
        return;
      }
      enterTeacher(d.token);
    }).catch(function (err) {
      busy(btn, false);
      if (err.code === 'NOT_FOUND') {
        $('#tReqName').textContent = name;
        $('#tReqDone').hidden = true; $('#tReqForm').hidden = false; $('#tReqMsg').textContent = '';
        tStep('Req'); $('#tReqDept').focus();
        return;
      }
      if (err.code === 'MULTI' && err.candidates) {
        var ul = $('#tCandidates');
        ul.innerHTML = '<li class="cand-q">' + esc(err.message) + '</li>' + err.candidates.map(function (c, i) {
          return '<li><label><input type="radio" name="cand" value="' + esc(c.id) + '"' + (i === 0 ? ' checked' : '') + '> ' + esc(name) + ' <small>' + esc(c.hint || c.id) + '</small></label></li>';
        }).join('');
        ul.hidden = false;
        S.chosenId = err.candidates[0].id;
        $$('input[name=cand]', ul).forEach(function (r) { r.addEventListener('change', function () { S.chosenId = r.value; }); });
        return;
      }
      msg.textContent = err.message;
    });
  });

  $('#tSetForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var p = S.pending; if (!p) return tStep('Login');
    var np = $('#tPwNew').value;
    if (np.length < 4) { $('#tSetMsg').textContent = '새 비밀번호는 4자 이상입니다.'; return; }
    if (np === '1234') { $('#tSetMsg').textContent = '1234가 아닌 다른 비밀번호로 정해 주세요.'; return; }
    if ($('#tPw2').value !== np) { $('#tSetMsg').textContent = '새 비밀번호 확인이 다릅니다.'; return; }
    var btn = e.submitter || $('#tSetForm button[type=submit]'); busy(btn, true, '저장 중…');
    API.call('teacherSetPassword', { id: p.id, current: p.current, password: np }).then(function (d) {
      busy(btn, false); S.pending = null;
      toast('ok', '비밀번호를 정했습니다', '다음부터 이름과 이 비밀번호로 들어오세요');
      enterTeacher(d.token);
    }).catch(function (err) { busy(btn, false); $('#tSetMsg').textContent = err.message; });
  });

  $('#tReqForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = e.submitter || $('#tReqForm button[type=submit]'); busy(btn, true, '보내는 중…');
    API.call('requestAdd', { name: $('#tReqName').textContent, dept: $('#tReqDept').value, role: $('#tReqRole').value, memo: $('#tReqMemo').value }).then(function () {
      busy(btn, false);
      $('#tReqForm').hidden = true; $('#tReqDone').hidden = false;
      toast('ok', '추가 요청을 보냈습니다', '담당자가 확인하면 로그인할 수 있습니다');
    }).catch(function (err) { busy(btn, false); $('#tReqMsg').textContent = err.message; });
  });

  function enterTeacher(token) {
    S.tToken = token; store.set('zo_t', token);
    $('#tPw').value = '';
    loadTeacher();
  }

  function loadTeacher() {
    return API.call('myDashboard', { token: S.tToken }).then(function (d) {
      S.t = d;
      $('#tLogin').hidden = true; $('#tDash').hidden = false;
      syncLogout();
      renderTeacher(true);
    }).catch(function (err) { if (!authFail(err, 'teacher')) toast('err', '불러오지 못했습니다', err.message); });
  }

  function recMap() { var m = {}; S.t.records.forEach(function (r) { m[r.trainingId] = r; }); return m; }

  function renderTeacher(full) {
    var d = S.t, m = recMap();
    var total = d.trainings.length;
    var done = d.trainings.filter(function (t) { return m[t.id] && m[t.id].done; }).length;
    var pct = total ? Math.round(done / total * 100) : 0;
    $('#tRing').style.setProperty('--p', total ? (done / total).toFixed(3) : 0);
    $('#tRing').classList.toggle('all', total > 0 && done === total);
    $('#tPct').textContent = pct + '%';
    $('#tHello').textContent = d.teacher.name + ' 선생님의 연수 현황';
    $('#tSummary').innerHTML = done === total && total ? '<strong>모든 법정의무연수를 이수</strong>했습니다. 수고 많으셨습니다 🎉' : '법정의무연수 <strong>' + total + '개 중 ' + done + '개</strong>를 이수했습니다. 남은 <strong>' + (total - done) + '개</strong>를 확인해 주세요.';
    $('#tDone').textContent = done; $('#tLeft').textContent = total - done; $('#tYear').textContent = d.year;
    var nt = $('#tNotice'); nt.hidden = !d.notice; nt.textContent = d.notice ? '📢 ' + d.notice : '';

    var todo = d.trainings.filter(function (t) { return !(m[t.id] && m[t.id].done); });
    $('#tNext').innerHTML = todo.length ? todo.slice(0, 3).map(function (t) {
      return '<li><div><b>' + esc(t.name) + '</b><small>' + esc(t.cycle) + '</small></div>' + (t.url ? '<a class="btn primary sm" href="' + esc(t.url) + '" target="_blank" rel="noopener">수강하기 ↗</a>' : '') + '</li>';
    }).join('') + (todo.length > 3 ? '<li class="more-n">그 밖에 ' + (todo.length - 3) + '개 더 남았습니다</li>' : '') : '<li class="all-done">🎉 남은 연수가 없습니다</li>';

    if (full) buildChecklist();
    UI.checklistUpdate($('#tList'), done, total);
    applyFilter();
  }

  // 이수일·이수번호 검사 (서버와 같은 기준)
  var MIN_DATE = '2020-01-01';
  function checkRec(date, cert) {
    var errs = {};
    if (!date) errs.date = '이수일을 입력해 주세요.';
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(new Date(date + 'T00:00:00').getTime())) errs.date = '이수일 형식이 올바르지 않습니다.';
    else if (date > today()) errs.date = '오늘 이후 날짜는 입력할 수 없습니다.';
    else if (date < MIN_DATE) errs.date = '2020년 이후 날짜만 입력할 수 있습니다.';
    cert = String(cert || '').trim();
    if (!cert) errs.cert = '이수번호를 입력해 주세요.';
    else if (cert.length < 2 || cert.length > 60) errs.cert = '이수번호는 2~60자입니다.';
    else if (!/\d/.test(cert)) errs.cert = '이수번호에는 숫자가 들어가야 합니다.';
    else if (!/^[0-9A-Za-z가-힣][0-9A-Za-z가-힣\-_.\/()#: ]*$/.test(cert)) errs.cert = '이수번호에 쓸 수 없는 문자가 있습니다.';
    return errs;
  }

  function buildChecklist() {
    var m = recMap(), ul = $('#tList .u014-list');
    var K = ['var(--ux-accent)', 'var(--ux-mint)', 'var(--ux-warn)'];
    ul.innerHTML = S.t.trainings.map(function (t, i) {
      var r = m[t.id] || {}, on = !!r.done;
      var multi = /년|학기|시간|회/.test(t.cycle) && !/^매년 1회$/.test(t.cycle);
      return '<li data-id="' + esc(t.id) + '" class="' + (on ? 'is-done' : '') + '">' +
        '<label class="u014-row"><input class="u014-in" type="checkbox"' + (on ? ' checked' : '') + ' aria-describedby="sum-' + esc(t.id) + '"><span class="u014-box" aria-hidden="true"><svg viewBox="0 0 26 26"><path d="M7.5 13.5l3.8 3.8 7.4-8"/></svg></span><span class="u014-t">' + esc(t.name) + '</span></label>' +
        '<span class="u014-tag" style="--k:' + K[multi ? (/학기/.test(t.cycle) ? 2 : 1) : 0] + '">' + esc(t.cycle) + '</span>' +
        '<div class="rec-sum" id="sum-' + esc(t.id) + '"><span class="rs-tx">' + (on ? recText(r) : '이수일·이수번호를 입력하면 완료됩니다') + '</span><button type="button" class="rs-edit">' + (on ? '수정' : '입력') + '</button></div>' +
        '<form class="rec" hidden novalidate>' +
          '<label class="field mini"><span>이수일 <b class="req">*</b></span><input type="date" class="r-date" required value="' + esc(r.date || '') + '" min="' + MIN_DATE + '" max="' + today() + '"><em class="r-err" data-for="date"></em></label>' +
          '<label class="field mini"><span>이수번호 <b class="req">*</b></span><input type="text" class="r-cert" required maxlength="60" value="' + esc(r.certNo || '') + '" placeholder="수료증의 이수(수료)번호"><em class="r-err" data-for="cert"></em></label>' +
          '<div class="rec-act"><button class="btn ghost sm r-cancel" type="button">취소</button><button class="btn primary sm r-save" type="submit">' + (on ? '수정 저장' : '완료로 저장') + '</button></div>' +
        '</form>' +
        '<details class="more"><summary>기준·수강 안내</summary><p>' + esc(t.detail) + '</p>' + (t.url ? '<a href="' + esc(t.url) + '" target="_blank" rel="noopener">수강·안내 열기 ↗</a>' : '') + '</details>' +
      '</li>';
    }).join('');

    $$('li[data-id]', ul).forEach(function (li) {
      var id = li.getAttribute('data-id');
      var box = $('.u014-in', li), rec = $('.rec', li), sum = $('.rec-sum', li);
      function openForm() { sum.hidden = true; rec.hidden = false; li.classList.add('editing'); showErr({}); $('.r-date', li).focus(); }
      function closeForm() { rec.hidden = true; sum.hidden = false; li.classList.remove('editing'); }
      function showErr(errs) {
        $$('.r-err', li).forEach(function (e) { var k = e.getAttribute('data-for'); e.textContent = errs[k] || ''; });
        $('.r-date', li).setAttribute('aria-invalid', String(!!errs.date));
        $('.r-cert', li).setAttribute('aria-invalid', String(!!errs.cert));
      }
      box.addEventListener('change', function () {
        if (box.checked) {
          // 완료는 이수일·이수번호를 저장해야만 표시됩니다
          box.checked = false;
          openForm();
          return;
        }
        box.checked = true;
        ask('“' + $('.u014-t', li).textContent + '”을(를) 미이수로 바꿀까요? 입력한 이수일·이수번호도 지워집니다.', '미이수로 변경').then(function (ok) {
          if (!ok) return;
          save(id, li, false, '', '').then(function (done) {
            if (!done) return;
            box.checked = false; li.classList.remove('is-done');
            $('.r-date', li).value = ''; $('.r-cert', li).value = '';
            $('.rs-tx', li).textContent = '이수일·이수번호를 입력하면 완료됩니다';
            $('.rs-edit', li).textContent = '입력'; $('.r-save', li).textContent = '완료로 저장';
            closeForm(); applyFilter();
          });
        });
      });
      $('.rs-edit', li).addEventListener('click', openForm);
      $('.r-cancel', li).addEventListener('click', function () {
        var r = recMap()[id] || {};
        $('.r-date', li).value = r.done ? r.date || '' : ''; $('.r-cert', li).value = r.done ? r.certNo || '' : '';
        closeForm();
      });
      $$('input', rec).forEach(function (inp) { inp.addEventListener('input', function () { if (inp.getAttribute('aria-invalid') === 'true') showErr(checkRec($('.r-date', li).value, $('.r-cert', li).value)); }); });
      rec.addEventListener('submit', function (e) {
        e.preventDefault();
        var date = $('.r-date', li).value, cert = $('.r-cert', li).value.trim();
        var errs = checkRec(date, cert);
        showErr(errs);
        if (errs.date || errs.cert) { $(errs.date ? '.r-date' : '.r-cert', li).focus(); return; }
        var was = box.checked;
        var btn = $('.r-save', li); busy(btn, true, '저장 중…');
        save(id, li, true, date, cert).then(function (done) {
          busy(btn, false);
          if (!done) return;
          box.checked = true; li.classList.add('is-done');
          $('.rs-tx', li).innerHTML = recText({ date: date, certNo: cert });
          $('.rs-edit', li).textContent = '수정'; btn.textContent = '수정 저장';
          closeForm(); applyFilter();
          if (!was) toast('ok', '완료로 표시했습니다', $('.u014-t', li).textContent);
        });
      });
    });
  }

  function recText(r) {
    return '📅 ' + esc(r.date || '') + ' · 이수번호 ' + esc(r.certNo || '');
  }

  function save(id, li, done, date, certNo) {
    var payload = { token: S.tToken, trainingId: id, done: done, date: done ? date : '', certNo: done ? certNo : '' };
    var name = (S.t.trainings.filter(function (t) { return t.id === id; })[0] || {}).name;
    var w = done ? null : toast('wait', '저장하는 중…', name);
    return API.call('saveRecord', payload).then(function (r) {
      S.t.records = S.t.records.filter(function (x) { return x.trainingId !== id; }).concat([r]);
      renderTeacher(false);
      if (w) w.done('ok', '미이수로 바꿨습니다', name);
      if (done && S.t.trainings.every(function (t) { var x = recMap()[t.id]; return x && x.done; })) toast('ok', '모든 연수를 이수했습니다 🎉', '한 해 동안 수고 많으셨습니다');
      return true;
    }).catch(function (err) {
      if (authFail(err, 'teacher')) return false;
      if (w) w.done('err', '저장하지 못했습니다', err.message); else toast('err', '저장하지 못했습니다', err.message);
      return false;
    });
  }

  $$('.chips .chip').forEach(function (c) {
    c.addEventListener('click', function () {
      $$('.chips .chip').forEach(function (x) { x.classList.toggle('on', x === c); x.setAttribute('aria-pressed', String(x === c)); });
      S.filter = c.getAttribute('data-f');
      applyFilter();
    });
  });
  function applyFilter() {
    $$('#tList li[data-id]').forEach(function (li) {
      var d = li.classList.contains('is-done');
      li.hidden = S.filter === 'todo' ? d : S.filter === 'done' ? !d : false;
    });
  }

  /* ═════════════ 담당자 ═════════════ */
  $('#aLoginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = e.submitter || $('#aLoginForm button'); busy(btn, true);
    API.call('adminLogin', { password: $('#aPw').value }).then(function (d) {
      busy(btn, false);
      S.aToken = d.token; store.set('zo_a', d.token); $('#aPw').value = '';
      loadAdmin();
      if (d.defaultPw) toast('info', '처음 비밀번호(1234)로 로그인했습니다', '⚙️ 설정에서 비밀번호를 바꿔 주세요');
    }).catch(function (err) { busy(btn, false); toast('err', '로그인하지 못했습니다', err.message); });
  });

  function loadAdmin() {
    return API.call('adminDashboard', { token: S.aToken }).then(function (d) {
      S.a = d;
      $('#aLogin').hidden = true; $('#aDash').hidden = false;
      syncLogout();
      renderAdmin();
    }).catch(function (err) { if (!authFail(err, 'admin')) toast('err', '불러오지 못했습니다', err.message); });
  }

  // 화면 계산용 요약
  function model() {
    var d = S.a;
    var tr = d.trainings.filter(function (t) { return t.active; });
    var inc = d.teachers.filter(function (t) { return t.included; });
    var done = {};
    d.records.forEach(function (r) { if (r.done) (done[r.teacherId] = done[r.teacherId] || {})[r.trainingId] = r; });
    var trActive = {}; tr.forEach(function (t) { trActive[t.id] = 1; });
    var per = d.teachers.map(function (t) {
      var n = tr.filter(function (x) { return done[t.id] && done[t.id][x.id]; }).length;
      return { t: t, n: n, total: tr.length };
    });
    return { tr: tr, inc: inc, done: done, per: per };
  }

  function renderAdmin() {
    var M = model();
    $('#schoolName').textContent = S.a.school + ' · ' + S.a.year + '학년도';
    $('#aWho').textContent = S.a.school + ' · ' + S.a.year + '학년도';
    $('#pwWarn').hidden = !S.a.defaultPw;
    var incPer = M.per.filter(function (p) { return p.t.included; });
    var need = M.inc.length * M.tr.length;
    var got = incPer.reduce(function (s, p) { return s + p.n; }, 0);
    $('#kTeachers').textContent = M.inc.length;
    $('#kRate').textContent = need ? Math.round(got / need * 100) : 0;
    $('#kAll').textContent = incPer.filter(function (p) { return p.total && p.n === p.total; }).length;
    $('#kMiss').textContent = need - got;
    renderMissingPicker(M);
    renderBars(M);
    renderTeachers(M);
    renderTrainings();
    renderRequests();
  }

  function renderMissingPicker(M) {
    var select = $('#missingTraining');
    select.innerHTML = '<option value="">' + (M.tr.length ? '연수를 선택해 주세요' : '사용 중인 연수가 없습니다') + '</option>' + M.tr.map(function (t) {
      var n = M.inc.filter(function (x) { return !(M.done[x.id] && M.done[x.id][t.id]); }).length;
      return '<option value="' + esc(t.id) + '">' + esc(t.name) + ' · 미이수 ' + n + '명</option>';
    }).join('');
    select.disabled = !M.tr.length;
  }
  $('#missingTraining').addEventListener('change', function () {
    var id = this.value;
    this.value = '';
    if (id && S.a) openMissing(id);
  });

  function renderBars(M) {
    var sort = $('#oSort').value;
    var rows = M.tr.map(function (t, i) {
      var n = M.inc.filter(function (x) { return M.done[x.id] && M.done[x.id][t.id]; }).length;
      return { t: t, n: n, total: M.inc.length, rate: M.inc.length ? n / M.inc.length : 0, i: i };
    });
    if (sort === 'low') rows.sort(function (a, b) { return a.rate - b.rate || a.i - b.i; });
    $('#oBars').innerHTML = rows.map(function (r) {
      var pct = Math.round(r.rate * 100), cls = pct === 100 ? 'full' : pct < 50 ? 'low' : '';
      return '<li><button type="button" class="bar ' + cls + '" data-id="' + esc(r.t.id) + '" style="--v:' + r.rate.toFixed(3) + '">' +
        '<span class="bar-name">' + esc(r.t.short || r.t.name) + '<small>' + esc(r.t.cycle) + '</small></span>' +
        '<span class="bar-track"><i></i></span>' +
        '<span class="bar-num"><b>' + pct + '%</b><small>' + r.n + '/' + r.total + '</small></span></button></li>';
    }).join('') || '<li class="empty">집계할 연수나 교원이 없습니다.</li>';
    $$('#oBars .bar').forEach(function (b) { b.addEventListener('click', function () { openMissing(b.getAttribute('data-id')); }); });
  }
  $('#oSort').addEventListener('change', function () { if (S.a) renderBars(model()); });

  function openMissing(trId) {
    var M = model();
    var t = M.tr.filter(function (x) { return x.id === trId; })[0];
    if (!t) return;
    var miss = M.inc.filter(function (x) { return !(M.done[x.id] && M.done[x.id][trId]); });
    $('#missTitle').textContent = '⏳ ' + t.name;
    $('#missSub').textContent = miss.length ? '아직 이수하지 않은 교원 ' + miss.length + '명입니다. 이름을 복사해 메신저로 안내할 수 있습니다.' : '모든 교원이 이수했습니다 🎉';
    $('#missList').innerHTML = miss.map(function (x) { return '<li><b>' + esc(x.name) + '</b><small>' + esc([x.dept, x.role].filter(Boolean).join(' · ')) + '</small></li>'; }).join('');
    $('#missCopy').hidden = !miss.length;
    $('#missCopy').onclick = function () {
      var text = '[' + t.name + '] 미이수 ' + miss.length + '명: ' + miss.map(function (x) { return x.name; }).join(', ');
      copy(text);
    };
    var dlg = $('#missDlg');
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  }
  $$('#missDlg [data-close]').forEach(function (b) { b.addEventListener('click', function () { $('#missDlg').close(); }); });
  $('#missDlg').addEventListener('click', function (e) { if (e.target === e.currentTarget) e.currentTarget.close(); });

  function copy(text) {
    var ok = function () { toast('ok', '복사했습니다', '메신저에 붙여 넣으세요'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fallback); else fallback();
    function fallback() {
      var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); ok(); } catch (e) { toast('err', '복사하지 못했습니다'); }
      ta.remove();
    }
  }

  /* 교원별 */
  var openRows = {};
  function renderTeachers(M) {
    M = M || model();
    var q = $('#tSearch').value.trim(), f = $('#tFilter').value;
    var list = M.per.filter(function (p) {
      var t = p.t;
      if (q && (t.name + ' ' + t.dept + ' ' + t.role).indexOf(q) < 0) return false;
      if (f === 'out') return !t.included;
      if (!t.included) return f === 'all';
      if (f === 'todo') return p.n < p.total;
      if (f === 'done') return p.total && p.n === p.total;
      if (f === 'nopin') return !t.hasPin;
      return true;
    }).sort(function (a, b) { return (b.t.included - a.t.included) || (a.n / (a.total || 1)) - (b.n / (b.total || 1)) || a.t.name.localeCompare(b.t.name, 'ko'); });
    $('#aTeachers').innerHTML = list.map(function (p) {
      var t = p.t, pct = p.total ? p.n / p.total : 0, open = !!openRows[t.id];
      var chips = M.tr.map(function (x) {
        var r = M.done[t.id] && M.done[t.id][x.id];
        return '<li class="' + (r ? 'ok' : '') + '" title="' + esc(x.name + (r && r.date ? ' · ' + r.date : '') + (r && r.certNo ? ' · ' + r.certNo : '')) + '">' + (r ? '✓ ' : '') + esc(x.short || x.name) + '</li>';
      }).join('');
      return '<li class="trow' + (t.included ? '' : ' out') + (open ? ' open' : '') + '" data-id="' + esc(t.id) + '">' +
        '<button type="button" class="trow-head" aria-expanded="' + open + '">' +
          '<span class="avatar" aria-hidden="true">' + esc(t.name.slice(0, 1)) + '</span>' +
          '<span class="trow-name"><b>' + esc(t.name) + '</b><small>' + esc([t.dept, t.role, t.id].filter(Boolean).join(' · ')) + '</small></span>' +
          '<span class="trow-tags">' + (!t.included ? '<em class="tag gray">집계 제외</em>' : '') + (!t.hasPin ? '<em class="tag warn">초기 비밀번호</em>' : '') + (t.included && p.total && p.n === p.total ? '<em class="tag ok">모두 완료</em>' : '') + '</span>' +
          '<span class="mini-prog" style="--v:' + pct.toFixed(3) + '"><i></i></span>' +
          '<span class="trow-num"><b>' + p.n + '</b>/' + p.total + '</span>' +
        '</button>' +
        '<div class="trow-body"' + (open ? '' : ' hidden') + '><ul class="tchips">' + chips + '</ul>' +
          '<div class="trow-act">' +
            '<button class="btn ghost sm" type="button" data-act="toggle">' + (t.included ? '🚪 집계 제외' : '↩️ 집계 포함') + '</button>' +
            (t.hasPin ? '<button class="btn ghost sm" type="button" data-act="reset">🔑 비밀번호 초기화</button>' : '') +
          '</div></div></li>';
    }).join('') || '<li class="empty">조건에 맞는 교원이 없습니다.</li>';

    $$('#aTeachers .trow').forEach(function (li) {
      var id = li.getAttribute('data-id');
      $('.trow-head', li).addEventListener('click', function () {
        openRows[id] = !openRows[id];
        li.classList.toggle('open', openRows[id]);
        $('.trow-body', li).hidden = !openRows[id];
        $('.trow-head', li).setAttribute('aria-expanded', String(openRows[id]));
      });
      $$('[data-act]', li).forEach(function (b) {
        b.addEventListener('click', function () {
          var t = S.a.teachers.filter(function (x) { return x.id === id; })[0];
          if (b.getAttribute('data-act') === 'toggle') {
            (t.included ? ask(t.name + ' 선생님을 집계에서 제외할까요? 이수 기록은 지우지 않으며, 나중에 다시 포함할 수 있습니다.', '집계 제외') : Promise.resolve(true)).then(function (ok) {
              if (ok) adminAct('setTeacherStatus', { id: id, included: !t.included }, t.included ? t.name + ' 선생님을 집계에서 제외했습니다' : t.name + ' 선생님을 다시 포함했습니다');
            });
          } else {
            ask(t.name + ' 선생님의 비밀번호를 1234로 초기화할까요? 다음 로그인 때 새 비밀번호를 정하게 됩니다.', '초기화').then(function (ok) {
              if (ok) adminAct('resetPassword', { id: id }, '비밀번호를 1234로 초기화했습니다', '선생님이 1234로 로그인한 뒤 새로 정합니다');
            });
          }
        });
      });
    });
  }
  $('#tSearch').addEventListener('input', function () { if (S.a) renderTeachers(); });
  $('#tFilter').addEventListener('change', function () { if (S.a) renderTeachers(); });

  function adminAct(action, payload, okTitle, okSub) {
    var w = toast('wait', '처리하는 중…');
    return API.call(action, Object.assign({ token: S.aToken }, payload)).then(function (r) {
      w && w.done('ok', okTitle, okSub);
      return loadAdmin().then(function () { return r; });
    }).catch(function (err) { if (!authFail(err, 'admin')) w && w.done('err', '처리하지 못했습니다', err.message); throw err; });
  }

  /* 연수 항목 */
  function renderTrainings() {
    var used = {};
    (S.a.records || []).forEach(function (r) { used[r.trainingId] = 1; });
    $('#aTrainings').innerHTML = S.a.trainings.map(function (t) {
      var custom = t.id.indexOf('CUSTOM_') === 0;
      return '<li class="' + (t.active ? '' : 'off') + '"><div class="tr-tx"><b>' + esc(t.name) + (custom ? ' <em class="tag info">추가</em>' : '') + '</b><small>' + esc(t.cycle) + (t.target && t.target !== '대상' ? ' · 기본 ' + esc(t.target) : '') + '</small></div>' +
        '<button type="button" class="pen" data-edit="' + esc(t.id) + '" aria-label="' + esc(t.name) + ' 수정" title="수정">✏️</button>' +
        '<label class="switch"><input type="checkbox" data-id="' + esc(t.id) + '"' + (t.active ? ' checked' : '') + '><span aria-hidden="true"></span><em>' + (t.active ? '사용' : '숨김') + '</em></label></li>';
    }).join('');
    $$('#aTrainings input').forEach(function (inp) {
      inp.addEventListener('change', function () {
        adminAct('setTrainingActive', { id: inp.getAttribute('data-id'), active: inp.checked }, inp.checked ? '연수를 다시 사용합니다' : '연수를 숨겼습니다', '선생님 화면과 집계에 바로 반영됩니다').catch(function () { inp.checked = !inp.checked; });
      });
    });
    $$('#aTrainings [data-edit]').forEach(function (b) {
      b.addEventListener('click', function () { openTraining(S.a.trainings.filter(function (t) { return t.id === b.getAttribute('data-edit'); })[0], used); });
    });
  }

  /* 연수 추가·수정 모달 */
  var trEditing = null;
  function openModal(dlg) { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', ''); }
  function openTraining(t, used) {
    trEditing = t || null;
    used = used || {};
    $('#trDlgTitle').textContent = t ? '✏️ 연수 수정' : '➕ 연수 추가';
    $('#trName').value = t ? t.name : ''; $('#trShort').value = t && t.short !== t.name ? t.short : '';
    $('#trCycle').value = t ? t.cycle : ''; $('#trDetail').value = t ? t.detail : ''; $('#trUrl').value = t ? t.url : '';
    $('#trMsg').textContent = '';
    $('#trDelete').hidden = !(t && t.id.indexOf('CUSTOM_') === 0 && !used[t.id]);
    openModal($('#trDlg'));
    $('#trName').focus();
  }
  $('#trAddBtn').addEventListener('click', function () { openTraining(null); });
  $('#trForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = { name: $('#trName').value.trim(), short: $('#trShort').value.trim(), cycle: $('#trCycle').value.trim(), detail: $('#trDetail').value.trim(), url: $('#trUrl').value.trim() };
    var msg = $('#trMsg');
    if (!f.name) { msg.textContent = '교육명을 입력해 주세요.'; $('#trName').focus(); return; }
    if (!f.cycle) { msg.textContent = '주기·시간을 입력해 주세요. 예: 매년 1회'; $('#trCycle').focus(); return; }
    if (f.url && !/^https?:\/\/\S+$/.test(f.url)) { msg.textContent = '수강 링크는 http:// 또는 https:// 로 시작해야 합니다.'; $('#trUrl').focus(); return; }
    var btn = $('#trSave'); busy(btn, true, '저장 중…');
    var editing = trEditing;
    API.call('saveTraining', Object.assign({ token: S.aToken, id: editing ? editing.id : '' }, f)).then(function () {
      busy(btn, false); $('#trDlg').close();
      toast('ok', editing ? '연수를 수정했습니다' : '연수를 추가했습니다', f.name);
      loadAdmin();
    }).catch(function (err) { busy(btn, false); if (!authFail(err, 'admin')) msg.textContent = err.message; });
  });
  $('#trDelete').addEventListener('click', function () {
    var t = trEditing; if (!t) return;
    $('#trDlg').close();
    ask('“' + t.name + '” 연수를 삭제할까요? 되돌릴 수 없습니다.', '삭제').then(function (ok) {
      if (ok) adminAct('deleteTraining', { id: t.id }, '연수를 삭제했습니다', t.name).catch(function () { });
    });
  });

  /* 전체 설정 모달 */
  $('#pwWarnBtn').addEventListener('click', function () { $('#aSettingsBtn').click(); $('#setPwCur').focus(); });
  $('#aSettingsBtn').addEventListener('click', function () {
    $('#setSchool').value = S.a.school || ''; $('#setYear').value = S.a.year || ''; $('#setNotice').value = S.a.notice || '';
    $('#setPwCur').value = ''; $('#setPwNew').value = ''; $('#setPwNew2').value = ''; $('#setMsg').textContent = '';
    openModal($('#setDlg'));
    $('#setSchool').focus();
  });
  $('#setForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var msg = $('#setMsg');
    var f = { school: $('#setSchool').value.trim(), year: String($('#setYear').value).trim(), notice: $('#setNotice').value.trim() };
    var cur = $('#setPwCur').value, np = $('#setPwNew').value, np2 = $('#setPwNew2').value;
    if (!f.school) { msg.textContent = '학교명을 입력해 주세요.'; return; }
    if (!/^\d{4}$/.test(f.year) || +f.year < 2020 || +f.year > 2100) { msg.textContent = '학년도는 2026처럼 네 자리 숫자로 입력해 주세요.'; return; }
    if (cur || np || np2) {
      if (!cur) { msg.textContent = '현재 비밀번호를 입력해 주세요.'; return; }
      if (np.length < 4) { msg.textContent = '새 비밀번호는 4자 이상입니다.'; return; }
      if (np !== np2) { msg.textContent = '새 비밀번호 확인이 다릅니다.'; return; }
      f.currentPassword = cur; f.newPassword = np;
    }
    var yearChanged = f.year !== String(S.a.year);
    var go = function () {
      var btn = $('#setSave'); busy(btn, true, '저장 중…');
      API.call('saveSettings', Object.assign({ token: S.aToken }, f)).then(function (r) {
        busy(btn, false); $('#setDlg').close();
        toast('ok', '설정을 저장했습니다', r.school + ' · ' + r.year + '학년도' + (r.passwordChanged ? ' · 비밀번호 변경됨' : ''));
        loadAdmin();
      }).catch(function (err) { busy(btn, false); if (!authFail(err, 'admin')) msg.textContent = err.message; });
    };
    if (!yearChanged) return go();
    ask('학년도를 ' + S.a.year + ' → ' + f.year + '(으)로 바꿀까요? 화면은 ' + f.year + '학년도 이수 기록으로 새로 집계됩니다.', '바꾸기').then(function (ok) { if (ok) go(); });
  });
  $$('#trDlg [data-close], #setDlg [data-close]').forEach(function (b) { b.addEventListener('click', function () { b.closest('dialog').close(); }); });

  /* 담당자 로그아웃 */
  $('#aLogoutBtn').addEventListener('click', function () {
    S.aToken = null; S.a = null; store.set('zo_a', null);
    $('#aDash').hidden = true; $('#aLogin').hidden = false;
    syncLogout();
    toast('info', '담당자 로그아웃했습니다');
  });

  /* 추가 요청 */
  function renderRequests() {
    var reqs = S.a.requests || [];
    $('#reqCard').hidden = !reqs.length;
    $('#reqBadge').hidden = !reqs.length; $('#reqBadge').textContent = reqs.length;
    $('#reqBanner').hidden = !reqs.length; $('#reqBannerN').textContent = reqs.length;
    $('#reqList').innerHTML = reqs.map(function (r) {
      var dup = S.a.teachers.some(function (t) { return t.name === r.name; });
      return '<li data-id="' + esc(r.id) + '"><div class="req-tx"><b>' + esc(r.name) + '</b><small>' + esc([r.dept, r.role].filter(Boolean).join(' · ') || '부서·직급 미입력') + (r.at ? ' · ' + esc(r.at.slice(0, 10)) : '') + '</small>' + (r.memo ? '<p>“' + esc(r.memo) + '”</p>' : '') + (dup ? '<p class="warn-tx">⚠️ 같은 이름이 이미 명단에 있습니다(집계 제외 상태일 수 있음). 승인하면 별도 교원으로 추가됩니다.</p>' : '') + '</div>' +
        '<div class="req-act"><button class="btn ghost sm" type="button" data-ok="0">거절</button><button class="btn primary sm" type="button" data-ok="1">명단에 추가</button></div></li>';
    }).join('');
    $$('#reqList li').forEach(function (li) {
      $$('button', li).forEach(function (b) {
        b.addEventListener('click', function () {
          var ok = b.getAttribute('data-ok') === '1', name = $('b', li).textContent;
          (ok ? Promise.resolve(true) : ask(name + ' 선생님의 추가 요청을 거절할까요?', '거절')).then(function (go) { if (go) adminAct('resolveRequest', { id: li.getAttribute('data-id'), approve: ok }, ok ? name + ' 선생님을 명단에 추가했습니다' : '요청을 거절했습니다', ok ? '이름과 처음 비밀번호 1234로 로그인할 수 있습니다' : ''); });
        });
      });
    });
  }
  $('#reqBanner').addEventListener('click', function () { subnav('roster'); });

  /* 하위 메뉴 */
  function subnav(p) {
    $$('.subnav button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-p') === p); b.setAttribute('aria-current', b.getAttribute('data-p') === p ? 'page' : 'false'); });
    $$('.pane').forEach(function (x) { x.hidden = x.getAttribute('data-pane') !== p; });
  }
  $$('.subnav button').forEach(function (b) { b.addEventListener('click', function () { subnav(b.getAttribute('data-p')); }); });

  /* 명단 업로드 */
  var parsed = null;
  var RE = {
    name: /^(이름|성명|성\s*명|교원명|교사명|직원명)$/,
    role: /^(직급|신분|직위|구분|자격|직종)$/,
    dept: /^(부서|소속|학년|담당\s*부서|업무\s*부서|학년\s*반|학년반)$/,
    id: /^(교사\s*ID|ID|교사번호|교원번호)$/i
  };
  function norm(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }

  async function readWorkbook(file) {
    if (!window.XLSX) throw new Error('엑셀 읽기 도구를 불러오는 중입니다. 잠시 뒤 다시 올려 주세요.');
    var ext = (file.name.split('.').pop() || '').toLowerCase();
    if (['xlsx', 'xls', 'csv'].indexOf(ext) < 0) throw new Error('엑셀(.xlsx·.xls) 또는 CSV 파일만 올릴 수 있습니다.');
    if (file.size > 40 * 1048576) throw new Error('파일이 너무 큽니다(40MB 이하).');
    var buf = await file.arrayBuffer();
    if (ext === 'csv') {
      var text;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { text = new TextDecoder('euc-kr').decode(buf); }
      return XLSX.read(text.replace(/^﻿/, ''), { type: 'string' });
    }
    return XLSX.read(buf, { type: 'array' });
  }

  function findRows(wb) {
    for (var s = 0; s < wb.SheetNames.length; s++) {
      var aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[s]], { header: 1, defval: '', raw: false, blankrows: false });
      for (var h = 0; h < Math.min(aoa.length, 15); h++) {
        var row = aoa[h].map(norm), col = {};
        row.forEach(function (c, i) { Object.keys(RE).forEach(function (k) { if (col[k] == null && RE[k].test(c)) col[k] = i; }); });
        if (col.name == null) continue;
        var out = [];
        for (var i = h + 1; i < aoa.length; i++) {
          var r = aoa[i], name = norm(r[col.name]);
          if (!name || RE.name.test(name)) continue;
          out.push({ name: name.slice(0, 20), role: col.role != null ? norm(r[col.role]).slice(0, 20) : '', dept: col.dept != null ? norm(r[col.dept]).slice(0, 30) : '', id: col.id != null ? norm(r[col.id]).toUpperCase() : '' });
        }
        return { sheet: wb.SheetNames[s], rows: out, cols: Object.keys(col) };
      }
    }
    // 머리글이 없고 한 열뿐이면 이름 목록으로 봅니다
    var first = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false, blankrows: false });
    if (first.length && first.every(function (r) { return r.filter(function (c) { return norm(c); }).length <= 1; })) {
      return { sheet: wb.SheetNames[0], rows: first.map(function (r) { return { name: norm(r[0]).slice(0, 20), role: '', dept: '', id: '' }; }).filter(function (r) { return r.name; }), cols: ['name'] };
    }
    throw new Error('“이름” 또는 “성명” 열을 찾지 못했습니다. 첫 줄에 머리글을 넣어 주세요.');
  }

  // 서버와 같은 기준으로 미리 분류합니다
  function classify(rows) {
    var T = S.a.teachers, byId = {}, byName = {}, seen = {}, out = [];
    T.forEach(function (t) { byId[t.id] = t; (byName[t.name] = byName[t.name] || []).push(t); });
    rows.forEach(function (r) {
      var t = null, st = '';
      if (r.id && byId[r.id] && byId[r.id].name === r.name) t = byId[r.id];
      else if (byName[r.name]) {
        var same = byName[r.name];
        if (same.length === 1) t = same[0];
        else { var h = same.filter(function (x) { return r.dept && x.dept === r.dept; }); if (h.length === 1) t = h[0]; else st = 'skip'; }
      }
      if (!st) {
        if (t && seen[t.id]) st = 'dup';
        else if (t) { seen[t.id] = 1; st = !t.included ? 'restore' : ((r.role && r.role !== t.role) || (r.dept && r.dept !== t.dept)) ? 'update' : 'same'; }
        else { var k = 'n:' + r.name + '|' + r.dept; st = seen[k] ? 'dup' : 'new'; seen[k] = 1; }
      }
      out.push(Object.assign({ st: st }, r));
    });
    var missing = T.filter(function (t) { return t.included && !seen[t.id]; });
    return { rows: out, missing: missing };
  }

  var ST = { new: ['신규', 'ok'], update: ['정보 변경', 'info'], restore: ['다시 포함', 'info'], same: ['변경 없음', 'gray'], dup: ['파일 중복 · 건너뜀', 'warn'], skip: ['같은 이름 여럿 · 건너뜀', 'warn'], missing: ['파일에 없음', 'gray'] };

  function renderPreview() {
    var c = parsed.cls, ex = $('#rExclude').checked;
    var count = function (s) { return c.rows.filter(function (r) { return r.st === s; }).length; };
    var stats = [['🆕 신규', count('new'), 'ok'], ['✏️ 변경', count('update') + count('restore'), 'info'], ['➖ 변경 없음', count('same'), 'gray'], ['⚠️ 건너뜀', count('dup') + count('skip'), 'warn'], [ex ? '🚪 제외 예정' : '📌 파일에 없음', c.missing.length, ex ? 'warn' : 'gray']];
    $('#rStats').innerHTML = stats.map(function (s) { return '<div class="pv ' + s[2] + '"><span>' + s[0] + '</span><b>' + s[1] + '</b></div>'; }).join('');
    var rows = c.rows.filter(function (r) { return r.st !== 'same'; }).concat(c.missing.map(function (t) { return { st: 'missing', name: t.name, role: t.role, dept: t.dept }; }));
    var shown = rows.slice(0, 300);
    $('#rRows').innerHTML = shown.map(function (r) {
      var s = r.st === 'missing' && ex ? ['집계 제외 예정', 'warn'] : ST[r.st];
      return '<tr><td><em class="tag ' + s[1] + '">' + s[0] + '</em></td><td>' + esc(r.name) + '</td><td>' + esc(r.role) + '</td><td>' + esc(r.dept) + '</td></tr>';
    }).join('') + (rows.length > shown.length ? '<tr><td colspan="4" class="muted">그 밖에 ' + (rows.length - shown.length) + '줄</td></tr>' : '') + (!rows.length ? '<tr><td colspan="4" class="muted">바뀌는 내용이 없습니다. 모두 기존 명단과 같습니다.</td></tr>' : '');
    var changes = count('new') + count('update') + count('restore') + (ex ? c.missing.length : 0);
    $('#rCommit').disabled = !changes;
    $('#rCommit').textContent = changes ? '명단에 반영하기 (' + changes + '건)' : '반영할 내용 없음';
  }
  $('#rExclude').addEventListener('change', function () { if (parsed) renderPreview(); });

  var drop = UI.dropzone($('#dropBox'), async function (file) {
    if (!S.a) throw new Error('먼저 담당자로 로그인해 주세요.');
    var wb = await readWorkbook(file);
    var res = findRows(wb);
    if (!res.rows.length) throw new Error('“' + res.sheet + '” 시트에서 이름을 찾지 못했습니다.');
    parsed = { rows: res.rows, cls: classify(res.rows) };
    $('#rEmpty').hidden = true; $('#rBody').hidden = false;
    renderPreview();
    if (window.matchMedia('(max-width:1024px)').matches) $('#rPreview').scrollIntoView({ behavior: UI.reducedMotion ? 'auto' : 'smooth', block: 'start' });
    var colName = { name: '이름', role: '직급', dept: '부서', id: '교사ID' };
    return '“' + res.sheet + '” 시트 · ' + res.rows.length + '명 · ' + res.cols.map(function (k) { return colName[k]; }).join('·') + ' 열 인식';
  });

  function resetUpload() { parsed = null; $('#rEmpty').hidden = false; $('#rBody').hidden = true; $('#rExclude').checked = false; drop.clear(); }
  $('#rCancel').addEventListener('click', resetUpload);
  $('#rCommit').addEventListener('click', function () {
    if (!parsed) return;
    var ex = $('#rExclude').checked;
    (ex && parsed.cls.missing.length ? ask('파일에 없는 ' + parsed.cls.missing.length + '명을 집계 제외로 바꿉니다. 이수 기록은 지우지 않습니다. 계속할까요?', '반영하기') : Promise.resolve(true)).then(function (go) { if (go) commitRoster(ex); });
  });
  function commitRoster(ex) {
    var btn = $('#rCommit'); busy(btn, true, '반영하는 중…');
    adminAct('importRoster', { rows: parsed.rows, excludeMissing: ex }, '명단을 반영했습니다').then(function (r) {
      busy(btn, false);
      toast('info', '신규 ' + r.added.length + '명 · 변경 ' + (r.updated.length + r.restored.length) + '명 · 제외 ' + r.excluded.length + '명', r.skipped.length ? '건너뜀 ' + r.skipped.length + '명: ' + r.skipped.slice(0, 3).join(', ') : '선생님들은 이름과 처음 비밀번호 1234로 로그인합니다');
      resetUpload();
    }).catch(function () { busy(btn, false); });
  }

  /* 엑셀 내려받기 */
  $('#exportBtn').addEventListener('click', function () {
    if (!window.XLSX || !S.a) return;
    var M = model();
    var head = ['교사ID', '이름', '직급', '부서', '집계', '완료', '대상'].concat(M.tr.map(function (t) { return t.short || t.name; }));
    var body = M.per.map(function (p) {
      return [p.t.id, p.t.name, p.t.role, p.t.dept, p.t.included ? '포함' : '제외', p.n, p.total].concat(M.tr.map(function (x) { var r = M.done[p.t.id] && M.done[p.t.id][x.id]; return r ? (r.date || '완료') : ''; }));
    });
    var sum = [['교육ID', '교육명', '주기·시간', '이수', '대상', '이수율']].concat(M.tr.map(function (t) {
      var n = M.inc.filter(function (x) { return M.done[x.id] && M.done[x.id][t.id]; }).length;
      return [t.id, t.name, t.cycle, n, M.inc.length, M.inc.length ? Math.round(n / M.inc.length * 100) + '%' : '-'];
    }));
    var wb = XLSX.utils.book_new();
    var ws1 = XLSX.utils.aoa_to_sheet([head].concat(body)); ws1['!cols'] = head.map(function (h, i) { return { wch: i < 7 ? 10 : 12 }; });
    XLSX.utils.book_append_sheet(wb, ws1, '교원별');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sum), '연수별');
    XLSX.writeFile(wb, '법정의무연수_이수현황_' + S.a.year + '_' + today() + '.xlsx');
    toast('ok', '엑셀 파일을 내려받았습니다', '교원별 시트의 날짜는 이수일입니다');
  });

  /* 시작 */
  var startRole = location.hash === '#admin' ? 'admin' : 'teacher';
  tabs.set(startRole);
  showRole(startRole);
})();
