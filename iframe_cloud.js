(function() {
  'use strict';

  console.log('[iframe-cloud] Loading v1.5.0');

  var PLUGIN_NAME = 'Iframe Cloud';

  function openIframe(url, title) {
    console.log('[iframe-cloud] Opening overlay:', url);
    $('.iframe-cloud-overlay').remove();

    var overlay = $('<div class="iframe-cloud-overlay"></div>');
    overlay.css({
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      zIndex: 99999,
      background: '#000'
    });

    var loading = $(
      '<div style="position:absolute;top:0;left:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;z-index:1;">' +
        '<div class="broadcast__scan"><div></div></div>' +
      '</div>'
    );

    var closeBtn = $(
      '<div class="selector iframe-cloud-close" style="' +
        'position:absolute;top:15px;right:20px;z-index:100000;' +
        'color:#fff;font-size:36px;cursor:pointer;padding:10px 20px;' +
        'background:rgba(0,0,0,0.7);border-radius:8px;' +
      '">&#10005;</div>'
    );

    var hint = $(
      '<div style="' +
        'position:absolute;bottom:20px;left:0;right:0;text-align:center;' +
        'color:rgba(255,255,255,0.5);font-size:14px;z-index:100000;' +
      '">' + title + ' | ESC — закрыть</div>'
    );

    var iframe = $('<iframe></iframe>', {
      src: url,
      style: 'width:100%;height:100%;border:none;',
      allow: 'autoplay; fullscreen'
    });

    var videoUrl = null;

    function tryExtractVideo() {
      try {
        var doc = iframe[0].contentDocument || iframe[0].contentWindow.document;
        var video = doc.querySelector('video');
        if (video && video.src) {
          videoUrl = video.src;
          console.log('[iframe-cloud] Video URL found:', videoUrl);
          return true;
        }
        var sources = doc.querySelectorAll('source');
        for (var i = 0; i < sources.length; i++) {
          if (sources[i].src) {
            videoUrl = sources[i].src;
            console.log('[iframe-cloud] Source URL found:', videoUrl);
            return true;
          }
        }
      } catch (e) {}
      return false;
    }

    iframe.on('load', function() {
      loading.remove();
      setTimeout(function() {
        if (!videoUrl && tryExtractVideo()) {
          playNative(videoUrl, title);
          overlay.remove();
          $(document).off('keydown.iframecloud');
        }
      }, 2000);
      setTimeout(function() {
        if (!videoUrl && tryExtractVideo()) {
          playNative(videoUrl, title);
          overlay.remove();
          $(document).off('keydown.iframecloud');
        }
      }, 5000);
    });

    window.addEventListener('message', function handler(e) {
      if (e.data && typeof e.data === 'string') {
        try {
          var data = JSON.parse(e.data);
          if (data.url && (data.url.indexOf('.mp4') > -1 || data.url.indexOf('.m3u8') > -1 || data.url.indexOf('video') > -1)) {
            console.log('[iframe-cloud] postMessage video:', data.url);
            videoUrl = data.url;
            playNative(videoUrl, title);
            overlay.remove();
            $(document).off('keydown.iframecloud');
            window.removeEventListener('message', handler);
          }
        } catch (err) {}
      }
    });

    function closeOverlay() {
      overlay.remove();
      $(document).off('keydown.iframecloud');
      if (Lampa.Controller) {
        try { Lampa.Controller.toggle('full'); } catch (e) {}
      }
    }

    closeBtn.on('click hover:enter', closeOverlay);

    $(document).on('keydown.iframecloud', function(e) {
      if (e.keyCode === 27 || e.keyCode === 8) {
        e.preventDefault();
        e.stopPropagation();
        closeOverlay();
      }
    });

    overlay.append(loading).append(iframe).append(closeBtn).append(hint);
    $('body').append(overlay);

    setTimeout(function() { closeBtn.focus(); }, 500);
  }

  function playNative(url, title) {
    console.log('[iframe-cloud] Playing natively:', url);
    var play = {
      title: title || PLUGIN_NAME,
      url: url,
      quality: {},
      callback: function() {}
    };

    if (url.indexOf('.m3u8') > -1) {
      play.url = url;
    } else if (url.indexOf('.mp4') > -1) {
      var base = url.replace(/_\d+\.mp4.*$/, '_');
      var qualities = [2160, 1080, 720, 480, 360];
      qualities.forEach(function(q) {
        play.quality[q + 'p'] = base + q + '.mp4';
      });
    }

    Lampa.Player.play(play);
  }

  function tryFetchWithTimeout(url, callback) {
    var proxies = [
      'https://api.allorigins.win/raw?url=',
      'https://corsproxy.io/?url='
    ];

    function tryProxy(i) {
      if (i >= proxies.length) {
        callback(null);
        return;
      }
      var proxyUrl = proxies[i] + encodeURIComponent(url);
      window.fetch(proxyUrl, { signal: AbortSignal.timeout(6000) })
        .then(function(r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.text();
        })
        .then(function(html) { callback(html); })
        .catch(function() { tryProxy(i + 1); });
    }

    tryProxy(0);
  }

  function parsePlayers(html) {
    var players = [];
    try {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      var items = doc.querySelectorAll('.cinemaplayer-item-select');
      for (var i = 0; i < items.length; i++) {
        var dataUrl = items[i].getAttribute('data-value');
        var name = items[i].textContent.trim();
        if (dataUrl) {
          players.push({ title: name || ('Плеер ' + (i + 1)), url: dataUrl });
        }
      }
    } catch (e) {}
    return players;
  }

  function openPlugin(movie) {
    var id = movie.id;
    if (!id) {
      Lampa.Noty.show('Нет ID фильма');
      return;
    }

    var directUrl = 'https://iframe.cloud/iframe/' + id;
    var title = movie.title || movie.name || '';
    console.log('[iframe-cloud] Fetching players for tmdb:', id);

    tryFetchWithTimeout(directUrl, function(html) {
      if (!html) {
        console.log('[iframe-cloud] Proxy failed, opening directly');
        openIframe(directUrl, title);
        return;
      }

      var players = parsePlayers(html);
      console.log('[iframe-cloud] Players found:', players.length);

      if (!players.length) {
        openIframe(directUrl, title);
        return;
      }

      Lampa.Select.show({
        title: PLUGIN_NAME + ' — ' + title,
        items: players.map(function(p) {
          return { title: p.title, subtitle: title, url: p.url };
        }),
        onSelect: function(item) {
          console.log('[iframe-cloud] Opening player:', item.url);
          openIframe(item.url, item.title);
        }
      });
    });
  }

  function addCardButton(movie, render) {
    if (!render || !render.length) return;
    if (render.find('.iframe-cloud-btn').length) return;

    var btn = $(
      '<div class="full-start__button selector iframe-cloud-btn" data-subtitle="v1.5.0">' +
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<polygon points="5 3 19 12 5 21 5 3"/>' +
        '</svg>' +
        '<span>' + PLUGIN_NAME + '</span>' +
      '</div>'
    );

    btn.on('hover:enter click', function() {
      openPlugin(movie);
    });

    render.after(btn);
  }

  var buttonAdded = false;

  function tryAddButton() {
    if (buttonAdded) return;

    try {
      var active = Lampa.Activity.active();
      if (!active || active.component !== 'full') return;

      var movie = active.card || active.data && active.data.movie;
      if (!movie) return;

      var render = active.activity.render();
      if (render.find('.iframe-cloud-btn').length) {
        buttonAdded = true;
        return;
      }

      var targets = [
        '.view--torrent',
        '.view--online',
        '.full-start__buttons .full-start__button:last',
        '.full-start__buttons'
      ];

      for (var i = 0; i < targets.length; i++) {
        var el = render.find(targets[i]);
        if (el.length) {
          addCardButton(movie, el.first());
          buttonAdded = true;
          return;
        }
      }
    } catch (e) {}
  }

  function startPlugin() {
    if (window.iframe_cloud_plugin) return;
    window.iframe_cloud_plugin = true;

    Lampa.Manifest.plugins = {
      type: 'video',
      version: '1.5.0',
      name: PLUGIN_NAME,
      description: 'Фильмы через iframe.cloud',
      component: 'iframe_cloud',
      onContextMenu: function(obj) {
        return { name: 'Смотреть в ' + PLUGIN_NAME, description: '' };
      },
      onContextLauch: function(obj) {
        openPlugin(obj);
      }
    };

    Lampa.Listener.follow('full', function(e) {
      if (e.type == 'complite') {
        buttonAdded = false;
        setTimeout(tryAddButton, 500);
      }
    });

    setTimeout(tryAddButton, 2000);
  }

  if (typeof Lampa !== 'undefined') {
    startPlugin();
  } else {
    var wait = setInterval(function() {
      if (typeof Lampa !== 'undefined') {
        clearInterval(wait);
        startPlugin();
      }
    }, 500);
  }
})();
