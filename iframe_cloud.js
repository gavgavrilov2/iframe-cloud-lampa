(function() {
  'use strict';

  console.log('[iframe-cloud] Loading v5.9.0');

  var PLUGIN_NAME = 'Iframe Cloud';
  var WORKER_URL = 'https://silent-recipe-5c08.rustypony.workers.dev';
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

  function proxyApi(url) {
    return WORKER_URL + '/?api=' + encodeURIComponent(url) + '&apikey=' + encodeURIComponent(KP_API_TOKEN);
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

  function isOrtified(p) {
    var u = (p.url || '').toLowerCase();
    return u.indexOf('ortified.ws') !== -1;
  }

  /* ---- ortified.ws embed parsing ---- */

  function extractBraces(str, startIdx) {
    var depth = 0, inStr = false, ch = '', esc = false;
    for (var i = startIdx; i < str.length; i++) {
      ch = str[i];
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (inStr) { if (ch === '"') inStr = false; continue; }
      if (ch === '"') { inStr = true; continue; }
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) return str.substring(startIdx, i + 1); }
    }
    return null;
  }

  function parseOrtifiedEmbed(html) {
    var result = { seasons: [], hlsUrl: null };

    var mkMatch = html.match(/<script[^>]*data-name=["']mk["'][^>]*>([\s\S]*?)<\/script>/i);
    if (!mkMatch) return result;

    var mkScript = mkMatch[1];
    var idx = mkScript.indexOf('makePlayer(');
    if (idx === -1) return result;

    var objStart = mkScript.indexOf('{', idx);
    if (objStart === -1) return result;

    var objStr = extractBraces(mkScript, objStart);
    if (!objStr) return result;

    var fixed = objStr.replace(/,\s*([\]}])/g, '$1');

    try {
      var opts = JSON.parse(fixed);

      if (opts.playlist && opts.playlist.seasons) {
        result.seasons = opts.playlist.seasons;
        result.current = opts.playlist.current || null;
      } else if (opts.source && opts.source.hls) {
        result.hlsUrl = opts.source.hls;
      }
    } catch (e) {
      console.log('[iframe-cloud] ortified JSON parse error:', e.message);
    }

    return result;
  }

  /* ---- Lampa Player ---- */

  function playHls(url, title) {
    console.log('[iframe-cloud] Playing HLS:', url.substring(0, 80));
    Lampa.Player.play({ url: url, title: title || PLUGIN_NAME, quality: true, subtitles: [] });
    Lampa.Player.run();
  }

  /* ---- Episode/Season UI ---- */

  function showEpisodeSelector(seasons, title, current) {
    var items = [];
    var sorted = seasons.slice().sort(function(a, b) { return (a.season || 0) - (b.season || 0); });

    for (var s = 0; s < sorted.length; s++) {
      var season = sorted[s];
      var sNum = season.season || (s + 1);
      var eps = season.episodes || [];

      for (var e = 0; e < eps.length; e++) {
        var ep = eps[e];
        var eNum = ep.episode || (e + 1);
        var hls = ep.hls || '';
        var dur = ep.duration ? Math.round(ep.duration / 60) + ' мин' : '';
        var isCur = current && current.season == sNum && current.episode == eNum;

        if (hls) {
          items.push({
            title: (isCur ? '► ' : '') + 'S' + sNum + 'E' + eNum,
            subtitle: dur,
            _hls: hls,
            _label: 'S' + sNum + 'E' + eNum
          });
        }
      }
    }

    if (!items.length) { Lampa.Noty.show(PLUGIN_NAME + ': нет эпизодов'); return; }

    Lampa.Select.show({
      title: PLUGIN_NAME + ' — ' + title,
      items: items,
      onSelect: function(item) { playHls(item._hls, item._label + ' ' + title); }
    });
  }

  function showSeasonSelector(seasons, title, current) {
    var items = [];
    var sorted = seasons.slice().sort(function(a, b) { return (a.season || 0) - (b.season || 0); });

    for (var s = 0; s < sorted.length; s++) {
      var season = sorted[s];
      var sNum = season.season || (s + 1);
      items.push({
        title: 'Сезон ' + sNum,
        subtitle: (season.episodes || []).length + ' эпизодов',
        _season: season, _sNum: sNum
      });
    }

    Lampa.Select.show({
      title: PLUGIN_NAME + ' — ' + title,
      items: items,
      onSelect: function(item) {
        var eps = item._season.episodes || [];
        if (eps.length === 1) { playHls(eps[0].hls, 'S' + item._sNum + 'E1 ' + title); }
        else { showEpisodeSelector([item._season], title, current); }
      }
    });
  }

  /* ---- iframe player (inline, not new tab) ---- */

  function showIframePlayer(url, label) {
    var overlay = $('<div class="iframe-cloud-player" style="position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;background:#000;"></div>');
    var closeBtn = $('<div style="position:absolute;top:10px;right:10px;z-index:10000;background:rgba(0,0,0,0.7);color:#fff;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:14px;">✕ Закрыть</div>');
    var iframe = $('<iframe src="' + url + '" style="width:100%;height:100%;border:none;" allowfullscreen="true" allow="autoplay; fullscreen"></iframe>');

    var removed = false;
    function close() {
      if (removed) return;
      removed = true;
      overlay.remove();
      document.removeEventListener('keydown', keyHandler);
      console.log('[iframe-cloud] iframe player closed');
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

  /* ---- Process ortified embed ---- */

  function playOrtified(url, playerLabel, movieTitle, onFailure) {
    Lampa.Noty.show(PLUGIN_NAME + ': загрузка ' + playerLabel + '...');

    fetchText(proxy(url)).then(function(html) {
      var data = parseOrtifiedEmbed(html);

      if (data.seasons.length > 0) {
        Lampa.Noty.show(PLUGIN_NAME + ': сериал, ' + data.seasons.length + ' сезон(ов)');
        showSeasonSelector(data.seasons, movieTitle, data.current);
      } else if (data.hlsUrl) {
        playHls(data.hlsUrl, movieTitle);
      } else {
        Lampa.Noty.show(PLUGIN_NAME + ': видео не найдено в ' + playerLabel);
        if (onFailure) onFailure();
      }
    }).catch(function(e) {
      console.log('[iframe-cloud] ortified fetch error:', e.message);
      if (onFailure) onFailure();
      else {
        showIframePlayer(url, playerLabel);
      }
    });
  }

  /* ---- Auto-try next player ---- */

  function tryNextPlayer(players, currentIndex, movieTitle) {
    for (var i = currentIndex + 1; i < players.length; i++) {
      var np = players[i];
      if (isVeoveo(np)) continue;
      if (isOrtified(np)) {
        (function(idx, p) {
          Lampa.Noty.show(PLUGIN_NAME + ': пробуем ' + p.source + '...');
          playOrtified(p.url, p.source + ' (' + (p.translate || '') + ')', movieTitle, function() {
            tryNextPlayer(players, idx, movieTitle);
          });
        })(i, np);
        return true;
      } else {
        showIframePlayer(np.url, np.source + ' (' + (np.translate || '') + ')');
        return true;
      }
    }
    Lampa.Noty.show(PLUGIN_NAME + ': все плееры недоступны, откройте iframe.cloud');
    window.open(IFRAME_CLOUD_BASE + '0', '_blank');
    return false;
  }

  /* ---- Main flow ---- */

  function openPlugin(movie) {
    var id = movie.id;
    if (!id) { Lampa.Noty.show('Нет ID фильма'); return; }
    var title = movie.title || movie.name || '';

    Lampa.Noty.show(PLUGIN_NAME + ': поиск...');

    getKinopoiskId(movie)
      .then(function(kpId) {
        if (!kpId) {
          Lampa.Noty.show(PLUGIN_NAME + ': Kinopoisk ID не найден');
          return;
        }

        console.log('[iframe-cloud] KP ID:', kpId);

        return getPlayersWithRetry(kpId).then(function(players) {
          players = players.filter(function(p) { return !isVeoveo(p); });

          if (!players.length) {
            Lampa.Noty.show(PLUGIN_NAME + ': плееры не найдены');
            return;
          }

          var items = players.map(function(p, i) {
            return {
              title: p.source + ' — ' + (p.translate || ''),
              subtitle: p.quality || '',
              _player: p, _index: i
            };
          });

          items.push({
            title: '🌐 Открыть в браузере',
            subtitle: 'iframe.cloud',
            _browser: true,
            _cloudUrl: IFRAME_CLOUD_BASE + kpId
          });

          Lampa.Select.show({
            title: PLUGIN_NAME + ' — ' + title,
            items: items,
            onSelect: function(item) {
              if (item._browser) {
                window.open(item._cloudUrl, '_blank');
                return;
              }

              var p = item._player;

              if (isOrtified(p)) {
                playOrtified(p.url, p.source + ' (' + (p.translate || '') + ')', title, function() {
                  tryNextPlayer(players, item._index, title);
                });
              } else {
                showIframePlayer(p.url, p.source + ' (' + (p.translate || '') + ')');
              }
            }
          });
        });
      })
      .catch(function(e) {
        console.log('[iframe-cloud] Error:', e.message);
        Lampa.Noty.show(PLUGIN_NAME + ': ошибка');
      });
  }

  /* ---- Plugin registration ---- */

  function addCardButton(movie, render) {
    if (!render || !render.length) return;
    if (render.find('.iframe-cloud-btn').length) return;

    var btn = $('<div class="full-start__button selector iframe-cloud-btn" data-subtitle="v5.9.0"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg><span>' + PLUGIN_NAME + '</span></div>');
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
      type: 'video', version: '5.9.0', name: PLUGIN_NAME, description: 'Native HLS via iframe.cloud API', component: 'iframe_cloud',
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
