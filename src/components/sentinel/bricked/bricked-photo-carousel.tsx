"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  images: string[];
  address?: string;
}

export function BrickedPhotoCarousel({ images, address }: Props) {
  const [idx, setIdx] = useState(0);

  if (!images.length) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.02] h-[260px] text-muted-foreground/40">
        <div className="flex flex-col items-center gap-2">
          <MapPin className="h-8 w-8" />
          <span className="text-xs">No photos available</span>
        </div>
      </div>
    );
  }

  const prev = () => setIdx((i) => (i === 0 ? images.length - 1 : i - 1));
  const next = () => setIdx((i) => (i === images.length - 1 ? 0 : i + 1));

  return (
    <div className="relative rounded-lg overflow-hidden border border-white/[0.06] h-[260px] group">
      <img
        src={images[idx]}
        alt={address ?? `Photo ${idx + 1}`}
        className="w-full h-full object-cover"
      />
      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={prev}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={next}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
            {images.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIdx(i)}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === idx ? "w-4 bg-white" : "w-1.5 bg-white/40",
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
