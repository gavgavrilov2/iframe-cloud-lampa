(function() {
  'use strict';

  console.log('[iframe-cloud] Loading v5.3.0');

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

  /* ---- ortified.ws embed parsing ---- */

  function tryExtractJsonFromScript(html) {
    var re = /<script[^>]*>([\s\S]*?)<\/script>/gi;
    var m;
    while ((m = re.exec(html)) !== null) {
      var src = m[1].trim();
      if (!src || src.length < 10) continue;

      // Look for JSON objects that contain video-related keys
      var jsonRe = /(?:var\s+\w+\s*=\s*|window\.\w+\s*=\s*|return\s+)(\{[\s\S]{50,}?\});/g;
      var jm;
      while ((jm = jsonRe.exec(src)) !== null) {
        try {
          var obj = JSON.parse(jm[1]);
          if (obj && (obj.seasons || obj.episodes || obj.hls || obj.src || obj.file)) {
            return obj;
          }
        } catch(e) {}
      }

      // Try to find standalone JSON blob
      var blobRe = /(\{"[^"]+":\s*\[[\s\S]*?\]\s*\})/g;
      var bm;
      while ((bm = blobRe.exec(src)) !== null) {
        try {
          var blob = JSON.parse(bm[1]);
          if (blob && (blob.seasons || blob.episodes)) return blob;
        } catch(e) {}
      }

      // Look for HLS URL assignment: file:"..." or src:"..."
      var fileRe = /(?:file|src|url)\s*[:=]\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)/gi;
      var fm;
      var hlsUrls = [];
      while ((fm = fileRe.exec(src)) !== null) {
        hlsUrls.push(fm[1]);
      }
      if (hlsUrls.length > 0) {
        return { hlsUrls: hlsUrls };
      }
    }
    return null;
  }

  function extractHlsFromHtml(html) {
    var re = /https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/gi;
    var matches = html.match(re) || [];
    var unique = [];
    var seen = {};
    for (var i = 0; i < matches.length; i++) {
      var url = matches[i].replace(/\\u002F/g, '/').replace(/\\\//g, '/');
      if (!seen[url]) { seen[url] = true; unique.push(url); }
    }
    return unique;
  }

  function parseAudioTracks(data) {
    if (!data || !data.audio) return null;
    var audio = data.audio;
    if (Array.isArray(audio)) return audio;
    if (audio.names && audio.order) {
      return audio.names.map(function(name, i) {
        return { name: name, index: audio.order[i] !== undefined ? audio.order[i] : i };
      });
    }
    return null;
  }

  function parseOrtifiedEmbed(html) {
    var result = {
      type: 'unknown',
      seasons: [],
      hlsUrls: [],
      audioTracks: null
    };

    // Strategy 1: Try to extract structured JSON from script tags
    var jsonData = tryExtractJsonFromScript(html);
    if (jsonData) {
      console.log('[iframe-cloud] Found JSON in script:', JSON.stringify(jsonData).substring(0, 200));

      if (jsonData.seasons && jsonData.seasons.length > 0) {
        result.type = 'series';
        result.seasons = jsonData.seasons;
        result.audioTracks = parseAudioTracks(jsonData);
      } else if (jsonData.episodes && jsonData.episodes.length > 0) {
        result.type = 'series';
        result.seasons = [{ episodes: jsonData.episodes }];
        result.audioTracks = parseAudioTracks(jsonData);
      } else if (jsonData.hlsUrls && jsonData.hlsUrls.length > 0) {
        result.type = 'movie';
        result.hlsUrls = jsonData.hlsUrls;
      } else if (jsonData.hls) {
        result.type = 'movie';
        result.hlsUrls = [jsonData.hls];
      } else if (jsonData.src || jsonData.file || jsonData.url) {
        result.type = 'movie';
        var url = jsonData.src || jsonData.file || jsonData.url;
        if (url.indexOf('.m3u8') !== -1) result.hlsUrls = [url];
      }
    }

    // Strategy 2: Direct m3u8 URL extraction from entire HTML
    if (result.hlsUrls.length === 0 && result.seasons.length === 0) {
      var directHls = extractHlsFromHtml(html);
      if (directHls.length > 0) {
        result.type = 'movie';
        result.hlsUrls = directHls;
        console.log('[iframe-cloud] Extracted', directHls.length, 'm3u8 URLs from HTML');
      }
    }

    // Strategy 3: Look for player config patterns in entire HTML
    if (result.hlsUrls.length === 0 && result.seasons.length === 0) {
      // common patterns: file:"...", sources:[{src:"..."}], playlist:[{url:"..."}]
      var patterns = [
        /(?:file|source)\s*[:=]\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)/gi,
        /"src"\s*:\s*"(https?:\/\/[^"]+\.m3u8[^"]*)"/gi,
        /"url"\s*:\s*"(https?:\/\/[^"]+\.m3u8[^"]*)"/gi
      ];
      var urls = [];
      for (var p = 0; p < patterns.length; p++) {
        var pm;
        while ((pm = patterns[p].exec(html)) !== null) {
          var u = pm[1].replace(/\\u002F/g, '/').replace(/\\\//g, '/');
          if (urls.indexOf(u) === -1) urls.push(u);
        }
      }
      if (urls.length > 0) {
        result.type = 'movie';
        result.hlsUrls = urls;
      }
    }

    return result;
  }

  /* ---- Lampa Player ---- */

  function playHls(url, title) {
    console.log('[iframe-cloud] Playing HLS:', url);
    Lampa.Player.play({
      url: url,
      title: title || PLUGIN_NAME,
      quality: true,
      subtitles: []
    });
    Lampa.Player.run();
  }

  /* ---- Episode/Season UI ---- */

  function showEpisodeSelector(seasons, title) {
    var items = [];

    for (var s = 0; s < seasons.length; s++) {
      var season = seasons[s];
      var seasonNum = season.number || season.season || (s + 1);
      var episodes = season.episodes || [];

      for (var e = 0; e < episodes.length; e++) {
        var ep = episodes[e];
        var epNum = ep.number || ep.episode || (e + 1);
        var epTitle = ep.title || ep.name || ('Эпизод ' + epNum);
        var hls = ep.hls || ep.file || ep.src || '';

        if (hls) {
          items.push({
            title: 'S' + seasonNum + 'E' + epNum + ' — ' + epTitle,
            subtitle: ep.duration ? Math.round(ep.duration / 60) + ' мин' : '',
            _hls: hls,
            _epTitle: epTitle
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
      onSelect: function(item) {
        playHls(item._hls, item._epTitle);
      }
    });
  }

  /* ---- HLS quality selector (multiple sources) ---- */

  function showQualitySelector(urls, title) {
    if (urls.length === 1) {
      playHls(urls[0], title);
      return;
    }

    var items = urls.map(function(url, i) {
      // Try to extract quality label from URL
      var quality = '';
      var qMatch = url.match(/(\d{3,4}p)/i);
      if (qMatch) quality = qMatch[1];
      else quality = 'Источник ' + (i + 1);

      return { title: quality, subtitle: url.substring(0, 60) + '...', _hls: url };
    });

    Lampa.Select.show({
      title: PLUGIN_NAME + ' — ' + title,
      items: items,
      onSelect: function(item) { playHls(item._hls, title); }
    });
  }

  /* ---- Main flow ---- */

  function processEmbedPage(html, movieTitle) {
    var data = parseOrtifiedEmbed(html);

    console.log('[iframe-cloud] Parsed embed:', data.type, 'hls:', data.hlsUrls.length, 'seasons:', data.seasons.length);

    if (data.type === 'series' && data.seasons.length > 0) {
      Lampa.Noty.show(PLUGIN_NAME + ': сериал, ' + data.seasons.length + ' сезон(ов)');
      showEpisodeSelector(data.seasons, movieTitle);
    } else if (data.hlsUrls.length > 0) {
      Lampa.Noty.show(PLUGIN_NAME + ': видео найдено');
      showQualitySelector(data.hlsUrls, movieTitle);
    } else {
      Lampa.Noty.show(PLUGIN_NAME + ': не удалось извлечь видео');
    }
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

        var cloudUrl = IFRAME_CLOUD_BASE + targetId;

        return fetchHtml(cloudUrl).then(function(html) {
          var players = extractPlayersFromHtml(html);
          players = players.filter(function(p) { return !isVeoveo(p); });

          if (players.length === 0) {
            Lampa.Noty.show(PLUGIN_NAME + ': плееры не найдены');
            return;
          }

          // Show player selection
          var items = players.map(function(p) {
            return { title: p.title, subtitle: 'iframe.cloud', _url: p.url };
          });

          Lampa.Select.show({
            title: PLUGIN_NAME + ' — ' + title,
            items: items,
            onSelect: function(item) {
              Lampa.Noty.show(PLUGIN_NAME + ': загрузка ' + item.title + '...');

              // Fetch embed page and parse for HLS
              fetchHtml(item._url).then(function(embedHtml) {
                processEmbedPage(embedHtml, title);
              }).catch(function(e) {
                console.log('[iframe-cloud] Embed fetch error:', e.message);
                Lampa.Noty.show(PLUGIN_NAME + ': ошибка загрузки плеера');
              });
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

    var btn = $('<div class="full-start__button selector iframe-cloud-btn" data-subtitle="v5.3.0"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg><span>' + PLUGIN_NAME + '</span></div>');
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
      type: 'video', version: '5.3.0', name: PLUGIN_NAME, description: 'Native HLS playback via iframe.cloud', component: 'iframe_cloud',
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
