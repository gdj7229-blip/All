async function applyEnabledState() {
  const { enabled } = await chrome.storage.local.get({ enabled: true });
  await chrome.declarativeNetRequest.updateEnabledRulesets(
    enabled ? { enableRulesetIds: ['ad_rules'] } : { disableRulesetIds: ['ad_rules'] }
  );
}

chrome.runtime.onInstalled.addListener(async () => {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: ['yt-ad-prune'] });
  } catch (_) {}
  applyEnabledState();
});
chrome.runtime.onStartup.addListener(applyEnabledState);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && 'enabled' in changes) applyEnabledState();
});
