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
    const straversUrl = url.searchParams.get('stravers');
    const kinogoSearch = url.searchParams.get('kinogo_search');
    const kinogoInfo = url.searchParams.get('kinogo_info');
    const kinogoEmbed = url.searchParams.get('kinogo_embed');
    const kinogoMulti = url.searchParams.get('kinogo_multi');
    const kinogoStream = url.searchParams.get('kinogo_stream');
    const kinogoPage = url.searchParams.get('kinogo_page');
    const collapsEmbed = url.searchParams.get('collaps_embed');

    var pathMatch = url.pathname.match(/^\/kinogo\/(.+?)\/master\.m3u8$/);
    if (pathMatch) {
      return await handleKinogoMulti(decodeURIComponent(pathMatch[1]).replace(/ /g, '+'), corsHeaders, request);
    }

    if (kinogoMulti) {
      return await handleKinogoMulti(kinogoMulti.replace(/ /g, '+'), corsHeaders, request);
    }

    if (kinogoInfo) {
      return await handleKinogoInfo(kinogoInfo.replace(/ /g, '+'), corsHeaders);
    }

    if (kinogoStream) {
      return await handleKinogoStream(kinogoStream, corsHeaders, request);
    }

    if (kinogoPage) {
      return await handleKinogoPage(kinogoPage, corsHeaders);
    }

    if (kinogoEmbed) {
      return await handleKinogoEmbed(kinogoEmbed.replace(/ /g, '+'), corsHeaders);
    }

    if (kinogoSearch) {
      return await handleKinogoSearch(kinogoSearch, corsHeaders);
    }

    if (collapsEmbed) {
      return await handleCollapsEmbed(collapsEmbed, corsHeaders);
    }

    if (straversUrl) {
      return await handleStraversProxy(straversUrl, corsHeaders);
    }

    if (fanfilmSearch) {
      return await handleFanfilmSearch(fanfilmSearch, corsHeaders);
    }

    if (fanfilmPage) {
      return await handleFanfilmPage(fanfilmPage, corsHeaders);
    }

    if (vkSearch) {
      return await handleVkSearch(vkSearch, vkYear, corsHeaders, env);
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
}

