    (function(){
        'use strict';
        /* ════════════════════════════════════════════════════════
           ボタン配線表（旧: HTMLのonclick属性。動きの中身は元のまま）
           「このボタン何やってる?」はこのファイルを見れば全部わかる
        ════════════════════════════════════════════════════════ */
        function bind(id, ev, fn){
            const el = document.getElementById(id);
            if (!el) { console.warn('croquis: 配線先が見つかりません #' + id); return; }
            el.addEventListener(ev, fn);
        }

        bind('je-togglehistorypanel', 'click', function(event){ toggleHistoryPanel(); });
        bind('settings-btn', 'click', function(event){ toggleSettingsPanel(); });
        bind('btn-hm-show', 'click', function(event){ isImageHidden=false; applyFilters(); });
        bind('btn-hm-hide', 'click', function(event){ isImageHidden=true; applyFilters(); });
        bind('bg-btn', 'click', function(event){ cycleBg(); });
        bind('mute-btn', 'click', function(event){ toggleMute(); });
        bind('je-togglebottompanel', 'click', function(event){ toggleBottomPanel(); });
        bind('history-filter-btn', 'click', function(event){ toggleHistoryFilter(); });
        bind('je-togglehistorypanel-2', 'click', function(event){ toggleHistoryPanel(); });
        bind('bw-bar-slider', 'input', function(event){ onBwContrastChange(parseInt(this.value)); });
        bind('je-document-getelementbyid-folder-input-cli', 'click', function(event){ document.getElementById('folder-input').click(); });
        bind('je-document-getelementbyid-file-input-click', 'click', function(event){ document.getElementById('file-input').click(); });
        bind('manage-btn', 'click', function(event){ toggleManagePopup(); });
        bind('prev-btn', 'click', function(event){ handlePrevButtonClick(event); });
        bind('play-btn', 'click', function(event){ toggleTimer(); });
        bind('next-btn', 'click', function(event){ handleNextButtonClick(event); });
        bind('time-select', 'change', function(event){ onTimeSelectChange(this.value); });
        bind('shuffle-btn', 'click', function(event){ toggle('shuffle'); });
        bind('flipH-btn', 'click', function(event){ toggle('flipH'); });
        bind('flipV-btn', 'click', function(event){ toggle('flipV'); });
        bind('randomFlip-btn', 'click', function(event){ toggleRandomFlip(); });
        bind('grid-btn', 'click', function(event){ toggle('grid'); });
        bind('mono-btn', 'click', function(event){ toggle('mono'); });
        bind('bw-btn', 'click', function(event){ toggleBW(); });
        bind('pip-btn', 'click', function(event){ togglePiP(); });
        bind('eye-btn', 'click', function(event){ toggleEyeHide(); });
        bind('online-btn', 'click', function(event){ toggleOnlinePanel(); });
        bind('sketch-btn', 'click', function(event){ toggleSketch(); });
        bind('hm-btn', 'click', function(event){ toggleHardMode(); });
        bind('je-togglefavcurrent', 'click', function(event){ toggleFavCurrent(); });
        bind('je-toggletagpanel', 'click', function(event){ toggleTagPanel(); });
        bind('je-skipcurrent', 'click', function(event){ skipCurrent(); });
        bind('je-openmultiselect', 'click', function(event){ openMultiSelect(); });
        bind('je-clearmanagedata', 'click', function(event){ clearManageData(); });
        bind('settings-overlay', 'click', function(event){ toggleSettingsPanel(); });
        bind('settings-close-btn', 'click', function(event){ toggleSettingsPanel(); });
        bind('break-reminder-toggle', 'change', function(event){ onBreakReminderToggle(this.checked); });
        bind('break-interval-select', 'change', function(event){ onBreakIntervalChange(parseInt(this.value)); });
        bind('break-duration-select', 'change', function(event){ onBreakDurationChange(parseInt(this.value)); });
        bind('eye-hide-delay-select', 'change', function(event){ onEyeHideDelayChange(parseInt(this.value)); });
        bind('focus-idle-delay-select', 'change', function(event){ onFocusIdleDelayChange(parseInt(this.value)); });
        bind('flash-intensity-select', 'change', function(event){ onFlashIntensityChange(parseInt(this.value)); });
        bind('progress-size-select', 'change', function(event){ onProgressSizeChange(parseInt(this.value)); });
        bind('bw-contrast-slider', 'input', function(event){ onBwContrastChange(parseInt(this.value)); });
        bind('grid-color-select', 'change', function(event){ onGridColorChange(this.value); });
        bind('grid-opacity-slider', 'input', function(event){ onGridOpacityChange(parseInt(this.value)); });
        bind('je-resetstats', 'click', function(event){ resetStats(); });
        bind('sound-volume-select', 'change', function(event){ onSoundVolumeChange(parseInt(this.value)); });
        bind('break-skip-btn', 'click', function(event){ endBreak(); });
        bind('multiselect-select-all', 'click', function(event){ multiSelectAll(); });
        bind('multiselect-deselect-all', 'click', function(event){ multiDeselectAll(); });
        bind('multiselect-close-btn', 'click', function(event){ closeMultiSelect(); });
        bind('multiselect-fav-btn', 'click', function(event){ multiSelectFav(); });
        bind('multiselect-unfav-btn', 'click', function(event){ multiSelectUnfav(); });
        bind('multiselect-skip-btn', 'click', function(event){ multiSelectSkip(); });
        bind('je-toggleonlinepanel', 'click', function(event){ toggleOnlinePanel(); });
        bind('online-query', 'keydown', function(event){ if(event.key==='Enter'){olSearch();} });
        bind('je-olsearch', 'click', function(event){ olSearch(); });
        bind('je-olselectall', 'click', function(event){ olSelectAll(); });
        bind('je-olapply-false', 'click', function(event){ olApply(false); });
        bind('je-olapply-true', 'click', function(event){ olApply(true); });
        bind('sketch-layout-btn', 'click', function(event){ skToggleLayout(); });
        bind('sketch-images-btn', 'click', function(event){ skToggleImages(); });
        bind('sketch-training-btn', 'click', function(event){ skStartTraining(); });
        bind('sketch-practice-tab', 'click', function(event){ skTogglePractice(); }); // 上バーの「練習」（メニューを開閉）
        bind('je-skloadfolder', 'click', function(event){ skLoadFolder(); });
        bind('je-skloadfiles', 'click', function(event){ skLoadFiles(); });
        bind('je-skloadfavs', 'click', function(event){ skLoadFavorites(); });
        // 下のタブ切り替え（描く / 投げ縄 / 表示 / 練習 / 設定）
        document.querySelectorAll('#sk-tabbar .sk-tab').forEach(function(t){
            t.addEventListener('click', function(){ skSetTab(t.getAttribute('data-tab')); });
        });
        bind('sketch-grid-btn', 'click', function(event){ skToggleGrid(); });
        bind('sketch-grid-op', 'input', function(event){ skSetGridOp(this.value); });
        bind('sketch-bwcontrast', 'input', function(event){ skSetBwContrast(this.value); });
        document.querySelectorAll('.sk-gridcolor').forEach(function(b){
            b.addEventListener('click', function(){ skSetGridColor(b.getAttribute('data-gc')); });
        });
        bind('sketch-fliph-btn', 'click', function(event){ skFlipHoriz(); });
        bind('sketch-flipv-btn', 'click', function(event){ skFlipVert(); });
        bind('sketch-mono-btn', 'click', function(event){ skToggleMonoImg(); });
        bind('sketch-bw-btn', 'click', function(event){ skToggleBwImg(); });
        bind('sketch-ref-btn', 'click', function(event){ skLoadRef(); });
        bind('sketch-formen-btn', 'click', function(event){ skToggleFormen(); });
        bind('sketch-deck', 'change', function(event){ skSetDeck(this.value); });
        bind('je-skformennext', 'click', function(event){ skFormenNext(); });
        bind('je-skformenclose', 'click', function(event){ skToggleFormen(); });
        bind('sketch-formen-op', 'input', function(event){ skSetFormenOpacity(this.value); });
        bind('sketch-timer-btn', 'click', function(event){ skToggleTimer(); });
        bind('sketch-memsec', 'change', function(event){ window.CroquisStore.setRaw(window.CROQUIS_KEYS.SKETCH_MEMSEC, this.value, '記憶の秒数'); });
        bind('sketch-size', 'change', function(event){ window.CroquisStore.setRaw(window.CROQUIS_KEYS.SKETCH_SIZE, this.value, 'ペンの太さ'); });
        bind('sketch-size', 'input', function(event){ skUpdateBrushPreview(); });                 // 太さの見本を即時更新
        bind('sketch-customcolor', 'input', function(event){ skSetCustomColor(this.value); });     // 好きな色を選ぶ
        bind('sketch-alpha', 'input', function(event){ skSetAlpha(this.value); });                 // ペンの濃さ
        bind('sketch-hide-btn', 'click', function(event){ skToggleHide(); });
        bind('sketch-mem-btn', 'click', function(event){ skStartMemory(); });
        bind('sketch-peek-btn', 'click', function(event){ skPeek(); });
        bind('sketch-reveal-btn', 'click', function(event){ skToggleReveal(); });
        bind('sketch-imgopacity', 'input', function(event){ skSetImgOpacity(this.value); });
        bind('sketch-refhide-btn', 'click', function(event){ skToggleRefHide(); });          // お手本の見え方メニュー
        bind('sketch-refop', 'input', function(event){ skSetRefOpacity(this.value); });        // お手本の濃さ
        bind('sketch-refhideall-btn', 'click', function(event){ skToggleHideAllRef(); });      // 完全に隠す/表示
        bind('sketch-refframe-btn', 'click', function(event){ skToggleRefFrame(); });          // お手本の外枠表示
        bind('sketch-split', 'input', function(event){ skSetConverge(this.value, false); });  // ドラッグ中は軽く追従
        bind('sketch-split', 'change', function(event){ skSetConverge(this.value, true); });   // 離したら保存＋線も移動
        bind('je-skprevimage', 'click', function(event){ skPrevImage(); });
        bind('je-sknextimage', 'click', function(event){ skNextImage(); });
        bind('je-sksave', 'click', function(event){ skSave(); });
        bind('je-togglesketch', 'click', function(event){ toggleSketch(); });
        bind('sk-tools-fab', 'click', function(event){ skToggleTools(); });
        bind('je-sktoggletools', 'click', function(event){ skToggleTools(); });
        bind('sketch-stab-btn', 'click', function(event){ skToggleStabilizer(); });
        bind('sketch-stab-strength', 'input', function(event){ skSetStabStrength(this.value); });
        bind('sketch-memfade-btn', 'click', function(event){ skToggleMemFade(); });
        bind('sketch-cmp-btn', 'click', function(event){ skToggleCompare(); });
        bind('sketch-lassoprev-btn', 'click', function(event){ skToggleLassoFillPreview(); });
        document.querySelectorAll('.sk-paper').forEach(function(b){
            b.addEventListener('click', function(){ skSetPaper(b.getAttribute('data-bg')); });
        });
        bind('sketch-eraser-btn', 'click', function(event){ skToggleEraser(); });
        bind('sketch-lasso-btn', 'click', function(event){ skSetLasso(false); });
        bind('sketch-lassolight-btn', 'click', function(event){ skSetLasso(true); });
        bind('je-skundo', 'click', function(event){ skUndo(); });
        bind('je-skredo', 'click', function(event){ skRedo(); });
        bind('je-skfade', 'click', function(event){ skFade(); });
        bind('je-skclear', 'click', function(event){ skClear(); });
        bind('tag-panel', 'click', function(event){ if(event.target===this)toggleTagPanel(); });
        bind('je-toggletagpanel-2', 'click', function(event){ toggleTagPanel(); });
        bind('tag-new-name', 'keydown', function(event){ if(event.key==='Enter'){tagCreate();} });
        bind('je-tagcreate', 'click', function(event){ tagCreate(); });
        bind('class-panel', 'click', function(event){ if(event.target===this)closeClassPanel(); });
        bind('je-closeclasspanel', 'click', function(event){ closeClassPanel(); });
        bind('je-claddrow', 'click', function(event){ clAddRow(); });
        bind('je-closeclasspanel-2', 'click', function(event){ closeClassPanel(); });
        bind('je-startclassfromeditor', 'click', function(event){ startClassFromEditor(); });
        bind('je-skipclassrest', 'click', function(event){ skipClassRest(); });
    })();
