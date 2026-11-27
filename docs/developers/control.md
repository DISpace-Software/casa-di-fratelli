# Control: разработка панели

Откройте `workspaces/platform.code-workspace`. Код: `apps/control`. Подготовка и PR-процесс: [CONTRIBUTING](../../CONTRIBUTING.md).

```sh
python3 -m http.server 4311 --bind 127.0.0.1 --directory apps/control
```

Откройте http://127.0.0.1:4311. Каталог ссылок — `catalog.json`, отображение — `app.js`, стили — `style.css`. Не размещайте здесь секреты: исходники публичные.

Перед PR выполните `node --check apps/control/app.js` и `python3 -m json.tool apps/control/catalog.json`, проверьте поиск, фильтры, ссылки инструкций и мобильную ширину.

После ревью и merge Vercel собирает проект `seatmap-control`. Проверьте вход авторизованного сотрудника и защиту HTML, JS и каталога от анонимных запросов. Не отключайте Deployment Protection ради доступа коллеги. Подробности: [README панели](../../apps/control/README.md).
