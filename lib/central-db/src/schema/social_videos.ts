import { pgTable, text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";

/** Resultado de publicação por destino (retry parcial pula os já ok). */
export interface SocialPublishResults {
  instagram?: { ok: boolean; mediaId?: string; error?: string };
  tiktok?: { ok: boolean; bufferPostId?: string; error?: string };
  /** Avisos não-bloqueantes (ex.: destino marcado sem conexão no blog). */
  warnings?: string[];
}

/** Metadados do vídeo de origem (Apify) — legenda original, thumb, métricas. */
export interface SocialVideoMetadata {
  originalCaption?: string;
  thumbnail?: string;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  durationSec?: number;
  publishedAt?: string;
  [key: string]: unknown;
}

/**
 * Fila de repostagem de vídeos TikTok/Instagram (Automação Social).
 * Fan-out por blog: 1 linha por blog de destino; linhas "irmãs" (mesma
 * source_url) compartilham o download (mesmo file_name) — o mp4 só é apagado
 * quando nenhuma irmã o referencia.
 */
export const socialVideosTable = pgTable("social_videos", {
  id:                text("id").primaryKey(),
  blogId:            text("blog_id").notNull(),
  /** Link original do vídeo (TikTok/Instagram). */
  sourceUrl:         text("source_url").notNull(),
  /** Plataforma de ORIGEM do vídeo: 'tiktok' | 'instagram'. */
  platform:          text("platform").notNull(),
  /** Destinos de publicação: ["instagram","tiktok"]. */
  targets:           jsonb("targets").$type<string[]>(),
  // queued → downloading → ready → scheduled → publishing → sent; error de qualquer etapa
  status:            text("status").notNull().default("queued"),
  title:             text("title"),
  caption:           text("caption"),
  /** Origem da legenda: 'user' | 'ai' | 'original'. */
  captionSource:     text("caption_source"),
  /** @ do autor original (créditos). */
  creator:           text("creator"),
  /** Nome do mp4 em /data/social-videos (null = ainda sem download). */
  fileName:          text("file_name"),
  fileSizeBytes:     integer("file_size_bytes"),
  mimeType:          text("mime_type"),
  scheduledAt:       timestamp("scheduled_at", { withTimezone: true }),
  sentAt:            timestamp("sent_at", { withTimezone: true }),
  queuedAt:          timestamp("queued_at", { withTimezone: true }),
  downloadStartedAt: timestamp("download_started_at", { withTimezone: true }),
  publishStartedAt:  timestamp("publish_started_at", { withTimezone: true }),
  /** Tentativas de PUBLICAÇÃO (download não tem retry automático). */
  attempts:          integer("attempts").notNull().default(0),
  nextRetryAt:       timestamp("next_retry_at", { withTimezone: true }),
  publishResults:    jsonb("publish_results").$type<SocialPublishResults>(),
  igContainerId:     text("ig_container_id"),
  igMediaId:         text("ig_media_id"),
  bufferPostId:      text("buffer_post_id"),
  errorMessage:      text("error_message"),
  /** Fonte de coleta automática (Fase 2); null = postagem manual. */
  feedId:            text("feed_id"),
  metadata:          jsonb("metadata").$type<SocialVideoMetadata>(),
  createdAt:         timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:         timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("social_videos_status_retry_idx").on(t.status, t.nextRetryAt),
  index("social_videos_queue_idx").on(t.status, t.queuedAt),
  index("social_videos_blog_idx").on(t.blogId),
  index("social_videos_source_url_idx").on(t.sourceUrl),
]);

export type SocialVideoRow    = typeof socialVideosTable.$inferSelect;
export type SocialVideoInsert = typeof socialVideosTable.$inferInsert;
