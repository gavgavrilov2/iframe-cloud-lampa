export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const tmdbId = url.searchParams.get('id');
    const proxyUrl = url.searchParams.get('proxy');

    if (proxyUrl) {
      return await handleProxy(request, proxyUrl, corsHeaders);
    }

    if (!tmdbId) {
      return new Response(JSON.stringify({ error: 'Missing id parameter' }), {
        status: 400, headers: corsHeaders
      });
    }

    try {
      const iframeUrl = 'https://iframe.cloud/iframe/' + tmdbId;
      const iframeResp = await fetch(iframeUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://iframe.cloud/',
          'Accept': 'text/html,application/xhtml+xml'
        }
      });

      if (!iframeResp.ok) {
        return new Response(JSON.stringify({ error: 'iframe.cloud returned ' + iframeResp.status }), {
          status: 502, headers: corsHeaders
        });
      }

      const iframeHtml = await iframeResp.text();
      const players = extractPlayers(iframeHtml);

      for (let i = 0; i < players.length; i++) {
        const p = players[i];
        try {
          const videoUrl = await findVideoUrl(p.url);
          if (videoUrl) {
            p.video_url = videoUrl;
            p.type = videoUrl.includes('.m3u8') ? 'hls' : 'mp4';
          }
        } catch (e) {}
      }

      return new Response(JSON.stringify({
        tmdb_id: tmdbId,
        players: players
      }), { headers: corsHeaders });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500, headers: corsHeaders
      });
    }
  }
};

async function handleProxy(request, targetUrl, corsHeaders) {
  try {
    const resp = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://iframe.cloud/',
        'Accept': '*/*'
      }
    });

    const headers = { 'Access-Control-Allow-Origin': '*' };
    const ct = resp.headers.get('Content-Type');
    if (ct) headers['Content-Type'] = ct;

    return new Response(resp.body, { status: resp.status, headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: corsHeaders
    });
  }
}

async function findVideoUrl(embedUrl) {
  if (embedUrl.startsWith('//')) embedUrl = 'https:' + embedUrl;

  const resp = await fetch(embedUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8',
      'Referer': 'https://iframe.cloud/'
    },
    redirect: 'follow'
  });

  if (!resp.ok) return null;

  const html = await resp.text();

  const patterns = [
    /(?:src|file|url|source|link)\s*[:=]\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)/gi,
    /(?:src|file|url|source|link)\s*[:=]\s*["'](https?:\/\/[^"']+\.mp4[^"']*)/gi,
    /["'](https?:\/\/[^"']+\.m3u8[^"']*)/gi,
    /["'](https?:\/\/[^"']+\.mp4[^"']*)/gi,
    /videoUrl\s*[=:]\s*["']([^"']+)/gi,
    /playbackUrl\s*[=:]\s*["']([^"']+)/gi
  ];

  for (const regex of patterns) {
    let match;
    while ((match = regex.exec(html)) !== null) {
      const url = match[1] || match[2];
      if (url && (url.includes('.m3u8') || url.includes('.mp4'))) {
        return url.startsWith('//') ? 'https:' + url : url;
      }
    }
  }

  const nestedIframe = html.match(/<iframe[^>]+src=["']([^"']+)/i);
  if (nestedIframe && nestedIframe[1]) {
    let nestedUrl = nestedIframe[1];
    if (nestedUrl.startsWith('//')) nestedUrl = 'https:' + nestedUrl;
    try {
      return await findVideoUrl(nestedUrl);
    } catch (e) {}
  }

  return null;
}

function decodeHtml(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

function fixUrl(url) {
  url = decodeHtml(url);
  if (url.startsWith('http://')) url = 'https://' + url.substring(7);
  return url;
}

function extractPlayers(html) {
  const players = [];
  let match;

  const regex1 = /class="cinemaplayer-item-select"[^>]*data-value="([^"]+)"[^>]*>([^<]*)/g;
  while ((match = regex1.exec(html)) !== null) {
    players.push({ url: fixUrl(match[1]), title: decodeHtml(match[2].trim()) });
  }

  if (!players.length) {
    const regex2 = /data-value="([^"]+)"[^>]*class="cinemaplayer-item-select"/g;
    while ((match = regex2.exec(html)) !== null) {
      players.push({ url: fixUrl(match[1]), title: '' });
    }
  }

  if (!players.length) {
    const regex3 = /data-value="(https?:\/\/[^"]+)"/g;
    while ((match = regex3.exec(html)) !== null) {
      players.push({ url: fixUrl(match[1]), title: '' });
    }
  }

  return players;
}
