let filter = 'all';
let catalog = [];
const states = { ready: 'Запущен', starting: 'Запускается', external: 'Порт занят вне панели', stopped: 'Не запущен' };
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function link(label, href) {
  const node = element('a', label);
  node.href = href; node.target = '_blank'; node.rel = 'noopener noreferrer';
  return node;
}
async function action(id, operation, button) {
  button.disabled = true;
  try {
    const response = await fetch(`/api/${id}/${operation}`, { method: 'POST', headers: { 'X-SeatMap-Launcher': '1' } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    document.querySelector('#error').textContent = '';
    await refresh();
  } catch (error) { document.querySelector('#error').textContent = error.message; }
  finally { button.disabled = false; }
}
function render() {
  const cards = document.querySelector('#cards'); cards.replaceChildren();
  for (const item of catalog) {
    const site = ['casa', 'cofein'].includes(item.id);
    if ((filter === 'sites' && !site) || (filter === 'platform' && site)) continue;
    const card = element('article', null, 'card');
    card.append(element('p', item.kind, 'eyebrow'), element('h2', item.name), element('code', item.source, 'source'));
    if (item.task) card.append(element('span', states[item.state], `status ${item.state}`));
    if (item.exitCode != null && item.exitCode !== 0) card.append(element('p', `Процесс завершился с кодом ${item.exitCode}. Проверьте локальный журнал.`, 'warning'));
    if (item.note) card.append(element('p', item.note, 'note'));
    const controls = element('div', null, 'controls');
    if (item.task) {
      const button = element('button', item.owned ? 'Остановить' : 'Запустить локально', 'primary');
      button.disabled = item.state === 'external';
      button.onclick = () => action(item.id, item.owned ? 'stop' : 'start', button);
      controls.append(button);
      if (item.state === 'ready') controls.append(link('Предпросмотр ↗', `http://127.0.0.1:${item.port}${item.path}`));
    }
    controls.append(link('Открыть код ↗', item.workspaceUrl.replace('file://', 'vscode://file')));
    card.append(controls);
    const links = element('div', null, 'links');
    if (item.production) links.append(link('Рабочий сайт ↗', item.production));
    if (item.admin) links.append(link('Админка ↗', item.admin));
    if (item.hosting) links.append(link('Хостинг и логи ↗', item.hosting));
    card.append(links);
    if (item.dependsOn.length) card.append(element('p', `Зависит от: ${item.dependsOn.join(' · ')}`, 'dependencies'));
    cards.append(card);
  }
}
async function refresh() {
  try {
    const response = await fetch('/api/catalog');
    if (!response.ok) throw new Error('Панель недоступна');
    const result = await response.json();
    // Avoid replacing focused controls when nothing changed during polling.
    if (JSON.stringify(catalog) !== JSON.stringify(result.components)) { catalog = result.components; render(); }
  } catch (error) { document.querySelector('#error').textContent = error.message; }
}
document.querySelectorAll('[data-filter]').forEach(button => {
  button.onclick = () => {
    filter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    render();
  };
});
refresh();
setInterval(refresh, 3000);
