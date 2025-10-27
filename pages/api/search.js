import { BskyAgent } from "@atproto/api";

function toRkey(uri) {
  // at://did:plc:.../app.bsky.feed.post/3lajf... -> rkey at end
  const parts = uri.split("/");
  return parts[parts.length - 1];
}

function escapeHtml(str="") {
  return str
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;");
}

export default async function handler(req, res) {
  try {
    const { q="", hours="6", minReposts="10", minLikes="0", limit="50" } = req.query;

    if (!process.env.BLUESKY_HANDLE || !process.env.BLUESKY_APP_PASSWORD) {
      return res.status(500).json({ error: "Missing Bluesky credentials on server."});
    }
    if (!q.trim()) return res.status(400).json({ error: "Missing query." });

    const sinceMs = Date.now() - Number(hours) * 3600_000;
    const sinceIso = new Date(sinceMs).toISOString();

    const agent = new BskyAgent({ service: "https://api.bsky.app" });
    await agent.login({
      identifier: process.env.BLUESKY_HANDLE,
      password: process.env.BLUESKY_APP_PASSWORD,
    });

    // Search posts (server-side). Bluesky supports search with filters.
    // We'll page through results up to `limit`.
    // API: app.bsky.feed.searchPosts q + since (server may use sortAt/indexedAt).
    // Docs: https://docs.bsky.app/docs/api/app-bsky-feed-search-posts
    let cursor = undefined;
    const out = [];
    while (out.length < Number(limit)) {
      const r = await agent.app.bsky.feed.searchPosts({
        q,
        sort: "latest",
        since: sinceIso,  // server may interpret via sortAt/indexedAt
        limit: Math.min(25, Number(limit) - out.length),
        cursor,
      });
      const batch = r.data?.posts || [];
      if (!batch.length) break;
      out.push(...batch);
      cursor = r.data?.cursor;
      if (!cursor) break;
    }

    // Filter and score
    const minR = Number(minReposts);
    const minL = Number(minLikes);
    const filtered = out
      .map(p => {
        const text = p.record?.text || "";
        const textHtml = escapeHtml(text)
          .replace(/(https?:\/\/\S+)/g, '<a href="$1" target="_blank" rel="noreferrer">$1</a>');
        return {
          uri: p.uri,
          rkey: toRkey(p.uri),
          author: p.author,
          text,
          textHtml,
          indexedAt: p.indexedAt || p.record?.createdAt,
          repostCount: p.repostCount || 0,
          likeCount: p.likeCount || 0,
          url: `https://bsky.app/profile/${p.author?.handle}/post/${toRkey(p.uri)}`,
        };
      })
      .filter(p => p.repostCount >= minR && p.likeCount >= minL)
      .sort((a,b) => (b.repostCount + b.likeCount) - (a.repostCount + a.likeCount));

    // Build compact HTML list for Presto paste
    const itemsHtml = filtered.map(p => {
      const safe = escapeHtml(p.text);
      return `
<li>
  <p><strong>@${p.author?.handle}</strong>: ${safe}</p>
  <p><em>Reposts:</em> ${p.repostCount} · <em>Likes:</em> ${p.likeCount} — <a href="${p.url}" target="_blank">link</a></p>
</li>`;
    }).join("\n");

    const prepHtml = `<ul>\n${itemsHtml}\n</ul>`;

    res.status(200).json({
      count: filtered.length,
      posts: filtered,
      prepHtml,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || "Server error" });
  }
}
