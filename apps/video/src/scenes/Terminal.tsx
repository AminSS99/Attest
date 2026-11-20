import { interpolate, useCurrentFrame } from "remotion";
import { C, enter, mono, progress, sans } from "../theme";

const COMMAND = "$ attest check --base 1.2.0.apk --candidate 1.3.0.apk --data-safety ds.json";

const FINDINGS = [
  { id: "TG-002", title: "New third-party SDK without any disclosure", detail: "observed(com.amplitude) vs declared(no disclosure)" },
  { id: "TG-001", title: "New dangerous permission not covered", detail: 'observed(CAMERA) vs declared(no "photos_and_videos.photos")' },
  { id: "TG-003", title: "New network destination not disclosed", detail: "observed(metrics.amplitude.com) vs declared(not listed)" },
] as const;

export const Terminal: React.FC = () => {
  const frame = useCurrentFrame();
  const typed = Math.floor(interpolate(frame, [10, 66], [0, COMMAND.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const caret = frame % 20 < 10;
  const verdict = progress(frame, 214, 18);
  return (
    <div style={{ flex: 1, background: C.dark, padding: "70px 100px", fontFamily: mono, color: C.termText }}>
      <div style={{ background: C.term, borderRadius: 22, padding: "46px 58px", height: "100%", boxShadow: "0 30px 80px rgba(0,0,0,.35)", position: "relative" }}>
        <div style={{ display: "flex", gap: 14, marginBottom: 34 }}>
          {["#ff6b5f", "#ffc23f", "#2ac54b"].map((c) => (
            <span key={c} style={{ width: 22, height: 22, borderRadius: 11, background: c, opacity: 0.85 }} />
          ))}
        </div>
        <div style={{ fontSize: 35, fontWeight: 700, minHeight: 48 }}>
          {COMMAND.slice(0, typed)}
          <span style={{ opacity: typed < COMMAND.length || caret ? 1 : 0, background: C.termText, color: "transparent" }}>_</span>
        </div>
        <div style={{ marginTop: 34, display: "flex", flexDirection: "column", gap: 26 }}>
          {FINDINGS.map((f, i) => (
            <div key={f.id} style={enter(frame, 84 + i * 38, 22)}>
              <div style={{ fontSize: 40, fontWeight: 700 }}>
                <span style={{ color: C.red, background: "#f5e9e5", padding: "2px 14px", borderRadius: 8, marginRight: 22 }}>HIGH</span>
                <span style={{ color: C.mint }}>{f.id}</span> {f.title}
              </div>
              <div style={{ fontSize: 31, color: C.termDim, marginTop: 6, paddingLeft: 4 }}>{f.detail}</div>
            </div>
          ))}
        </div>
        <div
          style={{
            position: "absolute",
            left: 58,
            right: 58,
            bottom: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            opacity: verdict,
            translate: `0px ${(1 - verdict) * 20}px`,
          }}
        >
          <div style={{ fontSize: 38 }}>2 confirmed contradictions · exit code 2</div>
          <div style={{ fontFamily: sans, fontSize: 96, fontWeight: 800, letterSpacing: -3, color: "#ff8a7a" }}>HOLD</div>
        </div>
        <div style={{ position: "absolute", right: 58, top: 40, fontSize: 24, color: C.termDim, fontFamily: sans }}>
          Synthetic PulseFit demo · output condensed
        </div>
      </div>
    </div>
  );
};
