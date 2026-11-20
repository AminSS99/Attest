import { Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { C, enter, ease, progress, sans } from "../theme";

export const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const underline = progress(frame, 62, 24);
  return (
    <div style={{ flex: 1, background: C.paper, fontFamily: sans, color: C.ink, padding: "100px 140px", position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 22, ...enter(frame, 0, 12) }}>
        <Img src={staticFile("attest-logo.png")} style={{ width: 72, height: 72, borderRadius: 16 }} />
        <span style={{ fontSize: 44, fontWeight: 800, letterSpacing: -1.5 }}>Attest</span>
      </div>
      <div style={{ position: "absolute", left: 140, right: 140, top: 270 }}>
        <div style={{ fontSize: 132, fontWeight: 800, lineHeight: 1.06, letterSpacing: -5 }}>
          <div style={enter(frame, 6)}>Your new build</div>
          <div style={enter(frame, 14)}>added a permission</div>
          <div style={enter(frame, 22)}>and an SDK.</div>
        </div>
        <div style={{ marginTop: 64, fontSize: 84, fontWeight: 700, letterSpacing: -2.5, color: C.red, ...enter(frame, 50) }}>
          <span style={{ position: "relative", display: "inline-block" }}>
            Your privacy answers didn’t.
            <span
              style={{
                position: "absolute",
                left: 0,
                bottom: -10,
                height: 8,
                width: `${interpolate(underline, [0, 1], [0, 100])}%`,
                background: C.red,
                borderRadius: 4,
                opacity: ease(underline),
              }}
            />
          </span>
        </div>
      </div>
    </div>
  );
};
