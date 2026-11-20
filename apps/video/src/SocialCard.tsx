import { Img, staticFile } from "remotion";
import { C, mono, sans } from "./theme";

/** 1200×630 link preview, also used as the GitHub social preview. */
export const SocialCard: React.FC = () => (
  <div style={{ flex: 1, background: C.paper, fontFamily: sans, color: C.ink, position: "relative", display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 84px" }}>
    <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 18, background: C.dark }} />
    <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
      <Img src={staticFile("attest-logo.png")} style={{ width: 96, height: 96, borderRadius: 22 }} />
      <span style={{ fontSize: 64, fontWeight: 800, letterSpacing: -2.5 }}>Attest</span>
    </div>
    <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.06, letterSpacing: -3.2, marginTop: 34, maxWidth: 1000 }}>
      Check Android releases<br />before you ship<span style={{ color: C.green }}>.</span>
    </div>
    <div style={{ fontSize: 32, color: C.muted, fontWeight: 500, marginTop: 28, maxWidth: 980, lineHeight: 1.4 }}>
      Compare builds, catch privacy-declaration mismatches, keep verifiable release evidence.
    </div>
    <div style={{ position: "absolute", left: 84, bottom: 44, display: "flex", alignItems: "center", gap: 18, fontFamily: mono, fontSize: 26 }}>
      <span style={{ fontWeight: 700, color: C.red }}>HOLD</span>
      <span style={{ color: C.muted }}>→</span>
      <span style={{ fontWeight: 700, color: C.green }}>SHIP</span>
      <span style={{ color: C.muted, marginLeft: 20 }}>open source · local · Apache-2.0</span>
    </div>
  </div>
);
