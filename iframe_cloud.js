(function() {
  'use strict';

  console.log('[iframe-cloud] Loading v4.0.0');

  var PLUGIN_NAME = 'Iframe Cloud';
  var WORKER_URL = 'https://silent-recipe-5c08.rustypony.workers.dev';

  function proxy(url) {
    return WORKER_URL + '/?proxy=' + encodeURIComponent(url);
  }

  function fetchHtml(url) {
    return window.fetch(proxy(url))
      .then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
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

  function extractVideoFromHtml(html) {
    var patterns = [
      /["'](https?:\/\/[^"'\s]*superdupercdn[^"'\s]*\.m3u8[^"'\s]*)/gi,
      /["'](https?:\/\/[^"'\s]*superdupercdn[^"'\s]*\.mp4[^"'\s]*)/gi,
      /(?:file|src|video|url|source|playbackUrl|videoUrl|streamUrl|hls|dash|manifest)\s*[:=]\s*["'](https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/gi,
      /(?:file|src|video|url|source|playbackUrl|videoUrl|streamUrl|hls|dash)\s*[:=]\s*["'](https?:\/\/[^"'\s]+\.mp4[^"'\s]*)/gi,
      /["'](?:file|src|video|url|source|hls|dash)["']\s*:\s*["'](https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/gi,
      /["'](?:file|src|video|url|source|hls|dash)["']\s*:\s*["'](https?:\/\/[^"'\s]+\.mp4[^"'\s]*)/gi,
      /["'](https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/gi,
      /["'](https?:\/\/[^"'\s]+\.mp4[^"'\s]*)/gi
    ];
    for (var i = 0; i < patterns.length; i++) {
      var match;
      var regex = new RegExp(patterns[i].source, patterns[i].flags);
      while ((match = regex.exec(html)) !== null) {
        var url = match[1];
        if (url && (url.indexOf('.m3u8') !== -1 || url.indexOf('.mp4') !== -1)) {
          if (url.indexOf('example.com') !== -1) continue;
          if (url.indexOf('iframe.cloud') !== -1) continue;
          if (url.startsWith('//')) url = 'https:' + url;
          return { url: url, type: url.indexOf('.m3u8') !== -1 ? 'hls' : 'mp4' };
        }
      }
    }
    return null;
  }

  function isVeoveo(p) {
    var t = (p.title || '').toLowerCase();
    var u = (p.url || '').toLowerCase();
    return t.indexOf('veoveo') !== -1 || u.indexOf('veoveo') !== -1;
  }

  function playNative(url, title) {
    console.log('[iframe-cloud] Native play:', url);
    Lampa.Player.play({
      title: title || PLUGIN_NAME,
      url: url,
      quality: {},
      callback: function() {}
    });
  }

  function openIframe(url, title) {
    console.log('[iframe-cloud] Overlay:', url);
    closeOverlay();

    var overlay = document.createElement('div');
    overlay.className = 'iframe-cloud-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;background:#000;';

    var loading = document.createElement('div');
    loading.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;z-index:1;color:#fff;font-size:24px;';
    loading.innerHTML = '<div class="broadcast__scan"><div></div></div>';

    var closeBtn = document.createElement('div');
    closeBtn.className = 'selector';
    closeBtn.style.cssText = 'position:absolute;top:15px;right:20px;z-index:100000;color:#fff;font-size:36px;cursor:pointer;padding:10px 20px;background:rgba(0,0,0,0.7);border-radius:8px;';
    closeBtn.innerHTML = '&#10005;';

    var hint = document.createElement('div');
    hint.style.cssText = 'position:absolute;bottom:20px;left:0;right:0;text-align:center;color:rgba(255,255,255,0.5);font-size:14px;z-index:100000;';
    hint.textContent = title + ' | ESC';

    var iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.style.cssText = 'width:100%;height:100%;border:none;';
    iframe.setAttribute('allow', 'autoplay; fullscreen');
    iframe.onload = function() { loading.style.display = 'none'; };

    overlay.appendChild(loading);
    overlay.appendChild(iframe);
    overlay.appendChild(closeBtn);
    overlay.appendChild(hint);
    document.body.appendChild(overlay);

    closeBtn.addEventListener('click', function() { closeOverlay(); });

    Lampa.Controller.add('iframe_cloud_overlay', {
      invisible: true,
      toggle: function() {
        Lampa.Controller.collectionSet($(overlay));
        Lampa.Controller.collectionFocus(closeBtn, $(overlay));
      },
      back: function() { closeOverlay(); },
      up: function() {},
      down: function() {},
      left: function() {},
      right: function() {}
    });
    Lampa.Controller.toggle('iframe_cloud_overlay');
  }

  function closeOverlay() {
    var overlay = document.querySelector('.iframe-cloud-overlay');
    if (!overlay) return;

    var iframe = overlay.querySelector('iframe');
    if (iframe) iframe.src = 'about:blank';

    overlay.style.display = 'none';
    setTimeout(function() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }, 100);

    try { Lampa.Controller.toggle('full'); } catch (e) {}
  }

  function openPlugin(movie) {
    var id = movie.id;
    if (!id) { Lampa.Noty.show('Нет ID фильма'); return; }
    var title = movie.title || movie.name || '';

    console.log('[iframe-cloud] Fetching iframe.cloud for:', id);

    fetchHtml('https://iframe.cloud/iframe/' + id)
      .then(function(html) {
        console.log('[iframe-cloud] HTML length:', html.length);
        console.log('[iframe-cloud] HTML snippet:', html.substring(0, 500));
        var players = extractPlayersFromHtml(html);
        console.log('[iframe-cloud] Raw players:', players.length);
        players = players.filter(function(p) { return !isVeoveo(p); });
        console.log('[iframe-cloud] After Veoveo filter:', players.length);

        if (!players.length) {
          console.log('[iframe-cloud] No players found in HTML');
          Lampa.Noty.show(PLUGIN_NAME + ': нет доступных плееров');
          return;
        }

        console.log('[iframe-cloud] Found', players.length, 'players');

        var embedPromises = players.map(function(p) {
          return fetchHtml(p.url)
            .then(function(embedHtml) {
              var video = extractVideoFromHtml(embedHtml);
              if (video) {
                p.video_url = video.url;
                p.type = video.type;
              }
              return p;
            })
            .catch(function() { return p; });
        });

        Promise.all(embedPromises).then(function(results) {
          var withVideo = results.filter(function(p) { return !!p.video_url; });
          var withoutVideo = results.filter(function(p) { return !p.video_url; });

          console.log('[iframe-cloud] With video:', withVideo.length, 'Without:', withoutVideo.length);

          if (withVideo.length === 1 && !withoutVideo.length) {
            playNative(withVideo[0].video_url, title);
            return;
          }

          if (withVideo.length === 0 && withoutVideo.length === 1) {
            openIframe(withoutVideo[0].url, title);
            return;
          }

          var items = [];

          withVideo.forEach(function(p) {
            items.push({
              title: (p.title || 'Плеер') + ' [' + (p.type || 'video').toUpperCase() + ']',
              subtitle: 'Нативный плеер',
              _player: p
            });
          });

          withoutVideo.forEach(function(p) {
            items.push({
              title: p.title || 'Плеер',
              subtitle: 'iframe',
              _player: p
            });
          });

          Lampa.Select.show({
            title: PLUGIN_NAME + ' — ' + title,
            items: items,
            onSelect: function(item) {
              var p = item._player;
              if (p.video_url) playNative(p.video_url, title);
              else openIframe(p.url, title);
            }
          });
        });
      })
      .catch(function(e) {
        console.log('[iframe-cloud] Error:', e.message);
        Lampa.Noty.show(PLUGIN_NAME + ': ошибка загрузки');
      });
  }

  function addCardButton(movie, render) {
    if (!render || !render.length) return;
    if (render.find('.iframe-cloud-btn').length) return;

    var btn = $('<div class="full-start__button selector iframe-cloud-btn" data-subtitle="v4.0.0"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg><span>' + PLUGIN_NAME + '</span></div>');
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
      type: 'video', version: '4.0.0', name: PLUGIN_NAME, description: 'Films via iframe.cloud', component: 'iframe_cloud',
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
