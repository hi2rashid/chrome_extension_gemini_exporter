(async function () {
  const exportBtn = document.getElementById('exportBtn');
  const progress = document.getElementById('progress');
  const downloadsDiv = document.getElementById('downloads');
  const singleFileCheckbox = document.getElementById('singleFile');

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || !msg.type) return;

    if (msg.type === 'EXPORT_START') {
      progress.textContent = `Found ${msg.total} items.`;
      downloadsDiv.innerHTML = '';
    } else if (msg.type === 'EXPORT_PROGRESS') {
      progress.textContent = `Downloaded ${msg.done} / ${msg.total}`;
    } else if (msg.type === 'EXPORT_FINISH') {
      progress.textContent = `✅ Export complete (${msg.total}).`;
    } else if (msg.type === 'DOWNLOAD_FALLBACK') {
      const a = document.createElement('a');
      a.href = msg.dataUrl;
      a.download = msg.filename;
      a.textContent = `Download ${msg.filename}`;
      a.style.display = 'block';
      downloadsDiv.appendChild(a);
    } else if (msg.type === 'EXPORT_ERROR') {
      progress.textContent = `Error: ${msg.message}`;
    }
  });
  exportBtn.addEventListener('click', async () => {
    progress.textContent = 'Starting export...';
    downloadsDiv.innerHTML = '';

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      progress.textContent = 'No active tab';
      return;
    }

    const singleFileCheckbox = document.getElementById('singleFileCheckbox');

    // Send the singleFile value to content script
    chrome.tabs.sendMessage(tab.id, {
      type: 'START_EXPORT',
      singleFile: singleFileCheckbox.checked
    }, (resp) => {
      if (chrome.runtime.lastError) {
        progress.textContent = 'Content script not available on this page.';
      }
    });
  });

})();