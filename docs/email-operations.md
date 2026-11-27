# Почта SeatMap

## Ящики и отправители

| Адрес | Назначение | Где управлять |
| --- | --- | --- |
| support@seatmap.bg | Основной ящик, вход администратора, ответы клиентов | Google Workspace |
| reservations@seatmap.bg | Бронирования и очередь ожидания | Псевдоним Workspace + отправитель Resend |
| account@seatmap.bg | Подтверждение аккаунта, сброс пароля | Псевдоним Workspace + отправитель Resend |
| info@seatmap.bg | Общие обращения | Псевдоним Workspace |
| dmarc@seatmap.bg | Агрегированные отчёты аутентификации | Псевдоним Workspace |

Все псевдонимы доставляют входящие письма в support. Отдельных паролей у них нет.
Для ручной отправки с псевдонима настройте «Отправлять письма как» в Gmail;
создание псевдонима само по себе не добавляет его в список From Gmail.

Casa di Fratelli сохраняет свои FROM_EMAIL / MARKETING_FROM_EMAIL и существующий
Resend-домен. Глобальные переменные ресторанного отправителя нельзя заменять
на SeatMap: это изменило бы письма Casa.

## Серверная конфигурация

Render → seatmap-api → Environment. Значения секретов сюда не копировать.

- `Platform__Email__From`: `SeatMap <account@seatmap.bg>`.
- `Platform__Email__ReservationsFrom`: `SeatMap <reservations@seatmap.bg>`.
- `Platform__Email__ReplyTo`: `support@seatmap.bg`.
- `Platform__Email__ApiKey`: необязательный отдельный ключ; иначе используется серверный `RESEND_API_KEY`.
- `Tenancy__Email__cofein__FROM_EMAIL`: `Cofein via SeatMap <reservations@seatmap.bg>`.
- `Tenancy__Email__cofein__REPLY_TO_EMAIL`: `support@seatmap.bg`, пока ресторан не предоставит свой адрес.
- `Tenancy__Email__cofein__RESEND_API_KEY`: серверный ключ с доступом к seatmap.bg.
- `Tenancy__Tenants__1__NotificationsEnabled`: включается только после проверки домена.

Cofein сохраняет автоматическое подтверждение бронирования; гостю отправляется
информационное письмо без дополнительного требования подтверждать бронь.
Маркетинговый FROM для Cofein не задаётся: включение бронирований не включает
рекламные письма. Для каждого нового ресторана задавайте его собственный scoped
FROM / Reply-To / ключ и проверяйте соответствие индекса tenant ID перед изменением.
Приложение получает подтверждение и коды от API: ключей Resend и пароля Gmail в
Flutter нет, переустановка приложения для смены отправителя не нужна.

## DNS и доставка

- Корневой MX: `1 smtp.google.com.` — входящие в Workspace.
- Корневой SPF: `v=spf1 include:_spf.google.com ~all`.
- Google DKIM: TXT `google._domainkey`, публичный ключ из Google Admin; подпись включается отдельно.
- Resend DKIM: TXT `resend._domainkey`, значение из Resend.
- Resend return path: MX `send` → `10 feedback-smtp.eu-west-1.amazonses.com.`;
  TXT `send` → `v=spf1 include:amazonses.com ~all`.
- Resend CNAME `rsend` → `send.forge.rmta.net.`.
- DMARC: TXT `_dmarc` → `v=DMARC1; p=none; rua=mailto:dmarc@seatmap.bg; adkim=r; aspf=r`.

Google и Resend используют разные envelope sender domains; не создавайте второй
SPF в корне. Resend receiving отключён, корневой MX Google не заменяется MX Resend.
DMARC `p=none` собирает отчёты, но не блокирует подделки. После проверки всех
легитимных отправителей и отчётов переходите постепенно к quarantine/reject.

Перед сменой отправителя дождитесь Verified в Resend. Проверьте письмо на
контролируемый адрес: доставку, From, Reply-To, SPF/DKIM/DMARC PASS в исходнике,
отображение на телефоне. Успех HTTP API означает приём Resend, а не попадание
во «Входящие». Следите за bounced/complained и не используйте новый домен для
непрошенных рассылок. Нельзя гарантировать отсутствие спама только DNS-настройками.

## Пароли и восстановление

Control — навигационная панель с публичным исходным кодом, не хранилище секретов.
Пароль Workspace сохраните в менеджере паролей под названием «SeatMap — Google
Workspace», логин support@seatmap.bg, сайт accounts.google.com. Для коллег
используйте менеджер с командным хранилищем и индивидуальным доступом.
Не сохраняйте пароль в catalog.json, GitHub, заметках Control или localStorage.
Включите двухэтапную проверку и сохраните резервные коды в защищённом хранилище.
Секреты Resend находятся только в Render; отзыв/замена ключа выполняется в Resend
с последующим обновлением Render и перезапуском сервиса.

Откат: верните предыдущие scoped переменные и разверните предыдущий проверенный
коммит API. Не меняйте root MX для отката серверного отправителя и не трогайте
настройки Casa. Все изменения отправителей выполняйте без миграций базы.
