(function() {
  'use strict';

  // ==================== Logger ====================
  var Logger = (function() {
    var TAG = '[iframe-cloud]';
    function log() { var a = [TAG].concat([].slice.call(arguments)); console.log.apply(console, a); }
    function error() { var a = [TAG].concat([].slice.call(arguments)); console.error.apply(console, a); }
    return {
      log: log,
      error: error,
      request: function(m) { log('Request:', m); },
      success: function(m) { log('Success:', m); },
      failed: function(m) { error('Failed:', m); },
      parser: function(m) { log('Parser:', m); },
      player: function(m) { log('Player:', m); }
    };
  })();

  // ==================== Settings ====================
  var Settings = (function() {
    var defaults = { cache: true, timeout: 15000 };
    function get(key) { return Lampa.Storage.get('iframe_cloud_' + key, defaults[key]); }
    function set(key, value) { Lampa.Storage.set('iframe_cloud_' + key, value); }
    return { get: get, set: set };
  })();

  // ==================== Cache ====================
  var Cache = (function() {
    var store = {};
    var TTL = 10 * 60 * 1000;
    function get(key) {
      var e = store[key];
      if (!e) return null;
      if (Date.now() > e.exp) { delete store[key]; return null; }
      return e.val;
    }
    function set(key, val) { store[key] = { val: val, exp: Date.now() + TTL }; }
    function clear() { store = {}; }
    return { get: get, set: set, clear: clear };
  })();

  // ==================== Api ====================
  var Api = (function() {
    var BASE = 'https://iframe.cloud/iframe/';
    var net = new Lampa.Reguest();

    function getIframePage(id) {
      var url = BASE + id;
      if (Settings.get('cache')) {
        var cached = Cache.get('html_' + id);
        if (cached) { Logger.log('Cache hit:', id); return Promise.resolve(cached); }
      }
      Logger.request(url);
      return new Promise(function(resolve, reject) {
        net.timeout(Settings.get('timeout'));
        net["native"](url, function(html) {
          if (Settings.get('cache')) Cache.set('html_' + id, html);
          Logger.success('HTML for ' + id + ' (' + html.length + ' chars)');
          resolve(html);
        }, function(e) {
          Logger.failed(e.message || e);
          reject(e);
        }, false, { dataType: 'text' });
      });
    }

    return { getIframePage: getIframePage };
  })();

  // ==================== Parser ====================
  var Parser = (function() {
    function parse(html) {
      var players = [];
      try {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var items = doc.querySelectorAll('.cinemaplayer-item-select');
        Logger.parser('Found ' + items.length + ' players');
        for (var i = 0; i < items.length; i++) {
          var url = items[i].getAttribute('data-value');
          var name = items[i].textContent.trim();
          if (url) {
            players.push({ name: name || ('Плеер ' + (i + 1)), url: url });
            Logger.parser('  ' + name + ' -> ' + url);
          }
        }
      } catch (e) { Logger.error('Parse error:', e.message); }
      return players;
    }
    return { parse: parse };
  })();

  // ==================== Player ====================
  var Player = (function() {
    function play(url, title) {
      Logger.player('Play: ' + title);
      Lampa.Player.play({ title: title, url: url, method: 'play' });
    }
    return { play: play };
  })();

  // ==================== Component ====================
  function component(object) {
    var scroll = new Lampa.Scroll({ mask: true, over: true });
    var files = new Lampa.Explorer(object);
    var last;

    this.start = function() {
      if (!this._init) {
        this._init = true;
        this.initialize();
      }
      Lampa.Background.immediately(Lampa.Utils.cardImgBackgroundBlur(object.movie));
      Lampa.Controller.add('content', {
        toggle: function() {
          Lampa.Controller.collectionSet(scroll.render(), files.render());
          Lampa.Controller.collectionFocus(last || false, scroll.render());
        },
        up: function() {
          if (Navigator.canmove('up')) Navigator.move('up');
          else Lampa.Controller.toggle('head');
        },
        down: function() { Navigator.move('down'); },
        right: function() {
          if (Navigator.canmove('right')) Navigator.move('right');
        },
        left: function() {
          if (Navigator.canmove('left')) Navigator.move('left');
          else Lampa.Controller.toggle('menu');
        },
        back: function() { Lampa.Activity.backward(); }
      });
      Lampa.Controller.toggle('content');
    };

    this.initialize = function() {
      var _this = this;
      this.loading(true);
      scroll.body().addClass('torrent-list');
      files.appendFiles(scroll.render());
      scroll.minus(files.render().find('.explorer__files-head'));
      scroll.body().append(Lampa.Template.get('iframe_cloud_loading'));
      Lampa.Controller.enable('content');

      var kp = object.movie.kinopoisk_id;
      if (!kp) { this.empty('Нет Kinopoisk ID'); return; }

      Logger.log('kinopoisk_id:', kp);

      Api.getIframePage(kp).then(function(html) {
        var players = Parser.parse(html);
        if (!players.length) { _this.empty('Плееры отсутствуют'); return; }
        _this.draw(players);
        _this.loading(false);
      }).catch(function(e) {
        _this.empty('Ошибка: ' + (e.message || e));
      });
    };

    this.draw = function(players) {
      var _this = this;
      scroll.clear();
      players.forEach(function(p) {
        var el = $('<div class="online-prestige online-prestige--full selector">' +
          '<div class="online-prestige__body">' +
          '<div class="online-prestige__head">' +
          '<div class="online-prestige__title">' + p.name + '</div>' +
          '</div>' +
          '<div class="online-prestige__footer">' +
          '<div class="online-prestige__info"><span>' +
          (object.movie.title || object.movie.name || '') +
          '</span></div>' +
          '</div></div></div>');
        el.on('hover:enter', function() {
          Player.play(p.url, object.movie.title || object.movie.name || p.name);
        }).on('hover:focus', function(e) {
          last = e.target;
          scroll.update($(e.target), true);
        });
        scroll.append(el);
      });
      Lampa.Controller.enable('content');
    };

    this.empty = function(msg) {
      scroll.clear();
      scroll.append($('<div class="online-empty"><div class="online-empty__title">' + msg + '</div></div>'));
      this.loading(false);
    };

    this.loading = function(s) {
      if (s) this.activity.loader(true);
      else { this.activity.loader(false); this.activity.toggle(); }
    };

    this.render = function() { return files.render(); };
    this.destroy = function() { files.destroy(); scroll.destroy(); };
  }

  // ==================== Plugin Entry ====================
  function startPlugin() {
    window.iframe_cloud_plugin = true;

    Lampa.Manifest.plugins = {
      type: 'video',
      version: '1.0.0',
      name: 'Iframe Cloud',
      description: 'Просмотр фильмов через iframe.cloud',
      component: 'iframe_cloud',
      onContextMenu: function() {
        return { name: 'Смотреть через Iframe Cloud', description: '' };
      },
      onContextLauch: function(obj) {
        Lampa.Component.add('iframe_cloud', component);
        Lampa.Activity.push({
          url: '',
          title: 'Iframe Cloud',
          component: 'iframe_cloud',
          movie: obj,
          page: 1
        });
      }
    };

    Lampa.Component.add('iframe_cloud', component);

    Lampa.Template.add('iframe_cloud_loading',
      '<div class="online-empty">' +
      '<div class="broadcast__scan"><div></div></div>' +
      '</div>'
    );

    var btnHtml =
      '<div class="full-start__button selector view--iframe_cloud" data-subtitle="Iframe Cloud v1.0.0">' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 392.697 392.697">' +
      '<path d="M21.837,83.419l36.496,16.678L227.72,19.886c1.229-.592,2.002-1.846,1.98-3.209-.021-1.365-.834-2.592-2.082-3.145L197.766.3c-.903-.4-1.933-.4-2.837,0L21.873,77.036c-1.259.559-2.073,1.803-2.081,3.18C19.784,81.593,20.584,82.847,21.837,83.419z" fill="currentColor"/>' +
      '<path d="M185.689,177.261l-64.988-30.01v91.617c0,.856-.44,1.655-1.167,2.114-.406.257-.869.386-1.333.386-.368,0-.736-.082-1.079-.244l-68.874-32.625c-.869-.416-1.421-1.293-1.421-2.256v-92.229L6.804,95.5c-1.083-.496-2.344-.406-3.347.238-1.002.645-1.608,1.754-1.608,2.944v208.744c0,1.371.799,2.615,2.045,3.185l178.886,81.768c.464.211.96.315,1.455.315.661,0,1.318-.188,1.892-.555,1.002-.645,1.608-1.754,1.608-2.945V180.445c0-1.369-.799-2.614-2.046-3.184z" fill="currentColor"/>' +
      '<path d="M389.24,95.74c-1.002-.644-2.264-.732-3.347-.238l-178.876,81.76c-1.246.57-2.045,1.814-2.045,3.185v208.751c0,1.191.606,2.302,1.608,2.945.572.367,1.23.555,1.892.555.495,0,.991-.104,1.455-.315l178.876-81.768c1.246-.568,2.045-1.813,2.045-3.185V98.685c0-1.191-.607-2.301-1.608-2.945z" fill="currentColor"/>' +
      '<path d="M372.915,80.216c-.009-1.377-.823-2.621-2.082-3.18l-60.182-26.681c-.938-.418-2.013-.399-2.938.045l-173.755,82.992,60.933,29.117c.462.211.958.316,1.455.316s.993-.105,1.455-.316l173.066-79.092c1.259-.559,2.073-1.803,2.081-3.18.009-1.376-.811-2.62-2.063-3.183z" fill="currentColor"/>' +
      '</svg>' +
      '<span>Смотреть через Iframe Cloud</span>' +
      '</div>';

    function addButton(e) {
      if (e.render.find('.view--iframe_cloud').length) return;
      var btn = $(btnHtml);
      btn.on('hover:enter', function() {
        Lampa.Component.add('iframe_cloud', component);
        Lampa.Activity.push({
          url: '',
          title: 'Iframe Cloud',
          component: 'iframe_cloud',
          movie: e.movie,
          page: 1
        });
      });
      e.render.after(btn);
    }

    Lampa.Listener.follow('full', function(e) {
      if (e.type == 'complite') {
        addButton({
          render: e.object.activity.render().find('.view--torrent'),
          movie: e.data.movie
        });
      }
    });

    try {
      if (Lampa.Activity.active().component == 'full') {
        addButton({
          render: Lampa.Activity.active().activity.render().find('.view--torrent'),
          movie: Lampa.Activity.active().card
        });
      }
    } catch (e) {}
  }

  if (!window.iframe_cloud_plugin) startPlugin();
})();
