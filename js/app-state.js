        // ── 画像・履歴 ──────────────────────────────────────────
        let sourceImages = [];
        let dbFavImages  = [];
        let images       = [];
        let currentIndex = 0;
        let isFavMode    = false;
        let originalOrder = [];
        let historyList  = [];
        let historyPos   = -1;
        let historyUrls  = [];
        let lastShownIndex = -1;
        let plannedNextIndex = -1; // シャッフル時の「次に出す画像」を1つ先に決めておく（プリロードと一致させて高速化）

        // ── タイマー状態 ─────────────────────────────────────────
        let timerSeconds    = 30;
        let remaining       = 30;
        let isRunning       = false;
        let expectedEndTime = 0;

        // ── ビュー設定（トグルフラグ）───────────────────────────
        let settings = { flipH: false, flipV: false, shuffle: true, grid: false, mono: false, bw: false };
        let randomFlipEnabled = false;
        let isMuted       = false;
        let bgMode        = 0;
        let isImageHidden = false;

        // ── ハードモード ─────────────────────────────────────────
        let hmActive = false;
        let hmPhase  = 0;
        const hmPhases = {
            1: { t: "①暗記",   s: 120,  h: false },
            2: { t: "②記憶描写", s: 300,  h: true  },
            3: { t: "③模写",   s: 900,  h: false },
            4: { t: "④実践",   s: 900,  h: true  },
        };

        // ── 画像読み込み・プリロード ──────────────────────────────
        let currentImageUrl  = null;
        let imageLoadToken   = 0;
        let preloadUrl       = null;
        let preloadName      = '';
        let preloadedImage   = null;
        let preloadUrl2      = null;
        let preloadName2     = '';
        let preloadedImage2  = null;

        // ── アニメーション・レンダリング ──────────────────────────
        let animationFrameId   = null;
        let lastPipUpdateTime  = 0;
        let timerTickId        = null;
        let filterFrameQueued  = false;

        // ── DOM差分キャッシュ（不要な再描画を防ぐ） ───────────────
        let lastTimerText      = '';
        let lastProgressWidth  = '';
        let lastProgressColor  = '';
        let lastTimerUrgency   = '';   // タイマー文字の色段階（'' / 'warn' / 'urgent'）
        let lastImageTransform = '';
        let lastImageFilter    = '';
        let lastImageOpacity   = '';
        let lastGridDisplay    = '';

        // ── 履歴パネル ───────────────────────────────────────────
        let historyRenderToken    = 0;
        let historyVirtualCleanup = null;
        let isHistoryPanelOpen    = false;
        let renderHistoryRafId    = null;

        // ── フォーカス・目隠し ────────────────────────────────────
        let isEyeHideEnabled = false;
        let eyeHideTimeout   = null;
        let focusIdleTimer   = null;
        let isFocusDimmed    = false;

        // ── フィルター表示フラグ ──────────────────────────────────
        let showFavsOnly   = false;
        let showHiddenOnly = false;

        let skipList = CroquisStore.getJSON(CROQUIS_KEYS.SKIPS, []);
        let skipNameSet = new Set(skipList);
        const settingsKey = CROQUIS_KEYS.SETTINGS;
        let favNameSet = new Set();
        
        let pipVideo, pipCanvas, pipCtx, isPiP = false, pipInitialized = false;
        let documentPipWindow = null; // Document PiP用の変数
        let pipRenderStamp = '';
        let pipFlashStartTime = 0; // Video PiP用フラッシュタイムスタンプ

        let db; const dbName = "CroquisAppDB", storeName = "favorites";
        const hasMediaSession = 'mediaSession' in navigator;
        const bgColors = ['#1e1e1e', '#000', '#fff'];

        // SVGアイコンの定義
        const iconPlaySVG = `<svg viewBox="0 0 24 24" class="svg-icon"><path d="M8 5v14l11-7z"/></svg>`;
        const iconPauseSVG = `<svg viewBox="0 0 24 24" class="svg-icon"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
        const iconPrevSVG = `<svg viewBox="0 0 24 24" class="svg-icon"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>`;
        const iconNextSVG = `<svg viewBox="0 0 24 24" class="svg-icon"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>`;
        const iconVolSVG = `<svg viewBox="0 0 24 24" class="svg-icon"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`;
        const iconMuteSVG = `<svg viewBox="0 0 24 24" class="svg-icon"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>`;

        const ui = {
            // ── コア要素 ──────────────────────────────────────────
            img:              document.getElementById('main-image'),
            timer:            document.getElementById('timer-label'),
            prog:             document.getElementById('progress-bar'),
            playBtn:          document.getElementById('play-btn'),
            grid:             document.getElementById('grid-overlay'),
            sound:            document.getElementById('sound-player'),
            phase:            document.getElementById('phase-label'),
            hmBtn:            document.getElementById('hm-btn'),
            btnHmShow:        document.getElementById('btn-hm-show'),
            btnHmHide:        document.getElementById('btn-hm-hide'),
            muteBtn:          document.getElementById('mute-btn'),
            pipBtn:           document.getElementById('pip-btn'),
            favIcon:          document.getElementById('fav-icon-large'),
            managePopup:      document.getElementById('manage-popup'),
            eyeBtn:           document.getElementById('eye-btn'),
            hmMini:           document.getElementById('hm-step-mini'),
            historyPanel:     document.getElementById('history-panel'),
            historyContent:   document.getElementById('history-content'),
            historyFilterBtn: document.getElementById('history-filter-btn'),
            imageCounter:     document.getElementById('image-counter'),
            timeSelect:       document.getElementById('time-select'),
            bottomPanel:      document.getElementById('bottom-panel'),
            // ── 設定パネル要素 ────────────────────────────────────
            bwBtn:            document.getElementById('bw-btn'),
            bwBarWrap:        document.getElementById('bw-bar-wrap'),
            breakToggle:      document.getElementById('break-reminder-toggle'),
            eyeHideSel:       document.getElementById('eye-hide-delay-select'),
            focusIdleSel:     document.getElementById('focus-idle-delay-select'),
            breakIntSel:      document.getElementById('break-interval-select'),
            breakDurSel:      document.getElementById('break-duration-select'),
            flashSel:         document.getElementById('flash-intensity-select'),
            progSel:          document.getElementById('progress-size-select'),
            soundVolSel:      document.getElementById('sound-volume-select'),
            bwBarSlider:      document.getElementById('bw-bar-slider'),
            bwBarVal:         document.getElementById('bw-bar-val'),
            settingsPanel:    document.getElementById('settings-panel'),
            settingsOverlay:  document.getElementById('settings-overlay'),
            // ── 操作ボタン ────────────────────────────────────────
            rfBtn:            document.getElementById('randomFlip-btn'),
            flipHBtn:         document.getElementById('flipH-btn'),
            flipVBtn:         document.getElementById('flipV-btn'),
            shuffleBtn:       document.getElementById('shuffle-btn'),
            gridBtn:          document.getElementById('grid-btn'),
            monoBtn:          document.getElementById('mono-btn'),
            prevBtn:          document.getElementById('prev-btn'),
            nextBtn:          document.getElementById('next-btn'),
            folderInput:      document.getElementById('folder-input'),
            fileInput:        document.getElementById('file-input'),
            // ── 休憩・オーバーレイ ────────────────────────────────
            breakOverlay:     document.getElementById('break-overlay'),
            breakCorner:      document.getElementById('break-corner'),
            breakCountdown:   document.getElementById('break-countdown'),
            breakCornerCount: document.getElementById('break-corner-count'),
            // ── レイアウト要素 ────────────────────────────────────
            imgContainer:     document.getElementById('image-container'),
            canvasArea:       document.getElementById('canvas-area'),
            // ── 複数選択 ─────────────────────────────────────────
            msOverlay:        document.getElementById('multiselect-overlay'),
            msGrid:           document.getElementById('multiselect-grid'),
            msCount:          document.getElementById('multiselect-count'),
            // ── グリッド設定 ──────────────────────────────────────
            gridColorSel:     document.getElementById('grid-color-select'),
            gridOpacitySl:    document.getElementById('grid-opacity-slider'),
            gridOpacityVal:   document.getElementById('grid-opacity-val'),
        };
        // ── ユーティリティ ────────────────────────────────────────
        /**
         * デバウンス：連続呼び出し時は最後の呼び出しから delay ms 後に fn を実行する。
         * @param {Function} fn
         * @param {number} delay  ミリ秒
         * @returns {Function}    デバウンス済み関数
         */
        function debounce(fn, delay) {
            let timer = null;
            return function() {
                clearTimeout(timer);
                const ctx  = this;
                const args = arguments;
                timer = setTimeout(function() { timer = null; fn.apply(ctx, args); }, delay);
            };
        }

        // settings.key → button要素 のマッピング（toggle()で使用）
        const uiBtnMap = {
            shuffle: ui.shuffleBtn,
            flipH:   ui.flipHBtn,
            flipV:   ui.flipVBtn,
            grid:    ui.gridBtn,
            mono:    ui.monoBtn,
        };
        /**
         * 要素の active クラスを真偽値で一括制御する
         * @param {Element|null} el
         * @param {boolean} on
         */
        function setActive(el, on) {
            if (!el) return;
            if (on) el.classList.add('active');
            else    el.classList.remove('active');
        }

        /**
         * 要素の display を切り替える
         * @param {Element|null} el
         * @param {boolean} visible
         * @param {string} [displayValue='block']
         */
        function setVisible(el, visible, displayValue) {
            if (!el) return;
            el.style.display = visible ? (displayValue || 'block') : 'none';
        }

        /** ランダム反転 ON 時に個別反転ボタンを無効化する */
        function setFlipDisabled(disabled) {
            ui.flipHBtn.classList.toggle('flip-disabled', disabled);
            ui.flipVBtn.classList.toggle('flip-disabled', disabled);
        }

        function updateHmMini() {
            if (!hmActive) { ui.hmMini.textContent = ''; return; }
            const active = hmPhase || 1;
            const parts = ['①','②','③','④'].map(function(mark, idx) {
                const n = idx + 1;
                return n === active ? '[' + mark + ']' : mark;
            });
            ui.hmMini.textContent = parts.join('');
        }

        function initDB() {
            return new Promise((resolve) => {
                let request = indexedDB.open(dbName, 1);
                request.onupgradeneeded = function(e) { e.target.result.createObjectStore(storeName, { keyPath: "name" }); };
                request.onsuccess = function(e) { db = e.target.result; resolve(); };
                request.onerror = function() { resolve(); };
            });
        }
        // data には Blob を保存する（v3〜）。旧データの dataURL文字列もそのまま保存できる（後方互換）。
        function saveFavToDB(name, data) {
            if (!db) return;
            const tx = db.transaction(storeName, "readwrite");
            tx.onerror = function() {};
            tx.objectStore(storeName).put({ name: name, data: data, timestamp: Date.now() });
        }
        /** File/Blob を“そのまま”IndexedDB に保存し、表示用の blob: URL を返す（DataURL化しない＝軽量・高速）*/
        function saveFavFileToDB(item) {
            return new Promise(function(resolve) {
                try { saveFavToDB(item.name, item); resolve(URL.createObjectURL(item)); }
                catch(_) { resolve(null); }
            });
        }
        /** お気に入りに1枚追加（Blobを保存し、メモリには blob: URL を持たせる）。表示用URLを返す */
        function addFavorite(name, blob) {
            saveFavToDB(name, blob);
            const u = URL.createObjectURL(blob);
            dbFavImages.push({ name: name, data: u });
            rebuildFavNameSet();
            return u;
        }
        function deleteFavFromDB(name) {
            if (!db) return;
            const tx = db.transaction(storeName, "readwrite");
            tx.onerror = function() {};
            tx.objectStore(storeName).delete(name);
        }
        function getAllFavsFromDB() {
            return new Promise((resolve) => {
                if (!db) { resolve([]); return; }
                let request = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
                request.onsuccess = function() {
                    const rows = request.result || [];
                    // 保存形式が Blob なら表示用の blob: URL に変換（dataURL文字列の旧データはそのまま使う）
                    rows.forEach(function(r){ if (r && r.data instanceof Blob) r.data = URL.createObjectURL(r.data); });
                    resolve(rows);
                };
                request.onerror = function() { resolve([]); };
            });
        }
        /** skipList を debounce 付きで localStorage に保存する */
        const saveSkipList = debounce(flushSkipList, TIMING.SAVE_DEBOUNCE_MS);
        /** skipList を localStorage に即時保存（beforeunload用） */
        function flushSkipList() {
            CroquisStore.setJSON(CROQUIS_KEYS.SKIPS, skipList, 'skip一覧');
        }

        // お気に入りの「永続 blob: URL」集合。プリロード等の自動revokeから守るために使う。
        let favUrlSet = new Set();
        function rebuildFavNameSet() {
            favNameSet = new Set(dbFavImages.map(function(f){ return f.name; }));
            favUrlSet  = new Set(dbFavImages.map(function(f){ return f.data; })
                .filter(function(d){ return typeof d === 'string' && d.indexOf('blob:') === 0; }));
        }
        // blob: URL を安全にrevoke（お気に入りの永続URLは消さない）
        function revokeIfOwned(u) {
            if (u && typeof u === 'string' && u.indexOf('blob:') === 0 && !favUrlSet.has(u)) URL.revokeObjectURL(u);
        }
        function rebuildSkipNameSet() { skipNameSet = new Set(skipList); }
        function hasUnskippedInCurrentPool() {
            if (isFavMode) return true;
            if (!images || images.length === 0) return false;
            // skipNameSet の交差数が images.length 未満なら未スキップが存在する
            let skipped = 0;
            for (let i = 0; i < images.length; i++) {
                if (skipNameSet.has(images[i].name)) {
                    skipped++;
                    if (skipped < images.length) return true; // 早期終了：まだ未スキップあり
                }
            }
            return skipped < images.length;
        }

        function isIOSDevice() {
            return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));
        }
        function checkDevice() {
            if (isIOSDevice()) setVisible(ui.pipBtn, false);
        }
        function syncAppHeight() {
            const vv = window.visualViewport;
            const innerH = window.innerHeight || 0;
            const vvH = vv ? vv.height : 0;
            const h = (vvH > 0) ? Math.min(innerH || vvH, vvH) : innerH;
            if (!h) return;
            document.documentElement.style.setProperty('--app-height', h + 'px');

            const isStandalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
            const isIOS = isIOSDevice();
            let safe = 0;
            if (isStandalone && isIOS && innerH > 0 && vvH > 0) {
                safe = Math.max(0, Math.round(innerH - vvH));
                if (safe > TIMING.SAFE_INSET_MAX_PX) safe = 0;
            }
            document.documentElement.style.setProperty('--bottom-safe', safe + 'px');
        }

        function flushUiSettings() {
            const payload = {
                settings: settings,
                bgMode: bgMode,
                isMuted: isMuted,
                isEyeHideEnabled: isEyeHideEnabled,
                randomFlipEnabled: randomFlipEnabled,
                breakReminderEnabled: breakReminderEnabled,
                eyeHideDelay: eyeHideDelay,
                focusIdleDelay: focusIdleDelay,
                breakIntervalMin: breakIntervalMin,
                breakDurationSec: breakDurationSec,
                flashIntensity: flashIntensity,
                progressBarSize: progressBarSize,
                soundVolume: soundVolume,
                bwContrast: bwContrast,
                gridColor: gridColor,
                gridOpacity: gridOpacity
            };
            CroquisStore.setJSON(settingsKey, payload, '設定');
        }
        /** 設定を debounce 付きで localStorage に保存する */
        const saveUiSettings = debounce(flushUiSettings, TIMING.SAVE_DEBOUNCE_MS);

        function loadUiSettings() {
            try {
                const raw = CroquisStore.getRaw(settingsKey);
                if (!raw) return;
                const saved = JSON.parse(raw);
                if (saved && saved.settings) {
                    settings.flipH = !!saved.settings.flipH;
                    settings.flipV = !!saved.settings.flipV;
                    settings.shuffle = saved.settings.shuffle !== false;
                    settings.grid = !!saved.settings.grid;
                    settings.mono = !!saved.settings.mono;
                    settings.bw = !!saved.settings.bw;
                }
                if (saved && typeof saved.bgMode === 'number') bgMode = Math.max(0, Math.min(2, saved.bgMode));
                if (saved && typeof saved.isEyeHideEnabled === 'boolean') isEyeHideEnabled = saved.isEyeHideEnabled;
                if (saved && typeof saved.randomFlipEnabled === 'boolean') randomFlipEnabled = saved.randomFlipEnabled;
                if (saved && typeof saved.breakReminderEnabled === 'boolean') {
                    breakReminderEnabled = saved.breakReminderEnabled;
                }
                if (saved && typeof saved.eyeHideDelay === 'number') eyeHideDelay = saved.eyeHideDelay;
                if (saved && typeof saved.focusIdleDelay === 'number') focusIdleDelay = saved.focusIdleDelay;
                if (saved && typeof saved.breakIntervalMin === 'number') breakIntervalMin = saved.breakIntervalMin;
                if (saved && typeof saved.breakDurationSec === 'number') breakDurationSec = saved.breakDurationSec;
                if (saved && typeof saved.bwContrast === 'number')
                    bwContrast = Math.max(TIMING.BW_CONTRAST_MIN, Math.min(TIMING.BW_CONTRAST_MAX, saved.bwContrast));
                if (saved && typeof saved.flashIntensity === 'number') flashIntensity = saved.flashIntensity;
                if (saved && typeof saved.progressBarSize === 'number') progressBarSize = saved.progressBarSize;
                if (saved && typeof saved.soundVolume === 'number') {
                    soundVolume = Math.max(0, Math.min(TIMING.VOLUME_MAX, saved.soundVolume));
                    isMuted = (soundVolume === 0);
                } else if (saved && typeof saved.isMuted === 'boolean') {
                    // 旧データ互換: isMutedだけ保存されていた場合
                    isMuted = saved.isMuted;
                    soundVolume = isMuted ? 0 : 2;
                }
                if (saved && typeof saved.gridColor === 'string'
                    && ['gray','white','black','red','green','blue','yellow'].includes(saved.gridColor)) gridColor = saved.gridColor;
                if (saved && typeof saved.gridOpacity === 'number')
                    gridOpacity = Math.max(1, Math.min(10, saved.gridOpacity));
            } catch (e) { console.warn('croquis: 設定の読み込みに失敗', e); }
        }

        function reflectUiSettings() {
            ['shuffle', 'flipH', 'flipV', 'grid', 'mono'].forEach(function(k) {
                setActive(uiBtnMap[k], !!settings[k]);
            });
            if (settings.bw) {
                setActive(ui.bwBtn, true);
                if (ui.bwBarWrap) ui.bwBarWrap.classList.toggle('visible', true);
            }
            if (ui.breakToggle) ui.breakToggle.checked = breakReminderEnabled;
            if (ui.eyeHideSel) ui.eyeHideSel.value = eyeHideDelay;
            if (ui.focusIdleSel) ui.focusIdleSel.value = focusIdleDelay;
            if (ui.breakIntSel) ui.breakIntSel.value = breakIntervalMin;
            if (ui.breakDurSel) ui.breakDurSel.value = breakDurationSec;
            if (ui.flashSel) ui.flashSel.value = flashIntensity;
            if (ui.progSel) { ui.progSel.value = progressBarSize; onProgressSizeChange(progressBarSize); }
            if (ui.soundVolSel) ui.soundVolSel.value = soundVolume;
            if (ui.bwBarSlider) ui.bwBarSlider.value = bwContrast;
            if (ui.bwBarVal) ui.bwBarVal.textContent = bwContrast;
            if (ui.gridColorSel) ui.gridColorSel.value = gridColor;
            if (ui.gridOpacitySl) ui.gridOpacitySl.value = gridOpacity;
            if (ui.gridOpacityVal) ui.gridOpacityVal.textContent = gridOpacity;
            applyGridStyle();
            setActive(ui.eyeBtn, !!isEyeHideEnabled);
            if (ui.rfBtn) {
                setActive(ui.rfBtn, randomFlipEnabled);
                setFlipDisabled(randomFlipEnabled);
            }
            ui.muteBtn.innerHTML = isMuted ? iconMuteSVG : iconVolSVG;
            document.documentElement.style.setProperty('--bg-color', bgColors[bgMode]);
        }

        window.onload = async function() {
            loadUiSettings();
            checkDevice();
            await initDB();
            dbFavImages = await getAllFavsFromDB();
            rebuildFavNameSet();
            initMediaSession();
            reflectUiSettings();
            updateImageCounter();   // 起動直後：画像0枚なら空状態の入口を出す
            syncAppHeight();
            document.addEventListener('visibilitychange', handleVisibilityChange);
            window.addEventListener('resize', syncAppHeight, { passive: true });
            window.addEventListener('orientationchange', function() {
                syncAppHeight();
                setTimeout(syncAppHeight, TIMING.RESIZE_DEBOUNCE_MS);
                setTimeout(syncAppHeight, TIMING.ORIENTATION_DELAY_MS);
            }, { passive: true });
            if (window.visualViewport) {
                window.visualViewport.addEventListener('resize', syncAppHeight, { passive: true });
            }
            armFocusIdleTimer();
        };

        function handleVisibilityChange() {
            if (document.hidden) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
                // PiP中でない場合はtimerTickLoopも停止して電力消費を抑える
                if (!isPiP && timerTickId) {
                    clearTimeout(timerTickId); timerTickId = null;
                }
            } else {
                if (isRunning) {
                    const now = Date.now();
                    if (expectedEndTime <= now) {
                        remaining = 0;
                        updateTimerText(0);
                        ui.prog.style.width = '0%';
                        flashScreen();
                        hmActive ? hmNextPhase() : nextImage();
                        return;
                    }
                    remaining = Math.ceil((expectedEndTime - now) / 1000);
                    updateTimerText(remaining);
                    // バックグラウンドで止まっていた場合は再起動
                    if (!timerTickId) timerTickLoop();
                    cancelAnimationFrame(animationFrameId);
                    animationFrameId = requestAnimationFrame(updateSmoothTimerRAF);
                }
                // スリープ復帰時にDocument PiPが消えていたら自動再接続
                if (isPiP && !documentPipWindow && 'documentPictureInPicture' in window) {
                    setTimeout(function() {
                        if (isPiP && !documentPipWindow) togglePiP();
                    }, 600);
                }
                // Video PiP復帰: document PiP非対応環境でPiPフラグが残っていたら再接続
                if (isPiP && !documentPipWindow && !('documentPictureInPicture' in window) && pipInitialized && typeof pipVideo.requestPictureInPicture === 'function') {
                    setTimeout(function() {
                        if (isPiP && !document.pictureInPictureElement) {
                            pipVideo.requestPictureInPicture().catch(function(){
                                isPiP = false; ui.pipBtn.classList.toggle('pip-active', false);
                            });
                        }
                    }, 600);
                }

                if (isPiP) updatePiP();
            }
        }

        // ---- ユーザー設定値 ----
        let eyeHideDelay = 5;      // ① 画像を隠すまでの秒数
        let focusIdleDelay = 5;    // ② フォーカスモードが暗くなるまでの秒数（0=無効）
        let breakIntervalMin = 15; // ③ 休憩インターバル（分）
        let breakDurationSec = 20; // ④ 休憩時間（秒）
        let flashIntensity = 2;    // ⑥ 0=なし 1=弱 2=中 3=強
        let progressBarSize = 2;   // ⑧ 1=細 2=中 3=太
        let soundVolume = 2;       // ⑩ 0=なし 1=小 2=中
        let bwContrast = 10;       // 2階調コントラスト強度（1〜20）
        let gridColor = 'gray';    // グリッド線の色: gray / white / black
        let gridOpacity = 4;       // グリッド線の濃さ: 1〜10

        // ---- 休憩リマインダー ----
        let breakReminderEnabled = false;
        let sessionStartTime = 0;
        let breakCountdownTimer = null;
        let breakSeconds = 0;

        function onBreakReminderToggle(enabled) {
            breakReminderEnabled = enabled;
            if (enabled) {
                sessionStartTime = isRunning ? Date.now() : 0;
            } else {
                sessionStartTime = 0;
                // 休憩中なら中断（タイマー再開はしない）
                if (breakCountdownTimer) {
                    clearInterval(breakCountdownTimer); breakCountdownTimer = null;
                    setActive(ui.breakOverlay, false);
                    setActive(ui.breakCorner, false);
                    breakWasRunning = false;
                }
            }
            saveUiSettings();
        }

        function checkBreakTrigger() {
            if (!breakReminderEnabled || sessionStartTime === 0) return false;
            if (hmActive) return false; // ハードモード中は発動しない
            return (Date.now() - sessionStartTime) >= (breakIntervalMin * 60 * 1000);
        }

        let breakWasRunning = false;

        function triggerBreak() {
            sessionStartTime = Date.now();
            const isLongTimer = timerSeconds >= 60;
            breakWasRunning = isRunning;
            if (isRunning) stopTimer();
            setFocusDimmed(false);
            if (focusIdleTimer) { clearTimeout(focusIdleTimer); focusIdleTimer = null; }
            playSound();
            if (isLongTimer) { startCornerBreak(); } else { startFullBreak(); }
        }

        function startFullBreak() {
            setActive(ui.breakOverlay, true);
            breakSeconds = breakDurationSec;
            ui.breakCountdown.textContent = breakSeconds;
            clearInterval(breakCountdownTimer);
            breakCountdownTimer = setInterval(function() {
                breakSeconds--;
                ui.breakCountdown.textContent = breakSeconds;
                if (breakSeconds <= 0) endBreak();
            }, 1000);
        }

        function startCornerBreak() {
            setActive(ui.breakCorner, true);
            breakSeconds = breakDurationSec;
            ui.breakCornerCount.textContent = breakSeconds;
            clearInterval(breakCountdownTimer);
            breakCountdownTimer = setInterval(function() {
                breakSeconds--;
                ui.breakCornerCount.textContent = breakSeconds;
                if (breakSeconds <= 0) endCornerBreak();
            }, 1000);
        }

        function _finishBreak() {
            clearInterval(breakCountdownTimer); breakCountdownTimer = null;
            const cb = breakOnEnd; breakOnEnd = null;     // 描画モードからの休憩なら、その後処理をコールバックで
            const shouldResume = breakWasRunning;
            breakWasRunning = false;
            if (cb) { cb(); }                              // 描画モード：描画タイマーの再開などはコールバック側に任せる
            else if (shouldResume) startTimer();
            armFocusIdleTimer();
        }

        // ── 描画モードからの「目の休憩」───────────────────────────
        // 描画モードは本体タイマーと別系統で動くので、休憩の発動だけ共通の全画面オーバーレイを借りる。
        // 設定（ON/OFF・インターバル）は本体と共有する。
        let breakOnEnd = null;
        window.croquisBreakInfo = function() {
            return { enabled: breakReminderEnabled, intervalMin: breakIntervalMin };
        };
        window.croquisStartSketchBreak = function(onEnd) {
            breakOnEnd = (typeof onEnd === 'function') ? onEnd : null;
            breakWasRunning = false;          // 本体タイマーは描画モード中は止まっているので再開しない
            setFocusDimmed(false);
            if (focusIdleTimer) { clearTimeout(focusIdleTimer); focusIdleTimer = null; }
            playSound();
            startFullBreak();                 // 目の休憩なので常に全画面（コーナー表示ではなく）
        };

        function endBreak() {
            setActive(ui.breakOverlay, false);
            setActive(ui.breakCorner, false);
            _finishBreak();
        }

        function endCornerBreak() {
            setActive(ui.breakCorner, false);
            _finishBreak();
        }

        /** グリッド線のCSS変数を更新する */
        function applyGridStyle() {
            const colorMap = {
                gray:   '128,128,128',
                white:  '255,255,255',
                black:  '0,0,0',
                red:    '255,60,60',
                green:  '60,200,60',
                blue:   '60,120,255',
                yellow: '255,220,0',
            };
            const rgb = colorMap[gridColor] || '128,128,128';
            const alpha = (gridOpacity / 10).toFixed(1);
            document.documentElement.style.setProperty('--grid-line-color', `rgba(${rgb},${alpha})`);
        }

        function onGridColorChange(val) {
            gridColor = val;
            applyGridStyle();
            saveUiSettings();
        }

        function onGridOpacityChange(val) {
            gridOpacity = val;
            if (ui.gridOpacityVal) ui.gridOpacityVal.textContent = val;
            applyGridStyle();
            saveUiSettings();
        }

        function onBwContrastChange(val) {
            bwContrast = val;
            const bsl = ui.bwBarSlider;
            if (bsl) bsl.value = val;
            const bval = ui.bwBarVal;
            if (bval) bval.textContent = val;
            if (settings.bw) applyFiltersDeferred();
            saveUiSettings();
        }
        function onFlashIntensityChange(val) {
            flashIntensity = val; saveUiSettings();
        }
        function onProgressSizeChange(val) {
            progressBarSize = val;
            const hMap = [0, 2, 4, 7];
            document.documentElement.style.setProperty('--progress-height', hMap[val] + 'px');
            saveUiSettings();
        }
        function onSoundVolumeChange(val) {
            soundVolume = val;
            isMuted = (val === 0);
            ui.muteBtn.innerHTML = isMuted ? iconMuteSVG : iconVolSVG;
            saveUiSettings();
        }
        function onEyeHideDelayChange(val) {
            eyeHideDelay = val; saveUiSettings();
        }
        function onFocusIdleDelayChange(val) {
            focusIdleDelay = val; armFocusIdleTimer(); saveUiSettings();
        }
        function onBreakIntervalChange(val) {
            breakIntervalMin = val; saveUiSettings();
        }
        function onBreakDurationChange(val) {
            breakDurationSec = val; saveUiSettings();
        }

        function toggleSettingsPanel() {
            const panel   = ui.settingsPanel;
            const overlay = ui.settingsOverlay;
            const isOpen  = panel.classList.contains('open');
            if (!isOpen) {
                // 履歴が開いていたら transition なしで即座に閉じる
                if (isHistoryPanelOpen) {
                    ui.historyPanel.style.transition = 'none';
                    isHistoryPanelOpen = false;
                    ui.historyPanel.classList.toggle('open', false);
                    historyRenderToken++;
                    clearHistoryThumbs();
                    requestAnimationFrame(function() {
                        requestAnimationFrame(function() {
                            ui.historyPanel.style.transition = '';
                        });
                    });
                }
                if (focusIdleTimer) { clearTimeout(focusIdleTimer); focusIdleTimer = null; }
                setFocusDimmed(false);
            } else {
                armFocusIdleTimer();
            }
            panel.classList.toggle('open', !isOpen);
            overlay.classList.toggle('open', !isOpen);
        }

        function toggleBottomPanel() { ui.bottomPanel.classList.toggle('hidden'); } // hidden は2値トグルのため classList.toggle をそのまま使用
        // 下バーのポップオーバー（素材 / 見え方 / 練習）。1つ開いたら他は閉じる
        function toggleBarPop(id) {
            const target = document.getElementById(id);
            const willOpen = target && !target.classList.contains('show');
            document.querySelectorAll('.bar-pop').forEach(function(p) { p.classList.remove('show'); });
            if (willOpen) { clampBarPop(target); target.classList.add('show'); }
        }
        // ポップの位置を開く直前に実測して決める。
        // 下バーは狭い画面で2段に折り返すため、ボタンの真上に出すと下段のポップが上段の
        // ボタン（再生・前後・時間）を覆って押せなくなる。なので必ず「下バー全体の上」に出す。
        // 横は押したボタンの真上に中央を合わせ、画面からはみ出す分だけ内側へ寄せる。
        function clampBarPop(pop) {
            const panel = ui.bottomPanel, btn = pop.previousElementSibling;
            if (!panel || !btn) return;
            const margin = 8;
            const panelTop = panel.getBoundingClientRect().top;
            // 高さは「下バーより上の空き」に収める（絵が全部隠れないように上限も付ける）
            pop.style.maxHeight = Math.max(160, Math.min(window.innerHeight * 0.55, panelTop - 70)) + 'px';
            const b = btn.getBoundingClientRect();
            const w = pop.offsetWidth;
            const left = Math.max(margin, Math.min(b.left + b.width / 2 - w / 2, window.innerWidth - w - margin));
            pop.style.left = Math.round(left) + 'px';
            pop.style.bottom = Math.round(window.innerHeight - panelTop + margin) + 'px';
        }
        function closeBarPops() {
            document.querySelectorAll('.bar-pop.show').forEach(function(p) { p.classList.remove('show'); });
        }
        function toggleManagePopup() { toggleBarPop('manage-popup'); }
        function setFocusDimmed(dim) {
            const panel = ui.bottomPanel;
            if (!panel || panel.classList.contains('hidden')) return;
            if (dim === isFocusDimmed) return;
            isFocusDimmed = dim;
            panel.classList.toggle('idle-dim', dim);
            // 上バーも一緒に引っ込める（残り時間の表示だけは残す＝CSS側でボタンのみ薄くする）
            const top = document.getElementById('top-panel');
            if (top) top.classList.toggle('idle-dim', dim);
            if (ui.imageCounter) ui.imageCounter.classList.toggle('idle-dim', dim);
        }
        function armFocusIdleTimer() {
            if (focusIdleTimer) clearTimeout(focusIdleTimer);
            setFocusDimmed(false);
            if (focusIdleDelay === 0) return;
            // 設定パネルが開いている間はidle-dimしない
            if (ui.settingsPanel.classList.contains('open')) return;
            focusIdleTimer = setTimeout(function() { setFocusDimmed(true); }, focusIdleDelay * 1000);
        }

