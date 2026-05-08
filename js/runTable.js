// ================================================================
//  test-speed-graph — Run Results Table
// ================================================================

function updateRunTable() {
    var tbody = document.getElementById('runTableBody');
    if (!tbody) return;
    var html = '';
    for (var i = 0; i < runResults.length; i++) {
        var r = runResults[i];
        var tSec = (r.time / 1000).toFixed(2);
        var prefN = r.prefN != null && r.prefN > 0 ? r.prefN : '\u2014';
        var genN = r.predN != null ? r.predN : '\u2014';
        var pMs = r.prefMs > 0 ? r.prefMs.toFixed(0) : '\u2014';
        var pSp = r.prefSp > 0 ? r.prefSp.toFixed(1) : '\u2014';
        // Generated speed = generated tokens / (total time - prefill time)
        var genTimeMs = Math.max(1, r.time - r.prefMs);
        var genSp = genN !== '\u2014' ? (r.predN / (genTimeMs / 1000)).toFixed(1) : '\u2014';
        html += '<tr>';
        html += '<td class="run-num" style="color:' + r.color + '">' + r.runId + '</td>';
        html += '<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;" title="' + r.model + '">' + r.model + '</td>';
        html += '<td style="text-align:right">' + prefN + '</td>';
        html += '<td style="text-align:right">' + genN + '</td>';
        html += '<td>' + tSec + ' s</td>';
        html += '<td style="color:' + r.color + '">' + r.speed.toFixed(2) + ' tok/s</td>';
        html += '<td style="text-align:right">' + (r.ctx != null ? r.ctx : '\u2014') + '</td>';
        html += '<td style="text-align:right">' + pMs + '</td>';
        html += '<td style="text-align:right">' + pSp + ' tok/s</td>';
        html += '<td style="text-align:right;color:#3fb950">' + genSp + ' tok/s</td>';
        html += '</tr>';
    }
    tbody.innerHTML = html;
}
