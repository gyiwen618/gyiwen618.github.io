// Interactive GLB viewer. CAD geometry and rendering stay in the visitor's browser.
const HOME_ORBIT = '305deg 65deg 65%';
// Frame this asymmetric assembly around its visible center, with room to rotate.
const HOME_TARGET = '-0.144m 1.115m 0.419m';
let viewerLibrary;

function loadLibrary() {
  if (customElements.get('model-viewer')) return Promise.resolve();
  if (!viewerLibrary) {
    viewerLibrary = (async () => {
      const urls = [
        'https://cdn.jsdelivr.net/npm/@google/model-viewer@4.1.0/dist/model-viewer.min.js',
        'https://unpkg.com/@google/model-viewer@4.1.0/dist/model-viewer.min.js',
      ];
      for (const url of urls) {
        try {
          await import(url);
          if (!customElements.get('model-viewer')) throw new Error('Viewer was not registered');
          return;
        } catch (error) {
          if (url === urls.at(-1)) throw error;
        }
      }
    })().catch(error => { viewerLibrary = undefined; throw error; });
  }
  return viewerLibrary;
}

export function mountViewer(root) {
  const model = root.querySelector('model-viewer');
  const status = root.querySelector('[data-cad-status]');
  const message = root.querySelector('[data-cad-message]');
  const spinner = root.querySelector('[data-cad-spinner]');
  const retry = root.querySelector('[data-cad-retry]');
  const buttons = [...root.querySelectorAll('[data-cad-control]')];
  const fileInput = root.querySelector('[data-cad-file]');
  let active = false;
  let objectURL;
  let pendingSource = root.dataset.modelSrc || '';
  let timer;
  let homeOrientation = model.orientation || '0deg 0deg 0deg';

  function setState(state, text) {
    root.dataset.state = state;
    root.setAttribute('aria-busy', String(state === 'loading'));
    status.hidden = state === 'ready';
    message.textContent = text;
    spinner.hidden = state !== 'loading';
    retry.hidden = state !== 'error' || !pendingSource;
    buttons.forEach(button => { button.disabled = state !== 'ready'; });
  }

  function failed(text) {
    clearTimeout(timer);
    active = false;
    setState('error', text);
  }

  function startTimer() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      failed('The model is taking longer to load. Check your connection, then try again.');
    }, 90000);
  }

  async function load(source = pendingSource) {
    if (!source || active) return;
    active = true;
    pendingSource = source;
    setState('loading', 'Loading interactive 3D model…');
    startTimer();
    try {
      await loadLibrary();
      model.cameraOrbit = HOME_ORBIT;
      model.cameraTarget = HOME_TARGET;
      model.fieldOfView = '30deg';
      if (model.getAttribute('src') === source) model.removeAttribute('src');
      model.setAttribute('src', source);
    } catch (error) {
      failed('The 3D viewer could not load. Check your connection, then try again.');
    }
  }

  model.addEventListener('progress', event => {
    const progress = event.detail.totalProgress;
    if (root.dataset.state === 'loading' && progress < 1) {
      message.textContent = `Loading interactive 3D model… ${Math.round(progress * 100)}%`;
    }
  });
  model.addEventListener('load', () => {
    clearTimeout(timer);
    active = false;
    setState('ready', 'Interactive model ready.');
  });
  model.addEventListener('error', () => {
    failed('The model could not load. Try again, or download the CAD model below.');
  });

  root.querySelector('[data-cad-reset]').addEventListener('click', () => {
    model.cameraTarget = HOME_TARGET;
    model.cameraOrbit = HOME_ORBIT;
    model.fieldOfView = '30deg';
    model.orientation = homeOrientation;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) model.jumpCameraToGoal();
  });
  root.querySelector('[data-cad-zoom-in]').addEventListener('click', () => model.zoom(2));
  root.querySelector('[data-cad-zoom-out]').addEventListener('click', () => model.zoom(-2));
  retry.addEventListener('click', () => { void load(); });

  if (fileInput) {
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;
      // Check the GLB header locally; the selected file is never uploaded.
      const header = await file.slice(0, 12).arrayBuffer();
      if (header.byteLength < 12 || new DataView(header).getUint32(0, true) !== 0x46546c67) {
        failed('Please choose a binary glTF (.glb) model.');
        return;
      }
      active = false;
      model.removeAttribute('src');
      if (objectURL) URL.revokeObjectURL(objectURL);
      objectURL = URL.createObjectURL(file);
      void load(objectURL);
    });
    addEventListener('pagehide', () => { if (objectURL) URL.revokeObjectURL(objectURL); });
  }

  if (pendingSource) {
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          observer.disconnect();
          void load();
        }
      }, { rootMargin: '300px' });
      observer.observe(root);
    } else {
      void load();
    }
  } else {
    setState('idle', 'Choose Assembly.glb to explore your CAD model.');
  }
  return { load };
}

document.querySelectorAll('[data-cad-viewer]').forEach(mountViewer);
