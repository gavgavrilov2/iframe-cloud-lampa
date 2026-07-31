(function() {
  'use strict';

  console.log('[iframe-cloud] Loading v5.16.0');

  var PLUGIN_NAME = 'Iframe Cloud';
  var WORKER_URL = 'https://silent-recipe-5c08.rustypony.workers.dev';
  var VERCEL_PROXY_URL = 'https://iframe-cloud-proxy.vercel.app/api/proxy';
  var IFRAME_CLOUD_BASE = 'https://iframe.cloud/iframe/';
  var KP_API_BASE = 'https://api.kinopoisk.dev/v1.4/movie';
  var KP_API_TOKEN = 'MN8ESAR-17QMKME-NGMZKRA-RV0SSK1';
  var IFRAME_CLOUD_API = 'https://iframe.cloud/lampac-api.php';
  var KPU_API = 'https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword';

  function proxy(url) {
    return WORKER_URL + '/?proxy=' + encodeURIComponent(url);
  }

  function proxyKpu(url) {
    return WORKER_URL + '/?kpu=' + encodeURIComponent(url);
  }

  function fetchText(url) {
    return window.fetch(url).then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    });
  }

  function fetchJson(url) {
    return fetchText(url).then(function(t) { return JSON.parse(t); });
  }

  function fetchJsonViaProxy(url) {
    return fetchJson(proxy(url));
  }

  /* ---- Kinopoisk ID ---- */

  function getYear(movie) {
    var d = movie.release_date || movie.first_air_date || movie.year || '';
    if (typeof d === 'number') return d;
    var m = String(d).match(/^(\d{4})/);
    return m ? parseInt(m[1], 10) : null;
  }

  function normalizeTitle(s) {
    return (s || '').toLowerCase().replace(/[ё]/g, 'е').replace(/[^a-zа-я0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  }

  function titleMatch(a, b) {
    return normalizeTitle(a) === normalizeTitle(b);
  }

  function searchKPByKeyword(keyword) {
    var url = KPU_API + '?keyword=' + encodeURIComponent(keyword) + '&page=1';
    console.log('[iframe-cloud] KPU search:', keyword);
    return fetchJson(proxyKpu(url))
      .then(function(data) {
        var films = data.films || [];
        console.log('[iframe-cloud] KPU got', films.length, 'results');
        return films;
      })
      .catch(function(e) {
        console.log('[iframe-cloud] KPU error:', e.message);
        return [];
      });
  }

  function searchKinopoiskByName(movie) {
    var title = movie.title || movie.original_title || movie.name || '';
    var year = getYear(movie);
    if (!title) return Promise.resolve(null);

    return searchKPByKeyword(title).then(function(films) {
      if (!films.length) return null;

      var yearFiltered = films;
      if (year) {
        yearFiltered = films.filter(function(f) {
          var fy = parseInt(String(f.year), 10);
          return fy && Math.abs(fy - year) <= 1;
        });
      }

      var candidates = (yearFiltered.length ? yearFiltered : films);

      for (var i = 0; i < candidates.length; i++) {
        var f = candidates[i];
        var names = [f.nameRu, f.nameOriginal, f.nameEn].filter(Boolean);
        for (var n = 0; n < names.length; n++) {
          if (titleMatch(names[n], title)) {
            console.log('[iframe-cloud] KPU matched:', f.kinopoiskId, f.nameRu, f.year);
            return f.kinopoiskId;
          }
        }
      }

      if (candidates.length) {
        var best = candidates.sort(function(a, b) {
          return (b.ratingKinopoisk || 0) - (a.ratingKinopoisk || 0);
        })[0];
        console.log('[iframe-cloud] KPU best guess:', best.kinopoiskId, best.nameRu, best.year);
        return best.kinopoiskId;
      }

      return null;
    });
  }

  function getKinopoiskId(movie) {
    if (movie.kinopoisk_id) return Promise.resolve(movie.kinopoisk_id);

    var imdbId = movie.imdb_id || (movie.external_ids && movie.external_ids.imdb_id);
    if (imdbId) {
      console.log('[iframe-cloud] Trying IMDb:', imdbId);
      return fetchJsonViaProxy(KP_API_BASE + '?externalId.imdb=' + imdbId + '&selectFields=id,name')
        .then(function(d) {
          if (!d.docs || !d.docs.length) return null;
          var best = d.docs.find(function(m) { return m.name; }) || d.docs[0];
          return best && best.id || null;
        })
        .catch(function() { return null; });
    }

    return searchKinopoiskByName(movie).then(function(kpId) {
      if (kpId) return kpId;

      var tmdbId = movie.id;
      var query = tmdbId ? 'externalId.tmdb=' + tmdbId : null;
      if (!query) return null;

      console.log('[iframe-cloud] Fallback to TMDB:', tmdbId);
      return fetchJsonViaProxy(KP_API_BASE + '?' + query + '&selectFields=id,name')
        .then(function(d) {
          if (!d.docs || !d.docs.length) return null;
          var best = d.docs.find(function(m) { return m.name; }) || d.docs[0];
          console.log('[iframe-cloud] KP candidates:', d.docs.map(function(m) { return m.id + (m.name ? '(' + m.name + ')' : ''); }).join(', '));
          return best && best.id || null;
        })
        .catch(function() { return null; });
    });
  }

  /* ---- iframe.cloud players API ---- */

  function getPlayers(kpId) {
    var url = IFRAME_CLOUD_API + '?action=players&kp_id=' + kpId;
    console.log('[iframe-cloud] Fetching players:', url);
    return fetchJsonViaProxy(url)
      .then(function(data) {
        var players = data.players || [];
        console.log('[iframe-cloud] Got', players.length, 'players');
        return players;
      });
  }

  function getPlayersWithRetry(kpId, attempt) {
    attempt = attempt || 0;
    return getPlayers(kpId).then(function(players) {
      if (players.length === 0 && attempt < 2) {
        console.log('[iframe-cloud] Retry in 1.5s, attempt', attempt + 1);
        return new Promise(function(resolve) {
          setTimeout(function() {
            resolve(getPlayersWithRetry(kpId, attempt + 1));
          }, 1500);
        });
      }
      return players;
    });
  }

  function isVeoveo(p) {
    var s = (p.source || '').toLowerCase();
    var u = (p.url || '').toLowerCase();
    return s.indexOf('veoveo') !== -1 || u.indexOf('veoveo') !== -1;
  }

  /* ---- iframe player overlay ---- */

  function showIframePlayer(url, label, onClose) {
    var overlay = $('<div class="iframe-cloud-player" style="position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;background:#000;"></div>');
    var closeBtn = $('<div style="position:absolute;top:10px;right:10px;z-index:10000;background:rgba(0,0,0,0.7);color:#fff;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:14px;">\u2715 \u0417\u0430\u043a\u0440\u044b\u0442\u044c</div>');
    var iframe = $('<iframe src="" style="width:100%;height:100%;border:none;" allowfullscreen="true" allow="autoplay; fullscreen"></iframe>');
    iframe.attr('src', url);

    var removed = false;
    function close() {
      if (removed) return;
      removed = true;
      overlay.remove();
      document.removeEventListener('keydown', keyHandler);
      console.log('[iframe-cloud] iframe player closed');
      if (onClose) onClose();
    }

    closeBtn.on('hover:enter click', close);

    var keyHandler = function(e) {
      if (e.key === 'Escape' || e.keyCode === 27 || e.keyCode === 10009) {
        close();
      }
    };
    document.addEventListener('keydown', keyHandler);

    overlay.append(iframe).append(closeBtn);
    $('body').append(overlay);

    console.log('[iframe-cloud] iframe player opened:', label);
  }

  /* ---- Main flow ---- */

  function openPlugin(movie) {
    var id = movie.id;
    if (!id) { Lampa.Noty.show('\u041d\u0435\u0442 ID \u0444\u0438\u043b\u044c\u043c\u0430'); return; }
    var title = movie.title || movie.name || '';

    Lampa.Noty.show(PLUGIN_NAME + ': \u043f\u043e\u0438\u0441\u043a...');

    getKinopoiskId(movie)
      .then(function(kpId) {
        if (!kpId) {
          Lampa.Noty.show(PLUGIN_NAME + ': Kinopoisk ID \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d');
          return;
        }

        console.log('[iframe-cloud] KP ID:', kpId);

        return getPlayersWithRetry(kpId).then(function(players) {
          players = players.filter(function(p) { return !isVeoveo(p); });

          if (!players.length) {
            Lampa.Noty.show(PLUGIN_NAME + ': \u043f\u043b\u0435\u0435\u0440\u044b \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u044b');
            return;
          }

          var items = players.map(function(p, i) {
            return {
              title: p.source + ' \u2014 ' + (p.translate || ''),
              subtitle: p.quality || '',
              _player: p, _index: i
            };
          });

          items.push({
            title: '\ud83c\udf10 \u041e\u0442\u043a\u0440\u044b\u0442\u044c \u0432 \u0431\u0440\u0430\u0437\u0435\u0440\u0435',
            subtitle: 'iframe.cloud',
            _browser: true,
            _cloudUrl: IFRAME_CLOUD_BASE + kpId
          });

          Lampa.Select.show({
            title: PLUGIN_NAME + ' \u2014 ' + title,
            items: items,
            onSelect: function(item) {
              if (item._browser) {
                window.open(item._cloudUrl, '_blank');
                return;
              }

              var p = item._player;
              var label = p.source + ' (' + (p.translate || '') + ')';
              console.log('[iframe-cloud] Opening:', label, p.url);
              showIframePlayer(p.url, label);
            }
          });
        });
      })
      .catch(function(e) {
        console.log('[iframe-cloud] Error:', e.message);
        Lampa.Noty.show(PLUGIN_NAME + ': \u043e\u0448\u0438\u0431\u043a\u0430');
      });
  }

  /* ---- Plugin registration ---- */

  function addCardButton(movie, render) {
    if (!render || !render.length) return;
    if (render.find('.iframe-cloud-btn').length) return;

    var btn = $('<div class="full-start__button selector iframe-cloud-btn" data-subtitle="v5.16.0"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg><span>' + PLUGIN_NAME + '</span></div>');
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
      type: 'video', version: '5.16.0', name: PLUGIN_NAME, description: 'Watch via iframe.cloud', component: 'iframe_cloud',
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
