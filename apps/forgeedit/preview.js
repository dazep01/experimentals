const PREVIEW_IFRAME_ID = 'forgeedit-preview-iframe-overlay';

function getWorkspaceRootFromPath(path) {
  const p = String(path || '').replace(/^\/+/, '').trim();
  if (!p) return '/';
  const parts = p.split('/');
  return parts.length > 1 ? parts[0] : '/';
}

function buildPreviewUrl() {
  const activePath = state.activeTab;
  const url = new URL('preview.html', location.href);

  if (activePath) {
    const cleanPath = String(activePath).replace(/^\/+/, '');
    const root = getWorkspaceRootFromPath(cleanPath);
    if (root && root !== '/') url.searchParams.set('root', root);
    url.searchParams.set('file', cleanPath);
  }

  return url.toString();
}

function ensurePreviewOverlay() {
  let overlay = document.getElementById(PREVIEW_IFRAME_ID);
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = PREVIEW_IFRAME_ID;
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 99999;
    background: rgba(0,0,0,.55);
    display: none;
  `;

  overlay.innerHTML = `
    <div style="position:absolute;inset:0;background:var(--bg, #0f1115);">
      <button id="forgeedit-preview-close"
        style="
          position:absolute;
          top:12px;
          right:12px;
          z-index:2;
          width:40px;
          height:40px;
          border:0;
          border-radius:12px;
          background:rgba(0,0,0,.55);
          color:#fff;
          font-size:20px;
          cursor:pointer;
        ">×</button>

      <iframe
        id="forgeedit-preview-frame"
        sandbox="allow-scripts allow-forms allow-modals allow-pointer-lock allow-popups"
        style="width:100%;height:100%;border:0;background:#fff;"
      ></iframe>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector('#forgeedit-preview-close').addEventListener('click', closePreview);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closePreview();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePreview();
  });

  return overlay;
}

// Attach ke semua tombol dengan class toggle-preview
document.querySelectorAll('.toggle-preview').forEach(btn => {
  btn.addEventListener('click', openPreview);
});

function openPreview() {
  const overlay = ensurePreviewOverlay();
  const frame = overlay.querySelector('#forgeedit-preview-frame');

  frame.src = buildPreviewUrl();
  overlay.style.display = 'block';
  document.body.style.overflow = 'hidden';
}

function closePreview() {
  const overlay = document.getElementById(PREVIEW_IFRAME_ID);
  if (!overlay) return;
  overlay.style.display = 'none';
  document.body.style.overflow = '';
}
