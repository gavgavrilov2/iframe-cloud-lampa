var IframeCloud = IframeCloud || {};

IframeCloud.Logger = (function() {
  var TAG = '[iframe-cloud]';

  function log() {
    var args = [TAG].concat(Array.prototype.slice.call(arguments));
    console.log.apply(console, args);
  }

  function warn() {
    var args = [TAG].concat(Array.prototype.slice.call(arguments));
    console.warn.apply(console, args);
  }

  function error() {
    var args = [TAG].concat(Array.prototype.slice.call(arguments));
    console.error.apply(console, args);
  }

  return {
    log: log,
    warn: warn,
    error: error,
    request: function(msg) { log('Request:', msg); },
    success: function(msg) { log('Success:', msg); },
    failed: function(msg) { error('Failed:', msg); },
    parser: function(msg) { log('Parser:', msg); },
    player: function(msg) { log('Player:', msg); }
  };
})();
