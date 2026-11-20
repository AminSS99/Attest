import { interpolate, useCurrentFrame } from "remotion";
import { C, enter, mono, progress, sans } from "../theme";

export const Passport: React.FC = () => {
  const frame = useCurrentFrame();
  const flip = progress(frame, 72, 20);
  const ship = flip > 0.5;
  const color = ship ? C.green : C.red;
  const bg = ship ? C.pale : C.redPale;
  const fixed = progress(frame, 44, 18);
  return (
    <div style={{ flex: 1, background: C.paper, fontFamily: sans, color: C.ink, padding: "90px 140px" }}>
      <div style={{ fontSize: 84, fontWeight: 800, letterSpacing: -3, ...enter(frame, 0) }}>
        Fix the answers. Run it again<span style={{ color: C.green }}>.</span>
      </div>
      <div style={{ display: "flex", gap: 64, marginTop: 70, alignItems: "stretch" }}>
        <div style={{ flex: 1, background: C.white, border: `2px solid ${C.line}`, padding: "44px 52px", ...enter(frame, 10) }}>
          <div style={{ fontSize: 30, letterSpacing: 3, fontWeight: 700, color: C.green, textTransform: "uppercase" }}>Release Passport</div>
          <div style={{ fontFamily: mono, fontSize: 40, fontWeight: 700, marginTop: 18 }}>app.pulsefit 1.3.0</div>
          <div style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 22, fontSize: 40, fontWeight: 500 }}>
            {[
              ["Data Safety", "Camera + SDK added"],
              ["Privacy policy", "Amplitude disclosed"],
              ["Reviewer path", "Step 4 repaired"],
            ].map(([k, v], i) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", ...enter(frame, 24 + i * 6, 14), opacity: progress(frame, 24 + i * 6, 22) * interpolate(fixed, [0, 1], [0.35, 1]) }}>
                <span>{k}</span>
                <span style={{ color: C.green, fontWeight: 700 }}>{fixed > 0.6 ? "✓ " : ""}{v}</span>
              </div>
            ))}
          </div>
        </div>
        <div
          style={{
            width: 620,
            background: bg,
            border: `2px solid ${color}`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
            ...enter(frame, 14),
          }}
        >
          <div style={{ fontSize: 30, letterSpacing: 3, fontWeight: 700, color, textTransform: "uppercase" }}>Recommendation</div>
          <div style={{ fontSize: 170, fontWeight: 800, letterSpacing: -8, color, scale: interpolate(flip, [0, 0.5, 1], [1, 0.9, 1]) }}>
            {ship ? "SHIP" : "HOLD"}
          </div>
          <div style={{ fontSize: 34, color: C.muted, fontWeight: 500 }}>{ship ? "0 contradictions" : "2 contradictions"}</div>
        </div>
      </div>
      <div style={{ marginTop: 52, fontSize: 40, color: C.muted, fontWeight: 500, ...enter(frame, 100, 14) }}>
        A person records the final decision. Attest never overrides it.
      </div>
    </div>
  );
};
