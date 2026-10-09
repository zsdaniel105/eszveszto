import { memo, useMemo } from "react";
import { invitationQr } from "./qr";
export const JoinQr = memo(function JoinQr({ url }: { url: string }) {
  const matrix = useMemo(() => invitationQr(url), [url]);
  const size = matrix.length + 8; // Four-module quiet zone on every side.
  const path = matrix
    .flatMap((row, y) =>
      row.flatMap((dark, x) => (dark ? [`M${x + 4} ${y + 4}h1v1h-1z`] : [])),
    )
    .join("");
  return (
    <svg
      className="join-qr"
      role="img"
      aria-label="QR-kód a játékosok csatlakozásához"
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
    >
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
});
