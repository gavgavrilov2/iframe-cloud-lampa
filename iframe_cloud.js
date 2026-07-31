(function() {
  'use strict';

  console.log('[iframe-cloud] Loading v5.4.0');

  var PLUGIN_NAME = 'Iframe Cloud';
  var WORKER_URL = 'https://silent-recipe-5c08.rustypony.workers.dev';
  var IFRAME_CLOUD_BASE = 'https://iframe.cloud/iframe/';
  var KP_API_BASE = 'https://api.kinopoisk.dev/v1.4/movie';
  var KP_API_TOKEN = 'MN8ESAR-17QMKME-NGMZKRA-RV0SSK1';

  function proxy(url) {
    return WORKER_URL + '/?proxy=' + encodeURIComponent(url);
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

  function fetchJsonViaWorker(url) {
    return fetchText(proxyApi(url)).then(function(t) { return JSON.parse(t); });
  }

  function fetchHtml(url) {
    return fetchText(proxy(url));
  }

  /* ---- Kinopoisk ID ---- */

  function getKinopoiskId(movie) {
    if (movie.kinopoisk_id) return Promise.resolve(movie.kinopoisk_id);

    var tmdbId = movie.id;
    var imdbId = movie.imdb_id || (movie.external_ids && movie.external_ids.imdb_id);
    var query = tmdbId ? 'externalId.tmdb=' + tmdbId : imdbId ? 'externalId.imdb=' + imdbId : null;
    if (!query) return Promise.resolve(null);

    return fetchJsonViaWorker(KP_API_BASE + '?' + query + '&selectFields=id')
      .then(function(d) { return d.docs && d.docs[0] && d.docs[0].id || null; })
      .catch(function() { return null; });
  }

  /* ---- iframe.cloud player tabs ---- */

  function extractPlayersFromHtml(html) {
    var players = [], seen = {}, m;
    var re = /data-value="(https?:\/\/[^"]+)"[^>]*>([^<]*)/g;
    while ((m = re.exec(html)) !== null) {
      var url = m[1].replace(/&amp;/g, '&').trim();
      var title = m[2].replace(/&amp;/g, '&').trim();
      if (!seen[url]) { seen[url] = true; players.push({ url: url, title: title || 'Плеер' }); }
    }
    return players;
  }

  function isVeoveo(p) {
    var t = (p.title || '').toLowerCase();
    var u = (p.url || '').toLowerCase();
    return t.indexOf('veoveo') !== -1 || u.indexOf('veoveo') !== -1;
  }

  function isOrtified(url) {
    return url.indexOf('ortified.ws') !== -1;
  }

  /* ---- ortified.ws embed parsing ---- */

  function extractBraces(str, startIdx) {
    var depth = 0;
    var inString = false;
    var stringChar = '';
    var escaped = false;
    for (var i = startIdx; i < str.length; i++) {
      var ch = str[i];
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (inString) {
        if (ch === stringChar) inString = false;
        continue;
      }
      if (ch === '"' || ch === "'") { inString = true; stringChar = ch; continue; }
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) return str.substring(startIdx, i + 1);
      }
    }
    return null;
  }

  function parseOrtifiedEmbed(html) {
    var result = { type: 'unknown', seasons: [], hlsUrl: null };

    var mkMatch = html.match(/<script[^>]*data-name=["']mk["'][^>]*>([\s\S]*?)<\/script>/i);
    if (!mkMatch) {
      console.log('[iframe-cloud] No <script data-name="mk"> found');
      return result;
    }

    var mkScript = mkMatch[1];

    var makePlayerIdx = mkScript.indexOf('makePlayer(');
    if (makePlayerIdx === -1) {
      console.log('[iframe-cloud] No makePlayer() found');
      return result;
    }

    var objStart = mkScript.indexOf('{', makePlayerIdx);
    if (objStart === -1) return result;

    var objStr = extractBraces(mkScript, objStart);
    if (!objStr) {
      console.log('[iframe-cloud] Failed to extract makePlayer object');
      return result;
    }

    // Fix trailing commas before } or ]
    var fixed = objStr.replace(/,\s*([\]}])/g, '$1');

    try {
      var opts = JSON.parse(fixed);
      console.log('[iframe-cloud] makePlayer parsed OK, keys:', Object.keys(opts).join(', '));

      // Extract ec09db54317181 token for URL auth
      var tokenMatch = mkScript.match(/ec09db54317181\s*=\s*["']([^"']+)["']/);
      var ecToken = tokenMatch ? tokenMatch[1] : null;

      if (opts.playlist && opts.playlist.seasons) {
        result.type = 'series';
        result.seasons = opts.playlist.seasons;
        result.current = opts.playlist.current || null;
        result.ecToken = ecToken;
        console.log('[iframe-cloud] Seasons:', opts.playlist.seasons.length);
      } else if (opts.source) {
        result.type = 'movie';
        if (opts.source.hls) {
          result.hlsUrl = opts.source.hls + (ecToken ? '&' + ecToken : '');
        }
      }
    } catch (e) {
      console.log('[iframe-cloud] JSON parse error:', e.message);

      // Fallback: try to find hls URL directly
      var hlsRe = /"hls"\s*:\s*"(https?:\/\/[^"]+\.m3u8[^"]*)"/g;
      var hm;
      var urls = [];
      while ((hm = hlsRe.exec(objStr)) !== null) {
        urls.push(hm[1]);
      }
      if (urls.length > 0) {
        result.type = 'movie';
        result.hlsUrl = urls[0];
      }
    }

    return result;
  }

  /* ---- Lampa Player ---- */

  function playHls(url, title) {
    console.log('[iframe-cloud] Playing HLS:', url.substring(0, 80) + '...');
    Lampa.Player.play({
      url: url,
      title: title || PLUGIN_NAME,
      quality: true,
      subtitles: []
    });
    Lampa.Player.run();
  }

  /* ---- Episode/Season UI ---- */

  function showEpisodeSelector(seasons, title, current) {
    var items = [];

    // Sort seasons by number
    var sorted = seasons.slice().sort(function(a, b) {
      return (a.season || 0) - (b.season || 0);
    });

    for (var s = 0; s < sorted.length; s++) {
      var season = sorted[s];
      var seasonNum = season.season || (s + 1);
      var episodes = season.episodes || [];

      for (var e = 0; e < episodes.length; e++) {
        var ep = episodes[e];
        var epNum = ep.episode || (e + 1);
        var epTitle = ep.title || ('Эпизод ' + epNum);
        var hls = ep.hls || '';
        var duration = ep.duration ? Math.round(ep.duration / 60) + ' мин' : '';

        if (hls) {
          var isCurrent = current && current.season == seasonNum && current.episode == epNum;
          items.push({
            title: (isCurrent ? '► ' : '') + 'S' + seasonNum + 'E' + epNum + ' — ' + epTitle,
            subtitle: duration,
            _hls: hls,
            _epTitle: 'S' + seasonNum + 'E' + epNum + ' ' + epTitle,
            _season: seasonNum,
            _episode: epNum
          });
        }
      }
    }

    if (items.length === 0) {
      Lampa.Noty.show(PLUGIN_NAME + ': нет доступных эпизодов');
      return;
    }

    Lampa.Select.show({
      title: PLUGIN_NAME + ' — ' + title,
      items: items,
      onSelect: function(item) { playHls(item._hls, item._epTitle); }
    });
  }

  function showSeasonSelector(seasons, title, current) {
    var items = [];
    var sorted = seasons.slice().sort(function(a, b) {
      return (a.season || 0) - (b.season || 0);
    });

    for (var s = 0; s < sorted.length; s++) {
      var season = sorted[s];
      var seasonNum = season.season || (s + 1);
      var epCount = (season.episodes || []).length;

      items.push({
        title: 'Сезон ' + seasonNum,
        subtitle: epCount + ' эпизодов',
        _season: season,
        _seasonNum: seasonNum
      });
    }

    Lampa.Select.show({
      title: PLUGIN_NAME + ' — ' + title,
      items: items,
      onSelect: function(item) {
        var episodes = item._season.episodes || [];
        if (episodes.length === 1) {
          var ep = episodes[0];
          playHls(ep.hls, ep.title || 'S' + item._seasonNum + 'E1');
        } else {
          showEpisodeSelector([item._season], title, current);
        }
      }
    });
  }

  /* ---- Process embed page ---- */

  function processOrtifiedEmbed(html, movieTitle) {
    var data = parseOrtifiedEmbed(html);
    console.log('[iframe-cloud] Result:', data.type, 'seasons:', data.seasons.length, 'hls:', data.hlsUrl ? 'yes' : 'no');

    if (data.type === 'series' && data.seasons.length > 0) {
      Lampa.Noty.show(PLUGIN_NAME + ': сериал, ' + data.seasons.length + ' сезон(ов)');
      showSeasonSelector(data.seasons, movieTitle, data.current);
    } else if (data.hlsUrl) {
      Lampa.Noty.show(PLUGIN_NAME + ': видео найдено');
      playHls(data.hlsUrl, movieTitle);
    } else {
      Lampa.Noty.show(PLUGIN_NAME + ': не удалось извлечь видео');
    }
  }

  function processGenericEmbed(html, movieTitle) {
    var hlsRe = /https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/gi;
    var matches = html.match(hlsRe) || [];
    var unique = [];
    var seen = {};
    for (var i = 0; i < matches.length; i++) {
      var url = matches[i].replace(/\\u002F/g, '/').replace(/\\\//g, '/');
      if (!seen[url]) { seen[url] = true; unique.push(url); }
    }

    if (unique.length > 0) {
      Lampa.Noty.show(PLUGIN_NAME + ': видео найдено');
      if (unique.length === 1) {
        playHls(unique[0], movieTitle);
      } else {
        var items = unique.map(function(url, idx) {
          var q = url.match(/(\d{3,4}p)/i);
          return { title: q ? q[1] : 'Источник ' + (idx + 1), _hls: url };
        });
        Lampa.Select.show({
          title: PLUGIN_NAME + ' — ' + movieTitle,
          items: items,
          onSelect: function(item) { playHls(item._hls, movieTitle); }
        });
      }
    } else {
      Lampa.Noty.show(PLUGIN_NAME + ': видео не найдено');
    }
  }

  /* ---- Main flow ---- */

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

        return fetchHtml(IFRAME_CLOUD_BASE + targetId).then(function(html) {
          var players = extractPlayersFromHtml(html);
          players = players.filter(function(p) { return !isVeoveo(p); });

          if (players.length === 0) {
            Lampa.Noty.show(PLUGIN_NAME + ': плееры не найдены');
            return;
          }

          var items = players.map(function(p) {
            return { title: p.title, subtitle: p.url.substring(0, 50), _url: p.url };
          });

          Lampa.Select.show({
            title: PLUGIN_NAME + ' — ' + title,
            items: items,
            onSelect: function(item) {
              Lampa.Noty.show(PLUGIN_NAME + ': загрузка ' + item.title + '...');

              if (isOrtified(item._url)) {
                fetchHtml(item._url).then(function(embedHtml) {
                  processOrtifiedEmbed(embedHtml, title);
                }).catch(function(e) {
                  console.log('[iframe-cloud] ortified error:', e.message);
                  Lampa.Noty.show(PLUGIN_NAME + ': ошибка загрузки');
                });
              } else {
                // For other players: try to find m3u8 URLs, fallback to browser
                fetchHtml(item._url).then(function(embedHtml) {
                  processGenericEmbed(embedHtml, title);
                }).catch(function(e) {
                  console.log('[iframe-cloud] embed error:', e.message, '- opening in browser');
                  window.open(item._url, '_blank');
                  Lampa.Noty.show(PLUGIN_NAME + ': открыто в браузере');
                });
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

    var btn = $('<div class="full-start__button selector iframe-cloud-btn" data-subtitle="v5.4.0"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg><span>' + PLUGIN_NAME + '</span></div>');
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
      type: 'video', version: '5.4.0', name: PLUGIN_NAME, description: 'Native HLS playback via iframe.cloud', component: 'iframe_cloud',
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
