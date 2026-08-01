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
    const proxyUrl = url.searchParams.get('proxy');
    const apiKey = url.searchParams.get('apikey');
    const apiUrl = url.searchParams.get('api');
    const vkSearch = url.searchParams.get('vksearch');
    const vkYear = url.searchParams.get('year');

    if (vkSearch) {
      return await handleVkSearch(vkSearch, vkYear, corsHeaders);
    }

    if (kpuUrl) {
      return await handleKpuProxy(kpuUrl, corsHeaders);
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

    if (vkStream) {
      return await handleVkStream(vkStream, corsHeaders, request);
    }

    if (vkOwnerId && vkVideoId) {
      return await handleVkStreamProxy(vkOwnerId, vkVideoId, vkQuality, vkQuery, vkYear, corsHeaders, request);
    }

    return new Response(JSON.stringify({ error: 'Usage: ?vksearch=QUERY&year=YEAR or ?vkstream=URL or ?oid=X&vid=Y&qual=mp4_1080 or ?kpu=URL or ?proxy=URL or ?api=URL&apikey=TOKEN' }), {
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
      if (titleLower.indexOf(searchTitle) === -1 && searchTitle.indexOf(titleLower) === -1) continue;

      if (titleLower.indexOf('трейлер') !== -1 || titleLower.indexOf('trailer') !== -1 ||
          titleLower.indexOf('премьера') !== -1 || titleLower.indexOf('обзор') !== -1 ||
          titleLower.indexOf('сезон') !== -1 || titleLower.indexOf('серия') !== -1 ||
          titleLower.indexOf('серий') !== -1) continue;

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

    videos.sort(function(a, b) {
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
    var mp4Url = null;

    if (query) {
      try {
        var token = await getVkToken();
        if (token) {
          var searchQ = query + (year ? ' ' + year : '');
          var body = 'v=5.264&client_id=' + VK_CLIENT_ID + '&q=' + encodeURIComponent(searchQ) + '&access_token=' + token;
          var searchResp = await fetch('https://api.vkvideo.ru/method/catalog.getVideoSearchWeb2', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body
          });
          var searchJson = await searchResp.json();
          var items = (searchJson.response && searchJson.response.catalog_videos) || [];

          for (var i = 0; i < items.length; i++) {
            var v = items[i].video;
            if (!v || !v.files) continue;
            if (String(v.owner_id) !== String(ownerId) || String(v.id) !== String(videoId)) continue;

            var qList = [quality, 'mp4_1080', 'mp4_720', 'mp4_480', 'mp4_360'];
            for (var q = 0; q < qList.length; q++) {
              if (v.files[qList[q]]) {
                mp4Url = v.files[qList[q]];
                break;
              }
            }
            break;
          }
        }
      } catch (e) {}
    }

    if (!mp4Url) {
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

      var qualityPriority = [quality, 'mp4_720', 'mp4_480', 'mp4_360'];
      for (var p = 0; p < qualityPriority.length; p++) {
        var qKey = qualityPriority[p];
        var re = new RegExp('"' + qKey + '"\\s*:\\s*"(https?:\\\\/\\\\/[^"]+)"');
        var m = html.match(re);
        if (m && m[1]) {
          mp4Url = m[1].replace(/\\\//g, '/');
          break;
        }
      }

      if (!mp4Url) {
        var allMp4 = html.match(/https?:\/\/vkvd\d+\.okcdn\.ru\/\?[^\s"'<>]+/g);
        if (allMp4 && allMp4.length) {
          mp4Url = allMp4[0].replace(/\\\//g, '/');
        }
      }
    }

    if (!mp4Url) {
      return new Response(JSON.stringify({ error: 'No mp4 URL found', owner_id: ownerId, video_id: videoId }), { status: 404, headers: corsHeaders });
    }

    var target = new URL(mp4Url);
    var reqHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
      'Referer': 'https://vk.com/',
      'Origin': 'https://vk.com'
    };
    if (request && request.headers) {
      var range = request.headers.get('Range');
      if (range) reqHeaders['Range'] = range;
    }

    var resp = await fetch(mp4Url, { headers: reqHeaders, redirect: 'follow' });
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
