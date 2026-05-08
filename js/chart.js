// ================================================================
//  test-speed-graph — Chart Drawing (Canvas)
// ================================================================

const canvas = document.getElementById('chart');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
    var rect = canvas.parentElement.getBoundingClientRect();
    canvas.width  = rect.width - 32;
    canvas.height = 320;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function drawChart() {
    var W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Always show last gen speed (even when chart is empty)
    var displaySpeed = lastSpeed;
    if (lastTimings && lastTimings.predicted_per_second != null
            && lastTimings.predicted_per_second > 0) {
        displaySpeed = lastTimings.predicted_per_second;
    }
    if (isFinite(displaySpeed) && displaySpeed > 0) {
        ctx.fillStyle = '#3fb950';
        ctx.font = 'bold 14px Segoe UI';
        ctx.textAlign = 'left';
        ctx.fillText('gen speed: ' + displaySpeed.toFixed(1) + ' tok/s', 12, 24);
    }

    if (chartPoints.length < 1) {
        ctx.fillStyle = '#484f58';
        ctx.font = '16px Segoe UI';
        ctx.textAlign = 'center';
        ctx.fillText('Generate text to build the graph', W / 2, H / 2);
        return;
    }

    var visible = chartPoints;
    var n = visible.length;

    // Y axis: dynamic based on data, with 20% headroom
    var dataMax = 0;
    for (var i = 0; i < n; i++) {
        if (visible[i].speed > dataMax) dataMax = visible[i].speed;
    }
    var yMax = Math.max(dataMax * 1.2, 50);

    var margin = { top: 20, right: 60, bottom: 40, left: 60 };
    var plotW = W - margin.left - margin.right;
    var plotH = H - margin.top - margin.bottom;

    // Main grid — every 50 tok/s, labeled, red
    ctx.strokeStyle = '#21262d';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#484f58';
    ctx.font = '11px Segoe UI';

    for (var v = 0; v <= yMax; v += 50) {
        var y = margin.top + plotH - (v / yMax) * plotH;
        ctx.beginPath();
        ctx.moveTo(margin.left, y);
        ctx.lineTo(W - margin.right, y);
        ctx.stroke();
        ctx.textAlign = 'left';
        ctx.fillStyle = '#da3634';
        ctx.fillText(v.toString(), W - margin.right + 8, y + 4);
    }

    // Sub-grid — every 10 tok/s, light gray, no labels
    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 1;
    for (var v2 = 0; v2 <= yMax; v2 += 10) {
        if (v2 % 50 === 0) continue;
        var y2 = margin.top + plotH - (v2 / yMax) * plotH;
        ctx.beginPath();
        ctx.moveTo(margin.left, y2);
        ctx.lineTo(W - margin.right, y2);
        ctx.stroke();
    }

    // Scale functions
    var maxRunTokens = 0;
    for (var i = 0; i < n; i++) {
        if (visible[i].runTokens > maxRunTokens) maxRunTokens = visible[i].runTokens;
    }
    if (maxRunTokens < 1) maxRunTokens = 1;
    // Debug log
    // addLog('maxRunTokens: ' + maxRunTokens);

    var xScale = function(i) {
        return margin.left + (plotW / maxRunTokens) * visible[i].runTokens;
    };
    var yScale = function(val) {
        return margin.top + plotH - (val / yMax) * plotH;
    };

    // Vertical grid lines — every 1000 tokens
    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 1;
    for (var tv = 0; tv <= maxRunTokens; tv += 1000) {
        var xv = margin.left + (plotW / maxRunTokens) * tv;
        ctx.beginPath();
        ctx.moveTo(xv, margin.top);
        ctx.lineTo(xv, margin.top + plotH);
        ctx.stroke();
    }

    // X axis: tokens relative to run start
    ctx.textAlign = 'center';
    for (var i = 0; i <= 5; i++) {
        var x = margin.left + (plotW / 5) * i;
        var val = Math.round((maxRunTokens / 5) * i);
        ctx.fillText(val + ' tok', x, H - 10);
    }
    // Show total tokens (cumulative across runs)
    ctx.textAlign = 'left';
    ctx.fillStyle = '#484f58';
    ctx.font = '10px Segoe UI';
    ctx.fillText('Total: ' + totalTokens + ' tok', margin.left + 4, H - 10);

    // Y label
    ctx.save();
    ctx.translate(14, margin.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#8b949e';
    ctx.font = '12px Segoe UI';
    ctx.fillText('tok / s', 0, 0);
    ctx.restore();

    // Persistent 12-color palette (bright on dark bg)
    var runPalette = [
        '#3fb950', '#5865f2', '#d2961e', '#ed6443',
        '#db6274', '#00d0c4', '#bd93f9', '#ffad75',
        '#f1fa8c', '#ff79c6', '#78dce9', '#a8e6cf',
    ];

    // For single-point charts, use lastSpeed (final accurate value) instead of stale chunk speed
    var useFinalSpeed = (n === 1 && isFinite(lastSpeed) && lastSpeed > 0);

    // Group visible points by runId
    var runGroups = {};
    var runOrder = [];
    for (var i = 0; i < n; i++) {
        var rId = visible[i].runId;
        if (!(rId in runGroups)) {
            runGroups[rId] = [];
            runOrder.push(rId);
            if (!(rId in runColorMap)) {
                runColorMap[rId] = runPalette[runColorIndex % runPalette.length];
                runColorIndex++;
            }
        }
        runGroups[rId].push(i);
    }

    // Draw each run as a separate colored line
    for (var g = 0; g < runOrder.length; g++) {
        var gid = runOrder[g];
        var grp = runGroups[gid];
        var col = runColorMap[gid];
        var gc = grp.length;

        // Area
        ctx.beginPath();
        ctx.moveTo(xScale(grp[0]), yScale(0));
        for (var j = 0; j < gc; j++) {
            var spt = useFinalSpeed ? lastSpeed : visible[grp[j]].speed;
            ctx.lineTo(xScale(grp[j]), yScale(spt));
        }
        ctx.lineTo(xScale(grp[gc - 1]), yScale(0));
        ctx.closePath();
        var grad = ctx.createLinearGradient(0, margin.top, 0, margin.top + plotH);
        var r = parseInt(col.slice(1,3), 16);
        var g2 = parseInt(col.slice(3,5), 16);
        var b = parseInt(col.slice(5,7), 16);
        grad.addColorStop(0, 'rgba(' + r + ',' + g2 + ',' + b + ',0.35)');
        grad.addColorStop(1, 'rgba(' + r + ',' + g2 + ',' + b + ',0.02)');
        ctx.fillStyle = grad;
        ctx.fill();

        // Line
        ctx.beginPath();
        for (var j = 0; j < gc; j++) {
            var spt = useFinalSpeed ? lastSpeed : visible[grp[j]].speed;
            var xi = xScale(grp[j]), yi = yScale(spt);
            if (j === 0) ctx.moveTo(xi, yi);
            else ctx.lineTo(xi, yi);
        }
        ctx.strokeStyle = col;
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        ctx.stroke();

        // Dots + value labels
        for (var j = 0; j < gc; j++) {
            var spt = useFinalSpeed ? lastSpeed : visible[grp[j]].speed;
            var dx = xScale(grp[j]), dy = yScale(spt);
            ctx.beginPath();
            ctx.arc(dx, dy, j === gc - 1 ? 5 : 3, 0, 2 * Math.PI);
            ctx.fillStyle = (j === gc - 1) ? col : col + '88';
            ctx.fill();
            ctx.strokeStyle = '#0d1117';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            if (j === gc - 1) {
                var spd = useFinalSpeed ? lastSpeed : visible[grp[j]].speed;
                if (isFinite(spd) && spd > 0) {
                    ctx.save();
                    ctx.font = '10px Segoe UI';
                    ctx.fillStyle = col;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'bottom';
                    ctx.fillText(spd.toFixed(1), dx, dy - 7);
                    ctx.restore();
                }
            }
        }
    }

}
