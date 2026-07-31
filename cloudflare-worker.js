addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
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

  if (!tmdbId) {
    return new Response(JSON.stringify({ error: 'Missing id parameter' }), {
      status: 400,
      headers: corsHeaders
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
        status: 502,
        headers: corsHeaders
      });
    }

    const iframeHtml = await iframeResp.text();
    const players = extractPlayers(iframeHtml);

    if (!players.length) {
      return new Response(JSON.stringify({
        error: 'No players found',
        html_length: iframeHtml.length,
        html_snippet: iframeHtml.substring(0, 500)
      }), { status: 404, headers: corsHeaders });
    }

    const results = [];

    for (let i = 0; i < players.length && i < 3; i++) {
      const player = players[i];
      try {
        const videoUrl = await extractVideoUrl(player.url);
        if (videoUrl) {
          results.push({
            title: player.title,
            url: videoUrl.url,
            quality: videoUrl.quality,
            type: videoUrl.type
          });
        }
      } catch (e) {
        results.push({
          title: player.title,
          embed_url: player.url,
          error: e.message
        });
      }
    }

    return new Response(JSON.stringify({
      tmdb_id: tmdbId,
      players_count: players.length,
      players: results
    }), { headers: corsHeaders });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders
    });
  }
}

function extractPlayers(html) {
  const players = [];
  const regex = /class="cinemaplayer-item-select"[^>]*data-value="([^"]+)"[^>]*>([^<]*)</g;
  let match;

  while ((match = regex.exec(html)) !== null) {
    players.push({
      url: match[1],
      title: match[2].trim()
    });
  }

  if (!players.length) {
    const regex2 = /data-value="([^"]+)"[^>]*class="cinemaplayer-item-select"/g;
    while ((match = regex2.exec(html)) !== null) {
      players.push({
        url: match[1],
        title: ''
      });
    }
  }

  if (!players.length) {
    const regex3 = /data-value="(https?:\/\/[^"]+)"/g;
    while ((match = regex3.exec(html)) !== null) {
      players.push({
        url: match[1],
        title: ''
      });
    }
  }

  return players;
}

async function extractVideoUrl(embedUrl) {
  if (embedUrl.startsWith('//')) {
    embedUrl = 'https:' + embedUrl;
  }

  const resp = await fetch(embedUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://iframe.cloud/',
      'Accept': 'text/html,application/xhtml+xml'
    }
  });

  if (!resp.ok) {
    throw new Error('Embed returned ' + resp.status);
  }

  const html = await resp.text();

  const m3u8Match = html.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)/);
  if (m3u8Match) {
    return { url: m3u8Match[1], type: 'hls', quality: 'auto' };
  }

  const mp4Match = html.match(/["'](https?:\/\/[^"']+\.mp4[^"']*)/);
  if (mp4Match) {
    return { url: mp4Match[1], type: 'mp4', quality: 'auto' };
  }

  const srcMatch = html.match(/src:\s*["'](https?:\/\/[^"']+)/);
  if (srcMatch) {
    return { url: srcMatch[1], type: 'auto', quality: 'auto' };
  }

  const videoTag = html.match(/<video[^>]+src=["']([^"']+)/);
  if (videoTag) {
    return { url: videoTag[1], type: 'mp4', quality: 'auto' };
  }

  const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)/);
  if (iframeMatch) {
    return await extractVideoUrl(iframeMatch[1]);
  }

  throw new Error('No video URL found in embed page');
}
