import { Img, staticFile, useCurrentFrame } from "remotion";
import { C, enter, mono, progress, sans } from "../theme";

export const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const logo = progress(frame, 0, 26);
  return (
    <div style={{ flex: 1, background: C.dark, color: C.white, fontFamily: sans, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28 }}>
      <Img src={staticFile("attest-logo.png")} style={{ width: 210, height: 210, borderRadius: 46, opacity: logo, scale: 0.85 + logo * 0.15 }} />
      <div style={{ fontSize: 110, fontWeight: 800, letterSpacing: -4, ...enter(frame, 8) }}>Attest</div>
      <div style={{ fontSize: 56, fontWeight: 500, color: C.mint, ...enter(frame, 16) }}>Check Android releases before you ship.</div>
      <div style={{ fontFamily: mono, fontSize: 44, fontWeight: 700, marginTop: 24, ...enter(frame, 28, 16) }}>github.com/AminSS99/Attest</div>
      <div style={{ fontSize: 34, color: C.termDim, ...enter(frame, 36, 12) }}>Open source · Apache-2.0</div>
    </div>
  );
};
