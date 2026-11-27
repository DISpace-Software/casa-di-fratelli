# cofein: первый запуск и публикация

1. Выполните [общую подготовку](../../CONTRIBUTING.md), откройте `workspaces/cofein.code-workspace`.
2. Запустите задачу «Запустить локально»; адрес: http://127.0.0.1:5175/cofein-preview.html. API выбран локальный, порт 5183.
3. Основные изменения вносите в `frontend/src/apps/cofein`. Общие компоненты и `frontend/public` могут влиять на несколько приложений. Для админки также используются `frontend/src/admin` и `frontend/src/components/admin`; проверьте оба ресторана.
4. Проверка из корня:

```sh
python3 scripts/check-architecture.py
npm --prefix frontend test
npm --prefix frontend run test:cofein
npm --prefix frontend run build:cofein
```

Проверьте изменённый экран на узкой и широкой ширине. Для общего веб-кода соберите все три цели: `build`, `build:cofein`, `build:admin`. CI выполняет эти сборки для каждого PR.

5. Создайте PR по [общему процессу](../../CONTRIBUTING.md). После ревью и merge Vercel публикует соответствующий проект; проверьте SHA в `/release.json` и затронутый экран. Сборки остальных веб-проектов тоже могут запуститься. Подробности и откат: [регламент](../release-operations.md).
