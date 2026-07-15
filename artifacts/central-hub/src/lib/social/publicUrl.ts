/**
 * URL pública da central (env CENTRAL_PUBLIC_URL, ex.: https://central.midia.run)
 * — usada na video_url que Meta/Buffer baixam e na redirect URI do OAuth Meta.
 */
export function centralPublicUrl(): string | null {
  const v = process.env["CENTRAL_PUBLIC_URL"]?.trim().replace(/\/+$/, "");
  return v || null;
}

export function publicVideoUrl(fileName: string): string | null {
  const base = centralPublicUrl();
  return base ? `${base}/api/social/video-file/${fileName}` : null;
}
