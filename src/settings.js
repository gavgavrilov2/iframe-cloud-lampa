var IframeCloud = IframeCloud || {};

IframeCloud.Settings = (function() {
  var defaults = {
    cache: true,
    logging: true,
    timeout: 15000,
    autoPlay: false,
    showHidden: false
  };

  function get(key) {
    return Lampa.Storage.get('iframe_cloud_' + key, defaults[key]);
  }

  function set(key, value) {
    Lampa.Storage.set('iframe_cloud_' + key, value);
  }

  return {
    get: get,
    set: set
  };
})();
