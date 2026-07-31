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

    var video = {
      title: title,
      url: url
    };

    Lampa.Player.play(video);
    Lampa.Player.playlist([video]);
  }

  return {
    play: play
  };
})();
