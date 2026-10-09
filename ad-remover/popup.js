const toggle = document.getElementById('enabled');

chrome.storage.local.get({ enabled: true }).then(({ enabled }) => {
  toggle.checked = enabled;
});

toggle.addEventListener('change', () => {
  chrome.storage.local.set({ enabled: toggle.checked });
});