async function handleStraversProxy(targetUrl, corsHeaders) {
  try {
    if (targetUrl.startsWith('//')) targetUrl = 'https:' + targetUrl;
    var resp = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8',
        'Referer': 'https://v16.fanfilm4k.media/',
        'Origin': 'https://v16.fanfilm4k.media'
      },
      redirect: 'follow'
    });
    var html = await resp.text();
    var base = new URL(targetUrl);
    var origin = base.origin;
    html = html.replace(/src="\.\//g, 'src="' + origin + '/');
    html = html.replace(/src="\/\//g, 'src="https://');
    html = html.replace(/href="\.\//g, 'href="' + origin + '/');
    html = html.replace(/href="\/\//g, 'href="https://');
    html = html.replace(/from "\.\/js\//g, 'from "' + origin + '/js/');
    html = html.replace(/fetch\("\//g, 'fetch("' + origin + '/');
    return new Response(html, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache'
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: corsHeaders
    });
  }
}

const KPU_TOKEN = '7edcf64b-b9aa-4f8b-8b5c-ef59bfe69a2c';

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

async function handleKpuProxy(targetUrl, corsHeaders) {
  try {
    var resp = await fetch(targetUrl, {
      headers: { 'X-API-KEY': KPU_TOKEN, 'Accept': 'application/json' },
      redirect: 'follow'
    });
    var data = await resp.text();
    return new Response(data, {
      status: resp.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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

async function getVkToken(env) {
  var now = Date.now();
  if (VK_TOKEN_CACHE.token && VK_TOKEN_CACHE.expires > now) {
    return VK_TOKEN_CACHE.token;
  }

  try {
    var body = 'client_id=' + (env.VK_CLIENT_ID || '52461373') +
      '&client_secret=' + (env.VK_CLIENT_SECRET || 'o557NLIkAErNhakXrQ7A') +
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

async function handleVkSearch(query, year, corsHeaders, env) {
  try {
    var token = await getVkToken(env);
    if (!token) {
      return new Response(JSON.stringify({ error: 'VK token failed', videos: [] }), {
        status: 200, headers: corsHeaders
      });
    }

    var searchQ = query;
    if (year) searchQ += ' ' + year;

    var body = 'v=5.264' +
      '&client_id=' + (env.VK_CLIENT_ID || '52461373') +
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

    var titles = {};
    var titRe = /<div class="infoca">\s*<a href="([^"]*\.html)">([\s\S]*?)<\/a>/g;
    var tm;
    while ((tm = titRe.exec(html)) !== null) {
      var tUrl = tm[1].trim();
      var tTitle = tm[2].replace(/<[^>]+>/g, '').trim();
      if (tTitle) titles[tUrl] = tTitle;
    }

    var results = [];
    var re = /<a[^>]*class="[^"]*card__img[^"]*"[^>]*href="([^"]*\.html)"[^>]*>\s*<img[^>]*src="([^"]*)"[^>]*>/g;
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

      var title = titles[pUrl] || '';
      if (!title) {
        var slug = pUrl.split('/').pop().replace('.html', '');
        var allYears = slug.match(/(19\d{2}|20\d{2})/g);
        var yearMatch = allYears ? allYears[allYears.length - 1] : null;
        var titleFromSlug = slug.replace(/^\d+-/, '').replace(/-\d{4}$/, '').replace(/-/g, ' ');
        title = titleFromSlug.charAt(0).toUpperCase() + titleFromSlug.slice(1);
        if (yearMatch) title += ' (' + yearMatch + ')';
      } else {
        var slug2 = pUrl.split('/').pop().replace('.html', '');
        var allYears2 = slug2.match(/(19\d{2}|20\d{2})/g);
        var year2 = allYears2 ? allYears2[allYears2.length - 1] : null;
        if (year2) title += ' (' + year2 + ')';
      }

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

    var origMatch = html.match(/pmovie__original-title[^>]*>([\s\S]*?)<\/div>/);
    if (origMatch) {
      var origParts = origMatch[1].replace(/<[^>]+>/g, '').split('|').map(function(s) { return s.trim(); });
      if (origParts[0]) data.originalTitle = origParts[0];
      if (origParts.length >= 3) data.year = origParts[origParts.length - 1];
      else if (origParts.length === 2) data.year = origParts[1];
    }

    if (!data.year) {
      var yearMatch = html.match(/<title[^>]*>.*?\((\d{4})/);
      if (yearMatch) data.year = yearMatch[1];
    }

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

    if (html.indexOf('data-tab="4kplayer"') !== -1) data.quality = '4K';
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

/* ======================== KINOGO / CINEMAR ======================== */

var KINOGO_BASE = 'https://uakinogo.io';
var KINOGO_VERCEL_PROXY = 'https://iframe-cloud-proxy.vercel.app/api/proxy';

async function fetchViaVercel(targetUrl, referer) {
  var proxyUrl = KINOGO_VERCEL_PROXY + '?url=' + encodeURIComponent(targetUrl);
  if (referer) proxyUrl += '&referer=' + encodeURIComponent(referer);
  var resp = await fetch(proxyUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
    }
  });
  return resp;
}

async function fetchViaVercelWithFallback(targetUrl, referer) {
  try {
    var resp = await fetchViaVercel(targetUrl, referer);
    var text = await resp.text();
    if (!text || text.length < 20) throw new Error('Empty response');
    return { text: text, ok: true };
  } catch(e) {
    try {
      var directResp = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/vnd.apple.mpegurl',
          'Accept-Language': 'ru-RU,ru;q=0.9',
          'Referer': referer || ''
        }
      });
      var directText = await directResp.text();
      return { text: directText, ok: true };
    } catch(e2) {
      return { text: '', ok: false };
    }
  }
}

async function handleKinogoSearch(query, corsHeaders) {
  try {
    var searchUrl = KINOGO_BASE + '/index.php?do=search&subaction=search&story=' + encodeURIComponent(query);
    var resp = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ru-RU,ru;q=0.9'
      }
    });
    var html = await resp.text();

    var results = [];
    var re = /<article[\s\S]*?<h2[^>]*>\s*<a[^>]*href="([^"]*)"[^>]*title="([^"]*)"[^>]*>([\s\S]*?)<\/a><\/h2>[\s\S]*?<img[^>]*data-src="([^"]*)"/g;
    var m;
    while ((m = re.exec(html)) !== null) {
      var pageUrl = m[1].trim();
      var imgTitle = m[2].trim();
      var h2Text = m[3].replace(/<[^>]+>/g, '').trim();
      var poster = m[4].trim();
      if (poster.indexOf('http') !== 0) poster = KINOGO_BASE + poster;

      var yearMatch = h2Text.match(/\((\d{4})\s*(?:-\s*(\d{4}))?\)/);
      var year = yearMatch ? yearMatch[1] : '';
      var title = h2Text.replace(/\s*\(\d{4}(?:\s*-\s*\d{4})?\)\s*/g, '').trim();
      if (!title) title = imgTitle;

      var type = pageUrl.indexOf('/filmy/') !== -1 ? 'film' : 'serial';

      results.push({ title: title, year: year, url: pageUrl, poster: poster, type: type });
    }

    return new Response(JSON.stringify({ results: results.slice(0, 20) }), {
      status: 200, headers: corsHeaders
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message, results: [] }), {
      status: 200, headers: corsHeaders
    });
  }
}

