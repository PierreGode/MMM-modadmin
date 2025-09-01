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

  modules.forEach(name => {
    const card = document.createElement('div');
    card.className = 'module-card card-shadow';
    const title = document.createElement('h2');
    title.textContent = name;
    card.appendChild(title);

    const btn = document.createElement('button');
    btn.textContent = 'Edit';
    btn.addEventListener('click', () => openEditor(name));
    card.appendChild(btn);

    container.appendChild(card);
  });
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

