// Vercel Serverless Function: Secure Turso DB Sync Proxy
export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 1. Check Owner Secret Authorization
  const ownerSecret = process.env.OWNER_SECRET_KEY;
  const authHeader = req.headers['authorization'];
  
  if (ownerSecret) {
    if (!authHeader || authHeader !== `Bearer ${ownerSecret}`) {
      return res.status(401).json({
        error: 'Unauthorized: Invalid or missing Owner Secret Key.',
        note: 'Only the site owner can sync to this Turso database.'
      });
    }
  }

  // 2. Fetch Turso Environment Variables
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;

  if (!tursoUrl || !tursoToken) {
    return res.status(500).json({
      error: 'Serverless Configuration Error: TURSO_DATABASE_URL or TURSO_AUTH_TOKEN missing in Vercel Environment Variables.'
    });
  }

  // 3. Format LibSQL HTTP Pipeline Endpoint
  let endpoint = tursoUrl.trim();
  if (endpoint.startsWith('libsql://')) endpoint = endpoint.replace('libsql://', 'https://');
  if (!endpoint.startsWith('http')) endpoint = 'https://' + endpoint;
  endpoint = endpoint.replace(/\/+$/, '');
  if (!endpoint.endsWith('/v2/pipeline')) endpoint += '/v2/pipeline';

  try {
    const tursoResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tursoToken.trim()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(req.body)
    });

    const data = await tursoResponse.json();
    return res.status(tursoResponse.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to communicate with Turso DB: ' + err.message });
  }
}