async function handleKinogoPage(pageUrl, corsHeaders) {
  try {
    var result = await fetchViaVercelWithFallback(pageUrl, KINOGO_BASE + '/');
    var html = result.text;

    var embedMatch = html.match(/data-src="(https?:\/\/cinemar\.cc\/embed\/[^"]+)"/);
    if (!embedMatch) embedMatch = html.match(/data-src="(\/\/cinemar\.cc\/embed\/[^"]+)"/);
    if (!embedMatch) embedMatch = html.match(/src="(https?:\/\/cinemar\.cc\/embed\/[^"]+)"/);

    var ortifiedUrl = null;
    var ortifiedMatch = html.match(/data-src="(https?:\/\/api\.ortified\.ws\/embed\/[^"]+)"/);
    if (ortifiedMatch) ortifiedUrl = ortifiedMatch[1];

    var hasCinemar = !!embedMatch;
    var titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    var title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').replace(/\s*\(\d{4}\)\s*/, '').trim() : '';
    var yearMatch = html.match(/Год выпуска[^<]*<a[^>]*>(\d{4})/);
    var year = yearMatch ? yearMatch[1] : '';

    return new Response(JSON.stringify({
      embedUrl: embedMatch ? embedMatch[1] : null,
      ortifiedUrl: ortifiedUrl,
      isOrtified: !!(embedMatch && embedMatch[1] && embedMatch[1].indexOf('ortified.ws') !== -1),
      hasCinemar: hasCinemar,
      title: title,
      year: year,
      url: pageUrl
    }), { status: 200, headers: corsHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message, embedUrl: null }), {
      status: 200, headers: corsHeaders
    });
  }
}

async function handleKinogoEmbed(embedUrl, corsHeaders) {
  try {
    if (embedUrl.startsWith('//')) embedUrl = 'https:' + embedUrl;

    var result = await fetchViaVercelWithFallback(embedUrl, KINOGO_BASE + '/');
    var html = result.text;

    var fileMatch = html.match(/"file"\s*:\s*"([\s\S]+?)"/);
    if (!fileMatch) {
      return new Response(JSON.stringify({ error: 'No file found in embed', playlist: [] }), {
        status: 200, headers: corsHeaders
      });
    }

    var encoded = fileMatch[1];
    var playlist = decodePlayerjs(encoded);

    return new Response(JSON.stringify({ playlist: playlist }), {
      status: 200, headers: corsHeaders
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message, playlist: [] }), {
      status: 200, headers: corsHeaders
    });
  }
}

function decodePlayerjs(encoded) {
  if (!encoded || typeof encoded !== 'string') return [];

  if (encoded.indexOf('#2') === 0) {
    var data = encoded.substring(2);
    var separatorCode = parseInt(data.substring(0, 2));
    var separator = String.fromCharCode(separatorCode);
    var parts = data.substring(2).split(separator);
    var ml = 32;

    var sliced = parts.map(function(part) {
      var t = parseInt(part.slice(-1));
      if (part.length > ml) {
        return part.substring(2 * t, 2 * t + part.length - 3 * t - 1) + part.substring(0, t);
      }
      return part;
    });

    var val = sliced.join('');
    var padding = val.length % 4;
    if (padding) val += '='.repeat(4 - padding);

    try {
      var decoded = atob(val);
      return JSON.parse(decoded);
    } catch (e) {
      return [];
    }
  }

  try {
    var tryDecoded = atob(encoded);
    var tryParsed = JSON.parse(tryDecoded);
    if (Array.isArray(tryParsed)) return tryParsed;
  } catch (e) {}

  console.log('[Worker] decodePlayerjs: unknown format, prefix=' + (encoded.substring(0, 4)));
  return [];
}

