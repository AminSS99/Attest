import { useCurrentFrame } from "remotion";
import { C, enter, mono, progress, sans } from "../theme";

const Drop: React.FC<{ label: string; file: string; frame: number; at: number }> = ({ label, file, frame, at }) => {
  const p = progress(frame, at, 18);
  return (
    <div style={{ flex: 1, border: `2px ${p > 0.5 ? "solid" : "dashed"} ${p > 0.5 ? C.dark : C.green}`, background: C.white, padding: "32px 36px", minHeight: 150 }}>
      <div style={{ fontSize: 26, letterSpacing: 3, fontWeight: 700, color: C.green, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: mono, fontSize: 36, fontWeight: 700, marginTop: 14, color: p > 0.5 ? C.ink : C.muted }}>
        {p > 0.5 ? file : "Drop an .apk"}
      </div>
    </div>
  );
};

export const Browser: React.FC = () => {
  const frame = useCurrentFrame();
  const verdict = progress(frame, 70, 18);
  return (
    <div style={{ flex: 1, background: C.paper, fontFamily: sans, color: C.ink, padding: "80px 140px" }}>
      <div style={{ fontSize: 88, fontWeight: 800, letterSpacing: -3, ...enter(frame, 0) }}>
        Or drop two APKs in your browser<span style={{ color: C.green }}>.</span>
      </div>
      <div style={{ marginTop: 52, display: "flex", gap: 32 }}>
        <Drop label="Last shipped build" file="pulsefit-1.2.0.apk" frame={frame} at={20} />
        <Drop label="Release candidate" file="pulsefit-1.3.0.apk" frame={frame} at={34} />
      </div>
      <div
        style={{
          marginTop: 36,
          background: C.white,
          border: `2px solid ${C.line}`,
          padding: "30px 44px",
          display: "flex",
          alignItems: "center",
          gap: 56,
          opacity: verdict,
          translate: `0px ${(1 - verdict) * 24}px`,
        }}
      >
        <div style={{ fontSize: 110, fontWeight: 800, letterSpacing: -5, color: C.red }}>HOLD</div>
        <div style={{ fontSize: 38, color: C.muted, lineHeight: 1.4, fontWeight: 500 }}>
          + CAMERA · + Amplitude Analytics<br />+ metrics.amplitude.com
        </div>
      </div>
      <div style={{ marginTop: 40, fontSize: 52, fontWeight: 700, color: C.green, ...enter(frame, 96, 14) }}>
        Nothing leaves your browser.
      </div>
    </div>
  );
};
