(() => {
  try {
    if (localStorage.getItem('__ytAdRemoverOff') === '1') return;
  } catch (_) {}

  const AD_KEYS = new Set(['adPlacements', 'adSlots', 'playerAds', 'adBreakHeartbeatParams']);
  const AD_TEXT = /"(?:adPlacements|adSlots|playerAds|adBreakHeartbeatParams)"/;
  const MAX_DEPTH = 12;

  const prune = (node, depth = 0) => {
    if (!node || typeof node !== 'object' || depth > MAX_DEPTH) return node;
    if (Array.isArray(node)) {
      for (const item of node) prune(item, depth + 1);
      return node;
    }
    for (const key of Object.keys(node)) {
      if (AD_KEYS.has(key)) delete node[key];
      else if (node[key] && typeof node[key] === 'object') prune(node[key], depth + 1);
    }
    return node;
  };

  const origParse = JSON.parse;
  JSON.parse = function (text, ...rest) {
    const result = origParse.call(this, text, ...rest);
    return typeof text === 'string' && AD_TEXT.test(text) ? prune(result) : result;
  };

  const origText = Response.prototype.text;
  Response.prototype.json = function () {
    return origText.call(this).then((text) => JSON.parse(text));
  };
  
  const trap = (name) => {
    let value;
    try {
      Object.defineProperty(window, name, {
        configurable: true,
        get: () => value,
        set: (v) => { value = prune(v); },
      });
    } catch (_) {}
  };
  trap('ytInitialPlayerResponse');
  trap('playerResponse');
})();
