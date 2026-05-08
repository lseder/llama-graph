// ================================================================
//  test-speed-graph — Slots Panel
//  Fetches and displays data from /slots endpoint
// ================================================================

var lastSlotsData = null;

async function loadSlots() {
    var url = document.getElementById('serverUrl').value.replace(/\/$/, '');
    var btn = document.getElementById('btnSlots');
    var contentEl = document.getElementById('slotsContent');

    if (btn) { btn.disabled = true; btn.textContent = 'Loading...'; }
    if (contentEl) contentEl.innerHTML = '<div style="color:#8b949e;">Loading...</div>';

    try {
        var resp = await fetch(url + '/slots', {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(10000)
        });

        if (!resp.ok) {
            throw new Error('HTTP ' + resp.status + ' ' + resp.statusText);
        }

        var data = await resp.json();
        lastSlotsData = data;

        var html = renderSlots(data);
        if (contentEl) contentEl.innerHTML = html;

    } catch (err) {
        if (contentEl) {
            contentEl.innerHTML = '<div style="color:#f85149;">Error loading /slots: ' + err.message + '</div>';
        }
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '\uD83D\uDCE5 Slots'; }
    }
}

function renderSlots(slots) {
    var lines = [];

    if (!Array.isArray(slots) || slots.length === 0) {
        lines.push('<div style="color:#8b949e; font-style:italic;">No active slots (idle).</div>');
        return lines.join('\n');
    }

    lines.push('<div style="margin:4px 0;">');
    lines.push('<span style="color:#8b949e; font-size:11px;">' + slots.length + ' active slot(s)</span>');
    lines.push('</div>');

    for (var si = 0; si < slots.length; si++) {
        var s = slots[si];
        var slotId = s.slot_id != null ? s.slot_id : si;
        var isIdle = s.is_idle !== false ? (s.task_type == null) : !s.is_idle;

        lines.push('<div style="color:#3fb950; font-weight:700; margin:10px 0 4px; border-top:1px solid #30363d; padding-top:4px;">— Slot ' + slotId + ' ' + (isIdle ? '(idle)' : '(busy)') + ' —</div>');

        // Task
        if (s.task_type) {
            lines.push(propRow('Task', escapeHtml(s.task_type)));
        }

        // Prompt / context
        if (s.prompt && s.prompt.length > 0) {
            lines.push(propRow('Prompt tokens', s.prompt.length));
            lines.push(propRow('Prompt (truncated)', truncatePrompt(s.prompt, 150)));
        }

        // Timings
        var timed = (s.timings_prompt_n != null || s.timings_prompt_ms != null ||
                     s.timings_n_predict != null || s.timings_n_decode != null);
        if (timed) {
            lines.push('<div style="color:#58a6ff; font-weight:600; margin:4px 0 2px; font-size:11px;">Timings</div>');
            if (s.timings_prompt_n != null) lines.push(propRow('  Prompt tokens', s.timings_prompt_n));
            if (s.timings_prompt_ms != null) lines.push(propRow('  Prompt ms', s.timings_prompt_ms.toFixed(2)));
            if (s.timings_n_predict != null) lines.push(propRow('  Predict tokens', s.timings_n_predict));
            if (s.timings_n_decode != null) lines.push(propRow('  Decode tokens', s.timings_n_decode));
            if (s.timings_prompt_ms != null && s.timings_prompt_n > 0) {
                lines.push(propRow('  Prompt tok/s', (s.timings_prompt_n / (s.timings_prompt_ms / 1000)).toFixed(1)));
            }
            if (s.timings_n_decode != null && s.timings_prompt_ms != null) {
                lines.push(propRow('  Decode tok/s', (s.timings_n_decode / (s.timings_prompt_ms / 1000)).toFixed(1)));
            }
        }

        // Output text (truncated)
        if (s.output && s.output.length > 0) {
            lines.push(propRow('Output (truncated)', truncatePrompt(s.output, 200)));
        }

        // Raw JSON toggle
        lines.push('<div style="margin:6px 0;"><button onclick="toggleSlotRaw(' + si + ')" style="font-size:11px; padding:2px 6px;">Toggle Raw JSON</button></div>');
        lines.push('<div id="slotRaw' + si + '" style="display:none; background:#0d1117; padding:6px; border-radius:4px; white-space:pre-wrap; word-break:break-all; font-size:10px; line-height:1.4; color:#8b949e; margin:2px 0;">' + escapeHtml(JSON.stringify(s, null, 2)) + '</div>');
    }

    return lines.join('\n');
}

function toggleSlotRaw(idx) {
    var el = document.getElementById('slotRaw' + idx);
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function propRow(label, value) {
    return '<div style="display:flex; gap:8px; padding:1px 0;"><span style="color:#8b949e; min-width:180px;">' + label + ':</span><span>' + value + '</span></div>';
}

function truncatePrompt(str, maxLen) {
    if (str.length <= maxLen) return escapeHtml(str);
    return escapeHtml(str.substring(0, maxLen)) + '<span style="color:#8b949e;">...</span>';
}

function escapeHtml(str) {
    if (typeof str !== 'string') str = String(str);
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
