async function loadModules() {
  const modules = await fetch('/api/modules').then(r => r.json());
  const config = await fetch('/api/config').then(r => r.json());
  const container = document.getElementById('modules');

  const moduleMap = {};
  (config.modules || []).forEach(m => { moduleMap[m.module] = m; });

  modules.forEach(name => {
    const card = document.createElement('div');
    card.className = 'module-card';
    const title = document.createElement('h2');
    title.textContent = name;
    card.appendChild(title);

    const textarea = document.createElement('textarea');
    const conf = moduleMap[name] ? moduleMap[name].config || {} : {};
    textarea.value = JSON.stringify(conf, null, 2);
    card.appendChild(textarea);

    const btn = document.createElement('button');
    btn.textContent = 'Save';
    btn.addEventListener('click', async () => {
      const newConf = JSON.parse(textarea.value || '{}');
      if (moduleMap[name]) {
        moduleMap[name].config = newConf;
      } else {
        config.modules = config.modules || [];
        config.modules.push({ module: name, config: newConf });
      }
      await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
    });
    card.appendChild(btn);

    container.appendChild(card);
  });
}

loadModules();
