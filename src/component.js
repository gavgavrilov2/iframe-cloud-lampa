var IframeCloud = IframeCloud || {};

IframeCloud.Component = (function() {
  function create(object) {
    var network = new Lampa.Reguest();
    var scroll = new Lampa.Scroll({ mask: true, over: true });
    var files = new Lampa.Explorer(object);
    var last;

    this.start = function() {
      if (!this._initialized) {
        this._initialized = true;
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
        down: function() {
          Navigator.move('down');
        },
        right: function() {
          if (Navigator.canmove('right')) Navigator.move('right');
        },
        left: function() {
          if (Navigator.canmove('left')) Navigator.move('left');
          else Lampa.Controller.toggle('menu');
        },
        back: this.back.bind(this)
      });

      Lampa.Controller.toggle('content');
    };

    this.initialize = function() {
      var _this = this;
      this.loading(true);

      scroll.body().addClass('torrent-list');
      files.appendFiles(scroll.render());
      files.appendHead(scroll.render());
      scroll.minus(files.render().find('.explorer__files-head'));
      scroll.body().append(Lampa.Template.get('iframe_cloud_loading'));
      Lampa.Controller.enable('content');

      var movie = object.movie;
      var kinopoiskId = movie.kinopoisk_id;

      if (!kinopoiskId) {
        this.empty('Нет Kinopoisk ID');
        return;
      }

      IframeCloud.Logger.log('Loading players for kinopoisk_id:', kinopoiskId);

      IframeCloud.Api.getIframePage(kinopoiskId)
        .then(function(html) {
          var players = IframeCloud.Parser.parse(html);

          if (players.length === 0) {
            _this.empty('Плееры отсутствуют');
            return;
          }

          _this.display(players);
          _this.loading(false);
        })
        .catch(function(err) {
          _this.empty('Ошибка загрузки: ' + (err.message || err));
        });
    };

    this.display = function(players) {
      var _this = this;
      scroll.clear();

      players.forEach(function(player) {
        var html = $('<div class="online-prestige online-prestige--full selector">' +
          '<div class="online-prestige__body">' +
          '<div class="online-prestige__head">' +
          '<div class="online-prestige__title">' + player.name + '</div>' +
          '</div>' +
          '<div class="online-prestige__footer">' +
          '<div class="online-prestige__info">' +
          '<span>' + (object.movie.title || object.movie.name || '') + '</span>' +
          '</div>' +
          '</div>' +
          '</div>' +
          '</div>');

        html.on('hover:enter', function() {
          IframeCloud.Player.play(player.url, object.movie.title || object.movie.name || player.name);
        }).on('hover:focus', function(e) {
          last = e.target;
          scroll.update($(e.target), true);
        });

        scroll.append(html);
      });

      Lampa.Controller.enable('content');
    };

    this.empty = function(message) {
      scroll.clear();
      var html = $('<div class="online-empty">' +
        '<div class="online-empty__title">' + message + '</div>' +
        '</div>');
      scroll.append(html);
      this.loading(false);
    };

    this.loading = function(status) {
      if (status) this.activity.loader(true);
      else {
        this.activity.loader(false);
        this.activity.toggle();
      }
    };

    this.back = function() {
      Lampa.Activity.backward();
    };

    this.render = function() {
      return files.render();
    };

    this.destroy = function() {
      network.clear();
      files.destroy();
      scroll.destroy();
    };
  }

  return {
    create: create
  };
})();
