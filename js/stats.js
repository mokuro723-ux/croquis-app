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
        // 描画モードの練習を統計へ加算（枚数＝描いた絵の数 / 秒＝描画モードの滞在時間）。
        // 「今日の枚数・練習時間」「累計」に通常モードと合算して反映される。
        window.recordDrawStat = function(count, sec){
            try {
                count = count || 0; sec = Math.max(0, Math.round(sec || 0));
                if (count <= 0 && sec <= 0) return;
                const s = loadStats(); const k = todayKey();
                if (!s.days[k]) s.days[k] = { count:0, sec:0 };
                s.days[k].count += count; s.days[k].sec += sec;
                s.total.count += count;   s.total.sec   += sec;
                const keys = Object.keys(s.days);
                if (keys.length > 90) { keys.sort(); while (keys.length > 90) delete s.days[keys.shift()]; }
                saveStats(s);
            } catch(e){ console.warn("croquis: 描画統計の記録に失敗", e); }
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
        let skLastX = 0, skLastY = 0, skPrevMidX = 0, skPrevMidY = 0; // 直前点と直前中点（なめらか化用）
        let skRawLastX = 0, skRawLastY = 0; // 補正前の“本当の”最終位置（離した瞬間に終点を合わせ、線が短く切れないように）
        let skStab = window.CroquisStore.getRaw(window.CROQUIS_KEYS.SKETCH_STAB) === '1', skStabX = 0, skStabY = 0; // 手ブレ補正（指描き向け）
        let skStabStr = Math.min(9, Math.max(1, parseInt(window.CroquisStore.getRaw(window.CROQUIS_KEYS.SKETCH_STAB_STR), 10) || 5)); // 補正の強さ(1=弱〜9=強)
        // 入力点の寄せ率K（小さいほど強く補正）。弱(1)=0.9〜強(9)=0.14 と範囲を広げ、強さの差がはっきり出るように。
        let skStabK = 0.9 - (skStabStr - 1) * 0.095;
        let skPaper = window.CroquisStore.getRaw(window.CROQUIS_KEYS.SKETCH_PAPER) || '#000000'; // 紙（ステージ背景）の色
        let skMemFade = window.CroquisStore.getRaw(window.CROQUIS_KEYS.SKETCH_MEMFADE) !== '0'; // 記憶モードで隠す瞬間に下描き化（既定ON）
        let skCmpOn = window.CroquisStore.getRaw(window.CROQUIS_KEYS.SKETCH_CMP) !== '0';       // 制限時間タイマーで見比べ時間を入れる（既定ON）
        let skUndoStack = [], skRedoStack = [], skRedoBackup = [];
        let skCurSnap = null, skRestoreGen = 0;                      // 現在の確定キャンバス(dataURL)と復元の世代番号（undoの基準・連打対策）
        let skMemTimer = null, skState = 'free';
        let skImgOpacity = 0.5, skWasRunning = false;
        let skFreeOpacity = 1;          // 自由描き(free)状態でのお手本の濃さ（上バーの目ボタンで調整・毎回1で開始）
        let skPendingMemHide = null;    // タイマー終了ちょうどに線を引いていた時、ストローク完了まで「薄く＆隠す」を保留
        let skBreakTick = null, skBreakStart = 0;  // 描画モード内の目の休憩タイマー
        let skZoom = 1, skPanX = 0, skPanY = 0;    // お手本＋描画レイヤーのピンチズーム（重ねるモードのみ）
        let skPinchActive = false, skPinchStartDist = 0, skPinchStartZoom = 1, skPinchCX = 0, skPinchCY = 0; // ピンチ計算用
        let skRefFrame = window.CroquisStore.getRaw(window.CROQUIS_KEYS.SKETCH_REF_FRAME) === '1'; // お手本の外枠表示
        let skSide = window.CroquisStore.getRaw(window.CROQUIS_KEYS.SKETCH_SIDE) === '1';
        // 「並べる」時、お手本（左）と描画枠（右）を中央の境界へ寄せる量（0=中央寄せ＝従来 〜 1=境界にぴったり隣接）。
        // スライダーは横向き時だけ表示するが、値の適用は左右どちらの向きでも行う（0なら従来と完全に同じ＝後方互換）。
        let skConverge = Math.min(1, Math.max(0, (parseInt(window.CroquisStore.getRaw(window.CROQUIS_KEYS.SKETCH_CONVERGE), 10) || 0) / 100));
        let skDrawConv = 0; // 今キャンバスに乗っている線が対応する寄せ量（寄せ変更時に線を枠と一緒に動かすため）
        let skCW = 0, skCH = 0, skLeft = 0; // 描画キャンバスのCSSサイズと左位置（直前の値）
        let skFormenOn = false, skDeckIdx = 0, skItemIdx = 0, skFormenPrevSide = false, skFormenOpacity = 0.7;
        let skFormenBackup = null, skFormenBackupW = 0, skFormenBackupH = 0, skFormenBackupLeft = 0;
        let skTimerOn = false, skSessionTimer = null; // 描画モード内の時間制限タイマー
        let skRefOverride = false, skRefObjUrl = null; // 参考画像の手動指定（URL/貼り付け/D&D）
        let skGrid = parseInt(window.CroquisStore.getRaw(window.CROQUIS_KEYS.SKETCH_GRID), 10) || 0; // 比率グリッドの分割数（0=オフ）
        let skGridColor = window.CroquisStore.getRaw(window.CROQUIS_KEYS.SKETCH_GRID_COLOR) || 'cyan'; // グリッド線の色
        let skGridOp = Math.min(10, Math.max(1, parseInt(window.CroquisStore.getRaw(window.CROQUIS_KEYS.SKETCH_GRID_OP), 10) || 6)); // グリッド線の濃さ(1〜10)
        let skBwContrast = Math.min(20, Math.max(1, parseInt(window.CroquisStore.getRaw(window.CROQUIS_KEYS.SKETCH_BW_CONTRAST), 10) || 10)); // 二階調コントラスト(1〜20)
        const SK_GRID_RGB = { cyan: '0,212,255', white: '255,255,255', black: '0,0,0', red: '255,77,94' }; // グリッド色の名前→RGB
        let skFlipH = false, skFlipV = false, skMono = false, skBw = false; // 参考画像の加工（描画モード内だけで独立管理）
        let skTool = 'pen', skLassoPts = null; // 道具: pen / eraser / lasso / lassoLight。投げ縄の頂点配列
        let skLassoFillPreview = window.CroquisStore.getRaw(window.CROQUIS_KEYS.SKETCH_LASSOPREV) === '1'; // 投げ縄の塗り予測（シルエット）表示。既定OFF（なぞり線は常時）
        let skOpenTime = 0, skSketchCount = 0, skDrew = false; // 統計用：滞在時間と「描いた枚数」
        const skFormenSvg = document.getElementById('sketch-formen');
        const skGridSvg = document.getElementById('sketch-grid');

        function skShowMsg(t){ if (!t) { skMsgEl.style.display = 'none'; return; } skMsgEl.textContent = t; skMsgEl.style.display = 'block'; }

        window.toggleSketch = function(){
            skOpen = !skOpen;
            skOverlay.classList.toggle('open', skOpen);
            if (skOpen) {
                // 画像が無くても開ける（ウォームアップ / 自由描き / 参考画像の読み込みができる）
                const hasImg = images.length > 0;
                skWasRunning = isRunning;
                if (isRunning) stopTimer();
                skOpenTime = Date.now(); skSketchCount = 0; skDrew = false; // 統計の計測開始
                skFlipH = skFlipV = skMono = skBw = false; skSetTool('pen'); // 加工・道具は毎回まっさらで開始
                skCloseMenus(); // 前回開いたままのメニューが残らないように
                if (typeof window.skSetTab === 'function') skSetTab('draw'); // 下のタブは「描く」から
                const gb = document.getElementById('sketch-grid-btn'); // 前回のグリッド設定をボタンに反映
                if (gb) { gb.classList.toggle('accent', skGrid > 0); gb.title = skGrid > 0 ? ('グリッド ' + skGrid + '×' + skGrid) : 'グリッド（比率合わせ）'; }
                skSyncSettingsBtns();                                   // 補正・記憶下描き化・見比べの状態を反映
                skApplySavedInputs();                                   // 記憶秒数・ペン太さ・ペン色・グリッド色などを復元
                skApplyPaper();                                         // 前回の紙の色を反映
                skFreeOpacity = 1; skUpdateRefHideBtn();                 // お手本の濃さは毎回フル表示から
                const rfb = document.getElementById('sketch-refframe-btn'); // お手本枠ボタンの状態を反映
                if (rfb) rfb.classList.toggle('accent', skRefFrame);
                skApplyLayout(false);
                skSyncImage();
                skResize(true);
                skSetState('free');
                skStartBreakWatch();                                     // 描画モード内でも目の休憩を見張る
                skShowMsg(!hasImg
                    ? '画像が無くても描けます。「お題」や「参考画像」をどうぞ'
                    : (skSide ? '左の画像を見ながら右に描けます（模写）' : 'そのまま上から描けます／2本指ピンチ・ホイールでお手本を拡大'));
                setTimeout(function(){ skShowMsg(''); }, 4200);
            } else {
                skStopBreakWatch();
                skStopTimer();
                skCancelMemory();
                if (skFormenOn) skSetFormen(false);
                skClearRef();
                // 統計へ反映：このセッションで描いた枚数と、描画モードに居た時間
                skCommitSketchCount();
                if (typeof window.recordDrawStat === 'function') window.recordDrawStat(skSketchCount, (Date.now() - skOpenTime) / 1000);
                skSketchCount = 0;
                if (skWasRunning) startTimer();
            }
        };
        function skCommitSketchCount(){ if (skDrew) { skSketchCount++; skDrew = false; } } // 何か描いてあれば1枚と数える

        /* ── 描画モード内の「目の休憩」──────────────────────────────
           本体タイマーとは別系統なので、設定（ON/OFF・インターバル）だけ共有して
           描画している経過時間で発動する。発動中の全画面オーバーレイは app.js と共用。 */
        function skBreakOverlayActive(){ const o = document.getElementById('break-overlay'); return !!(o && o.classList.contains('active')); }
        function skStartBreakWatch(){
            skBreakStart = Date.now();
            skStopBreakWatch();
            skBreakTick = setInterval(skCheckBreak, 1000);
        }
        function skStopBreakWatch(){ if (skBreakTick) { clearInterval(skBreakTick); skBreakTick = null; } }
        function skCheckBreak(){
            if (!skOpen) { skStopBreakWatch(); return; }
            if (typeof window.croquisBreakInfo !== 'function') return;
            const info = window.croquisBreakInfo();
            if (!info.enabled) { skBreakStart = Date.now(); return; } // OFFの間は経過をリセットし続ける
            if (skDrawing || skMemTimer || skBreakOverlayActive()) return; // 描いてる最中・記憶カウント中・休憩中は割り込まない
            if (Date.now() - skBreakStart < info.intervalMin * 60 * 1000) return;
            // 目の休憩を発動。描画タイマーが動いていたら止め、休憩明けに仕切り直す。
            if (skTimerOn) { skClearSessionTimer(); skCountdown.style.display = 'none'; }
            window.croquisStartSketchBreak(function(){
                skBreakStart = Date.now();
                if (skOpen && skTimerOn) skRunTimer(); // 描画タイマーを再開
            });
        }

        window.skToggleLayout = function(){
            skSide = !skSide;
            window.CroquisStore.setRaw(window.CROQUIS_KEYS.SKETCH_SIDE, skSide ? '1' : '0', 'スケッチ表示位置');
            skApplyLayout(true);
        };
        function skApplyLayout(preserve){
            skResetZoom(); // レイアウトが変わったらズームは解除（ズレ防止）
            skOverlay.classList.toggle('side', skSide);
            const b = document.getElementById('sketch-layout-btn');
            if (b) {
                // トグルボタン（アイコンのみ・横幅圧縮）：今が「並べる」なら押すと「重ねる」へ
                b.innerHTML = skSide
                    ? '<svg viewBox="0 0 24 24" class="svg-icon"><path d="M5 3h12v12H5z" opacity=".45"/><path d="M8 8h12v12H8z"/></svg>'
                    : '<svg viewBox="0 0 24 24" class="svg-icon"><path d="M3 4h8v16H3zM13 4h8v16h-8z"/></svg>';
                b.title = skSide ? '重ねる（画像の上に直接描く）' : '並べる（左に画像・右に描画）';
            }
            skUpdateImgPos();
            skResize(!preserve);
            skUpdateFrameGuide();
        }
        // お手本（左半分）を寄せ量に応じて境界（右）へ寄せる：c=0→中央(50%), c=1→右端(100%)
        function skUpdateImgPos(){ skOverlay.style.setProperty('--sk-imgpos', (50 + 50 * skConverge) + '%'); }
        function skIsLandscape(){ return window.innerWidth >= window.innerHeight; }
        // 寄せスライダーは「横向き × 並べる × 参考画像あり」のときだけ上バーに出す
        function skUpdateSplitUI(){
            const wrap = document.getElementById('sketch-split-wrap');
            if (!wrap) return;
            const show = skSide && skHasRefImage() && skIsLandscape();
            wrap.style.display = show ? 'flex' : 'none';
            const sl = document.getElementById('sketch-split'); if (sl) sl.value = String(Math.round(skConverge * 100));
        }
        // 寄せ量の変更。commit=false はドラッグ中（枠・グリッド・画像だけ軽く追従）、
        // commit=true は離した時（保存＋描いた線も枠と一緒に最終位置へ移動）。
        window.skSetConverge = function(v, commit){
            skConverge = Math.min(1, Math.max(0, (parseInt(v, 10) || 0) / 100));
            skUpdateImgPos();
            if (commit) {
                window.CroquisStore.setRaw(window.CROQUIS_KEYS.SKETCH_CONVERGE, String(Math.round(skConverge * 100)), '並べるの寄せ');
                if (skSide) skResize(false); // 線も枠と一緒に最終位置へ（中で frame/grid/UI も更新）
                else { skUpdateFrameGuide(); skUpdateSplitUI(); }
            } else {
                skUpdateFrameGuide(); // 中で skRenderGrid も呼ぶ
            }
        };
        // 画像比率 a を box(bw×bh) に contain で収めたときの矩形（object-fit:contain と同じ）
        function fitRect(a, bw, bh){
            let w = bw, h = bw / a;
            if (h > bh) { h = bh; w = bh * a; }
            return { x: (bw - w) / 2, y: (bh - h) / 2, w: w, h: h };
        }
        // 「並べる」の寄せ：中央寄せのマージン m を、寄せ量 skConverge に応じて境界側へずらす。
        //  右側(描画)は境界=列の左端(0)へ → m*(1-c)。 左側(お手本)は境界=列の右端(2m)へ → m*(1+c)。
        //  c=0 のときは従来どおり（m）なので後方互換。
        function skConvRightX(m){ return m * (1 - skConverge); }
        function skConvLeftX(m){ return m * (1 + skConverge); }
        function skHasRefImage(){
            return !!(skImg && skImg.naturalWidth > 0 && skImg.naturalHeight > 0 && skImg.getAttribute('src'));
        }
        // 「並べる」のとき、描く側（右半分）に画像と同じ縦横比の枠を表示（ズレ確認用）
        function skUpdateFrameGuide(){
            skRenderGrid(); // レイアウトが変わるたびグリッドも追従させる
            skUpdateRefFrame(); // お手本枠も毎回更新（重ねる/並べる・レイアウト切替で古い枠が残らないように）
            const g = document.getElementById('sketch-frame-guide');
            if (!g) return;
            if (!skSide || skFormenOn || !skHasRefImage()) { g.style.display = 'none'; return; }
            const r = skStage.getBoundingClientRect();
            const W = r.width, H = r.height;
            const f = fitRect(skImg.naturalWidth / skImg.naturalHeight, W / 2, H);
            g.style.left = (W / 2 + skConvRightX(f.x)) + 'px'; // 寄せ量に応じて境界側へ
            g.style.top = f.y + 'px';
            g.style.width = f.w + 'px';
            g.style.height = f.h + 'px';
            g.style.display = 'block';
        }
        // お手本（参考画像）の外枠に色付きの線を出す。色は「表示」タブのグリッド色を共用。
        // 並べる時は左の画像枠、重ねる時は画面いっぱいの画像枠に合わせる。画像が隠れている時は出さない。
        function skUpdateRefFrame(){
            const g = document.getElementById('sketch-ref-frame');
            if (!g) return;
            if (!skRefFrame || skFormenOn || !skHasRefImage() || skState === 'hidden') { g.style.display = 'none'; return; }
            const r = skStage.getBoundingClientRect();
            const W = r.width, H = r.height;
            const a = skImg.naturalWidth / skImg.naturalHeight;
            if (!isFinite(a) || a <= 0) { g.style.display = 'none'; return; } // 画像未読み込み時などは出さない
            let rect;
            if (skSide) { const f = fitRect(a, W / 2, H); rect = { x: skConvLeftX(f.x), y: f.y, w: f.w, h: f.h }; } // 左の画像枠
            else { rect = fitRect(a, W, H); }                                                                    // 重ねる：全体の画像枠
            const rgb = SK_GRID_RGB[skGridColor] || SK_GRID_RGB.cyan;
            g.style.borderColor = 'rgba(' + rgb + ',0.95)';
            g.style.left = rect.x + 'px'; g.style.top = rect.y + 'px';
            g.style.width = rect.w + 'px'; g.style.height = rect.h + 'px';
            g.style.display = 'block';
        }
        window.skToggleRefFrame = function(){
            skRefFrame = !skRefFrame;
            window.CroquisStore.setRaw(window.CROQUIS_KEYS.SKETCH_REF_FRAME, skRefFrame ? '1' : '0', 'お手本枠');
            const b = document.getElementById('sketch-refframe-btn'); if (b) b.classList.toggle('accent', skRefFrame);
            skUpdateRefFrame();
            skFlash(skRefFrame ? 'お手本の外枠を表示（色は表示タブのグリッド色）' : 'お手本の外枠を消しました', 1800);
        };
        // 比率合わせグリッド：与えた矩形 r を n×n に分割する線を返す（外枠も少し濃く）
        function skGridLines(r, n){
            const x0 = r.x, y0 = r.y, w = r.w, h = r.h, out = [];
            const rgb = SK_GRID_RGB[skGridColor] || SK_GRID_RGB.cyan;   // 設定された色
            const aBase = skGridOp / 10;                                // 濃さ 1〜10 → 0.1〜1.0
            const aIn = Math.min(1, aBase * 0.55).toFixed(2);          // 内側の細線（やや薄め）
            const aOut = Math.min(1, aBase * 0.9).toFixed(2);          // 外枠（少し濃く）
            const line = function(x1, y1, x2, y2, strong){
                return '<line x1="' + fmN(x1) + '" y1="' + fmN(y1) + '" x2="' + fmN(x2) + '" y2="' + fmN(y2) +
                    '" stroke="rgba(' + rgb + ',' + (strong ? aOut : aIn) + ')' +
                    '" stroke-width="' + (strong ? 1.4 : 1) + '"/>';
            };
            for (let i = 1; i < n; i++){ const x = x0 + w * i / n; out.push(line(x, y0, x, y0 + h, false)); }
            for (let j = 1; j < n; j++){ const y = y0 + h * j / n; out.push(line(x0, y, x0 + w, y, false)); }
            out.push(line(x0, y0, x0 + w, y0, true), line(x0, y0 + h, x0 + w, y0 + h, true),
                     line(x0, y0, x0, y0 + h, true), line(x0 + w, y0, x0 + w, y0 + h, true));
            return out.join('');
        }
        // グリッドを描く。並べるモードで参考画像がある時は、左の画像枠と右の描画枠に
        // 「同じ升目」を出すので、升目どうしを見比べて当たりが取れる（グリッド模写法）。
        function skRenderGrid(){
            if (!skGridSvg) return;
            if (skGrid <= 0) { skGridSvg.style.display = 'none'; skGridSvg.innerHTML = ''; return; }
            const r = skStage.getBoundingClientRect();
            const W = Math.max(1, r.width), H = Math.max(1, r.height), n = skGrid;
            skGridSvg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
            let svg = '';
            if (skSide && skHasRefImage() && !skFormenOn) {
                const a = skImg.naturalWidth / skImg.naturalHeight;
                const lf = fitRect(a, W / 2, H);                       // 左：画像の表示枠
                const rf = fitRect(a, W / 2, H);                       // 右：同じ比率の描画枠
                lf.x = skConvLeftX(lf.x);                              // 寄せ：左の枠は境界（右端）側へ
                svg = skGridLines(lf, n) + skGridLines({ x: W / 2 + skConvRightX(rf.x), y: rf.y, w: rf.w, h: rf.h }, n);
            } else if (skSide) {
                svg = skGridLines({ x: 0, y: 0, w: W / 2, h: H }, n) + skGridLines({ x: W / 2, y: 0, w: W / 2, h: H }, n);
            } else {
                svg = skGridLines({ x: 0, y: 0, w: W, h: H }, n);
            }
            skGridSvg.innerHTML = svg;
            skGridSvg.style.display = 'block';
        }
        window.skToggleGrid = function(){
            skGrid = (skGrid === 0) ? 3 : (skGrid === 3 ? 4 : 0); // オフ→3×3→4×4→オフ
            window.CroquisStore.setRaw(window.CROQUIS_KEYS.SKETCH_GRID, String(skGrid), 'スケッチのグリッド');
            const b = document.getElementById('sketch-grid-btn');
            if (b) { b.classList.toggle('accent', skGrid > 0); b.title = skGrid > 0 ? ('グリッド ' + skGrid + '×' + skGrid) : 'グリッド（比率合わせ）'; }
            skRenderGrid();
            skFlash(skGrid > 0 ? ('グリッド ' + skGrid + '×' + skGrid + '（比率合わせ用）') : 'グリッドを消しました', 1600);
        };
        function skGridOff(){ // グリッドを消してボタン表示も戻す（記憶モードで隠す瞬間などに使用）
            if (skGrid === 0) return;
            skGrid = 0;
            window.CroquisStore.setRaw(window.CROQUIS_KEYS.SKETCH_GRID, '0', 'スケッチのグリッド');
            const b = document.getElementById('sketch-grid-btn'); if (b) { b.classList.remove('accent'); b.title = 'グリッド（比率合わせ）'; }
            skRenderGrid();
        }
        // グリッドの色・濃さ・二階調コントラスト（描画モード専用・サイト内に保持）
        window.skSetGridColor = function(c){
            if (!SK_GRID_RGB[c]) c = 'cyan';
            skGridColor = c;
            window.CroquisStore.setRaw(window.CROQUIS_KEYS.SKETCH_GRID_COLOR, c, 'グリッドの色');
            skSyncViewBtns();
            skRenderGrid();
            skUpdateRefFrame(); // お手本枠の色もグリッド色に合わせる
        };
        window.skSetGridOp = function(v){
            skGridOp = Math.min(10, Math.max(1, parseInt(v, 10) || 6));
            window.CroquisStore.setRaw(window.CROQUIS_KEYS.SKETCH_GRID_OP, String(skGridOp), 'グリッドの濃さ');
            skRenderGrid();
        };
        window.skSetBwContrast = function(v){
            skBwContrast = Math.min(20, Math.max(1, parseInt(v, 10) || 10));
            window.CroquisStore.setRaw(window.CROQUIS_KEYS.SKETCH_BW_CONTRAST, String(skBwContrast), '二階調コントラスト');
            skApplyImgFilters(); // 二階調表示中なら即反映
        };
        function skSyncViewBtns(){ // 「表示」タブのグリッド色・濃さ・コントラストを現在値に合わせる
            document.querySelectorAll('.sk-gridcolor').forEach(function(b){ b.classList.toggle('on', b.getAttribute('data-gc') === skGridColor); });
            const go = document.getElementById('sketch-grid-op'); if (go) go.value = String(skGridOp);
            const bc = document.getElementById('sketch-bwcontrast'); if (bc) bc.value = String(skBwContrast);
            const rf = document.getElementById('sketch-refframe-btn'); if (rf) rf.classList.toggle('accent', skRefFrame);
        }
        // 記憶秒数・ペン太さ・ペン色を保存値から復元（描画モードを開くたびに呼ぶ）
        function skApplySavedInputs(){
            const ms = window.CroquisStore.getRaw(window.CROQUIS_KEYS.SKETCH_MEMSEC);
            const msEl = document.getElementById('sketch-memsec');
            if (msEl && ms) { msEl.value = ms; if (msEl.value !== ms) msEl.value = '30'; } // 選択肢に無ければ既定
            const sz = window.CroquisStore.getRaw(window.CROQUIS_KEYS.SKETCH_SIZE);
            const szEl = document.getElementById('sketch-size');
            if (szEl && sz) szEl.value = sz;
            const col = window.CroquisStore.getRaw(window.CROQUIS_KEYS.SKETCH_COLOR);
            if (col) {
                const parts = col.split('|'), c = parts[0], a = parts[1] || '1';
                let matched = null;
                document.querySelectorAll('.sk-color').forEach(function(b){
                    b.classList.remove('on');
                    if (b.getAttribute('data-c') === c && (b.getAttribute('data-a') || '1') === a) matched = b;
                });
                const wrap = document.getElementById('sketch-customcolor-wrap');
                if (matched) {
                    matched.classList.add('on');
                    if (wrap) wrap.classList.remove('on');
                } else {
                    // プリセットに無い色＝カスタム色として復元
                    if (wrap) wrap.classList.add('on');
                    const ci = document.getElementById('sketch-customcolor');
                    if (ci && /^#[0-9a-fA-F]{6}$/.test(c)) ci.value = c;
                }
                skColor = c; skAlpha = parseFloat(a) || 1;
            }
            const al = document.getElementById('sketch-alpha'); if (al) al.value = String(Math.round((skAlpha || 1) * 100));
            skUpdateBrushPreview();
            skSyncViewBtns();
        }
        window.skToggleTools = function(){
            skOverlay.classList.toggle('tools-hidden');
            skResize(false);
        };

        function skSyncImage(){
            if (skRefOverride) { skApplyImgFilters(); return; } // 参考画像を手動指定中はプール画像で上書きしない
            const co = ui.img.getAttribute('crossorigin');
            if (co) skImg.setAttribute('crossorigin', co); else skImg.removeAttribute('crossorigin');
            const src = ui.img.getAttribute('src') || '';
            if (src) skImg.src = src; else skImg.removeAttribute('src'); // 画像が無いときは壊れアイコンを出さない
            skApplyImgFilters();
            skUpdateSplitUI(); // 参考画像の有無で寄せスライダーの表示を更新
        }
        // 参考画像の加工フィルタのCSS文字列（CSS filter と canvas ctx.filter で共用）
        function skImgFilterCSS(){
            if (skBw) return 'grayscale(1) contrast(' + skBwContrast + ')'; // 描画モード専用のコントラスト
            if (skMono) return 'grayscale(100%)';
            return 'none';
        }
        // 参考画像の加工（左右/上下反転・モノクロ・二階調）を反映。描画モード内だけの状態。
        function skApplyImgFilters(){
            let t = '';
            if (skFlipH) t += 'scaleX(-1) ';
            if (skFlipV) t += 'scaleY(-1) ';
            skImg.style.transform = t;
            skImg.style.filter = skImgFilterCSS();
            const set = function(id, on){ const b = document.getElementById(id); if (b) b.classList.toggle('accent', on); };
            set('sketch-fliph-btn', skFlipH); set('sketch-flipv-btn', skFlipV);
            set('sketch-mono-btn', skMono);   set('sketch-bw-btn', skBw);
        }
        window.skFlipHoriz = function(){ skFlipH = !skFlipH; skApplyImgFilters(); };
        window.skFlipVert  = function(){ skFlipV = !skFlipV; skApplyImgFilters(); };
        window.skToggleMonoImg = function(){ skMono = !skMono; if (skMono) skBw = false; skApplyImgFilters(); };
        window.skToggleBwImg   = function(){ skBw = !skBw; if (skBw) skMono = false; skApplyImgFilters(); };
        ui.img.addEventListener('load', function(){ if (skOpen) skSyncImage(); });
        skImg.addEventListener('load', function(){ if (skOpen) { skUpdateFrameGuide(); skUpdateSplitUI(); } }); // 画像が決まったら枠・寄せUIを更新

        function skResize(clear){
            const r = skStage.getBoundingClientRect();
            if (r.width < 1 || r.height < 1) return; // 計測できない瞬間（向き変更直後など）は触らず描画を守る
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            // 直前のレイアウト（並べる⇔重ねる切替時に、描いた線を元の大きさ・位置のまま引き継ぐため控える）
            const prevCW = skCW, prevCH = skCH, prevLeft = skLeft;
            // 並べるは「ちょうど半分」で割る（floorしない）。こうすると画像(左50%)・グリッド・枠（すべてW/2基準）と
            // 描画キャンバスの座標がピタリ一致し、下UIの開閉などでズレない。
            const newCW = skSide ? (r.width / 2) : r.width;
            const newCH = r.height;
            const newLeft = skSide ? (r.width / 2) : 0;
            // 既存の描画を“同期で”オフスクリーンに複製（toDataURL+onloadの非同期だと、
            // 連続でリサイズした時に古い画像が遅れて貼られ縦横比が崩れることがある＝その対策）。
            let tmp = null;
            if (!clear && skCanvas.width > 1 && skCanvas.height > 1) {
                tmp = document.createElement('canvas');
                tmp.width = skCanvas.width; tmp.height = skCanvas.height;
                try { tmp.getContext('2d').drawImage(skCanvas, 0, 0); } catch(e){ tmp = null; }
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
            skCtx.setTransform(dpr, 0, 0, dpr, 0, 0);     skCtx.lineCap = 'round';     skCtx.lineJoin = 'round';     skCtx.globalCompositeOperation = 'source-over';
            skLiveCtx.setTransform(dpr, 0, 0, dpr, 0, 0); skLiveCtx.lineCap = 'round'; skLiveCtx.lineJoin = 'round'; skLiveCtx.globalCompositeOperation = 'source-over';
            if (clear) { skUndoStack = []; skRedoStack = []; }
            else if (tmp) {
                const a = skImg.naturalWidth / skImg.naturalHeight;
                if (!skFormenOn && skHasRefImage() && isFinite(a) && a > 0) {
                    // 参考画像がある場合：描いた線を画像の表示枠の拡縮に合わせて等比で移す。
                    // 画像枠は新旧とも同じ縦横比(a)なので拡縮率 s は縦横で必ず一致＝歪まない。
                    // 9引数drawImageで枠領域だけ切り出すと枠外の線が消える＆端数で歪む余地があるため、
                    // 「全体を s 倍して平行移動」方式にして枠外の線も保持する。
                    const oldF = fitRect(a, prevCW, prevCH);
                    const newF = fitRect(a, newCW, newCH);
                    // 寄せ（並べる時のみ）：旧は skDrawConv、新は skConverge の位置に合わせる
                    const oldC = (prevLeft > 0) ? skDrawConv : 0;
                    const newC = skSide ? skConverge : 0;
                    oldF.x = oldF.x * (1 - oldC);
                    newF.x = newF.x * (1 - newC);
                    if (oldF.w > 0.5 && oldF.h > 0.5) {
                        const s = newF.w / oldF.w;            // 画像枠の拡縮率（縦横同じ＝等比）
                        skCtx.save();
                        skCtx.translate(newF.x - oldF.x * s, newF.y - oldF.y * s); // 画像枠どうしを重ねる平行移動
                        skCtx.scale(s, s);
                        skCtx.drawImage(tmp, 0, 0, prevCW, prevCH); // 旧キャンバス全体を等比で移す
                        skCtx.restore();
                    } else {
                        skCtx.drawImage(tmp, 0, 0, prevCW, prevCH);
                    }
                } else {
                    // 画像が無い場合（ウォームアップ/自由描き）：拡大縮小せず画面上の同じ位置に戻す
                    const dx = prevLeft - newLeft;
                    skCtx.drawImage(tmp, dx, 0, prevCW, prevCH);
                }
            }
            skDrawConv = skSide ? skConverge : 0; // 今の線が対応する寄せ量を記録
            skCommitSnap(); // 大きさが変わったら確定スナップを取り直す（リサイズ復元は同期なのでここで確定）
            skClampPan(); skApplyZoom(); // ステージ寸法が変わったらズームのパン量を測り直す
            skUpdateFrameGuide(); // 枠とグリッドを同時に更新（下UIの開閉でズレないように。中でskRenderGridも呼ぶ）
            skUpdateSplitUI();    // 寄せスライダーの表示/値を更新（横向き×並べる×参考画像のときだけ表示）
        }
        // リサイズは少し待ってから1回だけ反映（PCの枠ドラッグ中に毎フレーム再構築＝重い、を防ぐ）
        let skResizeTimer = null;
        window.addEventListener('resize', function(){
            if (!skOpen) return;
            if (skResizeTimer) clearTimeout(skResizeTimer);
            skResizeTimer = setTimeout(function(){
                skResizeTimer = null;
                if (skOpen) { skResize(false); skUpdateFrameGuide(); if (skFormenOn) fmRender(); }
            }, 120);
        });

        function skSetState(st){
            skState = st;
            const memBtn    = document.getElementById('sketch-mem-btn');
            const peekBtn   = document.getElementById('sketch-peek-btn');
            const revealBtn = document.getElementById('sketch-reveal-btn');
            const opWrap    = document.getElementById('sketch-imgopacity-wrap');
            skCountdown.style.display = 'none';
            if (st === 'free') {
                skImg.style.visibility = 'visible'; skImg.style.opacity = String(skFreeOpacity); // 上バーの目ボタンで決めた濃さ
                memBtn.style.display = ''; peekBtn.style.display = 'none'; revealBtn.style.display = 'none'; opWrap.style.display = 'none';
            } else if (st === 'memorize') {
                skImg.style.visibility = 'visible'; skImg.style.opacity = '1';
                memBtn.style.display = 'none'; peekBtn.style.display = 'none'; revealBtn.style.display = 'none'; opWrap.style.display = 'none';
            } else if (st === 'hidden') {
                skImg.style.visibility = 'visible'; skImg.style.opacity = '0';
                memBtn.style.display = 'none'; peekBtn.style.display = ''; revealBtn.style.display = '';
                revealBtn.innerHTML = '<svg viewBox="0 0 24 24" class="svg-icon"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg><span>答え</span>'; revealBtn.title = '答え合わせ（画像を出して見比べる）'; opWrap.style.display = 'none';
            } else if (st === 'reveal') {
                skImg.style.visibility = 'visible'; skImg.style.opacity = String(skImgOpacity);
                memBtn.style.display = 'none'; peekBtn.style.display = ''; revealBtn.style.display = '';
                revealBtn.innerHTML = '<svg viewBox="0 0 24 24" class="svg-icon"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg><span>隠す</span>'; revealBtn.title = 'また隠す'; opWrap.style.display = 'flex';
            }
            skUpdateRefFrame(); // お手本枠は画像が隠れている時は出さない
        }

        // ── お手本の見え方（上バーの目ボタン → 濃さスライダー／完全に隠す）──
        window.skToggleRefHide = function(){ skToggleMenu('sketch-refhide-pop', 'sketch-refhide-btn'); };
        window.skSetRefOpacity = function(v){
            skFreeOpacity = Math.max(0, Math.min(1, (parseInt(v, 10) || 0) / 100));
            if (skState === 'free') skImg.style.opacity = String(skFreeOpacity); // 自由描き中は即反映
            skUpdateRefHideBtn();
        };
        window.skToggleHideAllRef = function(){ skSetRefOpacity(skFreeOpacity > 0 ? 0 : 100); };
        function skUpdateRefHideBtn(){
            const ro = document.getElementById('sketch-refop');
            if (ro) ro.value = String(Math.round(skFreeOpacity * 100));
            const btn = document.getElementById('sketch-refhide-btn');
            if (btn) btn.classList.toggle('accent', skFreeOpacity < 1); // 薄め/非表示の時は目印
            const hideBtn = document.getElementById('sketch-refhideall-btn');
            if (hideBtn) hideBtn.textContent = (skFreeOpacity <= 0) ? '表示' : '完全に隠す';
        }

        window.skStartMemory = function(isTraining){
            skCloseMenus();
            skStopTimer();
            skCancelMemory();
            skClearSilent();
            let sec = parseInt(document.getElementById('sketch-memsec').value, 10) || 5;
            skSetState('memorize');
            skShowMsg(isTraining ? 'トレーニング：左の画像を見ながら、右にアタリを取ろう…' : 'よく見て覚えてください…');
            skCountdown.style.display = 'block'; skCountdown.textContent = sec;
            skMemTimer = setInterval(function(){
                sec--;
                if (sec <= 0) {
                    skCancelMemory();
                    // タイマー終了ちょうどに線を引いている最中なら、そのストロークが終わるまで
                    // 「薄く＆隠す」を保留する（描いてる途中で線がブツ切れ・半端に薄くなるのを防ぐ）。
                    if (skDrawing) { skPendingMemHide = { training: !!isTraining }; }
                    else { skApplyMemHide(!!isTraining); }
                } else { skCountdown.textContent = sec; }
            }, 1000);
        };
        // 記憶/トレーニングの「隠す」処理本体（覚える時間が終わった瞬間に呼ぶ）。
        // 覚える間に描いた当たり線は薄い下描き化＋グリッド消し（トレーニング中は必ず実行）。
        function skApplyMemHide(isTraining){
            if (skMemFade || isTraining) { skFadeOnce(0.2); skGridOff(); } // 0.2≒「薄く」2〜3回分
            skSetState('hidden');
            skShowMsg(isTraining
                ? '記憶を頼りに描こう！描けたら「重ねる」や「答え合わせ」で確認'
                : (skMemFade ? '記憶を頼りに描こう（下描きは薄くしました）' : '記憶を頼りに描いてみよう！描けたら「答え合わせ」'));
            setTimeout(function(){ skShowMsg(''); }, 3500);
        }
        // ── トレーニングモード（上バーのアイコン）──────────────────────
        // ①現在の画像を「並べる」表示 → ②グリッド表示 → ③記憶発動（覚える間にアタリ）
        // → ④時間後に自動でアタリを薄く＆グリッドを消し、記憶を頼りに描く。
        // ⑤あとはユーザーが「重ねる」や「答え合わせ」で見比べる、までを一気に用意する。
        window.skStartTraining = function(){
            skCloseMenus();
            if (skFormenOn) skSetFormen(false);
            skStopTimer();
            if (!skHasRefImage()) { skFlash('先に画像を読み込んでください（「画像」から）', 2800); return; }
            // ① 並べる表示に切り替え（既に並べるなら何もしない）
            if (!skSide) {
                skSide = true;
                window.CroquisStore.setRaw(window.CROQUIS_KEYS.SKETCH_SIDE, '1', 'スケッチ表示位置');
                skApplyLayout(true);
            }
            // ② グリッド表示（オフなら 3×3 から）
            if (skGrid <= 0) {
                skGrid = 3;
                window.CroquisStore.setRaw(window.CROQUIS_KEYS.SKETCH_GRID, '3', 'スケッチのグリッド');
                const gb = document.getElementById('sketch-grid-btn');
                if (gb) { gb.classList.add('accent'); gb.title = 'グリッド 3×3'; }
                skRenderGrid();
            }
            // ③④ 記憶発動（トレーニング扱い：終了時に必ず薄く＋グリッド消し）
            window.skStartMemory(true);
        };
        function skCancelMemory(){ skPendingMemHide = null; if (skMemTimer) { clearInterval(skMemTimer); skMemTimer = null; } skCountdown.style.display = 'none'; }
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
        window.skNextImage = function(fromTimer){
            skCommitSketchCount(); // 今の絵を描き終えた＝1枚としてカウント
            skCancelMemory();
            if (skFormenOn) skSetFormen(false);
            skClearRef();        // 参考画像の上書きを解除してプールに戻す
            skResetZoom();       // 次の絵では等倍から
            nextImage();
            skSyncImage();
            skClearSilent();
            skSetState('free');
            if (skTimerOn && !fromTimer) skRunTimer(); // 手動で「次」→ 制限時間を仕切り直し
        };
        window.skPrevImage = function(){
            if (typeof prevImage !== 'function') return;
            // 履歴の先頭なら戻れない。ここでキャンバスを消さないよう先に弾く
            if (typeof historyPos !== 'undefined' && historyPos <= 0) { skFlash('これより前の絵はありません', 1600); return; }
            skCommitSketchCount();
            skCancelMemory();
            if (skFormenOn) skSetFormen(false);
            skClearRef();
            skResetZoom();       // 戻った絵では等倍から
            prevImage();         // 履歴を1つ戻る（通常モードと共通）
            skSyncImage();
            skClearSilent();
            skSetState('free');
            if (skTimerOn) skRunTimer(); // 手動操作なので制限時間を仕切り直し
        };

        /* ── 取り消し / やり直し ──
           現在の確定キャンバスを skCurSnap(dataURL) に“同期で”常に保持し、それを基準に undo/redo する。
           ・描き出し時に toDataURL しない＝描き始めが軽い
           ・undo は再読み取りせず skCurSnap を使う＝連打しても履歴が壊れない（空フレーム混入を防止） */
        const SK_HIST_MAX = 25;
        function skSnap(){ try { return skCanvas.toDataURL(); } catch(_) { return null; } }
        function skCommitSnap(){ skCurSnap = skSnap(); } // 確定状態を記録（描き終わり・消去・薄く・リサイズ後などに呼ぶ）
        function skRestore(data){
            const gen = ++skRestoreGen; // 連打時に古い非同期描画を捨てるための世代番号
            skCtx.clearRect(0, 0, skCW, skCH);
            if (!data) return;
            const im = new Image();
            im.onload = function(){
                if (gen !== skRestoreGen) return; // 最新の復元だけ反映（チラつき・順序乱れ防止）
                skCtx.clearRect(0, 0, skCW, skCH);
                skCtx.drawImage(im, 0, 0, skCW, skCH);
            };
            im.src = data;
        }
        function skPushUndo(){ // 直前の確定状態を undo に積む（描き出し直前に呼ぶ）
            if (skCurSnap === null) return;
            skUndoStack.push(skCurSnap);
            if (skUndoStack.length > SK_HIST_MAX) skUndoStack.shift();
        }
        window.skUndo = function(){
            if (!skUndoStack.length) return;
            if (skCurSnap !== null) { skRedoStack.push(skCurSnap); if (skRedoStack.length > SK_HIST_MAX) skRedoStack.shift(); }
            skCurSnap = skUndoStack.pop();
            skRestore(skCurSnap);
        };
        window.skRedo = function(){
            if (!skRedoStack.length) return;
            if (skCurSnap !== null) { skUndoStack.push(skCurSnap); if (skUndoStack.length > SK_HIST_MAX) skUndoStack.shift(); }
            skCurSnap = skRedoStack.pop();
            skRestore(skCurSnap);
        };
        function skClearSilent(){ skCtx.clearRect(0, 0, skCW, skCH); skLiveCtx.clearRect(0, 0, skCW, skCH); skUndoStack = []; skRedoStack = []; skDrew = false; skCommitSnap(); }
        window.skClear = function(){ skPushUndo(); skRedoStack = []; skCtx.clearRect(0, 0, skCW, skCH); skDrew = false; skCommitSnap(); };
        // 道具の切り替え（ペン / 消しゴム / 投げ縄塗り / 投げ縄塗り・薄）
        function skSetTool(t){
            skTool = t;
            skEraser = (t === 'eraser'); // 既存コードは skEraser を見るので連動
            const active = { eraser: 'sketch-eraser-btn', lasso: 'sketch-lasso-btn', lassoLight: 'sketch-lassolight-btn' }[t];
            ['sketch-eraser-btn', 'sketch-lasso-btn', 'sketch-lassolight-btn'].forEach(function(id){
                const b = document.getElementById(id); if (b) b.classList.toggle('accent', id === active);
            });
        }
        function skNudgeSize(d){ // ペンの太さを増減（PCの [ ] キー用）
            const s = document.getElementById('sketch-size'); if (!s) return;
            s.value = Math.max(+s.min, Math.min(+s.max, (+s.value) + d));
            skUpdateBrushPreview();
            skFlash('太さ ' + s.value, 900);
        }
        window.skToggleEraser = function(){ skSetTool(skTool === 'eraser' ? 'pen' : 'eraser'); };
        window.skSetLasso = function(light){
            const want = light ? 'lassoLight' : 'lasso';
            skSetTool(skTool === want ? 'pen' : want);
            if (skTool === want) skFlash(light ? '投げ縄塗り（薄め）：囲んだ中を薄く塗ります' : '投げ縄塗り：囲んだ中をまとめて塗ります', 2200);
        };
        window.skToggleStabilizer = function(){
            skStab = !skStab;
            window.CroquisStore.setRaw(window.CROQUIS_KEYS.SKETCH_STAB, skStab ? '1' : '0', 'スケッチの手ブレ補正');
            const b = document.getElementById('sketch-stab-btn'); if (b) b.classList.toggle('accent', skStab);
            skFlash(skStab ? '手ブレ補正 ON（指描きが滑らかに）' : '手ブレ補正 OFF', 1600);
        };
        window.skSetStabStrength = function(v){
            skStabStr = Math.min(9, Math.max(1, parseInt(v, 10) || 5));
            skStabK = 0.9 - (skStabStr - 1) * 0.095; // 強いほどKは小さく（寄せが強い）
            window.CroquisStore.setRaw(window.CROQUIS_KEYS.SKETCH_STAB_STR, String(skStabStr), 'スケッチの補正強さ');
            if (!skStab) skToggleStabilizer(); // 強さを動かしたら補正は自動でON（迷わないように）
        };
        // 紙（描画ステージの背景）の色を変える。明暗練習の中間色や、クリーム紙にも。
        function skApplyPaper(){
            skStage.style.background = skPaper;
            document.querySelectorAll('.sk-paper').forEach(function(b){ b.classList.toggle('on', b.getAttribute('data-bg') === skPaper); });
        }
        window.skSetPaper = function(bg){
            skPaper = bg || '#000000';
            window.CroquisStore.setRaw(window.CROQUIS_KEYS.SKETCH_PAPER, skPaper, 'スケッチの紙の色');
            skApplyPaper();
        };
        window.skToggleMemFade = function(){ // 記憶モードで隠す瞬間に下描き化＋グリッド消去
            skMemFade = !skMemFade;
            window.CroquisStore.setRaw(window.CROQUIS_KEYS.SKETCH_MEMFADE, skMemFade ? '1' : '0', '記憶時の下描き化');
            const b = document.getElementById('sketch-memfade-btn'); if (b) b.classList.toggle('accent', skMemFade);
            skFlash(skMemFade ? '記憶：隠す瞬間に当たり線を下描き化＋グリッド消去 ON' : 'OFF（描いた線はそのまま）', 1800);
        };
        window.skToggleCompare = function(){ // 制限時間タイマーで見比べ時間を入れる
            skCmpOn = !skCmpOn;
            window.CroquisStore.setRaw(window.CROQUIS_KEYS.SKETCH_CMP, skCmpOn ? '1' : '0', 'タイマーの見比べ時間');
            const b = document.getElementById('sketch-cmp-btn'); if (b) b.classList.toggle('accent', skCmpOn);
            skFlash(skCmpOn ? 'タイマー：時間切れで見比べタイムを入れる ON' : '即・次の絵へ（見比べ無し）', 1800);
        };
        window.skToggleLassoFillPreview = function(){
            skLassoFillPreview = !skLassoFillPreview;
            window.CroquisStore.setRaw(window.CROQUIS_KEYS.SKETCH_LASSOPREV, skLassoFillPreview ? '1' : '0', '投げ縄の塗り予測');
            const b = document.getElementById('sketch-lassoprev-btn'); if (b) b.classList.toggle('accent', skLassoFillPreview);
            skFlash(skLassoFillPreview ? '投げ縄：塗られる範囲を予測表示 ON' : '投げ縄：予測なし（なぞり線だけ）', 1900);
        };
        function skSyncSettingsBtns(){ // 設定タブのトグルの見た目を今の状態に合わせる
            const map = [['sketch-stab-btn', skStab], ['sketch-memfade-btn', skMemFade], ['sketch-cmp-btn', skCmpOn], ['sketch-lassoprev-btn', skLassoFillPreview]];
            map.forEach(function(p){ const b = document.getElementById(p[0]); if (b) b.classList.toggle('accent', p[1]); });
            const sr = document.getElementById('sketch-stab-strength'); if (sr) sr.value = String(skStabStr);
        }
        /* ── 上バーから開くメニュー（画像読み込み / 練習）。普段は隠す ── */
        const SK_POPS = [['sketch-images-pop', 'sketch-images-btn'], ['sketch-practice-pop', 'sketch-practice-tab'], ['sketch-refhide-pop', 'sketch-refhide-btn']];
        function skCloseMenus(){
            SK_POPS.forEach(function(pr){
                const p = document.getElementById(pr[0]); if (p) p.classList.remove('open');
                const b = document.getElementById(pr[1]); if (b) b.classList.remove('accent');
            });
        }
        function skCloseSettings(){ skCloseMenus(); } // 互換用エイリアス（描き始め時などに閉じる）
        function skAnyMenuOpen(){ return SK_POPS.some(function(pr){ const p = document.getElementById(pr[0]); return !!(p && p.classList.contains('open')); }); }
        // popId のメニューを開閉（他のメニューは閉じる）。btnId のボタンをアクセント表示にする。
        function skToggleMenu(popId, btnId){
            const p = document.getElementById(popId); if (!p) return;
            const willOpen = !p.classList.contains('open');
            skCloseMenus();
            if (willOpen) { p.classList.add('open'); const b = document.getElementById(btnId); if (b) b.classList.add('accent'); }
        }
        window.skToggleImages   = function(){ skToggleMenu('sketch-images-pop', 'sketch-images-btn'); };
        window.skTogglePractice = function(){ skToggleMenu('sketch-practice-pop', 'sketch-practice-tab'); };
        // フォルダ/画像ファイルの読み込みは、通常画面の隠しinputを流用（描画モードからも使える）
        window.skLoadFolder = function(){ skCloseMenus(); const el = document.getElementById('folder-input'); if (el) el.click(); };
        window.skLoadFiles  = function(){ skCloseMenus(); const el = document.getElementById('file-input');   if (el) el.click(); };
        // フォルダ/ファイルを読み込んだ直後に呼ばれる（app.js から）。描画モードなら新しい画像で仕切り直し。
        window.skOnPoolLoaded = function(){
            if (!skOpen) return;
            skClearRef(); skSyncImage(); skClearSilent(); skSetState('free');
            skFlash('画像を読み込みました（' + (images.length || 0) + '枚）', 2200);
        };
        window.skLoadFavorites = function(){
            skCloseMenus();
            if (typeof dbFavImages === 'undefined' || !dbFavImages || dbFavImages.length === 0) { skFlash('お気に入りがありません（★で登録できます）', 2800); return; }
            skClearRef();
            isFavMode = true; showFavsOnly = false; showHiddenOnly = false;
            if (settings.shuffle) shuffleArray(dbFavImages);
            else dbFavImages.sort(function(a, b){ return a.name < b.name ? -1 : 1; });
            images = dbFavImages;
            currentIndex = 0; historyList = [0]; historyPos = 0;
            loadImage(); if (typeof updateImageCounter === 'function') updateImageCounter();
            skSyncImage(); skClearSilent(); skSetState('free');
            skFlash('お気に入りで練習します（' + images.length + '枚）', 2400);
        };
        /* ── 下のタブ切り替え（全パネル同じ高さ＝キャンバスは伸縮しないので描画は保持される） ── */
        window.skSetTab = function(name){
            document.querySelectorAll('#sk-tabbar .sk-tab').forEach(function(t){ t.classList.toggle('active', t.getAttribute('data-tab') === name); });
            document.querySelectorAll('#sk-tabbody .sk-panel').forEach(function(p){ p.classList.toggle('active', p.getAttribute('data-tab') === name); });
            if (name === 'settings') { skSyncSettingsBtns(); skApplyPaper(); } // 設定タブは現在値を反映
            if (name === 'view') skSyncViewBtns();                            // 表示タブはグリッド色・濃さ・コントラストを反映
        };
        // ペンの色・濃さを一括反映（スウォッチ/カスタム色/濃さスライダー/復元で共用）
        function skApplyPenColor(c, a, save){
            skColor = c;
            skAlpha = Math.max(0.1, Math.min(1, (typeof a === 'number') ? a : parseFloat(a) || 1));
            if (save !== false) window.CroquisStore.setRaw(window.CROQUIS_KEYS.SKETCH_COLOR, skColor + '|' + skAlpha, 'ペンの色');
            if (skTool !== 'pen') skSetTool('pen'); // 色を選んだらペンに戻す（消し/投げ縄から復帰）
            const al = document.getElementById('sketch-alpha'); if (al) al.value = String(Math.round(skAlpha * 100));
            skUpdateBrushPreview();
        }
        // 今のペン（色・太さ・濃さ）の見本ドットを更新
        function skUpdateBrushPreview(){
            const dot = document.querySelector('#sketch-brush-preview .sk-brush-dot');
            if (!dot) return;
            const szEl = document.getElementById('sketch-size');
            const sz = szEl ? (parseInt(szEl.value, 10) || 5) : 5;
            const d = Math.max(3, Math.min(24, sz));
            dot.style.width = d + 'px'; dot.style.height = d + 'px';
            dot.style.background = skColor; dot.style.opacity = String(skAlpha);
        }
        window.skUpdateBrushPreview = skUpdateBrushPreview; // bindings.js から太さスライダーで呼ぶため公開
        document.querySelectorAll('.sk-color').forEach(function(b){
            b.addEventListener('click', function(){
                document.querySelectorAll('.sk-color').forEach(function(x){ x.classList.remove('on'); });
                b.classList.add('on');
                const wrap = document.getElementById('sketch-customcolor-wrap'); if (wrap) wrap.classList.remove('on');
                skApplyPenColor(b.getAttribute('data-c'), parseFloat(b.getAttribute('data-a') || '1'));
            });
        });
        // カスタム色（好きな色を選ぶ）。今の濃さは維持する
        window.skSetCustomColor = function(v){
            document.querySelectorAll('.sk-color').forEach(function(x){ x.classList.remove('on'); });
            const wrap = document.getElementById('sketch-customcolor-wrap'); if (wrap) wrap.classList.add('on');
            skApplyPenColor(v, skAlpha);
        };
        // ペンの濃さスライダー（どの色でも薄く＝当たり取りに）
        window.skSetAlpha = function(v){
            skAlpha = Math.max(0.1, Math.min(1, (parseInt(v, 10) || 100) / 100));
            window.CroquisStore.setRaw(window.CROQUIS_KEYS.SKETCH_COLOR, skColor + '|' + skAlpha, 'ペンの色');
            skUpdateBrushPreview();
        };

        /* ── 描画本体（半透明ペンはライブレイヤーに描き、ストローク確定時に合成） ── */
        function skPos(e){
            // getBoundingClientRect はズーム後の矩形を返すので、画面距離をズーム率で割れば
            // キャンバス内の素の座標（0..skCW）に戻る。パンも rect 側に含まれるので追加補正は不要。
            // 並べる時は描画キャンバスは等倍（お手本だけ拡大する）ので 1 で割る。
            const r = skCanvas.getBoundingClientRect();
            const z = skSide ? 1 : skZoom;
            return { x: (e.clientX - r.left) / z, y: (e.clientY - r.top) / z };
        }
        /* ── お手本のピンチズーム ──
           重ねる：お手本＋描画レイヤーを一緒に拡大（なぞり用）。
           並べる：お手本ズーム層（左半分）だけ拡大（観察用）。描画側は等倍のまま。 */
        function skApplyZoom(){
            const iw = document.getElementById('sketch-imgwrap');
            const dw = document.getElementById('sketch-zoomwrap');
            if (skZoom <= 1.001) { skZoom = 1; skPanX = 0; skPanY = 0; }
            const t = (skZoom <= 1.001) ? '' : 'translate(' + skPanX.toFixed(1) + 'px,' + skPanY.toFixed(1) + 'px) scale(' + skZoom.toFixed(3) + ')';
            if (iw) iw.style.transform = t;                 // お手本層は常に拡大
            if (dw) dw.style.transform = skSide ? '' : t;   // 描画層は重ねる時だけ一緒に拡大
            const chip = document.getElementById('sketch-zoom-chip');
            if (chip) {
                if (skZoom > 1.001) { chip.textContent = '🔍 ' + (skSide ? 'お手本 ' : '') + '×' + skZoom.toFixed(1) + '　タップで等倍'; chip.classList.add('show'); }
                else chip.classList.remove('show');
            }
        }
        function skClampPan(){
            const r = skStage.getBoundingClientRect();
            if (skZoom <= 1) { skZoom = 1; skPanX = 0; skPanY = 0; return; }
            // 拡大した中身が領域を覆うようパン量を制限（端に隙間が出ない）。並べる時のお手本は左半分。
            const contentW = skSide ? r.width / 2 : r.width;
            skPanX = Math.min(0, Math.max(contentW - contentW * skZoom, skPanX));
            skPanY = Math.min(0, Math.max(r.height - r.height * skZoom, skPanY));
        }
        window.skResetZoom = function(){ skZoom = 1; skPanX = 0; skPanY = 0; skApplyZoom(); };
        // キーボード/ボタン用：拡大の中心はズーム領域の中央（並べる時はお手本＝左半分の中央）
        function skZoomStep(factor){ const r = skStage.getBoundingClientRect(); skZoomAt(skSide ? r.width / 4 : r.width / 2, r.height / 2, factor); }
        function skZoomAt(stageX, stageY, factor){
            const cx = (stageX - skPanX) / skZoom, cy = (stageY - skPanY) / skZoom; // ズーム中心の中身座標
            skZoom = Math.max(1, Math.min(6, skZoom * factor));
            skPanX = stageX - cx * skZoom; skPanY = stageY - cy * skZoom;
            skClampPan(); skApplyZoom();
        }
        function skTargetCtx(){ return (skLiveActive ? skLiveCtx : skCtx); }
        function skBeginStroke(e){
            if (skAnyMenuOpen()) { skCloseMenus(); return; } // メニューを開いている間の最初のタップは「閉じるだけ」（誤描き防止）
            skPushUndo(); skRedoBackup = skRedoStack; skRedoStack = [];
            skDrawing = true;
            if (skTool === 'lasso' || skTool === 'lassoLight') { // 投げ縄塗り：頂点を集める（描画はライブ層にプレビュー）
                skLiveActive = false;
                const lp = skPos(e); skLassoPts = [{ x: lp.x, y: lp.y }];
                skLive.style.opacity = '1';
                return;
            }
            skLiveActive = (!skEraser && skAlpha < 1);
            if (skLiveActive) { skLiveCtx.clearRect(0, 0, skCW, skCH); skLive.style.opacity = String(skAlpha); }
            const c = skTargetCtx();
            const p = skPos(e);
            skLastX = p.x; skLastY = p.y; skPrevMidX = p.x; skPrevMidY = p.y; // 中点法の起点
            skStabX = p.x; skStabY = p.y;                                     // 補正の起点
            skRawLastX = p.x; skRawLastY = p.y;                               // 補正前の実位置
            c.globalCompositeOperation = skEraser ? 'destination-out' : 'source-over';
            c.strokeStyle = skColor;
            const size = parseInt(document.getElementById('sketch-size').value, 10) || 5;
            c.lineWidth = skEraser ? size * 3 : size;
            c.beginPath();
            c.moveTo(p.x, p.y);
            c.lineTo(p.x + 0.01, p.y + 0.01); // 点（タップ）でも描点が残るように
            c.stroke();
        }
        function skStrokeMove(e){
            if (skLassoPts) { skLassoMove(e); return; } // 投げ縄塗り中
            const c = skTargetCtx();
            const events = (typeof e.getCoalescedEvents === 'function') ? e.getCoalescedEvents() : [e];
            c.globalCompositeOperation = skEraser ? 'destination-out' : 'source-over';
            c.strokeStyle = skColor;
            const size = parseInt(document.getElementById('sketch-size').value, 10) || 5;
            for (let i = 0; i < events.length; i++) {
                const raw = skPos(events[i]);
                let px = raw.x, py = raw.y;
                skRawLastX = raw.x; skRawLastY = raw.y; // 補正前の実位置を控える（離した時に終点を合わせる）
                if (skStab) { // 入力点を直前位置へ寄せて揺れを均す（指描きの線が滑らかに）
                    skStabX += (raw.x - skStabX) * skStabK; skStabY += (raw.y - skStabY) * skStabK;
                    px = skStabX; py = skStabY;
                }
                const pw = (events[i].pointerType === 'pen' && events[i].pressure > 0) ? (0.4 + events[i].pressure * 1.2) : 1;
                c.lineWidth = (skEraser ? size * 3 : size) * pw;
                // 中点法：直前中点→今回中点を、実サンプル点を制御点にした2次曲線でつなぐ（なめらか）
                const midX = (skLastX + px) / 2, midY = (skLastY + py) / 2;
                c.beginPath();
                c.moveTo(skPrevMidX, skPrevMidY);
                c.quadraticCurveTo(skLastX, skLastY, midX, midY);
                c.stroke();
                skPrevMidX = midX; skPrevMidY = midY;
                skLastX = px; skLastY = py;
            }
        }
        function skEndStroke(){
            if (!skDrawing) return;
            skDrawing = false;
            if (skLassoPts) { skLassoCommit(); return; } // 投げ縄塗りを確定
            skDrew = true; // 線を1本でも引いた（統計の「描いた枚数」判定用）
            // 最後の中点から指/ペンを離した点まで線を伸ばす（中点法で残る僅かな隙間を埋める）。
            // 補正ONのときは補正後の点が実位置より遅れているので、終点は“本当に離した位置”へ合わせる
            // （こうしないと素早い線が途中で切れて短く見える＝補正が効いていないように感じる原因）。
            const c = skTargetCtx();
            const endX = skStab ? skRawLastX : skLastX, endY = skStab ? skRawLastY : skLastY;
            c.beginPath(); c.moveTo(skPrevMidX, skPrevMidY); c.lineTo(endX, endY); c.stroke();
            if (skLiveActive) {
                skCtx.globalCompositeOperation = 'source-over';
                skCtx.globalAlpha = skAlpha;
                try { skCtx.drawImage(skLive, 0, 0, skCW, skCH); } catch(e){ console.warn("croquis: 描画の合成に失敗", e); }
                skCtx.globalAlpha = 1;
                skLiveCtx.clearRect(0, 0, skCW, skCH);
                skLive.style.opacity = '1';
                skLiveActive = false;
            }
            // 消しゴム後は destination-out が残るので必ず通常合成へ戻す
            // （これを忘れると次の「薄く」やリサイズ復元が消去動作になってしまう）
            skCtx.globalCompositeOperation = 'source-over';
            skCommitSnap(); // 描き終わりの確定状態を記録（pen up時なので体感の引っかかり無し）
            skFlushPendingMemHide(); // タイマー終了で保留していた「薄く＆隠す」があればここで実行
        }
        // タイマー終了ちょうどに線を引いていて保留した「薄く＆隠す」を、ストローク完了時に実行する
        function skFlushPendingMemHide(){
            if (!skPendingMemHide) return;
            const m = skPendingMemHide; skPendingMemHide = null;
            skApplyMemHide(m.training);
        }
        function skCancelStroke(){
            if (!skDrawing) return;
            skDrawing = false;
            skRedoStack = skRedoBackup; // 描き始めで消したやり直し履歴を復元（2/3本指ジェスチャー時）
            if (skLassoPts) { // 投げ縄を中断（本体未変更なのでスナップを捨てるだけ）
                skLassoPts = null; skLiveCtx.clearRect(0, 0, skCW, skCH); skLive.style.opacity = '1';
                skUndoStack.pop(); skFlushPendingMemHide(); return;
            }
            if (skLiveActive) {
                skLiveCtx.clearRect(0, 0, skCW, skCH);
                skLive.style.opacity = '1';
                skLiveActive = false;
                skUndoStack.pop(); // ストローク開始時のスナップは不要（本体未変更）
            } else {
                skUndoStack.pop();            // 開始時に積んだスナップは破棄
                skRestore(skCurSnap);         // 描きかけを捨てて開始前の確定状態へ戻す
            }
            skFlushPendingMemHide(); // タイマー終了で保留していた処理があれば実行
        }
        // 投げ縄塗り：なぞっている線（軌跡）は常に表示。設定ONなら「塗られる範囲」を
        // 半透明シルエット＋閉じる線で予測表示（最初の実装の挙動）。OFFなら軌跡だけ。
        function skLassoMove(e){
            const events = (typeof e.getCoalescedEvents === 'function') ? e.getCoalescedEvents() : [e];
            for (let i = 0; i < events.length; i++) { const p = skPos(events[i]); skLassoPts.push({ x: p.x, y: p.y }); }
            skLiveCtx.clearRect(0, 0, skCW, skCH);
            if (skLassoPts.length < 2) return;
            skLiveCtx.beginPath();
            skLiveCtx.moveTo(skLassoPts[0].x, skLassoPts[0].y);
            for (let i = 1; i < skLassoPts.length; i++) skLiveCtx.lineTo(skLassoPts[i].x, skLassoPts[i].y);
            if (skLassoFillPreview && skLassoPts.length >= 3) {
                // 塗り予測：閉じて半透明で塗る＋始点へ戻る点線
                skLiveCtx.save();
                skLiveCtx.closePath();
                skLiveCtx.globalAlpha = (skTool === 'lassoLight') ? 0.16 : 0.34;
                skLiveCtx.fillStyle = skColor; skLiveCtx.fill();
                skLiveCtx.globalAlpha = 1;
                skLiveCtx.setLineDash([6, 4]); skLiveCtx.lineWidth = 1.5; skLiveCtx.strokeStyle = skColor; skLiveCtx.stroke();
                skLiveCtx.restore();
            } else {
                // 通常：なぞった軌跡だけを細い実線で
                skLiveCtx.globalAlpha = 1; skLiveCtx.setLineDash([]);
                skLiveCtx.lineWidth = 1.5; skLiveCtx.strokeStyle = skColor;
                skLiveCtx.stroke();
            }
        }
        // 投げ縄塗り：指/ペンを離したら、囲んだ多角形を一括で塗る（薄バージョンは透明度低め）
        function skLassoCommit(){
            const pts = skLassoPts; skLassoPts = null;
            skLiveCtx.clearRect(0, 0, skCW, skCH);
            if (!pts || pts.length < 3) { skUndoStack.pop(); return; } // 塗りにならない→開始時スナップを取り消す
            skCtx.save();
            skCtx.globalCompositeOperation = 'source-over';
            skCtx.beginPath();
            skCtx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) skCtx.lineTo(pts[i].x, pts[i].y);
            skCtx.closePath();
            skCtx.fillStyle = skColor;
            skCtx.globalAlpha = (skTool === 'lassoLight') ? 0.3 : 1;
            skCtx.fill();
            skCtx.restore();
            skDrew = true;
            skCommitSnap();
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
            // 1本指でも preventDefault する。iOS Safari はこれを止めないと、長押しで
            // 文字選択・コールアウト・虫眼鏡（青い選択マーカー）が出て描画が乱れる。
            // 実際の描画は pointer イベント側で行うので、ここで止めても線は引ける。
            e.preventDefault();
            const n = e.touches.length;
            if (n > gFingerMax) gFingerMax = n;
            if (n === 1) {
                gStart = Date.now(); gMoved = false;
                gStartX = e.touches[0].clientX; gStartY = e.touches[0].clientY;
            } else {
                skCancelStroke();     // 2本指以上はジェスチャ → 描きかけ取消
                if (e.touches.length === 2 && !skSide) { // 2本指 → ピンチズーム開始（重ねるモードのみ）
                    const t0 = e.touches[0], t1 = e.touches[1];
                    const rect = skStage.getBoundingClientRect();
                    skPinchActive = true;
                    skPinchStartDist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY) || 1;
                    skPinchStartZoom = skZoom;
                    const midX = (t0.clientX + t1.clientX) / 2 - rect.left;
                    const midY = (t0.clientY + t1.clientY) / 2 - rect.top;
                    skPinchCX = (midX - skPanX) / skZoom; // ピンチ中心の中身座標（指の間に固定する点）
                    skPinchCY = (midY - skPanY) / skZoom;
                }
            }
        }, { passive: false });
        skCanvas.addEventListener('touchmove', function(e){
            e.preventDefault();   // 指の移動中もスクロール/選択を抑止（描画はpointer側）
            if (skPinchActive && e.touches.length === 2) { // ピンチ：拡大＋パン（指の中点を中身に固定）
                const t0 = e.touches[0], t1 = e.touches[1];
                const rect = skStage.getBoundingClientRect();
                const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY) || 1;
                const midX = (t0.clientX + t1.clientX) / 2 - rect.left;
                const midY = (t0.clientY + t1.clientY) / 2 - rect.top;
                skZoom = Math.max(1, Math.min(6, skPinchStartZoom * (dist / skPinchStartDist)));
                skPanX = midX - skPinchCX * skZoom;
                skPanY = midY - skPinchCY * skZoom;
                skClampPan(); skApplyZoom();
                gMoved = true; // ピンチ後にうっかり「2本指タップ＝元に戻す」が出ないように
                return;
            }
            if (e.touches.length >= 1) {
                const dx = e.touches[0].clientX - gStartX, dy = e.touches[0].clientY - gStartY;
                if (Math.hypot(dx, dy) > 16) gMoved = true;
            }
        }, { passive: false });
        function skGestureEnd(e){
            if (e.touches.length < 2) skPinchActive = false; // 2本未満になったらピンチ終了
            if (e.touches.length > 0) return;   // まだ指が残っている
            const n = gFingerMax, dur = Date.now() - gStart;
            gFingerMax = 0;
            if (n === 2 && !gMoved && dur < 900) {
                skUndo(); skShowMsg('元に戻す');
                setTimeout(function(){ skShowMsg(''); }, 800);
            }
        }
        skCanvas.addEventListener('touchend', skGestureEnd, { passive: false });
        skCanvas.addEventListener('touchcancel', skGestureEnd, { passive: false });
        // PC：ホイールでカーソル位置を中心に拡大／縮小（重ねる＝全体、並べる＝お手本だけ）
        skStage.addEventListener('wheel', function(e){
            if (!skOpen) return;
            e.preventDefault();
            const rect = skStage.getBoundingClientRect();
            skZoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.12 : 1 / 1.12);
        }, { passive: false });
        // ズームチップ（タップで等倍に戻す）
        (function(){ const chip = document.getElementById('sketch-zoom-chip'); if (chip) chip.addEventListener('click', function(){ skResetZoom(); }); })();
        // 並べるモード：お手本（左半分）を2本指ピンチで拡大／パン（描画は右の等倍キャンバスのまま）
        (function(){
            const iw = document.getElementById('sketch-imgpinch');
            if (!iw) return;
            let igActive = false, igDist = 0, igZoom0 = 1, igCX = 0, igCY = 0;
            iw.addEventListener('touchstart', function(e){
                if (!skOpen || !skSide) return;
                e.preventDefault(); // iOSの画像長押しメニュー等を抑止
                if (e.touches.length === 2) {
                    const t0 = e.touches[0], t1 = e.touches[1], rect = skStage.getBoundingClientRect();
                    igActive = true;
                    igDist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY) || 1;
                    igZoom0 = skZoom;
                    const midX = (t0.clientX + t1.clientX) / 2 - rect.left, midY = (t0.clientY + t1.clientY) / 2 - rect.top;
                    igCX = (midX - skPanX) / skZoom; igCY = (midY - skPanY) / skZoom;
                }
            }, { passive: false });
            iw.addEventListener('touchmove', function(e){
                if (!igActive || !skSide || e.touches.length < 2) return;
                e.preventDefault();
                const t0 = e.touches[0], t1 = e.touches[1], rect = skStage.getBoundingClientRect();
                const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY) || 1;
                const midX = (t0.clientX + t1.clientX) / 2 - rect.left, midY = (t0.clientY + t1.clientY) / 2 - rect.top;
                skZoom = Math.max(1, Math.min(6, igZoom0 * (dist / igDist)));
                skPanX = midX - igCX * skZoom; skPanY = midY - igCY * skZoom;
                skClampPan(); skApplyZoom();
            }, { passive: false });
            function igEnd(e){ if (e.touches.length < 2) igActive = false; }
            iw.addEventListener('touchend', igEnd, { passive: false });
            iw.addEventListener('touchcancel', igEnd, { passive: false });
        })();
        // iOSの長押し選択メニュー・コンテキストメニューを抑制
        skCanvas.addEventListener('contextmenu', function(e){ e.preventDefault(); }, { passive: false });
        skCanvas.addEventListener('selectstart', function(e){ e.preventDefault(); }, { passive: false });
        skStage.addEventListener('contextmenu', function(e){ e.preventDefault(); }, { passive: false });
        skStage.addEventListener('selectstart', function(e){ e.preventDefault(); }, { passive: false });
        // iOS Safari のピンチ（gesture系イベント）による“ページ全体のズーム”を描画中は止める
        ['gesturestart', 'gesturechange', 'gestureend'].forEach(function(ev){
            skStage.addEventListener(ev, function(e){ e.preventDefault(); }, { passive: false });
        });

        /* ── 保存（レイアウトに応じて合成） ── */
        window.skSave = function(){
            const r = skStage.getBoundingClientRect();
            const out = document.createElement('canvas');
            out.width = Math.round(r.width * 2); out.height = Math.round(r.height * 2);
            const c = out.getContext('2d');
            c.fillStyle = skPaper || '#1e1e1e'; c.fillRect(0, 0, out.width, out.height); // 紙の色で背景を塗る（画面と一致）
            const imgAreaW = skSide ? out.width / 2 : out.width;
            const cvX = skSide ? out.width / 2 : 0;
            try {
                if (skImg.style.visibility !== 'hidden' && skImg.naturalWidth > 0) {
                    const ratio = Math.min(imgAreaW / skImg.naturalWidth, out.height / skImg.naturalHeight);
                    const w = skImg.naturalWidth * ratio, h = skImg.naturalHeight * ratio;
                    c.globalAlpha = parseFloat(skImg.style.opacity || '1') || 1;
                    c.save();
                    c.translate(imgAreaW / 2, out.height / 2);
                    if (skFlipH) c.scale(-1, 1);
                    if (skFlipV) c.scale(1, -1);
                    c.filter = skImgFilterCSS(); // 反転＋モノクロ/二階調を保存にも反映
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
        // 生成した点群を、縦横比を保ったまま画面の余白枠にぴったり収める（はみ出し防止）
        function fmFit(pts, W, H){
            const m = fmMargin(W, H), bw = (W - m * 2), bh = (H - m * 2);
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            for (let i = 0; i < pts.length; i++){ const p = pts[i];
                if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
                if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; }
            const pw = (maxX - minX) || 1, ph = (maxY - minY) || 1;
            const s = Math.min(bw / pw, bh / ph);
            const offX = m + (bw - pw * s) / 2 - minX * s;
            const offY = m + (bh - ph * s) / 2 - minY * s;
            return pts.map(function(p){ return { x: p.x * s + offX, y: p.y * s + offY }; });
        }
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
        // ⑤ 飾りループ（小さな輪の連なり＝一筆書きの輪っか練習）
        function fmGarland(W, H){
            const n = 8, adv = 100 / n, a = adv / (Math.PI * 2), R = adv * 0.9;
            const total = n * Math.PI * 2, N = 640, P = [];
            for (let i = 0; i <= N; i++){ const th = total * i / N; P.push({ x: a * th - R * Math.sin(th), y: -R * Math.cos(th) }); }
            return P;
        }
        // ⑥ 三つ葉ループ（三葉結び目の形・3つの輪）
        function fmTrefoil(W, H){
            const N = 520, P = [];
            for (let i = 0; i <= N; i++){ const t = i / N * Math.PI * 2; P.push({ x: Math.sin(t) + 2 * Math.sin(2 * t), y: Math.cos(t) - 2 * Math.cos(2 * t) }); }
            return P;
        }
        // ⑦ 花びら（バラ曲線・5枚＝5つの輪）
        function fmRose(W, H){
            const k = 5, N = 540, P = [];
            for (let i = 0; i <= N; i++){ const th = i / N * Math.PI * 2, r = Math.cos(k * th); P.push({ x: r * Math.cos(th), y: r * Math.sin(th) }); }
            return P;
        }
        /* ── 基本形（Basic Forms）：観察して描くお題（SVGで自前生成） ── */
        function fmN(v){ return (Math.round(v * 10) / 10); }
        function fmCastShadow(cx, cy, rx, ry, sw){
            return '<ellipse cx="' + fmN(cx) + '" cy="' + fmN(cy) + '" rx="' + fmN(rx) + '" ry="' + fmN(ry) +
                '" fill="rgba(150,160,170,0.16)" stroke="#8a949b" stroke-width="' + fmN(sw * 0.7) +
                '" stroke-dasharray="' + fmN(sw * 2) + ' ' + fmN(sw * 2) + '"/>';
        }
        function formSphere(W, H){
            const cx = W / 2, cy = H * 0.46, R = Math.min(W, H) * 0.27, sw = Math.max(2, Math.min(W, H) * 0.006);
            const p0x = cx + 0.707 * R, p0y = cy - 0.707 * R, p2x = cx - 0.707 * R, p2y = cy + 0.707 * R;
            return fmCastShadow(cx + R * 0.35, cy + R * 1.05, R * 1.0, R * 0.26, sw)
                + '<circle cx="' + fmN(cx) + '" cy="' + fmN(cy) + '" r="' + fmN(R) + '" fill="none" stroke="#e8eef2" stroke-width="' + fmN(sw) + '"/>'
                + '<path d="M ' + fmN(p0x) + ' ' + fmN(p0y) + ' Q ' + fmN(cx + R * 0.45) + ' ' + fmN(cy + R * 0.45) + ' ' + fmN(p2x) + ' ' + fmN(p2y) + '" fill="none" stroke="#9fb0bb" stroke-width="' + fmN(sw * 0.85) + '"/>';
        }
        function formBox(W, H){
            const cx = W / 2, cy = H / 2, s = Math.min(W, H) * 0.27, sw = Math.max(2, Math.min(W, H) * 0.006);
            const wx = s * 0.95, wy = s * 0.5, h = s * 1.05, tcy = cy - h * 0.55;
            const Tb = { x: cx, y: tcy - wy }, Tl = { x: cx - wx, y: tcy }, Tf = { x: cx, y: tcy + wy }, Tr = { x: cx + wx, y: tcy };
            const Bl = { x: Tl.x, y: Tl.y + h }, Bf = { x: Tf.x, y: Tf.y + h }, Br = { x: Tr.x, y: Tr.y + h };
            const poly = function(p){ return p.map(function(q){ return fmN(q.x) + ',' + fmN(q.y); }).join(' '); };
            return '<polygon points="' + poly([Tb, Tl, Tf, Tr]) + '" fill="rgba(232,238,242,0.05)" stroke="#e8eef2" stroke-width="' + fmN(sw) + '" stroke-linejoin="round"/>'
                + '<polygon points="' + poly([Tl, Tf, Bf, Bl]) + '" fill="rgba(232,238,242,0.04)" stroke="#cfd8de" stroke-width="' + fmN(sw) + '" stroke-linejoin="round"/>'
                + '<polygon points="' + poly([Tf, Tr, Br, Bf]) + '" fill="rgba(232,238,242,0.11)" stroke="#cfd8de" stroke-width="' + fmN(sw) + '" stroke-linejoin="round"/>';
        }
        function formCylinder(W, H){
            const cx = W / 2, cy = H / 2, rx = Math.min(W, H) * 0.22, ry = rx * 0.34, h = Math.min(W, H) * 0.52, sw = Math.max(2, Math.min(W, H) * 0.006);
            const ty = cy - h / 2, by = cy + h / 2;
            return fmCastShadow(cx + rx * 0.3, by + ry * 1.4, rx * 1.15, ry * 0.9, sw)
                + '<line x1="' + fmN(cx - rx) + '" y1="' + fmN(ty) + '" x2="' + fmN(cx - rx) + '" y2="' + fmN(by) + '" stroke="#e8eef2" stroke-width="' + fmN(sw) + '"/>'
                + '<line x1="' + fmN(cx + rx) + '" y1="' + fmN(ty) + '" x2="' + fmN(cx + rx) + '" y2="' + fmN(by) + '" stroke="#e8eef2" stroke-width="' + fmN(sw) + '"/>'
                + '<ellipse cx="' + fmN(cx) + '" cy="' + fmN(by) + '" rx="' + fmN(rx) + '" ry="' + fmN(ry) + '" fill="rgba(232,238,242,0.05)" stroke="#cfd8de" stroke-width="' + fmN(sw) + '"/>'
                + '<ellipse cx="' + fmN(cx) + '" cy="' + fmN(ty) + '" rx="' + fmN(rx) + '" ry="' + fmN(ry) + '" fill="rgba(232,238,242,0.08)" stroke="#e8eef2" stroke-width="' + fmN(sw) + '"/>';
        }
        function formCone(W, H){
            const cx = W / 2, cy = H / 2, rx = Math.min(W, H) * 0.24, ry = rx * 0.34, h = Math.min(W, H) * 0.56, sw = Math.max(2, Math.min(W, H) * 0.006);
            const by = cy + h / 2, ax = cx, ay = cy - h / 2;
            return fmCastShadow(cx + rx * 0.3, by + ry * 1.4, rx * 1.15, ry * 0.9, sw)
                + '<line x1="' + fmN(ax) + '" y1="' + fmN(ay) + '" x2="' + fmN(cx - rx) + '" y2="' + fmN(by) + '" stroke="#e8eef2" stroke-width="' + fmN(sw) + '"/>'
                + '<line x1="' + fmN(ax) + '" y1="' + fmN(ay) + '" x2="' + fmN(cx + rx) + '" y2="' + fmN(by) + '" stroke="#e8eef2" stroke-width="' + fmN(sw) + '"/>'
                + '<ellipse cx="' + fmN(cx) + '" cy="' + fmN(by) + '" rx="' + fmN(rx) + '" ry="' + fmN(ry) + '" fill="rgba(232,238,242,0.06)" stroke="#e8eef2" stroke-width="' + fmN(sw) + '"/>';
        }
        function formEgg(W, H){
            const cx = W / 2, cy = H / 2, w = Math.min(W, H) * 0.20, h = Math.min(W, H) * 0.30, sw = Math.max(2, Math.min(W, H) * 0.006);
            const d = 'M ' + fmN(cx) + ' ' + fmN(cy - h)
                + ' C ' + fmN(cx + w * 0.95) + ' ' + fmN(cy - h * 0.45) + ' ' + fmN(cx + w) + ' ' + fmN(cy + h * 0.25) + ' ' + fmN(cx) + ' ' + fmN(cy + h)
                + ' C ' + fmN(cx - w) + ' ' + fmN(cy + h * 0.25) + ' ' + fmN(cx - w * 0.95) + ' ' + fmN(cy - h * 0.45) + ' ' + fmN(cx) + ' ' + fmN(cy - h) + ' Z';
            return fmCastShadow(cx + w * 0.4, cy + h * 1.08, w * 1.5, w * 0.5, sw)
                + '<path d="' + d + '" fill="rgba(232,238,242,0.06)" stroke="#e8eef2" stroke-width="' + fmN(sw) + '"/>';
        }
        function formPyramid(W, H){
            const cx = W / 2, cy = H / 2, hw = Math.min(W, H) * 0.26, hd = hw * 0.42, h = Math.min(W, H) * 0.5, sw = Math.max(2, Math.min(W, H) * 0.006);
            const ax = cx, ay = cy - h * 0.6;                              // 頂点
            const Fl = { x: cx - hw, y: cy + h * 0.4 }, Fr = { x: cx + hw, y: cy + h * 0.4 }; // 底の手前2点
            const Bb = { x: cx, y: cy + h * 0.4 - hd };                    // 底の奥（見えている）
            const poly = function(p){ return p.map(function(q){ return fmN(q.x) + ',' + fmN(q.y); }).join(' '); };
            return fmCastShadow(cx + hw * 0.3, Fl.y + hd * 0.9, hw * 1.25, hd * 1.05, sw)
                + '<polygon points="' + poly([ax, Fl, Fr]) + '" fill="rgba(232,238,242,0.11)" stroke="#e8eef2" stroke-width="' + fmN(sw) + '" stroke-linejoin="round"/>'
                + '<polygon points="' + poly([ax, Fr, Bb]) + '" fill="rgba(232,238,242,0.04)" stroke="#cfd8de" stroke-width="' + fmN(sw) + '" stroke-linejoin="round"/>'
                + '<line x1="' + fmN(ax) + '" y1="' + fmN(ay) + '" x2="' + fmN(Bb.x) + '" y2="' + fmN(Bb.y) + '" stroke="#9fb0bb" stroke-width="' + fmN(sw * 0.8) + '" stroke-dasharray="' + fmN(sw * 2) + ' ' + fmN(sw * 2) + '"/>';
        }
        function formTorus(W, H){
            const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.27, ry = R * 0.42, t = R * 0.42, sw = Math.max(2, Math.min(W, H) * 0.006);
            const irx = R - t, iry = Math.max(2, ry - t * 0.55);
            return fmCastShadow(cx + R * 0.2, cy + ry * 1.7, R * 1.1, ry * 0.7, sw)
                + '<ellipse cx="' + fmN(cx) + '" cy="' + fmN(cy) + '" rx="' + fmN(R) + '" ry="' + fmN(ry) + '" fill="rgba(232,238,242,0.06)" stroke="#e8eef2" stroke-width="' + fmN(sw) + '"/>'
                + '<ellipse cx="' + fmN(cx) + '" cy="' + fmN(cy + ry * 0.16) + '" rx="' + fmN(irx) + '" ry="' + fmN(iry) + '" fill="#000" fill-opacity="0.18" stroke="#cfd8de" stroke-width="' + fmN(sw * 0.9) + '"/>';
        }
        /* ── フラワーサック（小麦粉袋）：量感・重さの練習。
              縦長の“クッション”状の胴体＋四隅のつまんだ耳。回転/つぶしでポーズ違いに。
              （丸くならないよう、胴体の膨らみは控えめ・縦長にしている） ── */
        function sackBodyD(){
            const w = 1.0, h = 1.28, b = 0.18; // 半幅 / 半高 / 辺の膨らみ（縦長＝重さが出る）
            return 'M ' + (-w) + ' ' + (-h)
                + ' C ' + (-w * 0.42) + ' ' + (-h - b) + ' ' + (w * 0.42) + ' ' + (-h - b) + ' ' + w + ' ' + (-h)   // 上辺
                + ' C ' + (w + b) + ' ' + (-h * 0.45) + ' ' + (w + b) + ' ' + (h * 0.45) + ' ' + w + ' ' + h         // 右辺
                + ' C ' + (w * 0.42) + ' ' + (h + b) + ' ' + (-w * 0.42) + ' ' + (h + b) + ' ' + (-w) + ' ' + h       // 下辺
                + ' C ' + (-w - b) + ' ' + (h * 0.45) + ' ' + (-w - b) + ' ' + (-h * 0.45) + ' ' + (-w) + ' ' + (-h)   // 左辺
                + ' Z';
        }
        // 四隅のつまんだ耳（小さな三角フラップ）
        function sackEars(){
            const w = 1.0, h = 1.28, g = 0.34, o = 0.34;
            const ear = function(x, y, ox, oy){
                const b1x = x - ox * g, b1y = y, b2x = x, b2y = y - oy * g, ax = x + ox * o, ay = y + oy * o;
                return '<path d="M ' + fmN(b1x) + ' ' + fmN(b1y) + ' L ' + fmN(ax) + ' ' + fmN(ay) + ' L ' + fmN(b2x) + ' ' + fmN(b2y) +
                    '" fill="rgba(232,238,242,0.04)" stroke="#cfd8de" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>';
            };
            return ear(-w, -h, -1, -1) + ear(w, -h, 1, -1) + ear(w, h, 1, 1) + ear(-w, h, -1, 1);
        }
        function makeSack(rot, sx, sy){
            return function(W, H){
                const cx = W / 2, cy = H / 2, S = Math.min(W, H) * 0.21, sw = Math.max(2, Math.min(W, H) * 0.006);
                return fmCastShadow(cx, cy + S * 1.55, S * 1.4, S * 0.32, sw)
                    + '<g transform="translate(' + fmN(cx) + ' ' + fmN(cy) + ') rotate(' + rot + ') scale(' + (S * sx).toFixed(2) + ' ' + (S * sy).toFixed(2) + ')">'
                    + '<path d="' + sackBodyD() + '" fill="rgba(232,238,242,0.06)" stroke="#e8eef2" stroke-width="' + fmN(sw) + '" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>'
                    + sackEars() + '</g>';
            };
        }
        // 一筆書き（なぞり用）：点列→path＋始点ドット（緑●）。
        function fmStrokeSVG(gen, W, H){
            const pts = fmFit(gen(W, H), W, H);
            const sw = Math.max(2.5, Math.min(W, H) * 0.007), dotR = Math.max(5, Math.min(W, H) * 0.014);
            let d = 'M' + pts[0].x.toFixed(1) + ' ' + pts[0].y.toFixed(1);
            for (let i = 1; i < pts.length; i++) d += 'L' + pts[i].x.toFixed(1) + ' ' + pts[i].y.toFixed(1);
            return '<path d="' + d + '" fill="none" stroke="#00d4ff" stroke-width="' + sw.toFixed(2) + '" stroke-linecap="round" stroke-linejoin="round"/>'
                + '<circle cx="' + pts[0].x.toFixed(1) + '" cy="' + pts[0].y.toFixed(1) + '" r="' + dotR.toFixed(1) + '" fill="#39e07a" stroke="#0b3" stroke-width="1.5"/>';
        }
        // お題のデッキ（カテゴリ）。各お題は (W,H)=>SVG内部マークアップ を返す。
        const FM_STROKES = [fmLoops, fmGarland, fmEight, fmSpiral, fmTrefoil, fmRose, fmWave];
        const FM_DECKS = [
            { name: '一筆書き', trace: true, items: FM_STROKES.map(function(g){ return function(W, H){ return fmStrokeSVG(g, W, H); }; }) },
            { name: '基本形', trace: false, items: [formSphere, formBox, formCylinder, formCone, formEgg, formPyramid, formTorus] },
            { name: 'フラワーサック', trace: false, items: [makeSack(0, 1, 1), makeSack(0, 1.35, 0.72), makeSack(0, 0.8, 1.3), makeSack(20, 1.05, 0.95), makeSack(-26, 1.15, 0.85)] }
        ];
        function fmRender(){
            if (!skFormenOn || !skFormenSvg) return;
            const r = skStage.getBoundingClientRect();
            const W = Math.max(1, r.width), H = Math.max(1, r.height);
            const deck = FM_DECKS[skDeckIdx] || FM_DECKS[0];
            if (skItemIdx >= deck.items.length) skItemIdx = 0;
            skFormenSvg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
            skFormenSvg.style.opacity = String(skFormenOpacity);
            skFormenSvg.innerHTML = deck.items[skItemIdx](W, H);
            const sel = document.getElementById('sketch-deck'); if (sel) sel.value = String(skDeckIdx);
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
                skUpdateFrameGuide(); // お題中は枠を隠す
                fmRender();
                skShowMsg('お題を見て（一筆書きはなぞって）描こう。種類は左下で切替、「次のお題」で別の形');
                setTimeout(function(){ skShowMsg(''); }, 4600);
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
                    im.onload = function(){ skCtx.drawImage(im, bleft - skLeft, 0, bw, bh); skCommitSnap(); };
                    im.src = data;
                    skFormenBackup = null;
                } else { skCommitSnap(); }
                skSetState('free'); // 参考画像の表示状態を元に戻す
                skUpdateFrameGuide(); // 並べる中なら枠を再表示
            }
        }
        window.skToggleFormen = function(){ skCloseMenus(); skSetFormen(!skFormenOn); };
        window.skSetDeck = function(i){ skDeckIdx = Math.max(0, Math.min(FM_DECKS.length - 1, parseInt(i, 10) || 0)); skItemIdx = 0; skClearSilent(); fmRender(); };
        window.skFormenNext = function(){ const deck = FM_DECKS[skDeckIdx] || FM_DECKS[0]; skItemIdx = (skItemIdx + 1) % deck.items.length; skClearSilent(); fmRender(); };
        window.skSetFormenOpacity = function(v){ skFormenOpacity = Math.max(0.1, Math.min(1, (parseInt(v, 10) || 70) / 100)); if (skFormenSvg) skFormenSvg.style.opacity = String(skFormenOpacity); };

        /* ════════════════════════════════════════════════════════
           5d) すぐ隠す / 時間制限タイマー / 線を薄くする
        ════════════════════════════════════════════════════════ */
        function skFmtSec(s){ return s >= 60 ? (Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')) : (s + ''); }
        // すぐ隠す：カウントダウン無しで参考画像を即オフ（記憶で描く）。もう一度押すと表示。
        window.skToggleHide = function(){
            skCloseMenus();
            if (skFormenOn) { skFlash('お題モード中は使えません', 1800); return; }
            if (!skHasRefImage()) { skFlash('隠す画像がありません', 1800); return; }
            if (skState === 'hidden' || skState === 'reveal') { skSetState('free'); return; }
            skCancelMemory();
            skSetState('hidden'); // 「見る」でチラ見、「答え合わせ」で確認できる
            skShowMsg('画像を隠しました。記憶で描こう（見る / 答え合わせ）');
            setTimeout(function(){ skShowMsg(''); }, 3200);
        };
        // 時間制限タイマー：指定秒ごとに自動で次の絵へ（描きながらのクロッキー）
        function skClearSessionTimer(){ if (skSessionTimer) { clearInterval(skSessionTimer); skSessionTimer = null; } }
        function skCurSec(){ return parseInt(document.getElementById('sketch-memsec').value, 10) || 30; }
        // 見比べ時間の長さ（描画時間の約3割。短すぎ/長すぎないよう5〜20秒に収める）
        function skCmpSec(){ return Math.min(20, Math.max(5, Math.round(skCurSec() * 0.3))); }
        function skRunTimer(){
            skClearSessionTimer();
            let phase = 'draw', sec = skCurSec();
            skCountdown.style.display = 'block'; skCountdown.textContent = skFmtSec(sec);
            skSessionTimer = setInterval(function(){
                sec--;
                if (sec > 0) { skCountdown.textContent = (phase === 'compare' ? '見比べ ' : '') + skFmtSec(sec); return; }
                if (phase === 'draw' && skCmpOn) {
                    // 描画時間が終わったら“即次”ではなく、お手本をはっきり見せて描いた線と見比べる時間を作る
                    phase = 'compare'; sec = skCmpSec();
                    skImg.style.visibility = 'visible'; skImg.style.opacity = '1';
                    skShowMsg('お手本と見比べよう（重ねるレイアウトだと重なって比較できます／「次へ」で進む）');
                    skCountdown.textContent = '見比べ ' + skFmtSec(sec);
                    return;
                }
                // 次のポーズへ（タイマー内からの呼び出しなので仕切り直しはこの関数が担当）
                skNextImage(true);
                skShowMsg('次のポーズ！'); setTimeout(function(){ if (skTimerOn) skShowMsg(''); }, 1200);
                phase = 'draw'; sec = skCurSec();
                skCountdown.style.display = 'block'; skCountdown.textContent = skFmtSec(sec);
            }, 1000);
        }
        function skStopTimer(){
            skTimerOn = false; skClearSessionTimer();
            skCountdown.style.display = 'none';
            const b = document.getElementById('sketch-timer-btn'); if (b) b.classList.remove('accent');
        }
        window.skToggleTimer = function(){
            skCloseMenus();
            if (skTimerOn) { skStopTimer(); skShowMsg('タイマー停止'); setTimeout(function(){ skShowMsg(''); }, 1500); return; }
            if (images.length === 0) { skFlash('先に画像を読み込んでください', 2600); return; }
            if (skFormenOn) skSetFormen(false);
            skCancelMemory();
            skTimerOn = true;
            const b = document.getElementById('sketch-timer-btn'); if (b) b.classList.add('accent');
            skSetState('free');
            skShowMsg('タイマー開始：' + skFmtSec(skCurSec()) + 'ごとに次の絵へ'); setTimeout(function(){ skShowMsg(''); }, 2600);
            skRunTimer();
        };
        // 描いた線の濃さを alpha 倍にする（下描き化）。オフスクリーンに同期コピーしてから戻すので
        // 非同期の読み込み待ちが無く、連続実行でもズレない。
        function skFadeOnce(alpha){
            if (skCanvas.width <= 1 || skCanvas.height <= 1) return;
            const tmp = document.createElement('canvas');
            tmp.width = skCanvas.width; tmp.height = skCanvas.height;
            try { tmp.getContext('2d').drawImage(skCanvas, 0, 0); } catch(_){ return; }
            skPushUndo(); skRedoStack = [];
            skCtx.clearRect(0, 0, skCW, skCH);
            skCtx.globalCompositeOperation = 'source-over'; // 念のため通常合成で（消しゴム直後でも薄く描画になるよう）
            skCtx.globalAlpha = alpha;
            skCtx.drawImage(tmp, 0, 0, skCW, skCH); // tmpはデバイスpx。setTransformのdpr拡縮でCSSサイズに合う
            skCtx.globalAlpha = 1;
            skCommitSnap();
        }
        // 「🌫 薄く」ボタン：押すたび半分の濃さに（清書の下描き用）
        window.skFade = function(){
            if (skFormenOn) { skFlash('お題モード中は使えません', 1800); return; }
            skFadeOnce(0.5);
        };

        /* ════════════════════════════════════════════════════════
           5c) 参考画像を取り込む（Pinterest / pixiv 等）
              一番確実な方法は「画像をコピー → Ctrl+V」。これは画像そのもの（ピクセル）が
              渡るので、直リンク制限(pixiv等)やCORSに関係なく必ず表示できる。
              ・描画モード中の貼付/ドロップ → その場の参考画像になる
              ・通常画面での貼付/ドロップ    → 練習リスト（プール）に追加される
        ════════════════════════════════════════════════════════ */
        const SK_CORS_HOSTS  = /(^|\.)pinimg\.com$|(^|\.)wikimedia\.org$|(^|\.)metmuseum\.org$|(^|\.)artic\.edu$|(^|\.)clevelandart\.org$|(^|\.)picsum\.photos$/;
        // 画像かページURLかを判定（ページURLは img で表示できないので案内する）
        function skClassifyUrl(u){
            let host = '', path = '';
            try { const o = new URL(u); host = o.hostname.toLowerCase(); path = o.pathname.toLowerCase(); } catch(_){ return 'unknown'; }
            if (/(^|\.)pinimg\.com$|(^|\.)pximg\.net$|(^|\.)twimg\.com$|(^|\.)fbcdn\.net$|(^|\.)cdninstagram\.com$/.test(host)) return 'image';
            if (/\.(jpe?g|png|gif|webp|bmp|avif|svg)(\?|#|$)/.test(path)) return 'image';
            if (/(^|\.)pinterest\.[a-z.]+$|(^|\.)pin\.it$|(^|\.)pixiv\.net$|(^|\.)x\.com$|(^|\.)twitter\.com$|(^|\.)instagram\.com$|(^|\.)tumblr\.com$/.test(host)) return 'page';
            return 'unknown';
        }
        function skNotify(msg, isErr){
            const ms = isErr ? 4800 : 2400;
            if (skOpen) { skFlash(msg, ms); return; }
            if (typeof window.showToast === 'function') window.showToast(msg, ms); else alert(msg);
        }
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
            skImg.onerror = function(){ skImg.onerror = null; skClearRef(); skSyncImage();
                skFlash('この画像は直リンクで表示できませんでした。画像を右クリック→「画像をコピー」して Ctrl+V してください（pixiv等はこの方法が確実）', 4800); };
            skImg.src = src;
            skApplyImgFilters(); // 反転・モノクロ・二階調を手動の参考画像にも反映（transformを消さない）
            if (skFormenOn) skSetFormen(false);
            skSetState('free');
            skFlash('参考画像を表示しました', 2000);
        }
        function skSetRefUrl(u){
            u = String(u || '').trim();
            if (!/^https?:\/\//.test(u)) { skFlash('http(s) で始まる画像URLを貼り付けてください', 2600); return; }
            if (skClassifyUrl(u) === 'page') { skFlash('ページのURLのようです。画像そのものを右クリック→「画像をコピー」して Ctrl+V してください', 4800); return; }
            u = u.replace(/(pinimg\.com\/)\d+x(\/)/, '$1736x$2'); // Pinterestサムネを大きいサイズに
            let host = ''; try { host = new URL(u).hostname; } catch(_){ }
            skApplyRef(u, false, host);
        }
        function skSetRefFile(f){
            if (!f || (f.type || '').indexOf('image') !== 0) return;
            skApplyRef(URL.createObjectURL(f), true, '');
        }
        // 練習リスト（プール）に1枚追加（File でも {data:URL} でもOK）
        function skAddToPool(item){
            if (sourceImages.length === 0) { applyLoadedFiles([item]); return; }
            sourceImages.push(item); originalOrder.push(item);
            if (!isFavMode) images = sourceImages;
            if (typeof updateImageCounter === 'function') updateImageCounter();
            if (typeof updatePreloadQueue === 'function') updatePreloadQueue();
        }
        // URLが本当に表示できるか確かめてからプールに追加（ダメなら理由を案内）
        function skTestAndAddUrl(u){
            let host = ''; try { host = new URL(u).hostname; } catch(_){ }
            const big = u.replace(/(pinimg\.com\/)\d+x(\/)/, '$1736x$2');
            const test = new Image();
            if (SK_CORS_HOSTS.test(host)) test.crossOrigin = 'anonymous';
            test.onload  = function(){ skAddToPool({ name: 'paste_' + Date.now(), data: big, cors: SK_CORS_HOSTS.test(host) }); skNotify('練習リストに画像を追加しました', false); };
            test.onerror = function(){ skNotify('この画像は直リンクで表示できませんでした。画像を右クリック→「画像をコピー」して貼り付けてください（pixiv等はこの方法が確実）', true); };
            test.src = big;
        }
        // 取り込みの入口（貼付/ドロップ共通）：描画モード中は参考画像、通常はプール追加
        function skUseImageFile(f){
            if (!f || (f.type || '').indexOf('image') !== 0) return;
            if (skOpen) { skSetRefFile(f); return; }
            skAddToPool(f); skNotify('練習リストに画像を追加しました', false);
        }
        function skUseImageUrl(u){
            u = String(u || '').trim();
            if (!/^https?:\/\//.test(u)) { skNotify('http(s) で始まる画像URLを貼り付けてください', true); return; }
            if (skClassifyUrl(u) === 'page') { skNotify('それはページのURLのようです。画像そのものを右クリック→「画像をコピー」して貼り付けてください（Pinterest / pixiv 共通で確実）', true); return; }
            if (skOpen) { skSetRefUrl(u); return; }
            skTestAndAddUrl(u);
        }
        window.skLoadRef = function(){
            const u = prompt('参考にしたい画像のURLを貼り付けてください。\n\n★一番確実な方法★\n見たい画像を右クリック →「画像をコピー」→ この画面で Ctrl+V\n（pixiv など直リンク不可のサイトでもこの方法なら表示できます）\n\n画面へドラッグ＆ドロップでもOK。');
            if (u) skUseImageUrl(u);
        };
        // コピー＆ペースト（画像そのもの＝最も確実 / または画像URL）。アプリ全体で有効。
        document.addEventListener('paste', function(e){
            const ae = document.activeElement;
            if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return; // 入力欄への貼付は邪魔しない
            const dt = e.clipboardData; if (!dt) return;
            if (dt.items) {
                for (let i = 0; i < dt.items.length; i++){
                    const it = dt.items[i];
                    if (it.kind === 'file' && (it.type || '').indexOf('image') === 0){
                        const f = it.getAsFile(); if (f){ skUseImageFile(f); e.preventDefault(); return; }
                    }
                }
            }
            const txt = ((dt.getData && dt.getData('text/plain')) || '').trim();
            const urls = txt.split(/[\r\n]+/).map(function(s){ return s.trim(); }).filter(function(s){ return /^https?:\/\//.test(s); });
            if (urls.length === 1) { skUseImageUrl(urls[0]); e.preventDefault(); }
            else if (urls.length > 1) { // 複数URLをまとめて貼り付け → 全部プールへ
                let n = 0; urls.forEach(function(u){ if (skClassifyUrl(u) !== 'page') { skTestAndAddUrl(u); n++; } });
                skNotify(n + '件の画像を読み込み中…（表示できたものだけ追加されます）', false); e.preventDefault();
            }
        });
        // 描画モード中のドラッグ＆ドロップ（PCでPinterestのピンを直接この画面へ）
        skStage.addEventListener('dragover', function(e){ if (skOpen) { e.preventDefault(); try { e.dataTransfer.dropEffect = 'copy'; } catch(_){ } } });
        skStage.addEventListener('drop', function(e){
            if (!skOpen) return;
            e.preventDefault(); e.stopPropagation();
            const dt = e.dataTransfer; if (!dt) return;
            if (dt.files && dt.files.length){
                const imgs = Array.prototype.slice.call(dt.files).filter(function(f){ return f && (f.type || '').indexOf('image') === 0; });
                if (imgs.length === 1) { skUseImageFile(imgs[0]); return; }
                if (imgs.length > 1) { imgs.forEach(function(f){ skAddToPool(f); }); skNotify(imgs.length + '枚を練習リストに追加しました', false); return; }
            }
            let url = '';
            try {
                const html = dt.getData('text/html');
                if (html){ const mm = html.match(/<img[^>]+src=["']([^"']+)["']/i); if (mm) url = mm[1]; }
                if (!url) url = (dt.getData('text/uri-list') || dt.getData('text/plain') || '').split(/[\r\n]/)[0];
            } catch(_){ }
            if (url) skUseImageUrl(url);
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
            const S = window.CroquisShortcuts;
            if (skOpen) {
                if (e.code === 'Escape') { if (skAnyMenuOpen()) { skCloseMenus(); } else if (skFormenOn) { skSetFormen(false); } else { toggleSketch(); } }
                else if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey) && e.shiftKey) { e.preventDefault(); skRedo(); }
                else if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); skUndo(); }
                else if (e.code === 'KeyY' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); skRedo(); }
                else if (e.ctrlKey || e.metaKey) { return; } // 他のCtrl/⌘系はブラウザに任せる
                // ── PC向けショートカット（割当は設定で変更可・CroquisShortcuts経由） ──
                else if (S.match('s_formen', e)) { skToggleFormen(); }
                else if (S.match('s_eraser', e)) { skSetTool(skTool === 'eraser' ? 'pen' : 'eraser'); }
                else if (S.match('s_pen', e)) { skSetTool('pen'); }
                else if (S.match('s_lasso', e)) { skSetLasso(false); }
                else if (S.match('s_grid', e)) { skToggleGrid(); }
                else if (S.match('s_sizeDown', e))  { skNudgeSize(-2); }
                else if (S.match('s_sizeUp', e)) { skNudgeSize(2); }
                else if (S.match('s_zoomIn', e))  { skZoomStep(1.2); }
                else if (S.match('s_zoomOut', e)) { skZoomStep(1 / 1.2); }
                else if (S.match('s_zoomReset', e)) { skResetZoom(); }
                else if (/^Digit[1-5]$/.test(e.code)) { const sw = document.querySelectorAll('.sk-color')[(+e.code.slice(5)) - 1]; if (sw) sw.click(); } // 色は固定（1〜5）
                return;
            }
            const onlineOpen = document.getElementById('online-overlay').classList.contains('open');
            const tagOpen = document.getElementById('tag-panel').classList.contains('open');
            if (e.code === 'Escape') {
                if (onlineOpen) { toggleOnlinePanel(); return; }
                if (tagOpen) { toggleTagPanel(); return; }
            }
            if (onlineOpen || tagOpen) return;
            if (S.match('g_fav', e)) { toggleFavCurrent(); }
            else if (S.match('g_grid', e)) { toggle('grid'); }
            else if (S.match('g_flipH', e)) { toggle('flipH'); }
            else if (S.match('g_flipV', e)) { toggle('flipV'); }
            else if (S.match('g_sketch', e)) { toggleSketch(); }
            else if (S.match('g_online', e)) { toggleOnlinePanel(); }
            else if (S.match('g_tag', e)) { toggleTagPanel(); }
            else if (S.match('g_pip', e)) { togglePiP(); }
            else if (S.match('g_mute', e)) { toggleMute(); }
        });
    })();
