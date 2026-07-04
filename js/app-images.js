        function applyLoadedFiles(files) {
            if (files.length > 0) { 
                clearPreloadUrl();
                originalOrder = files.slice();
                sourceImages = files; if (settings.shuffle) shuffleArray(sourceImages); 
                images = sourceImages; isFavMode = false; showFavsOnly = false; showHiddenOnly = false;
                ui.historyFilterBtn.textContent = '全て (履歴)';
                currentIndex = 0; historyList = [0]; historyPos = 0;
                loadImage(); resetTimer();
                updateImageCounter();
                if (typeof window.skOnPoolLoaded === 'function') window.skOnPoolLoaded(); // 描画モード中なら新しい画像に合わせて更新
            }
        }

        function handleFiles(e) {
            const list = e.target.files;
            if (!list || list.length === 0) return;
            const files = [];
            for (let i = 0; i < list.length; i++) {
                const f = list[i];
                if (f && f.type && f.type.startsWith('image/')) files.push(f);
            }
            applyLoadedFiles(files);
            e.target.value = ''; 
        }
        function readEntryFile(entry) {
            return new Promise(function(resolve) {
                try {
                    entry.file(function(file) { resolve(file || null); }, function() { resolve(null); });
                } catch (_) { resolve(null); }
            });
        }
        function readDirEntries(reader) {
            return new Promise(function(resolve) {
                const all = [];
                const loop = function() {
                    reader.readEntries(function(entries) {
                        if (!entries || entries.length === 0) { resolve(all); return; }
                        for (let i = 0; i < entries.length; i++) all.push(entries[i]);
                        loop();
                    }, function() { resolve(all); });
                };
                loop();
            });
        }
        async function collectImageFilesFromEntry(entry, out) {
            if (!entry) return;
            if (entry.isFile) {
                const file = await readEntryFile(entry);
                if (file && file.type && file.type.startsWith('image/')) out.push(file);
                return;
            }
            if (entry.isDirectory) {
                const reader = entry.createReader();
                const children = await readDirEntries(reader);
                // フォルダ内エントリを並列処理（直列 await より高速）
                const subResults = await Promise.all(
                    children.map(function(child) {
                        const subOut = [];
                        return collectImageFilesFromEntry(child, subOut).then(function() { return subOut; });
                    })
                );
                for (let i = 0; i < subResults.length; i++) {
                    for (let j = 0; j < subResults[i].length; j++) out.push(subResults[i][j]);
                }
            }
        }
        async function getDroppedImageFiles(dataTransfer) {
            const out = [];
            const items = dataTransfer && dataTransfer.items ? dataTransfer.items : null;
            if (items && items.length > 0) {
                const entries = [];
                for (let i = 0; i < items.length; i++) {
                    const it = items[i];
                    const entry = it.webkitGetAsEntry ? it.webkitGetAsEntry() : null;
                    if (entry) { entries.push(entry); }
                    else {
                        const f = it.getAsFile ? it.getAsFile() : null;
                        if (f && f.type && f.type.startsWith('image/')) out.push(f);
                    }
                }
                // 直列処理でフォルダ内の順序を安定させる
                for (let i = 0; i < entries.length; i++) {
                    await collectImageFilesFromEntry(entries[i], out);
                }
                return out;
            }
            const files = dataTransfer && dataTransfer.files ? dataTransfer.files : [];
            for (let i = 0; i < files.length; i++) {
                const f = files[i];
                if (f && f.type && f.type.startsWith('image/')) out.push(f);
            }
            return out;
        }
        ui.folderInput.addEventListener('change', handleFiles);
        ui.fileInput.addEventListener('change',   handleFiles);

        ui.imgContainer.addEventListener('dragover', function(e) {
            e.preventDefault();
            ui.imgContainer.classList.add('drag-over');
        }, { passive: false });

        ui.imgContainer.addEventListener('dragleave', function(e) {
            if (!ui.imgContainer.contains(e.relatedTarget)) {
                ui.imgContainer.classList.remove('drag-over');
            }
        }, { passive: true });

        ui.imgContainer.addEventListener('drop', async function(e) {
            e.preventDefault();
            ui.imgContainer.classList.remove('drag-over');
            const files = await getDroppedImageFiles(e.dataTransfer);
            if (files.length > 0) { applyLoadedFiles(files); return; }
            // v4: Pinterest等の他サイトから画像をドラッグ → URLとして追加
            if (typeof addDroppedUrl === 'function' && addDroppedUrl(e.dataTransfer)) return;
            applyLoadedFiles(files);
        }, { passive: false });

        /** Fisher-Yates シャッフル（in-place） */
        function shuffleArray(arr) {
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                const temp = arr[i]; arr[i] = arr[j]; arr[j] = temp;
            }
        }

        function getNextIndexForPreload() {
            if (!images.length) return -1;
            if (settings.shuffle) {
                if (images.length === 1) return 0;
                // 「次に出す画像」を1回だけ抽選して覚えておく。nextImage もこれを使うので、
                // プリロード済み＆デコード済みの画像がそのまま表示され、待ち時間が無くなる。
                if (plannedNextIndex < 0 || plannedNextIndex >= images.length || plannedNextIndex === currentIndex) {
                    plannedNextIndex = pickShuffledIndex(currentIndex, lastShownIndex, 12);
                }
                return plannedNextIndex;
            }
            return (currentIndex + 1) % images.length;
        }

        function clearPreloadUrl() {
            plannedNextIndex = -1; // プールやURLが変わったら抽選もやり直し
            revokeIfOwned(preloadUrl);
            preloadUrl = null; preloadName = ''; preloadedImage = null;
            revokeIfOwned(preloadUrl2);
            preloadUrl2 = null; preloadName2 = ''; preloadedImage2 = null;
        }

        /**
         * 指定アイテムをプリロードする。既に同じURLをロード済みなら何もしない。
         * @param {File} item        対象画像ファイル
         * @param {string} slotName  'preload' | 'preload2'
         */
        function _loadPreloadSlot(item, slotName) {
            const isSlot1 = (slotName === 'preload');
            const curUrl  = isSlot1 ? preloadUrl  : preloadUrl2;
            const curName = isSlot1 ? preloadName : preloadName2;
            const newName = item.name || '';
            if (curName === newName && curUrl) return; // 既にロード済み
            revokeIfOwned(curUrl); // 直前のスロットURLを解放（お気に入りの永続URLは消さない）
            const url = item.data ? item.data : URL.createObjectURL(item);
            // URL をスロットに即記録してから src をセット（二重生成防止）
            if (isSlot1) { preloadUrl  = url; preloadName  = newName; preloadedImage  = null; }
            else         { preloadUrl2 = url; preloadName2 = newName; preloadedImage2 = null; }
            const img = new Image();
            if (url.indexOf('http') === 0 && item.cors) img.crossOrigin = 'anonymous';
            // decode() を src セット直後に呼ぶことでネットワーク取得とデコードを並列化
            img.src = url;
            if (img.decode) {
                img.decode().then(function() {
                    if (isSlot1 && preloadUrl === url)  preloadedImage  = img;
                    if (!isSlot1 && preloadUrl2 === url) preloadedImage2 = img;
                }).catch(function() {
                    if (isSlot1 && preloadUrl === url)  preloadedImage  = null;
                    if (!isSlot1 && preloadUrl2 === url) preloadedImage2 = null;
                });
            } else {
                img.onload  = function() {
                    if (isSlot1 && preloadUrl === url)  preloadedImage  = img;
                    if (!isSlot1 && preloadUrl2 === url) preloadedImage2 = img;
                };
                img.onerror = function() {
                    if (isSlot1 && preloadUrl === url)  preloadedImage  = null;
                    if (!isSlot1 && preloadUrl2 === url) preloadedImage2 = null;
                };
            }
        }

        function updatePreloadQueue() {
            if (images.length === 0) return;
            const firstIdx = getNextIndexForPreload();
            if (firstIdx < 0 || !images[firstIdx]) return;

            _loadPreloadSlot(images[firstIdx], 'preload');

            // 2枚目スロット
            let secondIdx = -1;
            if (images.length > 1) {
                if (settings.shuffle) {
                    let guard = 0;
                    secondIdx = Math.floor(Math.random() * images.length);
                    while ((secondIdx === firstIdx || secondIdx === currentIndex) && guard < TIMING.EYE_HIDE_PRELOAD_MAX) {
                        secondIdx = Math.floor(Math.random() * images.length);
                        guard++;
                    }
                } else {
                    secondIdx = (firstIdx + 1) % images.length;
                }
            }

            if (secondIdx >= 0 && images[secondIdx]) {
                _loadPreloadSlot(images[secondIdx], 'preload2');
            } else {
                // 2枚目不要：解放
                revokeIfOwned(preloadUrl2);
                preloadUrl2 = null; preloadName2 = ''; preloadedImage2 = null;
            }
        }

        const supportsImageDecode = 'decode' in document.createElement('img');

        let pendingTimerStart = false;

        function loadImage(skipDepth, skipPreload) {
            if(images.length === 0) { setVisible(ui.img, false); setVisible(ui.favIcon, false); updateImageCounter(); return; }
            const item = images[currentIndex];
            if(!item) return;
            const loadToken = ++imageLoadToken;

            if (randomFlipEnabled) {
                const r = Math.floor(Math.random() * 4);
                settings.flipH = (r === 1 || r === 3);
                settings.flipV = (r === 2 || r === 3);
            }

            if(!isFavMode && skipNameSet.has(item.name)) {
                if (hasUnskippedInCurrentPool() && (skipDepth || 0) < images.length) {
                    setTimeout(function(){ nextImage(true); }, 10);
                    return;
                }
            }

            isImageHidden = false;
            const isFav = isFavMode ? true : favNameSet.has(item.name);
            setVisible(ui.favIcon, isFav);

            /** 画像デコード完了後の共通処理 */
            function onImageReady() {
                if (loadToken !== imageLoadToken) return;
                setVisible(ui.img, true);
                applyFilters();
                clearTimeout(eyeHideTimeout);
                if (isEyeHideEnabled && !hmActive) {
                    eyeHideTimeout = setTimeout(function() {
                        isImageHidden = true; applyFilters();
                    }, eyeHideDelay * 1000);
                }
                if (pendingTimerStart) {
                    pendingTimerStart = false;
                    timerTickLoop();
                    if (!document.hidden) animationFrameId = requestAnimationFrame(updateSmoothTimerRAF);
                }
                requestAnimationFrame(function(){ updateGridOverlay(); });
            }

            /** 画像読み込みエラー時の共通処理 */
            function onImageError() {
                if (loadToken !== imageLoadToken) return;
                pendingTimerStart = false;
                if (images.length > 1) nextImage();
            }

            ui.img.onload = null;
            ui.img.onerror = null;
            if (!supportsImageDecode) {
                // decode非対応ブラウザのみonload/onerrorを使う
                ui.img.onload  = onImageReady;
                ui.img.onerror = onImageError;
            }

            let newUrl;
            if (item.data) {
                newUrl = item.data;
            } else if (preloadName === item.name && preloadUrl) {
                // decode完了前でもURLを流用（createObjectURL節約）
                newUrl = preloadUrl; preloadUrl = null; preloadedImage = null; preloadName = '';
            } else if (preloadName2 === item.name && preloadUrl2) {
                newUrl = preloadUrl2; preloadUrl2 = null; preloadedImage2 = null; preloadName2 = '';
            } else {
                newUrl = URL.createObjectURL(item);
            }
            // 前のURLを解放（プリロードURLやお気に入りの永続URLは解放しない）
            if (currentImageUrl !== newUrl) revokeIfOwned(currentImageUrl);
            currentImageUrl = newUrl;
            // v2: オンライン素材（CORS対応URL）は crossorigin を付与（PiP/保存のため）
            if (newUrl.indexOf('http') === 0 && item.cors) { ui.img.setAttribute('crossorigin', 'anonymous'); }
            else { ui.img.removeAttribute('crossorigin'); }

            if (supportsImageDecode) {
                // decodeが使える環境では、デコード完了後に表示＆タイマー開始
                ui.img.src = currentImageUrl;
                ui.img.decode().then(onImageReady).catch(onImageError);
            } else {
                // decode非対応ブラウザはonloadで処理（従来の動作）
                ui.img.src = currentImageUrl;
                if (ui.img.complete && ui.img.naturalWidth > 0) {
                    setVisible(ui.img, true);
                    applyFilters();
                    if (pendingTimerStart) {
                        pendingTimerStart = false;
                        timerTickLoop();
                        if (!document.hidden) animationFrameId = requestAnimationFrame(updateSmoothTimerRAF);
                    }
                }
            }
            updateMediaSession();
            if (!skipPreload) updatePreloadQueue();
            updateImageCounter();
        }

        function applyFilters() {
            let transform = '';
            if (settings.flipH) transform += 'scaleX(-1) ';
            if (settings.flipV) transform += 'scaleY(-1) ';

            let nextFilter = 'none';
            if      (settings.bw)   nextFilter = `grayscale(1) contrast(${bwContrast})`;
            else if (settings.mono) nextFilter = 'grayscale(100%)';

            const nextOpacity = isImageHidden ? '0' : '1';

            // 差分があるときのみ DOM に書き込む（不要なスタイル再計算を防ぐ）
            if (transform     !== lastImageTransform) { ui.img.style.transform = transform;    lastImageTransform = transform;   }
            if (nextFilter    !== lastImageFilter)    { ui.img.style.filter    = nextFilter;   lastImageFilter    = nextFilter;  }
            if (nextOpacity   !== lastImageOpacity)   { ui.img.style.opacity   = nextOpacity;  lastImageOpacity   = nextOpacity; }

            updateGridOverlay();
            if (isPiP) updatePiP();
        }
        function applyFiltersDeferred() {
            if (filterFrameQueued) return;
            filterFrameQueued = true;
            requestAnimationFrame(function() {
                filterFrameQueued = false;
                applyFilters();
            });
        }

        // ── グリッドオーバーレイ位置計算（applyFiltersから完全分離）──
        /**
         * グリッドオーバーレイの display を差分更新する。
         * setVisible と異なり lastGridDisplay キャッシュで不要な DOM 書き込みを回避する。
         */
        function setGridVisible(visible) {
            const next = visible ? 'block' : 'none';
            if (lastGridDisplay !== next) {
                ui.grid.style.display = next;
                lastGridDisplay = next;
            }
        }

        function updateGridOverlay() {
            if (!settings.grid || isImageHidden || !ui.img.complete || !ui.img.naturalWidth) {
                setGridVisible(false);
                return;
            }
            setGridVisible(true);
            const imgRect    = ui.img.getBoundingClientRect();
            const canvasRect = ui.canvasArea.getBoundingClientRect();
            // サブピクセルズレを防ぐため floor/ceil で囲む
            const offL  = Math.floor(imgRect.left   - canvasRect.left);
            const offT  = Math.floor(imgRect.top    - canvasRect.top);
            const dispW = Math.ceil(imgRect.right   - canvasRect.left) - offL;
            const dispH = Math.ceil(imgRect.bottom  - canvasRect.top)  - offT;
            if (!dispW || !dispH) { setGridVisible(false); return; }
            ui.grid.style.left   = offL  + 'px';
            ui.grid.style.top    = offT  + 'px';
            ui.grid.style.width  = dispW + 'px';
            ui.grid.style.height = dispH + 'px';
        }

        // canvas-area のリサイズを監視して自動更新
        (function() {
            const canvasArea = ui.canvasArea;
            if (typeof ResizeObserver !== 'undefined') {
                new ResizeObserver(function() { updateGridOverlay(); }).observe(canvasArea);
            }
        })();

        window.addEventListener('resize', debounce(applyFiltersDeferred, TIMING.RESIZE_DEBOUNCE_MS));
        
        // トグル操作の状態をトーストで知らせる（スマホはツールチップが出ないため、今ON/OFFか分かるように）
        function toggleToast(label, on) { if (window.showToast) window.showToast(label + (on ? '：ON' : '：OFF'), 1500); }
        const TOGGLE_LABELS = { shuffle: 'シャッフル', flipH: '左右反転', flipV: '上下反転', grid: 'グリッド', mono: 'モノクロ' };

        function toggle(key) {
            settings[key] = !settings[key]; const btn = uiBtnMap[key];
            setActive(btn, !!settings[key]);
            if (TOGGLE_LABELS[key]) toggleToast(TOGGLE_LABELS[key], settings[key]);
            if (key === 'mono' && settings.mono && settings.bw) {
                settings.bw = false;
                setActive(ui.bwBtn, false);
            }
            if (key === 'shuffle') {
                const currentItem = images[currentIndex];
                if (isFavMode) {
                    // お気に入りモードでもシャッフル
                    if (settings.shuffle) { shuffleArray(dbFavImages); images = dbFavImages; }
                    else { dbFavImages.sort(function(a,b){ return a.name < b.name ? -1 : 1; }); images = dbFavImages; }
                } else if (sourceImages.length > 0) {
                    if (settings.shuffle) { shuffleArray(sourceImages); }
                    else { if (originalOrder.length === sourceImages.length) sourceImages = originalOrder.slice(); }
                    images = sourceImages;
                }
                if (currentItem) {
                    const newIdx = images.findIndex(function(f){ return f.name === currentItem.name; });
                    if (newIdx > -1) currentIndex = newIdx;
                }
                plannedNextIndex = -1;          // 並び順が変わったので次の抽選はやり直し
                updatePreloadQueue();           // 新しい並びで次を先読み
            }
            saveUiSettings();
            applyFiltersDeferred(); 
        }

        function toggleRandomFlip() {
            randomFlipEnabled = !randomFlipEnabled;
            const btn = ui.rfBtn;
            if (randomFlipEnabled) {
                setActive(btn, true);
                // ランダム反転ON時は手動flipボタンを非活性化
                setFlipDisabled(true);
            } else {
                setActive(btn, false);
                setFlipDisabled(false);
                // OFF時は反転をリセット
                settings.flipH = false; settings.flipV = false;
                setActive(ui.flipHBtn, false);
                setActive(ui.flipVBtn, false);
                applyFiltersDeferred();
            }
            toggleToast('ランダム反転', randomFlipEnabled);
            saveUiSettings();
        }

        function toggleBW() {
            settings.bw = !settings.bw;
            const bwBtn = ui.bwBtn;
            const bwBar = ui.bwBarWrap;
            if (settings.bw) {
                setActive(bwBtn, true);
                if (settings.mono) {
                    settings.mono = false;
                    const monoBtn = ui.monoBtn;
                    setActive(monoBtn, false);
                }
                if (bwBar) bwBar.classList.toggle('visible', true);
            } else {
                setActive(bwBtn, false);
                if (bwBar) bwBar.classList.toggle('visible', false);
            }
            toggleToast('2階調（白黒）', settings.bw);
            applyFiltersDeferred();
            saveUiSettings();
        }

        function toggleEyeHide() {
            isEyeHideEnabled = !isEyeHideEnabled;
            if (isEyeHideEnabled) {
                setActive(ui.eyeBtn, true);
            } else {
                setActive(ui.eyeBtn, false);
                clearTimeout(eyeHideTimeout);
                isImageHidden = false;
                applyFiltersDeferred();
            }
            if (window.showToast) window.showToast(isEyeHideEnabled ? '目隠し練習：ON（数秒後に画像が隠れます）' : '目隠し練習：OFF', 1800);
            saveUiSettings();
        }

        function toggleFavCurrent() {
            if(images.length === 0) return;
            const item = images[currentIndex]; const fname = item.name;
            if (isFavMode) {
                dbFavImages = dbFavImages.filter(function(f){ return f.name !== fname; });
                rebuildFavNameSet();
                deleteFavFromDB(fname); ui.managePopup.classList.toggle('show', false);
                if (dbFavImages.length === 0) {
                    alert("お気に入りが空になりました。通常モードに戻ります。");
                    isFavMode = false; showFavsOnly = false; showHiddenOnly = false; images = sourceImages;
                    ui.historyFilterBtn.textContent = '全て (履歴)';
                    currentIndex = 0; historyList = [0]; historyPos = 0; loadImage();
                } else {
                    currentIndex = Math.min(currentIndex, dbFavImages.length - 1);
                    historyList = [currentIndex]; historyPos = 0;
                    loadImage();
                }
                updateImageCounter();
                renderHistoryThumbs();
            } else {
                const foundIdx = dbFavImages.findIndex(function(f){ return f.name === fname; });
                if(foundIdx > -1) {
                    const removed = dbFavImages[foundIdx];
                    dbFavImages.splice(foundIdx, 1); rebuildFavNameSet(); deleteFavFromDB(fname);
                    if (removed && typeof removed.data === 'string' && removed.data.indexOf('blob:') === 0) URL.revokeObjectURL(removed.data);
                    setVisible(ui.favIcon, false);
                    if (isHistoryPanelOpen && showFavsOnly) renderHistoryThumbs();
                }
                else {
                    const onSaved = function() {
                        setVisible(ui.favIcon, true);
                        if (isHistoryPanelOpen && showFavsOnly) renderHistoryThumbs();
                    };
                    if (item.data) {
                        // オンライン素材：URL（または dataURL）から Blob を取得して保存
                        fetch(item.data).then(function(r){ return r.blob(); })
                            .then(function(b){ addFavorite(fname, b); onSaved(); })
                            .catch(function(){ alert('この画像はお気に入りに保存できませんでした（提供元の制限）'); });
                    } else {
                        // ローカル画像：File(Blob)をそのまま保存（DataURL化しない＝軽量・高速）
                        addFavorite(fname, item); onSaved();
                    }
                }
                ui.managePopup.classList.toggle('show', false);
            }
        }

        function skipCurrent() {
            if (images.length === 0 || isFavMode) return;
            const item = images[currentIndex];
            if (!item || !item.name) return;
            const fname = item.name;
            if (!skipNameSet.has(fname)) {
                skipList.push(fname);
                rebuildSkipNameSet();
                saveSkipList();
            }
            ui.managePopup.classList.toggle('show', false); nextImage();
        }

