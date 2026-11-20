import { useCurrentFrame } from "remotion";
import { C, enter, mono, progress, sans } from "../theme";

const ROWS = [
  { sign: "+", text: "android.permission.CAMERA", label: "Permission", color: C.red },
  { sign: "+", text: "Amplitude Analytics", label: "SDK", color: C.red },
  { sign: "+", text: "metrics.amplitude.com", label: "Destination", color: C.red },
  { sign: "−", text: "android.permission.RECORD_AUDIO", label: "Permission", color: C.green },
] as const;

const Apk: React.FC<{ name: string; tag: string; strong?: boolean }> = ({ name, tag, strong }) => (
  <div
    style={{
      background: strong ? C.dark : C.white,
      color: strong ? C.white : C.ink,
      border: `2px solid ${strong ? C.dark : C.line}`,
      padding: "28px 40px",
      minWidth: 640,
    }}
  >
    <div style={{ fontSize: 30, letterSpacing: 3, fontWeight: 700, opacity: 0.7, textTransform: "uppercase" }}>{tag}</div>
    <div style={{ fontFamily: mono, fontSize: 50, fontWeight: 700, marginTop: 8 }}>{name}</div>
  </div>
);

export const Delta: React.FC = () => {
  const frame = useCurrentFrame();
  const arrow = progress(frame, 18, 20);
  return (
    <div style={{ flex: 1, background: C.paper, fontFamily: sans, color: C.ink, padding: "90px 140px" }}>
      <div style={{ fontSize: 84, fontWeight: 800, letterSpacing: -3, ...enter(frame, 0) }}>
        Attest diffs the two builds<span style={{ color: C.green }}>.</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 44, marginTop: 60, ...enter(frame, 8) }}>
        <Apk name="pulsefit-1.2.0.apk" tag="Last shipped" />
        <div style={{ fontSize: 90, color: C.green, opacity: arrow, translate: `${(1 - arrow) * -30}px 0px` }}>→</div>
        <Apk name="pulsefit-1.3.0.apk" tag="Candidate" strong />
      </div>
      <div style={{ marginTop: 64, display: "flex", flexDirection: "column", gap: 20 }}>
        {ROWS.map((r, i) => (
          <div
            key={r.text}
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 30,
              fontFamily: mono,
              fontSize: 52,
              fontWeight: 700,
              color: r.color,
              ...enter(frame, 38 + i * 14, 24),
            }}
          >
            <span style={{ width: 44 }}>{r.sign}</span>
            <span>{r.text}</span>
            <span style={{ fontFamily: sans, fontSize: 34, fontWeight: 500, color: C.muted, marginLeft: "auto" }}>{r.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
