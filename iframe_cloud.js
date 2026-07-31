(function() {
  'use strict';

  console.log('[iframe-cloud] Loading v5.0.0');

  var PLUGIN_NAME = 'Iframe Cloud';
  var WORKER_URL = 'https://silent-recipe-5c08.rustypony.workers.dev';
  var IFRAME_CLOUD_BASE = 'https://iframe.cloud/iframe/';

  function proxy(url) {
    return WORKER_URL + '/?proxy=' + encodeURIComponent(url);
  }

  function fetchJson(url) {
    return window.fetch(url)
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

    var wikidataId = null;
    if (movie.external_ids && movie.external_ids.wikidata_id) {
      wikidataId = movie.external_ids.wikidata_id;
    }
    if (!wikidataId && movie.wikidata_id) {
      wikidataId = movie.wikidata_id;
    }

    if (wikidataId) {
      console.log('[iframe-cloud] Looking up Wikidata:', wikidataId);
      var wikiUrl = 'https://www.wikidata.org/wiki/Special:EntityData/' + wikidataId + '.json';
      return fetchJson(wikiUrl)
        .then(function(data) {
          var entity = data.entities[wikidataId];
          if (!entity || !entity.claims) return null;

          var p12196 = entity.claims['P12196'];
          if (p12196 && p12196.length > 0) {
            var val = p12196[0].mainsnak && p12196[0].mainsnak.datavalue && p12196[0].mainsnak.datavalue.value;
            if (val) {
              console.log('[iframe-cloud] Got Kinopoisk ID from Wikidata:', val);
              return val;
            }
          }
          return null;
        })
        .catch(function(e) {
          console.log('[iframe-cloud] Wikidata lookup failed:', e.message);
          return null;
        });
    }

    return Promise.resolve(null);
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

  function openInBrowser(url, title) {
    console.log('[iframe-cloud] Opening in browser:', url);
    window.open(url, '_blank');
    Lampa.Noty.show(PLUGIN_NAME + ': открыто в браузере');
  }

  function openPlugin(movie) {
    var id = movie.id;
    if (!id) { Lampa.Noty.show('Нет ID фильма'); return; }
    var title = movie.title || movie.name || '';

    Lampa.Noty.show(PLUGIN_NAME + ': поиск Kinopoisk ID...');

    getKinopoiskId(movie)
      .then(function(kpId) {
        var targetId = kpId || id;
        var idType = kpId ? 'KP:' + kpId : 'TMDB:' + id;
        console.log('[iframe-cloud] Using ID:', idType);

        var url = IFRAME_CLOUD_BASE + targetId;

        return fetchHtml(url).then(function(html) {
          var players = extractPlayersFromHtml(html);
          console.log('[iframe-cloud] Players found:', players.length);
          players = players.filter(function(p) { return !isVeoveo(p); });

          if (players.length > 0) {
            Lampa.Noty.show(PLUGIN_NAME + ': найдено ' + players.length + ' плееров (' + idType + ')');

            var items = players.map(function(p) {
              return {
                title: p.title,
                subtitle: 'iframe.cloud',
                _url: p.url
              };
            });

            Lampa.Select.show({
              title: PLUGIN_NAME + ' — ' + title,
              items: items,
              onSelect: function(item) {
                openInBrowser(item._url, title);
              }
            });
          } else {
            console.log('[iframe-cloud] No players in HTML, opening in browser');
            Lampa.Noty.show(PLUGIN_NAME + ': плееры загружаются в браузере (' + idType + ')');
            openInBrowser(url, title);
          }
        });
      })
      .catch(function(e) {
        console.log('[iframe-cloud] Error:', e.message);
        var url = IFRAME_CLOUD_BASE + id;
        openInBrowser(url, title);
      });
  }

  function addCardButton(movie, render) {
    if (!render || !render.length) return;
    if (render.find('.iframe-cloud-btn').length) return;

    var btn = $('<div class="full-start__button selector iframe-cloud-btn" data-subtitle="v5.0.0"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg><span>' + PLUGIN_NAME + '</span></div>');
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
      type: 'video', version: '5.0.0', name: PLUGIN_NAME, description: 'Films via iframe.cloud', component: 'iframe_cloud',
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
