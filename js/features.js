    (function(){
        'use strict';
        /* 【このファイルが上書きしている本体関数の一覧】
           window.pickShuffledIndex（app-manage.js の同名関数を袋方式に置き換え）
           / window.setTimer と window.toggleHardMode（クラスモード中の割り込み終了処理を追加してから元関数を呼ぶ）
           / window.onTimeSelectChange（『クラス…』選択の分岐を追加。stats.js の定義をラップ）
           / window.isOverlayOpen（class-panel 分を追加。sketch.js の定義をラップ）。
           ボタンの挙動を調べるときは bindings.js → 本体の定義 → この上書き、の順に読むこと。
           （window.updateImageCounter の上書きは stats.js 側にあり、そちらには既存コメントがあるため触らない） */
        function fmtJa(sec){ if (sec < 60) return sec + '秒'; const m = Math.floor(sec/60), s = sec % 60; return s ? (m + '分' + s + '秒') : (m + '分'); }
        function showToast(msg, ms){
            const t = document.getElementById('app-toast');
            t.textContent = msg; t.classList.add('show');
            clearTimeout(showToast._id); showToast._id = setTimeout(function(){ t.classList.remove('show'); }, ms || 2400);
        }
        window.showToast = showToast; // 他ファイル（stats.js等）からも使えるように公開

        /* ════════════════════════════════════════════════════════
           1) 巡回シャッフル — 全画像を一巡するまで同じ画像を出さない
              （既存の pickShuffledIndex を袋方式で置き換え）
        ════════════════════════════════════════════════════════ */
        let _bag = [], _bagPos = 0, _bagRef = null, _bagLen = 0;
        function _refillBag(avoidFirst){
            const idxs = [];
            for (let i = 0; i < images.length; i++) idxs.push(i);
            for (let i = idxs.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; const t = idxs[i]; idxs[i] = idxs[j]; idxs[j] = t; }
            if (idxs.length > 1 && idxs[0] === avoidFirst) idxs.push(idxs.shift());
            _bag = idxs; _bagPos = 0;
        }
        window.pickShuffledIndex = function(excludeA, excludeB, maxGuard){
            const n = images.length;
            if (n <= 1) return 0;
            if (_bagRef !== images || _bagLen !== n) { _bagRef = images; _bagLen = n; _bag = []; _bagPos = 0; }
            if (_bagPos >= _bag.length) _refillBag(excludeA);
            let idx = _bag[_bagPos];
            if (idx === excludeA && _bagPos + 1 < _bag.length) {
                _bag[_bagPos] = _bag[_bagPos + 1]; _bag[_bagPos + 1] = idx; idx = _bag[_bagPos];
            }
            _bagPos++;
            return idx;
        };

        /* ════════════════════════════════════════════════════════
           3) ズーム＆パン — ホイール / ピンチで拡大、ドラッグで移動
              手や顔などの部分練習に。画像が替わると自動で等倍に戻る
        ════════════════════════════════════════════════════════ */
        const zArea = ui.canvasArea, zCont = ui.imgContainer;
        let zS = 1, zX = 0, zY = 0;
        const zChip = document.createElement('div');
        zChip.id = 'zoom-chip';
        zCont.appendChild(zChip);
        zChip.addEventListener('click', function(e){ e.stopPropagation(); zReset(); });
        zChip.addEventListener('pointerup', function(e){ e.stopPropagation(); });
        function zClamp(){
            const r = zCont.getBoundingClientRect();
            const mx = r.width * (zS - 1) / 2 + r.width * 0.2 * (zS - 1);
            const my = r.height * (zS - 1) / 2 + r.height * 0.2 * (zS - 1);
            if (zX >  mx) zX =  mx; if (zX < -mx) zX = -mx;
            if (zY >  my) zY =  my; if (zY < -my) zY = -my;
        }
        function zApply(){
            if (zS <= 1.001) {
                zS = 1; zX = 0; zY = 0;
                zArea.style.transform = '';
                zChip.classList.remove('show');
            } else {
                zClamp();
                zArea.style.transform = 'translate(' + zX.toFixed(1) + 'px,' + zY.toFixed(1) + 'px) scale(' + zS.toFixed(3) + ')';
                zChip.textContent = '🔍 ×' + zS.toFixed(1) + '　タップで等倍';
                zChip.classList.add('show');
            }
        }
        function zReset(){ zS = 1; zApply(); }
        ui.img.addEventListener('load', zReset); // 画像が替わったら等倍に戻す

        // PC: ホイールでカーソル位置を中心に拡大縮小
        zCont.addEventListener('wheel', function(e){
            if (images.length === 0) return;
            e.preventDefault();
            const r = zCont.getBoundingClientRect();
            const cx = e.clientX - r.left - r.width / 2;
            const cy = e.clientY - r.top  - r.height / 2;
            const old = zS;
            zS = Math.min(6, Math.max(1, zS * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
            const px = (cx - zX) / old, py = (cy - zY) / old;
            zX = cx - px * zS; zY = cy - py * zS;
            zApply();
        }, { passive: false });

        // スマホ: ピンチで拡大、ズーム中は1本指でパン
        const zPts = new Map();
        let zPinchD = 0, zPinchS = 1, zGesture = false, zLastTap = 0;
        zArea.addEventListener('pointerdown', function(e){
            zPts.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (zPts.size === 2) {
                zGesture = true;
                try { zArea.setPointerCapture(e.pointerId); } catch(_){ /* 一部ブラウザ非対応でも無害なため無視 */ }
                const a = Array.from(zPts.values());
                zPinchD = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
                zPinchS = zS;
            } else if (zPts.size === 1 && zS > 1) {
                zGesture = true;
                try { zArea.setPointerCapture(e.pointerId); } catch(_){ /* 一部ブラウザ非対応でも無害なため無視 */ }
            }
        }, { passive: true });
        zArea.addEventListener('pointermove', function(e){
            if (!zPts.has(e.pointerId)) return;
            const prev = zPts.get(e.pointerId);
            const cur = { x: e.clientX, y: e.clientY };
            if (zPts.size === 2) {
                zPts.set(e.pointerId, cur);
                const a = Array.from(zPts.values());
                const d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
                if (zPinchD > 0) { zS = Math.min(6, Math.max(1, zPinchS * d / zPinchD)); zApply(); }
            } else if (zPts.size === 1 && zS > 1) {
                zX += cur.x - prev.x; zY += cur.y - prev.y;
                zPts.set(e.pointerId, cur);
                zApply();
            }
        }, { passive: true });
        function zEnd(e){
            if (!zPts.has(e.pointerId)) return;
            zPts.delete(e.pointerId);
            if (zGesture) {
                e.stopPropagation(); // 元のスワイプ送り/ダブルタップへ伝播させない
                if (zS > 1 && zPts.size === 0) {
                    const now = Date.now();
                    if (now - zLastTap < 300) zReset(); // ズーム中はダブルタップで等倍
                    zLastTap = now;
                }
                if (zPts.size === 0) zGesture = false;
            }
        }
        zArea.addEventListener('pointerup', zEnd);
        zArea.addEventListener('pointercancel', function(e){ zPts.delete(e.pointerId); if (zPts.size === 0) zGesture = false; }, { passive: true });
        // PC: ズーム中はダブルクリックでも等倍
        zArea.addEventListener('dblclick', function(){ if (zS > 1) zReset(); });

        /* ════════════════════════════════════════════════════════
           4) クラスモード — 「30秒×10 → 1分×5 → 休憩 → …」自動進行
              タイマーの時間選択「クラス…」から開始
        ════════════════════════════════════════════════════════ */
        let clActive = false, clPlan = [], clStep = 0, clI = 0, clPrevSec = 60;
        let clEdit = [], clRestTick = null, clRestCb = null;
        const CL_PRESETS = [
            { name: 'ウォームアップ 10分', plan: [{s:30,c:10},{s:60,c:5}] },
            { name: 'じっくり 30分',       plan: [{s:60,c:10},{s:120,c:5},{b:1,s:30},{s:300,c:2}] },
            { name: '本格 1時間',          plan: [{s:30,c:10},{s:60,c:10},{b:1,s:60},{s:300,c:5},{b:1,s:60},{s:600,c:2}] },
        ];
        const CL_SECS = [15,30,45,60,90,120,180,300,600,900,1200];

        window.openClassPanel = function(){
            if (images.length === 0) { alert('先に画像を読み込んでください'); return; }
            clEdit = window.CroquisStore.getJSON(window.CROQUIS_KEYS.CLASS, []);
            if (!clEdit.length) clEdit = JSON.parse(JSON.stringify(CL_PRESETS[0].plan));
            const pr = document.getElementById('cl-presets');
            pr.innerHTML = '';
            CL_PRESETS.forEach(function(p){
                const b = document.createElement('button');
                b.className = 'panel-chip'; b.textContent = p.name;
                b.addEventListener('click', function(){ clEdit = JSON.parse(JSON.stringify(p.plan)); renderClRows(); });
                pr.appendChild(b);
            });
            renderClRows();
            document.getElementById('class-panel').classList.add('open');
        };
        window.closeClassPanel = function(){ document.getElementById('class-panel').classList.remove('open'); };
        function renderClRows(){
            const wrap = document.getElementById('cl-rows');
            wrap.innerHTML = '';
            clEdit.forEach(function(st, i){
                const row = document.createElement('div'); row.className = 'cl-row';
                const n = document.createElement('span'); n.className = 'cl-n'; n.textContent = (i + 1);
                const type = document.createElement('select');
                type.innerHTML = '<option value="draw">描く</option><option value="break">休憩</option>';
                type.value = st.b ? 'break' : 'draw';
                type.addEventListener('change', function(){
                    if (type.value === 'break') { st.b = 1; delete st.c; } else { delete st.b; st.c = st.c || 5; }
                    renderClRows();
                });
                const cnt = document.createElement('select');
                for (let c = 1; c <= 30; c++) { const o = document.createElement('option'); o.value = c; o.textContent = c + '枚'; cnt.appendChild(o); }
                cnt.value = st.c || 5;
                cnt.addEventListener('change', function(){ st.c = +cnt.value; renderClTotal(); });
                if (st.b) cnt.style.display = 'none';
                const sec = document.createElement('select');
                CL_SECS.forEach(function(s){ const o = document.createElement('option'); o.value = s; o.textContent = fmtJa(s); sec.appendChild(o); });
                if (CL_SECS.indexOf(st.s) === -1) { const o = document.createElement('option'); o.value = st.s; o.textContent = fmtJa(st.s); sec.appendChild(o); }
                sec.value = st.s;
                sec.addEventListener('change', function(){ st.s = +sec.value; renderClTotal(); });
                const del = document.createElement('button'); del.className = 'tag-mini-btn danger'; del.textContent = '✕';
                del.addEventListener('click', function(){ clEdit.splice(i, 1); renderClRows(); });
                row.appendChild(n); row.appendChild(type); row.appendChild(cnt); row.appendChild(sec); row.appendChild(del);
                wrap.appendChild(row);
            });
            renderClTotal();
        }
        function renderClTotal(){
            const total  = clEdit.reduce(function(a, s){ return a + s.s * (s.b ? 1 : (s.c || 0)); }, 0);
            const sheets = clEdit.reduce(function(a, s){ return a + (s.b ? 0 : (s.c || 0)); }, 0);
            document.getElementById('cl-total').textContent = '合計 ' + sheets + '枚 / 約' + Math.max(1, Math.round(total / 60)) + '分';
        }
        window.clAddRow = function(){ clEdit.push({ s: 60, c: 5 }); renderClRows(); };

        window.startClassFromEditor = function(){
            const plan = clEdit.filter(function(s){ return s.s > 0 && (s.b || s.c > 0); });
            if (!plan.length) { showToast('ステップを追加してください'); return; }
            window.CroquisStore.setJSON(window.CROQUIS_KEYS.CLASS, plan, 'クラス設定');
            closeClassPanel();
            if (hmActive) exitHardMode();
            clPrevSec = timerSeconds;
            clActive = true; clPlan = plan; clStep = 0; clI = 0;
            enterStep();
        };
        function enterStep(){
            if (clStep >= clPlan.length) { finishClass(); return; }
            const st = clPlan[clStep];
            if (st.b) {
                ui.phase.textContent = '☕ 休憩';
                runClassRest(st.s, function(){ clStep++; clI = 0; enterStep(); });
                return;
            }
            timerSeconds = st.s;
            updateClChip();
            nextImage();
            if (!isRunning) startTimer();
        }
        // タイマー1枚分の終了時に timerTickLoop から呼ばれる
        window.classOnTimerEnd = function(){
            if (!clActive) return false;
            clI++;
            const st = clPlan[clStep];
            if (clI < st.c) { updateClChip(); nextImage(); return true; }
            clStep++; clI = 0;
            enterStep();
            return true;
        };
        function updateClChip(){
            const st = clPlan[clStep];
            ui.phase.textContent = '📋 ' + (clStep + 1) + '/' + clPlan.length + '｜' + fmtJa(st.s) + '×' + st.c + '（' + (clI + 1) + '枚目）';
            ui.phase.classList.add('cl-chip');
            ui.phase.title = 'タップでクラスを終了';
        }
        function finishClass(){
            clExit(false);
            stopTimer();
            showToast('クラス完了！おつかれさまでした 🎉', 3600);
        }
        function clExit(skipTimerReset){
            clActive = false;
            ui.phase.textContent = '';
            ui.phase.classList.remove('cl-chip');
            ui.phase.title = '';
            clearInterval(clRestTick); clRestTick = null; clRestCb = null;
            document.getElementById('cl-rest').classList.remove('on');
            timerSeconds = clPrevSec;
            if (ui.timeSelect) {
                let has = false;
                for (let i = 0; i < ui.timeSelect.options.length; i++) if (ui.timeSelect.options[i].value === String(clPrevSec)) has = true;
                if (has) ui.timeSelect.value = String(clPrevSec);
            }
            if (!skipTimerReset) resetTimer();
        }
        function runClassRest(sec, cb){
            clearTimeout(timerTickId); timerTickId = null;
            cancelAnimationFrame(animationFrameId); animationFrameId = null;
            clRestCb = cb;
            let r = sec;
            document.getElementById('cl-rest-count').textContent = r;
            document.getElementById('cl-rest').classList.add('on');
            clearInterval(clRestTick);
            clRestTick = setInterval(function(){
                r--;
                if (r <= 0) { skipClassRest(); }
                else document.getElementById('cl-rest-count').textContent = r;
            }, 1000);
        }
        window.skipClassRest = function(){
            clearInterval(clRestTick); clRestTick = null;
            document.getElementById('cl-rest').classList.remove('on');
            const cb = clRestCb; clRestCb = null;
            if (cb) cb();
        };
        // クラス中に時間選択やハードモードを使ったらクラスを終了して譲る
        const _setTimer = setTimer;
        window.setTimer = function(sec){ if (clActive) clExit(true); _setTimer(sec); };
        const _toggleHM = toggleHardMode;
        window.toggleHardMode = function(){ if (clActive) clExit(false); _toggleHM(); };
        // 進行チップをタップで終了確認
        ui.phase.addEventListener('click', function(){
            if (clActive && confirm('クラスを終了しますか？')) clExit(false);
        });
        // 時間選択の「クラス…」
        const _onTSC = onTimeSelectChange;
        window.onTimeSelectChange = function(v){
            if (v === 'class') {
                if (ui.timeSelect) {
                    let has = false;
                    for (let i = 0; i < ui.timeSelect.options.length; i++) if (ui.timeSelect.options[i].value === String(timerSeconds)) has = true;
                    ui.timeSelect.value = has ? String(timerSeconds) : ui.timeSelect.options[0].value;
                }
                openClassPanel();
                return;
            }
            _onTSC(v);
        };

        /* ════════════════════════════════════════════════════════
           5) キー操作・ガード統合
        ════════════════════════════════════════════════════════ */
        const _prevOverlayOpen = window.isOverlayOpen;
        window.isOverlayOpen = function(){
            return _prevOverlayOpen() || document.getElementById('class-panel').classList.contains('open');
        };
        document.addEventListener('keydown', function(e){
            const ae = document.activeElement;
            if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'SELECT' || ae.tagName === 'TEXTAREA')) return;
            const clOpen = document.getElementById('class-panel').classList.contains('open');
            if (e.code === 'Escape' && clOpen) { closeClassPanel(); return; }
        });

        /* ════════════════════════════════════════════════════════
           6) Pinterest 連携 / URLで画像を追加
              Pinterestを横に開き、ピンをこの画面へドラッグ＆ドロップで
              そのままプールに追加できる（PC）。スマホはURL追加で。
        ════════════════════════════════════════════════════════ */
        function urlToItem(url){
            let u = String(url).trim();
            if (!/^https?:\/\//.test(u)) return null;
            // Pinterestのサムネイルは大きいサイズに引き上げる
            u = u.replace(/(pinimg\.com\/)\d+x(\/)/, '$1736x$2');
            let cors = false;
            try {
                const h = new URL(u).hostname;
                if (/(^|\.)pinimg\.com$|(^|\.)wikimedia\.org$|(^|\.)metmuseum\.org$|(^|\.)artic\.edu$|(^|\.)clevelandart\.org$|(^|\.)picsum\.photos$/.test(h)) cors = true;
            } catch(_) { return null; }
            return { name: 'web_drop_' + Date.now() + '_' + Math.random().toString(36).slice(2,6), data: u, cors: cors };
        }
        window.addUrlToPool = function(url, silent){
            const item = urlToItem(url);
            if (!item) { if (!silent) showToast('http(s)で始まる画像URLを入力してください'); return false; }
            // 実際に表示できる画像か先に確認してから追加する（壊れたURLで「計N枚」だけ増えるのを防ぐ）
            const test = new Image();
            if (item.cors) test.crossOrigin = 'anonymous';
            test.onload = function(){
                if (sourceImages.length === 0) {
                    applyLoadedFiles([item]);
                } else {
                    sourceImages.push(item); originalOrder.push(item);
                    if (!isFavMode) images = sourceImages;
                    updateImageCounter();
                    if (typeof updatePreloadQueue === 'function') updatePreloadQueue();
                }
                showToast('画像を追加しました（計' + sourceImages.length + '枚）');
            };
            test.onerror = function(){
                showToast('この画像は表示できませんでした。ページのURLではなく、画像そのものを右クリック→「画像をコピー」して貼り付けてください（pixiv等はこの方法が確実）', 5200);
            };
            test.src = item.data;
            return true;
        };
        // 他サイト（Pinterest等）から画像をドラッグ＆ドロップ → URLとして追加
        window.addDroppedUrl = function(dt){
            if (!dt) return false;
            let url = '';
            try {
                const htmlData = dt.getData('text/html');
                if (htmlData) {
                    const m = htmlData.match(/<img[^>]+src=["']([^"']+)["']/i);
                    if (m) url = m[1];
                }
                if (!url) url = (dt.getData('text/uri-list') || dt.getData('text/plain') || '').split(/[\r\n]/)[0];
            } catch(e) { console.warn("croquis: ドロップ内容の解析に失敗", e); }
            if (!url || !/^https?:\/\//.test(url)) return false;
            return addUrlToPool(url, true);
        };
        // 素材庫の検索行に「Pinterest」「pixiv」「URL追加」ボタンを追加
        (function(){
            const row = document.getElementById('online-searchrow');
            if (!row) return;
            // 別ウィンドウで開く共通処理（ログイン状態はブラウザがそのまま保持する）
            function openSite(url, name){
                window.open(url, name, 'width=980,height=900');
                showToast('画像を右クリック →「画像をコピー」→ この画面で Ctrl+V で取り込めます（一番確実）', 5200);
            }
            const pin = document.createElement('button');
            pin.className = 'panel-btn';
            pin.textContent = '📌 Pinterest';
            pin.title = 'Pinterestを別ウィンドウで開く（ログイン状態はブラウザが保持。画像をコピー→Ctrl+V／ドラッグ＆ドロップで取り込み）';
            pin.addEventListener('click', function(){
                let q = (document.getElementById('online-query').value || '').trim();
                const url = q ? 'https://www.pinterest.com/search/pins/?q=' + encodeURIComponent(q) : 'https://www.pinterest.com/';
                openSite(url, 'croquis_pinterest');
            });
            const pix = document.createElement('button');
            pix.className = 'panel-btn';
            pix.textContent = '🅿 pixiv';
            pix.title = 'pixivを別ウィンドウで開く（ログイン状態はブラウザが保持。pixivは直リンク不可なので、画像をコピー→Ctrl+Vで取り込み）';
            pix.addEventListener('click', function(){
                let q = (document.getElementById('online-query').value || '').trim();
                const url = q ? 'https://www.pixiv.net/tags/' + encodeURIComponent(q) + '/artworks' : 'https://www.pixiv.net/';
                openSite(url, 'croquis_pixiv');
            });
            const urlBtn = document.createElement('button');
            urlBtn.className = 'panel-btn ghost';
            urlBtn.textContent = '🔗 URL追加';
            urlBtn.title = '画像URLを貼り付けてプールに追加（改行で区切れば複数まとめて追加できます）';
            urlBtn.addEventListener('click', function(){
                const u = prompt('画像のURLを貼り付けてください（.jpg / .png などへの直接リンク）。\n複数行に分けて貼ると、まとめて追加できます。');
                if (!u) return;
                const lines = u.split(/[\r\n]+/).map(function(s){ return s.trim(); }).filter(function(s){ return /^https?:\/\//.test(s); });
                lines.forEach(function(line){ addUrlToPool(line); });
            });
            row.appendChild(pin);
            row.appendChild(pix);
            row.appendChild(urlBtn);
        })();

        /* ════════════════════════════════════════════════════════
           7) オンライン素材の接続を先回りで温める（読み込み体感の高速化）
        ════════════════════════════════════════════════════════ */
        ['https://upload.wikimedia.org','https://commons.wikimedia.org',
         'https://images.metmuseum.org','https://collectionapi.metmuseum.org',
         'https://www.artic.edu','https://api.artic.edu',
         'https://openaccess-cdn.clevelandart.org','https://openaccess-api.clevelandart.org',
         'https://picsum.photos','https://fastly.picsum.photos','https://i.pinimg.com'
        ].forEach(function(h){
            const l = document.createElement('link');
            l.rel = 'preconnect'; l.href = h; l.crossOrigin = 'anonymous';
            document.head.appendChild(l);
        });
    })();
