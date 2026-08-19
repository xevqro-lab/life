const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

function sameOrigin(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  try {
    if (origin) return new URL(origin).host === host;
    if (referer) return new URL(referer).host === host;
  } catch {}
  return true;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!sameOrigin(req)) return res.status(403).json({ error: 'Forbidden' });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'OPENROUTER_API_KEY is not configured' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const text = String(body.text || '').trim().slice(0, 4000);
    if (!text) return res.status(400).json({ error: 'Empty food description' });

    const prompt = `Разбери еду пользователя и оцени калорийность. Верни ТОЛЬКО JSON без markdown: {"items":[{"name":"название по-русски","amount":"количество/вес","kcal":123,"approx":true}],"total":123,"confidence":"ai","note":"короткое примечание при необходимости"}. Если точный вес не дан, используй разумную типичную порцию и ставь approx=true. Не добавляй продукты, которых пользователь не упомянул. Текст: ${text}`;

    const r = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': `https://${req.headers['x-forwarded-host'] || req.headers.host || 'lifeflow.vercel.app'}`,
        'X-Title': 'LifeFlow'
      },
      body: JSON.stringify({ model: 'openrouter/free', messages: [{ role: 'user', content: prompt }], temperature: 0.1, max_tokens: 500 })
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(r.status).json({ error: data?.error?.message || 'OpenRouter error' });
    let content = data?.choices?.[0]?.message?.content || '';
    content = content.replace(/^```json\s*/i, '').replace(/```$/,'').trim();
    const out = JSON.parse(content);
    if (!Array.isArray(out.items)) throw new Error('Invalid food response');
    out.total = Number(out.total) || out.items.reduce((a,x) => a + (Number(x.kcal) || 0), 0);
    out.confidence = 'ai';
    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'Server error' });
  }
}
