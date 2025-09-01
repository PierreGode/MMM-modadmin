let config;
let moduleMap = {};
let currentModule = null;
let editModal;
let settingsModal;

document.addEventListener('DOMContentLoaded', () => {
  const root = document.documentElement;
  const themeToggle = document.getElementById('themeToggle');
  const themeIcon = document.getElementById('themeIcon');
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme) {
    root.setAttribute('data-theme', savedTheme);
  }
  const setIcon = () => {
    if (themeIcon) {
      themeIcon.className =
        root.getAttribute('data-theme') === 'dark'
          ? 'bi bi-moon-stars'
          : 'bi bi-brightness-high';
    }
  };
  setIcon();
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const newTheme = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);
      setIcon();
    });
  }

  const settingsBtn = document.getElementById('settingsBtn');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      settingsModal = settingsModal || new bootstrap.Modal(document.getElementById('settingsModal'));
      settingsModal.show();
    });
  }

  const closeModalBtn = document.getElementById('closeModal');
  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', () => {
      editModal?.hide();
    });
  }

  const addSettingBtn = document.getElementById('addSetting');
  if (addSettingBtn) {
    addSettingBtn.addEventListener('click', () => {
      const form = document.getElementById('moduleForm');
      form.appendChild(createConfigRow('', ''));
    });
  }

  const saveModuleBtn = document.getElementById('saveModule');
  if (saveModuleBtn) {
    saveModuleBtn.addEventListener('click', async () => {
      const form = document.getElementById('moduleForm');
      const entry = moduleMap[currentModule] || { module: currentModule };
      entry.config = {};

      form.querySelectorAll('input[data-location="root"]').forEach(input => {
        let val = input.value;
        if (val === '') {
          delete entry[input.dataset.key];
          return;
        }
        try { val = JSON.parse(val); } catch (e) {}
        entry[input.dataset.key] = val;
      });

      form.querySelectorAll('.config-row').forEach(row => {
        const key = row.querySelector('input.key').value;
        if (!key) return;
        let val = row.querySelector('input.value').value;
        if (val === '') return;
        try { val = JSON.parse(val); } catch (e) {}
        entry.config[key] = val;
      });

      if (!moduleMap[currentModule]) {
        config.modules = config.modules || [];
        config.modules.push(entry);
      }
      moduleMap[currentModule] = entry;

      await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });

      editModal?.hide();
    });
  }

  loadModules();
});

function openEditor(name) {
  currentModule = name;
  const modalEl = document.getElementById('editModal');
  const title = document.getElementById('modalTitle');
  const form = document.getElementById('moduleForm');
  title.textContent = name;

  const entry = moduleMap[name] || { module: name, config: {} };
  form.innerHTML = '';
  form.appendChild(createRootRow('position', entry.position || ''));
  Object.keys(entry).forEach(k => {
    if (['module', 'position', 'config'].includes(k)) return;
    form.appendChild(createRootRow(k, entry[k]));
  });
  Object.keys(entry.config || {}).forEach(k => {
    form.appendChild(createConfigRow(k, entry.config[k]));
  });

  editModal = editModal || new bootstrap.Modal(modalEl);
  editModal.show();
}

async function loadModules() {
  const modules = await fetch('/api/modules').then(r => r.json());
  config = await fetch('/api/config').then(r => r.json());
  const container = document.getElementById('modules');

  (config.modules || []).forEach(m => { moduleMap[m.module] = m; });

  modules.forEach(mod => {
    const name = mod.name || mod;
    const card = document.createElement('div');
    card.className = 'module-card card-shadow';

    const title = document.createElement('h2');
    title.textContent = name;
    card.appendChild(title);

    const actions = document.createElement('div');
    actions.className = 'module-actions';
    card.appendChild(actions);

    const toggleBtn = document.createElement('button');
    const enabled = !!moduleMap[name];
    setToggleButton(toggleBtn, enabled);
    toggleBtn.addEventListener('click', async () => {
      const res = await fetch(`/api/modules/${encodeURIComponent(name)}/toggle`, { method: 'POST' });
      const data = await res.json();
      setToggleButton(toggleBtn, data.enabled);
    });
    actions.appendChild(toggleBtn);

    const editBtn = document.createElement('button');
    editBtn.textContent = t('edit');
    editBtn.dataset.i18n = 'edit';
    editBtn.addEventListener('click', () => openEditor(name));
    actions.appendChild(editBtn);

    if (mod.hasUpdate) {
      const upBtn = document.createElement('button');
      upBtn.textContent = t('update');
      upBtn.dataset.i18n = 'update';
      upBtn.addEventListener('click', () => updateModule(name));
      actions.appendChild(upBtn);
    }

    container.appendChild(card);
  });

  applyTranslations();
}

function setToggleButton(btn, enabled) {
  btn.textContent = enabled ? 'enabled' : 'disabled';
  btn.className = enabled ? 'status-btn enabled' : 'status-btn disabled';
}

async function updateModule(name) {
  await fetch(`/api/modules/${encodeURIComponent(name)}/update`, { method: 'POST' });
  await new Promise(resolve => setTimeout(resolve, 10000));
  location.reload();
}

function createRootRow(key, value) {
  const div = document.createElement('div');
  div.className = 'mb-3';
  const label = document.createElement('label');
  label.className = 'form-label';
  label.textContent = key;
  const input = document.createElement('input');
  input.className = 'form-control';
  input.value = typeof value === 'object' ? JSON.stringify(value) : value;
  input.dataset.key = key;
  input.dataset.location = 'root';
  div.appendChild(label);
  div.appendChild(input);
  return div;
}

function createConfigRow(key, value) {
  const div = document.createElement('div');
  div.className = 'row g-2 align-items-center mb-2 config-row';
  const keyCol = document.createElement('div');
  keyCol.className = 'col-5';
  const keyInput = document.createElement('input');
  keyInput.className = 'form-control key';
  keyInput.value = key;
  keyCol.appendChild(keyInput);
  const valCol = document.createElement('div');
  valCol.className = 'col-7';
  const valInput = document.createElement('input');
  valInput.className = 'form-control value';
  valInput.value = typeof value === 'object' ? JSON.stringify(value) : value;
  valCol.appendChild(valInput);
  div.appendChild(keyCol);
  div.appendChild(valCol);
  return div;
}

