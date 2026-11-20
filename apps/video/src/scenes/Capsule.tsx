import { useCurrentFrame } from "remotion";
import { C, enter, mono, progress, sans } from "../theme";

// Real file names and the first 12 hex chars of their SHA-256, from the demo capsule.
const FILES = [
  ["passport.json", "5aaf567afff4"],
  ["findings.json", "30df55dcdcce"],
  ["findings.sarif", "8eb53ad7a983"],
  ["diff.json", "39e72d7a5f5e"],
  ["declarations/data-safety.json", "d044e2f7b861"],
  ["journeys/…/step-004.png", "7c43e1b4ca64"],
] as const;

export const Capsule: React.FC = () => {
  const frame = useCurrentFrame();
  const ok = progress(frame, 84, 16);
  return (
    <div style={{ flex: 1, background: C.dark, padding: "90px 140px", fontFamily: sans, color: C.white }}>
      <div style={{ fontSize: 96, fontWeight: 800, letterSpacing: -3.5, ...enter(frame, 0) }}>
        Seal it. Verify it offline<span style={{ color: C.mint }}>.</span>
      </div>
      <div style={{ marginTop: 56, fontFamily: mono, fontSize: 40, display: "flex", flexDirection: "column", gap: 16 }}>
        {FILES.map(([name, hash], i) => (
          <div key={name} style={{ display: "flex", justifyContent: "space-between", color: C.termText, ...enter(frame, 14 + i * 7, 16) }}>
            <span>{name}</span>
            <span style={{ color: C.mint }}>sha256 {hash}…</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 64, display: "flex", alignItems: "center", gap: 28, opacity: ok, translate: `0px ${(1 - ok) * 20}px` }}>
        <div style={{ width: 84, height: 84, borderRadius: 42, background: C.mint, color: C.dark, fontSize: 56, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</div>
        <div style={{ fontFamily: mono, fontSize: 44, fontWeight: 700 }}>Capsule OK — 14 files verified, evidence root intact.</div>
      </div>
    </div>
  );
};
