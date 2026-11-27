// This catalog contains navigation metadata only. Authorization is enforced by
// Vercel Deployment Protection, before any file is served (see README.md).
let catalog;
let filter = 'all';
const cards = document.querySelector('#cards');
function node(tag, text, className) {
  const result = document.createElement(tag);
  if (text) result.textContent = text;
  if (className) result.className = className;
  return result;
}
function link(label, url) {
  const result = node('a', label);
  result.href = url; result.target = '_blank'; result.rel = 'noopener noreferrer';
  return result;
}
function source(path) {
  return `${catalog.repository}/tree/${catalog.branch}/${path}`;
}
function render() {
  if (!catalog) return;
  const query = document.querySelector('#search').value.trim().toLocaleLowerCase();
  const visible = catalog.components.filter(item => {
    const restaurant = ['casa', 'cofein'].includes(item.id);
    return (filter === 'all' || (filter === 'sites' ? restaurant : !restaurant)) &&
      `${item.name} ${item.kind} ${item.source}`.toLocaleLowerCase().includes(query);
  });
  cards.replaceChildren();
  for (const item of visible) {
    const card = node('article', null, 'card');
    card.append(node('p', item.kind, 'eyebrow'), node('h2', item.name), node('code', item.source, 'source'));
    if (item.note) card.append(node('p', item.note, 'note'));
    const actions = node('div', null, 'controls');
    if (item.production) actions.append(link(item.id === 'api' ? 'Адрес API ↗' : 'Открыть ↗', item.production));
    if (item.admin) actions.append(link('Админка ресторана ↗', item.admin));
    card.append(actions);
    const links = node('div', null, 'links');
    links.append(link('Код ↗', source(item.source)), link('Workspace ↗', source(`workspaces/${item.workspace}.code-workspace`)));
    if (item.hosting) links.append(link('Хостинг и логи ↗', item.hosting));
    card.append(links);
    if (item.dependsOn.length) card.append(node('p', 'Использует: ' + item.dependsOn.map(id => catalog.components.find(c => c.id === id)?.name || id).join(' · '), 'dependencies'));
    cards.append(card);
  }
  document.querySelector('#count').textContent = visible.length ? `Компонентов: ${visible.length}` : 'Ничего не найдено. Попробуйте другой запрос.';
}
document.querySelectorAll('[data-filter]').forEach(button => {
  button.addEventListener('click', () => {
    filter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
    render();
  });
});
document.querySelector('#search').addEventListener('input', render);
async function load() {
  try {
    const response = await fetch('catalog.json');
    if (!response.ok) throw new Error('catalog unavailable');
    catalog = await response.json();
    render();
    document.querySelector('#resources').append(link('GitHub ↗', catalog.repository), link('Архитектура и разработка ↗', source('docs/development-workspaces.md')), link('Доступ и публикация Control ↗', source('apps/control/README.md')), link('Настройки доступа ↗', 'https://vercel.com/stepan2215s-projects/seatmap-control/settings/deployment-protection'));
    document.querySelector('#revision').textContent = `Исходники: ${catalog.branch}. Версии production проверяйте в хостинге каждого компонента.`;
  } catch {
    document.querySelector('#error').textContent = 'Каталог не загрузился. Обновите страницу или проверьте доступ к проекту Vercel.';
  }
}
load();
