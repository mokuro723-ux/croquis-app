        // ── 複数選択機能 ────────────────────────────────────────
        let multiSelectSet  = new Set();
        let msBlobCache     = new Map();

        // サムネイル用 blob URL をまとめて解放する
        function revokeMsBlobCache() {
            msBlobCache.forEach(function(url) { URL.revokeObjectURL(url); });
            msBlobCache = new Map();
        }

        function openMultiSelect() {
            ui.managePopup.classList.toggle('show', false);
            multiSelectSet.clear();
            revokeMsBlobCache();
            renderMultiSelectGrid();
            ui.msOverlay.classList.add('open');
        }

        function closeMultiSelect() {
            ui.msOverlay.classList.remove('open');
            multiSelectSet.clear();
            revokeMsBlobCache();
        }

        function updateMultiSelectCount() {
            if (!ui.msCount) return;
            ui.msCount.textContent = multiSelectSet.size > 0
                ? `${multiSelectSet.size} / ${sourceImages.length} 件選択中`
                : '画像をタップして選択';
        }

        function renderMultiSelectGrid() {
            const grid = ui.msGrid;
            grid.innerHTML = '';
            if (sourceImages.length === 0) {
                grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#444;padding:60px 0;font-size:0.9rem;">画像が読み込まれていません</div>';
                updateMultiSelectCount();
                return;
            }
            sourceImages.forEach(function(item, idx) {
                const div = document.createElement('div');
                div.className = 'ms-thumb' + (multiSelectSet.has(idx) ? ' selected' : '');
                div.dataset.idx = idx;
                const img = document.createElement('img');
                img.loading = 'lazy';
                if (item.data) {
                    img.src = item.data;
                } else {
                    let url = msBlobCache.get(item);
                    if (!url) { url = URL.createObjectURL(item); msBlobCache.set(item, url); }
                    img.src = url;
                }
                const overlay = document.createElement('div');
                overlay.className = 'ms-overlay';
                const check = document.createElement('div');
                check.className = 'ms-check';
                div.appendChild(img);
                div.appendChild(overlay);
                div.appendChild(check);
                if (favNameSet.has(item.name)) {
                    const badge = document.createElement('div');
                    badge.className = 'ms-fav';
                    badge.textContent = '⭐';
                    div.appendChild(badge);
                }
                grid.appendChild(div);
            });
            updateMultiSelectCount();
        }

        // ── 複数選択のインタラクション（touch + pointer + keyboard）──
        (function() {
            const overlay = ui.msOverlay;

            // ── 共有状態 ────────────────────────────────────────────
            let dragStartIdx = -1;
            let lastEndIdx   = -1;
            let isDragging   = false;
            let lastX = 0, lastY = 0;
            let pressX = 0, pressY = 0; // 押下開始座標（ドラッグ判定の基準点）
            let autoRaf = null;
            let lastClickIdx = -1; // Shift選択の基点

            const SCROLL_ZONE  = 80;
            const SCROLL_SPEED = 12;

            // ── ユーティリティ ───────────────────────────────────────
            function thumbAt(x, y) {
                const el = document.elementFromPoint(x, y);
                return el && el.closest('.ms-thumb');
            }

            function toggleThumb(t, idx) {
                if (multiSelectSet.has(idx)) { multiSelectSet.delete(idx); t.classList.remove('selected'); }
                else                          { multiSelectSet.add(idx);    t.classList.add('selected');    }
                updateMultiSelectCount();
            }

            function applyRange(endIdx) {
                if (endIdx === lastEndIdx) return;
                lastEndIdx = endIdx;
                const lo = Math.min(dragStartIdx, endIdx);
                const hi = Math.max(dragStartIdx, endIdx);
                const grid = ui.msGrid;
                grid.querySelectorAll('.ms-thumb').forEach(function(t) {
                    const i = parseInt(t.dataset.idx);
                    if (i < lo || i > hi) return;
                    if (!multiSelectSet.has(i)) { multiSelectSet.add(i); t.classList.add('selected'); }
                });
                updateMultiSelectCount();
            }

            function autoScroll() {
                if (!isDragging) return;
                const grid = ui.msGrid;
                const rect = grid.getBoundingClientRect();
                const relY = lastY - rect.top;
                let spd = 0;
                if (relY < SCROLL_ZONE)
                    spd = -SCROLL_SPEED * Math.max(0, (SCROLL_ZONE - relY) / SCROLL_ZONE);
                else if (relY > rect.height - SCROLL_ZONE)
                    spd =  SCROLL_SPEED * Math.max(0, (relY - (rect.height - SCROLL_ZONE)) / SCROLL_ZONE);
                if (spd !== 0) {
                    grid.scrollTop += spd;
                    const t = thumbAt(lastX, lastY);
                    if (t) applyRange(parseInt(t.dataset.idx));
                }
                autoRaf = requestAnimationFrame(autoScroll);
            }

            function stopDrag() {
                isDragging   = false;
                dragStartIdx = -1;
                lastEndIdx   = -1;
                if (autoRaf) { cancelAnimationFrame(autoRaf); autoRaf = null; }
            }

            // ── Touch（iOS / Android）───────────────────────────────
            overlay.addEventListener('touchstart', function(e) {
                if (!overlay.classList.contains('open')) return;
                const touch = e.touches[0];
                const t = thumbAt(touch.clientX, touch.clientY);
                if (!t) return;
                const idx = parseInt(t.dataset.idx);
                toggleThumb(t, idx);
                dragStartIdx = idx;
                lastEndIdx   = idx;
                lastClickIdx = idx;
                isDragging   = false;
                lastX = touch.clientX;
                lastY = touch.clientY;
            }, { passive: false });

            overlay.addEventListener('touchmove', function(e) {
                if (dragStartIdx < 0) return;
                e.preventDefault();
                const touch = e.touches[0];
                lastX = touch.clientX;
                lastY = touch.clientY;
                if (!isDragging) {
                    isDragging = true;
                    if (!autoRaf) autoRaf = requestAnimationFrame(autoScroll);
                }
                const t = thumbAt(touch.clientX, touch.clientY);
                if (t) applyRange(parseInt(t.dataset.idx));
            }, { passive: false });

            overlay.addEventListener('touchend',    stopDrag, { passive: true });
            overlay.addEventListener('touchcancel', stopDrag, { passive: true });

            // ── Pointer（Android Chrome / マウス）───────────────────
            // touchイベントが発火しない環境（一部Androidブラウザ）のフォールバック
            let pointerActive = false;

            overlay.addEventListener('pointerdown', function(e) {
                if (e.pointerType === 'touch') return; // touchで処理済みのため除外
                if (!overlay.classList.contains('open')) return;
                if (e.pointerType === 'mouse' && e.button !== 0) return;
                const t = thumbAt(e.clientX, e.clientY);
                if (!t) return;
                const idx = parseInt(t.dataset.idx);
                // マウス: Ctrl/Cmd押しながらクリックで個別選択
                // それ以外はtoggle
                if (e.pointerType === 'mouse') {
                    // クリックはpointerupで処理するのでここではドラッグ準備のみ
                    pointerActive = true;
                    dragStartIdx  = idx;
                    lastEndIdx    = idx;
                    lastX = e.clientX;
                    lastY = e.clientY;
                    pressX = e.clientX;
                    pressY = e.clientY;
                    isDragging = false;
                    return;
                }
                // pen / touch(フォールバック)
                toggleThumb(t, idx);
                dragStartIdx = idx;
                lastEndIdx   = idx;
                lastClickIdx = idx;
                isDragging   = false;
                lastX = e.clientX;
                lastY = e.clientY;
                pressX = e.clientX;
                pressY = e.clientY;
                pointerActive = true;
            }, { passive: true });

            overlay.addEventListener('pointermove', function(e) {
                if (e.pointerType === 'touch') return;
                if (!pointerActive || dragStartIdx < 0) return;
                lastX = e.clientX;
                lastY = e.clientY;
                const dx = Math.abs(e.clientX - pressX);
                const dy = Math.abs(e.clientY - pressY);
                if (!isDragging && (dx > 6 || dy > 6)) {
                    isDragging = true;
                    if (!autoRaf) autoRaf = requestAnimationFrame(autoScroll);
                }
                if (isDragging) {
                    const t = thumbAt(e.clientX, e.clientY);
                    if (t) applyRange(parseInt(t.dataset.idx));
                }
            }, { passive: true });

            overlay.addEventListener('pointerup', function(e) {
                if (e.pointerType === 'touch') return;
                if (!pointerActive) return;
                pointerActive = false;
                if (!isDragging) {
                    // ドラッグなし = クリック
                    const t = thumbAt(e.clientX, e.clientY);
                    if (t) {
                        const idx = parseInt(t.dataset.idx);
                        toggleThumb(t, idx);
                        lastClickIdx = idx;
                    }
                }
                stopDrag();
            }, { passive: true });

            overlay.addEventListener('pointercancel', function(e) {
                if (e.pointerType === 'touch') return;
                pointerActive = false;
                stopDrag();
            }, { passive: true });

            // ── PC キーボードショートカット ──────────────────────────
            // Ctrl+A / Cmd+A : 全選択
            // Shift+クリック  : 範囲選択
            // Ctrl+クリック   : 個別トグル（標準動作）
            // ESC             : 閉じる（既存のESC処理で対応済み）
            document.addEventListener('keydown', function(e) {
                if (!overlay.classList.contains('open')) return;
                if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
                    e.preventDefault();
                    multiSelectAll();
                }
            });

            // Shift+クリックによる範囲選択 / Ctrl+クリックによる個別選択（PC専用）
            overlay.addEventListener('click', function(e) {
                if (!overlay.classList.contains('open')) return;
                const t = e.target.closest('.ms-thumb');
                if (!t) return;
                const idx = parseInt(t.dataset.idx);

                if (e.shiftKey && lastClickIdx >= 0) {
                    // Shift: lastClickIdx〜idx の範囲を選択
                    const lo = Math.min(lastClickIdx, idx);
                    const hi = Math.max(lastClickIdx, idx);
                    const grid = ui.msGrid;
                    grid.querySelectorAll('.ms-thumb').forEach(function(thumb) {
                        const i = parseInt(thumb.dataset.idx);
                        if (i >= lo && i <= hi && !multiSelectSet.has(i)) {
                            multiSelectSet.add(i);
                            thumb.classList.add('selected');
                        }
                    });
                    updateMultiSelectCount();
                } else if (e.ctrlKey || e.metaKey) {
                    // Ctrl/Cmd: 個別トグル（pointerupと重複しないよう再トグル）
                    toggleThumb(t, idx);
                    lastClickIdx = idx;
                }
                // 修飾キーなしの通常クリックはpointerupで処理済みのためここでは何もしない
            });

        })(); // ── 複数選択インタラクション IIFE 終了 ──

        function multiSelectAll() {
            const grid = ui.msGrid;
            sourceImages.forEach(function(_, idx) { multiSelectSet.add(idx); });
            grid.querySelectorAll('.ms-thumb').forEach(function(t) { t.classList.add('selected'); });
            updateMultiSelectCount();
        }

        function multiDeselectAll() {
            const grid = ui.msGrid;
            multiSelectSet.clear();
            grid.querySelectorAll('.ms-thumb').forEach(function(t) { t.classList.remove('selected'); });
            updateMultiSelectCount();
        }

        function showMultiSelectMsg(msg) {
            const el = ui.msCount;
            if (!el) return;
            el.textContent = msg;
            clearTimeout(el._msgTimer);
            el._msgTimer = setTimeout(function() { updateMultiSelectCount(); }, 2000);
        }

        async function multiSelectFav() {
            if (multiSelectSet.size === 0) return;
            const targets = Array.from(multiSelectSet)
                .map(function(i) { return sourceImages[i]; })
                .filter(function(item) { return item && !favNameSet.has(item.name); });
            if (targets.length === 0) { showMultiSelectMsg('選択中は既にお気に入り登録済みです'); return; }

            // ── 即時UI更新（体感速度優先）──
            targets.forEach(function(item) {
                // data はまだ null だがキーで管理するので問題なし
                dbFavImages.push({ name: item.name, data: null });
            });
            rebuildFavNameSet();

            // ⭐バッジを差分追加
            ui.msGrid.querySelectorAll('.ms-thumb').forEach(function(thumb) {
                const item = sourceImages[parseInt(thumb.dataset.idx)];
                if (!item) return;
                if (favNameSet.has(item.name) && !thumb.querySelector('.ms-fav')) {
                    const badge = document.createElement('div');
                    badge.className = 'ms-fav'; badge.textContent = '⭐';
                    thumb.appendChild(badge);
                }
            });
            showMultiSelectMsg(`⭐ ${targets.length}件をお気に入りに登録しました`);

            // ── バックグラウンドでDB保存（順次処理して負荷を分散）──
            for (let i = 0; i < targets.length; i++) {
                const item = targets[i];
                const url = await saveFavFileToDB(item); // Blobを保存し表示用 blob: URL を取得
                const entry = dbFavImages.find(function(f) { return f.name === item.name; });
                if (entry && url) entry.data = url;
            }
            rebuildFavNameSet(); // 新しい blob: URL を favUrlSet にも反映（自動revokeから守る）
        }

        async function multiSelectUnfav() {
            if (multiSelectSet.size === 0) return;
            const targets = Array.from(multiSelectSet)
                .map(function(i) { return sourceImages[i]; })
                .filter(function(item) { return item && favNameSet.has(item.name); });
            if (targets.length === 0) { showMultiSelectMsg('選択中にお気に入り登録済みの画像がありません'); return; }
            targets.forEach(function(item) {
                const entry = dbFavImages.find(function(f){ return f.name === item.name; });
                if (entry && typeof entry.data === 'string' && entry.data.indexOf('blob:') === 0) URL.revokeObjectURL(entry.data);
                dbFavImages = dbFavImages.filter(function(f) { return f.name !== item.name; });
                deleteFavFromDB(item.name);
            });
            rebuildFavNameSet();
            // ⭐バッジを差分削除
            ui.msGrid.querySelectorAll('.ms-thumb').forEach(function(thumb) {
                const item = sourceImages[parseInt(thumb.dataset.idx)];
                if (!item) return;
                if (!favNameSet.has(item.name)) {
                    const badge = thumb.querySelector('.ms-fav');
                    if (badge) badge.remove();
                }
            });
            showMultiSelectMsg(`☆ ${targets.length}件のお気に入りを解除しました`);
        }

        function multiSelectSkip() {
            if (multiSelectSet.size === 0) return;
            const targets = Array.from(multiSelectSet)
                .map(function(i) { return sourceImages[i]; })
                .filter(function(item) { return item && !skipNameSet.has(item.name); });
            targets.forEach(function(item) {
                skipList.push(item.name);
                skipNameSet.add(item.name);
            });
            if (targets.length > 0) flushSkipList();
            showMultiSelectMsg(`🗑️ ${targets.length}件をスキップ登録しました`);
        }

        function clearManageData() {
            if(!confirm("お気に入り画像データ、スキップ設定をすべて削除して初期化しますか？")) return;
            skipList = []; dbFavImages = []; CroquisStore.remove(CROQUIS_KEYS.SKIPS); CroquisStore.remove('croquis_skips');
            rebuildFavNameSet();
            rebuildSkipNameSet();
            if (db) { const tx = db.transaction(storeName, "readwrite"); tx.onerror = function(){}; tx.objectStore(storeName).clear(); }
            setVisible(ui.favIcon, false); ui.managePopup.classList.toggle('show', false);
            isFavMode = false; showFavsOnly = false; showHiddenOnly = false; ui.historyFilterBtn.textContent = '全て (履歴)';
            if (sourceImages.length > 0) {
                images = sourceImages; currentIndex = 0; historyList = [0]; historyPos = 0; loadImage();
            } else {
                images = []; currentIndex = 0; historyList = []; historyPos = -1;
            }
            updateImageCounter();
            if(isHistoryPanelOpen) renderHistoryThumbs();
            alert("データを完全にリセットしました。");
        }

        // この関数は features.js の巡回シャッフルが window.pickShuffledIndex で上書きするため、
        // 実際の再生では features.js 側（袋方式）が使われる。この定義は features.js が読み込めなかった
        // 場合の予備として残している。抽選ロジックを変えたいときは features.js 側を修正すること。
        function pickShuffledIndex(excludeA, excludeB, maxGuard) {
            if (images.length === 1) return 0;
            if (images.length === 2) {
                const other = excludeA === 0 ? 1 : 0;
                return (other !== excludeB) ? other : excludeA;
            }
            let candidate, guard = 0;
            do { candidate = Math.floor(Math.random() * images.length); guard++; }
            while ((candidate === excludeA || candidate === excludeB) && guard < maxGuard);
            return candidate;
        }

        function nextImage(isSkipping = false) {
            if (images.length === 0) return;
            if (hmActive && !isSkipping) exitHardMode();
            clearTimeout(timerTickId);    timerTickId    = null;
            cancelAnimationFrame(animationFrameId); animationFrameId = null;
            const prevIndex = currentIndex;
            
            if (!isSkipping) {
                if (historyPos < historyList.length - 1) { historyPos++; currentIndex = historyList[historyPos]; plannedNextIndex = -1; }
                else {
                    if (settings.shuffle) {
                        // プリロード時に決めた「次の画像」をそのまま使う（無ければ抽選）。これが効くと表示が一瞬。
                        currentIndex = (plannedNextIndex >= 0 && plannedNextIndex < images.length && plannedNextIndex !== prevIndex)
                            ? plannedNextIndex
                            : pickShuffledIndex(prevIndex, lastShownIndex, 12);
                    } else {
                        currentIndex = (currentIndex + 1) % images.length;
                    }
                    plannedNextIndex = -1; // 消費したので次回また抽選
                    historyList.push(currentIndex);
                    if (historyList.length > 100) { historyList.shift(); historyPos = historyList.length - 1; }
                    else { historyPos++; }
                }
            } else {
                currentIndex = settings.shuffle
                    ? pickShuffledIndex(prevIndex, -1, 8)
                    : (currentIndex + 1) % images.length;
                plannedNextIndex = -1;
            }
            lastShownIndex = prevIndex;
            pendingTimerStart = false; // 前の pending をクリア
            remaining = hmActive ? hmPhases[hmPhase].s : timerSeconds;
            if (isRunning) {
                expectedEndTime = Date.now() + (remaining * 1000);
                pendingTimerStart = true;
            } else {
                updateTimerText(remaining);
                ui.prog.style.width = '100%'; lastProgressWidth = '100%';
            }
            loadImage(0, true);
            // currentIndex 確定後にプリロードを更新（次の次の画像を先読み）
            updatePreloadQueue();
            if(!isSkipping) { playSound(); }
            // 休憩リマインダーチェック
            if (!isSkipping && checkBreakTrigger()) {
                pendingTimerStart = false;
                stopTimer();
                triggerBreak();
            }
            if(isHistoryPanelOpen) renderHistoryThumbs();
        }

        function prevImage() {
            if (historyPos > 0 && !hmActive) {
                clearTimeout(timerTickId);    timerTickId    = null;
                cancelAnimationFrame(animationFrameId); animationFrameId = null;
                plannedNextIndex = -1;
                historyPos--;
                currentIndex = historyList[historyPos];
                loadImage();
                resetTimer();
                if (isHistoryPanelOpen) renderHistoryThumbs();
            }
        }

        function toggleHistoryPanel() {
            const panel = ui.historyPanel;
            isHistoryPanelOpen = !isHistoryPanelOpen;
            panel.classList.toggle('open', isHistoryPanelOpen);
            if (!isHistoryPanelOpen) {
                historyRenderToken++;
                clearHistoryThumbs();
            } else {
                // 設定が開いていたら transition なしで即座に閉じる
                if (ui.settingsPanel.classList.contains('open')) {
                    ui.settingsPanel.style.transition = 'none';
                    ui.settingsPanel.classList.toggle('open', false);
                    ui.settingsOverlay.classList.toggle('open', false);
                    requestAnimationFrame(function() {
                        requestAnimationFrame(function() {
                            ui.settingsPanel.style.transition = '';
                        });
                    });
                    armFocusIdleTimer();
                }
                renderHistoryThumbs();
            }
        }

        function toggleHistoryFilter() {
            if (!showFavsOnly && !showHiddenOnly) {
                showFavsOnly = true; showHiddenOnly = false;
            } else if (showFavsOnly) {
                showFavsOnly = false; showHiddenOnly = true;
                if (sourceImages.length > 0 && isFavMode) {
                    isFavMode = false; images = sourceImages;
                    currentIndex = Math.min(0, sourceImages.length - 1);
                    historyList = [currentIndex]; historyPos = 0; loadImage(); resetTimer();
                }
            } else {
                showFavsOnly = false; showHiddenOnly = false;
                if (sourceImages.length > 0 && isFavMode) {
                    isFavMode = false; images = sourceImages;
                    currentIndex = Math.min(0, sourceImages.length - 1);
                    historyList = [currentIndex]; historyPos = 0; loadImage(); resetTimer();
                }
            }
            ui.historyFilterBtn.textContent = showFavsOnly ? '★ お気に入り' : (showHiddenOnly ? '非表示' : '全て (履歴)');
            updateImageCounter();
            renderHistoryThumbs();
        }
        function unhideByName(name) {
            if (!name || !skipNameSet.has(name)) return;
            skipList = skipList.filter(function(n){ return n !== name; });
            rebuildSkipNameSet();
            saveSkipList();
            renderHistoryThumbs();
        }

        function clearHistoryThumbs() {
            if (historyVirtualCleanup) { historyVirtualCleanup(); historyVirtualCleanup = null; }
            const content = ui.historyContent;
            content.innerHTML = '';
            content.style.display = 'grid';
            content.style.position = '';
            content.style.overflowY = 'auto';
            content.style.alignContent = 'start';
            historyUrls.forEach(function(url) { URL.revokeObjectURL(url); });
            historyUrls = [];
        }

        function mountVirtualHistory(items, buildNode) {
            const content = ui.historyContent;
            const cols = window.innerWidth <= 440 ? 3 : 2;
            const gap = 8;
            const paddingX = 20;
            const usable = Math.max(1, content.clientWidth - paddingX);
            const tile = Math.floor((usable - (gap * (cols - 1))) / cols);
            const rowHeight = tile + gap;
            const totalRows = Math.ceil(items.length / cols);
            const layer = document.createElement('div');
            layer.style.position = 'relative';
            layer.style.height = (totalRows * rowHeight) + 'px';
            layer.style.width = '100%';
            content.innerHTML = '';
            content.style.display = 'block';
            content.style.position = 'relative';
            content.appendChild(layer);
            let lastStart = -1;
            let lastEnd = -1;
            let scrollRafId = 0;

            const renderVisible = function() {
                const viewTop = content.scrollTop;
                const viewBottom = viewTop + content.clientHeight;
                const startRow = Math.max(0, Math.floor(viewTop / rowHeight) - 2);
                const endRow = Math.min(totalRows, Math.ceil(viewBottom / rowHeight) + 2);
                const start = startRow * cols;
                const end = Math.min(items.length, endRow * cols);
                if (start === lastStart && end === lastEnd) return;
                lastStart = start;
                lastEnd = end;
                layer.innerHTML = '';
                for (let i = start; i < end; i++) {
                    const col = i % cols;
                    const row = Math.floor(i / cols);
                    const node = buildNode(items[i], i);
                    node.style.position = 'absolute';
                    node.style.left = (col * (tile + gap)) + 'px';
                    node.style.top = (row * rowHeight) + 'px';
                    node.style.width = tile + 'px';
                    node.style.height = tile + 'px';
                    layer.appendChild(node);
                }
            };

            const onScroll = function() { renderVisible(); };
            const onScrollRaf = function() {
                if (scrollRafId) return;
                scrollRafId = requestAnimationFrame(function() {
                    scrollRafId = 0;
                    renderVisible();
                });
            };
            const onResize = debounce(function() {
                renderHistoryThumbs();
            }, 80);
            content.addEventListener('scroll', onScrollRaf, { passive: true });
            window.addEventListener('resize', onResize);
            renderVisible();

            historyVirtualCleanup = function() {
                content.removeEventListener('scroll', onScrollRaf);
                window.removeEventListener('resize', onResize);
                if (scrollRafId) {
                    cancelAnimationFrame(scrollRafId);
                    scrollRafId = 0;
                }
                // _debouncedRenderHistory はキャンセル不要（クリーンアップ時は historyVirtualCleanup で対応）
            };
        }

        function renderHistoryThumbs() {
            if (renderHistoryRafId) cancelAnimationFrame(renderHistoryRafId);
            renderHistoryRafId = requestAnimationFrame(function() {
                renderHistoryRafId = 0;
                _renderHistoryThumbsImpl();
            });
        }
        function _renderHistoryThumbsImpl() {
            const token = ++historyRenderToken;
            const content = ui.historyContent; clearHistoryThumbs();
            const isMobileHistory = window.innerWidth <= 440;
            if (showHiddenOnly) {
                const hiddenEntries = [];
                const seen = new Set();
                for (let i = 0; i < skipList.length; i++) {
                    const name = skipList[i];
                    if (!name || seen.has(name)) continue;
                    seen.add(name);
                    let fileItem = null;
                    for (let j = 0; j < sourceImages.length; j++) {
                        const it = sourceImages[j];
                        if (it && it.name === name) { fileItem = it; break; }
                    }
                    hiddenEntries.push({ name: name, file: fileItem });
                }
                if (hiddenEntries.length === 0) { content.innerHTML = '<div style="grid-column:span 2; text-align:center; color:#666; font-size:0.8rem; padding:20px 0;">非表示はありません</div>'; return; }
                mountVirtualHistory(hiddenEntries, function(entry) {
                    if (token !== historyRenderToken) return document.createElement('div');
                    const thumbDiv = document.createElement('div'); thumbDiv.style.position = 'relative';
                    const imgEl = document.createElement('img');
                    imgEl.className = 'history-thumb';
                    if (entry.file) {
                        const url = URL.createObjectURL(entry.file);
                        historyUrls.push(url);
                        imgEl.src = url;
                    }
                    const btn = document.createElement('button');
                    btn.textContent = '表示解除';
                    btn.style.position = 'absolute';
                    btn.style.left = '4px';
                    btn.style.right = '4px';
                    btn.style.bottom = '4px';
                    btn.style.padding = '4px 0';
                    btn.style.fontSize = '0.7rem';
                    btn.style.minWidth = 'auto';
                    btn.style.backgroundColor = 'rgba(0, 212, 255, 0.92)';
                    btn.style.color = '#001018';
                    btn.style.fontWeight = 'bold';
                    btn.style.border = '1px solid rgba(255,255,255,0.18)';
                    btn.onclick = function(ev) { ev.stopPropagation(); unhideByName(entry.name); };
                    thumbDiv.appendChild(imgEl);
                    thumbDiv.appendChild(btn);
                    return thumbDiv;
                });
            } else if (showFavsOnly) {
                if (dbFavImages.length === 0) { content.innerHTML = '<div style="grid-column:span 2; text-align:center; color:#666; font-size:0.8rem; padding:20px 0;">★画像がありません</div>'; return; }
                mountVirtualHistory(dbFavImages, function(item, idx) {
                    if (token !== historyRenderToken) return document.createElement('div');
                    const thumbDiv = document.createElement('div'); thumbDiv.style.position = 'relative';
                    const imgEl = document.createElement('img');
                    imgEl.src = item.data;
                    imgEl.className = 'history-thumb' + (isFavMode && currentIndex === idx ? ' current' : '');
                    imgEl.onclick = (function(index) { return function() {
                        isFavMode = true; images = dbFavImages; currentIndex = index; historyList = [index]; historyPos = 0;
                        if (hmActive) exitHardMode(); loadImage(); resetTimer();
                        if(isMobileHistory) toggleHistoryPanel(); renderHistoryThumbs();
                    }; })(idx);
                    thumbDiv.appendChild(imgEl);
                    const badge = document.createElement('div'); badge.className = 'fav-badge'; badge.textContent = '★';
                    thumbDiv.appendChild(badge);
                    return thumbDiv;
                });
            } else {
                const currentPool = isFavMode ? dbFavImages : sourceImages;
                const start = Math.max(0, historyList.length - 100);
                const entries = [];
                for (let i = historyList.length - 1; i >= start; i--) {
                    const imgIndex = historyList[i];
                    const item = currentPool[imgIndex];
                    if (item) entries.push({ historyIndex: i, item: item });
                }
                if (entries.length === 0) {
                    content.innerHTML = '<div style="grid-column:span 2; text-align:center; color:#666; font-size:0.8rem; padding:20px 0;">履歴がありません</div>';
                    return;
                }
                const thumbBlobUrlCache = new Map();
                mountVirtualHistory(entries, function(entry) {
                    if (token !== historyRenderToken) return document.createElement('div');
                    const i = entry.historyIndex;
                    const item = entry.item;
                    const thumbDiv = document.createElement('div');
                    thumbDiv.style.position = 'relative';
                    const imgEl = document.createElement('img');
                    if (item.data) {
                        imgEl.src = item.data;
                    } else {
                        let url = thumbBlobUrlCache.get(item);
                        if (!url) {
                            url = URL.createObjectURL(item);
                            thumbBlobUrlCache.set(item, url);
                            historyUrls.push(url);
                        }
                        imgEl.src = url;
                    }
                    imgEl.className = 'history-thumb' + (i === historyPos ? ' current' : '');
                    imgEl.onclick = (function(idx) {
                        return function() {
                            historyPos   = idx;
                            currentIndex = historyList[historyPos];
                            if (hmActive) exitHardMode();
                            loadImage();
                            resetTimer();
                            if (isMobileHistory) toggleHistoryPanel();
                            renderHistoryThumbs();
                        };
                    })(i);
                    thumbDiv.appendChild(imgEl);
                    const isFav = isFavMode ? true : favNameSet.has(item.name);
                    if (isFav) {
                        const badge = document.createElement('div');
                        badge.className  = 'fav-badge';
                        badge.textContent  = '★';
                        thumbDiv.appendChild(badge);
                    }
                    return thumbDiv;
                });
            }
        }

