import { BskyAgent } from "@atproto/api";

function toRkey(uri) {
  const parts = uri.split("/");
  return parts[parts.length - 1];
}
function escapeHtml(str="") {
  return str.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}

export default async function handler(req, res) {
  try {
    const { q="", hours="6", minReposts="10", minLikes="0", limit="50" } = req.query;

    if (!process.env.BLUESKY_HANDLE || !process.env.BLUESKY_APP_PASSWORD) {
      return res.status(500).json({ error: "Missing Bluesky credentials on server."});
    }
    if (!q.trim()) return res.status(400).json({ error: "Missing query." });

    const cutoffMs = Date.now() - Number(hours) * 3600_000;

    const agent = new BskyAgent({ service: "https://api.bsky.app" });
    await agent.login({
      identifier: process.env.BLUESKY_HANDLE,
      password: process.env.BLUESKY_APP_PASSWORD,
    });

    // Page through search results (no 'since' due to API behavior), then filter by time locally.
    let cursor;
    const scanned = [];
    while (scanned.length < Number(limit)) {
      const r = await agent.app.bsky.feed.searchPosts({
        q,
        sort: "latest",
        limit: Math.min(25, Number(limit) - scanned.length),
        cursor,
      });
      const batch = r.data?.posts || [];
      if (!batch.length) break;
      scanned.push(...batch);
      cursor = r.data?.cursor;
      if (!cursor) break;
    }

    const minR = Number(minReposts);
    const minL = Number(minLikes);
    const filtered = scanned
      .map(p => {
        const created = new Date(p.indexedAt || p.record?.createdAt || Date.now());
        const text = p.record?.text || "";
        const textHtml = escapeHtml(text).replace(
          /(https?:\/\/\S+)/g,
          '<a href="$1" target="_blank" rel="noreferrer">$1</a>'
        );
        return {
          uri: p.uri,
          rkey: toRkey(p.uri),
          author: p.author,
          text,
          textHtml,
          indexedAt: created.toISOString(),
          createdMs: created.getTime(),
          repostCount: p.repostCount || 0,
          likeCount: p.likeCount || 0,
          url: `https://bsky.app/profile/${p.author?.handle}/post/${toRkey(p.uri)}`
        };
      })
      .filter(p => p.createdMs >= cutoffMs && p.repostCount >= minR && p.likeCount >= minL)
      .sort((a,b) => (b.repostCount + b.likeCount) - (a.repostCount + a.likeCount));

    const itemsHtml = filtered.map(p => `
<li>
  <p><strong>@${p.author?.handle}</strong>: ${escapeHtml(p.text)}</p>
  <p><em>Reposts:</em> ${p.repostCount} · <em>Likes:</em> ${p.likeCount} — <a href="${p.url}" target="_blank">link</a></p>
</li>`).join("\n");

    res.status(200).json({
      count: filtered.length,
      posts: filtered,
      prepHtml: `<ul>\n${itemsHtml}\n</ul>`
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || "Server error" });
  }
}
