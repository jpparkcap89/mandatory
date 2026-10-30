/* Lucian UX/UI Prompt 요소 스크립트 (원본 동작 유지, 앱 데이터에 연결)
   #039 탭 · #070 토스트 · #032 업로드 · #014 체크리스트
   MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/ */
(function () {
  var rm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var UI = {};

  /* ── #039 미끄러지는 알약 탭 ── */
  UI.tabs = function (root, onChange) {
    var tabs = Array.prototype.slice.call(root.querySelectorAll('.u039-tab'));
    var pill = root.querySelector('.u039-pill');
    var cur = 0;
    function movePill(animate) {
      var t = tabs[cur];
      if (!animate) pill.style.transition = 'none';
      pill.style.setProperty('--x', t.offsetLeft + 'px');
      pill.style.setProperty('--w', t.offsetWidth + 'px');
      if (!animate) { void pill.offsetWidth; pill.style.transition = ''; }
    }
    function select(i, focus, silent) {
      cur = i;
      tabs.forEach(function (t, k) { t.setAttribute('aria-selected', String(k === i)); t.tabIndex = k === i ? 0 : -1; });
      if (focus) tabs[i].focus();
      movePill(true);
      if (!silent) onChange(tabs[i].getAttribute('data-role'));
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { if (i !== cur) select(i); });
      t.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (d) { e.preventDefault(); select((i + d + tabs.length) % tabs.length, true); }
      });
    });
    tabs.forEach(function (t, k) { t.tabIndex = k === 0 ? 0 : -1; });
    movePill(false);
    window.addEventListener('resize', function () { movePill(false); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { movePill(false); });
    return {
      set: function (role) { var i = tabs.findIndex(function (t) { return t.getAttribute('data-role') === role; }); if (i >= 0) select(i, false, true); },
      ids: function (panelIds) { tabs.forEach(function (t, k) { t.setAttribute('aria-controls', panelIds[k]); }); }
    };
  };

  /* ── #070 겹쳐 쌓이는 토스트 ── */
  (function () {
    var root = document.getElementById('toastBox');
    if (!root) return;
    var zone = root.querySelector('.u070-zone'), live = root.querySelector('.u070-live');
    var ICON = { ok: '<svg viewBox="0 0 18 18"><path d="M4 9.4l3.2 3.2L14 5.6"/></svg>', err: '<svg viewBox="0 0 18 18"><path d="M9 5v5M9 13h.01"/></svg>', info: '<svg viewBox="0 0 18 18"><path d="M3.5 4.5h11v7h-6l-3 2.5v-2.5h-2z"/></svg>', wait: '<i></i>' };
    var COLOR = { ok: 'var(--ux-mint)', err: 'var(--ux-danger)', info: 'var(--ux-accent)', wait: 'var(--ux-warn)' };
    var list = [], open = false, DUR = 4500;
    function layout() {
      var acc = 0;
      list.forEach(function (t, i) {
        var el = t.el;
        el.classList.toggle('back', !open && i > 0);
        if (open) { el.style.setProperty('--y', -acc + 'px'); el.style.setProperty('--s', 1); el.style.setProperty('--o', 1); acc += el.offsetHeight + 8; }
        else { el.style.setProperty('--y', -(i * 14) + 'px'); el.style.setProperty('--s', (1 - i * 0.06).toFixed(2)); el.style.setProperty('--o', i > 2 ? 0 : 1); }
        el.style.zIndex = 50 - i;
        el.inert = !open && i > 0;
      });
    }
    function remove(t, dir) {
      var i = list.indexOf(t);
      if (i < 0) return;
      list.splice(i, 1);
      t.el.classList.add('leave');
      if (dir) { t.el.style.setProperty('--dir', dir); t.el.classList.add('side'); }
      setTimeout(function () { t.el.remove(); }, 450);
      layout();
    }
    function push(k, title, sub, action) {
      var el = document.createElement('div');
      el.className = 'u070-t enter';
      el.style.setProperty('--c', COLOR[k]);
      el.setAttribute('role', k === 'err' ? 'alert' : 'status');
      el.innerHTML = '<span class="u070-ic" aria-hidden="true">' + ICON[k] + '</span><span class="u070-tx"><b></b><small></small></span>' + (action ? '<button class="u070-act" type="button"></button>' : '') + '<button class="u070-x" type="button" aria-label="알림 닫기"><svg viewBox="0 0 14 14"><path d="M3.5 3.5l7 7M10.5 3.5l-7 7"/></svg></button><span class="u070-bar" aria-hidden="true"></span>';
      el.querySelector('b').textContent = title;
      el.querySelector('small').textContent = sub || '';
      var t = { el: el, left: k === 'wait' ? Infinity : DUR };
      if (action) { var ab = el.querySelector('.u070-act'); ab.textContent = action.label; ab.addEventListener('click', function () { remove(t); action.run(); }); }
      zone.appendChild(el);
      list.unshift(t);
      while (list.length > 4) remove(list[list.length - 1]);
      void el.offsetWidth;
      el.classList.remove('enter');
      layout();
      live.textContent = title;
      el.querySelector('.u070-x').addEventListener('click', function () { remove(t); });
      var sx = 0, dx = 0, down = false;
      el.addEventListener('pointerdown', function (e) { if (e.target.closest('button')) return; down = true; sx = e.clientX; dx = 0; el.setPointerCapture(e.pointerId); el.classList.add('drag'); });
      el.addEventListener('pointermove', function (e) { if (!down) return; dx = e.clientX - sx; el.style.setProperty('--dx', dx + 'px'); el.style.setProperty('--o', Math.max(0.2, 1 - Math.abs(dx) / 260)); });
      var end = function () { if (!down) return; down = false; el.classList.remove('drag'); if (Math.abs(dx) > 90) remove(t, dx > 0 ? 1 : -1); else { el.style.setProperty('--dx', '0px'); layout(); } };
      el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
      return {
        done: function (kind, title2, sub2) {
          if (list.indexOf(t) < 0) return push(kind, title2, sub2);
          el.style.setProperty('--c', COLOR[kind]);
          el.querySelector('.u070-ic').innerHTML = ICON[kind];
          el.querySelector('b').textContent = title2;
          el.querySelector('small').textContent = sub2 || '';
          el.setAttribute('role', kind === 'err' ? 'alert' : 'status');
          live.textContent = title2;
          t.left = DUR;
        },
        close: function () { remove(t); }
      };
    }
    var last = performance.now();
    (function loop(now) {
      var dt = now - last; last = now;
      if (!open) list.slice().forEach(function (t, i) {
        if (i > 0 || t.left === Infinity) return;
        t.left -= dt;
        t.el.style.setProperty('--left', Math.max(0, t.left / DUR).toFixed(3));
        if (t.left <= 0) remove(t);
      });
      requestAnimationFrame(loop);
    })(last);
    function setOpen(v) { if (open === v) return; open = v; layout(); }
    zone.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') setOpen(true); });
    zone.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse' && !zone.contains(document.activeElement)) setOpen(false); });
    zone.addEventListener('focusin', function () { setOpen(true); });
    zone.addEventListener('focusout', function (e) { if (!zone.contains(e.relatedTarget)) setOpen(false); });
    UI.toast = push;
  })();

  /* ── #032 끌어다 놓는 업로드 ── */
  UI.dropzone = function (root, onFile) {
    var zone = root.querySelector('.u032-zone');
    var pick = root.querySelector('.u032-file');
    var list = root.querySelector('.u032-list');
    var TYPE = { csv: '#22A06B', xlsx: '#1D6F42', xls: '#1D6F42' };
    function size(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
    function handle(file) {
      var ext = (file.name.split('.').pop() || '').toLowerCase();
      var li = document.createElement('li');
      li.className = 'u032-row';
      li.innerHTML = '<span class="u032-ic" style="--c:' + (TYPE[ext] || '#8E8A97') + '" aria-hidden="true">' + (ext.slice(0, 4).toUpperCase() || 'FILE') + '</span><span class="u032-meta"><b></b><small></small></span><span class="u032-st"><span class="u032-spin" aria-hidden="true"></span></span><span class="u032-bar" aria-hidden="true"></span>';
      li.querySelector('b').textContent = file.name;
      var sm = li.querySelector('small');
      sm.textContent = size(file.size) + ' · 읽는 중';
      list.innerHTML = '';
      list.appendChild(li);
      li.style.setProperty('--p', '0.4');
      Promise.resolve().then(function () { return onFile(file); }).then(function (msg) {
        li.style.setProperty('--p', '1');
        li.classList.add('done');
        sm.textContent = size(file.size) + ' · ' + (msg || '읽었어요');
        li.querySelector('.u032-st').innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.4l3 3 6-6.4"/></svg>';
      }, function (err) {
        li.style.setProperty('--p', '0.62');
        li.classList.add('fail');
        sm.textContent = err && err.message || '파일을 읽지 못했어요';
        var st = li.querySelector('.u032-st');
        st.outerHTML = '<button class="u032-retry" type="button">다른 파일</button>';
        li.querySelector('.u032-retry').addEventListener('click', function () { pick.click(); });
      });
    }
    zone.addEventListener('click', function () { pick.click(); });
    pick.addEventListener('change', function () { if (pick.files[0]) handle(pick.files[0]); pick.value = ''; });
    var depth = 0;
    zone.addEventListener('dragenter', function (e) { e.preventDefault(); depth++; root.classList.add('is-over'); });
    zone.addEventListener('dragover', function (e) { e.preventDefault(); });
    zone.addEventListener('dragleave', function () { if (--depth <= 0) { depth = 0; root.classList.remove('is-over'); } });
    zone.addEventListener('drop', function (e) {
      e.preventDefault(); depth = 0; root.classList.remove('is-over');
      if (e.dataTransfer.files[0]) handle(e.dataTransfer.files[0]);
    });
    return { clear: function () { list.innerHTML = ''; } };
  };

  /* ── #014 할 일 체크리스트 (진행 고리) ── */
  UI.checklistUpdate = function (root, n, total) {
    root.style.setProperty('--p', total ? (n / total).toFixed(3) : 0);
    root.querySelector('.u014-num').textContent = n + '/' + total;
    root.classList.toggle('is-all', total > 0 && n === total);
  };

  UI.reducedMotion = rm;
  window.UI = UI;
})();
