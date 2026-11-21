(() => {
  const frame = document.getElementById('watch-frame');
  const video = document.getElementById('watch-video');
  const stage = document.getElementById('watch-stage');
  const controls = document.getElementById('watch-controls');
  const soundPill = document.getElementById('watch-sound-pill');
  const soundLabel = document.getElementById('watch-sound-label');
  const playOverlay = document.getElementById('watch-play-overlay');
  const toggleBtn = document.getElementById('watch-toggle');
  const muteBtn = document.getElementById('watch-mute');
  const fsBtn = document.getElementById('watch-fullscreen');
  const progress = document.getElementById('watch-progress');
  const progressFill = document.getElementById('watch-progress-fill');
  const progressTip = document.getElementById('watch-progress-tip');
  const timeEl = document.getElementById('watch-time');
  const badge = document.getElementById('watch-badge');
  const badgeText = document.getElementById('watch-badge-text');
  const chaptersWrap = document.getElementById('watch-chapters');

  if (!frame || !video || !controls) return;

  // Progressive enhancement: replace native controls with the editorial bar once JS runs.
  video.removeAttribute('controls');
  controls.hidden = false;
  if (soundPill) soundPill.hidden = false;
  if (chaptersWrap) chaptersWrap.hidden = false;

  const chapters = [...(chaptersWrap ? chaptersWrap.querySelectorAll('.watch-chapter') : [])];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let userPaused = false;
  let inView = false;
  let scrubbing = false;

  const formatTime = (sec) => {
    const s = Math.max(0, Math.floor(sec || 0));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${String(rem).padStart(2, '0')}`;
  };

  const syncPlayUI = () => {
    const playing = !video.paused && !video.ended;
    const playIcon = toggleBtn?.querySelector('.icon-play');
    const pauseIcon = toggleBtn?.querySelector('.icon-pause');
    if (playIcon) playIcon.hidden = playing;
    if (pauseIcon) pauseIcon.hidden = !playing;
    if (toggleBtn) toggleBtn.setAttribute('aria-label', playing ? 'Pause video' : 'Play video');
    if (playOverlay) playOverlay.hidden = playing;
    frame.classList.toggle('is-playing', playing);
    syncBadge();
  };

  const syncSoundUI = () => {
    const muted = video.muted || video.volume === 0;
    const mutedIcon = muteBtn?.querySelector('.icon-muted');
    const soundIcon = muteBtn?.querySelector('.icon-sound');
    if (mutedIcon) mutedIcon.hidden = !muted;
    if (soundIcon) soundIcon.hidden = muted;
    if (muteBtn) muteBtn.setAttribute('aria-label', muted ? 'Unmute video' : 'Mute video');
    if (soundPill) {
      soundPill.classList.toggle('is-unmuted', !muted);
      soundPill.setAttribute('aria-label', muted ? 'Unmute demo video' : 'Mute demo video');
    }
    if (soundLabel) soundLabel.textContent = muted ? 'Muted · click for sound' : 'Sound on';
    syncBadge();
  };

  const syncBadge = () => {
    if (!badge || !badgeText) return;
    const playing = !video.paused && !video.ended;
    const muted = video.muted || video.volume === 0;
    badge.classList.toggle('is-live', playing);
    if (!playing) {
      badgeText.textContent = 'PAUSED';
    } else if (muted) {
      badgeText.textContent = 'AUTOPLAY · MUTED';
    } else {
      badgeText.textContent = 'PLAYING · SOUND ON';
    }
  };

  const syncProgress = () => {
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 31.6;
    const current = video.currentTime || 0;
    const pct = Math.min(100, Math.max(0, (current / duration) * 100));
    if (progressFill) progressFill.style.width = `${pct}%`;
    if (progress) {
      progress.setAttribute('aria-valuemax', String(Math.round(duration)));
      progress.setAttribute('aria-valuenow', String(Math.round(current)));
    }
    if (timeEl) timeEl.textContent = `${formatTime(current)} / ${formatTime(duration)}`;

    let activeIdx = 0;
    for (let i = 0; i < chapters.length; i++) {
      const start = Number(chapters[i].dataset.time || 0);
      if (current + 0.15 >= start) activeIdx = i;
    }
    chapters.forEach((btn, idx) => btn.classList.toggle('is-active', idx === activeIdx));
  };

  const togglePlay = () => {
    if (video.paused || video.ended) {
      userPaused = false;
      void video.play().catch(() => {});
    } else {
      userPaused = true;
      video.pause();
    }
  };

  const toggleMute = () => {
    video.muted = !video.muted;
    if (!video.muted && video.paused) {
      userPaused = false;
      void video.play().catch(() => {});
    }
    syncSoundUI();
  };

  const seekFromPointer = (clientX) => {
    if (!progress) return;
    const rect = progress.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width)));
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 31.6;
    video.currentTime = ratio * duration;
    syncProgress();
  };

  stage?.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    togglePlay();
  });
  playOverlay?.addEventListener('click', togglePlay);
  toggleBtn?.addEventListener('click', togglePlay);
  muteBtn?.addEventListener('click', toggleMute);
  soundPill?.addEventListener('click', toggleMute);

  fsBtn?.addEventListener('click', () => {
    if (document.fullscreenElement === frame) {
      void document.exitFullscreen?.();
    } else if (frame.requestFullscreen) {
      void frame.requestFullscreen().catch(() => {});
    } else if (video.webkitEnterFullscreen) {
      video.webkitEnterFullscreen();
    }
  });

  if (progress) {
    progress.addEventListener('pointerdown', (e) => {
      scrubbing = true;
      progress.setPointerCapture?.(e.pointerId);
      seekFromPointer(e.clientX);
    });
    progress.addEventListener('pointermove', (e) => {
      const rect = progress.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / Math.max(1, rect.width)));
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 31.6;
      if (progressTip) {
        progressTip.textContent = formatTime(ratio * duration);
        progressTip.style.left = `${ratio * 100}%`;
      }
      if (scrubbing) seekFromPointer(e.clientX);
    });
    progress.addEventListener('pointerup', () => { scrubbing = false; });
    progress.addEventListener('pointercancel', () => { scrubbing = false; });
  }

  for (const ch of chapters) {
    ch.addEventListener('click', () => {
      const t = Number(ch.dataset.time || 0);
      video.currentTime = t;
      userPaused = false;
      void video.play().catch(() => {});
      syncProgress();
    });
  }

  frame.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) return;
    if (e.key === ' ' || e.key.toLowerCase() === 'k') {
      e.preventDefault();
      togglePlay();
    } else if (e.key.toLowerCase() === 'm') {
      e.preventDefault();
      toggleMute();
    } else if (e.key.toLowerCase() === 'f') {
      e.preventDefault();
      fsBtn?.click();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      video.currentTime = Math.max(0, video.currentTime - 5);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      video.currentTime = Math.min(video.duration || 31.6, video.currentTime + 5);
    }
  });

  video.addEventListener('play', syncPlayUI);
  video.addEventListener('pause', syncPlayUI);
  video.addEventListener('volumechange', syncSoundUI);
  video.addEventListener('timeupdate', syncProgress);
  video.addEventListener('loadedmetadata', syncProgress);

  // Autoplay muted when scrolled into view; pause off-screen to save battery.
  if (!reducedMotion.matches && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        inView = entry.isIntersecting;
        if (inView) {
          if (!userPaused && video.paused) {
            video.muted = true;
            void video.play().catch(() => {});
          }
        } else if (!video.paused) {
          video.pause();
        }
      }
    }, { threshold: 0.35 });
    observer.observe(frame);
  }

  syncPlayUI();
  syncSoundUI();
  syncProgress();
})();