async function handleKinogoInfo(embedUrl, corsHeaders) {
  try {
    if (embedUrl.startsWith('//')) embedUrl = 'https:' + embedUrl;

    var result = await fetchViaVercelWithFallback(embedUrl, KINOGO_BASE + '/');
    var html = result.text;

    var fileMatch = html.match(/"file"\s*:\s*"([\s\S]+?)"/);
    if (!fileMatch) {
      return new Response(JSON.stringify({ tracks: [], m3u8: null }), {
        status: 200, headers: corsHeaders
      });
    }

    var playlist = decodePlayerjs(fileMatch[1]);
    if (!playlist || !playlist.length) {
      return new Response(JSON.stringify({ tracks: [], m3u8: null }), {
        status: 200, headers: corsHeaders
      });
    }

    var tracks = [];
    var firstFile = null;
    for (var i = 0; i < playlist.length; i++) {
      var item = playlist[i];
      if (!item.file) continue;
      var voiceName = item.title || 'Voice ' + (i + 1);
      voiceName = voiceName.replace(/<[^>]+>/g, '').replace(/,/g, ' ').trim();
      if (!voiceName) voiceName = 'Voice ' + (i + 1);

      if (!firstFile) firstFile = item.file;

      tracks.push({
        name: voiceName,
        lang: 'ru',
        subtitles: item.subtitle || '',
        file: item.file || ''
      });
    }

    var encodedEmbed = embedUrl;
    try { encodedEmbed = encodeURIComponent(embedUrl); } catch(e) {}
    var m3u8Path = '/kinogo/' + encodedEmbed + '/master.m3u8';

    var directM3u8 = null;
    if (firstFile) {
      var fileUrl = firstFile;
      if (fileUrl.startsWith('//')) fileUrl = 'https:' + fileUrl;
      var vercelBase = 'https://iframe-cloud-proxy.vercel.app/api/proxy?url=';
      directM3u8 = vercelBase + encodeURIComponent(fileUrl);
    }

    return new Response(JSON.stringify({ tracks: tracks, m3u8: m3u8Path, directM3u8: directM3u8 }), {
      status: 200, headers: corsHeaders
    });
  } catch (e) {
    return new Response(JSON.stringify({ tracks: [], m3u8: null, error: e.message }), {
      status: 200, headers: corsHeaders
    });
  }
}

