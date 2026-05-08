// ================================================================
//  test-speed-graph — Server Health Check & Polling Loop
// ================================================================

// ---- Polling state ----
var healthPollTimeout = null;
var HEALTH_POLL_HEALTHY_MS = 10000;    // 10s when /health OK
var HEALTH_POLL_UNHEALTHY_MS = 1000;   // 1s when /health fails
var _healthIsOk = false;               // track current health state

/**
 * Start the health polling loop (uses setTimeout for dynamic interval).
 *   - /health failing → next check in 1s
 *   - /health OK      → next check in 10s
 *   - Paused while inference is running (isRunning === true)
 */
function startHealthPolling() {
    if (healthPollTimeout !== null) {
        clearTimeout(healthPollTimeout);
        healthPollTimeout = null;
    }
    _healthIsOk = false;  // assume not OK until proven otherwise
    scheduleNextHealthCheck();
}

/** Stop the polling loop */
function stopHealthPolling() {
    if (healthPollTimeout !== null) {
        clearTimeout(healthPollTimeout);
        healthPollTimeout = null;
    }
}

function scheduleNextHealthCheck() {
    if (isRunning) {
        // Don't schedule anything while inference is running
        return;
    }
    healthPollTimeout = setTimeout(function () {
        checkServerHealthAndReschedule();
    }, _healthIsOk ? HEALTH_POLL_HEALTHY_MS : HEALTH_POLL_UNHEALTHY_MS);
}

/**
 * Wrapper around checkServerHealth that reschedules the next check
 * based on whether /health was successful or not.
 */
async function checkServerHealthAndReschedule() {
    await checkServerHealth();
    scheduleNextHealthCheck();
}

async function checkServerHealth(forceUrl) {
    var url = forceUrl || document.getElementById('serverUrl').value.replace(/\$/, '');
    var iconEl = document.getElementById('pageStatusIcon');
    var titleEl = document.getElementById('pageTitle');
    var btn = document.getElementById('btnHealth');

    if (iconEl) iconEl.textContent = '\u231B';

    try {
        // 1) /health
        var healthResp = await fetch(url + '/health', {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(5000)
        });
        if (!healthResp.ok) {
            throw new Error('HTTP ' + healthResp.status);
        }
        var healthData = await healthResp.json();
        lastHealthData = healthData;

        // 2) /v1/models
        var modelInfo = null;
        try {
            if (healthData.model) { modelInfo = healthData.model; }
            else if (healthData.loaded && healthData.model_name) { modelInfo = healthData.model_name; }
            else if (typeof healthData === 'string') { modelInfo = healthData; }
        } catch(e) {}

        try {
            var modelsResp = await fetch(url + '/v1/models', {
                headers: { 'Accept': 'application/json' },
                signal: AbortSignal.timeout(5000)
            });
            if (modelsResp.ok) {
                var modelsData = await modelsResp.json();
                if (modelsData.data && modelsData.data.length > 0) {
                    modelInfo = modelsData.data[0].id;
                }
            }
        } catch(e) { /* models failed — fall back to health data */ }

        lastModelName = modelInfo || null;

        if (modelInfo && titleEl) {
            titleEl.textContent = 'Live Tokens/Second Graph — ' + modelInfo;
        }

        // 3) /props (only after health + models succeeded)
        try {
            await loadProps();
        } catch(e) { /* props failed — non-critical */ }

        // 4) /slots — same pattern as /models (health-aware, not aggressive 1s loop)
        try {
            var slotsResp = await fetch(url + '/slots', {
                headers: { 'Accept': 'application/json' },
                signal: AbortSignal.timeout(5000)
            });
            if (slotsResp.ok) {
                var slotsData = await slotsResp.json();
                if (typeof window !== 'undefined') {
                    window.lastSlotsData = slotsData;
                }
            }
        } catch(e) { /* slots failed — non-critical */ }

        // Success — mark healthy, set icon
        _healthIsOk = true;
        if (iconEl) iconEl.textContent = '\u2705';
        if (btn) btn.disabled = false;

    } catch (err) {
        lastHealthData = null;
        lastModelName = null;
        _healthIsOk = false;
        if (iconEl) iconEl.textContent = '\u274C';
        if (titleEl) titleEl.textContent = 'Live Tokens/Second Graph';
        if (btn) btn.disabled = false;
    }
}
