import { Router } from "express";
import { parsePlaylistId, fetchPlaylist } from "../lib/youtubePlaylist.js";

const router = Router();

/** GET /api/youtube/playlist?id=<id ou URL> — vídeos da playlist (público).
 *  Sem chave de API: lê o feed Atom público do YouTube, com cache de 30 min no
 *  servidor. Devolve 200 com lista vazia quando a playlist não responde — o
 *  bloco da home simplesmente não renderiza, nunca quebra a página. */
router.get("/playlist", async (req, res) => {
  const id = parsePlaylistId(String(req.query["id"] ?? ""));
  if (!id) { res.status(400).json({ error: "Playlist inválida", videos: [] }); return; }
  const feed = await fetchPlaylist(id);
  res.setHeader("Cache-Control", "public, max-age=600, s-maxage=1800, stale-while-revalidate=3600");
  res.json(feed ?? { id, title: "", videos: [] });
});

export default router;