async function handleKinogoMulti(embedUrl, corsHeaders, request) {
  try {
    if (embedUrl.startsWith('//')) embedUrl = 'https:' + embedUrl;

    var vercelBase = 'https://iframe-cloud-proxy.vercel.app/api/proxy?url=';

    var embedResult = await fetchViaVercelWithFallback(embedUrl, KINOGO_BASE + '/');
    var html = embedResult.text;

    var fileMatch = html.match(/"file"\s*:\s*"([\s\S]+?)"/);
    if (!fileMatch) {
      return new Response('#EXTM3U\n#EXT-X-VERSION:3\n', {
        status: 200,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/vnd.apple.mpegurl' }
      });
    }

    var playlist = decodePlayerjs(fileMatch[1]);
    if (!playlist || !playlist.length) {
      return new Response('#EXTM3U\n#EXT-X-VERSION:3\n', {
        status: 200,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/vnd.apple.mpegurl' }
      });
    }

    var voices = [];
    for (var i = 0; i < playlist.length; i++) {
      var item = playlist[i];
      if (!item.file) continue;
      var voiceName = item.title || 'Voice ' + (i + 1);
      voiceName = voiceName.replace(/<[^>]+>/g, '').replace(/,/g, ' ').trim();
      if (!voiceName) voiceName = 'Voice ' + (i + 1);
      var voiceUrl = item.file;
      if (voiceUrl.indexOf('http') !== 0) voiceUrl = 'https:' + voiceUrl;
      try { voiceUrl = decodeURIComponent(voiceUrl); } catch(e) {}
      voices.push({ name: voiceName, url: voiceUrl });
    }

    if (!voices.length) {
      return new Response('#EXTM3U\n#EXT-X-VERSION:3\n', {
        status: 200,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/vnd.apple.mpegurl' }
      });
    }

    var firstMasterVercel = vercelBase + encodeURIComponent(voices[0].url);
    var variantResp = await fetch(firstMasterVercel);
    var variantM3u8 = await variantResp.text();
    var variants = parseVariantsFromM3u8(variantM3u8);

    var voiceSuffixes = [''];
    for (var v = 1; v < voices.length; v++) {
      var hm = voices[v].url.match(/hls(-[^.]+)\.m3u8$/);
      voiceSuffixes.push(hm ? hm[1] : '');
    }

    if (!variants.length) {
      return new Response('#EXTM3U\n#EXT-X-VERSION:3\n', {
        status: 200,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/vnd.apple.mpegurl' }
      });
    }

    var audioVariant = variants[0];
    for (var q = 1; q < variants.length; q++) {
      if (variants[q].bandwidth > audioVariant.bandwidth) audioVariant = variants[q];
    }

    var lines = ['#EXTM3U', '#EXT-X-VERSION:3'];

    for (var v = 0; v < voices.length; v++) {
      var voice = voices[v];
      var defaultAttr = v === 0 ? ',DEFAULT=YES' : '';
      var autoSelect = v === 0 ? ',AUTOSELECT=YES' : '';
      var audioUrl = replaceVariantSuffix(audioVariant.url, voiceSuffixes[v]);
      lines.push('#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio"' + defaultAttr + autoSelect + ',URI="' + audioUrl + '",NAME="' + voice.name + '"');
    }

    for (var q = 0; q < variants.length; q++) {
      var variant = variants[q];
      lines.push('#EXT-X-STREAM-INF:BANDWIDTH=' + variant.bandwidth + ',RESOLUTION=' + variant.resolution + ',CODECS="avc1.4d401f,mp4a.40.2",AUDIO="audio"');
      lines.push(variant.url);
    }

    lines.push('#EXT-X-ENDLIST');
    return new Response(lines.join('\n'), {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-cache'
      }
    });
  } catch (e) {
    return new Response('#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-ENDLIST\n', {
      status: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/vnd.apple.mpegurl' }
    });
  }
}

function parseVariantsFromM3u8(m3u8) {
  var lines = m3u8.split('\n');
  var variants = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (line.indexOf('#EXT-X-STREAM-INF:') === 0) {
      var nextLine = (i + 1 < lines.length) ? lines[i + 1].trim() : '';
      if (!nextLine || nextLine.indexOf('#') === 0) continue;
      if (nextLine.indexOf('http') !== 0) continue;
      var bwMatch = line.match(/BANDWIDTH=(\d+)/);
      var bw = bwMatch ? parseInt(bwMatch[1]) : 1000000;
      var resMatch = line.match(/RESOLUTION=(\d+x\d+)/);
      var res = resMatch ? resMatch[1] : '1280x720';
      var quality = nextLine.match(/\.(\d+)\.mp4/);
      var qNum = quality ? parseInt(quality[1]) : 0;
      variants.push({ bandwidth: bw, resolution: res, url: nextLine, quality: qNum });
    }
  }
  variants.sort(function(a, b) { return b.quality - a.quality; });
  return variants;
}

function replaceVariantSuffix(url, newSuffix) {
  var match = url.match(/url=([^&]+)/);
  if (match) {
    var originalUrl = decodeURIComponent(match[1]);
    originalUrl = originalUrl.replace(/\.m3u8$/, newSuffix + '.m3u8');
    return 'https://iframe-cloud-proxy.vercel.app/api/proxy?url=' + encodeURIComponent(originalUrl);
  }
  return url.replace(/\.m3u8$/, newSuffix + '.m3u8');
}

