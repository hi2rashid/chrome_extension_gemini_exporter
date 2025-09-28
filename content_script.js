// content_script.js
(function () {
  'use strict';

  const BUTTON_SELECTOR = "response-element > code-block > div > div.code-block-decoration.header-formatted.gds-title-s.ng-star-inserted > div > button";

  const STEP_MS = 1000;
  const STABILITY_WAIT_MS = 1200;
  const STABLE_CHECKS = 3;
  const MAX_ROUNDS = 20;

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function getScrollHeight() { return Math.max(document.body.scrollHeight, document.documentElement.scrollHeight); }
  function scrollToPos(pos) { window.scrollTo(0, pos); }

  function createProgressBox(total) {
    let box = document.getElementById('gemini-export-progress-box');
    if (!box) {
      box = document.createElement('div');
      box.id = 'gemini-export-progress-box';
      box.style.position = 'fixed';
      box.style.right = '18px';
      box.style.bottom = '18px';
      box.style.background = 'rgba(0,0,0,0.85)';
      box.style.color = '#fff';
      box.style.padding = '10px 12px';
      box.style.fontSize = '13px';
      box.style.borderRadius = '8px';
      box.style.zIndex = 2147483647;
      box.style.maxWidth = '320px';
      box.style.boxShadow = '0 6px 18px rgba(0,0,0,0.4)';
      document.body.appendChild(box);
    }

    box.innerHTML = `<div id="gemini-export-status">0 / ${total} downloaded</div>
                     <div id="gemini-export-links" style="margin-top:8px; max-height:160px; overflow:auto"></div>`;
    return box;
  }

  function updateProgressBox(done, total) {
    const s = document.getElementById('gemini-export-status');
    if (s) s.textContent = `${done} / ${total} downloaded`;
  }

  function addFallbackLinkToBox(filename, dataUrl) {
    const links = document.getElementById('gemini-export-links');
    if (!links) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    a.textContent = `Download ${filename}`;
    a.style.display = 'block';
    a.style.color = '#9fe6a0';
    a.style.marginBottom = '6px';
    a.style.wordBreak = 'break-all';
    links.appendChild(a);
  }

  async function ensureAllContentLoaded() {
    scrollToPos(0);
    await sleep(300);

    const viewport = window.innerHeight || document.documentElement.clientHeight;
    let totalHeight = getScrollHeight();
    for (let y = 0; y <= totalHeight; y += viewport) {
      scrollToPos(y);
      await sleep(STEP_MS);
      const now = getScrollHeight();
      if (now > totalHeight) totalHeight = now;
    }

    scrollToPos(getScrollHeight());
    await sleep(300);

    let stableCount = 0;
    let rounds = 0;
    while (stableCount < STABLE_CHECKS && rounds < MAX_ROUNDS) {
      rounds++;
      const before = getScrollHeight();
      scrollToPos(before);
      await sleep(STABILITY_WAIT_MS);
      const after = getScrollHeight();
      if (after > before) {
        for (let y = before + viewport; y <= after; y += viewport) {
          scrollToPos(y);
          await sleep(STEP_MS);
        }
        scrollToPos(after);
        stableCount = 0;
      } else {
        stableCount++;
      }
    }
    await sleep(300);
  }

  async function readClipboardWithFallback(copyCapturedRef, timeout = 2500, interval = 200) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (copyCapturedRef.value && copyCapturedRef.value.trim()) return copyCapturedRef.value;
      try {
        if (navigator.clipboard && navigator.clipboard.readText) {
          const v = await navigator.clipboard.readText();
          if (v && v.trim()) return v;
        }
      } catch {}
      await sleep(interval);
    }
    return copyCapturedRef.value || '';
  }

  async function runExporter(singleFileMode = false) {
    try {
      await ensureAllContentLoaded();

      const buttons = Array.from(document.querySelectorAll(BUTTON_SELECTOR));
      const total = buttons.length;
      chrome.runtime.sendMessage({ type: 'EXPORT_START', total });
      console.log('[exporter] buttons found:', total);

      if (total === 0) {
        alert('No exportable items found.');
        return;
      }

      createProgressBox(total);

      let done = 0;
      let allContents = [];

      for (let i = 0; i < buttons.length; i++) {
        const btn = buttons[i];

        const copyCapturedRef = { value: '' };
        function onCopy(e) {
          try {
            const d = e.clipboardData || window.clipboardData;
            if (d) {
              const captured = d.getData('text/plain') || d.getData('text') || '';
              if (captured && captured.trim()) copyCapturedRef.value = captured;
            }
          } catch {}
        }
        document.addEventListener('copy', onCopy, { once: true });

        btn.scrollIntoView({ block: 'center', behavior: 'auto' });
        await sleep(150);
        btn.click();

        const text = await readClipboardWithFallback(copyCapturedRef, 2500, 200);
        try { document.removeEventListener('copy', onCopy); } catch {}

        if (!text) continue;

        let out = text;
        try { out = JSON.stringify(JSON.parse(text), null, 2); } catch {}

        if (singleFileMode) {
          allContents.push(out);
        } else {
          const today = new Date().toISOString().slice(0,10).replace(/-/g,'');
          const filename = `${today}_${i + 1}.json`;
          chrome.runtime.sendMessage({ type: 'DOWNLOAD', filename, text: out, index: i + 1, total });
        }

        done++;
        chrome.runtime.sendMessage({ type: 'EXPORT_PROGRESS', done, total });
        updateProgressBox(done, total);
        await sleep(200);
      }

      if (singleFileMode && allContents.length > 0) {
        const combined = allContents.join("\n\n---\n\n");
        const today = new Date().toISOString().slice(0,10).replace(/-/g,'');
        const filename = `${today}_all.json`;
        chrome.runtime.sendMessage({ type: 'DOWNLOAD', filename, text: combined, index: total, total });
      }

      chrome.runtime.sendMessage({ type: 'EXPORT_FINISH', total });
      updateProgressBox(total, total);
      const status = document.getElementById('gemini-export-status');
      if (status) status.textContent = `✅ Export complete (${total}).`;

    } catch (err) {
      console.error('[exporter] error', err);
      chrome.runtime.sendMessage({ type: 'EXPORT_ERROR', message: String(err) });
    }
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || !msg.type) return;
    if (msg.type === 'START_EXPORT') runExporter(msg.singleFile);
    else if (msg.type === 'DOWNLOAD_FALLBACK') {
      if (msg.filename && msg.dataUrl) addFallbackLinkToBox(msg.filename, msg.dataUrl);
    }
  });

  window.__geminiExporter = { run: runExporter };
})();