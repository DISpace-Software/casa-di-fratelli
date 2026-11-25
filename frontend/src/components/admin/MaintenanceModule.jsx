/**
 * Archive and backup feature UI. Mutations use the authenticated parent adapter;
 * reservation/order refresh callbacks keep the surrounding dashboard consistent.
 */
import React from 'react';
import { API_BASE_URL } from '../../config/api';
import { readErrorMessage } from '../../admin/api/response.js';
import { Panel } from './AdminPrimitives.jsx';
import { formatEuroAmount } from '../../admin/presentation/formatters.js';

export function MaintenanceModule({ adminLanguage, adminFetch, loadReservations, loadDiningOrders, isProVersion = false }) {
  const [mode, setMode] = React.useState("reservations");
  const [archiveKind, setArchiveKind] = React.useState("upcoming");
  const [reason, setReason] = React.useState("");
  const [fromDate, setFromDate] = React.useState("");
  const [toDate, setToDate] = React.useState("");
  const [archiveRecords, setArchiveRecords] = React.useState([]);
  const [backupFiles, setBackupFiles] = React.useState([]);
  const [backupSettings, setBackupSettings] = React.useState({
    enabled: true,
    intervalDays: 7,
    runAtLocalTime: "03:00",
    timeZoneId: "Europe/Sofia",
  });
  const [backupBusy, setBackupBusy] = React.useState(false);
  const [backupSettingsBusy, setBackupSettingsBusy] = React.useState(false);
  const [notice, setNotice] = React.useState("");
  const [error, setError] = React.useState("");

  const text = {
    bg: {
      title: "Поддръжка",
      subtitle: isProVersion
        ? "Безопасно скриване и възстановяване на резервации и поръчки. Данните не се трият физически."
        : "Безопасно скриване и възстановяване на резервации. Данните не се трият физически.",
      reservations: "Резервации",
      orders: "Поръчки",
      reason: "Причина за изтриване",
      from: "От дата",
      to: "До дата",
      deleteAll: "Скрий всички",
      deletePeriod: "Скрий за период",
      archive: "Архив",
      upcoming: "Предстоящи",
      completed: "Състояли се",
      walkins: "Без резервация",
      active: "Активни",
      deleted: "Изтрити",
      restore: "Възстанови",
      loadArchive: "Покажи архива",
      period: "Период",
      empty: "Няма записи за избрания филтър.",
      guest: "Гост",
      table: "Маса",
      date: "Дата",
      order: "Поръчка",
      total: "Общо",
      backups: "Резервни копия",
      backupSubtitle: "Четим JSON файл с клиентска база и всички резервации. Автоматично се създава нов файл веднъж седмично.",
      createBackup: "Създай копие",
      refreshBackups: "Обнови списъка",
      download: "Изтегли",
      noBackups: "Още няма създадени резервни копия.",
      backupCreated: "Резервното копие е създадено.",
      backupAdvice: "За максимална сигурност пазете тези файлове извън сървъра и включете managed PostgreSQL backups при хостинг доставчика.",
      automaticBackups: "Автоматични копия",
      enabled: "Включени",
      intervalDays: "Период в дни",
      runAt: "Час на създаване",
      saveSchedule: "Запази графика",
      scheduleSaved: "Графикът за резервни копия е запазен.",
      scheduleHint: "Системата проверява графика на всеки 15 минути. Часът е по Europe/Sofia.",
      warning: "Това действие ще скрие избраните записи. Те могат да бъдат възстановени само от Admin, Собственик или Програмист.",
    },
    en: {
      title: "Maintenance",
      subtitle: isProVersion
        ? "Safe soft delete and restore for reservations and orders. Data is not physically removed."
        : "Safe soft delete and restore for reservations. Data is not physically removed.",
      reservations: "Reservations",
      orders: "Orders",
      reason: "Delete reason",
      from: "From date",
      to: "To date",
      deleteAll: "Hide all",
      deletePeriod: "Hide period",
      archive: "Archive",
      upcoming: "Upcoming",
      completed: "Completed",
      walkins: "Walk-ins",
      active: "Active",
      deleted: "Deleted",
      restore: "Restore",
      loadArchive: "Show archive",
      period: "Period",
      empty: "No records for the selected filter.",
      guest: "Guest",
      table: "Table",
      date: "Date",
      order: "Order",
      total: "Total",
      backups: "Backups",
      backupSubtitle: "Readable JSON file with customer database and all reservations. A new file is created automatically once per week.",
      createBackup: "Create backup",
      refreshBackups: "Refresh list",
      download: "Download",
      noBackups: "No backups have been created yet.",
      backupCreated: "Backup was created.",
      backupAdvice: "For maximum safety, keep these files outside the server and enable managed PostgreSQL backups with the hosting provider.",
      automaticBackups: "Automatic backups",
      enabled: "Enabled",
      intervalDays: "Period in days",
      runAt: "Run time",
      saveSchedule: "Save schedule",
      scheduleSaved: "Backup schedule was saved.",
      scheduleHint: "The system checks the schedule every 15 minutes. Time is Europe/Sofia.",
      warning: "This action will hide selected records. They can be restored only by Admin, Owner, or Developer.",
    },
  }[adminLanguage] || {
    title: "Поддержка",
    subtitle: isProVersion
      ? "Безопасное скрытие и восстановление резерваций и заказов. Данные не удаляются физически."
      : "Безопасное скрытие и восстановление резерваций. Данные не удаляются физически.",
    reservations: "Резервации",
    orders: "Заказы",
    reason: "Причина удаления",
    from: "С даты",
    to: "До даты",
    deleteAll: "Скрыть всё",
    deletePeriod: "Скрыть период",
    archive: "Архив",
    upcoming: "Предстоящие",
    completed: "Состоялись",
    walkins: "Walk-in",
    active: "Активные",
    deleted: "Удалённые",
    restore: "Восстановить",
    loadArchive: "Показать архив",
    period: "Период",
    empty: "Нет записей по выбранному фильтру.",
    guest: "Гость",
    table: "Стол",
    date: "Дата",
    order: "Заказ",
    total: "Итого",
    backups: "Резервные копии",
    backupSubtitle: "Читаемый JSON-файл с базой клиентов и всеми резервациями. Новый файл автоматически создаётся раз в неделю.",
    createBackup: "Создать копию",
    refreshBackups: "Обновить список",
    download: "Скачать",
    noBackups: "Резервные копии ещё не созданы.",
    backupCreated: "Резервная копия создана.",
    backupAdvice: "Для максимальной надёжности храните эти файлы вне сервера и включите managed PostgreSQL backups у хостинг-провайдера.",
    automaticBackups: "Автоматические копии",
    enabled: "Включены",
    intervalDays: "Период в днях",
    runAt: "Время создания",
    saveSchedule: "Сохранить график",
    scheduleSaved: "График резервных копий сохранён.",
    scheduleHint: "Система проверяет график каждые 15 минут. Время Europe/Sofia.",
    warning: "Это действие скроет выбранные записи. Их смогут восстановить только Admin, Собственник или Разработчик.",
  };

  const safeMode = isProVersion ? mode : "reservations";
  const target = safeMode === "reservations" ? "reservations" : "orders";
  const archiveOptions = target === "reservations"
    ? [
        ["upcoming", text.upcoming],
        ["completed", text.completed],
        ["walkins", text.walkins],
        ["deleted", text.deleted],
      ]
    : [
        ["active", text.active],
        ["completed", text.completed],
        ["deleted", text.deleted],
      ];

  React.useEffect(() => {
    if (!isProVersion && mode === "orders")
      setMode("reservations");
  }, [isProVersion, mode]);

  React.useEffect(() => {
    setArchiveKind(safeMode === "reservations" ? "upcoming" : "active");
    setArchiveRecords([]);
  }, [safeMode]);

  const loadBackups = React.useCallback(async () => {
    setError("");
    const response = await adminFetch(`${API_BASE_URL}/api/maintenance/backups`);
    if (!response.ok) {
      setError(await readErrorMessage(response, "Failed to load backups."));
      return;
    }

    const data = await response.json();
    setBackupFiles(Array.isArray(data) ? data : []);
  }, [adminFetch]);

  const loadBackupSettings = React.useCallback(async () => {
    setError("");
    const response = await adminFetch(`${API_BASE_URL}/api/maintenance/backups/settings`);
    if (!response.ok) {
      setError(await readErrorMessage(response, "Failed to load backup settings."));
      return;
    }

    const data = await response.json();
    setBackupSettings({
      enabled: Boolean(data.enabled ?? data.Enabled ?? true),
      intervalDays: Number(data.intervalDays ?? data.IntervalDays ?? 7),
      runAtLocalTime: data.runAtLocalTime || data.RunAtLocalTime || "03:00",
      timeZoneId: data.timeZoneId || data.TimeZoneId || "Europe/Sofia",
    });
  }, [adminFetch]);

  React.useEffect(() => {
    loadBackups();
    loadBackupSettings();
  }, [loadBackups, loadBackupSettings]);

  async function downloadBackup(fileName) {
    setError("");
    const response = await adminFetch(`${API_BASE_URL}/api/maintenance/backups/${encodeURIComponent(fileName)}`);
    if (!response.ok) {
      setError(await readErrorMessage(response, "Failed to download backup."));
      return;
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }

  async function createBackup() {
    setNotice("");
    setError("");
    setBackupBusy(true);

    try {
      const response = await adminFetch(`${API_BASE_URL}/api/maintenance/backups`, { method: "POST" });
      if (!response.ok) {
        setError(await readErrorMessage(response, "Failed to create backup."));
        return;
      }

      const backup = await response.json();
      setNotice(text.backupCreated);
      await loadBackups();
      if (backup?.fileName || backup?.FileName) {
        await downloadBackup(backup.fileName || backup.FileName);
      }
    } finally {
      setBackupBusy(false);
    }
  }

  async function saveBackupSettings() {
    setNotice("");
    setError("");
    setBackupSettingsBusy(true);

    try {
      const response = await adminFetch(`${API_BASE_URL}/api/maintenance/backups/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...backupSettings,
          intervalDays: Number(backupSettings.intervalDays || 7),
          timeZoneId: backupSettings.timeZoneId || "Europe/Sofia",
        }),
      });

      if (!response.ok) {
        setError(await readErrorMessage(response, "Failed to save backup settings."));
        return;
      }

      const data = await response.json();
      setBackupSettings({
        enabled: Boolean(data.enabled ?? data.Enabled ?? true),
        intervalDays: Number(data.intervalDays ?? data.IntervalDays ?? 7),
        runAtLocalTime: data.runAtLocalTime || data.RunAtLocalTime || "03:00",
        timeZoneId: data.timeZoneId || data.TimeZoneId || "Europe/Sofia",
      });
      setNotice(text.scheduleSaved);
    } finally {
      setBackupSettingsBusy(false);
    }
  }

  async function loadArchive(kindOverride = archiveKind) {
    setError("");
    const params = new URLSearchParams({ kind: kindOverride });
    if (fromDate) params.set("fromDate", fromDate);
    if (toDate) params.set("toDate", toDate);
    const response = await adminFetch(`${API_BASE_URL}/api/maintenance/${target}/archive?${params.toString()}`);
    if (!response.ok) {
      setError(await readErrorMessage(response, "Failed to load archive records."));
      return;
    }
    const data = await response.json();
    setArchiveRecords(Array.isArray(data) ? data : []);
  }

  async function deleteRecords(periodOnly = false) {
    setNotice("");
    setError("");
    if (!reason.trim()) {
      setError(adminLanguage === "bg" ? "Моля въведете причина." : "Please enter a reason.");
      return;
    }
    const confirmed = window.confirm(text.warning);
    if (!confirmed) return;

    const response = await adminFetch(`${API_BASE_URL}/api/maintenance/${target}/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reason,
        fromDate: periodOnly ? fromDate || null : null,
        toDate: periodOnly ? toDate || null : null,
      }),
    });
    if (!response.ok) {
      setError(await readErrorMessage(response, "Failed to delete records."));
      return;
    }
    const result = await response.json();
    setNotice(adminLanguage === "bg" ? `Скрити записи: ${result.count ?? result.Count ?? 0}` : `Hidden records: ${result.count ?? result.Count ?? 0}`);
    setArchiveKind("deleted");
    await Promise.all([
      loadReservations?.({ silent: true }),
      isProVersion ? loadDiningOrders?.({ silent: true }) : Promise.resolve(),
    ]);
    await loadArchive("deleted");
  }

  async function deleteRecord(id) {
    setNotice("");
    setError("");
    const nextReason = reason.trim() || (adminLanguage === "bg" ? "Архивиране от поддръжка" : "Archived from maintenance");
    const confirmed = window.confirm(text.warning);
    if (!confirmed) return;

    const response = await adminFetch(`${API_BASE_URL}/api/maintenance/${target}/${id}/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: nextReason }),
    });
    if (!response.ok) {
      setError(await readErrorMessage(response, "Failed to hide record."));
      return;
    }
    setNotice(adminLanguage === "bg" ? "Записът е скрит." : "Record hidden.");
    await Promise.all([
      loadReservations?.({ silent: true }),
      isProVersion ? loadDiningOrders?.({ silent: true }) : Promise.resolve(),
    ]);
    await loadArchive();
  }

  async function restoreRecord(id) {
    setNotice("");
    setError("");
    const response = await adminFetch(`${API_BASE_URL}/api/maintenance/${target}/${id}/restore`, { method: "POST" });
    if (!response.ok) {
      setError(await readErrorMessage(response, "Failed to restore record."));
      return;
    }
    setNotice(adminLanguage === "bg" ? "Записът е възстановен." : "Record restored.");
    await Promise.all([
      loadReservations?.({ silent: true }),
      isProVersion ? loadDiningOrders?.({ silent: true }) : Promise.resolve(),
    ]);
    await loadArchive();
  }

  return (
    <Panel title={text.title} subtitle={text.subtitle}>
      <div className="space-y-5">
        {(notice || error) && (
          <div className={`rounded-2xl border px-4 py-3 text-sm ${error ? "border-red-300/30 bg-red-500/15 text-red-100" : "border-emerald-300/25 bg-emerald-500/12 text-emerald-100"}`}>
            {error || notice}
          </div>
        )}

        <div className="rounded-[28px] border border-[#c9a56a]/20 bg-[#c9a56a]/10 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="section-kicker">{text.backups}</div>
              <h3 className="mt-2 text-2xl font-semibold text-[#fff4df]">{text.backups}</h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-white/58">{text.backupSubtitle}</p>
              <p className="mt-2 max-w-3xl text-xs leading-5 text-[#f2d39a]/80">{text.backupAdvice}</p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                type="button"
                onClick={createBackup}
                disabled={backupBusy}
                className="luxury-button rounded-2xl px-5 py-3 text-sm font-semibold disabled:opacity-50"
              >
                {backupBusy ? "..." : text.createBackup}
              </button>
              <button
                type="button"
                onClick={loadBackups}
                className="ghost-button rounded-2xl px-5 py-3 text-sm font-semibold"
              >
                {text.refreshBackups}
              </button>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-[#fff4df]">{text.automaticBackups}</div>
                <div className="mt-1 text-xs text-white/45">{text.scheduleHint}</div>
              </div>
              <label className="flex items-center gap-3 text-sm text-white/70">
                <input name="backup.enabled"
                  type="checkbox"
                  checked={backupSettings.enabled}
                  onChange={(event) => setBackupSettings((prev) => ({ ...prev, enabled: event.target.checked }))}
                />
                {text.enabled}
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-white/40">{text.intervalDays}</span>
                <input name="backup.intervalDays"
                  type="number"
                  min="1"
                  max="30"
                  value={backupSettings.intervalDays}
                  onChange={(event) => setBackupSettings((prev) => ({ ...prev, intervalDays: event.target.value }))}
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-white/40">{text.runAt}</span>
                <input name="backup.runAtLocalTime"
                  type="time"
                  value={backupSettings.runAtLocalTime}
                  onChange={(event) => setBackupSettings((prev) => ({ ...prev, runAtLocalTime: event.target.value }))}
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                />
              </label>
              <button
                type="button"
                onClick={saveBackupSettings}
                disabled={backupSettingsBusy}
                className="luxury-button self-end rounded-2xl px-5 py-3 text-sm font-semibold disabled:opacity-50"
              >
                {backupSettingsBusy ? "..." : text.saveSchedule}
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-2">
            {backupFiles.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/50">
                {text.noBackups}
              </div>
            ) : (
              backupFiles.slice(0, 6).map((backup) => {
                const fileName = backup.fileName || backup.FileName;
                const createdAt = backup.createdAtUtc || backup.CreatedAtUtc;
                const sizeBytes = backup.sizeBytes ?? backup.SizeBytes ?? 0;

                return (
                  <div key={fileName} className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-[#fff4df]">{fileName}</div>
                      <div className="mt-1 text-xs text-white/45">
                        {createdAt ? new Date(createdAt).toLocaleString() : "—"} · {(Number(sizeBytes) / 1024).toFixed(1)} KB
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => downloadBackup(fileName)}
                      className="ghost-button rounded-xl px-4 py-2 text-xs font-semibold"
                    >
                      {text.download}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 rounded-[26px] border border-white/10 bg-black/20 p-2">
          {[
            ["reservations", text.reservations],
            ...(isProVersion ? [["orders", text.orders]] : []),
          ].map(([key, label]) => (
            <button key={key} type="button" onClick={() => setMode(key)} className={`rounded-2xl px-4 py-2 text-sm font-semibold ${mode === key ? "luxury-button" : "text-white/70 hover:bg-white/[0.06] hover:text-white"}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
            <div className="section-kicker">{safeMode === "reservations" ? text.reservations : text.orders}</div>
            <div className="mt-4 grid gap-3">
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/40">{text.archive}</div>
                <div className="grid gap-2 sm:grid-cols-4">
                  {archiveOptions.map(([key, label]) => (
                    <button key={key} type="button" onClick={() => { setArchiveKind(key); loadArchive(key); }} className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${archiveKind === key ? "border-[#d8b676]/60 bg-[#d8b676]/20 text-[#fff4df]" : "border-white/10 bg-black/20 text-white/65 hover:border-[#d8b676]/35"}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <textarea name="dataReset.reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={text.reason} rows={3} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300" />
              <div className="grid gap-3 md:grid-cols-2">
                <input name="dataReset.fromDate" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300" aria-label={text.from} />
                <input name="dataReset.toDate" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300" aria-label={text.to} />
              </div>
              <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 p-4 text-sm text-amber-100/80">
                {text.warning}
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" onClick={() => deleteRecords(false)} className="rounded-2xl border border-red-300/25 bg-red-500/15 px-5 py-3 text-sm font-semibold text-red-100">
                {text.deleteAll}
              </button>
              <button type="button" onClick={() => deleteRecords(true)} className="luxury-button rounded-2xl px-5 py-3 text-sm font-semibold">
                {text.deletePeriod}
              </button>
              <button type="button" onClick={loadArchive} className="ghost-button rounded-2xl px-5 py-3 text-sm font-semibold">
                {text.loadArchive}
              </button>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="section-kicker">{text.archive}</div>
                <div className="mt-1 text-xs text-white/40">{archiveOptions.find(([key]) => key === archiveKind)?.[1]} · {archiveRecords.length}</div>
              </div>
              <button type="button" onClick={loadArchive} className="ghost-button rounded-xl px-4 py-2 text-xs font-semibold">
                {text.loadArchive}
              </button>
            </div>
            <div className="max-h-[620px] space-y-2 overflow-y-auto pr-1">
              {archiveRecords.length === 0 && <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/50">{text.empty}</div>}
              {archiveRecords.map((record) => (
                <div key={record.id || record.Id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-[#fff4df]">
                        {target === "reservations"
                          ? `${record.guestName || record.GuestName || text.guest} · #${record.id || record.Id}`
                          : `${text.order} #${record.id || record.Id} · ${record.tableLabel || record.TableLabel || text.table}`}
                      </div>
                      <div className="mt-1 text-xs text-white/45">
                        {target === "reservations"
                          ? `${record.reservedDate || record.ReservedDate || ""} ${record.reservedTime || record.ReservedTime || ""} · ${text.table}: ${(record.tableIds || record.TableIds || []).join(", ") || "—"}`
                          : `${new Date(record.createdAtUtc || record.CreatedAtUtc || record.deletedAtUtc || record.DeletedAtUtc).toLocaleString()} · ${text.total}: ${formatEuroAmount(record.totalPrice ?? record.TotalPrice ?? 0)}`}
                      </div>
                      <div className="mt-2 text-sm text-white/55">{record.status || record.Status || "—"}</div>
                      {archiveKind === "deleted" && (
                        <>
                          <div className="mt-2 text-sm text-white/55">{record.deleteReason || record.DeleteReason || "—"}</div>
                          <div className="mt-1 text-xs text-white/35">{record.deletedByAdminName || record.DeletedByAdminName || "—"}</div>
                        </>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col gap-2">
                      {archiveKind === "deleted" ? (
                        <button type="button" onClick={() => restoreRecord(record.id || record.Id)} className="rounded-xl border border-emerald-300/25 bg-emerald-400/15 px-3 py-2 text-xs font-semibold text-emerald-100">
                          {text.restore}
                        </button>
                      ) : (
                        <button type="button" onClick={() => deleteRecord(record.id || record.Id)} className="rounded-xl border border-red-300/25 bg-red-500/12 px-3 py-2 text-xs font-semibold text-red-100">
                          {adminLanguage === "bg" ? "Скрий" : "Hide"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

