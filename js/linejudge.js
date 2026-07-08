/*
 * linejudge.js — 線質採点エンジン
 * 出典: ペン入れ練習ゲーム penire-kiwamatter の採点ロジックを移植・簡約したもの。
 * 外部公開は window.LineJudge.score(drawn, path, tol) のみ。
 * 入力: drawn=ユーザーが描いた点列({x,y}の配列・3点以上)、path=お手本の点列(同じ画面座標系・2点以上)、
 *       tol=ガイド許容幅px(この距離まではお手本上とみなす)。条件を満たさなければ null を返す。
 * 出力: { total(総合0〜100), rank, smoothness, accuracy, coverage, endpointPenalty, overshootPenalty, hookPenalty }
 */
(function () {
    'use strict';

    // 滑らかさ：5点移動平均を3回かけ、元の点との平均距離が小さいほど高得点(震えの無さ)。5点未満は100。
    function calcSmoothness(drawn) {
        if (drawn.length < 5) return 100;
        function smooth(pts) {
            return pts.map(function (p, i) {
                if (i < 2 || i >= pts.length - 2) return p;
                return {
                    x: (pts[i-2].x + pts[i-1].x + p.x + pts[i+1].x + pts[i+2].x) / 5,
                    y: (pts[i-2].y + pts[i-1].y + p.y + pts[i+1].y + pts[i+2].y) / 5
                };
            });
        }
        const smoothed = smooth(smooth(smooth(drawn)));
        let sumDiff = 0;
        for (let i = 0; i < drawn.length; i++) {
            sumDiff += Math.hypot(drawn[i].x - smoothed[i].x, drawn[i].y - smoothed[i].y);
        }
        const avgDiff = sumDiff / drawn.length;
        return Math.min(100, Math.max(0, Math.round(100 - avgDiff * 10)));
    }

    // はみ出し：各描点からお手本点列への最短距離がtolを超える点の割合(0〜1)と、超えた点の平均超過量。
    // (距離計算は全点総当たり。点数は最大数百程度のためこの規模なら実用上瞬時)
    function calcOvershoot(drawn, path, tol) {
        if (!drawn.length) return { outsideRatio: 0, avgExcess: 0 };
        let outside = 0;
        let totalExcess = 0;
        for (let i = 0; i < drawn.length; i++) {
            const dp = drawn[i];
            let minD = Infinity;
            for (let j = 0; j < path.length; j++) {
                const d = Math.hypot(path[j].x - dp.x, path[j].y - dp.y);
                if (d < minD) minD = d;
            }
            if (minD > tol) { outside++; totalExcess += (minD - tol); }
        }
        const outsideRatio = outside / drawn.length;
        const avgExcess = outside > 0 ? totalExcess / outside : 0;
        return { outsideRatio: outsideRatio, avgExcess: avgExcess };
    }

    // 網羅率：お手本の各点についてtol×1.4以内に描点が1つでもあれば「通った」とみなし、通った割合×100
    function calcCoverage(drawn, path, tol) {
        if (!drawn.length) return 0;
        let hit = 0;
        for (let i = 0; i < path.length; i++) {
            const pt = path[i];
            for (let j = 0; j < drawn.length; j++) {
                if (Math.hypot(pt.x - drawn[j].x, pt.y - drawn[j].y) < tol * 1.4) { hit++; break; }
            }
        }
        return Math.min(100, hit / path.length * 100);
    }

    // 中央精度：各描点の最短距離をtol×0.2まで満点・tol×1.6でゼロの線形で採点し、点数の低い方35%だけの平均を返す(局所のズレを重く見る)
    function calcAccuracyGraded(drawn, path, tol) {
        if (!drawn.length) return 0;
        const free = tol * 0.2;
        const far = tol * 1.6;
        const scores = [];
        for (let i = 0; i < drawn.length; i++) {
            const dp = drawn[i];
            let min = Infinity;
            for (let j = 0; j < path.length; j++) {
                const d = Math.hypot(path[j].x - dp.x, path[j].y - dp.y);
                if (d < min) min = d;
            }
            scores.push(min <= free ? 100 : Math.max(0, 100 - (min - free) / (far - free) * 100));
        }
        scores.sort(function (a, b) { return a - b; });
        const k = Math.max(1, Math.round(scores.length * 0.35));
        let sum = 0;
        for (let i = 0; i < k; i++) sum += scores[i];
        return Math.round(sum / k);
    }

    // 始終点ペナルティ：始点は20px超過分×0.25で最大5点減、終点は6px超過分×0.5で最大25点減。描点2点未満は25。
    function calcEndpointPenalty(drawn, path) {
        if (drawn.length < 2) return 25;
        const startPt = path[0];
        const endPt = path[path.length - 1];
        let penalty = 0;
        const startDist = Math.hypot(drawn[0].x - startPt.x, drawn[0].y - startPt.y);
        if (startDist > 20) penalty += Math.min(5, Math.round((startDist - 20) * 0.25));
        const endDist = Math.hypot(drawn[drawn.length-1].x - endPt.x, drawn[drawn.length-1].y - endPt.y);
        if (endDist > 6) penalty += Math.min(25, Math.round((endDist - 6) * 0.5));
        return penalty;
    }

    // フックペナルティ：離し際の跳ねを検出。最終点を1つ除外し、線の最後12%区間の方向とその直前12%区間の
    // 方向のなす角が20度以下なら0、超えた分×0.45で最大12点減。移動量5px未満の区間はスキップ。
    function calcHookPenalty(drawn) {
        const d = drawn.length > 12 ? drawn.slice(0, -1) : drawn;
        if (d.length < 12) return 0;
        const n = d.length;
        const tipN = Math.max(3, Math.round(n * 0.12));
        const tipA = d[n - 1 - tipN], tipB = d[n - 1];
        const preA = d[n - 1 - tipN * 2], preB = d[n - 1 - tipN];
        const tdx = tipB.x - tipA.x, tdy = tipB.y - tipA.y, tl = Math.hypot(tdx, tdy);
        const pdx = preB.x - preA.x, pdy = preB.y - preA.y, pl = Math.hypot(pdx, pdy);
        if (tl < 5 || pl < 5) return 0; // 移動量が小さすぎる区間はスキップ
        const cosAngle = (tdx * pdx + tdy * pdy) / (tl * pl);
        const angleDeg = Math.acos(Math.max(-1, Math.min(1, cosAngle))) * 180 / Math.PI;
        if (angleDeg <= 20) return 0;
        return Math.min(12, Math.round((angleDeg - 20) * 0.45));
    }

    // 総合点: (網羅率×0.30 + 中央精度×0.70)×達成率 + (滑らかさ-90)×0.35 - はみ出し減点 - 始終点ペナルティ - フックペナルティ
    function score(drawn, path, tol) {
        if (!drawn || drawn.length < 3 || !path || path.length < 2 || !tol) return null;

        let pathLen = 0;
        for (let i = 1; i < path.length; i++) {
            pathLen += Math.hypot(path[i].x - path[i-1].x, path[i].y - path[i-1].y);
        }
        const startGap = Math.hypot(drawn[0].x - path[0].x, drawn[0].y - path[0].y);
        const endGap = Math.hypot(drawn[drawn.length-1].x - path[path.length-1].x, drawn[drawn.length-1].y - path[path.length-1].y);
        const miss = Math.max(0, startGap - tol) + Math.max(0, endGap - tol);
        const achieve = pathLen > 0 ? Math.max(0, Math.min(1, 1 - miss / pathLen)) : 1;

        const coverage = calcCoverage(drawn, path, tol);
        const accuracy = calcAccuracyGraded(drawn, path, tol);
        const smoothness = calcSmoothness(drawn);
        const overshoot = calcOvershoot(drawn, path, tol);
        const overshootPenalty = Math.round(overshoot.outsideRatio * 50 + Math.min(overshoot.avgExcess / tol, 1) * 25);
        const endpointPenalty = calcEndpointPenalty(drawn, path);
        const hookPenalty = calcHookPenalty(drawn);

        let total = (coverage * 0.30 + accuracy * 0.70) * achieve
            + (smoothness - 90) * 0.35
            - overshootPenalty - endpointPenalty - hookPenalty;
        total = Math.min(100, Math.max(0, Math.round(total)));

        const rank = total >= 85 ? 'EXCELLENT' : total >= 70 ? 'GOOD' : total >= 50 ? 'OK' : 'もう一回！';

        return {
            total: total,
            rank: rank,
            smoothness: smoothness,
            accuracy: accuracy,
            coverage: coverage,
            endpointPenalty: endpointPenalty,
            overshootPenalty: overshootPenalty,
            hookPenalty: hookPenalty
        };
    }

    window.LineJudge = { score: score };
})();
