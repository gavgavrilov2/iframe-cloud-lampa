var IframeCloud = IframeCloud || {};

IframeCloud.Utils = (function() {
  function addUrlComponent(url, component) {
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + component;
  }

  return {
    addUrlComponent: addUrlComponent
  };
})();
