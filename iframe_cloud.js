(function() {
  'use strict';

  console.log('[MovieZone] Loading v5.50.0');

  var PLUGIN_NAME = 'MovieZone';
  var WORKER_URL = 'https://silent-recipe-5c08.rustypony.workers.dev';
  var VERCEL_PROXY_URL = 'https://iframe-cloud-proxy.vercel.app/api/proxy';
  var IFRAME_CLOUD_BASE = 'https://iframe.cloud/iframe/';
  var KP_API_BASE = 'https://api.kinopoisk.dev/v1.4/movie';
  var KP_API_TOKEN = 'WYVHF8M-XKBM92B-JD2ZQ8R-EPZ37AQ';
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

    return fetchJson(proxyKpu(url))
      .then(function(data) {
        var films = data.films || [];
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
            var fId = f.filmId || f.kinopoiskId || f.id;
            return fId;
          }
        }
      }

      if (candidates.length) {
        var best = candidates.sort(function(a, b) {
          return parseFloat(b.rating || 0) - parseFloat(a.rating || 0);
        })[0];
        var bestId = best.filmId || best.kinopoiskId || best.id;
        return bestId;
      }

      return null;
    });
  }

  function getKinopoiskId(movie) {
    if (movie.kinopoisk_id) return Promise.resolve(movie.kinopoisk_id);

    var imdbId = movie.imdb_id || (movie.external_ids && movie.external_ids.imdb_id);
    if (imdbId) {
      return fetchJsonViaProxy(KP_API_BASE + '?externalId.imdb=' + imdbId + '&selectFields=id,name&token=' + KP_API_TOKEN)
        .then(function(d) {
          if (d.docs && d.docs.length) {
            var best = d.docs.find(function(m) { return m.name; }) || d.docs[0];
            return best && best.id || null;
          }
          return searchKinopoiskByName(movie);
        })
        .catch(function() {
          return searchKinopoiskByName(movie);
        });
    }

    return searchKinopoiskByName(movie).then(function(kpId) {
      if (kpId) return kpId;

      var tmdbId = movie.id;
      var query = tmdbId ? 'externalId.tmdb=' + tmdbId : null;
      if (!query) return null;

      return fetchJsonViaProxy(KP_API_BASE + '?' + query + '&selectFields=id,name&token=' + KP_API_TOKEN)
        .then(function(d) {
          if (!d.docs || !d.docs.length) return null;
          var best = d.docs.find(function(m) { return m.name; }) || d.docs[0];
          return best && best.id || null;
        })
        .catch(function() { return null; });
    });
  }

  /* ---- iframe.cloud players API ---- */

  function getPlayers(kpId, tmdbId) {
    var url = IFRAME_CLOUD_API + '?action=players&kp_id=' + kpId + '&type=movie';
    if (tmdbId) url += '&id=' + tmdbId;
    return fetchJsonViaProxy(url)
      .then(function(data) {
        var players = data.players || [];
        return players;
      });
  }

  function getPlayersWithRetry(kpId, tmdbId, attempt) {
    attempt = attempt || 0;
    return getPlayers(kpId, tmdbId).then(function(players) {
      if (players.length === 0 && attempt < 3) {
        return new Promise(function(resolve) {
          setTimeout(function() {
            resolve(getPlayersWithRetry(kpId, tmdbId, attempt + 1));
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

  function isAllohaOrTurbo(p) {
    var s = (p.source || '').toLowerCase();
    return s.indexOf('alloha') !== -1 || s.indexOf('turbo') !== -1;
  }

  /* ---- Timeline: save/restore playback position via Lampa.Timeline ---- */

  function getTimelineHash(movie, label) {
    var base = movie.original_title || movie.title || movie.name || '';
    if (label) return Lampa.Utils.hash(label + base);
    return Lampa.Utils.hash(base);
  }

  function getBeholdHash(movie, label) {
    var base = movie.original_title || movie.title || movie.name || '';
    return Lampa.Utils.hash((label || '') + base + '_viewed');
  }

  function getViewed() {
    return Lampa.Storage.cache('online_view', 5000, []);
  }

  function markViewed(hash) {
    var viewed = getViewed();
    if (viewed.indexOf(hash) === -1) {
      viewed.push(hash);
      Lampa.Storage.set('online_view', viewed);
    }
  }

  function clearTimeline(movie, label) {
    var hash = getTimelineHash(movie, label);
    var timeline = Lampa.Timeline.view(hash);
    timeline.percent = 0;
    timeline.time = 0;
    timeline.duration = 0;
    Lampa.Timeline.update(timeline);
    Lampa.Noty.show(PLUGIN_NAME + ': \u043f\u0440\u043e\u0433\u0440\u0435\u0441\u0441 \u0441\u0431\u0440\u043e\u0448\u0435\u043d');
  }

  /* ---- HLS proxy: pass m3u8 through Vercel, proxy rewrites all URLs ---- */

  function parseM3u8AudioNames(m3u8Text) {
    if (!m3u8Text) return [];
    var lines = m3u8Text.split('\n');
    var tracks = [];
    var langCount = {};
    var seenNames = {};
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (line.indexOf('#EXT-X-MEDIA:') === -1) continue;
      if (line.indexOf('TYPE=AUDIO') === -1) continue;

      var nameMatch = line.match(/NAME="([^"]+)"/);
      var langMatch = line.match(/LANGUAGE="([^"]+)"/);
      var name = nameMatch ? nameMatch[1] : '';
      var lang = langMatch ? langMatch[1] : '';

      if (seenNames[name]) continue;
      seenNames[name] = true;

      var humanName = name;

      if (lang && (/^(rus\d*|ru)$/i.test(name) || /^(rus\d*|ru)$/i.test(lang))) {
        langCount['ru'] = (langCount['ru'] || 0) + 1;
        humanName = langCount['ru'] === 1 ? '\u0420\u0443\u0441. \u0434\u0443\u0431\u043b\u044f\u0436' : '\u0420\u0443\u0441. \u0434\u0443\u0431\u043b\u044f\u0436 ' + langCount['ru'];
      } else if (lang && (/^(eng\d*|en)$/i.test(name) || /^(eng\d*|en)$/i.test(lang))) {
        langCount['en'] = (langCount['en'] || 0) + 1;
        humanName = langCount['en'] === 1 ? 'English (Original)' : 'English ' + langCount['en'];
      } else if (lang && (/^(ukr\d*|uk)$/i.test(name) || /^(ukr\d*|uk)$/i.test(lang))) {
        langCount['uk'] = (langCount['uk'] || 0) + 1;
        humanName = langCount['uk'] === 1 ? '\u0423\u043a\u0440. \u0434\u0443\u0431\u043b\u044f\u0436' : '\u0423\u043a\u0440. \u0434\u0443\u0431\u043b\u044f\u0436 ' + langCount['uk'];
      }

      tracks.push({ name: humanName, originalName: name, lang: lang });
    }
    return tracks;
  }

  function playHlsProxied(hlsUrl, title, movie, label, externalAudioNames) {
    var proxyUrl = VERCEL_PROXY_URL + '?url=' + encodeURIComponent(hlsUrl);

    function startPlay(audioNames) {
      var video = {
        url: proxyUrl,
        title: title || PLUGIN_NAME,
        subtitles: [],
        translate: audioNames && audioNames.length ? {
          tracks: audioNames.map(function(t) {
            return { language: t.name || t, label: '', extra: {} };
          })
        } : undefined
      };

      if (movie && (movie.id || movie.original_title || movie.title)) {
        var hash = getTimelineHash(movie, label);
        var timeline = Lampa.Timeline.view(hash);
        video.timeline = timeline;

        var beholdHash = getBeholdHash(movie, label);
        markViewed(beholdHash);

        window._iframe_cloud_current = {
          timeline: timeline,
          beholdHash: beholdHash,
          movie: movie,
          label: label
        };

        addToHistory(movie);

        Lampa.Player.play(video);
        Lampa.Player.playlist([video]);

        setTimeout(function() {
          var el = document.querySelector('video');
          if (!el) return;

          var lastSave = 0;
          var savePos = function() {
            var now = Date.now();
            if (now - lastSave < 3000) return;
            if (!el.duration || el.duration < 10) return;
            lastSave = now;
            timeline.time = Math.round(el.currentTime);
            timeline.duration = Math.round(el.duration);
            timeline.percent = Math.min(100, Math.round((el.currentTime / el.duration) * 100));
            Lampa.Timeline.update(timeline);
          };

          el.addEventListener('timeupdate', savePos);
          el.addEventListener('pause', savePos);
          el.addEventListener('ended', savePos);

          var doRestore = function() {
            if (timeline.time > 10 && el.duration && el.duration > timeline.time) {
              el.currentTime = timeline.time;
              Lampa.Noty.show(PLUGIN_NAME + ': \u043f\u043e\u0437\u0438\u0446\u0438\u044f \u0432\u043e\u0441\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d\u0430 \u0441 ' + Math.floor(timeline.time / 60) + ':' + String(Math.floor(timeline.time % 60)).padStart(2, '0'));
            }
          };

          if (el.readyState >= 1) doRestore();
          else el.addEventListener('loadedmetadata', doRestore);
        }, 1500);
      } else {
        Lampa.Player.play(video);
        Lampa.Player.playlist([video]);
      }
    }

    if (externalAudioNames && externalAudioNames.length) {
      startPlay(externalAudioNames.map(function(n) { return { name: n }; }));
      return;
    }

    fetchText(proxyUrl).then(function(m3u8Text) {
      var tracks = parseM3u8AudioNames(m3u8Text);
      startPlay(tracks);
    }).catch(function(e) {
      startPlay([]);
    });
  }

  /* ---- ortified embed parsing ---- */

  function extractArray(str, startIdx) {
    var depth = 0, inStr = false, ch = '', esc = false;
    for (var i = startIdx; i < str.length; i++) {
      ch = str[i];
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (inStr) { if (ch === '"') inStr = false; continue; }
      if (ch === '"') { inStr = true; continue; }
      if (ch === '[') depth++;
      else if (ch === ']') { depth--; if (depth === 0) return str.substring(startIdx, i + 1); }
    }
    return null;
  }

  function extractObject(str, startIdx) {
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
    var result = { seasons: [], hlsUrl: null, current: null, audioNames: [] };

    var mkMatch = html.match(/<script[^>]*data-name=["']mk["'][^>]*>([\s\S]*?)<\/script>/i);
    if (!mkMatch) {
      var audioMatch = html.match(/"names"\s*:\s*\[([^\]]+)\]/);
      if (audioMatch) {
        try {
          result.audioNames = JSON.parse('[' + audioMatch[1] + ']').filter(function(n) { return n && n !== 'delete'; });
        } catch(e) {}
      }
      return result;
    }

    var mkScript = mkMatch[1];

    var seasonsIdx = mkScript.indexOf('"seasons":[');
    if (seasonsIdx === -1) seasonsIdx = mkScript.indexOf('seasons:[');
    if (seasonsIdx === -1) seasonsIdx = mkScript.indexOf('seasons: [');

    if (seasonsIdx !== -1) {
      var arrStart = mkScript.indexOf('[', seasonsIdx);
      var arrStr = extractArray(mkScript, arrStart);
      if (arrStr) {
        try {
          result.seasons = JSON.parse(arrStr);
        } catch (e) {
        }
      }
    }

    var currentIdx = mkScript.indexOf('"current":{');
    if (currentIdx === -1) currentIdx = mkScript.indexOf('current:{');
    if (currentIdx === -1) currentIdx = mkScript.indexOf('current: {');
    if (currentIdx !== -1) {
      var objStart = mkScript.indexOf('{', currentIdx);
      var objStr = extractObject(mkScript, objStart);
      if (objStr) {
        var fixed = objStr.replace(/"(\w+)"\s*:/g, '"$1":').replace(/'(\w+)'\s*:/g, '"$1":').replace(/,\s*([}\]])/g, '$1');
        try { result.current = JSON.parse(fixed); } catch (e) {}
      }
    }

    if (!result.seasons.length) {
      var hlsMatch = mkScript.match(/"hls"\s*:\s*"([^"]+)"/);
      if (!hlsMatch) hlsMatch = mkScript.match(/hls\s*:\s*"([^"]+)"/);
      if (hlsMatch) {
        result.hlsUrl = hlsMatch[1];
      }
    }

    var audioMatch = mkScript.match(/"names"\s*:\s*\[([^\]]+)\]/);
    if (audioMatch && !result.audioNames.length) {
      try {
        result.audioNames = JSON.parse('[' + audioMatch[1] + ']').filter(function(n) { return n && n !== 'delete'; });
      } catch(e) {}
    }

    return result;
  }

  /* ---- Episode/Season UI with proxied HLS ---- */

  function showEpisodeSelector(seasons, title, current, movie) {
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
        var dur = ep.duration ? Math.round(ep.duration / 60) + ' \u043c\u0438\u043d' : '';
        var isCur = current && current.season == sNum && current.episode == eNum;
        var epLabel = 'S' + sNum + 'E' + eNum;

        if (hls) {
          var subtitle = dur;
          try {
            var eHash = getTimelineHash(movie, epLabel);
            var eTl = Lampa.Timeline.view(eHash);
            if (eTl && eTl.time > 0 && eTl.duration > 0) {
              var mins = Math.floor(eTl.time / 60);
              var secs = String(Math.floor(eTl.time % 60)).padStart(2, '0');
              subtitle = (subtitle ? subtitle + ' | ' : '') + '\u25b6 ' + mins + ':' + secs + ' / ' + Math.round(eTl.duration / 60) + ' \u043c\u0438\u043d';
            }
            var bHash = getBeholdHash(movie, epLabel);
            if (getViewed().indexOf(bHash) !== -1) {
              subtitle = '\u2714 ' + subtitle;
            }
          } catch (e) {}

          items.push({
            title: (isCur ? '\u25b6 ' : '') + epLabel,
            subtitle: subtitle,
            _hls: hls,
            _label: epLabel
          });
        }
      }
    }

    if (!items.length) { Lampa.Noty.show(PLUGIN_NAME + ': \u043d\u0435\u0442 \u044d\u043f\u0438\u0437\u043e\u0434\u043e\u0432'); return; }

    Lampa.Select.show({
      title: PLUGIN_NAME + ' \u2014 ' + title,
      items: items,
      onSelect: function(item) { playHlsProxied(item._hls, item._label + ' ' + title, movie, item._label); }
    });
  }

  function showSeasonSelector(seasons, title, current, movie) {
    var items = [];
    var sorted = seasons.slice().sort(function(a, b) { return (a.season || 0) - (b.season || 0); });

    for (var s = 0; s < sorted.length; s++) {
      var season = sorted[s];
      var sNum = season.season || (s + 1);
      items.push({
        title: '\u0421\u0435\u0437\u043e\u043d ' + sNum,
        subtitle: (season.episodes || []).length + ' \u044d\u043f\u0438\u0437\u043e\u0434\u043e\u0432',
        _season: season, _sNum: sNum
      });
    }

    Lampa.Select.show({
      title: PLUGIN_NAME + ' \u2014 ' + title,
      items: items,
      onSelect: function(item) {
        var eps = item._season.episodes || [];
        var epLabel = 'S' + item._sNum + 'E1';
        if (eps.length === 1 && eps[0].hls) {
          playHlsProxied(eps[0].hls, epLabel + ' ' + title, movie, epLabel);
        } else {
          showEpisodeSelector([item._season], title, current, movie);
        }
      }
    });
  }

  /* ---- FanFilm4K search ---- */

  function searchAndPlayFanfilm(movie) {
    var title = movie.title || movie.original_title || movie.name || '';
    var year = getYear(movie);
    var query = title;

    Lampa.Noty.show(PLUGIN_NAME + ': ' + title);

    fetchJson(WORKER_URL + '/?fanfilm_search=' + encodeURIComponent(query)).then(function(data) {
      var results = data.results || [];

      if (!results.length) {
        Lampa.Noty.show(PLUGIN_NAME + ': ничего не найдено');
        return;
      }

      var best = results[0];

      if (year) {
        for (var i = 0; i < results.length; i++) {
          if (results[i].url.indexOf(String(year)) !== -1) {
            best = results[i];
            break;
          }
        }
      }


      fetchJson(WORKER_URL + '/?fanfilm_page=' + encodeURIComponent(best.url)).then(function(pageData) {

        if (pageData.iframeUrl) {
          var proxiedUrl = WORKER_URL + '/?stravers=' + encodeURIComponent(pageData.iframeUrl);
          Lampa.Noty.show(PLUGIN_NAME + ': ' + (pageData.title || title) + ' (' + (pageData.quality || '?') + ')');

          addToHistory(movie);

          var play = {
            url: proxiedUrl,
            title: PLUGIN_NAME + ' FanFilm ' + (pageData.quality || '') + ' — ' + (pageData.title || title),
            subtitles: []
          };

          var hash = getTimelineHash(movie, 'FanFilm');
          var timeline = Lampa.Timeline.view(hash);
          play.timeline = timeline;

          var beholdHash = getBeholdHash(movie, 'FanFilm');
          markViewed(beholdHash);

          window._iframe_cloud_current = {
            timeline: timeline,
            beholdHash: beholdHash,
            movie: movie,
            label: 'FanFilm'
          };

          showIframePlayer(proxiedUrl, 'FanFilm ' + (pageData.quality || ''), function() {});
        } else {
          Lampa.Noty.show(PLUGIN_NAME + ': iframe не найден');
        }
      }).catch(function(e) {
        console.log('[iframe-cloud] FanFilm page error:', e.message);
        Lampa.Noty.show(PLUGIN_NAME + ': ошибка загрузки страницы');
      });

    }).catch(function(e) {
      console.log('[iframe-cloud] FanFilm search error:', e.message);
      Lampa.Noty.show(PLUGIN_NAME + ': ошибка поиска');
    });
  }

  /* ---- VK Video search ---- */

  function searchAndPlayVk(movie) {
    var title = movie.title || movie.original_title || movie.name || '';
    var year = getYear(movie);
    var query = title + (year ? ' ' + year : '');

    Lampa.Noty.show(PLUGIN_NAME + ': ' + title);

    fetchJson(WORKER_URL + '/?vksearch=' + encodeURIComponent(query) + '&year=' + (year || '')).then(function(data) {
      var videos = data.videos || [];

      if (!videos.length) {
        Lampa.Noty.show(PLUGIN_NAME + ': ничего не найдено');
        return;
      }

      var best = videos[0];

      var titleTime = '';
      if (best.duration > 0) {
        var h = Math.floor(best.duration / 3600);
        var m = Math.floor((best.duration % 3600) / 60);
        titleTime = h > 0 ? h + 'ч ' + m + 'мин' : m + ' мин';
      }

      var infoUrl = WORKER_URL + '/?oid=' + best.owner_id + '&vid=' + best.video_id;

      fetchJson(infoUrl).then(function(info) {
        var mp4Qualities = Object.keys(info.mp4 || {}).map(function(q) { return parseInt(q); }).sort(function(a, b) { return b - a; });
        var bestQuality = mp4Qualities.length ? mp4Qualities[0] : 720;


        Lampa.Noty.show(PLUGIN_NAME + ': ' + best.title + ' (' + bestQuality + 'p, ' + titleTime + ')');

        var qualityLabel = mp4Qualities.length > 1 ? mp4Qualities[mp4Qualities.length - 1] + 'p-' + mp4Qualities[0] + 'p' : bestQuality + 'p';

        var play = {
          url: WORKER_URL + '/?oid=' + best.owner_id + '&vid=' + best.video_id + '&stream=1&qual=mp4_' + bestQuality,
          title: PLUGIN_NAME + ' ' + qualityLabel + ' — ' + best.title,
          subtitles: []
        };

        if (mp4Qualities.length > 1 || info.hls) {
          play.quality = {};
          var qualityLabels = { 2160: '4K', 1440: '2K', 1080: '1080p', 720: '720p', 480: '480p', 360: '360p', 240: '240p' };
          for (var i = 0; i < mp4Qualities.length; i++) {
            var qLabel = qualityLabels[mp4Qualities[i]] || mp4Qualities[i] + 'p';
            play.quality[qLabel] = WORKER_URL + '/?oid=' + best.owner_id + '&vid=' + best.video_id + '&stream=1&qual=mp4_' + mp4Qualities[i];
          }

        }

        var hash = getTimelineHash(movie, 'VK');
        var timeline = Lampa.Timeline.view(hash);
        play.timeline = timeline;

        var beholdHash = getBeholdHash(movie, 'VK');
        markViewed(beholdHash);

        window._iframe_cloud_current = {
          timeline: timeline,
          beholdHash: beholdHash,
          movie: movie,
          label: 'VK'
        };

        addToHistory(movie);

        Lampa.Player.play(play);
        Lampa.Player.playlist([play]);

        setTimeout(function() {
          var el = document.querySelector('video');
          if (!el) return;

          var lastSave = 0;
          var savePos = function() {
            var now = Date.now();
            if (now - lastSave < 3000) return;
            if (!el.duration || el.duration < 10) return;
            lastSave = now;
            timeline.time = Math.round(el.currentTime);
            timeline.duration = Math.round(el.duration);
            timeline.percent = Math.min(100, Math.round((el.currentTime / el.duration) * 100));
            Lampa.Timeline.update(timeline);
          };

          el.addEventListener('timeupdate', savePos);
          el.addEventListener('pause', savePos);
          el.addEventListener('ended', savePos);

          var doRestore = function() {
            if (timeline.time > 10 && el.duration && el.duration > timeline.time) {
              el.currentTime = timeline.time;
              Lampa.Noty.show(PLUGIN_NAME + ': позиция восстановлена с ' + Math.floor(timeline.time / 60) + ':' + String(Math.floor(timeline.time % 60)).padStart(2, '0'));
            }
          };

          if (el.readyState >= 1) doRestore();
          else el.addEventListener('loadedmetadata', doRestore);
        }, 1500);

      }).catch(function(e) {
        console.log('[iframe-cloud] VK info error:', e.message);
        Lampa.Noty.show(PLUGIN_NAME + ': VK ошибка — ' + e.message);
      });

    }).catch(function(e) {
      console.log('[iframe-cloud] VK search error:', e.message);
      Lampa.Noty.show(PLUGIN_NAME + ': VK ошибка — ' + e.message);
    });
  }

  /* ---- Kinogo/cinemar.cc: search → multi-audio m3u8 → native player ---- */

  function parseSubtitles(str) {
    if (!str || typeof str !== 'string') return [];
    return str.split(',').map(function(s, i) {
      var m = s.match(/^\[(\w+)\](.+)$/);
      return {
        index: i,
        label: m ? m[1] : 'Sub ' + (i + 1),
        language: m ? m[1] : '',
        url: m ? m[2].trim() : s.trim(),
        mode: 'disabled',
        selected: false
      };
    });
  }

  function searchAndPlayKinogo(movie) {
    var title = movie.title || movie.original_title || movie.name || '';
    var year = getYear(movie);

    Lampa.Noty.show(PLUGIN_NAME + ': поиск ' + title + '...');

    fetchJson(WORKER_URL + '/?kinogo_search=' + encodeURIComponent(title)).then(function(data) {
      var results = data.results || [];

      if (!results.length) {
        Lampa.Noty.show(PLUGIN_NAME + ': Kinogo — ничего не найдено');
        return;
      }

      var best = null;
      for (var i = 0; i < results.length; i++) {
        if (year && results[i].year && Math.abs(parseInt(results[i].year) - parseInt(year)) <= 1) {
          best = results[i];
          break;
        }
      }
      if (!best) best = results[0];


      Lampa.Noty.show(PLUGIN_NAME + ': ' + best.title + ' (' + (best.year || '?') + ')');

      fetchJson(WORKER_URL + '/?kinogo_page=' + encodeURIComponent(best.url)).then(function(pageData) {
        if (pageData.embedUrl) {
          var embedUrl = pageData.embedUrl;
          if (embedUrl.indexOf('//') === 0) embedUrl = 'https:' + embedUrl;

          if (pageData.hasCinemar && !pageData.isOrtified) {
            playKinogoEmbed(embedUrl, best, movie);
          } else if (pageData.isOrtified) {
            playOrtified(embedUrl, 'Kinogo \u2014 ' + (best.title || ''), best.title, function() {
              Lampa.Noty.show(PLUGIN_NAME + ': Kinogo \u2014 \u0432\u0438\u0434\u0435\u043e \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u043e');
            }, movie);
          } else {
            playKinogoEmbed(embedUrl, best, movie);
          }
        } else {
          Lampa.Noty.show(PLUGIN_NAME + ': Kinogo \u2014 \u043f\u043b\u0435\u0435\u0440 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d');
        }
      }).catch(function(e) {
        console.log('[iframe-cloud] Kinogo page error:', e.message);
        Lampa.Noty.show(PLUGIN_NAME + ': Kinogo — ' + e.message);
      });

    }).catch(function(e) {
      console.log('[iframe-cloud] Kinogo search error:', e.message);
      Lampa.Noty.show(PLUGIN_NAME + ': Kinogo — ' + e.message);
    });
  }

  function playKinogoEmbed(embedUrl, result, movie) {
    var multiUrl = WORKER_URL + '/kinogo/' + encodeURIComponent(embedUrl) + '/master.m3u8';


    var infoUrl = WORKER_URL + '/?kinogo_info=' + encodeURIComponent(embedUrl);

    fetchJson(infoUrl).then(function(info) {

      var tracks = (info.tracks || []).map(function(t) {
        return { language: t.name, label: '', extra: {} };
      });

      var videoUrl = info.m3u8 ? (WORKER_URL + info.m3u8) : (info.directM3u8 || multiUrl);

      var play = {
        url: videoUrl,
        title: PLUGIN_NAME + ' Kinogo — ' + (result.title || '') + ' (' + (result.year || '') + ')',
        subtitles: [],
        translate: tracks.length ? { tracks: tracks } : undefined
      };

      var firstSubs = (info.tracks && info.tracks[0] && info.tracks[0].subtitles) || '';
      if (firstSubs) {
        play.subtitles = parseSubtitles(firstSubs);
      }

      var hash = getTimelineHash(movie, 'Kinogo');
      var timeline = Lampa.Timeline.view(hash);
      play.timeline = timeline;

      var beholdHash = getBeholdHash(movie, 'Kinogo');
      markViewed(beholdHash);

      window._iframe_cloud_current = {
        timeline: timeline,
        beholdHash: beholdHash,
        movie: movie,
        label: 'Kinogo'
      };

      addToHistory(movie);

      Lampa.Player.play(play);
      Lampa.Player.playlist([play]);

      setTimeout(function() {
        var el = document.querySelector('video');
        if (!el) return;

        var lastSave = 0;
        var savePos = function() {
          var now = Date.now();
          if (now - lastSave < 3000) return;
          if (!el.duration || el.duration < 10) return;
          lastSave = now;
          timeline.time = Math.round(el.currentTime);
          timeline.duration = Math.round(el.duration);
          timeline.percent = Math.min(100, Math.round((el.currentTime / el.duration) * 100));
          Lampa.Timeline.update(timeline);
        };

        el.addEventListener('timeupdate', savePos);
        el.addEventListener('pause', savePos);
        el.addEventListener('ended', savePos);

        var doRestore = function() {
          if (timeline.time > 10 && el.duration && el.duration > timeline.time) {
            el.currentTime = timeline.time;
            Lampa.Noty.show(PLUGIN_NAME + ': позиция восстановлена с ' + Math.floor(timeline.time / 60) + ':' + String(Math.floor(timeline.time % 60)).padStart(2, '0'));
          }
        };

        if (el.readyState >= 1) doRestore();
        else el.addEventListener('loadedmetadata', doRestore);
      }, 1500);

    }).catch(function(e) {
      console.log('[iframe-cloud] Kinogo info error:', e.message);
      Lampa.Noty.show(PLUGIN_NAME + ': Kinogo — ' + e.message);
    });
  }

  /* ---- iframe fallback (for non-ortified players or failures) ---- */

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
  }

  /* ---- Process ortified embed ---- */

  function fetchTextViaVercel(targetUrl) {
    return fetchText(VERCEL_PROXY_URL + '?url=' + encodeURIComponent(targetUrl));
  }

  function fetchOrtifiedViaProxies(url) {
    return fetchTextViaVercel(url)
      .catch(function(e) {
        return fetchText(proxy(url));
      });
  }

  function playOrtified(url, playerLabel, movieTitle, onFailure, movie) {
    Lampa.Noty.show(PLUGIN_NAME + ': \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0430 ' + playerLabel + '...');

    fetchOrtifiedViaProxies(url).then(function(html) {
      var data = parseOrtifiedEmbed(html);

      if (data.seasons.length > 0) {
        Lampa.Noty.show(PLUGIN_NAME + ': \u0441\u0435\u0440\u0438\u0430\u043b, ' + data.seasons.length + ' \u0441\u0435\u0437\u043e\u043d(\u043e\u0432)');
        showSeasonSelector(data.seasons, movieTitle, data.current, movie);
      } else if (data.hlsUrl) {
        playHlsProxied(data.hlsUrl, movieTitle, movie, null, data.audioNames);
      } else {
        Lampa.Noty.show(PLUGIN_NAME + ': \u0432\u0438\u0434\u0435\u043e \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u043e, \u043e\u0442\u043a\u0440\u044b\u0432\u0430\u0435\u043c iframe...');
        showIframePlayer(url, playerLabel, onFailure);
      }
    }).catch(function(e) {
      console.log('[iframe-cloud] ortified failed:', e.message, '- trying iframe');
      showIframePlayer(url, playerLabel, function() {
        if (onFailure) onFailure();
      });
    });
  }

  /* ---- Collaps Direct API: DASH 1080p ---- */

  function playCollapsDirect(kpId, title, movie) {
    return new Promise(function(resolve, reject) {
      fetchJson(WORKER_URL + '/?collaps_direct=' + kpId).then(function(data) {
        if (data.error) {
          reject(new Error(data.error));
          return;
        }

        var isTv = data.type === 'serial';
        var audioNames = (data.audio && data.audio.names) || [];
        var subtitles = (data.cc || []).map(function(c) {
          return { label: c.name, url: c.url };
        }).filter(function(s) { return s.url; });

        if (isTv && data.seasons && data.seasons.length) {
          var allEpisodes = [];
          data.seasons.forEach(function(season) {
            (season.episodes || []).forEach(function(ep) {
              allEpisodes.push({
                season: season.season,
                episode: ep.episode,
                title: ep.title || ('S' + season.season + 'E' + ep.episode),
                url: ep.dash || ep.hls,
                quality: ep.dash ? '1080p DASH' : '720p HLS',
                audio: ep.audio && ep.audio.length ? ep.audio : audioNames
              });
            });
          });

          showCollapsEpisodeSelector(allEpisodes, title, movie, audioNames, subtitles);
          resolve();
          return;
        }

        var streamUrl = data.dash || data.hls;
        if (!streamUrl) {
          reject(new Error('No stream URL'));
          return;
        }

        var qualityLabel = data.dash ? '1080p DASH' : '720p HLS';
        playCollapsStream(streamUrl, qualityLabel, title, movie, audioNames, subtitles);
        resolve();

      }).catch(function(e) {
        reject(e);
      });
    });
  }

  function playCollapsStream(url, qualityLabel, title, movie, audioNames, subtitles) {
    var label = 'Collaps ' + qualityLabel;

    var video = {
      url: url,
      title: PLUGIN_NAME + ' ' + label + ' — ' + title,
      subtitles: subtitles.length ? subtitles : [],
      translate: audioNames.length ? {
        tracks: audioNames.map(function(n) { return { language: n, label: '', extra: {} }; })
      } : undefined
    };

    if (movie && (movie.id || movie.original_title || movie.title)) {
      var hash = getTimelineHash(movie, 'Collaps');
      var timeline = Lampa.Timeline.view(hash);
      video.timeline = timeline;

      var beholdHash = getBeholdHash(movie, 'Collaps');
      markViewed(beholdHash);

      window._iframe_cloud_current = {
        timeline: timeline,
        beholdHash: beholdHash,
        movie: movie,
        label: 'Collaps'
      };

      addToHistory(movie);
    }

    Lampa.Player.play(video);
    Lampa.Player.playlist([video]);

    // Position save/restore
    if (video.timeline) {
      setTimeout(function() {
        var el = document.querySelector('video');
        if (!el) return;

        var lastSave = 0;
        var savePos = function() {
          var now = Date.now();
          if (now - lastSave < 3000) return;
          if (!el.duration || el.duration < 10) return;
          lastSave = now;
          video.timeline.time = Math.round(el.currentTime);
          video.timeline.duration = Math.round(el.duration);
          video.timeline.percent = Math.min(100, Math.round((el.currentTime / el.duration) * 100));
          Lampa.Timeline.update(video.timeline);
        };

        el.addEventListener('timeupdate', savePos);
        el.addEventListener('pause', savePos);
        el.addEventListener('ended', savePos);

        var doRestore = function() {
          if (video.timeline.time > 10 && el.duration && el.duration > video.timeline.time) {
            el.currentTime = video.timeline.time;
            Lampa.Noty.show(PLUGIN_NAME + ': позиция восстановлена с ' + Math.floor(video.timeline.time / 60) + ':' + String(Math.floor(video.timeline.time % 60)).padStart(2, '0'));
          }
        };

        if (el.readyState >= 1) doRestore();
        else el.addEventListener('loadedmetadata', doRestore);
      }, 1500);
    }
  }

  function showCollapsEpisodeSelector(episodes, title, movie, audioNames, subtitles) {
    var items = episodes.map(function(ep) {
      return {
        title: ep.title,
        subtitle: ep.quality + ' — ' + (ep.audio.length ? ep.audio.join(', ') : ''),
        _episode: ep
      };
    });

    Lampa.Select.show({
      title: title + ' — Collaps',
      items: items,
      onSelect: function(item) {
        var ep = item._episode;
        if (ep.url) {
          playCollapsStream(ep.url, ep.quality, title, movie, ep.audio.length ? ep.audio : audioNames, subtitles);
        } else {
          Lampa.Noty.show(PLUGIN_NAME + ': серия недоступна');
        }
      },
      onBack: function() {
        Lampa.Controller.toggle('content');
      }
    });
  }

  /* ---- playIframeCloud: try to play all sources natively ---- */

  function tryFindM3u8InHtml(html) {
    if (!html) return null;

    var patterns = [
      /(?:https?:\/\/)[^\s"'<>]+\.m3u8[^\s"'<>]*/gi,
      /["']((?:https?:\/\/)[^\s"'<>]+\.m3u8[^\s"'<>]*)/gi,
      /file\s*[:=]\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)/gi,
      /src\s*[:=]\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)/gi
    ];

    for (var i = 0; i < patterns.length; i++) {
      var match = html.match(patterns[i]);
      if (match) {
        var url = typeof match[1] === 'string' ? match[1] : match[0];
        url = url.replace(/['"]/g, '').trim();
        if (url.indexOf('.m3u8') !== -1) return url;
      }
    }

    return null;
  }

  function tryFindAllohaUrl(html, pUrl) {
    if (!html) return null;

    var fileListMatch = html.match(/(?:const|var|let)\s+fileList\s*=\s*JSON\.parse\(['"](.+?)['"]\)/);
    if (!fileListMatch) return null;

    try {
      var fileList = JSON.parse(fileListMatch[1]);
      var active = fileList.active;
      if (!active || !active.id) return null;

      var userParamMatch = html.match(/(?:const|var|let)\s+userParam\s*=\s*(\{[\s\S]*?\})\s*;/);
      var domain = 'https://api.ortified.ws/';
      var token = '';

      if (userParamMatch) {
        var domainMatch = userParamMatch[1].match(/domain\s*:\s*['"]([^'"]+)['"]/);
        var tokenMatch = userParamMatch[1].match(/token\s*:\s*['"]([^'"]+)['"]/);
        if (domainMatch) domain = decodeURIComponent(domainMatch[1]);
        if (tokenMatch) token = tokenMatch[1];
      }

      var fileId = active.id;
      var tryUrls = [
        domain + 'api/file/' + fileId + '/hls?token=' + token,
        domain + 'api/video/' + fileId + '/hls?token=' + token,
        domain + 'hls/' + fileId + '.m3u8?token=' + token,
        domain + 'api/file/' + fileId + '/playlist.m3u8?token=' + token
      ];

      return { tryUrls: tryUrls, fileList: fileList };
    } catch (e) {
      return null;
    }
  }

  function playIframeCloud(cloudUrl, movieTitle, movie) {
    Lampa.Loading.start('MovieZone');

    var kpMatch = cloudUrl.match(/\/iframe\/(\d+)/);
    if (!kpMatch) {
      Lampa.Loading.stop();
      showIframePlayer(cloudUrl, movieTitle);
      return;
    }

    var kpId = kpMatch[1];

    fetchJsonViaProxy(IFRAME_CLOUD_API + '?action=players&kp_id=' + kpId + '&type=movie' + (movie && movie.id ? '&id=' + movie.id : '')).then(function(data) {
      var players = (data.players || []).filter(function(p) { return !isVeoveo(p) && !isAllohaOrTurbo(p); });

      if (!players.length) {
        Lampa.Loading.stop();
        Lampa.Noty.show(PLUGIN_NAME + ': источники не найдены');
        showIframePlayer(cloudUrl, movieTitle);
        return;
      }

      tryExtractCloudPlayers(players, 0, movieTitle, function(results) {
        Lampa.Loading.stop();

        if (results.length === 0) {
          Lampa.Noty.show(PLUGIN_NAME + ': не удалось извлечь видео, открываем в браузере...');
          showIframePlayer(cloudUrl, movieTitle);
          return;
        }

        if (results.length === 1) {
          var r = results[0];
          if (r.hls) {
            playHlsProxied(r.hls, movieTitle, movie);
          } else if (r.seasons && r.seasons.length) {
            showSeasonSelector(r.seasons, movieTitle, r.current, movie);
          } else {
            showIframePlayer(players[0].url, movieTitle);
          }
          return;
        }

        var items = results.map(function(r) {
          return {
            title: r.label,
            subtitle: r.quality || '',
            _result: r
          };
        });

        Lampa.Select.show({
          title: PLUGIN_NAME + ' \u2014 ' + movieTitle,
          items: items,
          onSelect: function(item) {
            var r = item._result;
            if (r.hls) {
              playHlsProxied(r.hls, movieTitle, movie);
            } else if (r.seasons && r.seasons.length) {
              showSeasonSelector(r.seasons, movieTitle, r.current, movie);
            } else {
              showIframePlayer(r.url, movieTitle);
            }
          }
        });
      });
    }).catch(function(e) {
      Lampa.Loading.stop();
      console.log('[iframe-cloud] playIframeCloud error:', e.message);
      showIframePlayer(cloudUrl, movieTitle);
    });
  }

  function tryExtractCloudPlayers(players, index, movieTitle, done) {
    if (index >= players.length) {
      done([]);
      return;
    }

    var p = players[index];
    var label = p.source + ' \u2014 ' + (p.translate || '') + ' (' + (p.quality || '') + ')';
    var url = p.url || '';

    if (!url) {
      tryExtractCloudPlayers(players, index + 1, movieTitle, done);
      return;
    }

    var isOrt = url.indexOf('ortified.ws') !== -1 || url.indexOf('stravers.live') !== -1;

    function handleNext(currentResult) {
      tryExtractCloudPlayers(players, index + 1, movieTitle, function(rest) {
        if (currentResult) rest.unshift(currentResult);
        done(rest);
      });
    }

    function processHtml(html) {
      var data = parseOrtifiedEmbed(html);

      if (data.hlsUrl) {
        handleNext({ label: label, hls: data.hlsUrl, quality: p.quality, url: url });
      } else if (data.seasons.length) {
        handleNext({ label: label, seasons: data.seasons, current: data.current, quality: p.quality, url: url });
      } else {
        var alloha = tryFindAllohaUrl(html, url);
        if (alloha && alloha.tryUrls.length) {
          tryAllohaUrls(alloha.tryUrls, 0, function(found) {
            if (found) {
              handleNext({ label: label, hls: found, quality: p.quality, url: url });
            } else {
              handleNext(null);
            }
          });
        } else {
          var hls = tryFindM3u8InHtml(html);
          if (hls) {
            handleNext({ label: label, hls: hls, quality: p.quality, url: url });
          } else {
            handleNext(null);
          }
        }
      }
    }

    fetchOrtifiedViaProxies(url).then(processHtml).catch(function() {
      handleNext(null);
    });
  }

  function tryAllohaUrls(urls, index, done) {
    if (index >= urls.length) {
      done(null);
      return;
    }

    var testUrl = urls[index];
    fetchText(VERCEL_PROXY_URL + '?url=' + encodeURIComponent(testUrl)).then(function(text) {
      if (text && text.indexOf('.m3u8') !== -1 && text.indexOf('#EXTM3U') !== -1) {
        done(testUrl);
      } else {
        tryAllohaUrls(urls, index + 1, done);
      }
    }).catch(function() {
      tryAllohaUrls(urls, index + 1, done);
    });
  }

  /* ---- Auto-try next player ---- */

  function tryNextPlayer(players, currentIndex, movieTitle) {
    for (var i = currentIndex + 1; i < players.length; i++) {
      var np = players[i];
      if (isVeoveo(np)) continue;
      var label = np.source + ' (' + (np.translate || '') + ')';
      Lampa.Noty.show(PLUGIN_NAME + ': \u043f\u0440\u043e\u0431\u0443\u0435\u043c ' + label + '...');
      showIframePlayer(np.url, label);
      return true;
    }
    Lampa.Noty.show(PLUGIN_NAME + ': \u0432\u0441\u0435 \u043f\u043b\u0435\u0435\u0440\u044b \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u043d\u044b');
    return false;
  }

  /* ---- Main flow ---- */

  function isTvSeries(movie) {
    return movie.type === 'tv' || (movie.number_of_seasons && movie.number_of_seasons > 0) || (!movie.release_date && movie.first_air_date);
  }

  function addToHistory(movie) {
    try {
      Lampa.Favorite.add('history', {
        id: movie.id,
        title: movie.title || movie.name || '',
        original_title: movie.original_title || '',
        poster_path: movie.poster_path || '',
        release_date: movie.release_date || movie.first_air_date || '',
        original_language: movie.original_language || 'ru',
        vote_average: movie.vote_average || 0,
        source: 'tmdb'
      }, 100);
    } catch (e) {
    }
  }

  /* ---- Auto-fallback chain: Kinogo → VK → Collaps ---- */

  function trySourceChain(movie, kpId) {
    var title = movie.title || movie.name || '';
    var tv = isTvSeries(movie);

    var sources = [];

    // 1. Kinogo — 1080p HLS with multi-voice
    sources.push({
      name: 'Kinogo',
      try: function(done) {
        fetchJson(WORKER_URL + '/?kinogo_search=' + encodeURIComponent(title)).then(function(data) {
          var results = data.results || [];
          if (!results.length) { done(false); return; }

          var year = getYear(movie);
          var best = null;
          for (var i = 0; i < results.length; i++) {
            if (year && results[i].year && Math.abs(parseInt(results[i].year) - parseInt(year)) <= 1) {
              best = results[i];
              break;
            }
          }
          if (!best) best = results[0];

          fetchJson(WORKER_URL + '/?kinogo_page=' + encodeURIComponent(best.url)).then(function(pageData) {
            if (!pageData.embedUrl) { done(false); return; }

            var embedUrl = pageData.embedUrl;
            if (embedUrl.indexOf('//') === 0) embedUrl = 'https:' + embedUrl;

            if (pageData.hasCinemar && !pageData.isOrtified) {
              playKinogoEmbed(embedUrl, best, movie);
              done(true);
            } else if (pageData.isOrtified) {
              // ortified is a fallback, skip in auto mode
              done(false);
            } else {
              playKinogoEmbed(embedUrl, best, movie);
              done(true);
            }
          }).catch(function() { done(false); });
        }).catch(function() { done(false); });
      }
    });

    // 2. VK Video — up to 4K MP4 (skip for TV series)
    if (!tv) {
      sources.push({
        name: 'VK Video',
        try: function(done) {
          var year = getYear(movie);
          var query = title + (year ? ' ' + year : '');

          fetchJson(WORKER_URL + '/?vksearch=' + encodeURIComponent(query) + '&year=' + (year || '')).then(function(data) {
            var videos = data.videos || [];
            if (!videos.length) { done(false); return; }

            var best = videos[0];
            var infoUrl = WORKER_URL + '/?oid=' + best.owner_id + '&vid=' + best.video_id;

            fetchJson(infoUrl).then(function(info) {
              var mp4Qualities = Object.keys(info.mp4 || {}).map(function(q) { return parseInt(q); }).sort(function(a, b) { return b - a; });
              if (!mp4Qualities.length) { done(false); return; }

              var bestQuality = mp4Qualities[0];

              var play = {
                url: WORKER_URL + '/?oid=' + best.owner_id + '&vid=' + best.video_id + '&stream=1&qual=mp4_' + bestQuality,
                title: PLUGIN_NAME + ' VK ' + bestQuality + 'p — ' + best.title,
                subtitles: []
              };

              if (mp4Qualities.length > 1) {
                play.quality = {};
                var qualityLabels = { 2160: '4K', 1440: '2K', 1080: '1080p', 720: '720p', 480: '480p', 360: '360p' };
                for (var i = 0; i < mp4Qualities.length; i++) {
                  var qLabel = qualityLabels[mp4Qualities[i]] || mp4Qualities[i] + 'p';
                  play.quality[qLabel] = WORKER_URL + '/?oid=' + best.owner_id + '&vid=' + best.video_id + '&stream=1&qual=mp4_' + mp4Qualities[i];
                }
              }

              var hash = getTimelineHash(movie, 'VK');
              var timeline = Lampa.Timeline.view(hash);
              play.timeline = timeline;

              addToHistory(movie);
              Lampa.Player.play(play);
              Lampa.Player.playlist([play]);
              done(true);
            }).catch(function() { done(false); });
          }).catch(function() { done(false); });
        }
      });
    }

    // 3. Collaps Direct — 1080p DASH
    sources.push({
      name: 'Collaps',
      try: function(done) {
        if (!kpId) { done(false); return; }
        playCollapsDirect(kpId, title, movie).then(function() {
          done(true);
        }).catch(function() { done(false); });
      }
    });

    // Try each source sequentially
    tryNextSource(sources, 0);

    function tryNextSource(list, idx) {
      if (idx >= list.length) {
        Lampa.Noty.show(PLUGIN_NAME + ': все источники недоступны');
        return;
      }

      var src = list[idx];

      src.try(function(success) {
        if (success) return; // playback started

        // Show notification only if there's a next source
        if (idx < list.length - 1) {
          Lampa.Noty.show(PLUGIN_NAME + ': ' + src.name + ' недоступен, пробуем ' + list[idx + 1].name + '...');
        }

        tryNextSource(list, idx + 1);
      });
    }
  }

  function openPlugin(movie) {
    var id = movie.id;
    if (!id) { Lampa.Noty.show(PLUGIN_NAME + ': нет ID'); return; }
    var title = movie.title || movie.name || '';
    var tv = isTvSeries(movie);

    Lampa.Noty.show(PLUGIN_NAME + ': ' + title);

    getKinopoiskId(movie)
      .then(function(kpId) {
        // Start auto-fallback chain
        trySourceChain(movie, kpId);
      })
      .catch(function(e) {
        console.log('[iframe-cloud] Error:', e.message);
        // Fallback to Kinogo search
        searchAndPlayKinogo(movie);
      });
  }

  /* ---- Plugin registration ---- */

  function addCardButton(movie, render) {
    if (!render || !render.length) return;
    if (render.find('.iframe-cloud-btn').length) return;

    var btn = $('<div class="full-start__button selector iframe-cloud-btn" data-subtitle="720p-4K"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg><span>' + PLUGIN_NAME + '</span></div>');
    btn.on('hover:enter click', function() { openPlugin(movie); });
    render.after(btn);

    try {
      var hash = getTimelineHash(movie);
      var timeline = Lampa.Timeline.view(hash);
      if (timeline && timeline.time > 0) {
        var tl = Lampa.Timeline.render(timeline);
        if (tl) btn.after(tl);
      }
    } catch (e) {
      console.log('[iframe-cloud] Timeline render error:', e.message);
    }
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
      type: 'video', version: '5.28.0', name: PLUGIN_NAME, description: 'VK Video', component: 'iframe_cloud',
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
