var IframeCloud = IframeCloud || {};

IframeCloud.Cache = (function() {
  var store = {};
  var DEFAULT_TTL = 10 * 60 * 1000;

  function get(key) {
    var entry = store[key];
    if (!entry) return null;
    if (Date.now() > entry.expires) {
      delete store[key];
      return null;
    }
    return entry.value;
  }

  function set(key, value, ttl) {
    store[key] = {
      value: value,
      expires: Date.now() + (ttl || DEFAULT_TTL)
    };
  }

  function clear() {
    store = {};
  }

  return {
    get: get,
    set: set,
    clear: clear
  };
})();
