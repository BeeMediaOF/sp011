import React from "react";
import AdSlot from "./AdSlot";

interface AdSidebarProps {
  side?: "left" | "right";
}

export default function AdSidebar({ side = "right" }: AdSidebarProps) {
  return (
    <div className={`hidden xl:flex flex-col gap-4 w-40 shrink-0 ${side === "left" ? "mr-4" : "ml-4"}`}>
      <AdSlot variant="skyscraper" className="sticky top-24" />
      <AdSlot variant="square" />
      <AdSlot variant="square" />
    </div>
  );
}
