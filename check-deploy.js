const https = require('https');
https.get('https://gavgavrilov2.github.io/iframe-cloud-lampa/iframe_cloud.js', res => {
  let d=''; res.on('data',c=>d+=c);
  res.on('end',()=>{
    console.log('Status:', res.statusCode);
    const versionMatch = d.match(/Loading v(\d+\.\d+\.\d+)/);
    console.log('Version:', versionMatch ? versionMatch[1] : 'not found');
    console.log('Has Player.on close handler:', d.includes("Player.on('close'") ? 'YES' : 'NO');
  });
}).on('error', e => console.log('Error:', e.message));
