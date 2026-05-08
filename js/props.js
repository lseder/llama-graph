// ================================================================
//  test-speed-graph — Server Props Panel
//  Fetches and displays data from /props endpoint
// ================================================================

var lastPropsData = null;
// lastContextSize — declared in state.js

async function loadProps() {
    var url = document.getElementById('serverUrl').value.replace(/\/$/, '');
    var btn = document.getElementById('btnProps');
    var contentEl = document.getElementById('propsContent');

    if (btn) { btn.disabled = true; btn.textContent = 'Loading...'; }
    if (contentEl) contentEl.innerHTML = '<div style="color:#8b949e;">Loading...</div>';

    try {
        var resp = await fetch(url + '/props', {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(10000)
        });

        if (!resp.ok) {
            throw new Error('HTTP ' + resp.status + ' ' + resp.statusText);
        }

        var data = await resp.json();
        lastPropsData = data;

        // Update global context size
        lastContextSize = (data.default_generation_settings && data.default_generation_settings.n_ctx != null)
            ? data.default_generation_settings.n_ctx : null;

        // Update server stats panel (static context size)
        var ssCtxEl = document.getElementById('ssContextSize');
        if (ssCtxEl) {
            ssCtxEl.textContent = lastContextSize ? lastContextSize : '\u2014';
        }

        var html = renderProps(data);
        if (contentEl) contentEl.innerHTML = html;

    } catch (err) {
        if (contentEl) {
            contentEl.innerHTML = '<div style="color:#f85149;">Error loading /props: ' + err.message + '</div>';
        }
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '\uD83D\uDCEF Props'; }
    }
}

function renderProps(data) {
    var lines = [];

    // ---- Model Info ----
    lines.push('<div style="color:#3fb950; font-weight:700; margin:8px 0 4px;">— Model Info —</div>');
    lines.push(propRow('Model alias', data.model_alias || '\u2014'));
    lines.push(propRow('Model path', truncate(data.model_path || '\u2014', 120)));
    lines.push(propRow('Build info', data.build_info || '\u2014'));
    lines.push(propRow('Total slots', data.total_slots != null ? data.total_slots : '\u2014'));
    lines.push(propRow('Context size (n_ctx)', data.default_generation_settings && data.default_generation_settings.n_ctx != null ? formatParamValue(data.default_generation_settings.n_ctx) : '\u2014'));
    lines.push(propRow('Is sleeping', data.is_sleeping ? 'Yes' : 'No'));
    lines.push(propRow('WebUI', data.webui ? 'Yes' : 'No'));
    lines.push(propRow('Media marker', escapeHtml(data.media_marker || '\u2014')));

    // ---- Endpoints ----
    lines.push('<div style="color:#3fb950; font-weight:700; margin:8px 0 4px;">— Endpoint Support —</div>');
    lines.push(propRow('/slots', data.endpoint_slots ? 'Yes' : 'No'));
    lines.push(propRow('/props', data.endpoint_props ? 'Yes' : 'No'));
    lines.push(propRow('/metrics', data.endpoint_metrics ? 'Yes' : 'No'));

    // ---- Modalities ----
    if (data.modalities) {
        lines.push('<div style="color:#3fb950; font-weight:700; margin:8px 0 4px;">— Modalities —</div>');
        lines.push(propRow('Vision', data.modalities.vision ? 'Yes' : 'No'));
        lines.push(propRow('Audio', data.modalities.audio ? 'Yes' : 'No'));
    }

    // ---- Special Tokens ----
    lines.push('<div style="color:#3fb950; font-weight:700; margin:8px 0 4px;">— Special Tokens —</div>');
    lines.push(propRow('BOS', escapeHtml(data.bos_token || '\u2014')));
    lines.push(propRow('EOS', escapeHtml(data.eos_token || '\u2014')));

    // ---- Chat Template Caps ----
    if (data.chat_template_caps) {
        lines.push('<div style="color:#3fb950; font-weight:700; margin:8px 0 4px;">— Chat Template Caps —</div>');
        var caps = data.chat_template_caps;
        var capKeys = ['supports_object_arguments','supports_parallel_tool_calls','supports_preserve_reasoning',
                       'supports_string_content','supports_system_role','supports_tool_calls','supports_tools','supports_typed_content'];
        for (var i = 0; i < capKeys.length; i++) {
            var key = capKeys[i];
            if (caps[key] !== undefined) {
                lines.push(propRow(capLabel(key), caps[key] ? '\u2705' : '❌'));
            }
        }
    }

    // ---- Default Generation Settings ----
    if (data.default_generation_settings) {
        lines.push('<div style="color:#3fb950; font-weight:700; margin:8px 0 4px;">— Default Generation Params —</div>');

        var params = data.default_generation_settings.params || {};

        // Group params logically
        var groups = {
            'Sampler params': ['seed', 'temperature', 'dynatemp_range', 'dynatemp_exponent', 'top_k', 'top_p', 'min_p', 'top_n_sigma', 'typical_p'],
            'Repetition': ['repeat_last_n', 'repeat_penalty', 'presence_penalty', 'frequency_penalty'],
            'DRY': ['dry_multiplier', 'dry_base', 'dry_allowed_length', 'dry_penalty_last_n'],
            'Mirostat': ['mirostat', 'mirostat_tau', 'mirostat_eta'],
            'Token limits': ['max_tokens', 'n_predict', 'n_keep', 'n_discard', 'n_probs', 'min_keep'],
            'Sampling control': ['ignore_eos', 'stream', 'xtc_probability', 'xtc_threshold'],
            'Reasoning': ['reasoning_format', 'reasoning_in_content'],
            'Other': ['chat_format', 'backend_sampling', 'post_sampling_probs', 'generation_prompt', 'timings_per_token']
        };

        for (var group in groups) {
            if (!groups.hasOwnProperty(group)) continue;
            var keys = groups[group];
            var hasAny = false;
            for (var j = 0; j < keys.length; j++) {
                if (params[keys[j]] !== undefined) { hasAny = true; break; }
            }
            if (!hasAny) continue;

            lines.push('<div style="color:#58a6ff; font-weight:600; margin:6px 0 2px; font-size:11px;">' + group + '</div>');
            for (var j = 0; j < keys.length; j++) {
                var k = keys[j];
                if (params[k] !== undefined) {
                    lines.push(propRow(k, formatParamValue(params[k])));
                }
            }
        }

        // Speculative decoding
        var speculative = params.speculative || {};
        if (speculative.type && speculative.type !== 'none') {
            lines.push('<div style="color:#3fb950; font-weight:700; margin:8px 0 4px;">— Speculative Decoding —</div>');
            lines.push(propRow('Type', speculative.type));
        }

        // LoRA
        if (params.lora && Array.isArray(params.lora) && params.lora.length > 0) {
            lines.push('<div style="color:#3fb950; font-weight:700; margin:8px 0 4px;">— LoRA —</div>');
            lines.push(propRow('Models', '<span style="color:#d2961e;">[' + params.lora.map(function(m){ return typeof m === 'string' ? '"' + escapeHtml(m) + '"' : m; }).join(', ') + ']</span>'));
        }

        // Samplers
        if (data.default_generation_settings.params && data.default_generation_settings.params.samplers) {
            lines.push('<div style="color:#3fb950; font-weight:700; margin:8px 0 4px;">— Samplers Pipeline —</div>');
            lines.push(propRow('', '<span style="color:#d2961e;">' + data.default_generation_settings.params.samplers.join(' \u2192 ') + '</span>'));
        }
    }

    // ---- Chat Template (truncated) ----
    if (data.chat_template) {
        lines.push('<div style="color:#3fb950; font-weight:700; margin:8px 0 4px;">— Chat Template —</div>');
        var tmpl = data.chat_template;
        lines.push('<div style="margin:4px 0 8px;"><button onclick=\"toggleChatTemplate()\" style=\"font-size:11px; padding:3px 8px;\">Toggle Template (' + tmpl.length + ' chars)</button></div>');
        lines.push('<div id=\"chatTemplateContent\" style=\"display:none; background:#0d1117; padding:8px; border-radius:4px; white-space:pre-wrap; word-break:break-all; font-size:11px; line-height:1.4; color:#8b949e;\">' + escapeHtml(tmpl) + '</div>');
    }

    // ---- Raw JSON ----
    lines.push('<div style="color:#3fb950; font-weight:700; margin:8px 0 4px;">— Raw JSON —</div>');
    lines.push('<div style=\"margin:4px 0;\"><button onclick=\"toggleRawProps()\" style=\"font-size:11px; padding:3px 8px;\">Toggle Raw</button></div>');
    lines.push('<div id=\"rawPropsContent\" style=\"display:none; background:#0d1117; padding:8px; border-radius:4px; white-space:pre-wrap; word-break:break-all; font-size:10px; line-height:1.4; color:#8b949e;\">' + escapeHtml(JSON.stringify(data, null, 2)) + '</div>');

    return lines.join('\n');
}

