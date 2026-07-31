(function() {
  'use strict';

  console.log('[iframe-cloud] Loading v2.3.0');

  var PLUGIN_NAME = 'Iframe Cloud';
  var WORKER_URL = 'https://silent-recipe-5c08.rustypony.workers.dev';

  function openIframe(url, title) {
    console.log('[iframe-cloud] Opening overlay:', url);
    $('.iframe-cloud-overlay').remove();

    var overlay = $('<div class="iframe-cloud-overlay"></div>');
    overlay.css({ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 99999, background: '#000' });

    var loading = $('<div style="position:absolute;top:0;left:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;z-index:1;color:#fff;"><div class="broadcast__scan"><div></div></div></div>');

    var closeBtn = $('<div class="selector" style="position:absolute;top:15px;right:20px;z-index:100000;color:#fff;font-size:36px;cursor:pointer;padding:10px 20px;background:rgba(0,0,0,0.7);border-radius:8px;">&#10005;</div>');

    var hint = $('<div style="position:absolute;bottom:20px;left:0;right:0;text-align:center;color:rgba(255,255,255,0.5);font-size:14px;z-index:100000;">' + title + ' | ESC</div>');

    var iframe = $('<iframe></iframe>', { src: url, style: 'width:100%;height:100%;border:none;', allow: 'autoplay; fullscreen' });
    iframe.on('load', function() { loading.remove(); });

    function closeOverlay() {
      overlay.remove();
      $(document).off('keydown.iframecloud');
      try { Lampa.Controller.toggle('full'); } catch (e) {}
    }

    closeBtn.on('click hover:enter', closeOverlay);
    $(document).on('keydown.iframecloud', function(e) {
      if (e.keyCode === 27 || e.keyCode === 8) { e.preventDefault(); e.stopPropagation(); closeOverlay(); }
    });

    Lampa.Controller.add('iframe_cloud_overlay', {
      toggle: function() {
        Lampa.Controller.collectionSet(overlay);
        Lampa.Controller.collectionFocus(closeBtn[0], overlay);
      },
      back: closeOverlay,
      up: function() {},
      down: function() {},
      left: function() {},
      right: function() {}
    });

    overlay.append(loading).append(iframe).append(closeBtn).append(hint);
    $('body').append(overlay);

    setTimeout(function() {
      Lampa.Controller.toggle('iframe_cloud_overlay');
    }, 300);
  }

  function openPlugin(movie) {
    var id = movie.id;
    if (!id) { Lampa.Noty.show('Нет ID фильма'); return; }
    var title = movie.title || movie.name || '';

    var url = WORKER_URL + '/?id=' + id;
    console.log('[iframe-cloud] Fetching:', url);

    window.fetch(url)
      .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function(data) {
        var players = data.players || [];
        if (!players.length) { openIframe('https://iframe.cloud/iframe/' + id, title); return; }

        if (players.length === 1) { openIframe(players[0].url, title); return; }

        Lampa.Select.show({
          title: PLUGIN_NAME + ' — ' + title,
          items: players.map(function(p) { return { title: p.title || 'Плеер', subtitle: title, url: p.url }; }),
          onSelect: function(item) { openIframe(item.url, item.title || title); }
        });
      })
      .catch(function(e) {
        console.log('[iframe-cloud] Error:', e.message);
        openIframe('https://iframe.cloud/iframe/' + id, title);
      });
  }

  function addCardButton(movie, render) {
    if (!render || !render.length) return;
    if (render.find('.iframe-cloud-btn').length) return;

    var btn = $('<div class="full-start__button selector iframe-cloud-btn" data-subtitle="v2.3.0"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg><span>' + PLUGIN_NAME + '</span></div>');
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
      type: 'video', version: '2.3.0', name: PLUGIN_NAME, description: 'Films via iframe.cloud', component: 'iframe_cloud',
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
