// background.js
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || !msg.type) return;

  if (msg.type === 'DOWNLOAD') {
    try {
      const dataUrl =
        'data:application/json;charset=utf-8,' +
        encodeURIComponent(msg.text || '');

      chrome.downloads.download(
        {
          url: dataUrl,
          filename: msg.filename,
          saveAs: false
        },
        (downloadId) => {
          if (chrome.runtime.lastError || !downloadId) {
            console.warn('[exporter] download blocked or failed:', chrome.runtime.lastError);

            // Notify content script (progress box)
            if (sender?.tab?.id) {
              chrome.tabs.sendMessage(sender.tab.id, {
                type: 'DOWNLOAD_FALLBACK',
                filename: msg.filename,
                dataUrl
              });
            }

            // Notify popup (if open)
            chrome.runtime.sendMessage({
              type: 'DOWNLOAD_FALLBACK',
              filename: msg.filename,
              dataUrl,
              index: msg.index,
              total: msg.total
            });
          } else {
            // Success → optional status back to popup
            chrome.runtime.sendMessage({
              type: 'DOWNLOAD_STARTED',
              filename: msg.filename,
              index: msg.index,
              total: msg.total
            });
          }
        }
      );
    } catch (e) {
      console.error('[exporter] background download error', e);
      const dataUrl =
        'data:application/json;charset=utf-8,' +
        encodeURIComponent(msg.text || '');

      if (sender?.tab?.id) {
        chrome.tabs.sendMessage(sender.tab.id, {
          type: 'DOWNLOAD_FALLBACK',
          filename: msg.filename,
          dataUrl
        });
      }
      chrome.runtime.sendMessage({
        type: 'DOWNLOAD_FALLBACK',
        filename: msg.filename,
        dataUrl
      });
    }
  }
});