function toggleChatTemplate() {
    var el = document.getElementById('chatTemplateContent');
    if (!el) return;
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function toggleRawProps() {
    var el = document.getElementById('rawPropsContent');
    if (!el) return;
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function propRow(label, value) {
    return '<div style=\"display:flex; gap:8px; padding:1px 0;\"><span style=\"color:#8b949e; min-width:180px;\">' + label + ':</span><span>' + value + '</span></div>';
}

function formatParamValue(v) {
    if (typeof v === 'number') {
        if (Number.isInteger(v)) return '<span style=\"color:#79c0ff;\">' + v + '</span>';
        return '<span style=\"color:#79c0ff;\">' + v.toFixed(4).replace(/0+$/, '').replace(/\.$/, '') + '</span>';
    }
    if (typeof v === 'string') {
        return '<span style=\"color:#a5d6ff;\">' + escapeHtml(v) + '</span>';
    }
    if (typeof v === 'boolean') {
        return v ? '\u2705' : '❌';
    }
    if (Array.isArray(v)) {
        return '<span style=\"color:#d2961e;\">[' + v.map(function(x){ return typeof x === 'string' ? '\"' + x + '\"' : x; }).join(', ') + ']</span>';
    }
    return '<span>' + escapeHtml(String(v)) + '</span>';
}

function capLabel(key) {
    var map = {
        'supports_object_arguments': 'Object Args',
        'supports_parallel_tool_calls': 'Parallel Tools',
        'supports_preserve_reasoning': 'Preserve Reasoning',
        'supports_string_content': 'String Content',
        'supports_system_role': 'System Role',
        'supports_tool_calls': 'Tool Calls',
        'supports_tools': 'Tools',
        'supports_typed_content': 'Typed Content'
    };
    return map[key] || key;
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function truncate(str, maxLen) {
    if (str.length <= maxLen) return escapeHtml(str);
    return escapeHtml(str.substring(0, maxLen)) + '<span style=\"color:#8b949e;\">...</span>';
}
