export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS, POST',
      'Access-Control-Allow-Headers': 'Content-Type, X-API-KEY',
      'Content-Type': 'application/json'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const kpuUrl = url.searchParams.get('kpu');
    const kpuDebug = url.searchParams.get('kpu_debug');
    const proxyUrl = url.searchParams.get('proxy');
    const apiKey = url.searchParams.get('apikey');
    const apiUrl = url.searchParams.get('api');
    const vkSearch = url.searchParams.get('vksearch');
    const vkYear = url.searchParams.get('year');
    const fanfilmSearch = url.searchParams.get('fanfilm_search');
    const fanfilmPage = url.searchParams.get('fanfilm_page');

    if (fanfilmSearch) {
      return await handleFanfilmSearch(fanfilmSearch, corsHeaders);
    }

    if (fanfilmPage) {
      return await handleFanfilmPage(fanfilmPage, corsHeaders);
    }

    if (vkSearch) {
      return await handleVkSearch(vkSearch, vkYear, corsHeaders);
    }

    if (kpuUrl) {
      return await handleKpuProxy(kpuUrl, corsHeaders);
    }

    if (kpuDebug) {
      return await handleKpuDebug(kpuDebug, corsHeaders);
    }

    if (apiUrl) {
      return await handleApiProxy(apiUrl, apiKey, corsHeaders);
    }

    if (proxyUrl) {
      return await handleProxy(proxyUrl, corsHeaders, request);
    }

    var vkStream = url.searchParams.get('vkstream');
    var vkOwnerId = url.searchParams.get('oid');
    var vkVideoId = url.searchParams.get('vid');
    var vkQuality = url.searchParams.get('qual') || 'mp4_1080';
    var vkQuery = url.searchParams.get('q');
    var vkHls = url.searchParams.get('hls');

    if (vkStream) {
      return await handleVkStream(vkStream, corsHeaders, request);
    }

    if (vkOwnerId && vkVideoId && vkHls === '1') {
      return await handleVkHlsProxy(vkOwnerId, vkVideoId, corsHeaders);
    }

    if (vkOwnerId && vkVideoId) {
      return await handleVkStreamProxy(vkOwnerId, vkVideoId, vkQuality, vkQuery, vkYear, corsHeaders, request);
    }

    return new Response(JSON.stringify({ error: 'Usage: ?vksearch=QUERY or ?vkstream=URL or ?oid=X&vid=Y&qual=mp4_NNN or ?kpu=URL or ?proxy=URL' }), {
      status: 400, headers: corsHeaders
    });
  }
};

const KPU_TOKEN = '7edcf64b-b9aa-4f8b-8b5c-ef59bfe69a2c';

