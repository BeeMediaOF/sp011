import React from "react";
import AdSlot from "./AdSlot";

interface AdBetweenProps {
  variant?: "banner" | "billboard" | "rectangle";
  label?: string;
}

export default function AdBetween({ variant = "banner", label }: AdBetweenProps) {
  return (
    <div className="w-full flex justify-center py-4 my-2 bg-white">
      <AdSlot variant={variant} label={label} />
    </div>
  );
}
