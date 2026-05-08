// ================================================================
//  test-speed-graph — Global State & SSE Helpers
// ================================================================

// ============================================================
//  GLOBAL STATE (persists across runs)
// ============================================================
let abortController = null;
let isRunning = false;

// Chart
let chartPoints = [];       // [{ tokensN, speed, time, runId }]
let lastChartedTokens = 0;  // reset to runStartTokens at each start
let lastChartedRun = 0;     // delta since last chart in current run
let chartUpdateTokens = 100;

// Accumulated stats
let totalTokens = 0;        // total tokens across all runs
let peakSpeed = 0;          // peak speed across all runs
let globalMaxSpeed = 0;     // peak speed across ALL runs (for Y scale)

function updateGlobalMaxSpeedDisplay() {
    var el = document.getElementById('ssPeakAll');
    if (el) {
        el.textContent = (isFinite(globalMaxSpeed) && globalMaxSpeed > 0)
            ? globalMaxSpeed.toFixed(2) + ' tok/s' : '\u2014';
    }
}

// Persistent run colors (maps runId -> color string)
var runColorMap = {};
var runColorIndex = 0;

// Per-run results for results table
var runResults = [];  // [{ runId, tokens, time, speed, color, prefN, prefMs, prefSp }]
var runPrefillN = 0, runPrefillMs = 0, runPrefillPerSec = 0;

// Per-run state (reset every startGeneration call)
var runStartTokens, runStartCharted;
var startTime, elapsedMs, lastSpeed;
var avgSpeedSum, avgSpeedCount;

// Run tracking (incremented each start)
var runId = 0;

// Server data
let lastTimings = null;
let lastHealthData = null;
let lastGoodPps = 0;      // last reasonable predicted_per_second from server
let lastModelName = null;  // model name from /health or /v1/models
var lastContextSize = null; // context size from /props (n_ctx)
var lastContextFill = 0;    // context fill % from /slots = (n_ctx - n_remain) / n_ctx * 100

// ---- Context Fill (slots) — health-aware, like /models ----
var slotsPollTimeout = null;
var SLOTS_POLL_HEALTHY_MS = 10000;   // 10s when /health OK (same as /models)
var SLOTS_POLL_UNHEALTHY_MS = 1000;  // 1s when /health fails
var lastSlotsData = null;             // cached /slots response for renderSlots()

function startSlotsPolling() {
    if (slotsPollTimeout !== null) {
        clearTimeout(slotsPollTimeout);
    }
    slotsPollTimeout = null;
    scheduleNextSlotsPoll();
}

function stopSlotsPolling() {
    if (slotsPollTimeout !== null) {
        clearTimeout(slotsPollTimeout);
        slotsPollTimeout = null;
    }
}

function scheduleNextSlotsPoll() {
    if (isRunning) {
        return;
    }
    slotsPollTimeout = setTimeout(function () {
        fetchAndRenderContextFill();
        scheduleNextSlotsPoll();
    }, _healthIsOk ? SLOTS_POLL_HEALTHY_MS : SLOTS_POLL_UNHEALTHY_MS);
}

async function fetchAndRenderContextFill() {
    // Use cached data from checkServerHealth (like /models) — no extra fetch
    var data = lastSlotsData;
    if (!data) return;  // nothing to render yet

    // Support both: single object (first slot) and array of slots
    var firstSlot = Array.isArray(data) ? (data.length > 0 ? data[0] : null) : data;
    if (!firstSlot || !firstSlot.next_token) {
        lastContextFill = 0;
        document.getElementById('progressFill').style.width = '0%';
        return;
    }

    var nCtx = firstSlot.n_ctx || 0;
    var nRemain = firstSlot.next_token[0] ? firstSlot.next_token[0].n_remain : null;

    if (nCtx > 0 && nRemain !== null && nRemain !== undefined) {
        // occupied % = (n_ctx - n_remain) / n_ctx * 100
        lastContextFill = Math.min(100, Math.max(0, ((nCtx - nRemain) / nCtx) * 100));
    } else {
        lastContextFill = 0;
    }

    document.getElementById('progressFill').style.width = lastContextFill.toFixed(1) + '%';
}

