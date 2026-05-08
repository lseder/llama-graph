// ================================================================
//  test-speed-graph — Main Controller (start/stop generation)
//  Live Tokens/Second Graph for llama-server
//  Accumulation mode: Start adds data, Clear All resets everything
// ================================================================

// ============================================================
//  MAIN: Start Generation
//  Does NOT clear chartPoints or totalTokens — accumulates.
// ============================================================
window.startGeneration = async function () {
    if (isRunning) return;
    isRunning = true;

    // Pause health + slots polling while inference runs
    stopHealthPolling();
    stopSlotsPolling();

    var serverUrl = document.getElementById('serverUrl').value.replace(/\/$/, '');
    var prompt = document.getElementById('prompt').value;
    var maxTokens = parseInt(document.getElementById('maxTokens').value) || 512;
    var updateInterval = parseInt(document.getElementById('updateInterval').value) || 100;

    document.getElementById('btnStart').disabled = true;
    document.getElementById('btnStop').disabled = false;
    abortController = new AbortController();

    // Per-run counters (cumulative totals persist across runs)
    runStartTokens = totalTokens;
    lastChartedTokens = runStartTokens;  // reset so new line starts from 0 tokens
    runId++;
    startTime = performance.now();
    elapsedMs = 0;
    lastSpeed = 0;
    globalMaxSpeed = 0;      // reset Y-scale per run
    updateGlobalMaxSpeedDisplay();
    avgSpeedSum = 0;
    avgSpeedCount = 0;

    addLog('Connecting to ' + serverUrl + '/v1/chat/completions ...');

    try {
        var resp = await fetch(serverUrl + '/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: (document.getElementById('model') ? document.getElementById('model').value : 'any') || 'any',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: maxTokens,
                stream: true,
                return_progress: true,
                timings_per_token: true
            }),
            signal: abortController.signal
        });

        if (!resp.ok) {
            addLog('<span class="warn">Error: HTTP ' + resp.status + ' ' + resp.statusText + '</span>');
            stopGeneration();
            return;
        }

        var reader = resp.body.getReader();
        var decoder = new TextDecoder();
        var buffer = '';
        var content = '';
        var prevPredictedN = 0;  // track locally for computeSpeed

        addLog('Connected. Receiving stream...');

        while (true) {
            var result = await reader.read();
            if (result.done) {
                addLog('Stream complete.');
                break;
            }

            buffer += decoder.decode(result.value, { stream: true });
            var lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (var li = 0; li < lines.length; li++) {
                var line = lines[li];
                if (!line.startsWith('data: ')) continue;

                var data = line.slice(6);
                if (data === '[DONE]') { addLog('[DONE]'); break; }

                try {
                    var parsed = JSON.parse(data);
                    var choice = parsed.choices ? parsed.choices[0] : null;

                    var delta = choice ? choice.delta : null;
                    var chunkText = (delta ? (delta.content || delta.reasoning_content || '') : '');
                    if (chunkText) content += chunkText;

                    elapsedMs = performance.now() - startTime;
                    var timings = parsed.timings || {};
                    var pp = parsed.prompt_progress;
                    // Always track the latest timings for post-stream analysis
                    if (Object.keys(timings).length > 0) {
                        lastTimings = timings;
                    }

                    // Capture SSE data for stream table (only when panel is expanded)
                    if (isSsePanelExpanded() && sseStreamRows.length < 50000) {
                        var pp = parsed.prompt_progress || {};
                        sseStreamRows.push({
                            idx: sseStreamRows.length + 1,
                            cache_n: timings.cache_n || null,
                            prompt_n: timings.prompt_n || null,
                            prompt_ms: timings.prompt_ms || null,
                            prompt_per_token_ms: timings.prompt_per_token_ms || null,
                            prompt_per_second: timings.prompt_per_second || null,
                            pred_n: timings.predicted_n || null,
                            pred_ms: timings.predicted_ms || null,
                            pred_per_token_ms: timings.pred_per_token_ms || null,
                            pred_per_second: timings.pred_per_second || null,
                            draft_n: timings.draft_n || null,
                            draft_n_accepted: timings.draft_n_accepted || null,
                            pp_total: pp.total || null,
                            pp_cache: pp.cache || null,
                            pp_processed: pp.processed || null,
                            pp_time_ms: pp.time_ms || null,
                            delta: chunkText || ''
                        });
                    }

                    // Server response panel
                    updateServerResponse(content, timings, parsed);

                    // Compute per-run speed (pass prevPredictedN to avoid NaN)
                    var speedInfo = computeSpeed(timings, pp, content, elapsedMs, runStartTokens, prevPredictedN);

                    // Update prevPredictedN from current chunk (before any continue)
                    if (timings && timings.predicted_n != null) {
                        prevPredictedN = timings.predicted_n;
                    }

                    // Skip prefill chunks — no chart point, but still update stats
                    if (!speedInfo) {
                        // Still update totalTokens from prefill
                        if ((timings.prompt_n || 0) + (timings.predicted_n || 0) > 0) {
                            var prefillTokens = (timings.prompt_n || 0) + (timings.predicted_n || 0);
                            if (prefillTokens + runStartTokens > totalTokens) {
                                totalTokens = prefillTokens + runStartTokens;
                            }
                        }
                        lastTimings = timings;
                        updateInfo(timings);
                        continue;
                    }

                    var runTokens = speedInfo.tokens;
                    var runSpeed = speedInfo.speed;

                    // Debug: log every speedInfo
                    // addLog('SPEED[runTokens=' + runTokens + ' speed=' + runSpeed.toFixed(1) + ' totalTokens=' + totalTokens + ' lastCharted=' + lastChartedTokens + ']');

                    // Update global totalTokens
                    if (speedInfo.tokens > totalTokens) {
                        totalTokens = speedInfo.tokens;
                    }

                    // Update global peak speed (per-run speed within this call)
                    if (isFinite(runSpeed) && runSpeed > peakSpeed) {
                        peakSpeed = runSpeed;
                    }
                    if (isFinite(runSpeed) && runSpeed > 0) {
                        avgSpeedSum += runSpeed;
                        avgSpeedCount++;
                    }

                    // Charting: throttle by tokens generated since last chart update
                    chartUpdateTokens = updateInterval;
                    var tokensSinceLastChart = runTokens - lastChartedTokens;

                    if (tokensSinceLastChart >= chartUpdateTokens) {
                        // Update global max speed from server's predicted_per_second
                        if (timings && timings.predicted_per_second != null && timings.predicted_per_second > 0
                            && (isFinite(timings.predicted_per_second) && timings.predicted_per_second > globalMaxSpeed)) {
                            globalMaxSpeed = timings.predicted_per_second;
                            updateGlobalMaxSpeedDisplay();
                        }
                        chartPoints.push({
                            tokensN: runTokens,
                            runTokens: runTokens - runStartTokens,  // tokens relative to run start
                            speed: runSpeed,
                            time: elapsedMs,
                            runId: runId
                        });
                        lastChartedTokens = runTokens;
                        // Debug log
                        // addLog('CHART point #' + chartPoints.length + ' runTokensDelta=' + (runTokens - runStartTokens) + ' runTokensAbs=' + runTokens);
                        drawChart();
                    }

                    // FIX: set lastSpeed to server's predicted_per_second when available
                    // so graph label matches server stats "gen speed"
                    if (timings.predicted_per_second != null && timings.predicted_per_second > 0) {
                        lastSpeed = timings.predicted_per_second;
                    } else if (runSpeed > 0) {
                        lastSpeed = runSpeed;
                    }

                    // Update lastTimings + stats only when chunk has real timing data
                    // (MTP models send many chunks without timings field)
                    if (timings.predicted_n != null || timings.prompt_n != null || timings.predicted_ms != null) {
                        lastTimings = timings;
                        updateInfo(timings);
                    }

                    // Update SSE stream table (throttled — every 10 SSE events, only when expanded)
                    if (isSsePanelExpanded() && sseStreamRows.length % 10 === 0) {
                        renderSseTable();
                    }

                } catch (e) {
                    // ignore partial parse errors
                }
            }
        }

        // Post-stream: use server-final stats to set correct totalTokens
        // Server's prompt_n + predicted_n is the authoritative count;
        // intermediate predicted_n values can be inflated (prefill budget, etc.)
        var t = lastTimings || {};
        var nl = '<br>';  // declare before use

        // DEBUG: show lastTimings state after [DONE]
        // var debug = '<span class="warn">══ POST-STREAM DEBUG ══</span>' + nl;
        // debug += '  t.prompt_n = ' + (t.prompt_n ?? 'undefined') + nl;
        // debug += '  t.predicted_n = ' + (t.predicted_n ?? 'undefined') + nl;
        // debug += '  t.predicted_per_second = ' + (t.predicted_per_second ?? 'undefined') + nl;
        // debug += '  t.predicted_ms = ' + (t.predicted_ms ?? 'undefined') + nl;
        // debug += '══ POST-STREAM DEBUG ══' + nl;
        // debug += '  runStartTokens = ' + runStartTokens + nl;
        // debug += '  totalTokens (before) = ' + totalTokens + nl;
        // debug += '  elapsedMs = ' + elapsedMs.toFixed(0) + nl;
        // debug += '  chartPoints.length = ' + chartPoints.length + nl;
        // debug += '  lastTimings = ' + JSON.stringify(lastTimings) + nl;
        // // Show ALL chart points
        // for (var ci = 0; ci < chartPoints.length; ci++) {
        //     var cp = chartPoints[ci];
        //     debug += '  point[' + ci + ']: tokensN=' + cp.tokensN + ' runTokens=' + cp.runTokens + ' speed=' + cp.speed.toFixed(1) + nl;
        // }
        // // Show max chart point tokens
        // var maxChartTokens = 0;
        // for (var ci2 = 0; ci2 < chartPoints.length; ci2++) {
        //     if (chartPoints[ci2].runTokens > maxChartTokens) maxChartTokens = chartPoints[ci2].runTokens;
        // }
        // debug += '  max chart runTokens = ' + maxChartTokens + nl;
        // debug += '  formula: prompt_n(' + (t.prompt_n ?? '?') + ') + predicted_n(' + (t.predicted_n ?? '?') + ') + runStart(' + runStartTokens + ') = ' + ((t.prompt_n || 0) + (t.predicted_n || 0) + runStartTokens) + nl;
        // addLog(debug);

        if (t && t.predicted_n > 0) {
            totalTokens = (t.prompt_n || 0) + t.predicted_n + runStartTokens;
            lastSpeed = t.predicted_per_second || (totalTokens / (elapsedMs / 1000));
        } else if (t && t.predicted_n === 0 && t.predicted_per_second != null && t.predicted_per_second > 0) {
            // Server sent pps but predicted_n is 0 — use pps-based count
            totalTokens = runStartTokens + Math.round(t.predicted_per_second * (elapsedMs / 1000));
            lastSpeed = t.predicted_per_second;
        }

        // Fallback: if no chart points but we have tokens, add 1
        if (chartPoints.length === 0 && totalTokens > runStartTokens) {
            addLog('<span class="warn">No updates (threshold=' + chartUpdateTokens + '). Added 1 point.</span>');
            chartPoints.push({ tokensN: totalTokens, runTokens: totalTokens - runStartTokens, speed: lastSpeed, time: elapsedMs, runId: runId });
            lastChartedTokens = totalTokens;
            drawChart();
        }

        // Summary log
        var nl = '<br>';
        var avg = (avgSpeedCount > 0) ? avgSpeedSum / avgSpeedCount : lastSpeed;
        var summary = '<span class="speed">══ SUMMARY ══</span>' + nl;
        summary += '  Tokens:     ' + totalTokens + nl;
        summary += '  Time:       ' + (elapsedMs / 1000).toFixed(2) + ' s' + nl;
        summary += '  Speed:      ' + lastSpeed.toFixed(2) + ' tok/s' + nl;
        summary += '  Avg Speed:  ' + avg.toFixed(2) + ' tok/s' + nl;
        summary += '  Gen speed: ' + lastSpeed.toFixed(2) + ' tok/s' + nl;
        summary += '  Points:     ' + chartPoints.length + nl;

        addLog(summary);

        // Record run result for results table
        runResults.push({ runId: runId, tokens: totalTokens, runStartTokens: runStartTokens, time: elapsedMs, speed: lastSpeed, color: runColorMap[runId],
            model: lastModelName || '\u2014', ctx: lastContextSize || '\u2014', prefN: runPrefillN, predN: t.predicted_n || 0, prefMs: runPrefillMs, prefSp: runPrefillPerSec });

    } catch (err) {
        if (err.name !== 'AbortError') {
            addLog('<span class="warn">Error: ' + err.message + '</span>');
        } else {
            addLog('<span class="warn">Stopped by user.</span>');
        }
    }

    // Post-stream always
    updateInfo();
    drawChart();

    // Resume health + slots polling after inference stops
    startHealthPolling();
    startSlotsPolling();
    stopGeneration();
};

