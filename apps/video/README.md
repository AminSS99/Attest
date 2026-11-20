# Attest demo video

The 32-second product demo and the 1200×630 social card, made with [Remotion](https://www.remotion.dev). Scene text comes from the real CLI output of the synthetic PulseFit demo.

```bash
cd apps/video
npm install
npm run dev      # Remotion Studio
npm run render   # out/attest-demo.mp4 (1920×1080, 30 fps)
npm run still    # out/social-card.png
```

Copy the renders into `apps/web/` (`attest-demo.mp4`, `og-image.png`, `video-poster.jpg`) and `docs/images/` to publish them. Remotion is free for individuals and teams of up to three; see its [license](https://www.remotion.dev/docs/license).
