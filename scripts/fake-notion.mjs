// Minimal stand-in for the Notion API (query / create / update pages), for local tests only.
//   node scripts/fake-notion.mjs            listens on :8798
//   wrangler dev --var NOTION_TOKEN:x --var NOTION_QUIZ_DB_ID:db --var NOTION_BASE_URL:http://127.0.0.1:8798/v1
//   GET http://127.0.0.1:8798/_dump         every stored page, flattened
import http from 'node:http';

const pages = [];
const plain = (props) =>
  Object.fromEntries(
    Object.entries(props).map(([k, v]) => {
      for (const key of ['title', 'rich_text']) if (v[key]) return [k, { ...v, [key]: v[key].map((t) => ({ ...t, plain_text: t.text?.content ?? '' })) }];
      return [k, v];
    }),
  );
const flat = (p) => ({
  id: p.id,
  status: p.properties.status?.select?.name,
  name: p.properties.name?.title?.[0]?.text?.content,
  size: p.properties.size?.select?.name,
  sink: p.properties.sink?.select?.name,
  booking_clicked: p.properties.booking_clicked?.checkbox,
  analysis_source: p.properties.analysis_source?.select?.name,
  has_analysis: Boolean(p.properties.analysis?.rich_text?.length),
});

http
  .createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const send = (obj, code = 200) => (res.writeHead(code, { 'content-type': 'application/json' }), res.end(JSON.stringify(obj)));
      const data = body ? JSON.parse(body) : {};
      if (req.url === '/_dump') return send(pages.map(flat));
      if (req.method === 'POST' && /\/databases\/[^/]+\/query$/.test(req.url)) {
        const want = data.filter?.rich_text?.equals;
        const hit = pages.filter((p) => p.properties.session_id?.rich_text?.[0]?.text?.content === want);
        return send({ results: hit.map((p) => ({ ...p, properties: plain(p.properties) })) });
      }
      if (req.method === 'POST' && req.url === '/v1/pages') {
        const page = { id: `page-${pages.length + 1}`, url: `https://notion.example/page-${pages.length + 1}`, properties: data.properties };
        pages.push(page);
        return send({ ...page, properties: plain(page.properties) });
      }
      const m = req.url.match(/^\/v1\/pages\/([^/]+)$/);
      if (req.method === 'PATCH' && m) {
        const page = pages.find((p) => p.id === m[1]);
        if (!page) return send({ message: 'not found' }, 404);
        Object.assign(page.properties, data.properties);
        return send({ ...page, properties: plain(page.properties) });
      }
      send({ message: `unhandled ${req.method} ${req.url}` }, 404);
    });
  })
  .listen(8798, () => console.log('fake notion on :8798'));
