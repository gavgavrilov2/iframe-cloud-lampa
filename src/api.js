var IframeCloud = IframeCloud || {};

IframeCloud.Api = (function() {
  var BASE_URL = 'https://iframe.cloud/iframe/';
  var network = new Lampa.Reguest();

  /**
   * Получить HTML страницу по kinopoisk_id
   * @param {number|string} id
   * @returns {Promise<string>}
   */
  function getIframePage(id) {
    var url = BASE_URL + id;
    var logger = IframeCloud.Logger;
    var settings = IframeCloud.Settings;

    if (settings.get('cache')) {
      var cached = IframeCloud.Cache.get('html_' + id);
      if (cached) {
        logger.log('Cache hit for', id);
        return Promise.resolve(cached);
      }
    }

    logger.request(url);

    return new Promise(function(resolve, reject) {
      network.timeout(settings.get('timeout'));

      network["native"](url, function(html) {
        if (settings.get('cache')) {
          IframeCloud.Cache.set('html_' + id, html);
        }
        logger.success('Got HTML for ' + id + ' (' + html.length + ' chars)');
        resolve(html);
      }, function(err) {
        logger.failed(err.message || err);
        reject(err);
      }, false, {
        dataType: 'text'
      });
    });
  }

  return {
    getIframePage: getIframePage
  };
})();