async function handleKpuProxy(targetUrl, corsHeaders) {
  try {
    var resp = await fetch(targetUrl, {
      headers: {
        'X-API-KEY': KPU_TOKEN,
        'Accept': 'application/json'
      },
      redirect: 'follow'
    });
    var data = await resp.text();
    return new Response(data, {
      status: resp.status,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
}

async function handleKpuDebug(query, corsHeaders) {
  try {
    var resp = await fetch('https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword?keyword=' + encodeURIComponent(query) + '&page=1', {
      headers: { 'X-API-KEY': KPU_TOKEN, 'Accept': 'application/json' }
    });
    var data = await resp.json();
    var films = data.films || [];
    var first = films[0] || null;
    return new Response(JSON.stringify({
      total: films.length,
      firstKeys: first ? Object.keys(first) : [],
      firstFilm: first
    }, null, 2), {
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
}

async function handleApiProxy(targetUrl, apiKey, corsHeaders) {
  try {
    var headers = { 'Accept': 'application/json' };
    if (apiKey) headers['X-API-KEY'] = apiKey;
    var resp = await fetch(targetUrl, { headers: headers, redirect: 'follow' });
    var data = await resp.text();
    return new Response(data, {
      status: resp.status,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
}

async function handleProxy(targetUrl, corsHeaders, request) {
  try {
    if (targetUrl.startsWith('//')) targetUrl = 'https:' + targetUrl;
    var target = new URL(targetUrl);
    var referer = target.origin + '/';
    var reqHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': referer,
        'Origin': target.origin,
        'Sec-Ch-Ua': '"Google Chrome";v="136", "Chromium";v="136"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'video',
        'Sec-Fetch-Mode': 'no-cors',
        'Sec-Fetch-Site': 'cross-site',
        'Cache-Control': 'max-age=0'
    };
    if (request && request.headers) {
      var range = request.headers.get('Range');
      if (range) reqHeaders['Range'] = range;
    }
    if (targetUrl.indexOf('api.kinopoisk.dev') !== -1) {
      reqHeaders['Accept'] = 'application/json';
      reqHeaders['Sec-Fetch-Dest'] = 'document';
      reqHeaders['Sec-Fetch-Mode'] = 'navigate';
    }
    var resp = await fetch(targetUrl, { headers: reqHeaders, redirect: 'follow' });
    var headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Range' };
    var ct = resp.headers.get('Content-Type');
    var isM3u8 = ct && ct.indexOf('mpegurl') !== -1;
    if (!isM3u8 && targetUrl.indexOf('.m3u8') !== -1) isM3u8 = true;
    headers['Content-Type'] = ct || 'video/mp4';
    var cl = resp.headers.get('Content-Length');
    if (cl) headers['Content-Length'] = cl;
    var cr = resp.headers.get('Content-Range');
    if (cr) headers['Content-Range'] = cr;
    var ar = resp.headers.get('Accept-Ranges');
    if (ar) headers['Accept-Ranges'] = ar;
    if (isM3u8) {
      var body = await resp.text();
      var rewritten = rewriteM3u8Urls(body, targetUrl);
      return new Response(rewritten, { status: resp.status, headers: headers });
    }
    return new Response(resp.body, { status: resp.status, headers: headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
}

/* ---- VK Video Search ---- */

var VK_TOKEN_CACHE = { token: null, expires: 0 };

var VK_CLIENT_ID = 52461373;
var VK_CLIENT_SECRET = 'o557NLIkAErNhakXrQ7A';

async function getVkToken() {
  var now = Date.now();
  if (VK_TOKEN_CACHE.token && VK_TOKEN_CACHE.expires > now) {
    return VK_TOKEN_CACHE.token;
  }

  try {
    var body = 'client_id=' + VK_CLIENT_ID +
      '&client_secret=' + VK_CLIENT_SECRET +
      '&scopes=video_anonymous' +
      '&isApiOauthAnonymEnabled=false' +
      '&version=1' +
      '&app_id=6287487';

    var resp = await fetch('https://login.vk.com/?act=get_anonym_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body
    });

    var json = await resp.json();
    var token = json && json.data && json.data.access_token;
    var expires = json && json.data && (json.data.expires || json.data.expired_at);

    if (token) {
      VK_TOKEN_CACHE.token = token;
      VK_TOKEN_CACHE.expires = expires
        ? new Date(expires * 1000).getTime() - 14400000
        : now + 36000000;
      return token;
    }
  } catch (e) {}

  return null;
}

async function handleVkSearch(query, year, corsHeaders) {
  try {
    var token = await getVkToken();
    if (!token) {
      return new Response(JSON.stringify({ error: 'VK token failed', videos: [] }), {
        status: 200, headers: corsHeaders
      });
    }

    var searchQ = query;
    if (year) searchQ += ' ' + year;

    var body = 'v=5.264' +
      '&client_id=' + VK_CLIENT_ID +
      '&screen_ref=search_video_service' +
      '&input_method=keyboard_search_button' +
      '&q=' + encodeURIComponent(searchQ) +
      '&access_token=' + token;

    var resp = await fetch('https://api.vkvideo.ru/method/catalog.getVideoSearchWeb2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body
    });

    var json = await resp.json();
    var items = (json.response && json.response.catalog_videos) || [];

    var searchTitle = normalize(query);
    var searchYear = year ? parseInt(year) : null;

    var videos = [];

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var video = item.video;
      if (!video || !video.files) continue;

      var title = video.title || '';
      var duration = video.duration || 0;

      if (duration < 3000) continue;

      var titleLower = normalize(title);

      if (titleLower.indexOf('трейлер') !== -1 || titleLower.indexOf('trailer') !== -1 ||
          titleLower.indexOf('премьера') !== -1 || titleLower.indexOf('обзор') !== -1 ||
          titleLower.indexOf('сезон') !== -1 || titleLower.indexOf('серия') !== -1 ||
          titleLower.indexOf('серий') !== -1 || titleLower.indexOf('концерт') !== -1 ||
          titleLower.indexOf('клип') !== -1 || titleLower.indexOf('музыка') !== -1 ||
          titleLower.indexOf('live') !== -1 || titleLower.indexOf('выступление') !== -1 ||
          titleLower.indexOf('интервью') !== -1 || titleLower.indexOf('видеоклип') !== -1 ||
          titleLower.indexOf('киноаук') !== -1 || titleLower.indexOf('шоу') !== -1 ||
          titleLower.indexOf('смотрим') !== -1 || titleLower.indexOf('стрим') !== -1 ||
          titleLower.indexOf('stream') !== -1 || titleLower.indexOf('комментарий') !== -1 ||
          titleLower.indexOf('комментари') !== -1 || titleLower.indexOf('реакция') !== -1 ||
          titleLower.indexOf('reaction') !== -1 || titleLower.indexOf('разбор') !== -1 ||
          titleLower.indexOf('топ') !== -1 || titleLower.indexOf('подборк') !== -1) continue;

      if (searchYear && titleLower.indexOf(String(searchYear)) === -1) continue;

      var qualities = {};
      var bestUrl = null;
      var bestQuality = 0;

      var qualityMap = [
        ['mp4_2160', 2160], ['mp4_1440', 1440], ['mp4_1080', 1080],
        ['mp4_720', 720], ['mp4_480', 480], ['mp4_360', 360], ['mp4_240', 240]
      ];

      for (var q = 0; q < qualityMap.length; q++) {
        var qName = qualityMap[q][0];
        var qVal = qualityMap[q][1];
        var qUrl = video.files[qName];
        if (qUrl) {
          qualities[qVal + 'p'] = qUrl;
          if (!bestUrl || qVal > bestQuality) {
            bestUrl = qUrl;
            bestQuality = qVal;
          }
        }
      }

      if (!bestUrl) continue;

      var preview = '';
      if (video.image) {
        preview = Array.isArray(video.image) ? (video.image[video.image.length - 1] || {}).url : (video.image.url || '');
      }

      videos.push({
        title: title,
        duration: duration,
        quality: bestQuality + 'p',
        url: bestUrl,
        preview: preview,
        qualities: qualities,
        owner_id: video.owner_id,
        video_id: video.id
      });
    }

    for (var s = 0; s < videos.length; s++) {
      var v = videos[s];
      var t = normalize(v.title);
      var score = 0;
      var searchNorm = normalize(query);
      if (t.indexOf(searchNorm) === 0) score += 100;
      else if (t.indexOf(searchNorm) !== -1) score += 50;
      var junkChars = (v.title.match(/[!⚡🔥💬💰🎪🎭🏷🎮🎯🎲💊🎁🎈🎁📌🔔⭐💯✨🆕🆙]/g) || []).length;
      score -= junkChars * 10;
      if (v.title.indexOf('!') !== -1) score -= 30;
      var exclamationCount = (v.title.match(/!/g) || []).length;
      if (exclamationCount > 1) score -= exclamationCount * 10;
      if (t.indexOf(searchNorm + ' (') !== -1 || t.indexOf(searchNorm + ' (') !== -1) score += 80;
      var cleanFormats = ['(' + searchYear + ')', searchYear + 'г', 'HD', 'FHD', 'BDRip', '1080', '720'];
      for (var cf = 0; cf < cleanFormats.length; cf++) {
        if (v.title.indexOf(cleanFormats[cf]) !== -1) score += 10;
      }
      v.score = score;
    }

    videos.sort(function(a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (b.quality !== a.quality) {
        var qOrder = { '2160p': 6, '1440p': 5, '1080p': 4, '720p': 3, '480p': 2, '360p': 1, '240p': 0 };
        return (qOrder[b.quality] || 0) - (qOrder[a.quality] || 0);
      }
      return b.duration - a.duration;
    });

    return new Response(JSON.stringify({ videos: videos }), {
      status: 200, headers: corsHeaders
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message, videos: [] }), {
      status: 200, headers: corsHeaders
    });
  }
}

function normalize(s) {
  return (s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

/* ---- VK Stream proxy: fetch fresh URL + stream in same invocation (same IP) ---- */

async function handleVkStream(targetUrl, corsHeaders, request) {
  try {
    if (targetUrl.startsWith('//')) targetUrl = 'https:' + targetUrl;
    var target = new URL(targetUrl);
    var referer = target.origin + '/';
    var reqHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
      'Referer': referer,
      'Origin': target.origin
    };
    if (request && request.headers) {
      var range = request.headers.get('Range');
      if (range) reqHeaders['Range'] = range;
    }
    var resp = await fetch(targetUrl, { headers: reqHeaders, redirect: 'follow' });
    var headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Range' };
    var ct = resp.headers.get('Content-Type');
    headers['Content-Type'] = ct || 'video/mp4';
    var cl = resp.headers.get('Content-Length');
    if (cl) headers['Content-Length'] = cl;
    var cr = resp.headers.get('Content-Range');
    if (cr) headers['Content-Range'] = cr;
    var ar = resp.headers.get('Accept-Ranges');
    if (ar) headers['Accept-Ranges'] = ar;
    return new Response(resp.body, { status: resp.status, headers: headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
}

async function handleVkStreamProxy(ownerId, videoId, quality, query, year, corsHeaders, request) {
  try {
    var debug = request.url.indexOf('debug=1') !== -1;

    var embedUrl = 'https://vk.com/video_ext.php?oid=' + ownerId + '&id=' + videoId;
    var embedResp = await fetch(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': 'https://vk.com/'
      }
    });
    var html = await embedResp.text();

    var result = { owner_id: ownerId, video_id: videoId, mp4: {}, dash: null, hls: null };

    var qualityMap = [
      ['mp4_2160', 2160], ['mp4_1440', 1440], ['mp4_1080', 1080],
      ['mp4_720', 720], ['mp4_480', 480], ['mp4_360', 360], ['mp4_240', 240]
    ];

    for (var q = 0; q < qualityMap.length; q++) {
      var qName = qualityMap[q][0];
      var re = new RegExp('"' + qName + '"\\s*:\\s*"(https?[^"]+)"');
      var m = html.match(re);
      if (m && m[1]) {
        result.mp4[qualityMap[q][1] + 'p'] = m[1].replace(/\\\//g, '/');
      }
    }

    var dashRe = new RegExp('"dash_uni"\\s*:\\s*"(https?[^"]+)"');
    var dashMatch = html.match(dashRe);
    if (!dashMatch) {
      dashRe = new RegExp('"dash"\\s*:\\s*"(https?[^"]+)"');
      dashMatch = html.match(dashRe);
    }
    if (dashMatch && dashMatch[1]) {
      result.dash = dashMatch[1].replace(/\\\//g, '/');
    }

    var hlsRe = new RegExp('"hls"\\s*:\\s*"(https?[^"]+)"');
    var hlsMatch = html.match(hlsRe);
    if (hlsMatch && hlsMatch[1]) {
      result.hls = hlsMatch[1].replace(/\\\//g, '/');
    }

    if (debug) {
      var snippets = [];
      var allUrls = html.match(/https?:\/\/[^\s"'<>]+/g);
      if (allUrls) {
        var unique = [];
        var seen = {};
        for (var ui = 0; ui < allUrls.length; ui++) {
          var u = allUrls[ui].replace(/\\\//g, '/');
          if (!seen[u]) { seen[u] = true; unique.push(u); }
        }
        snippets = unique.slice(0, 20);
      }
      result.debug = { html_length: html.length, urls_found: snippets.length, urls: snippets };
    }

    var bestUrl = null;
    var qualityPriority = [quality, 'mp4_2160', 'mp4_1440', 'mp4_1080', 'mp4_720', 'mp4_480', 'mp4_360'];
    for (var p = 0; p < qualityPriority.length; p++) {
      var qKey = qualityPriority[p];
      var re2 = new RegExp('"' + qKey + '"\\s*:\\s*"(https?[^"]+)"');
      var m2 = html.match(re2);
      if (m2 && m2[1]) {
        bestUrl = m2[1].replace(/\\\//g, '/');
        break;
      }
    }

    if (!bestUrl) {
      var allMp4Urls = html.match(/https?:\/\/vkvd\d+[^\s"'<>]+/g);
      if (allMp4Urls && allMp4Urls.length) {
        bestUrl = allMp4Urls[0].replace(/\\\//g, '/');
      }
    }

    result.best_mp4 = bestUrl;

    if (debug) {
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }
      });
    }

    if (request.url.indexOf('stream=1') !== -1) {
      if (bestUrl) {
        var reqHeaders = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
          'Accept': '*/*',
          'Referer': 'https://vk.com/',
          'Origin': 'https://vk.com'
        };
        if (request.headers) {
          var range = request.headers.get('Range');
          if (range) reqHeaders['Range'] = range;
        }
        var resp = await fetch(bestUrl, { headers: reqHeaders, redirect: 'follow' });
        var respHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Range' };
        var ct = resp.headers.get('Content-Type');
        respHeaders['Content-Type'] = ct || 'video/mp4';
        var cl = resp.headers.get('Content-Length');
        if (cl) respHeaders['Content-Length'] = cl;
        var cr = resp.headers.get('Content-Range');
        if (cr) respHeaders['Content-Range'] = cr;
        var ar = resp.headers.get('Accept-Ranges');
        if (ar) respHeaders['Accept-Ranges'] = ar;
        return new Response(resp.body, { status: resp.status, headers: respHeaders });
      }
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
}

/* ---- VK HLS proxy: fetch embed page → extract HLS → proxy m3u8 with rewritten URLs ---- */

async function getVkHlsUrl(ownerId, videoId) {
  var embedUrl = 'https://vk.com/video_ext.php?oid=' + ownerId + '&id=' + videoId;
  var embedResp = await fetch(embedUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
      'Referer': 'https://vk.com/'
    }
  });
  var html = await embedResp.text();

  var hlsRe = new RegExp('"hls"\\s*:\\s*"(https?[^"]+)"');
  var hlsMatch = html.match(hlsRe);
  if (hlsMatch && hlsMatch[1]) {
    return hlsMatch[1].replace(/\\\//g, '/');
  }
  return null;
}

function rewriteM3u8Urls(m3u8, baseUrl) {
  var lines = m3u8.split('\n');
  var baseOrigin = '';
  try { baseOrigin = new URL(baseUrl).origin; } catch(e) {}

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line || line.startsWith('#') || line.indexOf('/?proxy=') === 0) continue;

    var fullUrl = line;
    if (line.indexOf('http') !== 0) {
      fullUrl = baseUrl.replace(/\/[^\/]*$/, '/') + line;
    }

    lines[i] = '/?proxy=' + encodeURIComponent(fullUrl);
  }

  return lines.join('\n');
}

async function handleVkHlsProxy(ownerId, videoId, corsHeaders) {
  try {
    var hlsUrl = await getVkHlsUrl(ownerId, videoId);
    if (!hlsUrl) {
      return new Response(JSON.stringify({ error: 'No HLS URL found' }), { status: 404, headers: corsHeaders });
    }

    var resp = await fetch(hlsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Referer': 'https://vk.com/',
        'Origin': 'https://vk.com'
      }
    });

    var m3u8 = await resp.text();
    var rewritten = rewriteM3u8Urls(m3u8, hlsUrl);

    return new Response(rewritten, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-cache'
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
}

const FANFILM_BASE = 'https://v16.fanfilm4k.media';
const FANFILM_BLOCKLIST = ['pravoobladateljam','politika','contacts','about','policy','privacy','terms','faq','search','login','register','news','comments','sitemap','404','error'];

function isFanfilmMovieUrl(url) {
  var slug = url.split('/').pop().replace('.html', '').toLowerCase();
  for (var i = 0; i < FANFILM_BLOCKLIST.length; i++) {
    if (slug.indexOf(FANFILM_BLOCKLIST[i]) !== -1) return false;
  }
  if (!/\d{4}/.test(slug)) return false;
  return true;
}

async function handleFanfilmSearch(query, corsHeaders) {
  try {
    var body = 'do=search&subaction=search&story=' + encodeURIComponent(query) + '&search_start=0&full_search=0&result_from=1';
    var resp = await fetch(FANFILM_BASE + '/index.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': FANFILM_BASE + '/',
        'Origin': FANFILM_BASE
      },
      body: body
    });
    var html = await resp.text();
    var results = [];
    var re = /<a[^>]*href="([^"]*\.html)"[^>]*>[\s\S]*?<img[^>]*src="([^"]*)"[^>]*>/g;
    var m;
    var seen = {};
    while ((m = re.exec(html)) !== null) {
      var pUrl = m[1].trim();
      var pPoster = m[2].trim();
      if (pUrl.indexOf('http') !== 0) pUrl = FANFILM_BASE + pUrl;
      if (pPoster.indexOf('http') !== 0) pPoster = FANFILM_BASE + pPoster;
      if (seen[pUrl]) continue;
      if (!isFanfilmMovieUrl(pUrl)) continue;
      seen[pUrl] = true;
      var slug = pUrl.split('/').pop().replace('.html', '');
      var allYears = slug.match(/(19\d{2}|20\d{2})/g);
      var yearMatch = allYears ? allYears[allYears.length - 1] : null;
      var titleFromSlug = slug.replace(/^\d+-/, '').replace(/-\d{4}$/, '').replace(/-/g, ' ');
      var title = titleFromSlug.charAt(0).toUpperCase() + titleFromSlug.slice(1);
      if (yearMatch) title += ' (' + yearMatch + ')';
      results.push({ title: title, url: pUrl, poster: pPoster });
    }
    return new Response(JSON.stringify({ results: results.slice(0, 10) }), {
      status: 200, headers: corsHeaders
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message, results: [] }), {
      status: 200, headers: corsHeaders
    });
  }
}

async function handleFanfilmPage(pageUrl, corsHeaders) {
  try {
    var resp = await fetch(pageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': FANFILM_BASE + '/'
      }
    });
    var html = await resp.text();
    var data = { url: pageUrl, title: '', year: '', poster: '', kpId: '', iframeUrl: '', quality: '', rating: '' };

    var h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    if (h1Match) data.title = h1Match[1].replace(/<[^>]+>/g, '').trim();

    var titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/);
    if (titleTag && !data.title) data.title = titleTag[1].replace(/<[^>]+>/g, '').split('—')[0].trim();

    var yearMatch = html.match(/pmovie__original-title[^>]*>[\s\S]*?(\d{4})/);
    if (!yearMatch) yearMatch = html.match(/<title[^>]*>.*?(\d{4})/);
    if (yearMatch) data.year = yearMatch[1];

    var posterMatch = html.match(/ya:ovs:poster"\s*content="([^"]*)"/);
    if (!posterMatch) posterMatch = html.match(/og:image"\s*content="([^"]*)"/);
    if (posterMatch) {
      data.poster = posterMatch[1];
      if (data.poster.indexOf('http') !== 0) data.poster = FANFILM_BASE + data.poster;
    }

    var kpMatch = html.match(/data-id="(\d+)"/);
    if (kpMatch) data.kpId = kpMatch[1];

    var iframeMatch = html.match(/<iframe[^>]*src="(https?:\/\/[^"]*stravers\.live[^"]*)"[^>]*>/);
    if (iframeMatch) data.iframeUrl = iframeMatch[1];

    if (html.indexOf('4K') !== -1) data.quality = '4K';
    else if (html.indexOf('1080') !== -1) data.quality = '1080p';
    else data.quality = 'HD';

    var ratingMatch = html.match(/rating-value[^>]*>([\d.,]+)/);
    if (ratingMatch) data.rating = ratingMatch[1].replace(',', '.');

    var skipPages = ['правообладателям','политика','контакты','о нас'];
    if (skipPages.indexOf((data.title || '').toLowerCase()) !== -1 || !data.iframeUrl) {
      return new Response(JSON.stringify({ error: 'not a movie page', url: pageUrl, title: data.title }), {
        status: 200, headers: corsHeaders
      });
    }

    return new Response(JSON.stringify(data), {
      status: 200, headers: corsHeaders
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 200, headers: corsHeaders
    });
  }
}
