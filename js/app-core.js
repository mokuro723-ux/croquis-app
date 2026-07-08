        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js').then(function(registration) {
                registration.addEventListener('updatefound', function() {
                    const worker = registration.installing;
                    if (!worker) return;
                    worker.addEventListener('statechange', function() {
                        if (worker.state === 'activated' && navigator.serviceWorker.controller) {
                            if (typeof window.showToast === 'function') window.showToast('アプリが新しいバージョンに更新されました', 3200);
                        }
                    });
                });
            }).catch(() => {}); // SWが無くても本体は動く
        }

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
            SKETCH_MEMSEC: 'croquis_sketch_memsec_v1',       // 記憶/タイマーの秒数
            SKETCH_SIZE: 'croquis_sketch_size_v1',           // ペンの太さ
            SKETCH_COLOR: 'croquis_sketch_color_v1',         // ペンの色（"色|不透明度"）
            SKETCH_GRID_COLOR: 'croquis_sketch_grid_color_v1', // グリッド線の色
            SKETCH_GRID_OP: 'croquis_sketch_grid_op_v1',     // グリッド線の濃さ(1〜10)
            SKETCH_BW_CONTRAST: 'croquis_sketch_bw_contrast_v1', // 二階調コントラスト(1〜20)
            SKETCH_CONVERGE: 'croquis_sketch_converge_v1',    // 並べる時のお手本⇔描画の寄せ(0〜100)
            SKETCH_REF_FRAME: 'croquis_sketch_ref_frame_v1',  // お手本側の外枠に色付き線を出すか
            SKETCH_TOOLSHIDE: 'croquis_sketch_toolshide_v1',  // 下ツールを畳んだ状態を次回も保つか(1/0)
            SKETCH_AUTOHIDE: 'croquis_sketch_autohide_v1',    // 描き始めたら自動で下ツールを畳むか(1/0)
            SKETCH_HAND: 'croquis_sketch_hand_v1',            // 利き手（'L'=左 / 'R'=右）。浮きボタンの左右位置に使う
            SKETCH_GUIDE: 'croquis_sketch_guide_v1',          // キャンバスのガイド線(0=なし / 1=中心十字 / 2=三分割)
            SKETCH_RECENT_COLOR: 'croquis_sketch_recent_color_v1', // 直近に使ったカスタム色（クイック再選択用）
            SHORTCUTS: 'croquis_shortcuts_v1',                // キーボードショートカットの割当（ユーザー変更）
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
                    catch(e) {
                        console.warn('croquis: ' + (label || key) + 'の保存に失敗', e);
                        if (typeof window.showToast === 'function') {
                            window.showToast('⚠ ' + (label || '設定') + 'の保存に失敗しました（端末の空き容量を確認）', 3200);
                        }
                    }
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

        // ── 設定のバックアップ（書き出し/読み込み） ──────────────────
        window.croquisExportSettings = function() {
            const data = {};
            Object.keys(CROQUIS_KEYS).forEach(function(name) {
                const key = CROQUIS_KEYS[name];
                const raw = CroquisStore.getRaw(key);
                if (raw !== null) data[key] = raw;
            });
            const payload = {
                app: 'croquis-timer',
                version: 1,
                exportedAt: new Date().toISOString(),
                data: data
            };
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const d = new Date();
            const fname = 'croquis_backup_' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '.json';
            const a = document.createElement('a');
            a.href = url; a.download = fname;
            document.body.appendChild(a); a.click(); a.remove();
            URL.revokeObjectURL(url);
            if (typeof window.showToast === 'function') window.showToast('設定を書き出しました（お気に入り画像は含みません）', 2600);
        };

        window.croquisImportSettings = function(file) {
            const reader = new FileReader();
            reader.onload = function() {
                let payload;
                try { payload = JSON.parse(reader.result); }
                catch (e) { alert('ファイルを読み込めませんでした（JSONとして解釈できません）'); return; }
                if (payload.app !== 'croquis-timer' || !payload.data) {
                    alert('このファイルはクロッキータイマーのバックアップではありません');
                    return;
                }
                if (!confirm('現在の設定をバックアップの内容で上書きします。よろしいですか？')) return;
                Object.keys(payload.data).forEach(function(key) {
                    if (key.indexOf('croquis_') === 0) CroquisStore.setRaw(key, payload.data[key]);
                });
                alert('設定を読み込みました。画面を再読み込みします。');
                location.reload();
            };
            reader.readAsText(file);
        };

        // ── キーボードショートカット（ユーザーが割当を変更できる） ──────
        // 各ハンドラは e.code 直書きをやめ CroquisShortcuts.match(id, e) で判定する。
        const CROQUIS_SHORTCUT_DEFS = [
            { id: 'g_play',    scope: 'global', def: 'Space',        label: '再生 / 一時停止' },
            { id: 'g_next',    scope: 'global', def: 'ArrowRight',   label: '次の画像' },
            { id: 'g_prev',    scope: 'global', def: 'ArrowLeft',    label: '前の画像' },
            { id: 'g_fav',     scope: 'global', def: 'KeyF',         label: 'お気に入り登録 / 解除' },
            { id: 'g_grid',    scope: 'global', def: 'KeyG',         label: 'グリッド' },
            { id: 'g_flipH',   scope: 'global', def: 'KeyH',         label: '左右反転' },
            { id: 'g_flipV',   scope: 'global', def: 'KeyV',         label: '上下反転' },
            { id: 'g_sketch',  scope: 'global', def: 'KeyD',         label: '描画モードを開く' },
            { id: 'g_online',  scope: 'global', def: 'KeyO',         label: 'オンライン素材' },
            { id: 'g_tag',     scope: 'global', def: 'KeyT',         label: 'タグ（フォルダ分け）' },
            { id: 'g_pip',     scope: 'global', def: 'KeyP',         label: '小窓表示（PiP）' },
            { id: 'g_mute',    scope: 'global', def: 'KeyM',         label: '音のオン / オフ' },
            { id: 's_pen',     scope: 'sketch', def: 'KeyB',         label: 'ペン' },
            { id: 's_eraser',  scope: 'sketch', def: 'KeyE',         label: '消しゴム' },
            { id: 's_lasso',   scope: 'sketch', def: 'KeyL',         label: '投げ縄' },
            { id: 's_formen',  scope: 'sketch', def: 'KeyW',         label: 'お題（ウォームアップ）' },
            { id: 's_grid',    scope: 'sketch', def: 'KeyG',         label: 'グリッド' },
            { id: 's_sizeDown',scope: 'sketch', def: 'BracketLeft',  label: 'ペンを細く' },
            { id: 's_sizeUp',  scope: 'sketch', def: 'BracketRight', label: 'ペンを太く' },
            { id: 's_zoomIn',  scope: 'sketch', def: 'Equal',        label: 'お手本ズームイン' },
            { id: 's_zoomOut', scope: 'sketch', def: 'Minus',        label: 'お手本ズームアウト' },
            { id: 's_zoomReset',scope:'sketch', def: 'Digit0',       label: 'ズーム解除（等倍）' },
        ];
        function croquisKeyLabel(code){
            if (!code) return '—';
            if (/^Key[A-Z]$/.test(code)) return code.slice(3);
            if (/^Digit[0-9]$/.test(code)) return code.slice(5);
            const m = { Space: 'Space', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
                BracketLeft: '[', BracketRight: ']', Minus: '－', Equal: '＋', Comma: ',', Period: '.',
                Slash: '/', Semicolon: ';', Quote: "'", Backslash: '\\', Backquote: '`', Enter: 'Enter', Tab: 'Tab' };
            return m[code] || code.replace(/^Key|^Digit/, '');
        }
        const CroquisShortcuts = (function(){
            const map = {};
            CROQUIS_SHORTCUT_DEFS.forEach(function(d){ map[d.id] = d.def; });
            const saved = CroquisStore.getJSON(CROQUIS_KEYS.SHORTCUTS, null);
            if (saved && typeof saved === 'object') {
                Object.keys(saved).forEach(function(k){ if (map.hasOwnProperty(k) && typeof saved[k] === 'string') map[k] = saved[k]; });
            }
            function persist(){ CroquisStore.setJSON(CROQUIS_KEYS.SHORTCUTS, map, 'ショートカット'); }
            function defOf(id){ return CROQUIS_SHORTCUT_DEFS.find(function(d){ return d.id === id; }); }
            return {
                defs: CROQUIS_SHORTCUT_DEFS,
                get: function(id){ return map[id]; },
                // 修飾キー無しの単キー判定（Ctrl/⌘/Alt と組み合わさったものは別扱いで素通し）
                match: function(id, e){ return !e.ctrlKey && !e.metaKey && !e.altKey && e.code === map[id]; },
                set: function(id, code){ if (map.hasOwnProperty(id)) { map[id] = code; persist(); } },
                reset: function(id){ const d = defOf(id); if (d) { map[id] = d.def; persist(); } },
                resetAll: function(){ CROQUIS_SHORTCUT_DEFS.forEach(function(d){ map[d.id] = d.def; }); persist(); },
                // 同スコープ内で同じキーを使っている別アクションを返す（割当時の重複警告用）
                conflict: function(id, code){ const d0 = defOf(id); let hit = null; CROQUIS_SHORTCUT_DEFS.forEach(function(d){ if (d.id !== id && d.scope === d0.scope && map[d.id] === code) hit = d; }); return hit; },
            };
        })();
        window.CroquisShortcuts = CroquisShortcuts;
        window.croquisKeyLabel = croquisKeyLabel;

        // ── ショートカット設定UI（設定パネル内） ──
        let shortcutCapturingId = null;
        function renderShortcutSettings(){
            const wrap = document.getElementById('shortcut-list');
            if (!wrap) return;
            wrap.innerHTML = '';
            [{ scope: 'global', title: '全体' }, { scope: 'sketch', title: '描画モード' }].forEach(function(g){
                const head = document.createElement('div'); head.className = 'shortcut-group-title'; head.textContent = g.title;
                wrap.appendChild(head);
                CroquisShortcuts.defs.filter(function(d){ return d.scope === g.scope; }).forEach(function(d){
                    const row = document.createElement('div'); row.className = 'shortcut-row';
                    const name = document.createElement('span'); name.className = 'shortcut-name'; name.textContent = d.label;
                    const key = document.createElement('button'); key.type = 'button'; key.className = 'shortcut-key';
                    if (shortcutCapturingId === d.id) { key.textContent = 'キーを押す…'; key.classList.add('capturing'); }
                    else key.textContent = croquisKeyLabel(CroquisShortcuts.get(d.id));
                    key.addEventListener('click', function(){ shortcutCapturingId = (shortcutCapturingId === d.id) ? null : d.id; renderShortcutSettings(); });
                    row.appendChild(name); row.appendChild(key);
                    wrap.appendChild(row);
                });
            });
        }
        // 割当の取り込み（capture段階で最優先。割当中だけ作用し、その間は通常のショートカットを止める）
        const SHORTCUT_MODIFIERS = ['ControlLeft','ControlRight','ShiftLeft','ShiftRight','AltLeft','AltRight','MetaLeft','MetaRight'];
        document.addEventListener('keydown', function(e){
            if (!shortcutCapturingId) return;
            e.preventDefault(); e.stopImmediatePropagation();
            if (e.code === 'Escape') { shortcutCapturingId = null; renderShortcutSettings(); return; }
            if (SHORTCUT_MODIFIERS.indexOf(e.code) >= 0) return; // 修飾キー単体は無視（次の本キーを待つ）
            const id = shortcutCapturingId;
            const conflict = CroquisShortcuts.conflict(id, e.code);
            CroquisShortcuts.set(id, e.code);
            shortcutCapturingId = null;
            renderShortcutSettings();
            if (conflict && typeof window.showToast === 'function') window.showToast('「' + conflict.label + '」と同じキーになりました（必要なら変更してください）', 3200);
        }, true);
        window.renderShortcutSettings = renderShortcutSettings;
        window.resetShortcuts = function(){
            CroquisShortcuts.resetAll(); shortcutCapturingId = null; renderShortcutSettings();
            if (typeof window.showToast === 'function') window.showToast('ショートカットを初期設定に戻しました');
        };

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

