// ================================================================
//  test-speed-graph — Token Speed Calculation
// ================================================================

function computeSpeed(timings, pp, content, elapsedMs, runStartTokens, prevPredictedN) {
    if (elapsedMs <= 0) return null;

    var result = {};
    var curPredictedN = timings.predicted_n || 0;
    var pps = timings.predicted_per_second;
    var reasonablePps = (isFinite(pps) && pps > 0 && pps < 10000);

    // Detect multibyte text: compare byteLength vs character length
    var charLen = content ? content.length : 0;
    var byteLen = content ? new TextEncoder().encode(content).byteLength : 0;
    var hasMultibyte = (byteLen > charLen * 1.5); // >50% overhead = multibyte
    var contentHasData = charLen > 0 && byteLen > 0;

    // Debug logging
    // addLog('CHUNK[' + runId + '] predN=' + curPredictedN + ' prev=' + prevPredictedN
    //     + ' delta=' + (curPredictedN - prevPredictedN) + ' pps=' + (pps != null ? pps.toFixed(1) : 'null')
    //     + ' bytes=' + byteLen + ' chars=' + charLen + ' multibyte=' + hasMultibyte
    //     + ' contentLen=' + (content ? content.length : 0)
    //     + ' elapsed=' + elapsedMs.toFixed(0) + 'ms');

    // Prompt progress — skip on graph, only track stats
    if (pp && pp.processed > 0) {
        runPrefillN = timings.prompt_n || pp.processed;
        runPrefillMs = timings.prompt_ms || elapsedMs;
        runPrefillPerSec = timings.prompt_per_second || (pp.processed / (elapsedMs / 1000));
        return null;  // don't add prefill points to chart
    }

    // Skip prefill budget chunks — predicted_n can be huge (187, 8924, etc.)
    // but contentLen=0 and bytes=0. Real generation starts when contentLen > 0.
    if (!contentHasData) {
        return null;  // prefill/budget chunk, skip
    }

    // Use server's predicted_n (accurate for multibyte) but clamp to reasonable range
    if (curPredictedN > prevPredictedN && curPredictedN > 0) {
        // Clamp: predicted_n should be within reasonable bounds
        // Minimum = prevPredictedN + 1 (at least 1 token generated)
        // Maximum = runStartTokens + (curPredictedN * 2) — allow 2x for safety
        var maxReasonable = runStartTokens + (curPredictedN * 2);
        result.tokens = runStartTokens + curPredictedN;

        // If content has multibyte chars, predicted_n is more accurate than byteLength
        // If purely ASCII, both are fine — but predicted_n still has prefill budget noise
        // Use predicted_n for speed calculation (delta-based), content bytes for absolute position
        if (hasMultibyte) {
            // Multibyte: trust server's predicted_n for token count
            result.speed = pps || (1 / (elapsedMs / 1000));
        } else {
            // ASCII: content length is accurate, use it as a sanity check
            // If predicted_n is wildly inflated (>10x content), clamp to content + small margin
            if (curPredictedN > charLen * 10 && charLen > 0) {
                // Server is inflating — use content bytes as proxy
                result.tokens = runStartTokens + byteLen;
            }
            result.speed = reasonablePps ? pps : (1 / (elapsedMs / 1000));
        }
        lastGoodPps = reasonablePps ? pps : lastGoodPps;
        // Debug: show computed tokens
        // if (curPredictedN > prevPredictedN && curPredictedN > 0) {
        //     addLog('  → tokens=' + result.tokens + ' (runStart=' + runStartTokens + ' + predN=' + curPredictedN + ')');
        // }
        return result;
    }

    return result;
}
