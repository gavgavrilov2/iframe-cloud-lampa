var IframeCloud = IframeCloud || {};

IframeCloud.Player = (function() {
  /**
   * Воспроизвести видео
   * @param {string} url - URL iframe плеера
   * @param {string} title - название фильма
   */
  function play(url, title) {
    var logger = IframeCloud.Logger;
    logger.player('Playing: ' + title + ' -> ' + url);

    Lampa.Player.runas(Lampa.Storage.field('player'));

    Lampa.Player.play({
      title: title,
      url: url,
      method: 'play'
    });
  }

  return {
    play: play
  };
})();
