# API и базы: разработка

Выполните [общую подготовку](../../CONTRIBUTING.md), откройте `workspaces/backend.code-workspace`. Нужны .NET 8 и локальный PostgreSQL для интеграционной работы.

Начните с проверки без production-подключений:

```sh
dotnet build backend/backend.sln
# Запускайте нужный проект проверок из backend/*Checks/:
dotnet run --project backend/CasaDiFratelli.TenancyChecks/CasaDiFratelli.TenancyChecks.csproj
```

Перед запуском API настройте локальные строки подключения, tenants и CORS через локальную конфигурацию/user-secrets. Убедитесь, что все базы локальные: startup может выполнять миграции в зависимости от конфигурации. Команда после настройки: `dotnet run --project backend/SeatMap.Api/SeatMap.Api.csproj --urls http://localhost:5183`.

Меняйте код в `backend/SeatMap.Api`, сохраняйте границы ресторанных данных и профилей платформы. Изменения контрактов проверьте в затронутых клиентах. Все проекты `backend/*Checks` запускаются в CI.

Публикация: PR → проверки → независимое ревью → merge → Render. Миграции не выполняются CI автоматически; следуйте [регламенту миграций и отката](../release-operations.md). После релиза проверьте каталог и read-endpoints каждого ресторана, а не только health check.
