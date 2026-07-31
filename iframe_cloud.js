(function() {
  'use strict';

  console.log('[iframe-cloud] Loading v2.0.0');

  var PLUGIN_NAME = 'Iframe Cloud';

  var WORKER_URL = Lampa.Storage.get('iframe_cloud_worker', '');

  function playNative(url, title, quality) {
    console.log('[iframe-cloud] Playing natively:', url);

    var play = {
      title: title || PLUGIN_NAME,
      url: url,
      quality: quality || {},
      callback: function() {}
    };

    Lampa.Player.play(play);
  }

  function openIframe(url, title) {
    console.log('[iframe-cloud] Fallback overlay:', url);
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
      '<div style="position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:1;color:#fff;">' +
        '<div class="broadcast__scan"><div></div></div>' +
        '<div style="margin-top:1em;font-size:1.2em;">Загрузка плеера...</div>' +
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

    iframe.on('load', function() {
      loading.remove();
    });

    function closeOverlay() {
      overlay.remove();
      $(document).off('keydown.iframecloud');
      try { Lampa.Controller.toggle('full'); } catch (e) {}
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

  function fetchFromWorker(tmdbId, title, callback) {
    if (!WORKER_URL) {
      callback(null);
      return;
    }

    var url = WORKER_URL.replace(/\/$/, '') + '/?id=' + tmdbId;
    console.log('[iframe-cloud] Trying worker:', url);

    window.fetch(url, { signal: AbortSignal.timeout(15000) })
      .then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function(data) {
        console.log('[iframe-cloud] Worker response:', data);

        if (data.players && data.players.length) {
          var valid = data.players.filter(function(p) { return p.url; });

          if (valid.length === 1) {
            callback({ type: 'direct', player: valid[0] });
          } else if (valid.length > 1) {
            callback({ type: 'select', players: valid });
          } else {
            callback(null);
          }
        } else {
          callback(null);
        }
      })
      .catch(function(e) {
        console.log('[iframe-cloud] Worker error:', e.message);
        callback(null);
      });
  }

  function tryFetchProxy(url, callback) {
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
      window.fetch(proxyUrl, { signal: AbortSignal.timeout(5000) })
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

    var title = movie.title || movie.name || '';
    var directUrl = 'https://iframe.cloud/iframe/' + id;
    console.log('[iframe-cloud] TMDB:', id);

    Lampa.Noty.show('Загрузка ' + PLUGIN_NAME + '...');

    fetchFromWorker(id, title, function(result) {
      if (!result) {
        console.log('[iframe-cloud] Worker failed, trying proxy');

        tryFetchProxy(directUrl, function(html) {
          if (!html) {
            console.log('[iframe-cloud] All failed, overlay');
            openIframe(directUrl, title);
            return;
          }

          var players = parsePlayers(html);
          if (!players.length) {
            openIframe(directUrl, title);
            return;
          }

          if (players.length === 1) {
            openIframe(players[0].url, title);
            return;
          }

          Lampa.Select.show({
            title: PLUGIN_NAME + ' — ' + title,
            items: players.map(function(p) {
              return { title: p.title, subtitle: title, url: p.url };
            }),
            onSelect: function(item) {
              openIframe(item.url, item.title);
            }
          });
        });
        return;
      }

      if (result.type === 'direct') {
        var p = result.player;
        var quality = {};
        if (p.quality) {
          quality = p.quality;
        } else if (p.url.indexOf('.m3u8') > -1) {
          quality = { 'Auto': p.url };
        } else if (p.url.indexOf('.mp4') > -1) {
          [2160, 1080, 720, 480, 360].forEach(function(q) {
            quality[q + 'p'] = p.url;
          });
        }

        playNative(p.url, p.title || title, quality);
      }

      if (result.type === 'select') {
        Lampa.Select.show({
          title: PLUGIN_NAME + ' — ' + title,
          items: result.players.map(function(p) {
            return {
              title: p.title || 'Плеер',
              subtitle: p.type || '',
              _player: p
            };
          }),
          onSelect: function(item) {
            var p = item._player;
            var quality = {};
            if (p.quality) {
              quality = p.quality;
            }
            playNative(p.url, p.title || title, quality);
          }
        });
      }
    });
  }

  function addCardButton(movie, render) {
    if (!render || !render.length) return;
    if (render.find('.iframe-cloud-btn').length) return;

    var btn = $(
      '<div class="full-start__button selector iframe-cloud-btn" data-subtitle="v2.0.0">' +
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
      version: '2.0.0',
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

    Lampa.Params.input('iframe_cloud_worker', '', 'URL Cloudflare Worker');
    Lampa.SettingsApi.addComponent({
      component: 'iframe_cloud_settings',
      name: PLUGIN_NAME,
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>'
    });

    Lampa.Template.add('settings_iframe_cloud', '<div>' +
      '<div class="settings-param selector" data-name="iframe_cloud_worker" data-type="input" placeholder="https://my-worker.user.workers.dev">' +
        '<div class="settings-param__name">URL Cloudflare Worker</div>' +
        '<div class="settings-param__value"></div>' +
        '<div class="settings-param__descr">Адрес вашего Worker для парсинга iframe.cloud</div>' +
      '</div>' +
    '</div>');

    Lampa.Listener.follow('settings', function(e) {
      if (e.name == 'iframe_cloud_settings') {
        e.body.find('[data-name="iframe_cloud_worker"]').unbind('hover:enter').on('hover:enter', function() {
          var input = $(this);
          var current = Lampa.Storage.get('iframe_cloud_worker', '');
          Lampa.Input.show({
            title: 'URL Worker',
            value: current,
            place: 'https://my-worker.user.workers.dev',
            onSelect: function(val) {
              WORKER_URL = val;
              Lampa.Storage.set('iframe_cloud_worker', val);
              input.find('.settings-param__value').text(val || 'Не задан');
              Lampa.Controller.toggle('settings_component');
            }
          });
        });

        e.body.find('[data-name="iframe_cloud_worker"] .settings-param__value').text(WORKER_URL || 'Не задан');
      }
    });

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
