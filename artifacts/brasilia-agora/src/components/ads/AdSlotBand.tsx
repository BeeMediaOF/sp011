import React from "react";
import AdBanner from "./AdBanner";
import { useAds, type AdSlotKey } from "./useAds";

/**
 * Faixa de anúncio da home com o wrapper/padding próprio: só renderiza o
 * wrapper quando o slot TEM anúncios — slot vazio não reserva mais a faixa
 * branca (era o vão entre a newsletter e o rodapé). Durante o loading o
 * wrapper fica (AdBanner mostra o skeleton do SLOT_CONFIG — sem CLS); no SSR
 * os ads chegam semeados (loading=false), então servidor e cliente rendem
 * igual (#418).
 */
export default function AdSlotBand({ slot, priority, className }: {
  slot: AdSlotKey; priority?: boolean; className?: string;
}) {
  const { getSlotAll, loading } = useAds();
  if (!loading && getSlotAll(slot).length === 0) return null;
  return <div className={className}><AdBanner slot={slot} priority={priority} /></div>;
}