function parseVariants(m3u8, workerOrigin, baseProxyUrl) {
  var lines = m3u8.split('\n');
  var variants = [];
  var bandwidthMap = { '240': 406000, '360': 696000, '480': 1328000, '720': 2892000, '1080': 5592000 };
  var resMap = { '240': '426x240', '360': '640x360', '480': '854x480', '720': '1280x720', '1080': '1920x1080' };

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (line.indexOf('#EXT-X-STREAM-INF:') === 0) {
      var nextLine = (i + 1 < lines.length) ? lines[i + 1].trim() : '';
      if (nextLine && nextLine.indexOf('#') !== 0) {
        var bwMatch = line.match(/BANDWIDTH=(\d+)/);
        var bw = bwMatch ? parseInt(bwMatch[1]) : 1000000;
        var resMatch = line.match(/RESOLUTION=(\d+x\d+)/);
        var res = resMatch ? resMatch[1] : '1280x720';

        var quality = nextLine.match(/\.(\d+)\.mp4/);
        var qNum = quality ? quality[1] : '';

        var fullUrl = nextLine;
        if (nextLine.indexOf('http') !== 0) {
          var baseParts = baseProxyUrl.split('=');
          var originalBase = decodeURIComponent(baseParts[1] || '');
          var dir = originalBase.replace(/\/[^\/]*$/, '/');
          fullUrl = dir + nextLine;
        }

        var proxyUrl = workerOrigin + '/?kinogo_stream=' + encodeURIComponent(fullUrl);

        variants.push({
          bandwidth: bw,
          resolution: res,
          proxyUrl: proxyUrl,
          quality: qNum
        });
      }
    }
  }

  variants.sort(function(a, b) {
    var aQ = parseInt(a.quality) || 0;
    var bQ = parseInt(b.quality) || 0;
    return bQ - aQ;
  });

  return variants;
}

async function handleKinogoStream(streamUrl, corsHeaders, request) {
  try {
    var decodedUrl = streamUrl;
    try { decodedUrl = decodeURIComponent(decodedUrl); } catch(e) {}
    if (decodedUrl.indexOf('%') !== -1) { try { decodedUrl = decodeURIComponent(decodedUrl); } catch(e) {} }
    if (decodedUrl.indexOf('http') !== 0) decodedUrl = 'https:' + decodedUrl;

    var reqHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Referer': 'https://cinemar.cc/',
      'Origin': 'https://cinemar.cc'
    };
    if (request && request.headers) {
      var range = request.headers.get('Range');
      if (range) reqHeaders['Range'] = range;
    }

    var resp = await fetch(decodedUrl, { headers: reqHeaders, redirect: 'follow' });
    var respHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Range'
    };

    var ct = resp.headers.get('Content-Type');
    var isM3u8 = ct && ct.indexOf('mpegurl') !== -1;
    if (!isM3u8 && decodedUrl.indexOf('.m3u8') !== -1) isM3u8 = true;
    respHeaders['Content-Type'] = ct || 'video/mp4';

    var cl = resp.headers.get('Content-Length');
    if (cl) respHeaders['Content-Length'] = cl;
    var cr = resp.headers.get('Content-Range');
    if (cr) respHeaders['Content-Range'] = cr;
    var ar = resp.headers.get('Accept-Ranges');
    if (ar) respHeaders['Accept-Ranges'] = ar;

    if (isM3u8) {
      var body = await resp.text();
      var rewritten = rewriteKinogoUrls(body, decodedUrl, new URL(request.url).origin);
      return new Response(rewritten, { status: resp.status, headers: respHeaders });
    }

    return new Response(resp.body, { status: resp.status, headers: respHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
}

function rewriteKinogoUrls(m3u8, baseUrl, workerOrigin) {
  var lines = m3u8.split('\n');
  var baseDir = baseUrl.replace(/\/[^\/]*$/, '/');

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line || line.startsWith('#') || line.indexOf('kinogo_stream=') !== -1) continue;

    var fullUrl = line;
    if (line.indexOf('http') !== 0) {
      if (line.indexOf('./') === 0) line = line.substring(2);
      fullUrl = baseDir + line;
    }

    lines[i] = workerOrigin + '/?kinogo_stream=' + encodeURIComponent(fullUrl);
  }

  return lines.join('\n');
}

async function handleCollapsEmbed(embedUrl, corsHeaders) {
  try {
    var referer = 'https://uakinogo.io/';
    if (embedUrl.indexOf('cinemap.cc') !== -1) referer = 'https://cinemar.cc/';
    else if (embedUrl.indexOf('cinemar.') !== -1) referer = 'https://cinemar.cc/';

    var resp = await fetch(embedUrl, {
      headers: { 'Referer': referer, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    var html = await resp.text();

    var names = [];
    var audioMatch = html.match(/audio\s*:\s*(\{[^}]+\})/);
    if (audioMatch) {
      try {
        var audioObj = eval('(' + audioMatch[1] + ')');
        if (audioObj && audioObj.names) {
          names = audioObj.names.filter(function(n) { return n && n !== 'delete'; });
        }
      } catch(e) {}
    }

    return new Response(JSON.stringify({ names: names }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch(e) {
    return new Response(JSON.stringify({ names: [], error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
