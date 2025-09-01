let config;
let moduleMap = {};
let currentModule = null;

const root = document.documentElement;
const themeToggle = document.getElementById('themeToggle');
const savedTheme = localStorage.getItem('theme');
if (savedTheme) {
  root.setAttribute('data-theme', savedTheme);
}
if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    const newTheme = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  });
}

const settingsBtn = document.getElementById('settingsBtn');
if (settingsBtn) {
  settingsBtn.addEventListener('click', () => {
    document.getElementById('settingsModal').classList.remove('hidden');
  });
}

const closeSettings = document.getElementById('closeSettings');
if (closeSettings) {
  closeSettings.addEventListener('click', () => {
    document.getElementById('settingsModal').classList.add('hidden');
  });
}

function createFieldRow(key = '', value = '', allowKey = false) {
  const row = document.createElement('div');
  row.className = 'field-row';

  const keyInput = document.createElement('input');
  keyInput.type = 'text';
  keyInput.className = 'field-key';
  keyInput.value = key;
  if (!allowKey) {
    keyInput.disabled = true;
    keyInput.dataset.key = key;
  }

  const valueInput = document.createElement('input');
  valueInput.type = 'text';
  valueInput.className = 'field-value';
  valueInput.value = value;

  row.appendChild(keyInput);
  row.appendChild(valueInput);
  return row;
}

function openEditor(name) {
  currentModule = name;
  const modal = document.getElementById('editModal');
  const title = document.getElementById('modalTitle');
  const fields = document.getElementById('formFields');
  title.textContent = name;
  fields.innerHTML = '';

  const conf = moduleMap[name] ? moduleMap[name].config || {} : {};
  Object.keys(conf).forEach(key => {
    fields.appendChild(createFieldRow(key, conf[key], false));
  });

  modal.classList.remove('hidden');
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

    const header = document.createElement('div');
    header.className = 'module-header';
    card.appendChild(header);

    const title = document.createElement('h2');
    title.textContent = name;
    header.appendChild(title);

    const actions = document.createElement('div');
    actions.className = 'module-actions';
    header.appendChild(actions);

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

async function updateModule(name) {
  await fetch(`/api/modules/${encodeURIComponent(name)}/update`, { method: 'POST' });
  location.reload();
}

document.getElementById('addField').addEventListener('click', () => {
  const fields = document.getElementById('formFields');
  fields.appendChild(createFieldRow('', '', true));
});

document.getElementById('closeModal').addEventListener('click', () => {
  document.getElementById('editModal').classList.add('hidden');
});

document.getElementById('saveModule').addEventListener('click', async () => {
  const rows = document.querySelectorAll('#formFields .field-row');
  const newConf = {};
  rows.forEach(row => {
    const keyInput = row.querySelector('.field-key');
    const valueInput = row.querySelector('.field-value');
    const key = keyInput.dataset.key || keyInput.value.trim();
    if (!key) return;
    const valStr = valueInput.value;
    try {
      newConf[key] = JSON.parse(valStr);
    } catch (e) {
      newConf[key] = valStr;
    }
  });

  if (moduleMap[currentModule]) {
    moduleMap[currentModule].config = newConf;
  } else {
    config.modules = config.modules || [];
    const entry = { module: currentModule, config: newConf };
    config.modules.push(entry);
    moduleMap[currentModule] = entry;
  }

  await fetch('/api/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  });

  document.getElementById('editModal').classList.add('hidden');
});

loadModules();