// ============================================================
//  STOP
// ============================================================
window.stopGeneration = function () {
    if (abortController) {
        abortController.abort();
        abortController = null;
    }
    isRunning = false;
    document.getElementById('btnStart').disabled = false;
    document.getElementById('btnStop').disabled = true;
    // After stream ends, lastTimings holds the final timings
    updateInfo(lastTimings);
    drawChart();
    updateRunTable();
    renderSseTable();
};

// ============================================================
//  LocalStorage: Save/Restore Parameters
// ============================================================
var PARAM_KEYS = ['serverUrl', 'prompt', 'maxTokens', 'updateInterval', 'sseLimit'];

function saveParams() {
    try {
        for (var i = 0; i < PARAM_KEYS.length; i++) {
            var el = document.getElementById(PARAM_KEYS[i]);
            if (el) {
                localStorage.setItem('tgs_' + PARAM_KEYS[i], el.value);
            }
        }
    } catch(e) { /* ignore */ }
}

function loadParams() {
    try {
        for (var i = 0; i < PARAM_KEYS.length; i++) {
            var el = document.getElementById(PARAM_KEYS[i]);
            if (el) {
                var val = localStorage.getItem('tgs_' + PARAM_KEYS[i]);
                if (val !== null) {
                    el.value = val;
                }
            }
        }
    } catch(e) { /* ignore */ }
}

