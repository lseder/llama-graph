// ================================================================
//  test-speed-graph — UI Helpers
// ================================================================

function updateInfo(timings) {
    document.getElementById('progressFill').style.width = lastContextFill + '%';
    document.getElementById('chartInfo').textContent = chartPoints.length;
    updateServerStats(timings || lastTimings);
}

function updateServerStats(timings) {
    if (!timings) return;
    document.getElementById('ssPromptN').textContent    = (timings.prompt_n != null && timings.prompt_n > 0) ? timings.prompt_n : '\u2014';
    document.getElementById('ssPromptMs').textContent   = (timings.prompt_ms != null) ? timings.prompt_ms.toFixed(2) : '\u2014';
    document.getElementById('ssPromptPerTok').textContent = (timings.prompt_per_token_ms != null) ? timings.prompt_per_token_ms.toFixed(2) : '\u2014';
    document.getElementById('ssPromptSpeed').textContent   = (timings.prompt_per_second != null) ? timings.prompt_per_second.toFixed(2) : '\u2014';
    document.getElementById('ssPredictedN').textContent   = (timings.predicted_n != null && timings.predicted_n > 0) ? timings.predicted_n : '\u2014';
    document.getElementById('ssPredictedMs').textContent  = (timings.predicted_ms != null) ? timings.predicted_ms.toFixed(2) : '\u2014';
    document.getElementById('ssPredictedPerTok').textContent = (timings.predicted_per_token_ms != null) ? timings.predicted_per_token_ms.toFixed(2) : '\u2014';
    document.getElementById('ssPredictedSpeed').textContent   = (timings.predicted_per_second != null) ? timings.predicted_per_second.toFixed(2) : '\u2014';

    if (timings.draft_n != null && timings.draft_n > 0) {
        document.getElementById('ssDraftSection').style.display = 'block';
        document.getElementById('ssDraftLines').style.display = 'block';
        document.getElementById('ssDraftN').textContent = timings.draft_n;
        document.getElementById('ssDraftAccepted').textContent = timings.draft_n_accepted || 0;
    } else {
        document.getElementById('ssDraftSection').style.display = 'none';
        document.getElementById('ssDraftLines').style.display = 'none';
    }

    if (timings.cache_n != null && timings.cache_n > 0) {
        document.getElementById('ssCacheLine').style.display = 'block';
        document.getElementById('ssCacheN').textContent = timings.cache_n;
    } else {
        document.getElementById('ssCacheLine').style.display = 'none';
    }
}

function addLog(msg) {
    var el = document.getElementById('log');
    var now = new Date();
    var ts = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');
    var entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = '<span class="log-time">[' + ts + ']</span><span class="log-msg">' + msg + '</span>';
    el.appendChild(entry);
    el.scrollTop = el.scrollHeight;
}

// ---- Generic Panel Copy ----
function copyPanelContent(elId) {
    var el = document.getElementById(elId);
    if (!el) return;
    var text = el.innerText || el.textContent;
    if (!text) return;
    navigator.clipboard.writeText(text).then(function() {
        var panel = el.closest('.collapsible-panel');
        var btn = panel ? panel.querySelector('.panel-copy-btn') : null;
        if (btn) {
            var orig = btn.textContent;
            btn.textContent = '\u2705';
            btn.style.color = '#3fb950';
            setTimeout(function() { btn.textContent = orig; btn.style.color = ''; }, 1500);
        }
    }).catch(function(err) {
        console.warn('Failed to copy:', err);
    });
}

// ---- Copy Log to Clipboard ----
function copyLog() {
    copyPanelContent('log');
}

function updateServerResponse(content, timings, parsed) {
    var el = document.getElementById('serverResponseContent');
    if (!el) return;

    var lines = [];
    if (content) {
        lines.push('> Content:');
        lines.push(content);
        lines.push('');
    }
    if (timings && (timings.predicted_n > 0 || timings.prompt_n > 0)) {
        lines.push('> Timings:');
        lines.push('  prompt_n:          ' + (timings.prompt_n || 0));
        lines.push('  prompt_ms:         ' + (timings.prompt_ms || 0).toFixed(2));
        lines.push('  prompt_per_token:  ' + (timings.prompt_per_token_ms || 0).toFixed(2));
        lines.push('  prompt_per_sec:    ' + (timings.prompt_per_second || 0).toFixed(2));
        lines.push('  predicted_n:       ' + (timings.predicted_n || 0));
        lines.push('  predicted_ms:      ' + (timings.predicted_ms || 0).toFixed(2));
        lines.push('  predicted_per_tok: ' + (timings.predicted_per_token_ms || 0).toFixed(2));
        lines.push('  predicted_per_sec: ' + (timings.predicted_per_second || 0).toFixed(2));
        if (timings.draft_n !== undefined) {
            lines.push('  draft_n:           ' + timings.draft_n);
            lines.push('  draft_n_accepted:  ' + (timings.draft_n_accepted || 0));
        }
        if (timings.cache_n !== undefined) {
            lines.push('  cache_n:           ' + timings.cache_n);
        }
        lines.push('');
    }
    if (parsed) {
        lines.push('> Raw JSON (last):');
        try { lines.push(JSON.stringify(parsed, null, 2)); } catch(e) { lines.push('[error]'); }
    }
    el.textContent = lines.join('\n');
}