// SSE stream table state
var sseStreamRows = [];

// ---- SSE Helper Functions ----

function isSsePanelExpanded() {
    var body = document.querySelector('#sseStreamPanel .panel-body');
    return body && body.style.display !== 'none';
}

function getSseLimit() {
    var el = document.getElementById('sseLimit');
    return el ? (parseInt(el.value) || 1000) : 1000;
}

function renderSseTable() {
    var limit = getSseLimit();
    var body = document.getElementById('sseStreamBody');
    var rowCount = document.getElementById('sseRowCount');
    if (!body) return;
    var html = '';
    var count = 0;
    for (var i = 0; i < sseStreamRows.length && count < limit; i++) {
        var r = sseStreamRows[i];
        var cacheN = r.cache_n != null ? r.cache_n : '';
        var promptN = r.prompt_n != null ? r.prompt_n : '';
        var promptMs = r.prompt_ms != null ? r.prompt_ms.toFixed(1) : '';
        var promptPt = r.prompt_per_token_ms != null ? r.prompt_per_token_ms.toFixed(2) : '';
        var promptPs = r.prompt_per_second != null ? r.prompt_per_second.toFixed(1) : '';
        var predN = r.pred_n != null ? r.pred_n : '';
        var predMs = r.pred_ms != null ? r.pred_ms.toFixed(1) : '';
        var predPt = r.pred_per_token_ms != null ? r.pred_per_token_ms.toFixed(2) : '';
        var predPs = r.pred_per_second != null ? r.pred_per_second.toFixed(1) : '';
        var draftN = r.draft_n != null ? r.draft_n : '';
        var draftNAccepted = r.draft_n_accepted != null ? r.draft_n_accepted : '';
        var ppTotal = r.pp_total != null ? r.pp_total : '';
        var ppCache = r.pp_cache != null ? r.pp_cache : '';
        var ppProc = r.pp_processed != null ? r.pp_processed : '';
        var ppTime = r.pp_time_ms != null ? r.pp_time_ms : '';
        var delta = r.delta || '';
        html += '<tr style="background:' + (count % 2 === 0 ? '#0d1117' : '#161b22') + ';">';
        html += '<td style="padding:2px 6px;color:#8b949e;">' + r.idx + '</td>';
        html += '<td style="padding:2px 6px;color:#8b949e;">' + cacheN + '</td>';
        html += '<td style="padding:2px 6px;">' + promptN + '</td>';
        html += '<td style="padding:2px 6px;">' + promptMs + '</td>';
        html += '<td style="padding:2px 6px;">' + promptPt + '</td>';
        html += '<td style="padding:2px 6px;color:#8b949e;">' + promptPs + '</td>';
        html += '<td style="padding:2px 6px;color:#58a6ff;font-weight:bold;">' + predN + '</td>';
        html += '<td style="padding:2px 6px;">' + predMs + '</td>';
        html += '<td style="padding:2px 6px;">' + predPt + '</td>';
        html += '<td style="padding:2px 6px;color:#3fb950;font-weight:bold;">' + predPs + '</td>';
        html += '<td style="padding:2px 6px;color:#d2961e;">' + draftN + '</td>';
        html += '<td style="padding:2px 6px;color:#d2961e;">' + draftNAccepted + '</td>';
        html += '<td style="padding:2px 6px;color:#8b949e;">' + ppTotal + '</td>';
        html += '<td style="padding:2px 6px;color:#8b949e;">' + ppCache + '</td>';
        html += '<td style="padding:2px 6px;color:#8b949e;">' + ppProc + '</td>';
        html += '<td style="padding:2px 6px;color:#8b949e;">' + ppTime + '</td>';
        html += '<td style="padding:2px 6px;color:#c9d1d9;max-width:200px;overflow:hidden;text-overflow:ellipsis;" title="' + delta.replace(/"/g, '&quot;') + '">' + delta + '</td></tr>';
        count++;
    }
    body.innerHTML = html;
    if (rowCount) {
        rowCount.textContent = Math.min(sseStreamRows.length, limit);
    }
}