// ============================================================
//  INIT
// ============================================================
document.addEventListener('DOMContentLoaded', function () {
    // Restore panel open/close states from localStorage
    if (typeof restorePanelState === 'function') { restorePanelState(); }
    // Restore parameters from localStorage
    loadParams();

    // Save parameters on any input change
    for (var i = 0; i < PARAM_KEYS.length; i++) {
        var el = document.getElementById(PARAM_KEYS[i]);
        if (el) {
            el.addEventListener('input', saveParams);
            el.addEventListener('change', saveParams);
        }
    }

    // Start button
    var btnStart = document.getElementById('btnStart');
    if (btnStart) {
        btnStart.addEventListener('click', window.startGeneration);
    }

    // Auto-check health on server URL input
    var urlInput = document.getElementById('serverUrl');
    if (urlInput) {
        var timer = null;
        urlInput.addEventListener('input', function () {
            clearTimeout(timer);
            timer = setTimeout(function () { checkServerHealth(); }, 800);
        });
    }

    // Start health + slots polling loops
    startHealthPolling();
    startSlotsPolling();

    // SSE stream table: re-render on limit change
    var sseLimitInput = document.getElementById('sseLimit');
    if (sseLimitInput) {
        sseLimitInput.addEventListener('change', renderSseTable);
    }
});

// Initial draw
drawChart();
