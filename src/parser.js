var IframeCloud = IframeCloud || {};

IframeCloud.Parser = (function() {
  /**
   * Парсит HTML и извлекает список плееров
   * @param {string} html
   * @returns {Array<{name: string, url: string}>}
   */
  function parse(html) {
    var logger = IframeCloud.Logger;
    var players = [];

    try {
      var parser = new DOMParser();
      var doc = parser.parseFromString(html, 'text/html');

      var items = doc.querySelectorAll('.cinemaplayer-item-select');

      logger.parser('Found ' + items.length + ' players');

      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var url = item.getAttribute('data-value');
        var name = item.textContent.trim();

        if (url) {
          players.push({
            name: name || ('Плеер ' + (i + 1)),
            url: url
          });
          logger.parser('Player: ' + name + ' -> ' + url);
        }
      }
    } catch (e) {
      logger.error('Parse error:', e.message);
    }

    return players;
  }

  return {
    parse: parse
  };
})();
