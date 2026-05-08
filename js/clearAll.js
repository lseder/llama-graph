// ================================================================
//  test-speed-graph — Clear All
// ================================================================

function clearAll() {
    chartPoints = [];
    lastChartedTokens = 0;
    lastChartedRun = 0;
    totalTokens = 0;
    peakSpeed = 0;
    globalMaxSpeed = 0;
    updateGlobalMaxSpeedDisplay();
    avgSpeedSum = 0;
    avgSpeedCount = 0;
    lastSpeed = 0;
    elapsedMs = 0;
    runId = 0;
    lastTimings = null;
    sseStreamRows = [];

    // --- Clear Log panel ---
    document.getElementById('log').innerHTML = '';

    // --- Clear Server Response panel ---
    var srEl = document.getElementById('serverResponseContent');
    if (srEl) srEl.textContent = '';

    // --- Clear SSE Stream table ---
    document.getElementById('sseStreamBody').innerHTML = '';
    var sseRowCount = document.getElementById('sseRowCount');
    if (sseRowCount) sseRowCount.textContent = '0';

    // --- Clear Results table ---
    runResults = [];
    runColorMap = {};
    runColorIndex = 0;
    updateRunTable();

    // --- Reset server stats display ---
    var ids = ['ssPromptN','ssPromptMs','ssPromptPerTok','ssPromptSpeed',
               'ssPredictedN','ssPredictedMs','ssPredictedPerTok','ssPredictedSpeed'];
    for (var i = 0; i < ids.length; i++) {
        document.getElementById(ids[i]).textContent = '\u2014';
    }
    document.getElementById('ssDraftSection').style.display = 'none';
    document.getElementById('ssDraftLines').style.display = 'none';
    document.getElementById('ssCacheLine').style.display = 'none';
    document.getElementById('progressFill').style.width = '0%';
    document.getElementById('chartInfo').textContent = 'Points: 0';

    drawChart();
    addLog('Chart, stats, log and results cleared.');
}
