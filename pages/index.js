import { useState } from "react";

export default function Home() {
  const [query, setQuery] = useState("");
  const [hours, setHours] = useState(6);
  const [minReposts, setMinReposts] = useState(10);
  const [minLikes, setMinLikes] = useState(0);
  const [limit, setLimit] = useState(50);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [html, setHtml] = useState("");

  const runSearch = async () => {
    setLoading(true);
    setResults([]);
    setHtml("");
    const r = await fetch(`/api/search?` + new URLSearchParams({
      q: query,
      hours: String(hours),
      minReposts: String(minReposts),
      minLikes: String(minLikes),
      limit: String(limit),
    }));
    const data = await r.json();
    setResults(data.posts || []);
    setHtml(data.prepHtml || "");
    setLoading(false);
  };

  const copyHtml = async () => {
    await navigator.clipboard.writeText(html);
    alert("HTML copied. Paste into Presto.");
  };

  return (
    <div style={{maxWidth: 900, margin: "40px auto", padding: 16, fontFamily: "system-ui"}}>
      <h1>NBA trade reactions tool (Bluesky)</h1>
      <p style={{opacity:.8}}>Type your topic, set a window and thresholds, get formatted output ready for Presto.</p>

      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
        <label>Query<input value={query} onChange={e=>setQuery(e.target.value)} placeholder='e.g. "Lakers trade" OR "Dejounte Murray"'/></label>
        <label>Last X hours<input type="number" min="1" value={hours} onChange={e=>setHours(e.target.value)} /></label>
        <label>Min reposts<input type="number" min="0" value={minReposts} onChange={e=>setMinReposts(e.target.value)} /></label>
        <label>Min likes<input type="number" min="0" value={minLikes} onChange={e=>setMinLikes(e.target.value)} /></label>
        <label>Max posts to scan<input type="number" min="10" value={limit} onChange={e=>setLimit(e.target.value)} /></label>
      </div>

      <button onClick={runSearch} disabled={loading} style={{marginTop:16, padding:"10px 16px"}}>
        {loading ? "Searching…" : "Search Bluesky"}
      </button>

      {results.length > 0 && (
        <>
          <div style={{marginTop:24, display:"flex", gap:12}}>
            <button onClick={copyHtml}>Copy HTML for Presto</button>
          </div>
          <h2 style={{marginTop:24}}>Top posts</h2>
          <ol>
            {results.map((p)=>(
              <li key={p.uri} style={{marginBottom:16}}>
                <div><strong>@{p.author?.handle}</strong> — {new Date(p.indexedAt).toLocaleString()}</div>
                <div dangerouslySetInnerHTML={{__html: p.textHtml}} />
                <div style={{opacity:.7}}>Reposts: {p.repostCount} · Likes: {p.likeCount}</div>
                <div><a href={`https://bsky.app/profile/${p.author?.handle}/post/${p.rkey}`} target="_blank" rel="noreferrer">Open</a></div>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
