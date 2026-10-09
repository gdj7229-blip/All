const HIDE_SELECTORS = [
  '#masthead-ad',
  '#player-ads',
  '#panels > ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"]',
  'ytd-ad-slot-renderer',
  'ytd-rich-item-renderer:has(ytd-ad-slot-renderer)',
  'ytd-rich-section-renderer:has(ytd-statement-banner-renderer)',
  'ytd-in-feed-ad-layout-renderer',
  'ytd-display-ad-renderer',
  'ytd-promoted-sparkles-web-renderer',
  'ytd-promoted-sparkles-text-search-renderer',
  'ytd-promoted-video-renderer',
  'ytd-compact-promoted-video-renderer',
  'ytd-search-pyv-renderer',
  'ytd-banner-promo-renderer',
  'ytd-statement-banner-renderer',
  'ytd-primetime-promo-renderer',
  'ytd-brand-video-singleton-renderer',
  'ytd-brand-video-shelf-renderer',
  'ytd-companion-slot-renderer',
  'ytd-action-companion-ad-renderer',
  'ytd-player-legacy-desktop-watch-ads-renderer',
  'ytd-reel-video-renderer:has(ytd-ad-slot-renderer)',
  'ytd-merch-shelf-renderer',
  '.ytd-merch-shelf-renderer',
  '.ytp-ad-overlay-container',
  '.ytp-ad-overlay-slot',
  '.ytp-ad-image-overlay',
  '.ytp-featured-product',
  '.ytp-suggested-action',
  'ad-slot-renderer',
  'ytm-promoted-sparkles-web-renderer',
  'ytm-companion-ad-renderer',
  'ytm-promoted-video-renderer',
];

const SKIP_BUTTON_SELECTORS = [
  '.ytp-skip-ad-button',
  '.ytp-ad-skip-button',
  '.ytp-ad-skip-button-modern',
  '.ytp-ad-skip-button-slot button',
  '.videoAdUiSkipButton',
  'button[id^="skip-button"]',
].join(',');

const STYLE_ID = 'yt-ad-remover-style';
const OFF_FLAG = '__ytAdRemoverOff';

let timer = null;
const adState = new WeakMap();

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = HIDE_SELECTORS.map((s) => `${s} { display: none !important; }`).join('\n');
  (document.head || document.documentElement).appendChild(style);
}

function removeStyle() {
  document.getElementById(STYLE_ID)?.remove();
}

function isAdPlaying(player) {
  return player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting');
}

function skipAd(player, video) {
  if (!adState.has(video)) {
    adState.set(video, { muted: video.muted, rate: video.playbackRate || 1 });
  }
  video.muted = true;
  video.playbackRate = 16;
  if (Number.isFinite(video.duration) && video.duration > 0 && video.currentTime < video.duration - 0.2) {
    video.currentTime = video.duration - 0.1;
  }
  if (video.paused) video.play().catch(() => {});
}

function pressButton(btn) {
  const rect = btn.getBoundingClientRect();
  const opts = {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
    button: 0,
  };
  btn.dispatchEvent(new PointerEvent('pointerdown', opts));
  btn.dispatchEvent(new MouseEvent('mousedown', opts));
  btn.dispatchEvent(new PointerEvent('pointerup', opts));
  btn.dispatchEvent(new MouseEvent('mouseup', opts));
  btn.click();
}

function pressSkipButtons() {
  document.querySelectorAll(SKIP_BUTTON_SELECTORS).forEach(pressButton);
}

function restoreVideo(video) {
  const saved = adState.get(video);
  if (!saved) return;
  adState.delete(video);
  video.muted = saved.muted;
  video.playbackRate = saved.rate;
}

function handleVideoAds() {
  document.querySelectorAll('.html5-video-player').forEach((player) => {
    const video = player.querySelector('video');
    if (!video) return;
    if (isAdPlaying(player)) skipAd(player, video);
    else restoreVideo(video);
  });
}

function handleOverlayAds() {
  document.querySelectorAll('.ytp-ad-overlay-close-button').forEach((btn) => btn.click());
}

function handleAdblockDialog() {
  const message = document.querySelector('ytd-enforcement-message-view-model');
  if (!message) return;
  message.closest('tp-yt-paper-dialog')?.remove();
  document.querySelectorAll('tp-yt-iron-overlay-backdrop').forEach((el) => el.remove());
  const video = document.querySelector('#movie_player video');
  if (video?.paused) video.play().catch(() => {});
}

function tick() {
  handleVideoAds();
  pressSkipButtons();
  handleOverlayAds();
  handleAdblockDialog();
}

let skipQueued = false;
const skipObserver = new MutationObserver(() => {
  if (skipQueued) return;
  skipQueued = true;
  requestAnimationFrame(() => {
    skipQueued = false;
    pressSkipButtons();
  });
});

function start() {
  injectStyle();
  if (!timer) timer = setInterval(tick, 100);
  skipObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class'],
  });
}

function stop() {
  removeStyle();
  clearInterval(timer);
  timer = null;
  skipObserver.disconnect();
  document.querySelectorAll('.html5-video-player video').forEach(restoreVideo);
}

function setOffFlag(enabled) {
  try {
    if (enabled) localStorage.removeItem(OFF_FLAG);
    else localStorage.setItem(OFF_FLAG, '1');
  } catch (_) {}
}

function apply(enabled) {
  setOffFlag(enabled);
  enabled ? start() : stop();
}

start();
chrome.storage.local.get({ enabled: true }).then(({ enabled }) => apply(enabled));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && 'enabled' in changes) apply(changes.enabled.newValue);
});
