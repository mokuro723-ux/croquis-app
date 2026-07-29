/* ============================================================
   ★★★ 重要 ★★★
   index.html / style.css / js配下 などのファイルを変更したら、
   必ず下の CACHE_NAME の末尾の数字を 1 つ上げてください（例: v12 → v13）。
   ここを上げ忘れると、利用者の画面に更新が届かず、古いままになります。

   ＜ビルドツールなしで更新忘れを減らす案＞
   ・各ファイルの末尾に `?v=12` のようなクエリを付けてキャッシュキーにする運用
   ・将来ビルドを導入できるなら、ファイル内容のハッシュを自動でCACHE_NAMEに埋め込む
   （今は手動運用なので、上のコメントを目印にしてください）
   ============================================================ */
const CACHE_NAME = 'croquis-timer-v77';

// アプリ本体（オフラインでも動かすために事前キャッシュするファイル）
// ※ sw.js 自身はここに入れない（Service Workerファイルの自己キャッシュはアンチパターン）
// ※ ナビゲーションの保存キーは './index.html' に一本化（'./' は重複なので入れない）
const STATIC_CACHE = [
    './index.html',
    './manifest.json',
    './icon.png',
    './style.css',
    './js/app-core.js',
    './js/app-state.js',
    './js/app-images.js',
    './js/app-manage.js',
    './js/app-timer.js',
    './js/stats.js',
    './js/linejudge.js',
    './js/sketch.js',
    './js/features.js',
    './js/bindings.js'
];

const RUNTIME_CACHE = 'croquis-runtime-v1';

// アイコン等、無くてもアプリ本体は動くファイル。取得に失敗してもインストールを止めない。
// （以前は addAll 一発だったため、1ファイルの404でSWインストール全体が失敗し、
//   オフライン起動が一切できなくなる事故が起きていた）
const OPTIONAL_CACHE = ['./icon.png', './manifest.json'];

self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil(
        (async () => {
            const cache = await caches.open(CACHE_NAME);
            await Promise.all(STATIC_CACHE.map(async (url) => {
                try {
                    const res = await fetch(url, { cache: 'no-cache' });
                    if (!res.ok) throw new Error(url + ' → ' + res.status);
                    // Vercelの cleanUrls で '/index.html' → '/' にリダイレクトされた応答を
                    // そのまま保存すると、オフライン時のナビゲーションでブラウザに拒否され
                    // 白画面になる。応答を作り直して redirected フラグを消してから保存する。
                    // ※ヘッダーは Content-Type だけ引き継ぐ。res.headers をまるごと渡すと
                    //   圧縮前提の content-encoding / content-length が残るのに、
                    //   本文(blob)は解凍済みなので食い違い、オフライン時に読み込みが失敗して
                    //   白画面や「オフラインで使えない」になる。
                    const body = await res.blob();
                    const type = res.headers.get('content-type');
                    await cache.put(url, new Response(body, {
                        status: 200,
                        headers: type ? { 'Content-Type': type } : {}
                    }));
                } catch (err) {
                    if (OPTIONAL_CACHE.includes(url)) return;
                    // 通信が一瞬不安定だっただけでインストール全体が失敗すると、
                    // オフライン起動が丸ごと不能になる。前バージョンのキャッシュがあれば引き継ぐ。
                    const old = await caches.match(url);
                    if (!old) throw err; // 引き継ぐものが無い＝本当に壊れているのでインストール失敗にする
                    await cache.put(url, old);
                }
            }));
        })()
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        (async () => {
            const keys = await caches.keys();
            await Promise.all(
                keys
                    .filter((k) => k !== CACHE_NAME && k !== RUNTIME_CACHE)
                    .map((k) => caches.delete(k))
            );
            await self.clients.claim();
        })()
    );
});

self.addEventListener('fetch', (e) => {
    const req = e.request;

    if (req.method !== 'GET') return;

    const url = new URL(req.url);

    // ナビゲーション(HTML)はネット優先で更新反映を早める
    // 保存先キーは './index.html' に統一（リクエストURLが './' でもここに保存・取得する）
    if (req.mode === 'navigate') {
        e.respondWith(
            (async () => {
                try {
                    const fresh = await fetch(req);
                    // リダイレクト済み応答（/index.html→/ など）は保存しない。
                    // オフライン時にナビゲーションへ返すとブラウザに拒否されるため。
                    if (fresh.ok && !fresh.redirected) {
                        const cache = await caches.open(CACHE_NAME);
                        cache.put('./index.html', fresh.clone());
                    }
                    return fresh;
                } catch {
                    const cached = await caches.match('./index.html');
                    return cached || Response.error();
                }
            })()
        );
        return;
    }

    // 同一オリジンの自分のcss/jsは「ネット優先」（更新を確実に届ける）。
    // オフライン時だけキャッシュにフォールバックする。
    // ※ 以前はキャッシュ優先だったため、index.htmlだけ新しくJSが古いまま…という
    //   食い違い（ボタンはあるのに動かない等）が起きていた。
    if (url.origin === self.location.origin && /\.(?:js|css)$/.test(url.pathname)) {
        e.respondWith(
            (async () => {
                try {
                    const fresh = await fetch(req);
                    if (fresh && fresh.status === 200) {
                        const cache = await caches.open(CACHE_NAME);
                        cache.put(req, fresh.clone());
                    }
                    return fresh;
                } catch {
                    const cached = await caches.match(req);
                    return cached || Response.error();
                }
            })()
        );
        return;
    }

    // その他の同一オリジン静的ファイル(画像など)はキャッシュ優先
    if (url.origin === self.location.origin) {
        e.respondWith(
            (async () => {
                const cached = await caches.match(req);
                if (cached) return cached;

                try {
                    const fresh = await fetch(req);
                    if (fresh && fresh.status === 200) {
                        const runtime = await caches.open(RUNTIME_CACHE);
                        runtime.put(req, fresh.clone());
                    }
                    return fresh;
                } catch {
                    return Response.error();
                }
            })()
        );
    }
});
