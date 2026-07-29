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
            acquireWakeLock();
        }

        function stopTimer() {
            isRunning = false;
            ui.playBtn.innerHTML = iconPlaySVG;
            ui.playBtn.classList.toggle('accent', true);
            clearTimeout(timerTickId);    timerTickId    = null;
            cancelAnimationFrame(animationFrameId); animationFrameId = null;
            setTimerUrgency(99); // 一時停止時は色を通常へ戻す
            updateMediaSession();
            if (isPiP) updatePiP();
            releaseWakeLock();
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
                setTimerUrgency(remaining); // 残り時間に応じて色を段階強調
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
            if (nextRemaining !== remaining) { remaining = nextRemaining; updateTimerText(remaining); setTimerUrgency(remaining); }
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
            setTimerUrgency(99); // リセット時は色を通常へ戻す
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

        // 残り時間に応じてタイマー文字の色を段階強調：>10s=通常 / 6〜10s=警告(黄) / 1〜5s=緊急(赤＋鼓動)
        function setTimerUrgency(sec) {
            const level = (sec > 0 && sec <= 5) ? 'urgent' : (sec <= 10 && sec > 5) ? 'warn' : '';
            if (level === lastTimerUrgency) return; // 変化時だけDOM更新
            lastTimerUrgency = level;
            ui.timer.classList.toggle('warn', level === 'warn');
            ui.timer.classList.toggle('urgent', level === 'urgent');
        }

        function updateImageCounter() {
            const pool = isFavMode ? dbFavImages : sourceImages;
            const isEmpty = !pool || pool.length === 0;
            // 画像0枚のときは空状態の入口を出す（枚数表示と同じタイミングで必ず更新される）
            const empty = document.getElementById('empty-state');
            if (empty) empty.classList.toggle('show', isEmpty);
            const el = ui.imageCounter;
            if (!el) return;
            if (isEmpty) { el.textContent = ''; return; }
            el.textContent = (historyPos + 1) + ' / ' + pool.length;
        }
        
        function toggleMute() {
            isMuted = !isMuted;
            soundVolume = isMuted ? 0 : 2;
            ui.muteBtn.innerHTML = isMuted ? iconMuteSVG : iconVolSVG;
            if (ui.soundVolSel) ui.soundVolSel.value = soundVolume;
            if (window.showToast) window.showToast(isMuted ? '音：OFF' : '音：ON', 1300);
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
        const BG_NAMES = ['ダーク', '黒', '白'];
        function cycleBg() {
            bgMode = (bgMode + 1) % 3;
            document.documentElement.style.setProperty('--bg-color', bgColors[bgMode]);
            if (window.showToast) window.showToast('背景：' + (BG_NAMES[bgMode] || ''), 1300);
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
        // iOS Safari はダブルタップでブロックズームし画面がずれる。pointerupのpreventDefaultでは
        // ネイティブのズームを止められないため、touchendで2連続タップの既定動作を抑止する。
        let lastTouchEndT = 0;
        ui.imgContainer.addEventListener('touchend', function(e) {
            const now = Date.now();
            if (now - lastTouchEndT < TIMING.DOUBLE_TAP_MS) e.preventDefault();
            lastTouchEndT = now;
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
            if (CroquisShortcuts.match('g_play', e)) { e.preventDefault(); toggleTimer(); }
            else if (CroquisShortcuts.match('g_next', e)) { nextImage(); }
            else if (CroquisShortcuts.match('g_prev', e)) { prevImage(); }
        });
        document.addEventListener('pointerdown', function(e) {
            pointerStartX = e.clientX; pointerStartY = e.clientY; armFocusIdleTimer();
            if (!e.target.closest('.bar-pop') && !e.target.closest('.pop-btn')) { closeBarPops(); }
        }, { passive: true });

        // ── 画面スリープ防止（Wake Lock）──────────────────────────
        let croquisWakeLock = null;

        function acquireWakeLock() {
            if (!('wakeLock' in navigator)) return; // 非対応ブラウザでは何もしない
            navigator.wakeLock.request('screen').then(function(lock) {
                croquisWakeLock = lock;
                lock.addEventListener('release', function() { croquisWakeLock = null; });
            }).catch(function() {
                // 低電力モード等で失敗しても本体動作に影響なし
                croquisWakeLock = null;
            });
        }

        function releaseWakeLock() {
            if (croquisWakeLock) { croquisWakeLock.release().catch(function(){}); }
            croquisWakeLock = null;
        }

        // バックグラウンド移行時にOSが自動解放するため、再表示時に再生中なら取り直す
        document.addEventListener('visibilitychange', function() {
            if (!document.hidden && isRunning) acquireWakeLock();
        });
