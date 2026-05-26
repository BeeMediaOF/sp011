import React from "react";
import AdSlot from "./AdSlot";

export default function AdSidebar() {
  return (
    <div className="hidden 2xl:flex flex-col gap-4 w-36 shrink-0">
      <AdSlot size="sm" sticky />
      <AdSlot size="sm" />
    </div>
  );
}
