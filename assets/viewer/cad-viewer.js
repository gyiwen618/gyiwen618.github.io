// Interactive GLB viewer. CAD geometry and rendering stay in the visitor's browser.
const HOME_ORBIT = '305deg 65deg 65%';
// Frame this asymmetric assembly around its visible center, with room to rotate.
const HOME_TARGET = '-0.144m 1.115m 0.419m';
// Display colors keyed by the original GLB material names; geometry stays unchanged.
const CAD_MATERIAL_STYLES = new Map([
  ["0.372549_0.654902_0.239216_0.000000_0.000000", ["#2f8068"]],
  ["1.000000_1.000000_1.000000_0.000000_0.000000", ["#a5b2bf"]],
  ["0.713725_0.772549_0.788235_0.000000_0.000000", ["#51687a", 0.25, 0.5]],
  ["0.878431_0.949020_1.000000_0.000000_0.000000", ["#799bb0"]],
  ["0.000000_0.600000_0.000000_0.000000_0.000000", ["#326b4a"]],
  ["0.000000_1.000000_0.000000_0.000000_0.000000", ["#53a658"]],
  ["0.615686_0.811765_0.929412_0.000000_0.000000", ["#426987"]],
  ["0.811765_0.858824_0.898039_0.000000_0.000000", ["#6e8499"]],
  ["0.498039_0.498039_0.498039_0.000000_0.000000", ["#677484", 0.25, 0.5]],
  ["0.513725_0.737255_0.407843_0.000000_0.000000", ["#3a8b6b"]],
  ["0.000000_0.000000_0.000000_0.000000_0.000000", ["#26303b"]],
  ["0.960784_0.835294_0.470588_0.000000_0.000000", ["#bf903d", 0.25, 0.5]],
  ["0.894118_0.913725_0.929412_0.000000_0.000000", ["#8297aa", 0.25, 0.5]],
  ["0.701961_0.701961_0.701961_0.000000_0.000000", ["#8e9ba8", 0.25, 0.5]],
  ["0.796078_0.905882_0.745098_0.000000_0.000000", ["#659f88"]],
  ["0.647059_0.647059_0.647059_0.000000_0.000000", ["#596a7b", 0.25, 0.5]],
  ["0.917647_0.917647_0.917647_0.000000_0.000000", ["#9aa8b5", 0.25, 0.5]],
  ["0.654902_0.823529_0.576471_0.000000_0.000000", ["#478c73"]],
  ["0.701961_0.701961_0.701961_0.000000_0.701961", ["#8493a3"]],
]);

function applyCADPalette(viewer) {
  for (const material of viewer.model.materials) {
    const style = CAD_MATERIAL_STYLES.get(material.name);
    if (!style) continue;
    const pbr = material.pbrMetallicRoughness;
    const alpha = pbr.baseColorFactor[3];
    // CSS strings use sRGB; retain the opacity of transparent covers.
    pbr.setBaseColorFactor(style[0]);
    if (alpha < 1) {
      const color = [...pbr.baseColorFactor];
      color[3] = alpha;
      pbr.setBaseColorFactor(color);
    }
    pbr.setMetallicFactor(style[1] ?? 0.05);
    pbr.setRoughnessFactor(style[2] ?? 0.75);
  }
}

function revealProjectPage() {
  document.dispatchEvent(new Event('cad-page-reveal'));
}

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
    revealProjectPage();
  }

  function startTimer() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      failed('The model is taking longer to load. Check your connection, then try again.');
    }, 25000);
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
      const pageMessage = document.querySelector('[data-cad-page-message]');
      if (pageMessage) pageMessage.textContent = `Loading project… ${Math.round(progress * 100)}%`;
    }
  });
  model.addEventListener('load', () => {
    applyCADPalette(model);
    clearTimeout(timer);
    active = false;
    setState('ready', 'Interactive model ready.');
    // Let the recolored model paint before the project page fades in.
    requestAnimationFrame(() => requestAnimationFrame(revealProjectPage));
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
  retry.addEventListener('click', () => {
    // The renderer can cache a rejected model request; retry with a fresh URL.
    const source = new URL(pendingSource, document.baseURI);
    if (source.protocol === 'http:' || source.protocol === 'https:') {
      source.searchParams.set('cad-retry', String(Date.now()));
    }
    void load(source.href);
  });

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
    if (document.documentElement.hasAttribute('data-cad-project-page')) {
      // A page waiting on this model must load it even when opened at an anchor.
      void load();
    } else if ('IntersectionObserver' in window) {
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
