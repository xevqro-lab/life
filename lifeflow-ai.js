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
    const message = String(body.message || '').trim().slice(0, 5000);
    if (!message) return res.status(400).json({ error: 'Empty message' });

    const snapshot = body.snapshot && typeof body.snapshot === 'object' ? body.snapshot : {};
    const history = Array.isArray(body.history) ? body.history.slice(-12) : [];
    const system = `Ты LifeFlow AI — персональный помощник внутри приложения пользователя. Отвечай по-русски, кратко и конкретно. Используй ТОЛЬКО переданные данные LifeFlow как персональные факты; не выдумывай отсутствующие значения. Помогай с задачами, существующими привычками, переездом в Медельин, финансами, весом и питанием. Не добавляй пользователю новые привычки как будто они уже существуют: можешь предложить идею отдельно. Для медицинских вопросов не ставь диагнозы. Текущий снимок LifeFlow (JSON): ${JSON.stringify(snapshot).slice(0, 14000)}`;

    const messages = [
      { role: 'system', content: system },
      ...history.filter(x => x && ['user','assistant'].includes(x.role) && typeof x.content === 'string').map(x => ({ role: x.role, content: x.content.slice(0, 4000) })),
      { role: 'user', content: message }
    ];

    const r = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': `https://${req.headers['x-forwarded-host'] || req.headers.host || 'lifeflow.vercel.app'}`,
        'X-Title': 'LifeFlow'
      },
      body: JSON.stringify({ model: 'openrouter/free', messages, temperature: 0.35, max_tokens: 700 })
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(r.status).json({ error: data?.error?.message || 'OpenRouter error' });
    const text = data?.choices?.[0]?.message?.content;
    if (!text) return res.status(502).json({ error: 'Empty model response' });
    return res.status(200).json({ text, model: data.model || 'openrouter/free' });
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'Server error' });
  }
}
