// Cloudflare Worker: starts the research_model_2 daily update on time
// (GitHub's own schedule can be hours late). Separate from midcap-desk-timer.
const REPO = 'tejas14193/research_model_2';
async function dispatch(env) {
  const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/daily.yml/dispatches`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'rm2-timer', 'X-GitHub-Api-Version': '2022-11-28' },
    body: JSON.stringify({ ref: 'main', inputs: { mode: 'update' } })
  });
  return r.status;
}
export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(dispatch(env).then(s => console.log('dispatch', s)));
  },
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/check') {
      if (!env.GH_TOKEN) return new Response('GH_TOKEN missing', { status: 500 });
      const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/daily.yml`, {
        headers: { Authorization: `Bearer ${env.GH_TOKEN}`, 'User-Agent': 'rm2-timer', Accept: 'application/vnd.github+json' } });
      return new Response(r.ok ? 'Token OK' : 'Token problem: HTTP ' + r.status, { status: r.ok ? 200 : 500 });
    }
    return new Response('research_model_2 timer. /check tests the token.');
  }
};
