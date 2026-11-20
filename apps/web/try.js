(() => {
  const form = document.getElementById('try-form');
  if (!form || !window.Worker) return;
  const $ = (id) => document.getElementById(id);
  const status = $('try-status');
  const result = $('try-result');
  const run = $('try-run');
  const sample = $('try-sample');
  const inputs = Object.fromEntries([...form.querySelectorAll('input[type=file]')].map((i) => [i.name, i]));
  const MAX_BYTES = 400 * 1024 * 1024;

  const setStatus = (text, error = false) => {
    status.textContent = text;
    status.classList.toggle('is-error', error);
  };
  const busy = (on) => {
    run.disabled = sample.disabled = on;
  };

  for (const input of Object.values(inputs)) {
    const drop = input.closest('.drop');
    const label = drop.querySelector('.drop-file');
    const show = () => {
      const file = input.files[0];
      label.textContent = file ? file.name : label.dataset.empty;
      drop.classList.toggle('has-file', !!file);
    };
    input.addEventListener('change', show);
    for (const type of ['dragenter', 'dragover']) {
      drop.addEventListener(type, (e) => { e.preventDefault(); drop.classList.add('is-over'); });
    }
    for (const type of ['dragleave', 'drop']) {
      drop.addEventListener(type, () => drop.classList.remove('is-over'));
    }
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      if (e.dataTransfer.files.length) { input.files = e.dataTransfer.files; show(); }
    });
  }

  const analyze = (payload) =>
    new Promise((resolve, reject) => {
      const worker = new Worker('/analyzer.worker.js');
      worker.onmessage = (e) => {
        worker.terminate();
        e.data.ok ? resolve(e.data.result) : reject(new Error(e.data.error));
      };
      worker.onerror = (e) => {
        worker.terminate();
        reject(new Error(e.message || 'The analyzer failed to start.'));
      };
      worker.postMessage(payload);
    });

  const text = (file) => (file ? file.text() : Promise.resolve(undefined));
  const fetchFile = async (url, name) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not load ${name}.`);
    return new File([await res.blob()], name);
  };

  function render({ passport, html }, checkedDeclarations) {
    // Without declarations nothing was compared, so a green SHIP would overstate the result.
    const rec = checkedDeclarations ? String(passport.decision.recommendation).toUpperCase() : 'DELTA ONLY';
    const verdict = $('try-verdict');
    verdict.className = `verdict ${checkedDeclarations ? rec.toLowerCase() : 'delta'}`;
    verdict.innerHTML = `${rec}<span aria-hidden="true">●</span>`;

    const d = passport.diff;
    const sev = (s) => passport.findings.filter((f) => f.severity === s).length;
    const stats = [
      ['Findings', String(passport.findings.length)],
      ['High severity', String(sev('high'))],
      ['Added permissions', d.addedPermissions.join(', ') || 'none'],
      ['Added SDKs', d.addedSdks.map((s) => s.name).join(', ') || 'none'],
      ['New destinations', d.addedDomains.join(', ') || 'none'],
    ];
    const list = $('try-stats');
    list.replaceChildren(
      ...stats.map(([k, v]) => {
        const wrap = document.createElement('div');
        const dt = document.createElement('dt');
        const dd = document.createElement('dd');
        dt.textContent = k;
        dd.textContent = v;
        wrap.append(dt, dd);
        return wrap;
      }),
    );

    $('try-frame').srcdoc = html;
    const dl = $('try-download');
    if (dl.dataset.url) URL.revokeObjectURL(dl.dataset.url);
    dl.dataset.url = dl.href = URL.createObjectURL(new Blob([JSON.stringify(passport, null, 2)], { type: 'application/json' }));
    result.hidden = false;
    result.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }

  async function go(files) {
    busy(true);
    result.hidden = true;
    setStatus('Reading builds in your browser…');
    try {
      const { base, candidate, dataSafety, privacyPolicy, listing } = files;
      if (!base || !candidate) throw new Error('Choose both the last shipped build and the release candidate.');
      if (base.size > MAX_BYTES || candidate.size > MAX_BYTES) throw new Error('Builds over 400 MB are too large for the browser. Use the CLI instead.');
      const payload = {
        base,
        candidate,
        dataSafety: await text(dataSafety),
        privacyPolicy: await text(privacyPolicy),
        listing: await text(listing),
      };
      render(await analyze(payload), !!(dataSafety || privacyPolicy || listing));
      setStatus(dataSafety || privacyPolicy || listing ? '' : 'Showing the build delta only. Add a Data Safety JSON to check declarations against the build.');
    } catch (err) {
      setStatus(err.message, true);
    } finally {
      busy(false);
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    go({ base: inputs.base.files[0], candidate: inputs.candidate.files[0], dataSafety: inputs.dataSafety.files[0] });
  });

  sample.addEventListener('click', async () => {
    busy(true);
    setStatus('Loading the synthetic PulseFit sample…');
    try {
      const [base, candidate, dataSafety, privacyPolicy, listing] = await Promise.all([
        fetchFile('/demo/pulsefit-1.2.0.apk', 'pulsefit-1.2.0.apk'),
        fetchFile('/demo/pulsefit-1.3.0.apk', 'pulsefit-1.3.0.apk'),
        fetchFile('/demo/capsule/declarations/data-safety.json', 'data-safety.json'),
        fetchFile('/demo/capsule/declarations/privacy-policy.txt', 'privacy-policy.txt'),
        fetchFile('/demo/capsule/declarations/store-listing.txt', 'store-listing.txt'),
      ]);
      await go({ base, candidate, dataSafety, privacyPolicy, listing });
    } catch (err) {
      setStatus(err.message, true);
      busy(false);
    }
  });
})();
