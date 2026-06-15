        if ('serviceWorker' in navigator) { navigator.serviceWorker.register('./sw.js').catch(() => {}); }

        // ── 保存名の一覧表（localStorageキーはここで一元管理） ──────
        const CROQUIS_KEYS = {
            SETTINGS:    'croquis_ui_settings_v1',
            STATS:       'croquis_stats_v1',
            TAGS:        'croquis_tags_v1',
            CLASS:       'croquis_class_v1',
            SKIPS:       'croquis_skips_v1',
            SKETCH_SIDE: 'croquis_sketch_side_v1',
            SKETCH_GRID: 'croquis_sketch_grid_v1',
            SKETCH_STAB: 'croquis_sketch_stab_v1',
            SKETCH_STAB_STR: 'croquis_sketch_stab_str_v1',
            SKETCH_PAPER: 'croquis_sketch_paper_v1',
            SKETCH_MEMFADE: 'croquis_sketch_memfade_v1',
            SKETCH_CMP: 'croquis_sketch_cmp_v1',
            SKETCH_LASSOPREV: 'croquis_sketch_lassoprev_v1',
        };

        // ── 保存係（読み書きと失敗時の記録を一手に引き受ける） ──────
        const CroquisStore = (function(){
            // 旧名→新名のデータ引き継ぎ（初回だけ実行。リセット後に復活しないよう印を付ける）
            const MIGRATED_FLAG = 'croquis_store_migrated_v1';
            try {
                if (localStorage.getItem(MIGRATED_FLAG) === null) {
                    [['croquis_skips', CROQUIS_KEYS.SKIPS],
                     ['croquis_sketch_side', CROQUIS_KEYS.SKETCH_SIDE]].forEach(function(p){
                        const oldVal = localStorage.getItem(p[0]);
                        if (oldVal !== null && localStorage.getItem(p[1]) === null) {
                            localStorage.setItem(p[1], oldVal);
                        }
                        // 旧データは保険としてそのまま残す（手動で消してもOK）
                    });
                    localStorage.setItem(MIGRATED_FLAG, '1');
                }
            } catch(e) { console.warn('croquis: データ引き継ぎに失敗', e); }

            return {
                // 生の文字列を読む（無ければ null）
                getRaw: function(key) {
                    try { return localStorage.getItem(key); }
                    catch(e) { console.warn('croquis: 読み込みに失敗 (' + key + ')', e); return null; }
                },
                // JSONとして読む（無い・壊れている場合は fallback を返す）
                getJSON: function(key, fallback) {
                    try {
                        const raw = localStorage.getItem(key);
                        if (raw === null) return fallback;
                        const v = JSON.parse(raw);
                        return (v === null || v === undefined) ? fallback : v;
                    } catch(e) { console.warn('croquis: 読み込みに失敗 (' + key + ')', e); return fallback; }
                },
                setRaw: function(key, value, label) {
                    try { localStorage.setItem(key, value); }
                    catch(e) { console.warn('croquis: ' + (label || key) + 'の保存に失敗', e); }
                },
                setJSON: function(key, value, label) {
                    this.setRaw(key, JSON.stringify(value), label);
                },
                remove: function(key) {
                    try { localStorage.removeItem(key); }
                    catch(e) { console.warn('croquis: 削除に失敗 (' + key + ')', e); }
                }
            };
        })();
        window.CROQUIS_KEYS = CROQUIS_KEYS;
        window.CroquisStore = CroquisStore;

        // ── タイミング定数 ────────────────────────────────────────
        const TIMING = {
            TICK_INTERVAL_MS:     250,   // timerTickLoop 間隔
            SAVE_DEBOUNCE_MS:     120,   // 設定保存デバウンス
            RESIZE_DEBOUNCE_MS:   100,   // リサイズデバウンス
            ORIENTATION_DELAY_MS: 300,   // 画面回転後の再計算遅延
            FLASH_DURATION_MS:    700,   // フラッシュアニメーション長
            PIP_MIN_INTERVAL_MS:   66,   // PiP最小更新間隔（≒15fps）
            LONG_PRESS_DELAY_MS:  450,   // 長押し判定閾値（ms）
            SWIPE_THRESHOLD_PX:    50,   // スワイプ判定距離
            MOVE_THRESHOLD_PX:     14,   // 長押しキャンセル移動閾値
            DOUBLE_TAP_MS:        300,   // ダブルタップ判定
            EYE_HIDE_PRELOAD_MAX:  16,   // プリロードシャッフルガード
            BW_CONTRAST_MIN:        1,   // 2階調コントラスト最小値
            BW_CONTRAST_MAX:       20,   // 2階調コントラスト最大値
            VOLUME_MAX:             2,   // 音量最大値
            SAFE_INSET_MAX_PX:     40,   // iOS safe-area 上限
        };

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
            bwSlider:         document.getElementById('bw-contrast-slider'),
            bwContrastVal:    document.getElementById('bw-contrast-val'),
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
        function saveFavToDB(name, dataUrl) {
            if (!db) return;
            const tx = db.transaction(storeName, "readwrite");
            tx.onerror = function() {};
            tx.objectStore(storeName).put({ name: name, data: dataUrl, timestamp: Date.now() });
        }
        /** File/Blob を DataURL に変換してから IndexedDB に保存する（バックグラウンド用）*/
        function saveFavFileToDB(item) {
            return new Promise(function(resolve) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    saveFavToDB(item.name, e.target.result);
                    resolve(e.target.result);
                };
                reader.onerror = function() { resolve(null); };
                reader.readAsDataURL(item);
            });
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
                request.onsuccess = function() { resolve(request.result || []); };
                request.onerror = function() { resolve([]); };
            });
        }
        /** skipList を debounce 付きで localStorage に保存する */
        const saveSkipList = debounce(flushSkipList, TIMING.SAVE_DEBOUNCE_MS);
        /** skipList を localStorage に即時保存（beforeunload用） */
        function flushSkipList() {
            CroquisStore.setJSON(CROQUIS_KEYS.SKIPS, skipList, 'skip一覧');
        }

        function rebuildFavNameSet() { favNameSet = new Set(dbFavImages.map(function(f){ return f.name; })); }
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
            if (ui.bwSlider) ui.bwSlider.value = bwContrast;
            if (ui.bwContrastVal) ui.bwContrastVal.textContent = bwContrast;
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
            const shouldResume = breakWasRunning;
            breakWasRunning = false;
            if (shouldResume) startTimer();
            armFocusIdleTimer();
        }

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
            const sl = ui.bwSlider;
            if (sl) sl.value = val;
            const lbl = ui.bwContrastVal;
            if (lbl) lbl.textContent = val;
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
        function toggleManagePopup() { ui.managePopup.classList.toggle('show'); }
        function setFocusDimmed(dim) {
            const panel = ui.bottomPanel;
            if (!panel || panel.classList.contains('hidden')) return;
            if (dim === isFocusDimmed) return;
            isFocusDimmed = dim;
            panel.classList.toggle('idle-dim', dim);
        }
        function armFocusIdleTimer() {
            if (focusIdleTimer) clearTimeout(focusIdleTimer);
            setFocusDimmed(false);
            if (focusIdleDelay === 0) return;
            // 設定パネルが開いている間はidle-dimしない
            if (ui.settingsPanel.classList.contains('open')) return;
            focusIdleTimer = setTimeout(function() { setFocusDimmed(true); }, focusIdleDelay * 1000);
        }

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
            if (preloadUrl && preloadUrl.startsWith('blob:')) URL.revokeObjectURL(preloadUrl);
            preloadUrl = null; preloadName = ''; preloadedImage = null;
            if (preloadUrl2 && preloadUrl2.startsWith('blob:')) URL.revokeObjectURL(preloadUrl2);
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
            if (curUrl && curUrl.startsWith('blob:')) URL.revokeObjectURL(curUrl);
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
                if (preloadUrl2 && preloadUrl2.startsWith('blob:')) URL.revokeObjectURL(preloadUrl2);
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
            // 前のURLを解放（ただしプリロードURLと同じなら解放しない）
            if (currentImageUrl && currentImageUrl.startsWith('blob:') && currentImageUrl !== newUrl) {
                URL.revokeObjectURL(currentImageUrl);
            }
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
        
        function toggle(key) { 
            settings[key] = !settings[key]; const btn = uiBtnMap[key];
            setActive(btn, !!settings[key]);
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
                    dbFavImages.splice(foundIdx, 1); rebuildFavNameSet(); deleteFavFromDB(fname);
                    setVisible(ui.favIcon, false);
                    if (isHistoryPanelOpen && showFavsOnly) renderHistoryThumbs();
                }
                else {
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        const dataUrl = e.target.result; dbFavImages.push({ name: fname, data: dataUrl }); rebuildFavNameSet(); saveFavToDB(fname, dataUrl);
                        setVisible(ui.favIcon, true);
                        if (isHistoryPanelOpen && showFavsOnly) renderHistoryThumbs();
                    };
                    if (item.data) {
                        // v2: オンライン素材はURLから取得してデータURL化
                        if (String(item.data).indexOf('data:') === 0) { reader.onload({ target: { result: item.data } }); }
                        else { fetch(item.data).then(function(r){ return r.blob(); }).then(function(b){ reader.readAsDataURL(b); }).catch(function(){ alert('この画像はお気に入りに保存できませんでした（提供元の制限）'); }); }
                    } else { reader.readAsDataURL(item); }
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

        // ── 複数選択機能 ────────────────────────────────────────
        let multiSelectSet  = new Set();
        let msBlobCache     = new Map();

        function openMultiSelect() {
            ui.managePopup.classList.toggle('show', false);
            multiSelectSet.clear();
            msBlobCache = new Map();
            renderMultiSelectGrid();
            ui.msOverlay.classList.add('open');
        }

        function closeMultiSelect() {
            ui.msOverlay.classList.remove('open');
            multiSelectSet.clear();
            msBlobCache = new Map();
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
            }, { passive: true });

            overlay.addEventListener('pointermove', function(e) {
                if (e.pointerType === 'touch') return;
                if (!pointerActive || dragStartIdx < 0) return;
                lastX = e.clientX;
                lastY = e.clientY;
                const dx = Math.abs(e.clientX - lastX);
                const dy = Math.abs(e.clientY - lastY);
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
                const dataUrl = await saveFavFileToDB(item);
                // dbFavImages の data を更新
                const entry = dbFavImages.find(function(f) { return f.name === item.name; });
                if (entry && dataUrl) entry.data = dataUrl;
            }
        }

        async function multiSelectUnfav() {
            if (multiSelectSet.size === 0) return;
            const targets = Array.from(multiSelectSet)
                .map(function(i) { return sourceImages[i]; })
                .filter(function(item) { return item && favNameSet.has(item.name); });
            if (targets.length === 0) { showMultiSelectMsg('選択中にお気に入り登録済みの画像がありません'); return; }
            targets.forEach(function(item) {
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

        function toggleTimer() { if (images.length > 0) isRunning ? stopTimer() : startTimer(); }

        let audioPrewarmed = false;

        function startTimer() {
            isRunning = true;
            ui.playBtn.innerHTML = iconPauseSVG;
            ui.playBtn.classList.toggle('accent', false);
            expectedEndTime = Date.now() + (remaining * 1000);
            if (breakReminderEnabled && sessionStartTime === 0) sessionStartTime = Date.now();
            clearTimeout(timerTickId);    timerTickId    = null;
            cancelAnimationFrame(animationFrameId); animationFrameId = null;
            timerTickLoop();
            if (!document.hidden) animationFrameId = requestAnimationFrame(updateSmoothTimerRAF);
            updateMediaSession();
            if (isPiP) {
                if (pipVideo && pipVideo.paused) pipVideo.play().catch(function(){ /* 自動再生やPiPの制限で失敗しても無害なため無視 */ });
                updatePiP();
            }
            // iOS Safari 向けオーディオ事前起動（初回のみ）
            if (!isMuted && ui.sound && !audioPrewarmed) {
                audioPrewarmed = true;
                ui.sound.volume = 0;
                ui.sound.play().then(function() {
                    ui.sound.pause();
                    ui.sound.currentTime = 0;
                    ui.sound.volume = 1;
                }).catch(function(){ /* 自動再生やPiPの制限で失敗しても無害なため無視 */ });
            }
        }

        function stopTimer() {
            isRunning = false;
            ui.playBtn.innerHTML = iconPlaySVG;
            ui.playBtn.classList.toggle('accent', true);
            clearTimeout(timerTickId);    timerTickId    = null;
            cancelAnimationFrame(animationFrameId); animationFrameId = null;
            ui.timer.classList.toggle('urgent', false);
            updateMediaSession();
            if (isPiP) updatePiP();
        }
        
        // バックグラウンドでも動作するタイマー進行ループ（250ms間隔）
        function timerTickLoop() {
            if (!isRunning) return;
            const now = Date.now();
            const remainMs = expectedEndTime - now;
            if (remainMs <= 0) {
                remaining = 0;
                updateTimerText(0);
                clearTimeout(timerTickId); timerTickId = null;
                cancelAnimationFrame(animationFrameId); animationFrameId = null;
                flashScreen();
                if (typeof recordSessionStat === 'function') recordSessionStat(); // v2: 統計
                if (typeof classOnTimerEnd === 'function' && classOnTimerEnd()) return; // v3: クラスモード
                hmActive ? hmNextPhase() : nextImage();
                return;
            }
            const nextRemaining = Math.ceil(remainMs / 1000);
            const secondChanged = (nextRemaining !== remaining);
            if (secondChanged) {
                remaining = nextRemaining;
                updateTimerText(remaining);
                // 残り10秒以下でタイマー文字をハイライト
                ui.timer.classList.toggle('urgent', remaining <= 10);
            }
            // PiP中かつバックグラウンドのときは残り秒が変わったときだけ再描画
            if (isPiP && document.hidden && secondChanged) {
                pipRenderStamp = ''; updatePiP();
            }
            timerTickId = setTimeout(timerTickLoop, TIMING.TICK_INTERVAL_MS);
        }

        // フォアグラウンド専用のなめらか描画ループ（requestAnimationFrame）
        function updateSmoothTimerRAF() {
            if (!isRunning || document.hidden) { animationFrameId = null; return; }
            const now = Date.now(); const remainMs = expectedEndTime - now;
            const nextRemaining = Math.ceil(remainMs / 1000);
            if (remainMs <= 0) {
                // timerTickLoopに処理を任せる（二重発火防止）
                animationFrameId = null; return;
            }
            if (nextRemaining !== remaining) { remaining = nextRemaining; updateTimerText(remaining); }
            const totalMs = (hmActive ? hmPhases[hmPhase].s : timerSeconds) * 1000;
            const nextWidth = ((remainMs / totalMs) * 100) + '%';
            if (nextWidth !== lastProgressWidth) { ui.prog.style.width = nextWidth; lastProgressWidth = nextWidth; }
            const nextColor = remaining <= 5 ? 'var(--accent-urgent)' : 'var(--accent)';
            if (nextColor !== lastProgressColor) { ui.prog.style.backgroundColor = nextColor; lastProgressColor = nextColor; }
            if (isPiP && (now - lastPipUpdateTime > TIMING.PIP_MIN_INTERVAL_MS)) { updatePiP(); lastPipUpdateTime = now; }
            animationFrameId = requestAnimationFrame(updateSmoothTimerRAF);
        }

        window.addEventListener('beforeunload', function() {
            flushUiSettings(); // beforeunload: 即時保存
            flushSkipList(); // beforeunload: 即時保存
            clearTimeout(timerTickId); timerTickId = null;
            cancelAnimationFrame(animationFrameId); animationFrameId = null;
            clearPreloadUrl();
            if (currentImageUrl && currentImageUrl.startsWith('blob:')) {
                URL.revokeObjectURL(currentImageUrl);
                currentImageUrl = null;
            }
            historyUrls.forEach(function(url) { URL.revokeObjectURL(url); });
            historyUrls = [];
        });
        
        function resetTimer() {
            clearTimeout(timerTickId);    timerTickId    = null;
            cancelAnimationFrame(animationFrameId); animationFrameId = null;
            ui.timer.classList.toggle('urgent', false);
            remaining = hmActive ? hmPhases[hmPhase].s : timerSeconds;
            if (isRunning) {
                expectedEndTime = Date.now() + (remaining * 1000);
                timerTickLoop();
                if (!document.hidden) animationFrameId = requestAnimationFrame(updateSmoothTimerRAF);
            } else {
                updateTimerText(remaining);
                // 差分があるときのみ DOM 更新（プログレスバーの不要な再描画を防ぐ）
                if (lastProgressWidth !== '100%') {
                    ui.prog.style.width = '100%';
                    lastProgressWidth   = '100%';
                }
                if (lastProgressColor !== 'var(--accent)') {
                    ui.prog.style.backgroundColor = 'var(--accent)';
                    lastProgressColor             = 'var(--accent)';
                }
                if (isPiP) updatePiP();
            }
        }

        function setTimer(sec) {
            if (hmActive) exitHardMode();
            timerSeconds = sec;
            if (ui.timeSelect) ui.timeSelect.value = sec;
            resetTimer();
        }

        function updateTimerText(sec) {
            const m   = Math.floor(sec / 60);
            const s   = sec % 60;
            const txt = (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
            if (txt !== lastTimerText) { ui.timer.textContent = txt; lastTimerText = txt; }
        }

        function updateImageCounter() {
            const el = ui.imageCounter;
            if (!el) return;
            const pool = isFavMode ? dbFavImages : sourceImages;
            if (!pool || pool.length === 0) { el.textContent = ''; return; }
            el.textContent = (historyPos + 1) + ' / ' + pool.length;
        }
        
        function toggleMute() {
            isMuted = !isMuted;
            soundVolume = isMuted ? 0 : 2;
            ui.muteBtn.innerHTML = isMuted ? iconMuteSVG : iconVolSVG;
            if (ui.soundVolSel) ui.soundVolSel.value = soundVolume;
            saveUiSettings();
        }
        function playSound() {
            if (soundVolume === 0 || !ui.sound) return;
            const volMap = [0, 0.4, 1.0];
            ui.sound.volume = volMap[soundVolume];
            ui.sound.currentTime = 0;
            ui.sound.play().catch(function(){ /* 自動再生やPiPの制限で失敗しても無害なため無視 */ });
        }

        const FLASH_ALPHA_MAP = [0, 0.25, 0.45, 0.7];
        const FLASH_BLUR_MAP  = [0, 40,   60,   80 ];

        function flashScreen() {
            if (flashIntensity === 0) return;
            const alpha = FLASH_ALPHA_MAP[flashIntensity];
            const blur  = FLASH_BLUR_MAP[flashIntensity];
            const el = ui.imgContainer;
            if (!el) return;
            el.style.setProperty('--flash-alpha', alpha);
            el.style.setProperty('--flash-blur', blur + 'px');
            el.classList.remove('timer-flash');
            void el.offsetWidth;
            el.classList.add('timer-flash');
            el.addEventListener('animationend', function() {
                el.classList.remove('timer-flash');
            }, { once: true });

            if (documentPipWindow) {
                try {
                    const pipDoc = documentPipWindow.document;
                    const container = pipDoc.getElementById('canvas-container');
                    if (container) {
                        container.style.setProperty('--flash-alpha', alpha);
                        container.style.setProperty('--flash-blur', blur + 'px');
                        container.classList.remove('timer-flash');
                        void container.offsetWidth;
                        container.classList.add('timer-flash');
                        container.addEventListener('animationend', function() {
                            container.classList.remove('timer-flash');
                        }, { once: true });
                    }
                } catch(e) { console.warn("croquis: タイマー点滅の処理に失敗", e); }
            }

            if (isPiP && !documentPipWindow && pipInitialized) {
                pipFlashStartTime = Date.now();
                animatePipFlash();
            }
        }

        function animatePipFlash() {
            if (!isPiP || !pipCanvas || !pipCtx || documentPipWindow) return;
            const elapsed = Date.now() - pipFlashStartTime;
            const duration = TIMING.FLASH_DURATION_MS;
            if (elapsed >= duration) {
                pipRenderStamp = '';
                updatePiP();
                return;
            }
            const flashAlpha = FLASH_ALPHA_MAP[flashIntensity] * (1 - elapsed / duration);
            drawToCanvas(pipCanvas, pipCtx, true);
            // Canvas周囲にグローを描画
            const w = pipCanvas.width, h = pipCanvas.height;
            const glowSize = Math.round(w * 0.06);
            const grad = pipCtx.createLinearGradient(0, 0, glowSize, 0);
            grad.addColorStop(0, `rgba(0,212,255,${flashAlpha})`);
            grad.addColorStop(1, 'rgba(0,212,255,0)');
            pipCtx.fillStyle = grad; pipCtx.fillRect(0, 0, glowSize, h);
            pipCtx.save(); pipCtx.translate(w, 0); pipCtx.scale(-1, 1);
            pipCtx.fillStyle = grad; pipCtx.fillRect(0, 0, glowSize, h); pipCtx.restore();
            const gradT = pipCtx.createLinearGradient(0, 0, 0, glowSize);
            gradT.addColorStop(0, `rgba(0,212,255,${flashAlpha})`);
            gradT.addColorStop(1, 'rgba(0,212,255,0)');
            pipCtx.fillStyle = gradT; pipCtx.fillRect(0, 0, w, glowSize);
            // 下辺
            pipCtx.save(); pipCtx.translate(0, h); pipCtx.scale(1, -1);
            pipCtx.fillStyle = gradT; pipCtx.fillRect(0, 0, w, glowSize); pipCtx.restore();

            requestAnimationFrame(animatePipFlash);
        }
        function cycleBg() { 
            bgMode = (bgMode + 1) % 3; 
            document.documentElement.style.setProperty('--bg-color', bgColors[bgMode]); 
            saveUiSettings();
            if (isPiP) {
                pipRenderStamp = '';
                updatePiP();
            }
        }
        
        function toggleHardMode() { hmActive ? exitHardMode() : startHardMode(); }
        function startHardMode() {
            if (images.length === 0) return;
            hmActive = true;
            setActive(ui.hmBtn, true);
            setHmPhase(1);
            startTimer();
            updateHmMini();
        }
        function exitHardMode() {
            hmActive = false;
            setActive(ui.hmBtn, false);
            ui.phase.textContent = '';
            isImageHidden = false;
            setVisible(ui.btnHmShow, false);
            setVisible(ui.btnHmHide, false);
            updateHmMini();
            applyFilters();
            stopTimer();
            remaining = timerSeconds;
            updateTimerText(remaining);
            ui.prog.style.width = '100%'; lastProgressWidth = '100%';
            if (lastProgressColor !== 'var(--accent)') {
                ui.prog.style.backgroundColor = 'var(--accent)';
                lastProgressColor = 'var(--accent)';
            }
            if (isPiP) updatePiP();
        }
        function setHmPhase(p) {
            hmPhase = p;
            ui.phase.textContent = hmPhases[p].t;
            remaining     = hmPhases[p].s;
            isImageHidden = hmPhases[p].h;
            updateHmMini();
            applyFilters();
            playSound();
            resetTimer();
        }
        function hmNextPhase() {
            if (hmPhase < 4) {
                setHmPhase(hmPhase + 1);
            } else {
                stopTimer();
                ui.phase.textContent = '完了';
                setVisible(ui.btnHmShow, true);
                setVisible(ui.btnHmHide, true);
                playSound();
            }
        }

        function initMediaSession() {
            if (!hasMediaSession) return;
            navigator.mediaSession.setActionHandler('play',          function() { startTimer(); });
            navigator.mediaSession.setActionHandler('pause',         function() { stopTimer(); });
            navigator.mediaSession.setActionHandler('previoustrack', function() { prevImage(); });
            navigator.mediaSession.setActionHandler('nexttrack',     function() { nextImage(); });
        }
        function updateMediaSession() {
            if (hasMediaSession && images.length > 0) {
                const item = images[currentIndex];
                const title = item ? item.name : 'Croquis App';
                const artist = '残り: ' + lastTimerText;
                const album = isFavMode ? '★ お気に入り' : '通常再生';
                const stamp = title + '|' + album + '|' + (isRunning ? '1' : '0');
                if (updateMediaSession.lastStamp === stamp) return;
                updateMediaSession.lastStamp = stamp;
                navigator.mediaSession.metadata = new MediaMetadata({ title: title, artist: artist, album: album });
                navigator.mediaSession.playbackState = isRunning ? "playing" : "paused";
            }
        }

        function initPiP() {
            if(pipInitialized) return true;
            try {
                pipVideo = document.createElement('video'); pipVideo.muted = true; pipVideo.playsInline = true;
                pipVideo.style.position = 'fixed'; pipVideo.style.left = '-9999px'; pipVideo.style.opacity = '0'; pipVideo.style.pointerEvents = 'none';
                document.body.appendChild(pipVideo); pipCanvas = document.createElement('canvas'); pipCtx = pipCanvas.getContext('2d', { alpha: false });
                
                pipVideo.addEventListener('play', function() { if (isPiP && !isRunning) startTimer(); });
                pipVideo.addEventListener('pause', function() { if (isPiP && isRunning) stopTimer(); });
                pipVideo.addEventListener('leavepictureinpicture', function() { if(!documentPipWindow) { isPiP = false; ui.pipBtn.classList.toggle('pip-active', false); } });
                pipVideo.addEventListener('enterpictureinpicture', function() {
                    isPiP = true; ui.pipBtn.classList.toggle('pip-active', true); updatePiP();
                });
                pipVideo.addEventListener('webkitpresentationmodechanged', function() {
                    if (pipVideo.webkitPresentationMode === 'picture-in-picture') { isPiP = true; ui.pipBtn.classList.toggle('pip-active', true); updatePiP(); }
                    else if (!documentPipWindow) { isPiP = false; ui.pipBtn.classList.toggle('pip-active', false); }
                });
                pipInitialized = true; return true;
            } catch(e) { return false; }
        }

        async function togglePiP() {
            if (images.length === 0) { alert("画像を読み込んでください"); return; }
            
            // 1. 新技術 Document Picture-in-Picture API によるクリック可能な完全なUI実装
            if ('documentPictureInPicture' in window) {
                if (documentPipWindow) { documentPipWindow.close(); return; }
                try {
                    const nw = ui.img.naturalWidth, nh = ui.img.naturalHeight;
                    const ratio = (nw && nh) ? nw / nh : 4 / 3;
                    const pipWidth = Math.max(400, Math.min(800, window.innerWidth * 0.8));
                    const pipHeight = (pipWidth / ratio) + 60;
                    
                    documentPipWindow = await documentPictureInPicture.requestWindow({ width: Math.round(pipWidth), height: Math.round(pipHeight) });
                    
                    const pipDoc = documentPipWindow.document;
                    const currentBg = bgMode === 0 ? '#1e1e1e' : (bgMode === 1 ? '#000' : '#fff');

                    // PiPは別ドキュメントのためメインのCSSを共有できない。
                    // 色の出どころを style.css の --accent に一本化するため、ここで実際の値を読み取って注入する。
                    const pipAccent = (getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#00d4ff').trim();
                    const pipAccentRgb = (function(h){ const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h); return m ? (parseInt(m[1],16)+','+parseInt(m[2],16)+','+parseInt(m[3],16)) : '0,212,255'; })(pipAccent);

                    pipDoc.body.innerHTML = `
                        <style>
                            body { margin:0; background-color:${currentBg}; display:flex; flex-direction:column; height:100vh; overflow:hidden; color:#fff; font-family:sans-serif; user-select:none; }
                            #canvas-container { flex:1; display:flex; justify-content:center; align-items:center; position:relative; overflow:hidden; background-color: transparent; }
                            #canvas-container::after { content:''; position:absolute; inset:0; pointer-events:none; opacity:0; box-shadow:inset 0 0 var(--flash-blur, 60px) 12px rgba(${pipAccentRgb},var(--flash-alpha, 0.45)); }
                            #canvas-container.timer-flash::after { animation: timerFlash 0.7s ease-out forwards; }
                            @keyframes timerFlash { 0% { opacity:1; } 100% { opacity:0; } }
                            canvas { max-width:100%; max-height:100%; object-fit:contain; }
                            #controls { height:60px; background-color:#111; display:flex; justify-content:center; align-items:center; gap:25px; border-top:1px solid #333; }
                            button { background-color:#222; border:none; color:#ddd; cursor:pointer; display:flex; justify-content:center; align-items:center; width:52px; height:52px; border-radius:50%; transition:background 0.2s; outline:none; touch-action:manipulation; -webkit-user-select:none; user-select:none; -webkit-tap-highlight-color:transparent; }
                            button:hover { background-color:#444; }
                            button:active { transform: scale(0.95); }
                            svg { width:24px; height:24px; fill:currentColor; pointer-events:none; }
                            #pip-play-btn.paused { color: ${pipAccent}; border: 1px solid ${pipAccent}; background-color: #1a1a1a; }
                        </style>
                        <div id="canvas-container"><canvas></canvas></div>
                        <div id="controls">
                            <button id="pip-prev-btn" title="戻る">${iconPrevSVG}</button>
                            <button id="pip-play-btn" class="${isRunning ? '' : 'paused'}" title="再生/一時停止">${isRunning ? iconPauseSVG : iconPlaySVG}</button>
                            <button id="pip-next-btn" title="次へ">${iconNextSVG}</button>
                        </div>
                    `;
                    
                    // onclick は PiP別Windowと相性が悪いため pointer系イベントで制御
                    // setPointerCapture はスタイラス(pen)入力でキャンセルされるケースがあるため使用しない
                    function addPipBtnHandler(id, fn) {
                        const btn = pipDoc.getElementById(id);
                        if (!btn) return;
                        let pressed = false;

                        btn.addEventListener('pointerdown', function(e) {
                            e.preventDefault();
                            pressed = true;
                        }, { passive: false });

                        btn.addEventListener('pointerup', function(e) {
                            if (!pressed) return;
                            pressed = false;
                            // 座標判定に余白8pxを設けてスタイラスの接触点ブレに対応
                            const rect = btn.getBoundingClientRect();
                            const margin = 8;
                            if (e.clientX >= rect.left - margin && e.clientX <= rect.right + margin &&
                                e.clientY >= rect.top - margin && e.clientY <= rect.bottom + margin) {
                                fn();
                            }
                        });

                        btn.addEventListener('pointerleave', function() { pressed = false; });
                        btn.addEventListener('pointercancel', function() { pressed = false; });
                    }
                    addPipBtnHandler('pip-prev-btn', function(){ prevImage(); });
                    addPipBtnHandler('pip-play-btn', function(){ toggleTimer(); });
                    addPipBtnHandler('pip-next-btn', function(){ nextImage(); });
                    
                    function onPipPageHide() { documentPipWindow = null; isPiP = false; ui.pipBtn.classList.toggle('pip-active', false); }
                    documentPipWindow.addEventListener('pagehide', onPipPageHide);
                    
                    isPiP = true; ui.pipBtn.classList.toggle('pip-active', true); updatePiP();
                    return;
                } catch(e) { console.warn("Document PiP failed. Falling back to Video PiP", e); }
            }

            // 2. 非対応ブラウザ（iOS/Safariなど）へのVideo PiPフォールバック
            if (!initPiP() || typeof pipCanvas.captureStream !== 'function') { alert("お使いの環境はPiP機能に対応していません。"); return; }
            if (document.pictureInPictureElement) { await document.exitPictureInPicture().catch(function(){ /* 自動再生やPiPの制限で失敗しても無害なため無視 */ }); }
            else if (pipVideo && pipVideo.webkitPresentationMode === 'picture-in-picture') { pipVideo.webkitSetPresentationMode('inline'); } 
            else {
                try {
                    if (!pipVideo.srcObject) { pipVideo.srcObject = pipCanvas.captureStream(1); }
                    isPiP = true; updatePiP(); 
                    if(isRunning) { await pipVideo.play(); } else { pipVideo.pause(); }
                    if (typeof pipVideo.requestPictureInPicture === 'function' && document.pictureInPictureEnabled) {
                        await pipVideo.requestPictureInPicture();
                    } else if (pipVideo.webkitSupportsPresentationMode && pipVideo.webkitSupportsPresentationMode('picture-in-picture')) {
                        // iPhone / iPad Safari のネイティブPiP機構
                        if (pipVideo.paused) { await pipVideo.play().catch(function(){ /* 自動再生やPiPの制限で失敗しても無害なため無視 */ }); }
                        pipVideo.webkitSetPresentationMode('picture-in-picture');
                    } else { throw new Error('PiP unsupported'); }
                    updateMediaSession();
                } catch (error) { isPiP = false; }
            }
        }

        function drawToCanvas(canvas, ctx, drawOverlay) {
            const nw = ui.img.naturalWidth, nh = ui.img.naturalHeight;
            if (!nw || !nh) return;
            const ratio = nw / nh;
            const maxW = canvas === pipCanvas ? 2560 : 1200;
            const baseWidth = Math.min(Math.max(nw, maxW), maxW);
            const targetH = Math.round(baseWidth / ratio);
            if (canvas.width !== baseWidth || canvas.height !== targetH) {
                canvas.width = baseWidth; canvas.height = targetH;
            }
            ctx.fillStyle = bgMode === 0 ? '#1e1e1e' : (bgMode === 1 ? '#000' : '#fff');
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.save();
            if (!isImageHidden) {
                ctx.translate(canvas.width / 2, canvas.height / 2);
                if (settings.flipH) ctx.scale(-1,  1);
                if (settings.flipV) ctx.scale( 1, -1);
                if (settings.bw)        ctx.filter = `grayscale(1) contrast(${bwContrast})`;
                else if (settings.mono) ctx.filter = 'grayscale(100%)';
                ctx.drawImage(ui.img, -canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);
                if (settings.grid) {
                    ctx.filter      = 'none';
                    ctx.strokeStyle = 'rgba(128,128,128,0.4)';
                    ctx.lineWidth   = Math.max(2, canvas.width / 200);
                    ctx.beginPath();
                    ctx.moveTo(-canvas.width / 6, -canvas.height / 2); ctx.lineTo(-canvas.width / 6, canvas.height / 2);
                    ctx.moveTo( canvas.width / 6, -canvas.height / 2); ctx.lineTo( canvas.width / 6, canvas.height / 2);
                    ctx.moveTo(-canvas.width / 2, -canvas.height / 6); ctx.lineTo(canvas.width / 2, -canvas.height / 6);
                    ctx.moveTo(-canvas.width / 2,  canvas.height / 6); ctx.lineTo(canvas.width / 2,  canvas.height / 6);
                    ctx.stroke();
                }
            }
            ctx.restore();
            if (drawOverlay) {
                const barHeight = Math.max(4, canvas.height * 0.015); const totalMs = (hmActive ? hmPhases[hmPhase].s : timerSeconds) * 1000; 
                const remainMs = isRunning ? Math.max(0, expectedEndTime - Date.now()) : (remaining * 1000);
                const progWidth = (remainMs / totalMs) * canvas.width;
                
                ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'; ctx.fillRect(0, canvas.height - barHeight, canvas.width, barHeight);
                const barColor = remaining <= 10 ? '#5be7ff' : '#00d4ff';
                ctx.fillStyle = barColor;
                ctx.fillRect(0, canvas.height - barHeight, progWidth, barHeight);

                const fontSize = Math.max(16, canvas.height * 0.04);
                ctx.font        = `bold ${fontSize}px sans-serif`;
                ctx.textBaseline = 'top';
                ctx.textAlign    = 'right';

                const sec      = Math.ceil(remainMs / 1000);
                const m        = Math.floor(sec / 60);
                const s        = sec % 60;
                const timeText = (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);

                ctx.shadowColor   = 'rgba(0,0,0,0.8)';
                ctx.shadowBlur    = 6;
                ctx.shadowOffsetX = 2;
                ctx.shadowOffsetY = 2;
                ctx.fillStyle = remaining <= 10 ? '#5be7ff' : '#00d4ff';
                ctx.fillText(timeText, canvas.width - 20, 20);
                ctx.shadowColor   = 'transparent';
                ctx.shadowBlur    = 0;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
            }
        }

        function updatePiP() {
            if (!isPiP || !ui.img.complete || ui.img.naturalWidth === 0) return;
            const stamp = [
                currentIndex, remaining, isRunning ? 1 : 0, isImageHidden ? 1 : 0,
                settings.flipH ? 1 : 0, settings.flipV ? 1 : 0, settings.grid ? 1 : 0, settings.mono ? 1 : 0, settings.bw ? 1 : 0,
                hmActive ? hmPhase : 0, bgMode
            ].join('|');
            if (pipRenderStamp === stamp) return;
            pipRenderStamp = stamp;
            
            if (documentPipWindow) {
                const canvas = documentPipWindow.document.querySelector('canvas');
                if (canvas) {
                    const ctx = canvas.getContext('2d');
                    drawToCanvas(canvas, ctx, true); 
                }
                // PiP Windowは別コンテキストのため ui 参照不可
                const playBtn = documentPipWindow.document.getElementById('pip-play-btn');
                if (playBtn) {
                    playBtn.innerHTML = isRunning ? iconPauseSVG : iconPlaySVG;
                    playBtn.classList.toggle('paused', !isRunning);
                }
            } else if (pipInitialized && pipVideo) {
                drawToCanvas(pipCanvas, pipCtx, true);
            }
        }

        let pointerStartX = 0; let pointerStartY = 0; let lastTapTime = 0;
        let prevLongPressTimer = null, nextLongPressTimer = null;
        let prevLongPressHandled = false, nextLongPressHandled = false;
        let prevPressStartX = 0, prevPressStartY = 0, nextPressStartX = 0, nextPressStartY = 0;
        function handlePrevButtonClick(e) {
            if (prevLongPressHandled) { prevLongPressHandled = false; if (e) e.preventDefault(); return; }
            prevImage();
        }
        function handleNextButtonClick(e) {
            if (nextLongPressHandled) { nextLongPressHandled = false; if (e) e.preventDefault(); return; }
            nextImage();
        }
        function onPressStart(btn, which, startX, startY) {
            const delay = TIMING.LONG_PRESS_DELAY_MS;
            if (which === 'next') { nextPressStartX = startX; nextPressStartY = startY; }
            else { prevPressStartX = startX; prevPressStartY = startY; }
            const timer = setTimeout(function() {
                if (which === 'next') { nextLongPressHandled = true; skipCurrent(); }
                else if (which === 'prev') {
                    prevLongPressHandled = true;
                    if (images.length === 0 || isFavMode) return;
                    const fname = images[currentIndex] && images[currentIndex].name;
                    if (!fname || !skipNameSet.has(fname)) return;
                    skipList = skipList.filter(function(n){ return n !== fname; });
                    rebuildSkipNameSet();
                    saveSkipList();
                    alert("この画像のスキップを解除しました");
                }
            }, delay);
            if (which === 'next') nextLongPressTimer = timer;
            else prevLongPressTimer = timer;
        }
        function onPressEnd(which) {
            if (which === 'next' && nextLongPressTimer) { clearTimeout(nextLongPressTimer); nextLongPressTimer = null; }
            if (which === 'prev' && prevLongPressTimer) { clearTimeout(prevLongPressTimer); prevLongPressTimer = null; }
        }
        (function bindLongPressButtons(){
            const prevBtn = ui.prevBtn;
            const nextBtn = ui.nextBtn;
            if (!prevBtn || !nextBtn) return;
            prevBtn.addEventListener('pointerdown',  function(e) { onPressStart(prevBtn, 'prev', e.clientX, e.clientY); }, { passive: true });
            prevBtn.addEventListener('pointerup',     function()  { onPressEnd('prev'); }, { passive: true });
            prevBtn.addEventListener('pointerleave',  function()  { onPressEnd('prev'); }, { passive: true });
            prevBtn.addEventListener('pointercancel', function()  { onPressEnd('prev'); }, { passive: true });
            nextBtn.addEventListener('pointerdown',  function(e) { onPressStart(nextBtn, 'next', e.clientX, e.clientY); }, { passive: true });
            nextBtn.addEventListener('pointerup',     function()  { onPressEnd('next'); }, { passive: true });
            nextBtn.addEventListener('pointerleave',  function()  { onPressEnd('next'); }, { passive: true });
            nextBtn.addEventListener('pointercancel', function()  { onPressEnd('next'); }, { passive: true });
        })();
        document.addEventListener('pointermove', function(e) {
            const moveThreshold = TIMING.MOVE_THRESHOLD_PX;
            if (nextLongPressTimer) {
                if (Math.abs(e.clientX - nextPressStartX) > moveThreshold ||
                Math.abs(e.clientY - nextPressStartY) > moveThreshold) onPressEnd('next');
            }
            if (prevLongPressTimer) {
                if (Math.abs(e.clientX - prevPressStartX) > moveThreshold ||
                Math.abs(e.clientY - prevPressStartY) > moveThreshold) onPressEnd('prev');
            }
        }, { passive: true });
        ui.imgContainer.addEventListener('pointerup', function(e) {
            const pointerEndX = e.clientX; const pointerEndY = e.clientY;
            const diffX = pointerStartX - pointerEndX;
            const diffY = pointerStartY - pointerEndY;
            const threshold = TIMING.SWIPE_THRESHOLD_PX;
            if (Math.abs(diffX) > threshold && Math.abs(diffX) > Math.abs(diffY)) {
                if (diffX > 0) { nextImage(); } else { if (!hmActive) prevImage(); } lastTapTime = 0;
            } else if (Math.abs(diffY) <= 10 && Math.abs(diffX) <= threshold) {
                const currentTime = Date.now(); const tapLength = currentTime - lastTapTime;
                if (tapLength < TIMING.DOUBLE_TAP_MS && tapLength > 0) { toggleTimer(); lastTapTime = 0; e.preventDefault(); }
                else { lastTapTime = currentTime; }
            }
        }, { passive: false });
        document.addEventListener('keydown', function(e) {
            armFocusIdleTimer();
            if (document.activeElement.tagName === 'SELECT' || document.activeElement.tagName === 'INPUT') return;
            if (typeof isOverlayOpen === 'function' && isOverlayOpen()) return; // v2
            if (e.code === 'Escape') {
                const msOverlay = ui.msOverlay;
                if (msOverlay.classList.contains('open')) { closeMultiSelect(); return; }
                if (ui.managePopup.classList.contains('show')) { ui.managePopup.classList.toggle('show', false); return; }
                if (ui.settingsPanel.classList.contains('open')) { toggleSettingsPanel(); return; }
                if (isHistoryPanelOpen) { toggleHistoryPanel(); return; }
            }
            if (e.code === 'Space') { e.preventDefault(); toggleTimer(); } 
            else if (e.code === 'ArrowRight') { nextImage(); } 
            else if (e.code === 'ArrowLeft') { prevImage(); }
        });
        document.addEventListener('pointerdown', function(e) {
            pointerStartX = e.clientX; pointerStartY = e.clientY; armFocusIdleTimer();
            if (!e.target.closest('#manage-popup') && !e.target.closest('#manage-btn')) { ui.managePopup.classList.toggle('show', false); }
        }, { passive: true });
