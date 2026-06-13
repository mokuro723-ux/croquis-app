    (function(){
        'use strict';

        /* ════════════════════════════════════════════════════════
           1) セッション統計
        ════════════════════════════════════════════════════════ */
        const STATS_KEY = window.CROQUIS_KEYS.STATS;
        function loadStats(){ return window.CroquisStore.getJSON(STATS_KEY, { days:{}, total:{count:0,sec:0} }); }
        function saveStats(s){ window.CroquisStore.setJSON(STATS_KEY, s, '統計'); }
        function todayKey(){ const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
        window.recordSessionStat = function(){
            try {
                const s = loadStats(); const k = todayKey();
                if (!s.days[k]) s.days[k] = { count:0, sec:0 };
                const sec = (typeof hmActive !== 'undefined' && hmActive) ? hmPhases[hmPhase].s : timerSeconds;
                s.days[k].count++; s.days[k].sec += sec;
                s.total.count++;   s.total.sec   += sec;
                // 90日より古い日次データは削除
                const keys = Object.keys(s.days);
                if (keys.length > 90) { keys.sort(); while (keys.length > 90) delete s.days[keys.shift()]; }
                saveStats(s);
            } catch(e){ console.warn("croquis: 統計の記録に失敗", e); }
        };
        function fmtMin(sec){
            if (sec < 60) return sec + '秒';
            const h = Math.floor(sec/3600), m = Math.round((sec%3600)/60);
            return h > 0 ? (h + '時間' + m + '分') : (m + '分');
        }
        window.renderStatsPanel = function(){
            const el = document.getElementById('stats-grid'); if (!el) return;
            const s = loadStats(); const t = s.days[todayKey()] || { count:0, sec:0 };
            el.innerHTML =
                '<div class="stat-card"><div class="stat-v">' + t.count + '枚</div><div class="stat-k">今日 描いた枚数</div></div>' +
                '<div class="stat-card"><div class="stat-v">' + fmtMin(t.sec) + '</div><div class="stat-k">今日 の練習時間</div></div>' +
                '<div class="stat-card"><div class="stat-v">' + s.total.count + '枚</div><div class="stat-k">累計 枚数</div></div>' +
                '<div class="stat-card"><div class="stat-v">' + fmtMin(s.total.sec) + '</div><div class="stat-k">累計 時間</div></div>';
            // 直近7日の枚数グラフ
            let wk = document.getElementById('stats-week');
            if (!wk) { wk = document.createElement('div'); wk.id = 'stats-week'; el.parentNode.insertBefore(wk, el.nextSibling); }
            const days = [];
            for (let i = 6; i >= 0; i--) {
                const d = new Date(); d.setDate(d.getDate() - i);
                const k = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
                days.push({ label: (d.getMonth()+1) + '/' + d.getDate(), count: (s.days[k] || {count:0}).count });
            }
            const max = Math.max(1, days.reduce(function(a,d){ return Math.max(a, d.count); }, 0));
            wk.innerHTML = days.map(function(d){
                return '<div class="sw-bar"><i style="height:' + Math.round(d.count / max * 44) + 'px" title="' + d.count + '枚"></i><s>' + d.label + '</s></div>';
            }).join('');
        };
        window.resetStats = function(){
            if (confirm('統計をリセットしますか？')) { saveStats({ days:{}, total:{count:0,sec:0} }); renderStatsPanel(); }
        };
        // 設定パネルを開いたときに統計を更新
        const settingsBtnEl = document.getElementById('settings-btn');
        if (settingsBtnEl) settingsBtnEl.addEventListener('click', function(){ setTimeout(renderStatsPanel, 0); });
        renderStatsPanel();

        /* ════════════════════════════════════════════════════════
           2) カスタムタイマー
        ════════════════════════════════════════════════════════ */
        window.onTimeSelectChange = function(v){
            if (v === 'custom') {
                const input = prompt('時間を入力してください（例: 45 → 45秒 / 1:30 → 1分30秒 / 7m → 7分）', '45');
                if (input === null) { ui.timeSelect.value = timerSeconds; return; }
                let sec = 0; const t = String(input).trim();
                if (/^\d+:\d+$/.test(t)) { const p = t.split(':'); sec = parseInt(p[0],10)*60 + parseInt(p[1],10); }
                else if (/^\d+\s*m$/i.test(t)) { sec = parseInt(t,10)*60; }
                else { sec = parseInt(t,10); }
                if (!sec || sec < 1 || sec > 36000) { alert('1秒〜10時間の範囲で入力してください'); ui.timeSelect.value = timerSeconds; return; }
                ensureTimeOption(sec);
                setTimer(sec);
            } else {
                setTimer(parseInt(v, 10));
            }
        };
        function ensureTimeOption(sec){
            const sel = ui.timeSelect; if (!sel) return;
            let exists = false;
            for (let i = 0; i < sel.options.length; i++) { if (sel.options[i].value === String(sec)) { exists = true; break; } }
            if (!exists) {
                const o = document.createElement('option'); o.value = String(sec);
                const m = Math.floor(sec/60), s = sec%60;
                o.textContent = m > 0 ? (s > 0 ? (m+'m'+s+'s') : (m+'m')) : (s+'s');
                const customOpt = sel.querySelector('option[value="custom"]');
                sel.insertBefore(o, customOpt);
            }
        }

        /* ════════════════════════════════════════════════════════
           3) タグ（フォルダ分け）
        ════════════════════════════════════════════════════════ */
        const TAGS_KEY = window.CROQUIS_KEYS.TAGS;
        let tagsData = window.CroquisStore.getJSON(TAGS_KEY, {});
        let tagSets = {};
        function rebuildTagSets(){ tagSets = {}; Object.keys(tagsData).forEach(function(t){ tagSets[t] = new Set(tagsData[t]); }); }
        rebuildTagSets();
        function saveTags(){ window.CroquisStore.setJSON(TAGS_KEY, tagsData, 'タグ'); }

        window.croquisTagFilter = null;

        window.toggleTagPanel = function(){
            const p = document.getElementById('tag-panel');
            const opening = !p.classList.contains('open');
            p.classList.toggle('open', opening);
            if (opening) renderTagPanel();
            if (typeof ui !== 'undefined' && ui.managePopup) ui.managePopup.classList.toggle('show', false);
        };
        window.tagCreate = function(){
            const inp = document.getElementById('tag-new-name');
            const name = (inp.value || '').trim();
            if (!name) return;
            if (!tagsData[name]) { tagsData[name] = []; rebuildTagSets(); saveTags(); }
            inp.value = '';
            renderTagPanel();
        };
        window.tagToggleCurrent = function(tag, checked){
            if (images.length === 0) return;
            const fname = images[currentIndex] && images[currentIndex].name;
            if (!fname) return;
            const arr = tagsData[tag] || (tagsData[tag] = []);
            const idx = arr.indexOf(fname);
            if (checked && idx === -1) arr.push(fname);
            if (!checked && idx > -1) arr.splice(idx, 1);
            rebuildTagSets(); saveTags(); renderTagPanel();
        };
        window.tagDelete = function(tag){
            if (!confirm('タグ「' + tag + '」を削除しますか？（画像自体は消えません）')) return;
            delete tagsData[tag]; rebuildTagSets(); saveTags();
            if (croquisTagFilter === tag) tagClearFilter();
            renderTagPanel();
        };
        window.tagApplyFilter = function(tag){
            if (isFavMode) { alert('お気に入りモード中はタグ絞り込みできません。先に「全て」に戻してください。'); return; }
            const set = tagSets[tag];
            if (!set || set.size === 0) { alert('このタグにはまだ画像がありません'); return; }
            const filtered = sourceImages.filter(function(it){ return set.has(it.name); });
            if (filtered.length === 0) { alert('現在読み込まれている画像の中に、このタグの画像がありません'); return; }
            croquisTagFilter = tag;
            images = filtered;
            currentIndex = 0; historyList = [0]; historyPos = 0;
            loadImage(); resetTimer(); updateImageCounter();
            renderTagPanel();
            toggleTagPanel();
        };
        window.tagClearFilter = function(){
            if (!croquisTagFilter) return;
            croquisTagFilter = null;
            if (!isFavMode) {
                images = sourceImages;
                currentIndex = 0; historyList = [0]; historyPos = 0;
                loadImage(); resetTimer(); updateImageCounter();
            }
            renderTagPanel();
        };
        function renderTagPanel(){
            const list = document.getElementById('tag-list');
            const info = document.getElementById('tag-filter-info');
            const fname = (images.length > 0 && images[currentIndex]) ? images[currentIndex].name : null;
            info.textContent = croquisTagFilter
                ? ('絞り込み中: 🏷️ ' + croquisTagFilter + '（' + images.length + '枚）')
                : (fname ? ('現在の画像: ' + fname) : '画像が読み込まれていません');
            const tags = Object.keys(tagsData).sort();
            if (tags.length === 0) { list.innerHTML = '<div style="padding:16px 6px;color:#777;font-size:0.85rem;">まだタグがありません。下の欄から作成できます。<br>タグ＝自分専用フォルダ。「手の練習」「好きなポーズ」など自由に分類できます。</div>'; return; }
            list.innerHTML = '';
            tags.forEach(function(tag){
                const row = document.createElement('div'); row.className = 'tag-row';
                const label = document.createElement('label');
                const cb = document.createElement('input'); cb.type = 'checkbox';
                cb.checked = !!(fname && tagSets[tag] && tagSets[tag].has(fname));
                cb.disabled = !fname;
                cb.addEventListener('change', function(){ tagToggleCurrent(tag, cb.checked); });
                const span = document.createElement('span'); span.textContent = tag;
                label.appendChild(cb); label.appendChild(span);
                const count = document.createElement('span'); count.className = 'tag-count'; count.textContent = (tagsData[tag] || []).length + '枚';
                const fbtn = document.createElement('button'); fbtn.className = 'tag-mini-btn';
                if (croquisTagFilter === tag) { fbtn.textContent = '解除'; fbtn.addEventListener('click', tagClearFilter); }
                else { fbtn.textContent = '絞り込み'; fbtn.addEventListener('click', function(){ tagApplyFilter(tag); }); }
                const dbtn = document.createElement('button'); dbtn.className = 'tag-mini-btn danger'; dbtn.textContent = '削除';
                dbtn.addEventListener('click', function(){ tagDelete(tag); });
                row.appendChild(label); row.appendChild(count); row.appendChild(fbtn); row.appendChild(dbtn);
                list.appendChild(row);
            });
        }

        // タグ絞り込み中はカウンター表示を絞り込み枚数に
        const _origUpdateImageCounter = window.updateImageCounter;
        window.updateImageCounter = function(){
            if (croquisTagFilter && !isFavMode && ui.imageCounter) {
                ui.imageCounter.textContent = (historyPos + 1) + ' / ' + images.length + ' 🏷️';
                return;
            }
            _origUpdateImageCounter();
        };

        /* ════════════════════════════════════════════════════════
           4) オンライン素材ライブラリ
        ════════════════════════════════════════════════════════ */
        const OL_PRESETS = [
            { label: '🧍 人物ポーズ', src: 'commons', q: 'gesture figure pose model' },
            { label: '💃 ダンス・動き', src: 'commons', q: 'ballet dancer performance' },
            { label: '🏃 スポーツ', src: 'commons', q: 'athletics athlete action' },
            { label: '🙂 顔・ポートレート', src: 'commons', q: 'portrait photograph face' },
            { label: '✋ 手', src: 'commons', q: 'human hands close-up' },
            { label: '🗿 彫刻・石膏像', src: 'met', q: 'marble sculpture figure' },
            { label: '✏️ 巨匠の素描', src: 'aic', q: 'figure drawing sketch' },
            { label: '🌊 浮世絵', src: 'met', q: 'ukiyo-e woodblock print' },
            { label: '🖼 名画・油彩', src: 'aic', q: 'painting portrait figure' },
            { label: '🦴 解剖・骨格', src: 'commons', q: 'human anatomy muscles' },
            { label: '🐎 馬', src: 'commons', q: 'horse running' },
            { label: '🐈 動物', src: 'commons', q: 'wildlife animal photography' },
            { label: '🐦 鳥', src: 'commons', q: 'bird flying' },
            { label: '🏞 風景', src: 'commons', q: 'landscape photography mountains' },
            { label: '🍎 静物', src: 'cma', q: 'still life' },
            { label: '🎲 ランダム写真', src: 'picsum', q: '' },
        ];
        let olResults = [];
        let olSelected = new Set();
        let olSearchToken = 0;

        window.toggleOnlinePanel = function(){
            const p = document.getElementById('online-overlay');
            const opening = !p.classList.contains('open');
            p.classList.toggle('open', opening);
            if (opening) {
                if (!navigator.onLine) { olStatus('⚠ オフラインです。オンライン素材はインターネット接続時に利用できます。'); }
                else if (olResults.length === 0) { olStatus('カテゴリを選ぶか、キーワードで検索してください（個人の練習用途を想定。素材の利用条件は各提供元に従ってください）'); }
                if (document.getElementById('online-cats').children.length === 0) olBuildCats();
            }
        };
        function olBuildCats(){
            const wrap = document.getElementById('online-cats');
            OL_PRESETS.forEach(function(p){
                const b = document.createElement('button'); b.className = 'panel-chip'; b.textContent = p.label;
                b.addEventListener('click', function(){
                    document.getElementById('online-source').value = (p.src === 'picsum') ? 'commons' : p.src;
                    document.getElementById('online-query').value = p.q;
                    if (p.src === 'picsum') olLoadPicsum(); else olSearch();
                });
                wrap.appendChild(b);
            });
        }
        function olStatus(msg){ document.getElementById('online-status').textContent = msg || ''; }
        function olRenderGrid(){
            const grid = document.getElementById('online-grid');
            grid.innerHTML = '';
            olResults.forEach(function(r, i){
                const d = document.createElement('div'); d.className = 'ol-thumb' + (olSelected.has(i) ? ' sel' : '');
                const img = document.createElement('img'); img.loading = 'lazy'; img.decoding = 'async'; img.src = r.thumb; img.alt = '';
                img.onerror = function(){ d.style.display = 'none'; };
                d.appendChild(img);
                d.addEventListener('click', function(){
                    if (olSelected.has(i)) olSelected.delete(i); else olSelected.add(i);
                    d.classList.toggle('sel', olSelected.has(i));
                    olUpdateSelCount();
                });
                grid.appendChild(d);
            });
            olUpdateSelCount();
        }
        function olUpdateSelCount(){ document.getElementById('online-sel-count').textContent = olSelected.size + '枚 選択中'; }
        window.olSelectAll = function(){
            if (olSelected.size === olResults.length) olSelected.clear();
            else { olSelected.clear(); olResults.forEach(function(_, i){ olSelected.add(i); }); }
            olRenderGrid();
        };

        window.olSearch = async function(){
            const q = (document.getElementById('online-query').value || '').trim();
            const src = document.getElementById('online-source').value;
            if (!q) { olStatus('キーワードを入力してください'); return; }
            if (!navigator.onLine) { olStatus('⚠ オフラインのため検索できません'); return; }
            const token = ++olSearchToken;
            olSelected.clear(); olResults = []; olRenderGrid();
            olStatus('検索中…');
            try {
                let results = [];
                if (src === 'met') results = await olFetchMet(q);
                else if (src === 'aic') results = await olFetchAic(q);
                else if (src === 'cma') results = await olFetchCma(q);
                else results = await olFetchCommons(q);
                if (token !== olSearchToken) return;
                olResults = results;
                olResults.forEach(function(_, i){ olSelected.add(i); }); // デフォルト全選択
                olRenderGrid();
                olStatus(results.length > 0 ? (results.length + '枚 見つかりました（タップで選択を切り替え）') : '見つかりませんでした。別のキーワードを試してください（英語推奨）');
            } catch (e) {
                if (token !== olSearchToken) return;
                olStatus('⚠ 取得に失敗しました。通信環境を確認してもう一度お試しください。');
            }
        };

        async function olFetchCommons(q){
            const url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*'
                + '&generator=search&gsrsearch=' + encodeURIComponent(q)
                + '&gsrnamespace=6&gsrlimit=40&prop=imageinfo&iiprop=url|mime&iiurlwidth=1280';
            const res = await fetch(url);
            const data = await res.json();
            const pages = (data.query && data.query.pages) ? Object.values(data.query.pages) : [];
            const out = [];
            pages.forEach(function(p){
                const ii = p.imageinfo && p.imageinfo[0];
                if (!ii) return;
                if (ii.mime !== 'image/jpeg' && ii.mime !== 'image/png') return;
                const full = ii.thumburl || ii.url;
                if (!full) return;
                out.push({ name: 'web_' + (p.title || ('commons_' + p.pageid)).replace(/^File:/, ''), url: full, thumb: ii.thumburl || full, cors: true });
            });
            return out;
        }

        async function olFetchMet(q){
            const sres = await fetch('https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=' + encodeURIComponent(q));
            const sdata = await sres.json();
            const ids = (sdata.objectIDs || []).slice(0, 30);
            const out = [];
            // 10件ずつ並列取得
            for (let i = 0; i < ids.length; i += 10) {
                const chunk = ids.slice(i, i + 10);
                const settled = await Promise.allSettled(chunk.map(function(id){
                    return fetch('https://collectionapi.metmuseum.org/public/collection/v1/objects/' + id).then(function(r){ return r.json(); });
                }));
                settled.forEach(function(s){
                    if (s.status !== 'fulfilled') return;
                    const o = s.value;
                    const img = o && (o.primaryImageSmall || o.primaryImage);
                    if (!img) return;
                    out.push({ name: 'web_met_' + o.objectID + '_' + (o.title || '').slice(0, 40), url: img, thumb: o.primaryImageSmall || img, cors: true });
                });
                if (out.length >= 24) break;
            }
            return out;
        }

        async function olFetchAic(q){
            const u = 'https://api.artic.edu/api/v1/artworks/search?q=' + encodeURIComponent(q) + '&limit=40&fields=id,title,image_id';
            const d = await (await fetch(u)).json();
            return (d.data || []).filter(function(a){ return a.image_id; }).map(function(a){
                return { name: 'web_aic_' + a.id, cors: true,
                    url:   'https://www.artic.edu/iiif/2/' + a.image_id + '/full/843,/0/default.jpg',
                    thumb: 'https://www.artic.edu/iiif/2/' + a.image_id + '/full/400,/0/default.jpg' };
            });
        }

        async function olFetchCma(q){
            const u = 'https://openaccess-api.clevelandart.org/api/artworks/?q=' + encodeURIComponent(q) + '&has_image=1&limit=40';
            const d = await (await fetch(u)).json();
            return (d.data || []).filter(function(a){ return a.images && a.images.web && a.images.web.url; }).map(function(a){
                return { name: 'web_cma_' + a.id, url: a.images.web.url, thumb: a.images.web.url, cors: true };
            });
        }

        function olLoadPicsum(){
            if (!navigator.onLine) { olStatus('⚠ オフラインのため取得できません'); return; }
            olSelected.clear(); olResults = [];
            for (let i = 0; i < 24; i++) {
                const seed = Math.random().toString(36).slice(2, 10);
                olResults.push({
                    name: 'web_random_' + seed,
                    url:  'https://picsum.photos/seed/' + seed + '/1200/1500',
                    thumb:'https://picsum.photos/seed/' + seed + '/300/375',
                    cors: true
                });
            }
            olResults.forEach(function(_, i){ olSelected.add(i); });
            olRenderGrid();
            olStatus('ランダム写真 24枚（もう一度押すと別の写真になります）');
        }

        window.olApply = function(replace){
            const items = [];
            olSelected.forEach(function(i){
                const r = olResults[i]; if (!r) return;
                items.push({ name: r.name, data: r.url, cors: !!r.cors, online: true });
            });
            if (items.length === 0) { olStatus('画像が選択されていません'); return; }
            croquisTagFilter = null;
            if (replace || sourceImages.length === 0) {
                applyLoadedFiles(items);
            } else {
                items.forEach(function(it){ sourceImages.push(it); originalOrder.push(it); });
                if (!isFavMode) images = sourceImages;
                updateImageCounter();
                if (typeof updatePreloadQueue === 'function') updatePreloadQueue();
            }
            toggleOnlinePanel();
        };

        /* ════════════════════════════════════════════════════════
           5) スケッチ v4 — 左右分割模写 / 記憶モード / 半透明青鉛筆
              2本指タップ=元に戻す（やり直しはツールバーのボタン）
        ════════════════════════════════════════════════════════ */
        const skOverlay   = document.getElementById('sketch-overlay');
        const skStage     = document.getElementById('sketch-stage');
        const skImg       = document.getElementById('sketch-img');
        const skCanvas    = document.getElementById('sketch-canvas');
        const skLive      = document.getElementById('sketch-live');
        const skCtx       = skCanvas.getContext('2d');
        const skLiveCtx   = skLive.getContext('2d');
        const skCountdown = document.getElementById('sketch-countdown');
        const skMsgEl     = document.getElementById('sketch-msg');
        let skOpen = false, skDrawing = false, skEraser = false;
        let skColor = '#ff4d5e', skAlpha = 1, skLiveActive = false;
        let skLastX = 0, skLastY = 0;
        let skUndoStack = [], skRedoStack = [], skRedoBackup = [];
        let skMemTimer = null, skState = 'free';
        let skImgOpacity = 0.5, skWasRunning = false;
        let skSide = window.CroquisStore.getRaw(window.CROQUIS_KEYS.SKETCH_SIDE) === '1';
        let skCW = 0, skCH = 0, skLeft = 0; // 描画キャンバスのCSSサイズと左位置（直前の値）
        let skFormenOn = false, skFormenIdx = 0, skFormenPrevSide = false, skFormenOpacity = 0.6;
        let skFormenBackup = null, skFormenBackupW = 0, skFormenBackupH = 0, skFormenBackupLeft = 0;
        let skRefOverride = false, skRefObjUrl = null; // 参考画像の手動指定（URL/貼り付け/D&D）
        const skFormenSvg = document.getElementById('sketch-formen');

        function skShowMsg(t){ if (!t) { skMsgEl.style.display = 'none'; return; } skMsgEl.textContent = t; skMsgEl.style.display = 'block'; }

        window.toggleSketch = function(){
            skOpen = !skOpen;
            skOverlay.classList.toggle('open', skOpen);
            if (skOpen) {
                if (images.length === 0) { alert('先に画像を読み込んでください（フォルダ / 画像 / オンライン素材）'); skOpen = false; skOverlay.classList.remove('open'); return; }
                skWasRunning = isRunning;
                if (isRunning) stopTimer();
                skApplyLayout(false);
                skSyncImage();
                skResize(true);
                skSetState('free');
                skShowMsg(skSide ? '左の画像を見ながら右に描けます（模写）' : 'そのまま上から描けます。「記憶モード」で見る→隠す→描く');
                setTimeout(function(){ skShowMsg(''); }, 4000);
            } else {
                skCancelMemory();
                if (skFormenOn) skSetFormen(false);
                skClearRef();
                if (skWasRunning) startTimer();
            }
        };

        window.skToggleLayout = function(){
            skSide = !skSide;
            window.CroquisStore.setRaw(window.CROQUIS_KEYS.SKETCH_SIDE, skSide ? '1' : '0', 'スケッチ表示位置');
            skApplyLayout(true);
        };
        function skApplyLayout(preserve){
            skOverlay.classList.toggle('side', skSide);
            const b = document.getElementById('sketch-layout-btn');
            if (b) b.textContent = skSide ? '⬒ 重ねる' : '⬓ 並べる';
            skResize(!preserve);
        }
        window.skToggleTools = function(){
            skOverlay.classList.toggle('tools-hidden');
            skResize(false);
        };

        function skSyncImage(){
            if (skRefOverride) return; // 参考画像を手動指定中はプール画像で上書きしない
            const co = ui.img.getAttribute('crossorigin');
            if (co) skImg.setAttribute('crossorigin', co); else skImg.removeAttribute('crossorigin');
            skImg.src = ui.img.src || '';
            let t = '';
            if (settings.flipH) t += 'scaleX(-1) ';
            if (settings.flipV) t += 'scaleY(-1) ';
            skImg.style.transform = t;
        }
        ui.img.addEventListener('load', function(){ if (skOpen) skSyncImage(); });

        function skResize(clear){
            const r = skStage.getBoundingClientRect();
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            // 直前のレイアウト（並べる⇔重ねる切替時に、描いた線を元の大きさ・位置のまま引き継ぐため控える）
            const prevCW = skCW, prevCH = skCH, prevLeft = skLeft;
            const newCW = skSide ? Math.floor(r.width / 2) : Math.floor(r.width);
            const newCH = Math.floor(r.height);
            const newLeft = skSide ? (Math.floor(r.width) - newCW) : 0;
            let saved = null;
            if (!clear && skCanvas.width > 0) {
                try { saved = skCanvas.toDataURL(); } catch(e){ console.warn("croquis: 描画の読み取りに失敗", e); }
            }
            skCW = newCW; skCH = newCH; skLeft = newLeft;
            [skCanvas, skLive].forEach(function(cv){
                cv.width  = Math.max(1, Math.round(skCW * dpr));
                cv.height = Math.max(1, Math.round(skCH * dpr));
                cv.style.left   = newLeft + 'px';
                cv.style.top    = '0px';
                cv.style.width  = skCW + 'px';
                cv.style.height = skCH + 'px';
            });
            skCtx.setTransform(dpr, 0, 0, dpr, 0, 0);     skCtx.lineCap = 'round';     skCtx.lineJoin = 'round';
            skLiveCtx.setTransform(dpr, 0, 0, dpr, 0, 0); skLiveCtx.lineCap = 'round'; skLiveCtx.lineJoin = 'round';
            if (clear) { skUndoStack = []; skRedoStack = []; }
            else if (saved) {
                // 拡大縮小せず、画面上の同じ位置に線を戻す（以前は新サイズに引き伸ばしていたため横に広がっていた）
                const dx = prevLeft - newLeft;
                const im = new Image();
                im.onload = function(){ skCtx.drawImage(im, dx, 0, prevCW, prevCH); };
                im.src = saved;
            }
        }
        window.addEventListener('resize', function(){ if (skOpen) { skResize(false); if (skFormenOn) fmRender(); } });

        function skSetState(st){
            skState = st;
            const memBtn    = document.getElementById('sketch-mem-btn');
            const peekBtn   = document.getElementById('sketch-peek-btn');
            const revealBtn = document.getElementById('sketch-reveal-btn');
            const opWrap    = document.getElementById('sketch-imgopacity-wrap');
            skCountdown.style.display = 'none';
            if (st === 'free') {
                skImg.style.visibility = 'visible'; skImg.style.opacity = '1';
                memBtn.style.display = ''; peekBtn.style.display = 'none'; revealBtn.style.display = 'none'; opWrap.style.display = 'none';
            } else if (st === 'memorize') {
                skImg.style.visibility = 'visible'; skImg.style.opacity = '1';
                memBtn.style.display = 'none'; peekBtn.style.display = 'none'; revealBtn.style.display = 'none'; opWrap.style.display = 'none';
            } else if (st === 'hidden') {
                skImg.style.visibility = 'visible'; skImg.style.opacity = '0';
                memBtn.style.display = 'none'; peekBtn.style.display = ''; revealBtn.style.display = ''; revealBtn.textContent = '✅ 答え合わせ'; opWrap.style.display = 'none';
            } else if (st === 'reveal') {
                skImg.style.visibility = 'visible'; skImg.style.opacity = String(skImgOpacity);
                memBtn.style.display = 'none'; peekBtn.style.display = ''; revealBtn.style.display = ''; revealBtn.textContent = '🙈 また隠す'; opWrap.style.display = 'flex';
            }
        }

        window.skStartMemory = function(){
            skCancelMemory();
            skClearSilent();
            let sec = parseInt(document.getElementById('sketch-memsec').value, 10) || 5;
            skSetState('memorize');
            skShowMsg('よく見て覚えてください…');
            skCountdown.style.display = 'block'; skCountdown.textContent = sec;
            skMemTimer = setInterval(function(){
                sec--;
                if (sec <= 0) {
                    skCancelMemory();
                    skSetState('hidden');
                    skShowMsg('記憶を頼りに描いてみよう！描けたら「答え合わせ」');
                    setTimeout(function(){ skShowMsg(''); }, 3500);
                } else { skCountdown.textContent = sec; }
            }, 1000);
        };
        function skCancelMemory(){ if (skMemTimer) { clearInterval(skMemTimer); skMemTimer = null; } skCountdown.style.display = 'none'; }
        window.skPeek = function(){
            if (skState !== 'hidden') return;
            skImg.style.opacity = '1';
            setTimeout(function(){ if (skState === 'hidden') { skImg.style.opacity = '0'; } }, 1000);
        };
        window.skToggleReveal = function(){
            if (skState === 'hidden') { skSetState('reveal'); skShowMsg('自分の線と見比べてみよう'); setTimeout(function(){ skShowMsg(''); }, 2500); }
            else if (skState === 'reveal') skSetState('hidden');
        };
        window.skSetImgOpacity = function(v){ skImgOpacity = Math.max(0.1, Math.min(1, v / 100)); if (skState === 'reveal') skImg.style.opacity = String(skImgOpacity); };
        window.skNextImage = function(){
            skCancelMemory();
            if (skFormenOn) skSetFormen(false);
            skClearRef();        // 参考画像の上書きを解除してプールに戻す
            nextImage();
            skSyncImage();
            skClearSilent();
            skSetState('free');
        };

        /* ── 取り消し / やり直し ── */
        function skSnap(){ try { return skCanvas.toDataURL(); } catch(_) { return null; } }
        function skRestore(data){
            skCtx.clearRect(0, 0, skCW, skCH);
            if (data) { const im = new Image(); im.onload = function(){ skCtx.drawImage(im, 0, 0, skCW, skCH); }; im.src = data; }
        }
        function skPushUndo(){
            const d = skSnap(); if (d === null) return;
            skUndoStack.push(d);
            if (skUndoStack.length > 20) skUndoStack.shift();
        }
        window.skUndo = function(){
            if (!skUndoStack.length) return;
            const d = skSnap(); if (d !== null) { skRedoStack.push(d); if (skRedoStack.length > 20) skRedoStack.shift(); }
            skRestore(skUndoStack.pop());
        };
        window.skRedo = function(){
            if (!skRedoStack.length) return;
            const d = skSnap(); if (d !== null) skUndoStack.push(d);
            skRestore(skRedoStack.pop());
        };
        function skClearSilent(){ skCtx.clearRect(0, 0, skCW, skCH); skLiveCtx.clearRect(0, 0, skCW, skCH); skUndoStack = []; skRedoStack = []; }
        window.skClear = function(){ skPushUndo(); skRedoStack = []; skCtx.clearRect(0, 0, skCW, skCH); };
        window.skToggleEraser = function(){
            skEraser = !skEraser;
            document.getElementById('sketch-eraser-btn').classList.toggle('accent', skEraser);
        };
        document.querySelectorAll('.sk-color').forEach(function(b){
            b.addEventListener('click', function(){
                document.querySelectorAll('.sk-color').forEach(function(x){ x.classList.remove('on'); });
                b.classList.add('on');
                skColor = b.getAttribute('data-c');
                skAlpha = parseFloat(b.getAttribute('data-a') || '1');
                if (skEraser) skToggleEraser();
            });
        });

        /* ── 描画本体（半透明ペンはライブレイヤーに描き、ストローク確定時に合成） ── */
        function skPos(e){
            const r = skCanvas.getBoundingClientRect();
            return { x: e.clientX - r.left, y: e.clientY - r.top };
        }
        function skTargetCtx(){ return (skLiveActive ? skLiveCtx : skCtx); }
        function skBeginStroke(e){
            skPushUndo(); skRedoBackup = skRedoStack; skRedoStack = [];
            skDrawing = true;
            skLiveActive = (!skEraser && skAlpha < 1);
            if (skLiveActive) { skLiveCtx.clearRect(0, 0, skCW, skCH); skLive.style.opacity = String(skAlpha); }
            const c = skTargetCtx();
            const p = skPos(e); skLastX = p.x; skLastY = p.y;
            c.globalCompositeOperation = skEraser ? 'destination-out' : 'source-over';
            c.strokeStyle = skColor;
            const size = parseInt(document.getElementById('sketch-size').value, 10) || 5;
            c.lineWidth = skEraser ? size * 3 : size;
            c.beginPath();
            c.moveTo(p.x, p.y);
            c.lineTo(p.x + 0.01, p.y + 0.01);
            c.stroke();
        }
        function skStrokeMove(e){
            const c = skTargetCtx();
            const events = (typeof e.getCoalescedEvents === 'function') ? e.getCoalescedEvents() : [e];
            c.globalCompositeOperation = skEraser ? 'destination-out' : 'source-over';
            c.strokeStyle = skColor;
            const size = parseInt(document.getElementById('sketch-size').value, 10) || 5;
            for (let i = 0; i < events.length; i++) {
                const p = skPos(events[i]);
                const pw = (events[i].pointerType === 'pen' && events[i].pressure > 0) ? (0.4 + events[i].pressure * 1.2) : 1;
                c.lineWidth = (skEraser ? size * 3 : size) * pw;
                const midX = (skLastX + p.x) / 2, midY = (skLastY + p.y) / 2;
                c.beginPath();
                c.moveTo(skLastX, skLastY);
                c.quadraticCurveTo(skLastX, skLastY, midX, midY);
                c.lineTo(p.x, p.y);
                c.stroke();
                skLastX = p.x; skLastY = p.y;
            }
        }
        function skEndStroke(){
            if (!skDrawing) return;
            skDrawing = false;
            if (skLiveActive) {
                skCtx.globalCompositeOperation = 'source-over';
                skCtx.globalAlpha = skAlpha;
                try { skCtx.drawImage(skLive, 0, 0, skCW, skCH); } catch(e){ console.warn("croquis: 描画の合成に失敗", e); }
                skCtx.globalAlpha = 1;
                skLiveCtx.clearRect(0, 0, skCW, skCH);
                skLive.style.opacity = '1';
                skLiveActive = false;
            }
        }
        function skCancelStroke(){
            if (!skDrawing) return;
            skDrawing = false;
            skRedoStack = skRedoBackup; // 描き始めで消したやり直し履歴を復元（2/3本指ジェスチャー時）
            if (skLiveActive) {
                skLiveCtx.clearRect(0, 0, skCW, skCH);
                skLive.style.opacity = '1';
                skLiveActive = false;
                skUndoStack.pop(); // ストローク開始時のスナップは不要（本体未変更）
            } else {
                skRestore(skUndoStack.pop()); // 描きかけを破棄して開始前の状態へ
            }
        }

        /* ── 描画（ペン/マウス/1本指）はポインタイベントで処理 ── */
        const skTouches = new Map();
        skCanvas.addEventListener('pointerdown', function(e){
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            e.preventDefault();
            try { skCanvas.setPointerCapture(e.pointerId); } catch(_){ /* 一部ブラウザ非対応でも無害なため無視 */ }
            if (e.pointerType === 'touch') {
                skTouches.set(e.pointerId, true);
                if (skTouches.size === 1) skBeginStroke(e);
                else skCancelStroke(); // 2本目以降 → 描きかけ取消（本数判定はtouchイベント側）
                return;
            }
            skBeginStroke(e); // ペン / マウス
        }, { passive: false });
        skCanvas.addEventListener('pointermove', function(e){
            if (e.pointerType === 'touch' && skTouches.size > 1) return; // ジェスチャ中は描かない
            if (!skDrawing) return;
            e.preventDefault();
            skStrokeMove(e);
        }, { passive: false });
        function skPointerEnd(e){
            if (e.pointerType === 'touch') skTouches.delete(e.pointerId);
            skEndStroke();
        }
        skCanvas.addEventListener('pointerup', skPointerEnd, { passive: true });
        skCanvas.addEventListener('pointercancel', function(e){
            if (e.pointerType === 'touch') skTouches.delete(e.pointerId);
            skCancelStroke();
        }, { passive: true });

        /* ── 指のジェスチャ判定（タッチイベントで本数を数える）──
           2本指タップ = 元に戻す（やり直しはツールバーのボタン / Ctrl+Shift+Z を使用）
           ※ setPointerCapture方式だと一部スマホで本数を取りこぼすため touches.length を正とする */
        let gFingerMax = 0, gStart = 0, gMoved = false, gStartX = 0, gStartY = 0;
        skCanvas.addEventListener('touchstart', function(e){
            const n = e.touches.length;
            if (n > gFingerMax) gFingerMax = n;
            if (n === 1) {
                gStart = Date.now(); gMoved = false;
                gStartX = e.touches[0].clientX; gStartY = e.touches[0].clientY;
            } else {
                e.preventDefault();   // 2本指以上はジェスチャ。既定動作を抑止
                skCancelStroke();
            }
        }, { passive: false });
        skCanvas.addEventListener('touchmove', function(e){
            if (e.touches.length >= 1) {
                const dx = e.touches[0].clientX - gStartX, dy = e.touches[0].clientY - gStartY;
                if (Math.hypot(dx, dy) > 16) gMoved = true;
            }
            if (e.touches.length >= 2) e.preventDefault();
        }, { passive: false });
        function skGestureEnd(e){
            if (e.touches.length > 0) return;   // まだ指が残っている
            const n = gFingerMax, dur = Date.now() - gStart;
            gFingerMax = 0;
            if (n === 2 && !gMoved && dur < 900) {
                skUndo(); skShowMsg('↩ 元に戻す');
                setTimeout(function(){ skShowMsg(''); }, 800);
            }
        }
        skCanvas.addEventListener('touchend', skGestureEnd, { passive: false });
        skCanvas.addEventListener('touchcancel', skGestureEnd, { passive: false });
        // iOSの長押し選択メニュー・コンテキストメニューを抑制
        skCanvas.addEventListener('contextmenu', function(e){ e.preventDefault(); }, { passive: false });
        skCanvas.addEventListener('selectstart', function(e){ e.preventDefault(); }, { passive: false });
        document.getElementById('sketch-stage').addEventListener('contextmenu', function(e){ e.preventDefault(); }, { passive: false });

        /* ── 保存（レイアウトに応じて合成） ── */
        window.skSave = function(){
            const r = skStage.getBoundingClientRect();
            const out = document.createElement('canvas');
            out.width = Math.round(r.width * 2); out.height = Math.round(r.height * 2);
            const c = out.getContext('2d');
            c.fillStyle = '#1e1e1e'; c.fillRect(0, 0, out.width, out.height);
            const imgAreaW = skSide ? out.width / 2 : out.width;
            const cvX = skSide ? out.width / 2 : 0;
            try {
                if (skImg.style.visibility !== 'hidden' && skImg.naturalWidth > 0) {
                    const ratio = Math.min(imgAreaW / skImg.naturalWidth, out.height / skImg.naturalHeight);
                    const w = skImg.naturalWidth * ratio, h = skImg.naturalHeight * ratio;
                    c.globalAlpha = parseFloat(skImg.style.opacity || '1') || 1;
                    c.save();
                    c.translate(imgAreaW / 2, out.height / 2);
                    if (settings.flipH) c.scale(-1, 1);
                    if (settings.flipV) c.scale(1, -1);
                    c.drawImage(skImg, -w / 2, -h / 2, w, h);
                    c.restore();
                    c.globalAlpha = 1;
                }
            } catch(_){ /* CORS不可画像は描画スキップ */ }
            try {
                c.drawImage(skCanvas, cvX, 0, skSide ? out.width / 2 : out.width, out.height);
                const a = document.createElement('a');
                a.download = 'croquis_sketch_' + Date.now() + '.png';
                a.href = out.toDataURL('image/png');
                a.click();
            } catch(_) {
                alert('この画像は保存に対応していません（外部画像の制限）。描画のみ保存します。');
                try {
                    const a = document.createElement('a');
                    a.download = 'croquis_sketch_' + Date.now() + '.png';
                    a.href = skCanvas.toDataURL('image/png');
                    a.click();
                } catch(e){ console.warn("croquis: スケッチ保存に失敗", e); }
            }
        };

        /* ════════════════════════════════════════════════════════
           5b) ウォームアップ — 一筆書き（フォルメン線描）のお題
              画面いっぱいにお題を薄く表示し、その上をなぞって練習する。
              全パターンが「一筆書き」できる連続した線で構成されている。
        ════════════════════════════════════════════════════════ */
        function fmMargin(W, H){ return Math.min(W, H) * 0.10; }
        // ① 大きなうねり波
        function fmWave(W, H){
            const m = fmMargin(W, H), x0 = m, x1 = W - m, cy = H / 2, amp = (H / 2 - m) * 0.82;
            const cycles = 3.5, N = 320, P = [];
            for (let i = 0; i <= N; i++){ const t = i / N; P.push({ x: x0 + (x1 - x0) * t, y: cy - Math.sin(t * cycles * Math.PI * 2) * amp }); }
            return P;
        }
        // ② 連続ループ（コイル）
        function fmLoops(W, H){
            const m = fmMargin(W, H), x0 = m, x1 = W - m, cy = H / 2, R = (H / 2 - m) * 0.80;
            const loops = 4, total = loops * Math.PI * 2, a = (x1 - x0) / total, N = 520, P = [];
            for (let i = 0; i <= N; i++){ const th = total * i / N; P.push({ x: x0 + a * th - R * Math.sin(th), y: cy - R * Math.cos(th) }); }
            return P;
        }
        // ③ 八の字（∞）
        function fmEight(W, H){
            const m = fmMargin(W, H), cx = W / 2, cy = H / 2, A = (W / 2 - m) * 0.94, B = (H / 2 - m) * 0.94;
            const N = 320, P = [];
            for (let i = 0; i <= N; i++){ const t = i / N * Math.PI * 2; P.push({ x: cx + A * Math.sin(t), y: cy + B * Math.sin(t) * Math.cos(t) }); }
            return P;
        }
        // ④ 渦巻き
        function fmSpiral(W, H){
            const m = fmMargin(W, H), cx = W / 2, cy = H / 2, Rmax = Math.min(W, H) / 2 - m;
            const turns = 4, total = turns * Math.PI * 2, N = 520, P = [];
            for (let i = 0; i <= N; i++){ const t = i / N, th = total * t, r = Rmax * t; P.push({ x: cx + r * Math.cos(th), y: cy + r * Math.sin(th) }); }
            return P;
        }
        // ⑤ 山なみ（連続アーチ）
        function fmArches(W, H){
            const m = fmMargin(W, H), x0 = m, x1 = W - m, r = (H / 2 - m) * 0.80, baseY = H / 2 + (H / 2 - m) * 0.5;
            const n = Math.max(2, Math.round((x1 - x0) / (r * 2))), aw = (x1 - x0) / n, seg = 48, P = [];
            for (let k = 0; k < n; k++){
                const cx = x0 + aw * (k + 0.5);
                for (let i = 0; i <= seg; i++){ const ang = Math.PI - Math.PI * i / seg; P.push({ x: cx + (aw / 2) * Math.cos(ang), y: baseY - r * Math.sin(ang) }); }
            }
            return P;
        }
        // ⑥ ジグザグ
        function fmZig(W, H){
            const m = fmMargin(W, H), x0 = m, x1 = W - m, cy = H / 2, amp = (H / 2 - m) * 0.80, n = 7;
            const aw = (x1 - x0) / n, P = [];
            for (let k = 0; k <= n; k++){ P.push({ x: x0 + aw * k, y: cy + (k % 2 === 0 ? -amp : amp) }); }
            return P;
        }
        // ⑦ 花びら（バラ曲線・5枚）
        function fmRose(W, H){
            const m = fmMargin(W, H), cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - m, k = 5, N = 540, P = [];
            for (let i = 0; i <= N; i++){ const th = i / N * Math.PI * 2, r = R * Math.cos(k * th); P.push({ x: cx + r * Math.cos(th), y: cy + r * Math.sin(th) }); }
            return P;
        }
        const FM_PATTERNS = [
            { name: 'うねり波',   gen: fmWave },
            { name: '連続ループ', gen: fmLoops },
            { name: '八の字（∞）', gen: fmEight },
            { name: '渦巻き',     gen: fmSpiral },
            { name: '山なみ',     gen: fmArches },
            { name: 'ジグザグ',   gen: fmZig },
            { name: '花びら',     gen: fmRose },
        ];
        function fmRender(){
            if (!skFormenOn || !skFormenSvg) return;
            const r = skStage.getBoundingClientRect();
            const W = Math.max(1, r.width), H = Math.max(1, r.height);
            const pat = FM_PATTERNS[skFormenIdx];
            const pts = pat.gen(W, H);
            const sw = Math.max(2.5, Math.min(W, H) * 0.007);
            const dotR = Math.max(5, Math.min(W, H) * 0.014);
            let d = 'M' + pts[0].x.toFixed(1) + ' ' + pts[0].y.toFixed(1);
            for (let i = 1; i < pts.length; i++) d += 'L' + pts[i].x.toFixed(1) + ' ' + pts[i].y.toFixed(1);
            const stroke = 'rgba(0,212,255,' + skFormenOpacity.toFixed(2) + ')';
            skFormenSvg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
            skFormenSvg.innerHTML =
                '<path d="' + d + '" fill="none" stroke="' + stroke + '" stroke-width="' + sw.toFixed(2) +
                '" stroke-linecap="round" stroke-linejoin="round"/>' +
                '<circle cx="' + pts[0].x.toFixed(1) + '" cy="' + pts[0].y.toFixed(1) + '" r="' + dotR.toFixed(1) +
                '" fill="#39e07a" stroke="#0b3" stroke-width="1.5"/>';   // 緑の●＝描き始め
            const nm = document.getElementById('sketch-formen-name'); if (nm) nm.textContent = pat.name;
            const op = document.getElementById('sketch-formen-op'); if (op) op.value = String(Math.round(skFormenOpacity * 100));
        }
        function skSetFormen(on){
            const bar = document.getElementById('sketch-formen-bar');
            const btn = document.getElementById('sketch-formen-btn');
            const mem = document.getElementById('sketch-mem-btn');
            const sec = document.getElementById('sketch-memsec');
            if (on === skFormenOn) { if (on) fmRender(); return; }
            skFormenOn = on;
            if (on) {
                // 直前の描画（模写など）を退避し、なぞり用にキャンバスを空にする（終了時に復元）
                try { skFormenBackup = (skCanvas.width > 0) ? skCanvas.toDataURL() : null; } catch(_){ skFormenBackup = null; }
                skFormenBackupW = skCW; skFormenBackupH = skCH; skFormenBackupLeft = skLeft;
                skFormenPrevSide = skSide;
                if (skSide) { skSide = false; skApplyLayout(true); } // ウォームアップは全画面で
                skImg.style.visibility = 'hidden';                  // 参考画像は隠す
                skClearSilent();
                if (mem) mem.style.display = 'none';
                if (sec) sec.style.display = 'none';
                if (skFormenSvg) skFormenSvg.style.display = 'block';
                if (bar) bar.style.display = 'flex';
                if (btn) btn.classList.add('accent');
                fmRender();
                skShowMsg('緑の●から一筆書きでなぞってウォームアップ！「↻ 別の形」で切替');
                setTimeout(function(){ skShowMsg(''); }, 4200);
            } else {
                if (skFormenSvg) skFormenSvg.style.display = 'none';
                if (bar) bar.style.display = 'none';
                if (btn) btn.classList.remove('accent');
                if (mem) mem.style.display = '';
                if (sec) sec.style.display = '';
                skImg.style.visibility = '';
                if (skFormenPrevSide && !skSide) { skSide = true; skApplyLayout(true); }
                // なぞり描きを消して、退避していた描画を元の大きさ・位置で戻す
                skCtx.clearRect(0, 0, skCW, skCH); skUndoStack = []; skRedoStack = [];
                if (skFormenBackup) {
                    const data = skFormenBackup, bw = skFormenBackupW, bh = skFormenBackupH, bleft = skFormenBackupLeft;
                    const im = new Image();
                    im.onload = function(){ skCtx.drawImage(im, bleft - skLeft, 0, bw, bh); };
                    im.src = data;
                    skFormenBackup = null;
                }
                skSetState('free'); // 参考画像の表示状態を元に戻す
            }
        }
        window.skToggleFormen = function(){ skSetFormen(!skFormenOn); };
        window.skFormenNext = function(){ skFormenIdx = (skFormenIdx + 1) % FM_PATTERNS.length; skClearSilent(); fmRender(); };
        window.skSetFormenOpacity = function(v){ skFormenOpacity = Math.max(0.1, Math.min(1, (parseInt(v, 10) || 60) / 100)); fmRender(); };

        /* ════════════════════════════════════════════════════════
           5c) 参考画像を描画モードに直接表示
              URL貼り付け / コピー＆ペースト(Ctrl+V) / ドラッグ＆ドロップ。
              Pinterest等は画像を「コピー」または「画像アドレスをコピー」して
              この画面に貼り付け or ドロップするだけで参考表示できる。
        ════════════════════════════════════════════════════════ */
        const SK_CORS_HOSTS = /(^|\.)pinimg\.com$|(^|\.)wikimedia\.org$|(^|\.)metmuseum\.org$|(^|\.)artic\.edu$|(^|\.)clevelandart\.org$|(^|\.)picsum\.photos$/;
        function skClearRef(){
            skRefOverride = false;
            skImg.onerror = null;
            if (skRefObjUrl) { try { URL.revokeObjectURL(skRefObjUrl); } catch(_){ } skRefObjUrl = null; }
        }
        function skFlash(msg, ms){ skShowMsg(msg); setTimeout(function(){ skShowMsg(''); }, ms || 2200); }
        function skApplyRef(src, isObjUrl, host){
            skClearRef();
            skRefOverride = true;
            if (isObjUrl) skRefObjUrl = src;
            if (host && SK_CORS_HOSTS.test(host)) skImg.setAttribute('crossorigin', 'anonymous');
            else skImg.removeAttribute('crossorigin');
            skImg.onerror = function(){ skImg.onerror = null; skClearRef(); skFlash('この画像は表示できませんでした（URLを確認、または画像を直接コピー＆ペーストしてみてください）', 4200); };
            skImg.style.transform = '';
            skImg.src = src;
            if (skFormenOn) skSetFormen(false);
            skSetState('free');
            skFlash('参考画像を表示しました', 2000);
        }
        function skSetRefUrl(u){
            u = String(u || '').trim();
            if (!/^https?:\/\//.test(u)) { skFlash('http(s) で始まる画像URLを貼り付けてください', 2600); return; }
            u = u.replace(/(pinimg\.com\/)\d+x(\/)/, '$1736x$2'); // Pinterestサムネを大きいサイズに
            let host = ''; try { host = new URL(u).hostname; } catch(_){ }
            skApplyRef(u, false, host);
        }
        function skSetRefFile(f){
            if (!f || (f.type || '').indexOf('image') !== 0) return;
            skApplyRef(URL.createObjectURL(f), true, '');
        }
        window.skLoadRef = function(){
            const u = prompt('参考にしたい画像のURLを貼り付けてください\n（Pinterest等は画像を右クリック →「画像アドレスをコピー」）\n\n※ 画像を直接コピーして Ctrl+V で貼り付け、または画面へドラッグ＆ドロップでもOK');
            if (u) skSetRefUrl(u);
        };
        // コピー＆ペースト（画像そのもの / 画像URL）
        document.addEventListener('paste', function(e){
            if (!skOpen) return;
            const dt = e.clipboardData; if (!dt) return;
            if (dt.items) {
                for (let i = 0; i < dt.items.length; i++){
                    const it = dt.items[i];
                    if (it.kind === 'file' && (it.type || '').indexOf('image') === 0){
                        const f = it.getAsFile(); if (f){ skSetRefFile(f); e.preventDefault(); return; }
                    }
                }
            }
            const txt = ((dt.getData && dt.getData('text/plain')) || '').trim();
            if (/^https?:\/\//.test(txt)) { skSetRefUrl(txt); e.preventDefault(); }
        });
        // ドラッグ＆ドロップ（PCでPinterestのピンを直接この画面へ）
        skStage.addEventListener('dragover', function(e){ if (skOpen) { e.preventDefault(); try { e.dataTransfer.dropEffect = 'copy'; } catch(_){ } } });
        skStage.addEventListener('drop', function(e){
            if (!skOpen) return;
            e.preventDefault(); e.stopPropagation();
            const dt = e.dataTransfer; if (!dt) return;
            if (dt.files && dt.files.length){ const f = dt.files[0]; if (f && (f.type || '').indexOf('image') === 0){ skSetRefFile(f); return; } }
            let url = '';
            try {
                const html = dt.getData('text/html');
                if (html){ const mm = html.match(/<img[^>]+src=["']([^"']+)["']/i); if (mm) url = mm[1]; }
                if (!url) url = (dt.getData('text/uri-list') || dt.getData('text/plain') || '').split(/[\r\n]/)[0];
            } catch(_){ }
            if (url) skSetRefUrl(url);
        });

        /* ════════════════════════════════════════════════════════
           6) キーボードショートカット追加（PC）
        ════════════════════════════════════════════════════════ */
        window.isOverlayOpen = function(){
            return skOpen
                || document.getElementById('online-overlay').classList.contains('open')
                || document.getElementById('tag-panel').classList.contains('open');
        };
        document.addEventListener('keydown', function(e){
            const ae = document.activeElement;
            if (ae && (ae.tagName === 'SELECT' || ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
            if (skOpen) {
                if (e.code === 'Escape') { if (skFormenOn) { skSetFormen(false); } else { toggleSketch(); } }
                else if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey) && e.shiftKey) { e.preventDefault(); skRedo(); }
                else if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); skUndo(); }
                else if (e.code === 'KeyY' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); skRedo(); }
                else if (e.code === 'KeyW' && !e.ctrlKey && !e.metaKey) { skToggleFormen(); }
                return;
            }
            const onlineOpen = document.getElementById('online-overlay').classList.contains('open');
            const tagOpen = document.getElementById('tag-panel').classList.contains('open');
            if (e.code === 'Escape') {
                if (onlineOpen) { toggleOnlinePanel(); return; }
                if (tagOpen) { toggleTagPanel(); return; }
            }
            if (onlineOpen || tagOpen) return;
            if (e.code === 'KeyF') { toggleFavCurrent(); }
            else if (e.code === 'KeyG') { toggle('grid'); }
            else if (e.code === 'KeyH') { toggle('flipH'); }
            else if (e.code === 'KeyV') { toggle('flipV'); }
            else if (e.code === 'KeyD') { toggleSketch(); }
            else if (e.code === 'KeyO') { toggleOnlinePanel(); }
            else if (e.code === 'KeyT') { toggleTagPanel(); }
            else if (e.code === 'KeyP') { togglePiP(); }
            else if (e.code === 'KeyM') { toggleMute(); }
        });
    })();
