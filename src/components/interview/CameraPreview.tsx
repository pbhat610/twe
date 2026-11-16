"use client";

import { useEffect, useRef } from "react";

/** Renders a MediaStream (local only). Several previews can share one stream. */
export function CameraPreview({ stream, className }: { stream: MediaStream; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted className={className} />;
}
