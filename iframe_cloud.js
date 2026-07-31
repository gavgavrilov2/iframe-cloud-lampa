(function() {
  'use strict';

  console.log('[iframe-cloud] Loading v5.1.0');

  var PLUGIN_NAME = 'Iframe Cloud';
  var WORKER_URL = 'https://silent-recipe-5c08.rustypony.workers.dev';
  var IFRAME_CLOUD_BASE = 'https://iframe.cloud/iframe/';
  var KP_API_BASE = 'https://api.kinopoisk.dev/v1.4/movie';
  var KP_API_TOKEN = 'MN8ESAR-17QMKME-NGMZKRA-RV0SSK1';

  function proxy(url) {
    return WORKER_URL + '/?proxy=' + encodeURIComponent(url);
  }

  function fetchJson(url, headers) {
    var opts = {};
    if (headers) opts.headers = headers;
    return window.fetch(url, opts)
      .then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
  }

  function fetchHtml(url) {
    return window.fetch(proxy(url))
      .then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      });
  }

  function getKinopoiskId(movie) {
    if (movie.kinopoisk_id) {
      console.log('[iframe-cloud] Found kinopoisk_id:', movie.kinopoisk_id);
      return Promise.resolve(movie.kinopoisk_id);
    }

    var tmdbId = movie.id;
    var imdbId = movie.imdb_id || (movie.external_ids && movie.external_ids.imdb_id);

    var query = null;
    if (tmdbId) {
      query = 'externalId.tmdb=' + tmdbId;
    } else if (imdbId) {
      query = 'externalId.imdb=' + imdbId;
    }

    if (!query) {
      console.log('[iframe-cloud] No TMDB/IMDB ID found');
      return Promise.resolve(null);
    }

    var apiUrl = KP_API_BASE + '?' + query + '&selectFields=id';
    console.log('[iframe-cloud] Querying kinopoisk.dev:', query);

    return fetchJson(apiUrl, { 'X-API-KEY': KP_API_TOKEN })
      .then(function(data) {
        if (data.docs && data.docs.length > 0 && data.docs[0].id) {
          var kpId = data.docs[0].id;
          console.log('[iframe-cloud] Got Kinopoisk ID:', kpId);
          return kpId;
        }
        console.log('[iframe-cloud] No results from kinopoisk.dev');
        return null;
      })
      .catch(function(e) {
        console.log('[iframe-cloud] kinopoisk.dev error:', e.message);
        return null;
      });
  }

  function extractPlayersFromHtml(html) {
    var players = [];
    var seen = {};
    var match;
    var regex = /data-value="(https?:\/\/[^"]+)"[^>]*>([^<]*)/g;
    while ((match = regex.exec(html)) !== null) {
      var url = match[1].replace(/&amp;/g, '&').trim();
      var title = match[2].replace(/&amp;/g, '&').trim();
      if (!seen[url]) {
        seen[url] = true;
        players.push({ url: url, title: title || 'Плеер' });
      }
    }
    return players;
  }

  function isVeoveo(p) {
    var t = (p.title || '').toLowerCase();
    var u = (p.url || '').toLowerCase();
    return t.indexOf('veoveo') !== -1 || u.indexOf('veoveo') !== -1;
  }

  function openInBrowser(url) {
    console.log('[iframe-cloud] Opening in browser:', url);
    window.open(url, '_blank');
    Lampa.Noty.show(PLUGIN_NAME + ': открыто в браузере');
  }

  function openPlugin(movie) {
    var id = movie.id;
    if (!id) { Lampa.Noty.show('Нет ID фильма'); return; }
    var title = movie.title || movie.name || '';

    Lampa.Noty.show(PLUGIN_NAME + ': поиск...');

    getKinopoiskId(movie)
      .then(function(kpId) {
        var targetId = kpId || id;
        var idType = kpId ? 'KP:' + kpId : 'TMDB:' + id;
        console.log('[iframe-cloud] Using ID:', idType);

        var url = IFRAME_CLOUD_BASE + targetId;

        return fetchHtml(url).then(function(html) {
          var players = extractPlayersFromHtml(html);
          players = players.filter(function(p) { return !isVeoveo(p); });

          if (players.length > 0) {
            Lampa.Noty.show(PLUGIN_NAME + ': ' + players.length + ' плееров');

            var items = players.map(function(p) {
              return { title: p.title, subtitle: 'iframe.cloud', _url: p.url };
            });

            Lampa.Select.show({
              title: PLUGIN_NAME + ' — ' + title,
              items: items,
              onSelect: function(item) { openInBrowser(item._url); }
            });
          } else {
            Lampa.Noty.show(PLUGIN_NAME + ': загрузка (' + idType + ')');
            openInBrowser(url);
          }
        });
      })
      .catch(function(e) {
        console.log('[iframe-cloud] Error:', e.message);
        openInBrowser(IFRAME_CLOUD_BASE + id);
      });
  }

  function addCardButton(movie, render) {
    if (!render || !render.length) return;
    if (render.find('.iframe-cloud-btn').length) return;

    var btn = $('<div class="full-start__button selector iframe-cloud-btn" data-subtitle="v5.1.0"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg><span>' + PLUGIN_NAME + '</span></div>');
    btn.on('hover:enter click', function() { openPlugin(movie); });
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
      if (render.find('.iframe-cloud-btn').length) { buttonAdded = true; return; }
      var targets = ['.view--torrent', '.view--online', '.full-start__buttons .full-start__button:last', '.full-start__buttons'];
      for (var i = 0; i < targets.length; i++) {
        var el = render.find(targets[i]);
        if (el.length) { addCardButton(movie, el.first()); buttonAdded = true; return; }
      }
    } catch (e) {}
  }

  function startPlugin() {
    if (window.iframe_cloud_plugin) return;
    window.iframe_cloud_plugin = true;

    Lampa.Manifest.plugins = {
      type: 'video', version: '5.1.0', name: PLUGIN_NAME, description: 'Films via iframe.cloud', component: 'iframe_cloud',
      onContextMenu: function(obj) { return { name: 'Watch in ' + PLUGIN_NAME, description: '' }; },
      onContextLauch: function(obj) { openPlugin(obj); }
    };

    Lampa.Listener.follow('full', function(e) {
      if (e.type == 'complite') { buttonAdded = false; setTimeout(tryAddButton, 500); }
    });
    setTimeout(tryAddButton, 2000);
  }

  if (typeof Lampa !== 'undefined') { startPlugin(); }
  else {
    var wait = setInterval(function() {
      if (typeof Lampa !== 'undefined') { clearInterval(wait); startPlugin(); }
    }, 500);
  }
})();
