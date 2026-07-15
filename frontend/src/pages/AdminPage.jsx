import React from "react";
import { createPortal } from "react-dom";
import { API_BASE_URL } from "../config/api";
import {
  defaultGardenTables,
  gardenGroups,
  indoorGroups,
  openTerraceGroups,
  adminReservationTimes,
  tableIdsByArea,
  tablesByArea,
} from "../domain/reservations/tableConfig";
import {
  canUseAdminTableSelection as canUseAdminTableSelectionRule,
  getAreaTablesCapacity,
} from "../domain/reservations/tableRules";
import {
  getUnavailableSelectedTableIds,
  getUnavailableTableIdsForSlot,
} from "../domain/reservations/availability";
import { getAvailableReservationTimesForDate, isPastTimeForDate } from "../domain/reservations/dateTimeRules";

const emptyMenuItem = {
  nameBg: "",
  nameEn: "",
  descriptionBg: "",
  descriptionEn: "",
  imageUrl: "",
  weight: "",
  price: "",
  department: "Kitchen",
  category: "Main",
  isActive: true,
  notifySubscribers: false,
};

const emptyEventItem = {
  titleBg: "",
  titleEn: "",
  textBg: "",
  textEn: "",
  badge: "",
  imageUrls: [],
  isActive: true,
  activeUntilLocal: "",
};

const priceHelperText =
  "Stored and shown in EUR. Use the final guest-facing price.";

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read image."));
    image.src = src;
  });
}

async function compressMenuImage(file) {
  if (!file?.type?.startsWith("image/")) {
    throw new Error("Please choose an image file.");
  }

  const source = await readFileAsDataUrl(file);
  const image = await loadImage(source);
  const maxDataUrlLength = 420_000;
  const attempts = [
    [900, 0.68],
    [760, 0.62],
    [620, 0.56],
    [520, 0.5],
  ];

  let bestResult = "";

  for (const [maxSide, quality] of attempts) {
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, width, height);

    const result = canvas.toDataURL("image/jpeg", quality);
    bestResult = result;

    if (result.length <= maxDataUrlLength) {
      return result;
    }
  }

  if (bestResult.length <= maxDataUrlLength) {
    return bestResult;
  }

  throw new Error("Image is too large. Please choose a smaller photo.");
}

async function compressEventImage(file) {
  return compressMenuImage(file);
}

function showBrowserNotification(title, body) {
  if (typeof window === "undefined" || !("Notification" in window)) return;

  if (Notification.permission === "granted") {
    new Notification(title, { body, icon: "/casa-fratelli-icon-192.png" });
    return;
  }

  if (Notification.permission === "default") {
    Notification.requestPermission().then((permission) => {
      if (permission === "granted") {
        new Notification(title, { body, icon: "/casa-fratelli-icon-192.png" });
      }
    });
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}

async function getReadyAdminPushRegistration() {
  await navigator.serviceWorker.register("/admin-push-sw.js", { scope: "/" });
  const registration = await navigator.serviceWorker.ready;

  if (!registration.active) {
    throw new Error("Service worker is not active yet.");
  }

  return registration;
}

function toLocalDateTimeInputValue(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

const adminText = {
  bg: {
    appTitle: "Restaurant CRM",
    appSubtitle: "Резервации, поръчки, меню, клиенти, blacklist и маркетинг в една система.",
    refresh: "Обнови",
    language: "Език",
    stats: {
      today: "Днес",
      week: "Седмица",
      month: "Месец",
      year: "Година",
      allReservations: "Всички резервации",
      orders: "Поръчки",
      pending: "Чакащи",
      approved: "Потвърдени",
      blacklist: "Blacklist",
    },
    tabs: {
      liveMap: "Карта на резервациите",
      reservations: "Резервации",
      orders: "Поръчки",
      create: "Нова резервация",
      block: "Блокирай зала",
      menu: "Меню",
      events: "Събития",
      layout: "Карта",
      blacklist: "Blacklist",
      customers: "Клиенти",
      reports: "Отчети",
      feedback: "Обратна връзка",
      inventory: "Склад",
      marketing: "Маркетинг",
      maintenance: "Поддръжка",
    },
    reservations: {
      title: "Резервации",
      subtitle: "Компактен CRM изглед. На телефон се вижда най-важното, а детайлите се отварят с докосване.",
      search: "Търси име, телефон, имейл, маса...",
      guest: "Гост",
      date: "Дата",
      time: "Час",
      tables: "Маси",
      guests: "Гости",
      status: "Статус",
      actions: "Действия",
      cancel: "Откажи",
      archive: "Архивирай",
      noShow: "No-show",
      contact: "Контакт",
      phone: "Телефон",
      email: "Имейл",
      birthday: "Рожден ден",
      notes: "Бележки",
      client: "Клиент",
      internal: "Вътрешна",
      flags: "Маркери",
      changeTables: "Смяна на маси",
      changeTablesHint: "Променете дата, час, гости и маси. Запазването проверява потвърдени резервации с 3 часа буфер.",
      saveTables: "Запази масите",
      sourceAdmin: "Admin",
      sourceWebsite: "Сайт",
      open: "Детайли",
      close: "Скрий",
    },
    orders: {
      title: "Поръчки от маси",
      subtitle: "Поръчки, изпратени от дигиталното меню след маркиране на гост като пристигнал.",
      empty: "Още няма изпратени поръчки.",
      table: "Маса",
      guest: "Гост",
      total: "Общо",
      status: "Статус",
      items: "Позиции",
      notes: "Бележка",
      addItem: "Добави позиция",
      searchDish: "Търси ястие...",
      markSeen: "Видяна",
      preparing: "Приготвя се",
      done: "Готова",
      paid: "Платена",
      served: "Сервирано",
      kitchenReady: "Готово от кухнята",
      waitingKitchen: "Чака кухня",
    },
    liveMap: {
      title: "Карта на резервациите",
      subtitle: "Оперативен изглед за следващите гости. Показват се резервации до 30 минути преди часа.",
      indoor: "Зала / непушачи",
      garden: "Покрита тераса",
      openTerrace: "Открита тераса",
      next: "Следваща резервация",
      empty: "Няма резервации до 30 минути в тази зона.",
      arrived: "Пристигна",
      noShow: "Не дойде",
      move: "Премести",
      release: "Освободена",
      consumption: "Консумация",
      noConsumption: "Още няма добавена консумация.",
      addConsumption: "Добави към поръчката",
      searchDish: "Търси ястие...",
      allDishes: "Всички",
      close: "Затвори",
      moveTitle: "Премести резервацията",
      bestOptions: "Най-добри свободни варианти",
      noMoveOptions: "Няма свободна подходяща маса за тези гости.",
      saveMove: "Запази преместване",
      tableTodayTitle: "Резервации за днес",
      tableTodayEmpty: "Няма резервации за тази маса днес.",
      ordersTitle: "Активни поръчки",
      ordersEmpty: "Няма активни поръчки за тази маса.",
      openReservation: "Отвори резервацията",
      call: "Обади се",
      late: "закъснява",
      dueIn: "след",
      now: "сега",
      arrivedStatus: "Пристигнал",
      guests: "гости",
      table: "Маса",
      tables: "маси",
    },
    menu: {
      title: "Меню CMS",
      subtitle: "Списък, редакция и добавяне на ястия. Сайтът взима тези данни автоматично.",
      list: "Списък ястия",
      add: "Добави ястие",
      edit: "Редакция",
      addTitle: "Добави ново ястие",
      editTitle: "Редактирай ястие",
      nameBg: "Име BG",
      nameEn: "Име EN",
      weight: "Грамаж",
      price: "Цена EUR",
      category: "Категория",
      descriptionBg: "Състав / описание BG",
      descriptionEn: "Ingredients / description EN",
      imageUrl: "Снимка",
      imageHelp: "Качете снимка от устройство или поставете URL. Снимката се оптимизира автоматично.",
      uploadImage: "Качи снимка",
      removeImage: "Махни снимката",
      active: "Активно в сайта",
      notify: "Изпрати към абонати",
      saveAdd: "Добави ястие",
      saveEdit: "Запази промени",
      cancelEdit: "Назад към списъка",
      delete: "Изтрий",
      empty: "Още няма ястия в CMS.",
      priceHelp: "Цената се пази и показва в евро. Въведете крайната цена за гостите.",
    },
    events: {
      title: "Събития CMS",
      subtitle: "Добавяйте празници, новини и специални вечери със снимки. Секцията е активна и в Basic версията.",
      list: "Списък събития",
      add: "Добави събитие",
      edit: "Редакция",
      addTitle: "Ново събитие",
      editTitle: "Редактирай събитие",
      titleBg: "Заглавие BG",
      titleEn: "Заглавие EN",
      textBg: "Текст BG",
      textEn: "Текст EN",
      badge: "Етикет / дата",
      activeUntil: "Активно до",
      activeUntilHelp: "Оставете празно, ако събитието няма краен срок. След този момент сайтът автоматично ще го скрие.",
      photos: "Снимки",
      uploadPhotos: "Качи снимки",
      removePhoto: "Махни",
      active: "Активно в сайта",
      saveAdd: "Добави събитие",
      saveEdit: "Запази промени",
      cancelEdit: "Назад към списъка",
      delete: "Изтрий",
      empty: "Още няма добавени събития.",
      photoHelp: "Може да качите няколко снимки. Системата ги оптимизира автоматично.",
    },
    layout: {
      title: "Карта на ресторанта",
      subtitle: "Премествайте масите, добавяйте нови и скривайте неактивни. Сайтът използва тази карта автоматично.",
      save: "Запази картата",
      reset: "Върни оригиналната",
      add: "Добави маса",
      area: "Зона",
      tableNumber: "Номер на маса",
      seats: "Места",
      active: "Активна",
      remove: "Премахни",
      overlap: "Масите не трябва да се застъпват.",
    },
  },
  en: {
    appTitle: "Restaurant CRM",
    appSubtitle: "Reservations, orders, menu, guests, blacklist, and marketing in one system.",
    refresh: "Refresh",
    language: "Language",
    stats: {
      today: "Today",
      week: "Week",
      month: "Month",
      year: "Year",
      allReservations: "All reservations",
      orders: "Orders",
      pending: "Pending",
      approved: "Approved",
      blacklist: "Blacklist",
    },
    tabs: {
      liveMap: "Reservation map",
      reservations: "Reservations",
      orders: "Orders",
      create: "Create",
      block: "Block hall",
      menu: "Menu",
      events: "Events",
      layout: "Map",
      blacklist: "Blacklist",
      customers: "Customers",
      reports: "Reports",
      feedback: "Feedback",
      inventory: "Inventory",
      marketing: "Marketing",
      maintenance: "Maintenance",
    },
    reservations: {
      title: "Reservations",
      subtitle: "Compact CRM view. Phones show the essentials, then open full details on tap.",
      search: "Search name, phone, email, table...",
      guest: "Guest",
      date: "Date",
      time: "Time",
      tables: "Tables",
      guests: "Guests",
      status: "Status",
      actions: "Actions",
      cancel: "Cancel",
      archive: "Archive",
      noShow: "No-show",
      contact: "Contact",
      phone: "Phone",
      email: "Email",
      birthday: "Birthday",
      notes: "Notes",
      client: "Client",
      internal: "Internal",
      flags: "Flags",
      changeTables: "Change tables",
      changeTablesHint: "Change date, time, guests, and tables. Saving checks approved reservations with a 3 hour buffer.",
      saveTables: "Save tables",
      sourceAdmin: "Admin",
      sourceWebsite: "Website",
      open: "Details",
      close: "Hide",
    },
    orders: {
      title: "Table orders",
      subtitle: "Orders sent from the digital menu after a guest is marked as arrived.",
      empty: "No orders have been sent yet.",
      table: "Table",
      guest: "Guest",
      total: "Total",
      status: "Status",
      items: "Items",
      notes: "Note",
      addItem: "Add item",
      searchDish: "Search dish...",
      markSeen: "Seen",
      preparing: "Preparing",
      done: "Done",
      paid: "Paid",
      served: "Served",
      kitchenReady: "Ready from kitchen",
      waitingKitchen: "Waiting kitchen",
    },
    liveMap: {
      title: "Reservation map",
      subtitle: "Live host view for the next guests. Reservations appear up to 30 minutes before arrival.",
      indoor: "Hall / non-smoking",
      garden: "Covered terrace",
      openTerrace: "Open terrace",
      next: "Next reservation",
      empty: "No reservations due in the next 30 minutes for this area.",
      arrived: "Arrived",
      noShow: "No-show",
      move: "Move",
      release: "Released",
      consumption: "Consumption",
      noConsumption: "No consumption has been added yet.",
      addConsumption: "Add to order",
      searchDish: "Search dish...",
      allDishes: "All",
      close: "Close",
      moveTitle: "Move reservation",
      bestOptions: "Best free options",
      noMoveOptions: "No suitable free table for this party.",
      saveMove: "Save move",
      tableTodayTitle: "Today's reservations",
      tableTodayEmpty: "No reservations for this table today.",
      ordersTitle: "Active orders",
      ordersEmpty: "No active orders for this table.",
      openReservation: "Open reservation",
      call: "Call",
      late: "late",
      dueIn: "in",
      now: "now",
      arrivedStatus: "Arrived",
      guests: "guests",
      table: "Table",
      tables: "tables",
    },
    menu: {
      title: "Menu CMS",
      subtitle: "Browse, edit, and add dishes. The public site pulls these items automatically.",
      list: "Dish list",
      add: "Add dish",
      edit: "Edit",
      addTitle: "Add new dish",
      editTitle: "Edit dish",
      nameBg: "Name BG",
      nameEn: "Name EN",
      weight: "Weight",
      price: "Price EUR",
      category: "Category",
      descriptionBg: "Ingredients / description BG",
      descriptionEn: "Ingredients / description EN",
      imageUrl: "Photo",
      imageHelp: "Upload from device or paste a URL. The photo is optimized automatically.",
      uploadImage: "Upload photo",
      removeImage: "Remove photo",
      active: "Active on site",
      notify: "Notify subscribers",
      saveAdd: "Add dish",
      saveEdit: "Save changes",
      cancelEdit: "Back to list",
      delete: "Delete",
      empty: "No dishes in the CMS yet.",
      priceHelp: priceHelperText,
    },
    events: {
      title: "Events CMS",
      subtitle: "Add celebrations, news, and special evenings with photos. This section is available in Basic too.",
      list: "Event list",
      add: "Add event",
      edit: "Edit",
      addTitle: "New event",
      editTitle: "Edit event",
      titleBg: "Title BG",
      titleEn: "Title EN",
      textBg: "Text BG",
      textEn: "Text EN",
      badge: "Badge / date",
      activeUntil: "Active until",
      activeUntilHelp: "Leave empty if the event has no deadline. After this moment the public site hides it automatically.",
      photos: "Photos",
      uploadPhotos: "Upload photos",
      removePhoto: "Remove",
      active: "Active on site",
      saveAdd: "Add event",
      saveEdit: "Save changes",
      cancelEdit: "Back to list",
      delete: "Delete",
      empty: "No events have been added yet.",
      photoHelp: "You can upload several photos. The system optimizes them automatically.",
    },
    layout: {
      title: "Restaurant map",
      subtitle: "Move tables, add new ones, and hide inactive tables. The public site uses this map automatically.",
      save: "Save map",
      reset: "Restore original",
      add: "Add table",
      area: "Area",
      tableNumber: "Table number",
      seats: "Seats",
      active: "Active",
      remove: "Remove",
      overlap: "Tables cannot overlap.",
    },
  },
};

adminText.ru = {
  ...adminText.bg,
  appSubtitle: "Резервации, заказы, меню, клиенты, склад и маркетинг в одной системе.",
  refresh: "Обновить",
  language: "Язык",
  stats: {
    ...adminText.bg.stats,
    today: "Сегодня",
    week: "Неделя",
    month: "Месяц",
    year: "Год",
    allReservations: "Все резервации",
    orders: "Заказы",
    pending: "Ожидают",
    approved: "Подтверждены",
  },
  tabs: {
    ...adminText.bg.tabs,
    liveMap: "Карта резерваций",
    reservations: "Резервации",
    orders: "Заказы",
    create: "Новая резервация",
    block: "Заблокировать зал",
    menu: "Меню",
    events: "События",
    layout: "Карта",
    customers: "Клиенты",
    reports: "Отчёты",
    feedback: "Обратная связь",
    inventory: "Склад",
    marketing: "Маркетинг",
    maintenance: "Поддержка",
  },
  reservations: {
    ...adminText.bg.reservations,
    title: "Резервации",
    subtitle: "Компактный CRM-вид: на телефоне видно главное, детали открываются касанием.",
    search: "Поиск по имени, телефону, email, столу...",
    guest: "Гость",
    date: "Дата",
    time: "Время",
    tables: "Столы",
    guests: "Гости",
    status: "Статус",
    actions: "Действия",
    cancel: "Отменить",
    archive: "В архив",
    contact: "Контакт",
    phone: "Телефон",
    email: "Email",
    birthday: "День рождения",
    notes: "Заметки",
    client: "Клиент",
    internal: "Внутренняя",
    flags: "Метки",
    changeTables: "Смена столов",
    changeTablesHint: "Измените дату, время, гостей и столы. Сохранение проверяет подтверждённые резервации с буфером 3 часа.",
    saveTables: "Сохранить столы",
    sourceWebsite: "Сайт",
    open: "Детали",
    close: "Скрыть",
  },
  orders: {
    ...adminText.bg.orders,
    title: "Заказы со столов",
    subtitle: "Заказы из дигитального меню после отметки гостя как прибывшего.",
    empty: "Отправленных заказов пока нет.",
    table: "Стол",
    guest: "Гость",
    total: "Итого",
    status: "Статус",
    items: "Позиции",
    notes: "Заметка",
    addItem: "Добавить позицию",
    searchDish: "Поиск блюда...",
    markSeen: "Просмотрено",
    preparing: "Готовится",
    done: "Готово",
    paid: "Оплачено",
    served: "Подано",
    kitchenReady: "Готово на кухне",
    waitingKitchen: "Ждёт кухню",
  },
  liveMap: {
    ...adminText.bg.liveMap,
    title: "Карта резерваций",
    subtitle: "Оперативный вид следующих гостей. Резервации показываются до 30 минут до времени.",
    indoor: "Зал / некурящие",
    garden: "Крытая терраса",
    openTerrace: "Открытая терраса",
    next: "Следующая резервация",
    empty: "В этой зоне нет резерваций в ближайшие 30 минут.",
    arrived: "Прибыл",
    noShow: "Не пришёл",
    move: "Переместить",
    release: "Освободить",
    consumption: "Консумация",
    noConsumption: "Консумация ещё не добавлена.",
    addConsumption: "Добавить к заказу",
    searchDish: "Поиск блюда...",
    allDishes: "Все",
    close: "Закрыть",
    moveTitle: "Переместить резервацию",
    bestOptions: "Лучшие свободные варианты",
    noMoveOptions: "Нет подходящего свободного стола для этих гостей.",
    saveMove: "Сохранить перемещение",
    tableTodayTitle: "Резервации на сегодня",
    tableTodayEmpty: "Сегодня нет резерваций для этого стола.",
    ordersTitle: "Активные заказы",
    ordersEmpty: "Нет активных заказов для этого стола.",
    openReservation: "Открыть резервацию",
    call: "Позвонить",
    late: "опаздывает",
    dueIn: "через",
    now: "сейчас",
    arrivedStatus: "Прибыл",
    guests: "гостей",
    table: "Стол",
    tables: "столы",
  },
  menu: {
    ...adminText.bg.menu,
    title: "Меню CMS",
    subtitle: "Список, редактирование и добавление блюд. Сайт автоматически берёт эти данные.",
    list: "Список блюд",
    add: "Добавить блюдо",
    edit: "Редактирование",
    addTitle: "Добавить новое блюдо",
    editTitle: "Редактировать блюдо",
    weight: "Граммовка",
    price: "Цена EUR",
    category: "Категория",
    imageUrl: "Фото",
    imageHelp: "Загрузите фото с устройства или вставьте URL. Фото оптимизируется автоматически.",
    uploadImage: "Загрузить фото",
    removeImage: "Убрать фото",
    active: "Активно на сайте",
    notify: "Отправить подписчикам",
    saveAdd: "Добавить блюдо",
    saveEdit: "Сохранить изменения",
    cancelEdit: "Назад к списку",
    delete: "Удалить",
    empty: "В CMS пока нет блюд.",
  },
  events: {
    ...adminText.bg.events,
    title: "События CMS",
    subtitle: "Добавляйте праздники, новости и специальные вечера с фотографиями. Раздел доступен и в Basic.",
    list: "Список событий",
    add: "Добавить событие",
    edit: "Редактирование",
    addTitle: "Новое событие",
    editTitle: "Редактировать событие",
    badge: "Метка / дата",
    activeUntil: "Активно до",
    activeUntilHelp: "Оставьте пустым, если у события нет срока. После этого момента сайт автоматически скроет событие.",
    photos: "Фото",
    uploadPhotos: "Загрузить фото",
    removePhoto: "Убрать",
    active: "Активно на сайте",
    saveAdd: "Добавить событие",
    saveEdit: "Сохранить изменения",
    cancelEdit: "Назад к списку",
    delete: "Удалить",
    empty: "Событий пока нет.",
    photoHelp: "Можно загрузить несколько фото. Система оптимизирует их автоматически.",
  },
  layout: {
    ...adminText.bg.layout,
    title: "Карта ресторана",
    subtitle: "Перемещайте столы, добавляйте новые и скрывайте неактивные. Сайт использует эту карту автоматически.",
    save: "Сохранить карту",
    reset: "Вернуть оригинал",
    add: "Добавить стол",
    area: "Зона",
    tableNumber: "Номер стола",
    seats: "Места",
    active: "Активен",
    remove: "Удалить",
    overlap: "Столы не должны пересекаться.",
  },
};

const adminRoleOptions = [
  { value: "Owner", labels: { bg: "Собственик", en: "Owner", ru: "Собственник" } },
  { value: "Administrator", labels: { bg: "Администратор", en: "Administrator", ru: "Администратор" } },
  { value: "Waiter", labels: { bg: "Сервитьор", en: "Waiter", ru: "Официант" } },
  { value: "Kitchen", labels: { bg: "Кухня", en: "Kitchen", ru: "Кухня" } },
  { value: "Bar", labels: { bg: "Бар", en: "Bar", ru: "Бар" } },
  { value: "Developer", labels: { bg: "Програмист", en: "Developer", ru: "Разработчик" } },
];

function normalizeAdminRole(role) {
  const normalized = String(role || "").trim().toLowerCase();

  if (normalized === "owner") return "Owner";
  if (["administrator", "admin", "manager"].includes(normalized)) return "Administrator";
  if (["waiter", "staff", "server"].includes(normalized)) return "Waiter";
  if (["kitchen", "chef", "cook"].includes(normalized)) return "Kitchen";
  if (["bar", "bartender", "barman", "бар", "барман"].includes(normalized)) return "Bar";
  if (["developer", "dev", "programmer"].includes(normalized)) return "Developer";

  return "Administrator";
}

function getAdminRoleLabel(role, language = "bg") {
  const normalized = normalizeAdminRole(role);
  return adminRoleOptions.find((option) => option.value === normalized)?.labels[language] || normalized;
}

function adminLocalText(language, bg, en, ru = bg) {
  if (language === "en") return en;
  if (language === "ru") return ru;
  return bg;
}

function getCustomerProfileKey(profile) {
  const email = String(profile.email ?? profile.Email ?? "").trim().toLowerCase();
  const phone = String(profile.phone ?? profile.Phone ?? "").trim().toLowerCase();
  const id = profile.id ?? profile.Id;

  return email || phone || `profile-${id}`;
}

function getReservationCustomerKey(reservation) {
  const email = String(reservation.email || "").trim().toLowerCase();
  const phone = String(reservation.phone || "").trim().toLowerCase();

  return email || phone;
}

function normalizeCustomerHistoryReservation(reservation) {
  const tableIds = reservation.tableIds ?? reservation.TableIds ?? [];

  return {
    id: reservation.id ?? reservation.Id,
    guestName: reservation.guestName ?? reservation.GuestName ?? "",
    phone: reservation.phone ?? reservation.Phone ?? "",
    email: reservation.email ?? reservation.Email ?? "",
    guestCount: Number(reservation.guestCount ?? reservation.GuestCount ?? 0),
    area: reservation.area ?? reservation.Area ?? "",
    reservedDate: String(reservation.reservedDate ?? reservation.ReservedDate ?? "").slice(0, 10),
    reservedTime: reservation.reservedTime ?? reservation.ReservedTime ?? "",
    status: reservation.status ?? reservation.Status ?? "",
    createdByAdmin: Boolean(reservation.createdByAdmin ?? reservation.CreatedByAdmin),
    marketingConsent: Boolean(reservation.marketingConsent ?? reservation.MarketingConsent),
    isRegularCustomer: Boolean(reservation.isRegularCustomer ?? reservation.IsRegularCustomer),
    tableIds: Array.isArray(tableIds) ? tableIds.map(String) : [],
  };
}

function getAdminUserId(user) {
  return user?.id ?? user?.Id;
}

function canActorManageAdminUser(actorRole, targetRole) {
  const actor = normalizeAdminRole(actorRole);
  const target = normalizeAdminRole(targetRole);

  return actor === "Developer" || (actor === "Owner" && target !== "Developer");
}

const emptyAdminReservation = {
  guestName: "",
  phone: "",
  email: "",
  guestCount: 2,
  area: "indoor",
  reservedDate: "",
  reservedTime: "",
  tableIds: "",
  notes: "",
  internalNote: "",
};

const emptyManualCustomer = {
  guestName: "",
  phone: "",
  email: "",
  birthDate: "",
  marketingConsent: false,
};

const emptyHallBlock = {
  area: "indoor",
  reservedDate: "",
  startTime: "10:00",
  endTime: "22:00",
  note: "",
};

const indoorTableIds = tableIdsByArea.indoor;
const areaTableIds = tableIdsByArea;
const gardenSpecialIds = defaultGardenTables.filter((table) => table.special).map((table) => table.id);

const categoryDisplayNames = {
  bg: {
    salads: "Салати",
    starters: "Нещо за начало",
    "pasta-risotto": "Паста и ризото",
    mains: "Основни и рибни",
    pizza: "Пица",
    bread: "Домашен хляб",
    desserts: "Десерти",
    "cold-drinks": "Студени напитки",
    "soft-drinks": "Безалкохолни",
    lemonades: "Лимонади",
    alcohol: "Алкохол",
    main: "Основни",
  },
  en: {
    salads: "Salads",
    starters: "Starters",
    "pasta-risotto": "Pasta & Risotto",
    mains: "Mains & Fish",
    pizza: "Pizza",
    bread: "Bread",
    desserts: "Desserts",
    "cold-drinks": "Cold drinks",
    "soft-drinks": "Soft drinks",
    lemonades: "Lemonades",
    alcohol: "Alcohol",
    main: "Main",
  },
  ru: {
    salads: "Салаты",
    starters: "Закуски",
    "pasta-risotto": "Паста и ризотто",
    mains: "Основные блюда и рыба",
    pizza: "Пицца",
    bread: "Домашний хлеб",
    desserts: "Десерты",
    "cold-drinks": "Холодные напитки",
    "soft-drinks": "Безалкогольные",
    lemonades: "Лимонады",
    alcohol: "Алкоголь",
    main: "Основные",
  },
};

const menuDepartmentOptions = [
  { value: "Kitchen", labels: { bg: "Кухня", en: "Kitchen", ru: "Кухня" } },
  { value: "Bar", labels: { bg: "Напитки", en: "Drinks", ru: "Напитки" } },
];

function normalizeDepartment(value) {
  return String(value || "Kitchen").trim().toLowerCase() === "bar" ? "Bar" : "Kitchen";
}

function getDepartmentLabel(department, language) {
  const normalized = normalizeDepartment(department);
  return menuDepartmentOptions.find((option) => option.value === normalized)?.labels[language] || normalized;
}

function getMenuItemKind(item) {
  return normalizeDepartment(getValue(item, "department")) === "Bar" ? "Drink" : "Dish";
}

function getValue(item, key) {
  return item?.[key] ?? item?.[key[0].toUpperCase() + key.slice(1)];
}

function normalizeCategory(value) {
  return String(value || "main").trim() || "main";
}

function getCategoryLabel(category, language) {
  const normalized = normalizeCategory(category);
  return categoryDisplayNames[language]?.[normalized] || normalized;
}

function getMenuItemName(item, language = "bg") {
  return getValue(item, language === "en" ? "nameEn" : "nameBg") || getValue(item, "nameBg") || getValue(item, "nameEn") || "";
}

function getMenuCategoryGroups(items, language = "bg") {
  const grouped = new Map();

  (items || [])
    .filter((item) => (getValue(item, "isActive") ?? true) === true)
    .forEach((item) => {
      const category = normalizeCategory(getValue(item, "category"));
      if (!grouped.has(category)) {
        grouped.set(category, {
          id: category,
          label: getCategoryLabel(category, language),
          items: [],
        });
      }

      grouped.get(category).items.push(item);
    });

  return Array.from(grouped.values()).sort((first, second) =>
    first.label.localeCompare(second.label, language === "ru" ? "ru" : language === "bg" ? "bg" : "en")
  );
}

function canUseAdminTableSelection(area, tableIds, options = {}) {
  return canUseAdminTableSelectionRule(area, tableIds, { gardenSpecialIds, ...options });
}

function getContiguousSlices(group) {
  const slices = [];

  for (let start = 0; start < group.length; start += 1) {
    for (let end = start + 1; end <= group.length; end += 1) {
      slices.push(group.slice(start, end));
    }
  }

  return slices;
}

function getAreaCandidateGroups(area) {
  if (area === "garden") return gardenGroups.flatMap(getContiguousSlices);
  if (area === "openTerrace") return openTerraceGroups.flatMap(getContiguousSlices);
  if (area === "indoor") return indoorGroups.flatMap(getContiguousSlices);
  return [];
}

function getMoveCandidateOptions(area, guestCount, unavailableTableIds, areaTables = tablesByArea[area] || []) {
  const requiredSeats = Number(guestCount || 0);
  const activeTables = areaTables.filter((table) => table.isActive !== false);
  const activeIds = new Set(activeTables.map((table) => table.id));
  const tableById = new Map(activeTables.map((table) => [table.id, table]));
  const seen = new Set();
  const candidates = [];
  const addCandidate = (ids) => {
    const tableIds = [...new Set(ids)].filter((id) => activeIds.has(id) && !unavailableTableIds.has(id));
    if (tableIds.length === 0) return;

    const key = tableIds.join("|");
    if (seen.has(key)) return;
    seen.add(key);

    const capacity = getAreaTablesCapacity(area, tableIds, activeTables);
    if (capacity < requiredSeats) return;
    if (!canUseAdminTableSelectionRule(area, tableIds, {
      areaTables: activeTables,
      gardenSpecialIds,
      requiredSeats,
      allowPartial: false,
    })) {
      return;
    }

    candidates.push({
      tableIds,
      capacity,
      overage: capacity - requiredSeats,
      seatsLabel: tableIds.map((id) => tableById.get(id)?.seats || 0).join(" + "),
    });
  };

  activeTables.forEach((table) => addCandidate([table.id]));
  getAreaCandidateGroups(area).forEach(addCandidate);

  return candidates.sort((first, second) =>
    first.overage - second.overage ||
    first.tableIds.length - second.tableIds.length ||
    first.tableIds.join(",").localeCompare(second.tableIds.join(","), undefined, { numeric: true })
  );
}

function buildTimeRange(startTime, endTime) {
  const toMinutes = (value) => {
    const [hours, minutes] = String(value || "").split(":").map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    return hours * 60 + minutes;
  };

  const fromMinutes = (value) => {
    const hours = Math.floor(value / 60);
    const minutes = value % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  };

  const start = toMinutes(startTime);
  const end = toMinutes(endTime);

  if (start === null || end === null) return [];

  const normalizedEnd = end < start ? end + 24 * 60 : end;

  const times = [];

  for (let value = start; value <= normalizedEnd; value += 60) {
    times.push(fromMinutes(value % (24 * 60)));
  }

  return times;
}

async function readErrorMessage(response, fallback) {
  const rawText = await response.text();

  try {
    const result = rawText ? JSON.parse(rawText) : null;
    return result?.message || rawText || fallback;
  } catch {
    return rawText || fallback;
  }
}

async function fetchJsonOrEmpty(url, fallback, options = {}) {
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Failed to load ${url}.`));
  }

  const rawText = await response.text();
  if (!rawText) return fallback;

  try {
    return JSON.parse(rawText);
  } catch {
    throw new Error(`Invalid JSON from ${url}.`);
  }
}

function TableChipSelector({
  area,
  selectedTableIds,
  onToggle,
  unavailableTableIds = new Set(),
  hideUnavailable = false,
  emptyMessage = "No free tables for this time.",
  requiredSeats = 0,
  tableIdsOverride,
  areaTables,
  suggestedTableIds = new Set(),
  bestTableIds = new Set(),
  unrestrictedSelection = false,
}) {
  const tableIds = tableIdsOverride || areaTables?.map((table) => table.id) || areaTableIds[area] || indoorTableIds;
  const selectionGardenSpecialIds =
    area === "garden" && areaTables
      ? areaTables.filter((table) => table.special).map((table) => table.id)
      : null;
  const visibleTableIds = hideUnavailable
    ? tableIds.filter((tableId) => selectedTableIds.includes(tableId) || !unavailableTableIds.has(tableId))
    : tableIds;

  return (
    <div className="flex flex-wrap gap-2">
      {visibleTableIds.map((tableId) => {
        const selected = selectedTableIds.includes(tableId);
        const unavailable = !selected && unavailableTableIds.has(tableId);
        const suggested = suggestedTableIds.has(tableId);
        const best = bestTableIds.has(tableId);
        const allowed =
          !unavailable &&
          (unrestrictedSelection ||
          (selected ||
            canUseAdminTableSelection(area, [...selectedTableIds, tableId], {
              requiredSeats,
              allowPartial: true,
              ...(areaTables ? { areaTables } : {}),
              ...(selectionGardenSpecialIds ? { gardenSpecialIds: selectionGardenSpecialIds } : {}),
            })));

        return (
          <button
            key={tableId}
            type="button"
            disabled={!allowed}
            onClick={() => onToggle(tableId)}
            title={unavailable ? "Reserved around this time" : tableId}
            className={`rounded-xl border px-3 py-2 text-xs transition ${
              selected
                ? "border-amber-300 bg-amber-400 text-black"
                : unavailable
                ? "cursor-not-allowed border-red-400/10 bg-red-500/5 text-red-200/35"
                : !allowed
                ? "cursor-not-allowed border-white/5 bg-black/10 text-white/25"
                : best
                ? "move-table-suggestion border-[#f2d39a]/70 bg-[#c9a56a]/22 text-[#fff4df]"
                : suggested
                ? "border-[#f2d39a]/45 bg-[#c9a56a]/14 text-[#f2d39a]"
                : "border-white/10 bg-black/20 text-white/65 hover:border-amber-300/50 hover:text-white"
            }`}
          >
            {tableId}
          </button>
        );
      })}
      {visibleTableIds.length === 0 && (
        <div className="rounded-2xl border border-red-400/15 bg-red-500/10 px-4 py-3 text-sm text-red-100/80">
          {emptyMessage}
        </div>
      )}
    </div>
  );
}

function normalizeLayoutItem(item) {
  return {
    id: String(item.id || item.Id || "").trim(),
    area: item.area || item.Area || "indoor",
    x: Number(item.x ?? item.X ?? 50),
    y: Number(item.y ?? item.Y ?? 50),
    seats: Number(item.seats ?? item.Seats ?? 4),
    special: Boolean(item.special ?? item.Special),
    wide: Boolean(item.wide ?? item.Wide),
    isActive: item.isActive ?? item.IsActive ?? true,
  };
}

function getReservationMinutesFromNow(reservation, now = new Date()) {
  if (!reservation?.reservedDate || !reservation?.reservedTime) return null;

  const [hours, minutes] = String(reservation.reservedTime).split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;

  const [year, month, day] = String(reservation.reservedDate).split("-").map(Number);
  const target = Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)
    ? new Date(year, month - 1, day, hours, minutes, 0, 0)
    : new Date(now);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    target.setHours(hours, minutes, 0, 0);
  }

  const candidates = [target];
  if (hours <= 3) {
    const nextServiceDayTarget = new Date(target);
    nextServiceDayTarget.setDate(nextServiceDayTarget.getDate() + 1);
    candidates.push(nextServiceDayTarget);
  }

  const closestTarget = candidates.reduce((closest, candidate) => {
    const closestDistance = Math.abs(closest.getTime() - now.getTime());
    const candidateDistance = Math.abs(candidate.getTime() - now.getTime());
    return candidateDistance < closestDistance ? candidate : closest;
  }, candidates[0]);

  return Math.round((closestTarget.getTime() - now.getTime()) / 60000);
}

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getNextAdminReservationTime(now = new Date()) {
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  return adminReservationTimes.find((time) => {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes >= minutesNow + 15;
  }) || adminReservationTimes[0] || "10:00";
}

function isInteractiveSwipeTarget(target) {
  return Boolean(target?.closest?.("input, textarea, select, button, a, [role='button']"));
}

function getLiveReservationCandidates(reservations, now = new Date()) {
  const today = formatLocalDate(now);

  return reservations
    .filter((reservation) => {
      if (!["Pending", "Approved"].includes(reservation.status) || reservation.isNoShow) return false;
      if (reservation.reservedDate !== today) return false;

      const minutes = getReservationMinutesFromNow(reservation, now);
      return minutes !== null && minutes >= -90;
    })
    .sort((first, second) => {
      const firstMinutes = getReservationMinutesFromNow(first, now) ?? 9999;
      const secondMinutes = getReservationMinutesFromNow(second, now) ?? 9999;

      const firstIsPast = firstMinutes < 0;
      const secondIsPast = secondMinutes < 0;

      if (firstIsPast !== secondIsPast) {
        return firstIsPast ? 1 : -1;
      }

      return Math.abs(firstMinutes) - Math.abs(secondMinutes);
    });
}

function buildLiveReservationsByTable(reservations, now = new Date()) {
  const byTable = new Map();

  getLiveReservationCandidates(reservations, now).forEach((reservation) => {
    reservation.tableIds.forEach((tableId) => {
      if (!byTable.has(tableId)) {
        byTable.set(tableId, reservation);
      }
    });
  });

  return byTable;
}

function buildReservationsByTableForDate(reservations, selectedDate) {
  const byTable = new Map();

  reservations
    .filter((reservation) => {
      if (!["Pending", "Approved"].includes(reservation.status) || reservation.isNoShow) return false;
      if (reservation.reservedDate !== selectedDate) return false;
      if (["Cancelled", "Released"].includes(reservation.status)) return false;
      return true;
    })
    .sort((first, second) => String(first.reservedTime).localeCompare(String(second.reservedTime)))
    .forEach((reservation) => {
      reservation.tableIds.forEach((tableId) => {
        if (!byTable.has(tableId)) {
          byTable.set(tableId, reservation);
        }
      });
    });

  return byTable;
}

function formatReservationLeadTime(minutes, language = "bg") {
  const value = Math.max(0, Math.round(Number(minutes || 0)));
  const hours = Math.floor(value / 60);
  const restMinutes = value % 60;

  if (language === "bg") {
    if (hours > 0 && restMinutes > 0) {
      return `след ${hours} ${hours === 1 ? "час" : "часа"} и ${restMinutes} ${restMinutes === 1 ? "минута" : "минути"}`;
    }
    if (hours > 0) return `след ${hours} ${hours === 1 ? "час" : "часа"}`;
    return `след ${restMinutes} ${restMinutes === 1 ? "минута" : "минути"}`;
  }

  if (hours > 0 && restMinutes > 0) {
    return `in ${hours} ${hours === 1 ? "hour" : "hours"} and ${restMinutes} ${restMinutes === 1 ? "minute" : "minutes"}`;
  }
  if (hours > 0) return `in ${hours} ${hours === 1 ? "hour" : "hours"}`;
  return `in ${restMinutes} ${restMinutes === 1 ? "minute" : "minutes"}`;
}

function getReservationTimingLabel(reservation, text, now = new Date()) {
  const minutes = getReservationMinutesFromNow(reservation, now);

  if (minutes === null) return "";
  if (reservation.isArrived) return text.arrivedStatus;
  if (minutes <= -10) return `${Math.abs(minutes)} min ${text.late}`;
  if (minutes <= 0) return text.now;

  return formatReservationLeadTime(minutes, text.dueIn === "след" ? "bg" : "en");
}

function hasLayoutOverlap(layout, candidate, ignoreId = candidate.id) {
  return layout.some((item) => {
    if (item.id === ignoreId || item.id === candidate.id || item.area !== candidate.area || !item.isActive || !candidate.isActive) {
      return false;
    }

    const distance = Math.hypot(item.x - candidate.x, item.y - candidate.y);
    return distance < 6;
  });
}

function AdminMapWindow({ className = "", label, vertical = false }) {
  return (
    <div className={`pointer-events-none absolute z-[3] ${className}`}>
      <div className="relative h-full w-full overflow-hidden rounded-full border border-sky-200/35 bg-sky-100/[0.065] shadow-[0_0_26px_rgba(125,211,252,0.14)] backdrop-blur">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.22),transparent_36%),repeating-linear-gradient(90deg,transparent_0_18%,rgba(186,230,253,0.2)_18%_19%,transparent_19%_38%)]" />
        <div className="absolute inset-x-2 top-1/2 h-px -translate-y-1/2 bg-sky-100/35" />
        <div
          className={`relative flex h-full w-full items-center justify-center text-[8px] font-bold uppercase tracking-[0.28em] text-sky-100/86 ${
            vertical ? "-rotate-90 whitespace-nowrap" : ""
          }`}
        >
          {label}
        </div>
      </div>
    </div>
  );
}

function AdminMapDecor({ area }) {
  if (area === "garden") {
    return (
      <>
        <AdminMapWindow className="left-5 right-5 top-3 h-4" label="Прозорци" />
        <AdminMapWindow className="bottom-5 left-3 top-5 w-4" label="Прозорци" vertical />
        <AdminMapWindow className="bottom-5 right-3 top-5 w-4" label="Прозорци" vertical />
        <div className="pointer-events-none absolute left-[4%] top-[50%] z-[3]">
          <div className="relative h-16 w-6 rounded-lg border border-white/18 bg-[#080706] shadow-[0_0_24px_rgba(0,0,0,0.42)]">
            <div className="absolute inset-1 rounded-lg bg-[linear-gradient(160deg,rgba(56,189,248,0.28),rgba(255,255,255,0.08)_42%,rgba(20,184,166,0.16))]" />
          </div>
          <div className="mt-1 -translate-x-4 rounded-full border border-white/10 bg-black/30 px-2 py-1 text-[7px] font-bold uppercase tracking-[0.16em] text-white/60">
            Телевизор
          </div>
        </div>
        <div className="pointer-events-none absolute bottom-1 left-1/2 z-[3] w-[24%] -translate-x-1/2 text-center">
          <div className="mx-auto h-6 w-16 rounded-t-full border-x border-t border-[#d6b278]/55 bg-[radial-gradient(circle_at_50%_100%,rgba(214,178,120,0.28),transparent_62%)]" />
          <div className="mx-auto h-1 w-20 rounded-full bg-[#d6b278]/55" />
          <div className="mx-auto mt-0.5 max-w-[96px] rounded-full border border-[#c9a56a]/28 bg-black/48 px-2 py-0.5 text-[7px] font-bold uppercase tracking-[0.16em] text-[#f2d39a] backdrop-blur">
            Вход към терасата
          </div>
        </div>
      </>
    );
  }

  if (area === "openTerrace") {
    return (
      <div className="pointer-events-none absolute left-1/2 top-2 z-[3] w-[32%] -translate-x-1/2 text-center">
        <div className="mx-auto h-6 w-16 rounded-b-full border-x border-b border-[#d6b278]/55 bg-[radial-gradient(circle_at_50%_0%,rgba(214,178,120,0.28),transparent_62%)]" />
        <div className="mx-auto h-1 w-20 rounded-full bg-[#d6b278]/55" />
        <div className="mx-auto mt-0.5 max-w-[116px] rounded-full border border-[#c9a56a]/28 bg-black/48 px-2 py-0.5 text-[7px] font-bold uppercase tracking-[0.14em] text-[#f2d39a] backdrop-blur">
          Вход в ресторан
        </div>
      </div>
    );
  }

  return (
    <>
      <AdminMapWindow className="left-3 top-5 h-[50%] w-4" label="Прозорци" vertical />
      <AdminMapWindow className="bottom-5 left-3 top-[70%] w-4" label="Прозорци" vertical />
      <div className="pointer-events-none absolute right-5 top-[51%] z-[3] h-4 w-[50%] -translate-y-1/2">
        <div className="relative h-full w-full rounded-full border border-stone-200/14 bg-[linear-gradient(180deg,rgba(255,244,223,0.18),rgba(63,47,34,0.78),rgba(255,244,223,0.12))] shadow-[0_0_28px_rgba(0,0,0,0.34)]">
          <div className="absolute inset-x-2 top-1/2 h-px -translate-y-1/2 bg-[#f2d39a]/20" />
        </div>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-black/35 px-2 py-0.5 text-[7px] font-bold uppercase tracking-[0.18em] text-white/55 backdrop-blur">
          Стена
        </div>
      </div>
      <div className="pointer-events-none absolute left-1 top-[60%] z-[3] flex -translate-y-1/2 items-center">
        <div className="h-14 w-5 rounded-r-full border-y border-r border-[#d6b278]/55 bg-[radial-gradient(circle_at_0%_50%,rgba(214,178,120,0.32),transparent_68%)]" />
        <div className="ml-1 rounded-full border border-[#c9a56a]/28 bg-black/48 px-2 py-1 text-[7px] font-bold uppercase tracking-[0.16em] text-[#f2d39a] backdrop-blur">
          Вход
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-1 left-[25%] z-[3] w-[28%] -translate-x-1/2 text-center">
        <div className="mx-auto h-6 w-16 rounded-t-full border-x border-t border-emerald-200/45 bg-[radial-gradient(circle_at_50%_100%,rgba(110,231,183,0.2),transparent_64%)]" />
        <div className="mx-auto h-1 w-20 rounded-full bg-emerald-200/45" />
        <div className="mx-auto mt-0.5 max-w-[104px] rounded-full border border-emerald-200/20 bg-black/48 px-2 py-0.5 text-[7px] font-bold uppercase tracking-[0.14em] text-emerald-100/90 backdrop-blur">
          Вход към терасата
        </div>
      </div>
    </>
  );
}

function TableLayoutEditor({
  text,
  layout,
  selectedArea,
  onAreaChange,
  onUpdate,
  onAdd,
  onRemove,
  onSave,
  onReset,
}) {
  const mapRef = React.useRef(null);
  const [draggingId, setDraggingId] = React.useState(null);
  const [selectedTableId, setSelectedTableId] = React.useState("");
  const areas = [
    ["indoor", "Зала / Непушачи"],
    ["garden", "Покрита тераса"],
    ["openTerrace", "Открита тераса"],
  ];
  const areaTables = layout.filter((item) => item.area === selectedArea);
  const activeAreaTables = areaTables.filter((item) => item.isActive);
  const selectedTable = areaTables.find((item) => item.id === selectedTableId) || areaTables[0];

  React.useEffect(() => {
    setSelectedTableId("");
  }, [selectedArea]);

  const moveTable = (tableId, clientX, clientY) => {
    const box = mapRef.current?.getBoundingClientRect();
    if (!box) return;

    const x = Math.min(94, Math.max(6, ((clientX - box.left) / box.width) * 100));
    const y = Math.min(94, Math.max(6, ((clientY - box.top) / box.height) * 100));
    const current = layout.find((item) => item.id === tableId);
    if (!current) return;

    const next = { ...current, x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) };
    if (hasLayoutOverlap(layout, next)) return;

    onUpdate(tableId, next);
  };

  return (
    <Panel
      title={text.title}
      subtitle={text.subtitle}
      right={
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onAdd} className="luxury-button rounded-full px-4 py-2 text-sm">
            {text.add}
          </button>
          <button type="button" onClick={onReset} className="ghost-button rounded-full px-4 py-2 text-sm">
            {text.reset}
          </button>
          <button type="button" onClick={onSave} className="luxury-button rounded-full px-4 py-2 text-sm">
            {text.save}
          </button>
        </div>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[1.4fr_0.8fr]">
        <div>
          <div className="mb-4 flex flex-wrap gap-2">
            {areas.map(([area, label]) => (
              <button
                key={area}
                type="button"
                onClick={() => onAreaChange(area)}
                className={`rounded-full px-4 py-2 text-sm transition ${
                  selectedArea === area ? "luxury-button" : "ghost-button"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div
            ref={mapRef}
            className={`relative min-h-[560px] overflow-hidden rounded-[26px] border border-white/10 ${
              selectedArea === "garden"
                ? "bg-[radial-gradient(circle_at_top,_rgba(60,169,126,0.13),_transparent_34%),linear-gradient(180deg,rgba(34,40,28,0.96),rgba(16,18,13,0.96))] md:min-h-[800px]"
                : selectedArea === "openTerrace"
                ? "bg-[radial-gradient(circle_at_top,_rgba(110,231,183,0.13),_transparent_34%),radial-gradient(circle_at_50%_100%,rgba(201,165,106,0.13),transparent_38%),linear-gradient(180deg,rgba(30,34,25,0.96),rgba(14,16,11,0.96))]"
                : "bg-[radial-gradient(circle_at_top,_rgba(201,165,106,0.16),_transparent_34%),radial-gradient(circle_at_18%_60%,rgba(125,211,252,0.08),transparent_25%),linear-gradient(180deg,rgba(39,27,21,0.96),rgba(16,12,10,0.96))] md:min-h-[830px]"
            }`}
            onPointerMove={(event) => {
              if (!draggingId) return;
              moveTable(draggingId, event.clientX, event.clientY);
            }}
            onPointerUp={() => setDraggingId(null)}
            onPointerCancel={() => setDraggingId(null)}
          >
            <div className="absolute inset-5 rounded-[22px] border border-[#c9a56a]/14 bg-[linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(180deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[length:42px_42px]" />
            <AdminMapDecor area={selectedArea} />

            {activeAreaTables.map((table) => (
              <button
                key={table.id}
                type="button"
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setSelectedTableId(table.id);
                  setDraggingId(table.id);
                }}
                className={`absolute z-10 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center rounded-xl border text-xs font-semibold shadow-2xl transition hover:scale-105 md:h-14 md:w-14 md:rounded-2xl md:text-sm ${
                  selectedTable?.id === table.id
                    ? "border-[#f2d39a] bg-[linear-gradient(145deg,#f6d99e,#b88b4d)] text-black"
                    : "border-[#c9a56a]/40 bg-[linear-gradient(145deg,#5a4332,#2a1f18)] text-white"
                }`}
                style={{ left: `${table.x}%`, top: `${table.y}%` }}
              >
                {table.id}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 p-4 text-sm text-amber-100">
            {text.overlap}
          </div>

          <div className="max-h-[230px] overflow-y-auto rounded-2xl border border-white/10 bg-black/20 p-2">
            {areaTables.map((table) => (
              <button
                key={table.id}
                type="button"
                onClick={() => setSelectedTableId(table.id)}
                className={`mb-2 flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition last:mb-0 ${
                  selectedTable?.id === table.id
                    ? "border-[#f2d39a]/50 bg-[#c9a56a]/16 text-[#fff4df]"
                    : "border-white/10 bg-white/[0.03] text-white/70 hover:border-[#c9a56a]/35"
                }`}
              >
                <span className="font-semibold">{table.id}</span>
                <span className="text-xs text-white/45">{table.seats} seats · {Math.round(table.x)}, {Math.round(table.y)}</span>
              </button>
            ))}
          </div>

          {selectedTable ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.22em] text-[#c9a56a]">Table</div>
                  <div className="mt-1 text-2xl font-semibold text-[#fff4df]">{selectedTable.id}</div>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(selectedTable.id)}
                  className="rounded-full border border-red-300/20 px-3 py-1 text-xs text-red-200"
                >
                  {text.remove}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                  <label className="col-span-2 text-xs text-white/55">
                    {text.tableNumber}
                    <input
                      type="text"
                      value={selectedTable.id}
                      onChange={(event) => {
                        const nextId = event.target.value.trim();
                        onUpdate(selectedTable.id, { ...selectedTable, id: nextId });
                        if (nextId) setSelectedTableId(nextId);
                      }}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <label className="text-xs text-white/55">
                    X
                    <input
                      type="number"
                      min="5"
                      max="95"
                      value={selectedTable.x}
                      onChange={(event) => onUpdate(selectedTable.id, { ...selectedTable, x: Number(event.target.value) })}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <label className="text-xs text-white/55">
                    Y
                    <input
                      type="number"
                      min="5"
                      max="95"
                      value={selectedTable.y}
                      onChange={(event) => onUpdate(selectedTable.id, { ...selectedTable, y: Number(event.target.value) })}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <label className="text-xs text-white/55">
                    {text.seats}
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={selectedTable.seats}
                      onChange={(event) => onUpdate(selectedTable.id, { ...selectedTable, seats: Number(event.target.value) })}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <label className="flex items-end gap-2 text-xs text-white/70">
                    <input
                      type="checkbox"
                      checked={selectedTable.isActive}
                      onChange={(event) => onUpdate(selectedTable.id, { ...selectedTable, isActive: event.target.checked })}
                    />
                    {text.active}
                  </label>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-white/55">
              Select a table from the list.
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

function ReservationOperationsMap({
  text,
  language = "bg",
  layout,
  reservations,
  diningOrders,
  menuItems,
  selectedArea,
  onAreaChange,
  selectedDate,
  onDateChange,
  onArrived,
  onAddConsumptionItem,
  onUpdateConsumptionItem,
  onMove,
  onNoShow,
  onOpenReservation,
  onOpenOrder,
  onSeatWalkIn,
  onCreateReservation,
  onClaimReservation,
  onRelease,
  requireTableClaim = false,
  diningEnabled = true,
  ordersOnly = false,
}) {
  const [selectedReservationId, setSelectedReservationId] = React.useState(null);
  const [selectedTableId, setSelectedTableId] = React.useState(null);
  const [moveReservationId, setMoveReservationId] = React.useState(null);
  const [moveDraft, setMoveDraft] = React.useState({ area: "indoor", tableIds: [], guestCount: 0 });
  const [showConsumption, setShowConsumption] = React.useState(false);
  const [consumptionSearch, setConsumptionSearch] = React.useState("");
  const [consumptionCategory, setConsumptionCategory] = React.useState("all");
  const [walkInDraft, setWalkInDraft] = React.useState(null);
  const [tableReservationDraft, setTableReservationDraft] = React.useState(null);
  const [shouldScrollMovePanel, setShouldScrollMovePanel] = React.useState(false);
  const movePanelRef = React.useRef(null);
  const consumptionPanelRef = React.useRef(null);
  const [now, setNow] = React.useState(() => new Date());
  const todayDate = formatLocalDate(now);
  const mapDate = selectedDate || todayDate;
  const isMapToday = mapDate === todayDate;
  const areas = [
    ["indoor", text.indoor],
    ["garden", text.garden],
    ["openTerrace", text.openTerrace],
  ];
  const getAreaTableCount = (area) => {
    const savedCount = layout.filter((item) => item.area === area && item.isActive).length;
    return savedCount || (tablesByArea[area] || []).length;
  };
  const getActiveTablesForArea = React.useCallback(
    (area) => {
      const savedTables = layout
        .filter((item) => item.area === area && item.isActive)
        .map(normalizeLayoutItem);

      return savedTables.length
        ? savedTables
        : (tablesByArea[area] || []).map((table) => normalizeLayoutItem({ ...table, area, isActive: true }));
    },
    [layout]
  );
  const fallbackLayout = (tablesByArea[selectedArea] || []).map((table) =>
    normalizeLayoutItem({ ...table, area: selectedArea, isActive: true })
  );
  const hasAreaLayout = layout.some((item) => item.area === selectedArea);
  const areaTables = (hasAreaLayout ? layout : fallbackLayout)
    .filter((item) => item.area === selectedArea && item.isActive)
    .sort((first, second) => first.id.localeCompare(second.id, undefined, { numeric: true }));
  const liveByTable = React.useMemo(
    () => isMapToday
      ? buildLiveReservationsByTable(reservations, now)
      : buildReservationsByTableForDate(reservations, mapDate),
    [isMapToday, mapDate, now, reservations]
  );
  const getReservationTables = React.useCallback(
    (reservation) => areaTables.filter((table) => reservation.tableIds.includes(table.id)),
    [areaTables]
  );
  const getReservationBounds = React.useCallback(
    (reservation) => {
      const tables = getReservationTables(reservation);
      if (tables.length === 0) return null;

      const xValues = tables.map((table) => table.x);
      const yValues = tables.map((table) => table.y);
      const minX = Math.min(...xValues);
      const maxX = Math.max(...xValues);
      const minY = Math.min(...yValues);
      const maxY = Math.max(...yValues);
      const width = Math.max(maxX - minX, tables.length > 1 ? 10 : 0);
      const height = Math.max(maxY - minY, tables.length > 1 ? 8 : 0);

      return {
        tables,
        minX,
        maxX,
        minY,
        maxY,
        centerX: (minX + maxX) / 2,
        centerY: (minY + maxY) / 2,
        left: ((minX + maxX) / 2) - width / 2,
        top: ((minY + maxY) / 2) - height / 2,
        width,
        height,
        labelTop: Math.max(4, minY - 7),
      };
    },
    [getReservationTables]
  );
  const liveReservations = React.useMemo(() => {
    const unique = new Map();
    areaTables.forEach((table) => {
      const reservation = liveByTable.get(table.id);
      if (reservation) unique.set(reservation.id, reservation);
    });

    return Array.from(unique.values()).sort((first, second) => {
      const firstMinutes = isMapToday ? getReservationMinutesFromNow(first, now) ?? 9999 : 9999;
      const secondMinutes = isMapToday ? getReservationMinutesFromNow(second, now) ?? 9999 : 9999;

      if (firstMinutes !== secondMinutes) return firstMinutes - secondMinutes;
      return String(first.reservedTime).localeCompare(String(second.reservedTime));
    });
  }, [areaTables, isMapToday, liveByTable, now]);
  const selectedReservation =
    liveReservations.find((reservation) => reservation.id === selectedReservationId) ||
    reservations.find((reservation) => reservation.id === selectedReservationId);
  const activeOrdersByReservationId = React.useMemo(() => {
    const grouped = new Map();

    diningOrders
      .filter((order) => order.status !== "Cancelled" && Number.isFinite(Number(order.reservationId)))
      .forEach((order) => {
        const reservationId = Number(order.reservationId);
        grouped.set(reservationId, [...(grouped.get(reservationId) || []), order]);
      });

    return grouped;
  }, [diningOrders]);
  const selectedConsumptionOrders = React.useMemo(
    () => selectedReservation
      ? activeOrdersByReservationId.get(Number(selectedReservation.id)) || []
      : [],
    [activeOrdersByReservationId, selectedReservation]
  );
  const selectedConsumptionItems = selectedConsumptionOrders.flatMap((order) =>
    order.items.map((item) => ({ ...item, orderId: order.id }))
  );
  const selectedConsumptionTotal = selectedConsumptionItems.reduce(
    (total, item) => total + Number(item.unitPrice || 0) * Number(item.quantity || 0),
    0
  );
  const selectedReservationNeedsClaim =
    Boolean(selectedReservation?.isArrived) &&
    diningEnabled &&
    requireTableClaim &&
    !selectedConsumptionOrders.some((order) => Boolean(order.assignedWaiterId));
  const newOrderReservationIds = React.useMemo(
    () => new Set(
      diningOrders
        .filter((order) => hasUnseenGuestItems(order))
        .map((order) => Number(order.reservationId))
        .filter(Number.isFinite)
    ),
    [diningOrders]
  );
  const nextReservations = liveReservations.filter((reservation) => !reservation.isArrived);
  const todayReservationsForSelectedTable = React.useMemo(() => {
    if (ordersOnly) return [];
    if (!selectedTableId) return [];

    return reservations
      .filter((reservation) => {
        if (reservation.area !== selectedArea) return false;
        if (reservation.reservedDate !== mapDate) return false;
        if (!reservation.tableIds.includes(selectedTableId)) return false;
        if (reservation.isNoShow || ["Cancelled", "Released"].includes(reservation.status)) return false;
        if (isMapToday && reservation.isArrived) return false;

        if (!isMapToday) return true;
        const minutes = getReservationMinutesFromNow(reservation, now);
        return minutes !== null && minutes >= 0;
      })
      .sort((first, second) => String(first.reservedTime).localeCompare(String(second.reservedTime)));
  }, [isMapToday, mapDate, now, ordersOnly, reservations, selectedArea, selectedTableId]);
  const nextSoonReservationForSelectedTable = React.useMemo(() => {
    if (ordersOnly || !selectedTableId || !isMapToday) return null;

    return reservations
      .map((reservation) => ({
        reservation,
        minutes: getReservationMinutesFromNow(reservation, now),
      }))
      .filter(({ reservation, minutes }) => {
        if (reservation.area !== selectedArea) return false;
        if (reservation.reservedDate !== todayDate) return false;
        if (!reservation.tableIds.includes(selectedTableId)) return false;
        if (reservation.isNoShow || reservation.isArrived || ["Cancelled", "Released"].includes(reservation.status)) return false;
        return minutes !== null && minutes > 0 && minutes < 180;
      })
      .sort((first, second) => first.minutes - second.minutes)[0] || null;
  }, [isMapToday, now, ordersOnly, reservations, selectedArea, selectedTableId, todayDate]);
  const selectedTableHasArrivedReservation = React.useMemo(() => {
    if (ordersOnly || !selectedTableId || !isMapToday) return false;

    return reservations.some((reservation) => {
      if (reservation.area !== selectedArea) return false;
      if (reservation.reservedDate !== todayDate) return false;
      if (!reservation.tableIds.includes(selectedTableId)) return false;
      if (reservation.isNoShow || ["Cancelled", "Released"].includes(reservation.status)) return false;
      return Boolean(reservation.isArrived);
    });
  }, [isMapToday, ordersOnly, reservations, selectedArea, selectedTableId, todayDate]);
  const canSeatWalkInForSelectedTable =
    isMapToday &&
    Boolean(onSeatWalkIn) &&
    !selectedTableHasArrivedReservation &&
    !(nextSoonReservationForSelectedTable && nextSoonReservationForSelectedTable.minutes <= 90);
  const activeOrdersByTable = React.useMemo(() => {
    const byTable = new Map();

    diningOrders
      .filter((order) => !["Done", "Cancelled"].includes(order.status))
      .forEach((order) => {
        String(order.tableLabel || "")
          .split(",")
          .map((tableId) => tableId.replace(/table/gi, "").trim())
          .filter(Boolean)
          .forEach((tableId) => {
            if (!byTable.has(tableId)) byTable.set(tableId, []);
            byTable.get(tableId).push(order);
          });
      });

    return byTable;
  }, [diningOrders]);
  const activeMapOrders = React.useMemo(
    () => Array.from(activeOrdersByTable.values()).flat(),
    [activeOrdersByTable]
  );
  const consumptionMenuGroups = React.useMemo(
    () => getMenuCategoryGroups(menuItems, language),
    [language, menuItems]
  );
  const filteredConsumptionMenuItems = React.useMemo(() => {
    const search = consumptionSearch.trim().toLowerCase();

    return menuItems
      .filter((item) => (getValue(item, "isActive") ?? true) === true)
      .filter((item) => consumptionCategory === "all" || normalizeCategory(getValue(item, "category")) === consumptionCategory)
      .filter((item) => {
        if (!search) return true;
        const haystack = `${getMenuItemName(item, "bg")} ${getMenuItemName(item, "en")} ${getValue(item, "descriptionBg") || ""}`.toLowerCase();
        return haystack.includes(search);
      })
      .slice(0, search ? 18 : 30);
  }, [consumptionCategory, consumptionSearch, menuItems]);
  const moveUnavailableTableIds = React.useMemo(
    () => selectedReservation
      ? getUnavailableTableIdsForSlot(
          reservations,
          selectedReservation.reservedDate,
          selectedReservation.reservedTime,
          selectedReservation.id
        )
      : new Set(),
    [reservations, selectedReservation]
  );
  const moveAreaTables = React.useMemo(
    () => getActiveTablesForArea(moveDraft.area),
    [getActiveTablesForArea, moveDraft.area]
  );
  const moveCandidateOptions = React.useMemo(
    () => getMoveCandidateOptions(
      moveDraft.area,
      Number(moveDraft.guestCount || selectedReservation?.guestCount || 0),
      moveUnavailableTableIds,
      moveAreaTables
    ),
    [moveDraft.area, moveDraft.guestCount, moveUnavailableTableIds, moveAreaTables, selectedReservation?.guestCount]
  );
  const moveSuggestedTableIds = React.useMemo(
    () => new Set(moveCandidateOptions.flatMap((option) => option.tableIds)),
    [moveCandidateOptions]
  );
  const moveBestTableIds = React.useMemo(
    () => new Set(moveCandidateOptions[0]?.tableIds || []),
    [moveCandidateOptions]
  );

  function openMovePanel(reservation) {
    setSelectedReservationId(reservation.id);
    onAreaChange(["garden", "openTerrace"].includes(reservation.area) ? reservation.area : "indoor");
    setMoveReservationId(reservation.id);
    setMoveDraft({
      area: ["garden", "openTerrace"].includes(reservation.area) ? reservation.area : "indoor",
      tableIds: reservation.tableIds,
      guestCount: Number(reservation.guestCount || 1),
    });
    setShouldScrollMovePanel(true);
  }

  function updateMoveGuestCount(value) {
    const nextGuestCount = Math.max(1, Math.min(40, Number(value || 1)));

    setMoveDraft((prev) => {
      return {
        ...prev,
        guestCount: nextGuestCount,
      };
    });
  }

  function toggleMoveTable(tableId) {
    if (!selectedReservation || moveUnavailableTableIds.has(tableId)) return;

    const exists = moveDraft.tableIds.includes(tableId);
    const originalTableIds = selectedReservation.tableIds || [];
    const isStillOnOriginalSelection =
      moveDraft.tableIds.length === originalTableIds.length &&
      moveDraft.tableIds.every((id) => originalTableIds.includes(id));

    const nextTableIds = exists
      ? moveDraft.tableIds.filter((id) => id !== tableId)
      : isStillOnOriginalSelection
        ? [tableId]
      : [...moveDraft.tableIds, tableId];

    setMoveDraft((prev) => ({ ...prev, tableIds: nextTableIds }));
  }

  async function saveMove() {
    if (!selectedReservation) return;

    const saved = await onMove(
      selectedReservation,
      moveDraft.area,
      moveDraft.tableIds,
      Number(moveDraft.guestCount || selectedReservation.guestCount || 0)
    );
    if (saved) {
      setMoveReservationId(null);
    }
  }

  function openConsumptionPanel() {
    if (!selectedReservation) return;

    setConsumptionSearch("");
    setConsumptionCategory("all");
    setShowConsumption(true);
  }

  async function claimSelectedReservation(reservation) {
    const claimed = await onClaimReservation?.(reservation.id);
    if (claimed === false) return;

    setSelectedReservationId(reservation.id);
  }

  function openWalkInModal(table) {
    setWalkInDraft({
      area: selectedArea,
      tableId: table.id,
      seats: table.seats,
      guestCount: Math.min(Number(table.seats || 2), 4),
    });
  }

  function openTableReservationForm(table) {
    const nextTime = getNextAdminReservationTime(new Date());
    setTableReservationDraft({
      guestName: "",
      phone: "",
      email: "",
      reservedDate: mapDate < todayDate ? todayDate : mapDate,
      reservedTime: nextTime,
      guestCount: Math.min(Number(table.seats || 2), 4),
      area: selectedArea,
      tableId: table.id,
      internalNote: "",
    });
  }

  function closeWalkInModal() {
    setWalkInDraft(null);
  }

  async function submitWalkInModal(event) {
    event.preventDefault();
    if (!walkInDraft) return;

    const seated = await onSeatWalkIn?.(walkInDraft);
    if (seated === false) return;

    closeWalkInModal();
    setSelectedTableId(null);
  }

  async function submitTableReservation(event) {
    event.preventDefault();
    if (!tableReservationDraft) return;

    const created = await onCreateReservation?.({
      guestName: tableReservationDraft.guestName,
      phone: tableReservationDraft.phone,
      email: tableReservationDraft.email,
      reservedDate: tableReservationDraft.reservedDate,
      reservedTime: tableReservationDraft.reservedTime,
      guestCount: Number(tableReservationDraft.guestCount || 1),
      area: tableReservationDraft.area,
      tableIds: [tableReservationDraft.tableId],
      internalNote: tableReservationDraft.internalNote,
      notes: "",
    });
    if (created === false) return;

    setTableReservationDraft(null);
    setSelectedTableId(null);
  }

  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  React.useEffect(() => {
    if (moveReservationId) return;
    setSelectedReservationId(null);
    setSelectedTableId(null);
    setShowConsumption(false);
    setWalkInDraft(null);
    setTableReservationDraft(null);
  }, [mapDate, moveReservationId, selectedArea]);

  React.useEffect(() => {
    if (!shouldScrollMovePanel || !moveReservationId) return;

    const frame = window.requestAnimationFrame(() => {
      if (window.matchMedia("(max-width: 1279px), (pointer: coarse)").matches) {
        movePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      setShouldScrollMovePanel(false);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [moveReservationId, shouldScrollMovePanel, selectedReservationId]);

  React.useEffect(() => {
    if (!showConsumption) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [showConsumption]);

  function renderTableReservationControls(table) {
    if (!onCreateReservation) return null;

    const isOpen = tableReservationDraft?.tableId === table.id && tableReservationDraft?.area === selectedArea;

    if (!isOpen) {
      return (
        <button
          type="button"
          onClick={() => openTableReservationForm(table)}
          className="w-full rounded-xl border border-[#f2d39a]/30 bg-[#c9a56a]/15 px-3 py-2 text-xs font-semibold text-[#f2d39a] transition hover:border-[#f2d39a]/55 hover:bg-[#c9a56a]/22"
        >
          {language === "bg" ? "Създай резервация" : "Create reservation"}
        </button>
      );
    }

    return (
      <div className="rounded-2xl border border-[#f2d39a]/18 bg-[#c9a56a]/10 px-3 py-2 text-xs leading-5 text-[#f2d39a]">
        {language === "bg" ? "Формата е отворена върху картата." : "The form is open over the map."}
      </div>
    );
  }

  function renderFloatingTableReservationForm() {
    if (!tableReservationDraft || tableReservationDraft.area !== selectedArea) return null;

    return (
      <div className="absolute inset-3 z-[95] flex items-center justify-center bg-black/35 p-2 backdrop-blur-[2px] sm:inset-5 sm:p-4">
        <form
          onSubmit={submitTableReservation}
          className="max-h-full w-full max-w-[440px] overflow-y-auto rounded-[24px] border border-[#f2d39a]/22 bg-[#15110e]/96 p-4 text-left shadow-[0_28px_90px_rgba(0,0,0,0.72)] sm:p-5"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="section-kicker text-[10px]">
                {language === "bg" ? "Нова резервация" : "New reservation"}
              </div>
              <div className="mt-1 text-lg font-semibold text-[#fff4df]">
                {text.table} {tableReservationDraft.tableId}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setTableReservationDraft(null)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/55 transition hover:text-white"
              aria-label="Close reservation form"
            >
              ×
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            <input
              value={tableReservationDraft.guestName}
              onChange={(event) => setTableReservationDraft((prev) => ({ ...prev, guestName: event.target.value }))}
              required
              placeholder={language === "bg" ? "Име" : "Name"}
              className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-[#f2d39a]/55"
            />
            <input
              value={tableReservationDraft.phone}
              onChange={(event) => setTableReservationDraft((prev) => ({ ...prev, phone: event.target.value }))}
              required
              placeholder={language === "bg" ? "Телефон" : "Phone"}
              className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-[#f2d39a]/55"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={tableReservationDraft.reservedDate}
                min={formatLocalDate(new Date())}
                onChange={(event) => setTableReservationDraft((prev) => ({ ...prev, reservedDate: event.target.value }))}
                required
                className="w-full rounded-2xl border border-white/10 bg-black/25 px-3 py-3 text-sm text-white outline-none focus:border-[#f2d39a]/55"
              />
              <select
                value={tableReservationDraft.reservedTime}
                onChange={(event) => setTableReservationDraft((prev) => ({ ...prev, reservedTime: event.target.value }))}
                required
                className="w-full rounded-2xl border border-white/10 bg-black/25 px-3 py-3 text-sm text-white outline-none focus:border-[#f2d39a]/55"
              >
                {getAvailableReservationTimesForDate(adminReservationTimes, tableReservationDraft.reservedDate).map((time) => (
                  <option key={time} value={time}>{time}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-[0.75fr_1fr] gap-2">
              <input
                type="number"
                min="1"
                max="40"
                value={tableReservationDraft.guestCount}
                onChange={(event) => setTableReservationDraft((prev) => ({ ...prev, guestCount: event.target.value }))}
                required
                className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none focus:border-[#f2d39a]/55"
              />
              <input
                value={tableReservationDraft.email}
                onChange={(event) => setTableReservationDraft((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="Email"
                className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-[#f2d39a]/55"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button type="submit" className="luxury-button rounded-2xl px-4 py-3 text-sm font-semibold">
                {language === "bg" ? "Запази" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setTableReservationDraft(null)}
                className="ghost-button rounded-2xl px-4 py-3 text-sm font-semibold"
              >
                {language === "bg" ? "Откажи" : "Cancel"}
              </button>
            </div>
          </div>
        </form>
      </div>
    );
  }

  return (
    <Panel title={text.title} subtitle={text.subtitle}>
      {!ordersOnly && (
        <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-[#c9a56a]/18 bg-black/20 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="section-kicker text-[10px]">
              {adminLocalText(language, "Дата на картата", "Map date", "Дата карты")}
            </div>
            <div className="mt-1 text-sm text-white/55">
              {isMapToday
                ? adminLocalText(language, "Оперативен изглед за днес.", "Live operational view for today.", "Операционная карта на сегодня.")
                : adminLocalText(language, "Планиране на заетостта за избрания ден.", "Occupancy planning for the selected day.", "Просмотр загрузки на выбранный день.")}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={mapDate}
              onChange={(event) => onDateChange?.(event.target.value)}
              className="min-h-[44px] rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm font-semibold text-[#fff4df] outline-none focus:border-[#f2d39a]/60"
              aria-label={adminLocalText(language, "Дата на картата", "Map date", "Дата карты")}
            />
            <button
              type="button"
              onClick={() => onDateChange?.(todayDate)}
              className={`min-h-[44px] rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
                isMapToday
                  ? "border-[#f2d39a]/55 bg-[#c9a56a]/22 text-[#fff4df]"
                  : "border-white/10 bg-white/[0.04] text-white/65 hover:border-[#c9a56a]/35 hover:text-white"
              }`}
            >
              {adminLocalText(language, "Днес", "Today", "Сегодня")}
            </button>
          </div>
        </div>
      )}
      <div className="mb-5 grid gap-2 sm:grid-cols-3">
        {areas.map(([area, label]) => (
          <button
            key={area}
            type="button"
            onClick={() => onAreaChange(area)}
            className={`rounded-2xl border px-4 py-3 text-left transition ${
              selectedArea === area
                ? "border-[#f2d39a]/70 bg-[#c9a56a]/20 text-[#fff4df]"
                : "border-white/10 bg-black/20 text-white/65 hover:border-[#c9a56a]/35 hover:text-white"
            }`}
          >
            <span className="block text-sm font-semibold">{label}</span>
            <span className="mt-1 block text-xs text-white/45">
              {getAreaTableCount(area)} {text.tables}
            </span>
          </button>
        ))}
      </div>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,0.75fr)]">
        <div
          className={`admin-reservation-map-surface relative min-w-0 min-h-[600px] overflow-hidden rounded-[26px] border border-white/10 ${
            selectedArea === "garden"
              ? "bg-[radial-gradient(circle_at_top,_rgba(60,169,126,0.13),_transparent_34%),linear-gradient(180deg,rgba(34,40,28,0.96),rgba(16,18,13,0.96))] md:min-h-[820px]"
              : selectedArea === "openTerrace"
              ? "bg-[radial-gradient(circle_at_top,_rgba(110,231,183,0.13),_transparent_34%),radial-gradient(circle_at_50%_100%,rgba(201,165,106,0.13),transparent_38%),linear-gradient(180deg,rgba(30,34,25,0.96),rgba(14,16,11,0.96))]"
              : "bg-[radial-gradient(circle_at_top,_rgba(201,165,106,0.16),_transparent_34%),radial-gradient(circle_at_18%_60%,rgba(125,211,252,0.08),transparent_25%),linear-gradient(180deg,rgba(39,27,21,0.96),rgba(16,12,10,0.96))] md:min-h-[850px]"
          }`}
        >
          <div className="admin-reservation-map-grid absolute inset-5 rounded-[22px] border border-[#c9a56a]/14 bg-[linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(180deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[length:42px_42px]" />
          <AdminMapDecor area={selectedArea} />

          {liveReservations.map((reservation) => {
            const bounds = getReservationBounds(reservation);
            if (!bounds) return null;

            const minutes = isMapToday ? getReservationMinutesFromNow(reservation, now) : null;
            const isLate = isMapToday && !reservation.isArrived && minutes !== null && minutes <= -10;
	            const isSelected = reservation.id === selectedReservationId;
	            const hasNewOrderItems = newOrderReservationIds.has(Number(reservation.id));
	            const canNoShow = isMapToday && !reservation.isArrived && minutes !== null && minutes <= -10;
            const canMarkArrived = isMapToday && !reservation.isArrived;
            const reservationOrders = activeOrdersByReservationId.get(Number(reservation.id)) || [];
            const needsTableClaim =
              isMapToday &&
              diningEnabled &&
              requireTableClaim &&
              reservation.isArrived &&
              !reservationOrders.some((order) => Boolean(order.assignedWaiterId));
            const popoverPosition = bounds.labelTop > 72 ? "sm:top-auto sm:bottom-11" : "sm:top-11";
            const mobilePopoverOffset =
              bounds.centerX < 28
                ? "left-0 translate-x-0"
                : bounds.centerX > 72
                ? "right-0 translate-x-0"
                : "left-1/2 -translate-x-1/2";

            return (
              <React.Fragment key={`reservation-${reservation.id}`}>
                {bounds.tables.length > 1 && (
                  <div
                    className={`pointer-events-none absolute z-[8] rounded-[28px] border shadow-[0_0_38px_rgba(201,165,106,0.16)] ${
                      reservation.isArrived
                        ? "border-emerald-300/35 bg-emerald-400/10"
                        : isLate
                        ? "border-red-300/45 bg-red-500/10"
                        : "border-[#f2d39a]/35 bg-[#c9a56a]/10"
                    }`}
                    style={{
                      left: `${bounds.left}%`,
                      top: `${bounds.top}%`,
                      width: `${bounds.width}%`,
                      height: `${bounds.height}%`,
                    }}
                  >
                    <div className="absolute inset-0 rounded-[28px] bg-[radial-gradient(circle_at_center,rgba(242,211,154,0.16),transparent_64%)]" />
                  </div>
                )}

                <div
                  className="absolute z-40 -translate-x-1/2"
                  style={{ left: `${bounds.centerX}%`, top: `${bounds.labelTop}%` }}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedReservationId(isSelected ? null : reservation.id)}
	                    className={`relative z-40 min-w-[96px] rounded-full border px-2.5 py-1 text-[9px] font-semibold shadow-2xl backdrop-blur transition hover:scale-[1.03] sm:min-w-[112px] sm:px-3 sm:py-1.5 sm:text-[10px] lg:min-w-[128px] lg:text-[11px] ${
	                      hasNewOrderItems
	                        ? "admin-reservation-guest-marker waiter-new-alert border-amber-300/55 bg-amber-400/22 text-amber-50"
	                      : reservation.isArrived
	                        ? "admin-reservation-guest-marker border-emerald-300/40 bg-emerald-400/20 text-emerald-100"
                        : isLate
                        ? "admin-reservation-guest-marker border-red-300/50 bg-red-500/25 text-red-100"
                        : "admin-reservation-guest-marker border-[#f2d39a]/45 bg-[#2f241b]/90 text-[#fff4df]"
                    }`}
                  >
                    <span className="block truncate">{reservation.guestName}</span>
                    <span className="block text-[7px] font-medium uppercase tracking-[0.12em] opacity-70 sm:text-[8px] lg:text-[9px]">
                      {isMapToday ? getReservationTimingLabel(reservation, text, now) : reservation.reservedTime}
                    </span>
                  </button>

                  {isSelected && (
                    <div className={`absolute ${mobilePopoverOffset} top-9 z-[70] w-[190px] rounded-2xl border border-white/12 bg-[#15110e]/95 p-2.5 text-left shadow-[0_22px_70px_rgba(0,0,0,0.68)] backdrop-blur sm:left-1/2 sm:right-auto ${popoverPosition} sm:w-[220px] sm:-translate-x-1/2 sm:p-3 lg:w-[230px]`}>
                      <div className="text-sm font-semibold text-[#fff4df]">{reservation.guestName}</div>
                      <div className="mt-1 text-xs text-white/50">
                        {reservation.reservedTime} · {reservation.guestCount} {text.guests} · {reservation.tableIds.join(", ")}
                      </div>
                      <div className={`mt-3 grid gap-2 ${canNoShow ? "grid-cols-2" : "grid-cols-1"}`}>
                        {canMarkArrived && (
                          <button
                            type="button"
                            onClick={() => onArrived(reservation)}
                            className="rounded-xl border border-emerald-300/25 bg-emerald-400/15 py-2 pl-2 pr-3 text-left text-xs font-semibold text-emerald-100"
                          >
                            {text.arrived}
                          </button>
                        )}
                        {canNoShow && (
                          <button
                            type="button"
                            onClick={() => onNoShow(reservation)}
                            className="rounded-xl border border-red-300/25 bg-red-500/15 px-3 py-2 text-xs font-semibold text-red-100"
                          >
                            {text.noShow}
                          </button>
                        )}
                        {!ordersOnly && onMove && (
                          <button
                            type="button"
                            onClick={() => openMovePanel(reservation)}
                            className="rounded-xl border border-[#f2d39a]/25 bg-[#c9a56a]/15 px-3 py-2 text-xs font-semibold text-[#f2d39a]"
                          >
                            {text.move}
                          </button>
                        )}
                        {reservation.isArrived && needsTableClaim && (
                          <button
                            type="button"
                            onClick={() => claimSelectedReservation(reservation)}
                            className="rounded-xl border border-[#f2d39a]/35 bg-[#c9a56a]/20 px-3 py-2 text-xs font-semibold text-[#ffe3a6]"
                          >
                            {language === "bg" ? "Вземи маса" : "Take table"}
                          </button>
                        )}
                        {reservation.isArrived && !needsTableClaim && (
                          <>
	                          {diningEnabled && (
	                            <button
	                              type="button"
	                              onClick={openConsumptionPanel}
	                              className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
	                                hasNewOrderItems
	                                  ? "waiter-new-alert border-amber-300/30 bg-amber-400/15 text-amber-100"
	                                  : "border-emerald-300/25 bg-emerald-400/15 text-emerald-100"
	                              }`}
	                            >
                              {text.consumption}
                            </button>
	                          )}
                            <button
                              type="button"
                              onClick={() => onRelease(reservation)}
                              className="rounded-xl border border-sky-300/25 bg-sky-400/15 px-3 py-2 text-xs font-semibold text-sky-100"
                            >
                              {text.release}
                            </button>
                          </>
                        )}
                      </div>
                      {!reservation.isArrived && (
                        <a
                          href={`tel:${reservation.phone}`}
                          className="mt-2 block rounded-xl border border-[#f2d39a]/25 bg-[#c9a56a]/15 px-3 py-2 text-center text-xs font-semibold text-[#f2d39a]"
                        >
                          {text.call}
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </React.Fragment>
            );
          })}

          {areaTables.map((table) => {
            const reservation = liveByTable.get(table.id);
            const tableOrders = activeOrdersByTable.get(table.id) || [];
            const hasTableOrders = tableOrders.length > 0;
            const minutes = reservation ? getReservationMinutesFromNow(reservation, now) : null;
            const isLate = reservation && !reservation.isArrived && minutes !== null && minutes <= -10;
            const isGroupTable = reservation?.tableIds?.length > 1;
            const isSelectedTable = selectedTableId === table.id;
            const isMoveMode = moveReservationId === selectedReservation?.id && moveDraft.area === selectedArea;
            const isMoveSelected = isMoveMode && moveDraft.tableIds.includes(table.id);
            const isMoveUnavailable = isMoveMode && !isMoveSelected && moveUnavailableTableIds.has(table.id);
            const isMoveSuggested = isMoveMode && moveSuggestedTableIds.has(table.id);
            const isMoveBest = isMoveMode && moveBestTableIds.has(table.id);
            const isMoveAllowed =
              isMoveMode &&
              !isMoveUnavailable;
            const hasOpenTableReservationForm =
              tableReservationDraft?.tableId === table.id && tableReservationDraft?.area === selectedArea;
            const placeTablePopoverAbove = hasOpenTableReservationForm ? table.y > 48 : table.y > 72;

            return (
              <div
                key={table.id}
                className={`absolute -translate-x-1/2 -translate-y-1/2 ${isSelectedTable ? "z-[75]" : "z-10"}`}
                style={{ left: `${table.x}%`, top: `${table.y}%` }}
              >
                <button
                  type="button"
                  data-reserved={reservation ? "true" : "false"}
                  data-arrived={reservation?.isArrived ? "true" : "false"}
                  data-selected={isSelectedTable || isMoveSelected ? "true" : "false"}
                  data-orders={hasTableOrders ? "true" : "false"}
                  onClick={() => {
                    if (isMoveMode && isMoveAllowed) {
                      toggleMoveTable(table.id);
                      setSelectedTableId(null);
                      return;
                    }

                    setSelectedTableId((current) => (current === table.id ? null : table.id));
                  }}
                  className={`admin-map-table-node flex items-center justify-center rounded-2xl border font-semibold shadow-2xl transition hover:scale-[1.04] ${
                    isGroupTable
                      ? "h-9 min-w-[50px] px-2 text-xs sm:h-10 sm:min-w-[58px] sm:px-3 md:h-12 md:min-w-[68px] lg:h-16 lg:min-w-[88px]"
                      : "h-8 w-8 text-xs sm:h-9 sm:w-9 md:h-11 md:w-11 lg:h-14 lg:w-14 lg:text-sm"
                  } ${
                    isMoveSelected
                      ? "border-[#f2d39a]/80 bg-[linear-gradient(145deg,#f2d39a,#b8843f)] text-black ring-4 ring-[#f2d39a]/25"
                      : isMoveBest
                      ? "move-table-suggestion border-[#f2d39a]/75 bg-[linear-gradient(145deg,#6f5236,#221812)] text-[#fff4df]"
                      : isMoveSuggested
                      ? "border-[#f2d39a]/55 bg-[linear-gradient(145deg,#4a3728,#201711)] text-[#f2d39a] ring-2 ring-[#c9a56a]/20"
                      : isMoveMode && !isMoveAllowed
                      ? "cursor-not-allowed border-white/5 bg-black/20 text-white/25"
                    : ordersOnly && hasTableOrders
                      ? "border-emerald-300/60 bg-[linear-gradient(145deg,#246347,#10261d)] text-emerald-50 ring-2 ring-emerald-300/20"
                    : reservation?.isArrived
                      ? "border-emerald-300/55 bg-[linear-gradient(145deg,#214f3b,#10261d)] text-emerald-50"
                      : isLate
                      ? "border-red-300/70 bg-[linear-gradient(145deg,#6b1f1f,#251010)] text-red-50"
                      : reservation
                      ? "border-[#f2d39a]/65 bg-[linear-gradient(145deg,#f2d39a,#9f743d)] text-black"
                      : isSelectedTable
                      ? "border-[#f2d39a]/70 bg-[linear-gradient(145deg,#6f5236,#221812)] text-[#fff4df] ring-2 ring-[#f2d39a]/25"
                      : "border-[#c9a56a]/35 bg-[linear-gradient(145deg,#5a4332,#2a1f18)] text-white/85"
                  } ${isSelectedTable ? "ring-2 ring-[#f2d39a]/35" : ""}`}
                >
                  {table.id}
                </button>

                {isSelectedTable && (
                  <div
                    className={`absolute z-[80] max-h-[min(520px,calc(100vh-180px))] w-[230px] overflow-y-auto rounded-2xl border border-[#f2d39a]/18 bg-[#15110e]/95 p-3 text-left shadow-[0_22px_70px_rgba(0,0,0,0.7)] backdrop-blur sm:w-[280px] ${
                      placeTablePopoverAbove ? "bottom-10 sm:bottom-12 lg:bottom-16" : "top-10 sm:top-12 lg:top-16"
                    } ${
                      table.x < 28
                        ? "left-0"
                        : table.x > 72
                        ? "right-0"
                        : "left-1/2 -translate-x-1/2"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="section-kicker text-[9px]">{text.tableTodayTitle}</div>
                        <div className="mt-1 text-base font-semibold text-[#fff4df]">
                          {text.table} {table.id}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedTableId(null)}
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/55 transition hover:text-white"
                        aria-label="Close table reservations"
                      >
                        ×
                      </button>
                    </div>

                    {ordersOnly ? (
                      tableOrders.length === 0 ? (
                        <p className="mt-3 text-sm leading-6 text-white/55">{text.ordersEmpty || text.tableTodayEmpty}</p>
                      ) : (
                        <div className="mt-3 space-y-2">
                          {tableOrders.map((order) => (
                            <button
                              key={order.id}
                              type="button"
                              onClick={() => onOpenOrder?.(order.id)}
                              className="w-full rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-left transition hover:border-emerald-200/35"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <span className="min-w-0 truncate text-sm font-semibold text-emerald-100">
                                  #{order.id} · {order.status}
                                </span>
                                <span className="shrink-0 text-xs text-emerald-100/65">
                                  {formatEuroAmount(order.totalPrice)}
                                </span>
                              </div>
                              <div className="mt-1 truncate text-xs text-white/45">
                                {order.guestName || "—"}
                              </div>
                            </button>
                          ))}
                        </div>
                      )
                    ) : todayReservationsForSelectedTable.length === 0 ? (
                      <div className="mt-3 space-y-3">
                        <p className="text-sm leading-6 text-white/55">{text.tableTodayEmpty}</p>
                        {nextSoonReservationForSelectedTable && (
                          <div className="rounded-xl border border-amber-300/25 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-100">
                            {language === "bg"
                              ? `Има резервация ${formatReservationLeadTime(nextSoonReservationForSelectedTable.minutes, language)}.`
                              : `Reservation ${formatReservationLeadTime(nextSoonReservationForSelectedTable.minutes, language)}.`}
                          </div>
                        )}
                        {renderTableReservationControls(table)}
                        {canSeatWalkInForSelectedTable && (
                          <button
                            type="button"
                            onClick={() => openWalkInModal(table)}
                            className="w-full rounded-xl border border-emerald-300/25 bg-emerald-400/15 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:border-emerald-200/40 hover:bg-emerald-400/20"
                          >
                            {language === "bg" ? "Настани без резервация" : "Seat walk-in"}
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {todayReservationsForSelectedTable.map((reservation) => (
                          <button
                            key={reservation.id}
                            type="button"
                            onClick={() => setSelectedReservationId(reservation.id)}
                            className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition ${
                              selectedReservationId === reservation.id
                                ? "border-[#f2d39a]/55 bg-[#c9a56a]/18"
                                : "border-white/10 bg-white/[0.035] hover:border-[#c9a56a]/35"
                            }`}
                          >
                            <span className="min-w-0 truncate text-sm font-semibold text-[#fff4df]">
                              {reservation.guestName}
                            </span>
                            <span className="shrink-0 rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-[11px] font-semibold text-[#f2d39a]">
                              {reservation.reservedTime}
                            </span>
                          </button>
                        ))}
                        {nextSoonReservationForSelectedTable && (
                          <div className="rounded-xl border border-amber-300/25 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-100">
                            {language === "bg"
                              ? `Има резервация ${formatReservationLeadTime(nextSoonReservationForSelectedTable.minutes, language)}.`
                              : `Reservation ${formatReservationLeadTime(nextSoonReservationForSelectedTable.minutes, language)}.`}
                          </div>
                        )}
                        {renderTableReservationControls(table)}
                        {canSeatWalkInForSelectedTable && (
                          <button
                            type="button"
                            onClick={() => openWalkInModal(table)}
                            className="w-full rounded-xl border border-emerald-300/25 bg-emerald-400/15 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:border-emerald-200/40 hover:bg-emerald-400/20"
                          >
                            {language === "bg" ? "Настани без резервация" : "Seat walk-in"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {renderFloatingTableReservationForm()}
        </div>

        <div className="min-w-0 space-y-3">
          <div className="rounded-2xl border border-[#c9a56a]/18 bg-black/20 p-4">
            <div className="section-kicker">{ordersOnly ? text.ordersTitle || "Orders" : text.next}</div>
            {ordersOnly ? (
              activeMapOrders.length === 0 ? (
                <p className="mt-3 text-sm text-white/55">{text.ordersEmpty || text.empty}</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {activeMapOrders.slice(0, 12).map((order) => (
                    <button
                      key={order.id}
                      type="button"
                      onClick={() => onOpenOrder?.(order.id)}
                      className="w-full rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-left transition hover:border-emerald-300/35 hover:bg-emerald-400/10"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold text-[#fff4df]">{order.tableLabel}</span>
                        <span className="text-xs text-emerald-100/70">{order.status}</span>
                      </div>
                      <div className="mt-1 text-xs text-white/45">
                        #{order.id} · {order.guestName || "—"} · {formatEuroAmount(order.totalPrice)}
                      </div>
                    </button>
                  ))}
                </div>
              )
            ) : nextReservations.length === 0 ? (
              <p className="mt-3 text-sm text-white/55">{text.empty}</p>
            ) : (
              <div className="mt-3 space-y-2">
                {nextReservations.map((reservation) => {
                  const minutes = getReservationMinutesFromNow(reservation, now);
                  const isLate = !reservation.isArrived && minutes !== null && minutes <= -10;

                  return (
                    <button
                      key={reservation.id}
                      type="button"
                      onClick={() => setSelectedReservationId(reservation.id)}
                      className={`w-full rounded-2xl border p-3 text-left transition ${
                        selectedReservationId === reservation.id
                          ? "border-[#f2d39a]/55 bg-[#c9a56a]/16"
                          : isLate
                          ? "border-red-300/25 bg-red-500/10"
                          : "border-white/10 bg-white/[0.03] hover:border-[#c9a56a]/35"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold text-[#fff4df]">{reservation.guestName}</span>
                        <span className="text-xs text-white/50">{reservation.reservedTime}</span>
                      </div>
                      <div className="mt-1 text-xs text-white/45">
                        {isMapToday ? getReservationTimingLabel(reservation, text, now) : reservation.reservedDate} · {reservation.guestCount} {text.guests} · {reservation.tableIds.join(", ")}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {selectedReservation && (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs uppercase tracking-[0.22em] text-[#c9a56a]">{selectedReservation.reservedTime}</div>
              <div className="mt-2 text-xl font-semibold text-[#fff4df]">{selectedReservation.guestName}</div>
              <div className="mt-1 text-sm text-white/55">
                {selectedReservation.guestCount} {text.guests} · {selectedReservation.tableIds.join(", ")}
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
                {!ordersOnly && onMove && (
                  <button type="button" onClick={() => openMovePanel(selectedReservation)} className="rounded-xl border border-[#f2d39a]/25 bg-[#c9a56a]/15 px-4 py-3 text-sm font-semibold text-[#f2d39a]">
                    {text.move}
                  </button>
                )}
                {isMapToday && !selectedReservation.isArrived && (
                  <button type="button" onClick={() => onArrived(selectedReservation)} className="luxury-button rounded-xl py-3 pl-3 pr-4 text-left text-sm">
                    {text.arrived}
                  </button>
                )}
                {isMapToday && !selectedReservation.isArrived && (getReservationMinutesFromNow(selectedReservation, now) ?? 9999) <= -10 && (
                  <button type="button" onClick={() => onNoShow(selectedReservation)} className="rounded-xl border border-red-300/25 bg-red-500/15 px-4 py-3 text-sm font-semibold text-red-100">
                    {text.noShow}
                  </button>
                )}
                {selectedReservation.isArrived ? (
                  <>
                    {selectedReservationNeedsClaim ? (
                      <button type="button" onClick={() => claimSelectedReservation(selectedReservation)} className="rounded-xl border border-[#f2d39a]/35 bg-[#c9a56a]/20 px-4 py-3 text-sm font-semibold text-[#ffe3a6]">
                        {language === "bg" ? "Вземи маса" : "Take table"}
                      </button>
                    ) : (
                      <>
                        {diningEnabled && (
                          <button type="button" onClick={openConsumptionPanel} className="rounded-xl border border-emerald-300/25 bg-emerald-400/15 px-4 py-3 text-sm font-semibold text-emerald-100">
                            {text.consumption}
                          </button>
                        )}
                        <button type="button" onClick={() => onRelease(selectedReservation)} className="rounded-xl border border-sky-300/25 bg-sky-400/15 px-4 py-3 text-sm font-semibold text-sky-100">
                          {text.release}
                        </button>
                      </>
                    )}
                  </>
                ) : (
                  <a href={`tel:${selectedReservation.phone}`} className="ghost-button rounded-xl px-4 py-3 text-center text-sm font-semibold">
                    {text.call}
                  </a>
                )}
                {onOpenReservation && (
                  <button type="button" onClick={() => onOpenReservation(selectedReservation)} className="ghost-button rounded-xl px-4 py-3 text-sm font-semibold">
                    {text.openReservation}
                  </button>
                )}
              </div>

              {moveReservationId === selectedReservation.id && (
                <div ref={movePanelRef} className="mt-4 scroll-mt-28 rounded-2xl border border-[#c9a56a]/18 bg-[#c9a56a]/10 p-4">
                  <div className="section-kicker">{text.moveTitle}</div>
                  <label className="mt-3 block text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
                    {text.guests}
                  </label>
                  <div className="mt-2 grid grid-cols-[44px_minmax(0,1fr)_44px] overflow-hidden rounded-2xl border border-white/10 bg-black/25">
                    <button
                      type="button"
                      onClick={() => updateMoveGuestCount(Number(moveDraft.guestCount || 1) - 1)}
                      className="border-r border-white/10 px-3 py-3 text-lg font-semibold text-[#f2d39a] transition hover:bg-white/5"
                      aria-label="Decrease guests"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min="1"
                      max="40"
                      value={moveDraft.guestCount || 1}
                      onChange={(event) => updateMoveGuestCount(event.target.value)}
                      className="w-full bg-transparent px-3 py-3 text-center text-base font-semibold text-[#fff4df] outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => updateMoveGuestCount(Number(moveDraft.guestCount || 1) + 1)}
                      className="border-l border-white/10 px-3 py-3 text-lg font-semibold text-[#f2d39a] transition hover:bg-white/5"
                      aria-label="Increase guests"
                    >
                      +
                    </button>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
                    {areas.map(([area, label]) => (
                      <button
                        key={area}
                        type="button"
                        onClick={() => {
                          setMoveDraft((prev) => ({ ...prev, area, tableIds: [] }));
                          onAreaChange(area);
                        }}
                        className={`rounded-xl border px-3 py-2 text-left text-xs font-semibold transition ${
                          moveDraft.area === area
                            ? "border-[#f2d39a]/50 bg-[#c9a56a]/20 text-[#f2d39a]"
                            : "border-white/10 bg-black/20 text-white/65"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 rounded-2xl border border-white/10 bg-black/18 p-3">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#f2d39a]">
                      {text.bestOptions}
                    </div>
                    {moveCandidateOptions.length === 0 ? (
                      <p className="mt-2 text-xs leading-5 text-white/55">{text.noMoveOptions}</p>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {moveCandidateOptions.slice(0, 6).map((option, index) => (
                          <button
                            key={option.tableIds.join("-")}
                            type="button"
                            onClick={() => setMoveDraft((prev) => ({ ...prev, tableIds: option.tableIds }))}
                            className={`rounded-xl border px-3 py-2 text-left text-xs font-semibold transition ${
                              index === 0
                                ? "move-table-suggestion border-[#f2d39a]/60 bg-[#c9a56a]/20 text-[#fff4df]"
                                : "border-white/10 bg-white/[0.035] text-white/70 hover:border-[#c9a56a]/40 hover:text-white"
                            }`}
                          >
                            <span className="block">{option.tableIds.join(", ")}</span>
                            <span className="mt-0.5 block text-[10px] font-medium opacity-65">
                              {option.capacity} {text.guests}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="mt-3">
                    <TableChipSelector
                      area={moveDraft.area}
                      selectedTableIds={moveDraft.tableIds}
                      onToggle={toggleMoveTable}
                      unavailableTableIds={moveUnavailableTableIds}
                      hideUnavailable
                      requiredSeats={Number(moveDraft.guestCount || selectedReservation.guestCount || 0)}
                      unrestrictedSelection
                      tableIdsOverride={moveAreaTables.map((table) => table.id)}
                      areaTables={moveAreaTables}
                      suggestedTableIds={moveSuggestedTableIds}
                      bestTableIds={moveBestTableIds}
                      emptyMessage={
                        text.empty
                      }
                    />
                  </div>
                  <button
                    type="button"
                    onClick={saveMove}
                    className="luxury-button mt-4 w-full rounded-xl px-4 py-3 text-sm font-semibold"
                  >
                    {text.saveMove}
                  </button>
                </div>
              )}

              {diningEnabled && showConsumption && selectedReservation.isArrived && typeof document !== "undefined" && createPortal((
                <div
                  className="fixed inset-0 z-[9999] overflow-y-auto bg-black/72 p-2 backdrop-blur-md sm:p-3 md:p-4"
                  role="dialog"
                  aria-modal="true"
                >
                  <div
                    ref={consumptionPanelRef}
                    className="mx-auto flex min-h-[calc(100svh-1rem)] w-full max-w-5xl min-w-0 flex-col overflow-hidden rounded-[22px] border border-emerald-300/20 bg-[#15110e] shadow-[0_32px_120px_rgba(0,0,0,0.72)] sm:min-h-[calc(100svh-1.5rem)] md:min-h-0 md:h-[min(760px,calc(100svh-2rem))] md:rounded-[26px]"
                  >
                    <div className="shrink-0 border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-3 md:p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="section-kicker">{text.consumption}</div>
                          <div className="mt-1 truncate text-base font-semibold text-[#fff4df] sm:text-lg md:text-2xl">
                            {selectedReservation.guestName} · {formatEuroAmount(selectedConsumptionTotal)}
                          </div>
                          <div className="mt-1 text-xs text-white/45">
                            {selectedReservation.tableIds.join(", ")} · {selectedReservation.guestCount} {text.guests}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowConsumption(false)}
                          className="shrink-0 rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-semibold text-white/75 transition hover:border-white/25 hover:text-white sm:px-4"
                        >
                          {text.close}
                        </button>
                      </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-hidden p-2.5 sm:p-3 md:p-4">
                      <div className="grid h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] gap-2.5 sm:gap-3 lg:grid-cols-[minmax(280px,0.78fr)_minmax(0,1.22fr)] lg:grid-rows-1">
                        <div className="min-h-0 min-w-0 overflow-y-auto rounded-2xl border border-white/10 bg-black/20 p-2.5 sm:p-3 md:p-4 lg:overflow-visible">
                          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f2d39a] sm:text-xs">
                            {language === "bg" ? "Текуща консумация" : "Current consumption"}
                          </div>
                          {selectedConsumptionItems.length === 0 ? (
                            <p className="text-sm leading-6 text-white/55">{text.noConsumption}</p>
                          ) : (
                            <div className="space-y-1.5 pr-1">
	                              {selectedConsumptionItems.map((item) => (
	                                <div
	                                  key={`${item.orderId}-${item.id}`}
	                                  className={`rounded-xl border p-2.5 ${
	                                    item.source === "GuestOnline" && !item.waiterSeenAtUtc
	                                      ? "waiter-new-dish border-amber-300/35 bg-amber-400/12"
	                                      : item.status === "Ready"
	                                      ? "waiter-ready-dish border-emerald-300/35 bg-emerald-400/12"
	                                      : "border-white/10 bg-black/22"
	                                  }`}
	                                >
	                                  <div className="flex items-center justify-between gap-3">
	                                    <div className="min-w-0">
	                                      <div className="truncate text-sm font-semibold text-[#fff4df]">{item.name}</div>
	                                      <div className="text-xs text-white/45">
	                                        {formatEuroAmount(item.unitPrice)} · {formatEuroAmount(item.unitPrice * item.quantity)}
	                                      </div>
	                                      <div className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
	                                        item.source === "GuestOnline" && !item.waiterSeenAtUtc
	                                          ? "border-amber-300/35 bg-amber-400/12 text-amber-100"
	                                          : item.status === "Ready"
	                                          ? "border-emerald-300/30 bg-emerald-400/15 text-emerald-100"
	                                          : "border-white/10 bg-black/25 text-white/50"
	                                      }`}>
	                                        {getDiningItemStatusLabel(item, language)}
	                                      </div>
	                                    </div>
                                    <div className="flex shrink-0 items-center overflow-hidden rounded-full border border-white/10">
                                      <button type="button" onClick={() => onUpdateConsumptionItem(item.id, item.quantity - 1)} className="px-2.5 py-1 text-[#f2d39a]">-</button>
                                      <span className="min-w-8 text-center text-sm text-white/80">{item.quantity}</span>
                                      <button type="button" onClick={() => onUpdateConsumptionItem(item.id, item.quantity + 1)} className="px-2.5 py-1 text-[#f2d39a]">+</button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-emerald-300/16 bg-emerald-400/8 p-2.5 sm:p-3 md:p-4">
                          <div className="mb-2 shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f2d39a] sm:text-xs">
                            {text.addConsumption}
                          </div>
                          <div className="-mx-1 mb-2 flex max-w-full shrink-0 snap-x gap-2 overflow-x-auto px-1 pb-1">
                            {[
                              { id: "all", label: text.allDishes || "All", count: menuItems.filter((item) => (getValue(item, "isActive") ?? true) === true).length },
                              ...consumptionMenuGroups.map((group) => ({ ...group, count: group.items.length })),
                            ].map((category) => (
                              <button
                                key={category.id}
                                type="button"
                                onClick={() => {
                                  setConsumptionCategory(category.id);
                                  setConsumptionSearch("");
                                }}
                                className={`min-w-[7.5rem] snap-start rounded-2xl border px-3 py-2 text-left transition active:scale-[0.98] ${
                                  consumptionCategory === category.id
                                    ? "border-[#f2d39a]/60 bg-[#c9a56a]/24 text-[#fff4df]"
                                    : "border-white/10 bg-black/22 text-white/68 hover:border-[#c9a56a]/35"
                                }`}
                              >
                                <span className="block truncate text-xs font-semibold sm:text-sm">{category.label}</span>
                                <span className="mt-0.5 block text-[10px] text-white/45 sm:text-[11px]">
                                  {category.count} {language === "bg" ? "позиции" : "items"}
                                </span>
                              </button>
                            ))}
                          </div>
                          <input
                            value={consumptionSearch}
                            onChange={(event) => setConsumptionSearch(event.target.value)}
                            placeholder={text.searchDish}
                            className="mb-2 w-full shrink-0 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 focus:border-[#f2d39a]/50"
                          />
                          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
                            {filteredConsumptionMenuItems.length === 0 ? (
                              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-4 text-sm text-white/55">
                                {language === "bg" ? "Няма намерени ястия." : "No dishes found."}
                              </div>
                            ) : filteredConsumptionMenuItems.map((item) => {
                                const name = getMenuItemName(item, language);
                                const price = Number(getValue(item, "price") || 0);
                                const imageUrl = getValue(item, "imageUrl") || "";
                                const weight = getValue(item, "weight") || "";
                                return (
                                  <button
                                    key={getValue(item, "id") || name}
                                    type="button"
                                    onClick={() => onAddConsumptionItem(selectedReservation.id, {
                                      menuItemId: getValue(item, "id"),
                                      name,
                                      unitPrice: price,
                                      kind: getMenuItemKind(item),
                                      quantity: 1,
                                    })}
                                    className="flex w-full min-w-0 items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.035] p-2 text-left transition hover:border-[#c9a56a]/40 active:scale-[0.99]"
                                  >
                                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/25 sm:h-14 sm:w-14">
                                      {imageUrl ? (
                                        <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                                      ) : (
                                        <div className="flex h-full w-full items-center justify-center text-[9px] font-semibold uppercase tracking-[0.18em] text-[#f2d39a]/70">
                                          Casa
                                        </div>
                                      )}
                                    </div>
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-sm font-semibold text-white/86">{name}</span>
                                      <span className="mt-0.5 block text-xs text-white/45">
                                        {weight ? `${weight} · ` : ""}{formatEuroAmount(price)}
                                      </span>
                                    </span>
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#f2d39a]/25 bg-[#c9a56a]/14 text-lg font-semibold text-[#f2d39a]">
                                      +
                                    </span>
                                  </button>
                                );
                              })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ), document.body)}
            </div>
          )}
          {walkInDraft && typeof document !== "undefined" && createPortal((
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/72 p-4 backdrop-blur-md" role="dialog" aria-modal="true">
              <form
                onSubmit={submitWalkInModal}
                className="w-full max-w-md overflow-hidden rounded-[28px] border border-emerald-300/20 bg-[#15110e] shadow-[0_32px_120px_rgba(0,0,0,0.72)]"
              >
                <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_38%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-5">
                  <div className="section-kicker">
                    {language === "bg" ? "Настаняване" : "Walk-in"}
                  </div>
                  <h3 className="mt-2 text-2xl font-semibold text-[#fff4df]">
                    {language === "bg" ? `Маса ${walkInDraft.tableId}` : `Table ${walkInDraft.tableId}`}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-white/55">
                    {language === "bg"
                      ? "Въведете броя гости. Резервацията ще бъде създадена без клиентски данни и ще е готова за консумация."
                      : "Enter guest count. The table will be seated without customer details and ready for consumption."}
                  </p>
                </div>

                <div className="p-5">
                  <label className="text-sm font-semibold text-white/70">
                    {language === "bg" ? "Брой гости" : "Guests"}
                    <div className="mt-3 flex items-center overflow-hidden rounded-2xl border border-white/10 bg-black/25">
                      <button
                        type="button"
                        onClick={() => setWalkInDraft((prev) => ({ ...prev, guestCount: Math.max(1, Number(prev.guestCount || 1) - 1) }))}
                        className="h-14 w-14 text-xl font-semibold text-[#f2d39a]"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min="1"
                        max="40"
                        value={walkInDraft.guestCount}
                        onChange={(event) =>
                          setWalkInDraft((prev) => ({
                            ...prev,
                            guestCount: Math.max(1, Math.min(40, Number(event.target.value || 1))),
                          }))
                        }
                        className="h-14 min-w-0 flex-1 bg-transparent text-center text-2xl font-semibold text-white outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setWalkInDraft((prev) => ({ ...prev, guestCount: Math.min(40, Number(prev.guestCount || 1) + 1) }))}
                        className="h-14 w-14 text-xl font-semibold text-[#f2d39a]"
                      >
                        +
                      </button>
                    </div>
                  </label>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={closeWalkInModal}
                      className="ghost-button rounded-2xl px-4 py-3 text-sm font-semibold"
                    >
                      {text.close}
                    </button>
                    <button className="luxury-button rounded-2xl px-4 py-3 text-sm font-semibold">
                      {language === "bg" ? "Настани" : "Seat"}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          ), document.body)}
        </div>
      </div>
    </Panel>
  );
}

function normalizeReservation(r) {
  const tables = getValue(r, "tableIds") || getValue(r, "tables") || [];

  return {
    id: getValue(r, "id"),
    guestName: getValue(r, "guestName") || "—",
    phone: getValue(r, "phone") || "—",
    email: getValue(r, "email") || "",
    guestCount: getValue(r, "guestCount") || 0,
    area: getValue(r, "area") || "—",
    reservedDate: getValue(r, "reservedDate") || "—",
    reservedTime: getValue(r, "reservedTime") || "—",
    notes: getValue(r, "notes") || "",
    internalNote: getValue(r, "internalNote") || "",
    status: getValue(r, "status") || "Pending",
    createdAtUtc: getValue(r, "createdAtUtc"),
    birthDate: getValue(r, "birthDate"),
    marketingConsent: Boolean(getValue(r, "marketingConsent")),
    privacyConsent: Boolean(getValue(r, "privacyConsent")),
    isBlacklisted: Boolean(getValue(r, "isBlacklisted")),
    isRegularCustomer: Boolean(getValue(r, "isRegularCustomer")),
    isArrived: Boolean(getValue(r, "isArrived")),
    isNoShow: Boolean(getValue(r, "isNoShow")),
    createdByAdmin: Boolean(getValue(r, "createdByAdmin")),
    createdByAdminUserId: getValue(r, "createdByAdminUserId"),
    createdByAdminName: getValue(r, "createdByAdminName") || "",
    isWalkIn: Boolean(getValue(r, "isWalkIn")),
    tableIds: Array.isArray(tables)
      ? tables.map((x) => (typeof x === "string" ? x : x.tableCode || x.TableCode)).filter(Boolean)
      : [],
  };
}

function normalizeDiningOrder(order) {
  const reservation = getValue(order, "reservation") || {};
  const items = getValue(order, "items") || [];

  return {
    id: getValue(order, "id"),
    reservationId: getValue(order, "reservationId"),
    guestName: getValue(order, "guestName") || "—",
    tableLabel: getValue(order, "tableLabel") || "—",
    status: getValue(order, "status") || "New",
    source: getValue(order, "source") || "GuestOnline",
    assignedWaiterId: getValue(order, "assignedWaiterId"),
    assignedWaiterName: getValue(order, "assignedWaiterName") || "",
    claimedAtUtc: getValue(order, "claimedAtUtc"),
    totalPrice: Number(getValue(order, "totalPrice") || 0),
    notes: getValue(order, "notes") || "",
    createdAtUtc: getValue(order, "createdAtUtc"),
    reservation: {
      phone: getValue(reservation, "phone") || "",
      email: getValue(reservation, "email") || "",
      reservedDate: getValue(reservation, "reservedDate") || "",
      reservedTime: getValue(reservation, "reservedTime") || "",
      isWalkIn: Boolean(getValue(reservation, "isWalkIn")),
      tableIds: getValue(reservation, "tableIds") || [],
    },
    items: Array.isArray(items)
      ? items.map((item) => ({
          id: getValue(item, "id"),
          name: getValue(item, "name") || "—",
          unitPrice: Number(getValue(item, "unitPrice") || 0),
          quantity: Number(getValue(item, "quantity") || 0),
          notes: getValue(item, "notes") || "",
          status: getValue(item, "status") || "New",
          source: getValue(item, "source") || getValue(order, "source") || "GuestOnline",
          kind: getValue(item, "kind") || "Dish",
          waiterSeenAtUtc: getValue(item, "waiterSeenAtUtc"),
        }))
      : [],
  };
}

function formatEuroAmount(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function getDiningItemStatusLabel(status, language) {
  if (typeof status === "object" && status?.kind === "WaiterCall") {
    return language === "bg" ? "Повикан сервитьор" : "Waiter called";
  }
  if (typeof status === "object" && status?.kind === "BillRequest") {
    return language === "bg" ? "Иска сметка" : "Bill requested";
  }

  const normalizedStatus = typeof status === "string" ? status : status?.status;
  const labels = {
    New: language === "bg" ? "Чака кухня" : "Waiting kitchen",
    Seen: language === "bg" ? "Видяно от кухня" : "Seen by kitchen",
    Preparing: language === "bg" ? "Приготвя се" : "Preparing",
    Ready: language === "bg" ? "Готово от кухнята" : "Ready from kitchen",
    Done: language === "bg" ? "Сервирано" : "Served",
    Cancelled: language === "bg" ? "Отказано" : "Cancelled",
  };

  return labels[normalizedStatus] || normalizedStatus || labels.New;
}

function hasReadyDiningItems(order) {
  return (order.items || []).some((item) => item.status === "Ready");
}

function hasNewDiningItems(order) {
  return (order.items || []).some((item) => item.status === "New");
}

function hasUnseenGuestItems(order) {
  return (order.items || []).some((item) => item.source === "GuestOnline" && !item.waiterSeenAtUtc);
}

function hasWaiterAttentionItems(order) {
  return hasUnseenGuestItems(order) || hasReadyDiningItems(order);
}

function formatBirthday(value, language) {
  if (!value) return "—";

  const [, month, day] = String(value).split("-");
  if (!month || !day) return value;

  if (language === "bg") {
    return `${day}.${month}`;
  }

  const monthLabel = {
    "01": "January",
    "02": "February",
    "03": "March",
    "04": "April",
    "05": "May",
    "06": "June",
    "07": "July",
    "08": "August",
    "09": "September",
    "10": "October",
    "11": "November",
    "12": "December",
  }[month] || month;
  return `${Number(day)} ${monthLabel}`;
}

function StatCard({ label, value, hint }) {
  return (
    <div className="luxury-panel rounded-[22px] p-5">
      <div className="text-sm text-stone-400">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-[#fff4df]">{value}</div>
      {hint && <div className="mt-2 text-xs text-stone-500">{hint}</div>}
    </div>
  );
}

function StatusBadge({ status }) {
  const styles = {
    Pending: "border-amber-400/25 bg-amber-400/15 text-amber-300",
    Approved: "border-emerald-400/25 bg-emerald-400/15 text-emerald-300",
    Cancelled: "border-red-400/25 bg-red-400/15 text-red-300",
    Released: "border-sky-300/25 bg-sky-400/15 text-sky-200",
  };

  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-medium ${styles[status] || styles.Pending}`}>
      {status}
    </span>
  );
}

function RefreshIcon({ className = "h-5 w-5" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M20 11a8 8 0 0 0-14.2-4.9" />
      <path d="M5 3v4.8h4.8" />
      <path d="M4 13a8 8 0 0 0 14.2 4.9" />
      <path d="M19 21v-4.8h-4.8" />
    </svg>
  );
}

function ThemeIcon({ theme, className = "h-5 w-5" }) {
  const isLight = theme === "light";

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {isLight ? (
        <>
          <path d="M21 14.2A8.2 8.2 0 0 1 9.8 3a7 7 0 1 0 11.2 11.2z" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </>
      )}
    </svg>
  );
}

function MarketingModule({ adminLanguage, adminFetch }) {
  const [settings, setSettings] = React.useState(null);
  const [stats, setStats] = React.useState(null);
  const [preview, setPreview] = React.useState(null);
  const [notice, setNotice] = React.useState("");
  const [error, setError] = React.useState("");

  const text = {
    bg: {
      title: "Маркетинг",
      subtitle: "Автоматични кампании за рожден ден, редовни гости и връщане на гости. Работи и в Basic, и в Pro.",
      birthday: "Рожден ден",
      loyalty: "Редовен гост",
      winback: "Върни гост",
      enabled: "Активна кампания",
      discount: "Отстъпка %",
      daysBefore: "Дни преди рожден ден",
      windowDays: "Период дни",
      requiredVisits: "Нужни посещения",
      absenceDays: "Дни без посещение",
      historyDays: "История дни",
      minVisits: "Мин. посещения в историята",
      subject: "Тема на имейла",
      html: "Съобщение",
      save: "Запази маркетинга",
      preview: "Провери кандидати",
      run: "Изпрати сега",
      subscribers: "Абонати",
      sent: "Изпратени писма",
      candidates: "Кандидати",
      placeholders: "В текста може да използвате име, процент, дата и име на ресторанта.",
      tokens: "Бързи променливи",
      warning: "Реалното изпращане ще изпрати писма към всички кандидати, които още не са получавали тази кампания за тази дата.",
    },
    en: {
      title: "Marketing",
      subtitle: "Automated birthday, loyal guest, and win-back campaigns. Available in Basic and Pro.",
      birthday: "Birthday",
      loyalty: "Loyal guest",
      winback: "Win back",
      enabled: "Campaign enabled",
      discount: "Discount %",
      daysBefore: "Days before birthday",
      windowDays: "Window days",
      requiredVisits: "Required visits",
      absenceDays: "Days absent",
      historyDays: "History days",
      minVisits: "Min. visits in history",
      subject: "Email subject",
      html: "Message",
      save: "Save marketing",
      preview: "Preview candidates",
      run: "Send now",
      subscribers: "Subscribers",
      sent: "Emails sent",
      candidates: "Candidates",
      placeholders: "You can use guest name, discount, date, and restaurant name in the text.",
      tokens: "Quick variables",
      warning: "Real sending will email every candidate who has not already received this campaign for this date.",
    },
  }[adminLanguage] || {
    title: "Маркетинг",
    subtitle: "Автоматические кампании для дней рождения, постоянных гостей и возвращения гостей. Доступно в Basic и Pro.",
    birthday: "День рождения",
    loyalty: "Постоянный гость",
    winback: "Вернуть гостя",
    enabled: "Кампания активна",
    discount: "Скидка %",
    daysBefore: "Дней до дня рождения",
    windowDays: "Период дней",
    requiredVisits: "Нужно посещений",
    absenceDays: "Дней без посещения",
    historyDays: "История дней",
    minVisits: "Мин. посещений в истории",
    subject: "Тема письма",
    html: "Сообщение",
    save: "Сохранить маркетинг",
    preview: "Проверить кандидатов",
    run: "Отправить сейчас",
    subscribers: "Подписчики",
    sent: "Отправленные письма",
    candidates: "Кандидаты",
    placeholders: "В тексте можно использовать имя, скидку, дату и название ресторана.",
    tokens: "Быстрые переменные",
    warning: "Реальная отправка отправит письма всем кандидатам, которые ещё не получали эту кампанию на эту дату.",
  };

  const tokenOptions = [
    ["{{guestName}}", adminLanguage === "bg" ? "Име" : "Name"],
    ["{{discountPercent}}%", adminLanguage === "bg" ? "Отстъпка" : "Discount"],
    ["{{restaurantName}}", adminLanguage === "bg" ? "Ресторант" : "Restaurant"],
    ["{{date}}", adminLanguage === "bg" ? "Дата" : "Date"],
  ];

  const campaignMeta = [
    ["birthday", text.birthday, ["discountPercent", "daysBefore"]],
    ["loyalty", text.loyalty, ["discountPercent", "windowDays", "requiredVisits"]],
    ["winback", text.winback, ["discountPercent", "absenceDays", "historyDays", "minVisitsInHistory"]],
  ];

  const fieldLabels = {
    discountPercent: text.discount,
    daysBefore: text.daysBefore,
    windowDays: text.windowDays,
    requiredVisits: text.requiredVisits,
    absenceDays: text.absenceDays,
    historyDays: text.historyDays,
    minVisitsInHistory: text.minVisits,
  };

  const loadSettings = React.useCallback(async () => {
    setError("");
    const response = await adminFetch(`${API_BASE_URL}/api/marketing/settings`);
    if (!response.ok) {
      setError(await readErrorMessage(response, "Failed to load marketing settings."));
      return;
    }
    const data = await response.json();
    setSettings(data.settings || data.Settings);
    setStats(data.stats || data.Stats);
  }, [adminFetch]);

  React.useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  function updateCampaign(campaignKey, field, value) {
    setSettings((previous) => ({
      ...previous,
      [campaignKey]: {
        ...(previous?.[campaignKey] || previous?.[capitalize(campaignKey)] || {}),
        [field]: value,
      },
    }));
  }

  function appendToken(campaignKey, token) {
    const campaign = getCampaign(campaignKey);
    const current = campaign.htmlTemplate ?? campaign.HtmlTemplate ?? "";
    updateCampaign(campaignKey, "htmlTemplate", `${current}${current.endsWith(" ") || current.endsWith("\n") || current.length === 0 ? "" : " "}${token}`);
  }

  async function saveSettings(event) {
    event.preventDefault();
    setNotice("");
    setError("");
    const response = await adminFetch(`${API_BASE_URL}/api/marketing/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    if (!response.ok) {
      setError(await readErrorMessage(response, "Failed to save marketing settings."));
      return;
    }
    setSettings(await response.json());
    setNotice(adminLanguage === "bg" ? "Маркетинг настройките са запазени." : "Marketing settings saved.");
    await loadSettings();
  }

  async function runMarketing(dryRun) {
    setNotice("");
    setError("");
    if (!dryRun && !window.confirm(text.warning)) return;

    const response = await adminFetch(`${API_BASE_URL}/api/marketing/run?dryRun=${dryRun ? "true" : "false"}`, { method: "POST" });
    if (!response.ok) {
      setError(await readErrorMessage(response, "Marketing run failed."));
      return;
    }
    const data = await response.json();
    setPreview(data);
    setNotice(dryRun
      ? (adminLanguage === "bg" ? "Проверката е готова." : "Preview ready.")
      : (adminLanguage === "bg" ? `Изпратени писма: ${data.sent ?? data.Sent ?? 0}` : `Emails sent: ${data.sent ?? data.Sent ?? 0}`));
    await loadSettings();
  }

  function getCampaign(key) {
    return settings?.[key] || settings?.[capitalize(key)] || {};
  }

  if (!settings) {
    return (
      <Panel title={text.title} subtitle={text.subtitle}>
        <div className="rounded-3xl border border-white/10 bg-black/20 p-6 text-white/50">Loading...</div>
      </Panel>
    );
  }

  return (
    <Panel title={text.title} subtitle={text.subtitle}>
      <form onSubmit={saveSettings} className="space-y-5">
        {(notice || error) && (
          <div className={`rounded-2xl border px-4 py-3 text-sm ${error ? "border-red-300/30 bg-red-500/15 text-red-100" : "border-emerald-300/25 bg-emerald-500/12 text-emerald-100"}`}>
            {error || notice}
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
            <div className="section-kicker">{text.subscribers}</div>
            <div className="mt-3 text-3xl font-semibold text-[#fff4df]">{stats?.subscribers ?? stats?.Subscribers ?? 0}</div>
          </div>
          <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
            <div className="section-kicker">{text.sent}</div>
            <div className="mt-3 text-3xl font-semibold text-[#fff4df]">{stats?.totalSent ?? stats?.TotalSent ?? 0}</div>
          </div>
          <div className="rounded-[24px] border border-[#c9a56a]/20 bg-[#c9a56a]/10 p-4 text-sm text-[#f2d39a]">
            {text.placeholders}
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-3">
          {campaignMeta.map(([key, label, fields]) => {
            const campaign = getCampaign(key);
            return (
              <div key={key} className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <div className="section-kicker">{label}</div>
                    <div className="mt-2 text-sm text-white/45">{text.placeholders}</div>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-white/70">
                    <input type="checkbox" checked={Boolean(campaign.enabled ?? campaign.Enabled)} onChange={(event) => updateCampaign(key, "enabled", event.target.checked)} />
                    {text.enabled}
                  </label>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  {fields.map((field) => (
                    <label key={field} className="block">
                      <span className="mb-1 block text-xs text-white/45">{fieldLabels[field]}</span>
                      <input type="number" step="1" value={campaign[field] ?? campaign[capitalize(field)] ?? ""} onChange={(event) => updateCampaign(key, field, Number(event.target.value || 0))} className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300" />
                    </label>
                  ))}
                </div>

                <label className="mt-4 block">
                  <span className="mb-1 block text-xs text-white/45">{text.subject}</span>
                  <input value={campaign.subject ?? campaign.Subject ?? ""} onChange={(event) => updateCampaign(key, "subject", event.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300" />
                </label>

                <label className="mt-4 block">
                  <span className="mb-1 block text-xs text-white/45">{text.html}</span>
                  <textarea rows={7} value={campaign.htmlTemplate ?? campaign.HtmlTemplate ?? ""} onChange={(event) => updateCampaign(key, "htmlTemplate", event.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-relaxed outline-none focus:border-amber-300" />
                </label>

                <div className="mt-3">
                  <div className="mb-2 text-xs text-white/45">{text.tokens}</div>
                  <div className="flex flex-wrap gap-2">
                    {tokenOptions.map(([token, label]) => (
                      <button
                        key={token}
                        type="button"
                        onClick={() => appendToken(key, token)}
                        className="rounded-full border border-[#c9a56a]/25 bg-[#c9a56a]/10 px-3 py-1.5 text-xs font-semibold text-[#f2d39a] transition hover:border-[#f2d39a]/45 hover:bg-[#c9a56a]/18"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2">
          <button className="luxury-button rounded-2xl px-5 py-3 text-sm font-semibold">{text.save}</button>
          <button type="button" onClick={() => runMarketing(true)} className="ghost-button rounded-2xl px-5 py-3 text-sm font-semibold">{text.preview}</button>
          <button type="button" onClick={() => runMarketing(false)} className="rounded-2xl border border-emerald-300/25 bg-emerald-400/15 px-5 py-3 text-sm font-semibold text-emerald-100">{text.run}</button>
        </div>

        {preview && (
          <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
            <div className="section-kicker">{text.candidates}: {preview.candidates ?? preview.Candidates ?? 0}</div>
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {(preview.preview || preview.Preview || []).map((item, index) => (
                <div key={`${item.email || item.Email}-${index}`} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="font-semibold text-[#fff4df]">{item.guestName || item.GuestName || "—"}</div>
                  <div className="mt-1 text-sm text-white/45">{item.email || item.Email}</div>
                  <div className="mt-3 rounded-full border border-[#c9a56a]/25 bg-[#c9a56a]/10 px-3 py-1 text-xs font-semibold text-[#f2d39a]">
                    {item.campaignKey || item.CampaignKey} · {item.discountPercent ?? item.DiscountPercent}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </form>
    </Panel>
  );
}

function capitalize(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function MaintenanceModule({ adminLanguage, adminFetch, loadReservations, loadDiningOrders, isProVersion = false }) {
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
                <input
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
                <input
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
                <input
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
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={text.reason} rows={3} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300" />
              <div className="grid gap-3 md:grid-cols-2">
                <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300" aria-label={text.from} />
                <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300" aria-label={text.to} />
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

function InventoryModule({ adminLanguage, adminFetch, menuItems, loadMenuItems }) {
  const [section, setSection] = React.useState("items");
  const [items, setItems] = React.useState([]);
  const [movements, setMovements] = React.useState([]);
  const [audits, setAudits] = React.useState([]);
  const [recipeSummary, setRecipeSummary] = React.useState([]);
  const [selectedMenuItemId, setSelectedMenuItemId] = React.useState("");
  const [recipe, setRecipe] = React.useState(null);
  const [recipeLines, setRecipeLines] = React.useState([]);
  const [selectedAuditId, setSelectedAuditId] = React.useState("");
  const [selectedAudit, setSelectedAudit] = React.useState(null);
  const [auditLines, setAuditLines] = React.useState([]);
  const [auditSearch, setAuditSearch] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState("all");
  const [movementTypeFilter, setMovementTypeFilter] = React.useState("all");
  const [notice, setNotice] = React.useState("");
  const [error, setError] = React.useState("");
  const [itemForm, setItemForm] = React.useState({
    name: "",
    category: "",
    unit: "g",
    currentQuantity: "",
    minimumQuantity: "",
    unitCost: "",
    isActive: true,
  });
  const [editingItemId, setEditingItemId] = React.useState(null);
  const [adjustment, setAdjustment] = React.useState({
    inventoryItemId: "",
    quantity: "",
    type: "Receipt",
    comment: "",
  });

  const tr = {
    bg: {
      title: "Склад",
      subtitle: "Ингредиенти, рецептури, движения, ревизии и себестойност. Само за Pro версия.",
      items: "Ингредиенти",
      recipes: "Рецептури",
      movements: "Движения",
      audits: "Ревизии",
      low: "Ниски остатъци",
      name: "Име",
      category: "Категория",
      unit: "Мярка",
      stock: "Остатък",
      min: "Мин.",
      cost: "Себестойност",
      active: "Активен",
      save: "Запази",
      add: "Добави",
      edit: "Редактирай",
      cancel: "Откажи",
      receipt: "Приход",
      adjustment: "Корекция",
      waste: "Брак",
      comment: "Коментар",
      menuItem: "Позиция от менюто",
      ingredient: "Ингредиент",
      quantity: "Количество",
      recipeCost: "Себестойност",
      salePrice: "Продажна цена",
      margin: "Марж",
      foodCost: "Food cost",
      createAudit: "Създай ревизия",
      confirmAudit: "Потвърди ревизия",
      actual: "Фактически остатък",
      expected: "Очакван",
      diff: "Разлика",
      seed: "Създай тестови рецепти",
      allCategories: "Всички категории",
      dashboard: "Контролен център",
      deactivate: "Деактивирай",
      activate: "Активирай",
      deleteRecipe: "Изтрий рецепта",
      exportAudit: "Експорт CSV",
      saveDraft: "Запази чернова",
      deleteAudit: "Изтрий ревизия",
      recipeReady: "Готова",
      recipeMissing: "Липсва",
      recipeAttention: "За преглед",
    },
    en: {
      title: "Inventory",
      subtitle: "Ingredients, recipes, movements, audits, and food cost. Pro only.",
      items: "Ingredients",
      recipes: "Recipes",
      movements: "Movements",
      audits: "Audits",
      low: "Low stock",
      name: "Name",
      category: "Category",
      unit: "Unit",
      stock: "Stock",
      min: "Min.",
      cost: "Unit cost",
      active: "Active",
      save: "Save",
      add: "Add",
      edit: "Edit",
      cancel: "Cancel",
      receipt: "Receipt",
      adjustment: "Adjustment",
      waste: "Waste",
      comment: "Comment",
      menuItem: "Menu item",
      ingredient: "Ingredient",
      quantity: "Quantity",
      recipeCost: "Recipe cost",
      salePrice: "Sale price",
      margin: "Margin",
      foodCost: "Food cost",
      createAudit: "Create audit",
      confirmAudit: "Confirm audit",
      actual: "Actual stock",
      expected: "Expected",
      diff: "Difference",
      seed: "Create test recipes",
      allCategories: "All categories",
      dashboard: "Control center",
      deactivate: "Deactivate",
      activate: "Activate",
      deleteRecipe: "Delete recipe",
      exportAudit: "Export CSV",
      saveDraft: "Save draft",
      deleteAudit: "Delete audit",
      recipeReady: "Ready",
      recipeMissing: "Missing",
      recipeAttention: "Needs review",
    },
  }[adminLanguage] || {
    title: "Склад",
    subtitle: "Ингредиенты, рецептуры, движения склада, ревизии и себестоимость блюд.",
    ingredients: "Ингредиенты",
    recipes: "Рецептуры",
    movements: "Движения",
    audits: "Ревизии",
    low: "Низкие остатки",
    active: "Активен",
    inactive: "Неактивен",
    add: "Добавить",
    save: "Сохранить",
    delete: "Удалить",
    receipt: "Приход",
    adjustment: "Корректировка",
    waste: "Списание",
    comment: "Комментарий",
    menuItem: "Позиция меню",
    ingredient: "Ингредиент",
    quantity: "Количество",
    recipeCost: "Себестоимость",
    salePrice: "Цена продажи",
    margin: "Маржа",
    foodCost: "Food cost",
    createAudit: "Создать ревизию",
    confirmAudit: "Подтвердить ревизию",
    actual: "Фактический остаток",
    expected: "Ожидаемый",
    diff: "Разница",
    seed: "Создать тестовые рецептуры",
    allCategories: "Все категории",
    dashboard: "Центр контроля",
    deactivate: "Деактивировать",
    activate: "Активировать",
    deleteRecipe: "Удалить рецептуру",
    exportAudit: "Экспорт CSV",
    saveDraft: "Сохранить черновик",
    deleteAudit: "Удалить ревизию",
    recipeReady: "Готово",
    recipeMissing: "Нет рецептуры",
    recipeAttention: "Нужно проверить",
  };

  const loadItemsViaAdminFetch = React.useCallback(async () => {
    const response = await adminFetch(`${API_BASE_URL}/api/inventory/items`);
    setItems(response.ok ? await response.json() : []);
  }, [adminFetch]);

  const loadMovements = React.useCallback(async () => {
    const response = await adminFetch(`${API_BASE_URL}/api/inventory/movements`);
    setMovements(response.ok ? await response.json() : []);
  }, [adminFetch]);

  const loadAudits = React.useCallback(async () => {
    const response = await adminFetch(`${API_BASE_URL}/api/inventory/audits`);
    setAudits(response.ok ? await response.json() : []);
  }, [adminFetch]);

  const loadRecipeSummary = React.useCallback(async () => {
    const response = await adminFetch(`${API_BASE_URL}/api/recipes/summary`);
    setRecipeSummary(response.ok ? await response.json() : []);
  }, [adminFetch]);

  React.useEffect(() => {
    loadItemsViaAdminFetch();
    loadMovements();
    loadAudits();
    loadRecipeSummary();
    loadMenuItems?.();
  }, [loadAudits, loadItemsViaAdminFetch, loadMenuItems, loadMovements, loadRecipeSummary]);

  React.useEffect(() => {
    async function loadRecipe() {
      if (!selectedMenuItemId) {
        setRecipe(null);
        setRecipeLines([]);
        return;
      }
      const response = await adminFetch(`${API_BASE_URL}/api/recipes/menu-item/${selectedMenuItemId}`);
      if (!response.ok) return;
      const data = await response.json();
      setRecipe(data);
      setRecipeLines((data.lines || data.Lines || []).map((line) => ({
        inventoryItemId: String(line.inventoryItemId || line.InventoryItemId),
        quantity: String(line.quantity || line.Quantity || ""),
        notes: line.notes || line.Notes || "",
      })));
    }
    loadRecipe();
  }, [adminFetch, selectedMenuItemId]);

  async function saveItem(event) {
    event.preventDefault();
    setNotice("");
    setError("");
    const payload = {
      ...itemForm,
      currentQuantity: Number(itemForm.currentQuantity || 0),
      minimumQuantity: Number(itemForm.minimumQuantity || 0),
      unitCost: Number(itemForm.unitCost || 0),
    };
    const response = await adminFetch(`${API_BASE_URL}/api/inventory/items${editingItemId ? `/${editingItemId}` : ""}`, {
      method: editingItemId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      setError(await readErrorMessage(response, "Inventory item failed."));
      return;
    }
    setItemForm({ name: "", category: "", unit: "g", currentQuantity: "", minimumQuantity: "", unitCost: "", isActive: true });
    setEditingItemId(null);
    setNotice(adminLanguage === "bg" ? "Ингредиентът е запазен." : "Ingredient saved.");
    await loadItemsViaAdminFetch();
  }

  async function deleteItem(id) {
    setNotice("");
    setError("");
    const confirmed = window.confirm(
      adminLanguage === "bg"
        ? "Да деактивираме ли ингредиента? Ако няма история, ще бъде изтрит напълно."
        : "Deactivate this ingredient? If it has no history, it will be deleted fully."
    );
    if (!confirmed) return;

    const response = await adminFetch(`${API_BASE_URL}/api/inventory/items/${id}`, { method: "DELETE" });
    if (!response.ok) {
      setError(await readErrorMessage(response, "Ingredient delete failed."));
      return;
    }
    const data = await response.json().catch(() => null);
    setNotice(data?.mode === "Deleted" || data?.Mode === "Deleted"
      ? (adminLanguage === "bg" ? "Ингредиентът е изтрит." : "Ingredient deleted.")
      : (adminLanguage === "bg" ? "Ингредиентът е деактивиран." : "Ingredient deactivated."));
    await Promise.all([loadItemsViaAdminFetch(), loadRecipeSummary()]);
  }

  async function activateItem(id) {
    setNotice("");
    setError("");
    const response = await adminFetch(`${API_BASE_URL}/api/inventory/items/${id}/activate`, { method: "POST" });
    if (!response.ok) {
      setError(await readErrorMessage(response, "Ingredient activation failed."));
      return;
    }
    setNotice(adminLanguage === "bg" ? "Ингредиентът е активиран." : "Ingredient activated.");
    await Promise.all([loadItemsViaAdminFetch(), loadRecipeSummary()]);
  }

  async function saveAdjustment(event) {
    event.preventDefault();
    setNotice("");
    setError("");
    const response = await adminFetch(`${API_BASE_URL}/api/inventory/adjustment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inventoryItemId: Number(adjustment.inventoryItemId),
        quantity: Number(adjustment.quantity || 0),
        type: adjustment.type,
        comment: adjustment.comment,
      }),
    });
    if (!response.ok) {
      setError(await readErrorMessage(response, "Adjustment failed."));
      return;
    }
    setAdjustment({ inventoryItemId: "", quantity: "", type: "Receipt", comment: "" });
    setNotice(adminLanguage === "bg" ? "Движението е записано." : "Movement saved.");
    await Promise.all([loadItemsViaAdminFetch(), loadMovements()]);
  }

  async function saveRecipe(event) {
    event.preventDefault();
    if (!selectedMenuItemId) return;
    const response = await adminFetch(`${API_BASE_URL}/api/recipes/menu-item/${selectedMenuItemId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lines: recipeLines
          .filter((line) => line.inventoryItemId && Number(line.quantity) > 0)
          .map((line) => ({
            inventoryItemId: Number(line.inventoryItemId),
            quantity: Number(line.quantity),
            notes: line.notes,
          })),
      }),
    });
    if (!response.ok) {
      setError(await readErrorMessage(response, "Recipe failed."));
      return;
    }
    const data = await response.json();
    setRecipe(data);
    setNotice(adminLanguage === "bg" ? "Рецептата е запазена." : "Recipe saved.");
    await loadRecipeSummary();
  }

  async function deleteRecipe() {
    if (!selectedMenuItemId) return;
    const confirmed = window.confirm(adminLanguage === "bg" ? "Да изтрием ли рецептурата за тази позиция?" : "Delete this menu item's recipe?");
    if (!confirmed) return;

    const response = await adminFetch(`${API_BASE_URL}/api/recipes/menu-item/${selectedMenuItemId}`, { method: "DELETE" });
    if (!response.ok) {
      setError(await readErrorMessage(response, "Recipe delete failed."));
      return;
    }
    setRecipe(null);
    setRecipeLines([]);
    setNotice(adminLanguage === "bg" ? "Рецептата е изтрита." : "Recipe deleted.");
    await loadRecipeSummary();
  }

  async function createAudit() {
    const response = await adminFetch(`${API_BASE_URL}/api/inventory/audits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: `${tr.audits} ${new Date().toLocaleDateString()}` }),
    });
    if (!response.ok) {
      setError(await readErrorMessage(response, "Audit failed."));
      return;
    }
    setNotice(adminLanguage === "bg" ? "Ревизията е създадена." : "Audit created.");
    const data = await response.json().catch(() => null);
    if (data?.id || data?.Id) {
      setSelectedAuditId(String(data.id || data.Id));
      setSelectedAudit(data);
      setAuditLines((data.lines || data.Lines || []).map(mapAuditLine));
    }
    await loadAudits();
  }

  async function loadAuditDetails(id) {
    setSelectedAuditId(String(id || ""));
    if (!id) {
      setSelectedAudit(null);
      setAuditLines([]);
      return;
    }
    const response = await adminFetch(`${API_BASE_URL}/api/inventory/audits/${id}`);
    if (!response.ok) {
      setError(await readErrorMessage(response, "Audit load failed."));
      return;
    }
    const data = await response.json();
    setSelectedAudit(data);
    setAuditLines((data.lines || data.Lines || []).map(mapAuditLine));
  }

  async function saveAuditDraft() {
    if (!selectedAuditId) return;
    const response = await adminFetch(`${API_BASE_URL}/api/inventory/audits/${selectedAuditId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lines: auditLines.map((line) => ({
          inventoryItemId: Number(line.inventoryItemId),
          actualQuantity: Number(line.actualQuantity || 0),
          comment: line.comment,
        })),
      }),
    });
    if (!response.ok) {
      setError(await readErrorMessage(response, "Audit save failed."));
      return;
    }
    const data = await response.json();
    setSelectedAudit(data);
    setAuditLines((data.lines || data.Lines || []).map(mapAuditLine));
    setNotice(adminLanguage === "bg" ? "Ревизията е запазена като чернова." : "Audit draft saved.");
    await loadAudits();
  }

  async function confirmAudit() {
    if (!selectedAuditId) return;
    const confirmed = window.confirm(adminLanguage === "bg" ? "Да потвърдим ли ревизията и да коригираме склада?" : "Confirm audit and update stock?");
    if (!confirmed) return;
    const response = await adminFetch(`${API_BASE_URL}/api/inventory/audits/${selectedAuditId}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lines: auditLines.map((line) => ({
          inventoryItemId: Number(line.inventoryItemId),
          actualQuantity: Number(line.actualQuantity || 0),
          comment: line.comment,
        })),
      }),
    });
    if (!response.ok) {
      setError(await readErrorMessage(response, "Audit confirm failed."));
      return;
    }
    const data = await response.json();
    setSelectedAudit(data);
    setAuditLines((data.lines || data.Lines || []).map(mapAuditLine));
    setNotice(adminLanguage === "bg" ? "Ревизията е потвърдена и складът е коригиран." : "Audit confirmed and stock corrected.");
    await Promise.all([loadAudits(), loadItemsViaAdminFetch(), loadMovements()]);
  }

  async function deleteAudit() {
    if (!selectedAuditId) return;
    const confirmed = window.confirm(adminLanguage === "bg" ? "Да изтрием ли тази чернова ревизия?" : "Delete this draft audit?");
    if (!confirmed) return;
    const response = await adminFetch(`${API_BASE_URL}/api/inventory/audits/${selectedAuditId}`, { method: "DELETE" });
    if (!response.ok) {
      setError(await readErrorMessage(response, "Audit delete failed."));
      return;
    }
    setSelectedAuditId("");
    setSelectedAudit(null);
    setAuditLines([]);
    setNotice(adminLanguage === "bg" ? "Ревизията е изтрита." : "Audit deleted.");
    await loadAudits();
  }

  async function exportAudit() {
    if (!selectedAuditId) return;
    const response = await adminFetch(`${API_BASE_URL}/api/inventory/audits/${selectedAuditId}/export`);
    if (!response.ok) {
      setError(await readErrorMessage(response, "Audit export failed."));
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `inventory-audit-${selectedAuditId}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function seedTestRecipes() {
    setNotice("");
    setError("");
    const confirmed = window.confirm(
      adminLanguage === "bg"
        ? "Да се създадат ли тестови ингредиенти и рецептури? Съществуващите рецепти няма да се презапишат."
        : "Create test ingredients and recipes? Existing recipes will not be overwritten."
    );
    if (!confirmed) return;

    const response = await adminFetch(`${API_BASE_URL}/api/inventory/seed-test-recipes`, { method: "POST" });
    if (!response.ok) {
      setError(await readErrorMessage(response, "Recipe seed failed."));
      return;
    }
    const result = await response.json();
    setNotice(
      adminLanguage === "bg"
        ? `Готово: ${result.createdIngredients ?? result.CreatedIngredients ?? 0} ингредиента, ${result.createdRecipes ?? result.CreatedRecipes ?? 0} рецепти.`
        : `Done: ${result.createdIngredients ?? result.CreatedIngredients ?? 0} ingredients, ${result.createdRecipes ?? result.CreatedRecipes ?? 0} recipes.`
    );
    await Promise.all([loadItemsViaAdminFetch(), loadMenuItems?.()]);
    await loadRecipeSummary();
    if (selectedMenuItemId) {
      const recipeResponse = await adminFetch(`${API_BASE_URL}/api/recipes/menu-item/${selectedMenuItemId}`);
      if (recipeResponse.ok) setRecipe(await recipeResponse.json());
    }
  }

  const itemCategories = Array.from(new Set(items.map((item) => item.category || item.Category).filter(Boolean))).sort();
  const visibleItems = items.filter((item) => {
    const text = `${item.name || item.Name} ${item.category || item.Category}`.toLowerCase();
    const matchesSearch = !search.trim() || text.includes(search.trim().toLowerCase());
    const matchesCategory = categoryFilter === "all" || (item.category || item.Category) === categoryFilter;
    return matchesSearch && matchesCategory;
  });
  const lowStockItems = items.filter((item) => item.isLowStock || item.IsLowStock);
  const visibleMovements = movements.filter((movement) => movementTypeFilter === "all" || (movement.type || movement.Type) === movementTypeFilter);
  const selectedRecipeMenuItem = menuItems.find((item) => String(item.id || item.Id) === String(selectedMenuItemId));
  const missingRecipeCount = recipeSummary.filter((item) => (item.status || item.Status) !== "Ready").length;
  const inventoryValue = items.reduce((sum, item) => sum + Number(item.currentQuantity ?? item.CurrentQuantity ?? 0) * Number(item.unitCost ?? item.UnitCost ?? 0), 0);
  const filteredAuditLines = auditLines.filter((line) => {
    const term = auditSearch.trim().toLowerCase();
    return !term || `${line.ingredient} ${line.category}`.toLowerCase().includes(term);
  });

  function mapAuditLine(line) {
    return {
      id: line.id || line.Id,
      inventoryItemId: line.inventoryItemId || line.InventoryItemId,
      ingredient: line.ingredient || line.Ingredient || "",
      category: line.category || line.Category || "",
      unit: line.unit || line.Unit || "",
      expectedQuantity: line.expectedQuantity ?? line.ExpectedQuantity ?? 0,
      actualQuantity: line.actualQuantity ?? line.ActualQuantity ?? 0,
      differenceQuantity: line.differenceQuantity ?? line.DifferenceQuantity ?? 0,
      comment: line.comment || line.Comment || "",
    };
  }

  return (
    <Panel title={tr.title} subtitle={tr.subtitle}>
      <div className="space-y-5">
        {(notice || error) && (
          <div className={`rounded-2xl border px-4 py-3 text-sm ${error ? "border-red-300/30 bg-red-500/15 text-red-100" : "border-emerald-300/25 bg-emerald-500/12 text-emerald-100"}`}>
            {error || notice}
          </div>
        )}

        <div className="flex flex-wrap gap-2 rounded-[26px] border border-white/10 bg-black/20 p-2">
          {[
            ["items", tr.items],
            ["recipes", tr.recipes],
            ["movements", tr.movements],
            ["audits", tr.audits],
            ["low", `${tr.low} (${lowStockItems.length})`],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSection(key)}
              className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${section === key ? "luxury-button" : "text-white/70 hover:bg-white/[0.06] hover:text-white"}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            [tr.dashboard, formatEuroAmount(inventoryValue), adminLanguage === "bg" ? "стойност на наличностите" : "stock value"],
            [tr.low, lowStockItems.length, adminLanguage === "bg" ? "артикула под минимум" : "items below minimum"],
            [tr.recipes, recipeSummary.length - missingRecipeCount, adminLanguage === "bg" ? "готови рецептури" : "ready recipes"],
            [tr.recipeAttention, missingRecipeCount, adminLanguage === "bg" ? "липсващи или за преглед" : "missing or needs review"],
          ].map(([label, value, hint]) => (
            <div key={label} className="rounded-[24px] border border-white/10 bg-white/[0.045] p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[#f2d39a]/70">{label}</div>
              <div className="mt-3 text-2xl font-semibold text-[#fff4df]">{value}</div>
              <div className="mt-1 text-xs text-white/40">{hint}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-[#c9a56a]/20 bg-[#c9a56a]/10 p-4">
          <div>
            <div className="text-sm font-semibold text-[#fff4df]">{adminLanguage === "bg" ? "Тестови рецептури" : "Test recipes"}</div>
            <div className="mt-1 text-xs text-white/45">
              {adminLanguage === "bg"
                ? "Запълва склада с примерни ингредиенти и рецепти за текущото меню, без да презаписва съществуващи рецепти."
                : "Fills inventory with sample ingredients and recipes for the current menu without overwriting existing recipes."}
            </div>
          </div>
          <button type="button" onClick={seedTestRecipes} className="luxury-button rounded-2xl px-4 py-3 text-sm font-semibold">
            {tr.seed}
          </button>
        </div>

        {section === "items" && (
          <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
            <form onSubmit={saveItem} className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
              <div className="section-kicker">{editingItemId ? tr.edit : tr.add}</div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <input required placeholder={tr.name} value={itemForm.name} onChange={(e) => setItemForm((p) => ({ ...p, name: e.target.value }))} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300" />
                <input required placeholder={tr.category} value={itemForm.category} onChange={(e) => setItemForm((p) => ({ ...p, category: e.target.value }))} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300" />
                <select value={itemForm.unit} onChange={(e) => setItemForm((p) => ({ ...p, unit: e.target.value }))} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300">
                  {["g", "kg", "ml", "l", "pcs"].map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                </select>
                <input type="number" step="0.001" placeholder={tr.stock} value={itemForm.currentQuantity} onChange={(e) => setItemForm((p) => ({ ...p, currentQuantity: e.target.value }))} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300" />
                <input type="number" step="0.001" placeholder={tr.min} value={itemForm.minimumQuantity} onChange={(e) => setItemForm((p) => ({ ...p, minimumQuantity: e.target.value }))} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300" />
                <input type="number" step="0.0001" placeholder={tr.cost} value={itemForm.unitCost} onChange={(e) => setItemForm((p) => ({ ...p, unitCost: e.target.value }))} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300" />
              </div>
              <label className="mt-4 flex items-center gap-3 text-sm text-white/70">
                <input type="checkbox" checked={itemForm.isActive} onChange={(e) => setItemForm((p) => ({ ...p, isActive: e.target.checked }))} />
                {tr.active}
              </label>
              <div className="mt-5 flex flex-wrap gap-2">
                <button className="luxury-button rounded-2xl px-5 py-3 font-semibold">{tr.save}</button>
                {editingItemId && (
                  <button type="button" onClick={() => { setEditingItemId(null); setItemForm({ name: "", category: "", unit: "g", currentQuantity: "", minimumQuantity: "", unitCost: "", isActive: true }); }} className="ghost-button rounded-2xl px-5 py-3 font-semibold">{tr.cancel}</button>
                )}
              </div>
            </form>

            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
              <div className="mb-4 grid gap-3 md:grid-cols-2">
                <input placeholder={adminLanguage === "bg" ? "Търси ингредиент..." : "Search ingredient..."} value={search} onChange={(e) => setSearch(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300" />
                <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300">
                  <option value="all">{tr.allCategories}</option>
                  {itemCategories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </div>
              <div className="max-h-[620px] space-y-2 overflow-y-auto pr-1">
                {visibleItems.map((item) => (
                  <div key={item.id || item.Id} className={`rounded-2xl border p-3 ${item.isLowStock || item.IsLowStock ? "border-red-300/30 bg-red-500/12" : "border-white/10 bg-black/20"} ${item.isActive === false || item.IsActive === false ? "opacity-55" : ""}`}>
                    <div className="grid grid-cols-[1fr_auto] gap-3">
                    <div>
                      <div className="font-semibold text-[#fff4df]">{item.name || item.Name}</div>
                      <div className="mt-1 text-xs text-white/45">{item.category || item.Category} · {item.isActive === false || item.IsActive === false ? (adminLanguage === "bg" ? "неактивен" : "inactive") : tr.active}</div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="text-[#f2d39a]">{item.currentQuantity ?? item.CurrentQuantity} {item.unit || item.Unit}</div>
                      <div className="text-white/45">{formatEuroAmount(item.unitCost ?? item.UnitCost ?? 0)} / {item.unit || item.Unit}</div>
                    </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => { setEditingItemId(item.id || item.Id); setItemForm({ name: item.name || item.Name || "", category: item.category || item.Category || "", unit: item.unit || item.Unit || "g", currentQuantity: item.currentQuantity ?? item.CurrentQuantity ?? 0, minimumQuantity: item.minimumQuantity ?? item.MinimumQuantity ?? 0, unitCost: item.unitCost ?? item.UnitCost ?? 0, isActive: item.isActive ?? item.IsActive ?? true }); }} className="ghost-button rounded-xl px-3 py-2 text-xs font-semibold">
                        {tr.edit}
                      </button>
                      {item.isActive === false || item.IsActive === false ? (
                        <button type="button" onClick={() => activateItem(item.id || item.Id)} className="rounded-xl border border-emerald-300/25 bg-emerald-400/15 px-3 py-2 text-xs font-semibold text-emerald-100">
                          {tr.activate}
                        </button>
                      ) : (
                        <button type="button" onClick={() => deleteItem(item.id || item.Id)} className="rounded-xl border border-red-300/25 bg-red-500/12 px-3 py-2 text-xs font-semibold text-red-100">
                          {tr.deactivate}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {section === "recipes" && (
          <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
              <div className="section-kicker">{adminLanguage === "bg" ? "Статус рецептури" : "Recipe status"}</div>
              <div className="mt-4 max-h-[720px] space-y-2 overflow-y-auto pr-1">
                {recipeSummary.map((row) => {
                  const status = row.status || row.Status;
                  const id = row.id || row.Id;
                  const label = status === "Ready" ? tr.recipeReady : status === "NeedsAttention" ? tr.recipeAttention : tr.recipeMissing;
                  const style = status === "Ready"
                    ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
                    : status === "NeedsAttention"
                      ? "border-amber-300/25 bg-amber-400/10 text-amber-100"
                      : "border-red-300/25 bg-red-500/12 text-red-100";
                  return (
                    <button key={id} type="button" onClick={() => { setSelectedMenuItemId(String(id)); }} className={`w-full rounded-2xl border p-3 text-left transition hover:border-[#d8b676]/45 ${String(selectedMenuItemId) === String(id) ? "border-[#d8b676]/70 bg-[#d8b676]/10" : "border-white/10 bg-black/20"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold text-[#fff4df]">{getMenuItemName(row, adminLanguage)}</div>
                          <div className="mt-1 text-xs text-white/40">{getDepartmentLabel(row.department || row.Department, adminLanguage)} · {row.lines ?? row.Lines ?? 0} {adminLanguage === "bg" ? "реда" : "lines"}</div>
                        </div>
                        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${style}`}>{label}</span>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                        <span className="rounded-xl border border-white/10 bg-white/[0.04] px-2 py-1 text-white/55">{formatEuroAmount(row.cost ?? row.Cost ?? 0)}</span>
                        <span className="rounded-xl border border-white/10 bg-white/[0.04] px-2 py-1 text-white/55">{row.foodCostPercent ?? row.FoodCostPercent ?? 0}%</span>
                        <span className="rounded-xl border border-white/10 bg-white/[0.04] px-2 py-1 text-white/55">{formatEuroAmount(row.margin ?? row.Margin ?? 0)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

          <form onSubmit={saveRecipe} className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
            <div className="grid gap-4 lg:grid-cols-[1fr_auto_auto_auto] lg:items-end">
              <div>
                <label className="mb-2 block text-sm text-white/55">{tr.menuItem}</label>
                <select value={selectedMenuItemId} onChange={(e) => setSelectedMenuItemId(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300">
                  <option value="">—</option>
                  {menuItems.map((item) => (
                    <option key={item.id || item.Id} value={item.id || item.Id}>{getMenuItemName(item, adminLanguage)} · {getDepartmentLabel(item.department || item.Department, adminLanguage)}</option>
                  ))}
                </select>
              </div>
              {recipe && [
                [tr.recipeCost, recipe.cost ?? recipe.Cost ?? 0],
                [tr.salePrice, recipe.salePrice ?? recipe.SalePrice ?? selectedRecipeMenuItem?.price ?? 0],
                [tr.margin, recipe.margin ?? recipe.Margin ?? 0],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-white/35">{label}</div>
                  <div className="mt-1 font-semibold text-[#f2d39a]">{formatEuroAmount(value)}</div>
                </div>
              ))}
              {recipe && (
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-white/35">{tr.foodCost}</div>
                  <div className="mt-1 font-semibold text-[#f2d39a]">{recipe.foodCostPercent ?? recipe.FoodCostPercent ?? 0}%</div>
                </div>
              )}
            </div>

            <div className="mt-5 space-y-3">
              {recipeLines.map((line, index) => (
                <div key={index} className="grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-3 md:grid-cols-[1fr_140px_1fr_auto]">
                  <select value={line.inventoryItemId} onChange={(e) => setRecipeLines((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, inventoryItemId: e.target.value } : row))} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 outline-none">
                    <option value="">{tr.ingredient}</option>
                    {items.map((item) => <option key={item.id || item.Id} value={item.id || item.Id}>{item.name || item.Name} ({item.unit || item.Unit})</option>)}
                  </select>
                  <input type="number" step="0.001" placeholder={tr.quantity} value={line.quantity} onChange={(e) => setRecipeLines((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, quantity: e.target.value } : row))} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 outline-none" />
                  <input placeholder={tr.comment} value={line.notes} onChange={(e) => setRecipeLines((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, notes: e.target.value } : row))} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 outline-none" />
                  <button type="button" onClick={() => setRecipeLines((prev) => prev.filter((_, rowIndex) => rowIndex !== index))} className="rounded-xl border border-red-300/25 bg-red-500/12 px-3 py-2 text-red-100">×</button>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => setRecipeLines((prev) => [...prev, { inventoryItemId: "", quantity: "", notes: "" }])} className="ghost-button rounded-2xl px-5 py-3 font-semibold">{tr.add}</button>
              <button disabled={!selectedMenuItemId} className="luxury-button rounded-2xl px-5 py-3 font-semibold disabled:opacity-40">{tr.save}</button>
              <button type="button" disabled={!selectedMenuItemId || recipeLines.length === 0} onClick={deleteRecipe} className="rounded-2xl border border-red-300/25 bg-red-500/12 px-5 py-3 font-semibold text-red-100 disabled:opacity-40">{tr.deleteRecipe}</button>
            </div>
          </form>
          </div>
        )}

        {section === "movements" && (
          <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
            <form onSubmit={saveAdjustment} className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
              <div className="section-kicker">{tr.movements}</div>
              <div className="mt-4 grid gap-3">
                <select required value={adjustment.inventoryItemId} onChange={(e) => setAdjustment((p) => ({ ...p, inventoryItemId: e.target.value }))} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <option value="">{tr.ingredient}</option>
                  {items.map((item) => <option key={item.id || item.Id} value={item.id || item.Id}>{item.name || item.Name}</option>)}
                </select>
                <select value={adjustment.type} onChange={(e) => setAdjustment((p) => ({ ...p, type: e.target.value }))} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <option value="Receipt">{tr.receipt}</option>
                  <option value="ManualAdjustment">{tr.adjustment}</option>
                  <option value="Waste">{tr.waste}</option>
                </select>
                <input required type="number" step="0.001" placeholder={tr.quantity} value={adjustment.quantity} onChange={(e) => setAdjustment((p) => ({ ...p, quantity: e.target.value }))} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3" />
                <textarea placeholder={tr.comment} value={adjustment.comment} onChange={(e) => setAdjustment((p) => ({ ...p, comment: e.target.value }))} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3" />
              </div>
              <button className="luxury-button mt-4 rounded-2xl px-5 py-3 font-semibold">{tr.save}</button>
            </form>
            <div className="max-h-[660px] space-y-2 overflow-y-auto rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
              <select value={movementTypeFilter} onChange={(e) => setMovementTypeFilter(e.target.value)} className="mb-4 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <option value="all">{adminLanguage === "bg" ? "Всички движения" : "All movements"}</option>
                {["Receipt", "SaleConsumption", "ManualAdjustment", "InventoryCorrection", "Waste"].map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
              {visibleMovements.map((movement) => (
                <div key={movement.id || movement.Id} className="grid gap-2 rounded-2xl border border-white/10 bg-black/20 p-3 md:grid-cols-[1fr_auto]">
                  <div>
                    <div className="font-semibold text-[#fff4df]">{movement.ingredient || movement.Ingredient}</div>
                    <div className="mt-1 text-xs text-white/45">{movement.type || movement.Type} · {movement.comment || movement.Comment || "—"}</div>
                  </div>
                  <div className={`text-right font-semibold ${Number(movement.quantity ?? movement.Quantity) < 0 ? "text-red-200" : "text-emerald-200"}`}>
                    {movement.quantity ?? movement.Quantity} {movement.unit || movement.Unit || ""}
                    <div className="text-xs font-normal text-white/35">{new Date(movement.createdAtUtc || movement.CreatedAtUtc).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {section === "audits" && (
          <div className="grid gap-5 xl:grid-cols-[340px_1fr]">
            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
              <button type="button" onClick={createAudit} className="luxury-button w-full rounded-2xl px-5 py-3 font-semibold">{tr.createAudit}</button>
              <div className="mt-5 max-h-[680px] space-y-2 overflow-y-auto pr-1">
                {audits.map((audit) => {
                  const id = audit.id || audit.Id;
                  const status = audit.status || audit.Status;
                  return (
                    <button key={id} type="button" onClick={() => loadAuditDetails(id)} className={`w-full rounded-2xl border p-4 text-left transition ${String(selectedAuditId) === String(id) ? "border-[#d8b676]/70 bg-[#d8b676]/10" : "border-white/10 bg-black/20 hover:border-[#d8b676]/35"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-semibold text-[#fff4df]">{audit.title || audit.Title}</div>
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${status === "Confirmed" ? "border-emerald-300/25 bg-emerald-400/15 text-emerald-100" : "border-amber-300/25 bg-amber-400/12 text-amber-100"}`}>
                          {status}
                        </span>
                      </div>
                      <div className="mt-2 text-sm text-white/50">{audit.lines || audit.Lines} {adminLanguage === "bg" ? "реда" : "lines"} · Δ {audit.difference ?? audit.Difference ?? 0}</div>
                      <div className="mt-2 text-xs text-white/35">{new Date(audit.createdAtUtc || audit.CreatedAtUtc).toLocaleString()}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
              {!selectedAudit ? (
                <div className="rounded-3xl border border-white/10 bg-black/20 p-6 text-white/45">
                  {adminLanguage === "bg" ? "Избери ревизия или създай нова." : "Select an audit or create a new one."}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="section-kicker">{selectedAudit.title || selectedAudit.Title}</div>
                      <div className="mt-2 text-sm text-white/45">
                        {selectedAudit.status || selectedAudit.Status} · {auditLines.length} {adminLanguage === "bg" ? "позиции" : "items"}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={exportAudit} className="ghost-button rounded-xl px-3 py-2 text-xs font-semibold">{tr.exportAudit}</button>
                      {(selectedAudit.status || selectedAudit.Status) !== "Confirmed" && (
                        <>
                          <button type="button" onClick={saveAuditDraft} className="ghost-button rounded-xl px-3 py-2 text-xs font-semibold">{tr.saveDraft}</button>
                          <button type="button" onClick={confirmAudit} className="luxury-button rounded-xl px-3 py-2 text-xs font-semibold">{tr.confirmAudit}</button>
                          <button type="button" onClick={deleteAudit} className="rounded-xl border border-red-300/25 bg-red-500/12 px-3 py-2 text-xs font-semibold text-red-100">{tr.deleteAudit}</button>
                        </>
                      )}
                    </div>
                  </div>

                  <input value={auditSearch} onChange={(event) => setAuditSearch(event.target.value)} placeholder={adminLanguage === "bg" ? "Търси в ревизията..." : "Search audit..."} className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300" />

                  <div className="max-h-[680px] overflow-y-auto pr-1">
                    <div className="grid min-w-[760px] gap-2">
                      <div className="grid grid-cols-[1.2fr_120px_120px_120px_1fr] gap-2 px-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/35">
                        <span>{tr.ingredient}</span>
                        <span>{tr.expected}</span>
                        <span>{tr.actual}</span>
                        <span>{tr.diff}</span>
                        <span>{tr.comment}</span>
                      </div>
                      {filteredAuditLines.map((line) => {
                        const difference = Number(line.actualQuantity || 0) - Number(line.expectedQuantity || 0);
                        return (
                          <div key={line.inventoryItemId} className={`grid grid-cols-[1.2fr_120px_120px_120px_1fr] items-center gap-2 rounded-2xl border p-3 ${difference === 0 ? "border-white/10 bg-black/20" : difference < 0 ? "border-red-300/25 bg-red-500/10" : "border-emerald-300/20 bg-emerald-400/10"}`}>
                            <div>
                              <div className="font-semibold text-[#fff4df]">{line.ingredient}</div>
                              <div className="mt-1 text-xs text-white/40">{line.category} · {line.unit}</div>
                            </div>
                            <div className="text-sm text-white/55">{line.expectedQuantity} {line.unit}</div>
                            <input disabled={(selectedAudit.status || selectedAudit.Status) === "Confirmed"} type="number" step="0.001" value={line.actualQuantity} onChange={(event) => setAuditLines((prev) => prev.map((row) => row.inventoryItemId === line.inventoryItemId ? { ...row, actualQuantity: event.target.value } : row))} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 outline-none focus:border-amber-300 disabled:opacity-60" />
                            <div className={`text-sm font-semibold ${difference < 0 ? "text-red-100" : difference > 0 ? "text-emerald-100" : "text-white/45"}`}>
                              {difference.toFixed(3)}
                            </div>
                            <input disabled={(selectedAudit.status || selectedAudit.Status) === "Confirmed"} value={line.comment} onChange={(event) => setAuditLines((prev) => prev.map((row) => row.inventoryItemId === line.inventoryItemId ? { ...row, comment: event.target.value } : row))} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 outline-none focus:border-amber-300 disabled:opacity-60" />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {section === "low" && (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {lowStockItems.map((item) => (
              <div key={item.id || item.Id} className="rounded-[24px] border border-red-300/30 bg-red-500/12 p-4">
                <div className="text-lg font-semibold text-red-50">{item.name || item.Name}</div>
                <div className="mt-1 text-sm text-red-100/70">{item.category || item.Category}</div>
                <div className="mt-4 text-2xl font-semibold text-red-100">{item.currentQuantity ?? item.CurrentQuantity} {item.unit || item.Unit}</div>
                <div className="text-sm text-red-100/55">{tr.min}: {item.minimumQuantity ?? item.MinimumQuantity} {item.unit || item.Unit}</div>
              </div>
            ))}
            {lowStockItems.length === 0 && (
              <div className="rounded-3xl border border-emerald-300/20 bg-emerald-400/10 p-6 text-emerald-100">
                {adminLanguage === "bg" ? "Няма ниски остатъци." : "No low stock items."}
              </div>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}

function RoleProfileIcon({ role, className = "h-12 w-12" }) {
  const normalized = normalizeAdminRole(role);
  const imageByRole = {
    Kitchen: "/admin-role-chef.jpeg",
    Bar: "/admin-role-waiter.jpeg",
    Waiter: "/admin-role-waiter.jpeg",
    Administrator: "/admin-role-admin.jpeg",
    Owner: "/admin-role-owner.jpeg",
    Developer: "/admin-role-developer.jpeg",
  };
  const src = imageByRole[normalized] || imageByRole.Administrator;

  return (
    <span
      className={`relative block overflow-hidden rounded-[22px] border border-[#d8b676]/35 bg-black/60 shadow-[0_12px_32px_rgba(0,0,0,0.35)] ring-1 ring-white/5 ${className}`}
      aria-hidden="true"
    >
      <img
        src={src}
        alt=""
        className="h-full w-full scale-[1.04] object-cover object-center"
        loading="lazy"
      />
      <span className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-b from-white/10 via-transparent to-black/18" />
    </span>
  );
}

function AdminNavIcon({ type, className = "h-6 w-6" }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };

  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      {type === "liveMap" && (
        <>
          <path d="M5 8l7-3 8 3 7-3v19l-7 3-8-3-7 3z" {...common} />
          <path d="M12 5v19M20 8v19" {...common} />
          <circle cx="16" cy="15" r="3" {...common} />
        </>
      )}
      {type === "reservations" && (
        <>
          <rect x="6" y="7" width="20" height="20" rx="4" {...common} />
          <path d="M10 5v5M22 5v5M6 13h20" {...common} />
          <path d="M11 18h4M18 18h3M11 23h7" {...common} />
        </>
      )}
      {type === "block" && (
        <>
          <rect x="6" y="8" width="20" height="18" rx="4" {...common} />
          <path d="M10 13h12M10 18h8" {...common} />
          <path d="M21 23l5-5M26 23l-5-5" {...common} />
        </>
      )}
      {type === "orders" && (
        <>
          <path d="M9 24h14" {...common} />
          <path d="M8 22c1-7 5-11 8-11s7 4 8 11z" {...common} />
          <path d="M16 8v3" {...common} />
          <path d="M11 6h10" {...common} />
        </>
      )}
      {type === "reports" && (
        <>
          <path d="M7 25h18" {...common} />
          <path d="M10 21v-7M16 21V9M22 21v-4" {...common} />
          <path d="M8 8l5 4 5-5 5 3" {...common} />
        </>
      )}
      {type === "menu" && (
        <>
          <path d="M9 6v20M23 6v20" {...common} />
          <path d="M12 9h7M12 14h7M12 19h7" {...common} />
          <path d="M7 6h18v20H7z" {...common} />
        </>
      )}
      {type === "events" && (
        <>
          <rect x="6" y="8" width="20" height="18" rx="4" {...common} />
          <path d="M10 6v5M22 6v5M6 13h20" {...common} />
          <path d="M11 20l3 3 7-8" {...common} />
          <path d="M11 17h3" {...common} />
        </>
      )}
      {type === "marketing" && (
        <>
          <path d="M7 23c6.5-1.5 12.5-6 17-14" {...common} />
          <path d="M22 8l4-1-1 4" {...common} />
          <rect x="7" y="15" width="4" height="9" rx="1.4" {...common} />
          <rect x="14" y="12" width="4" height="12" rx="1.4" {...common} />
          <rect x="21" y="16" width="4" height="8" rx="1.4" {...common} />
        </>
      )}
      {type === "layout" && (
        <>
          <rect x="6" y="7" width="8" height="7" rx="2" {...common} />
          <rect x="18" y="7" width="8" height="7" rx="2" {...common} />
          <rect x="6" y="18" width="8" height="7" rx="2" {...common} />
          <rect x="18" y="18" width="8" height="7" rx="2" {...common} />
        </>
      )}
      {type === "customers" && (
        <>
          <circle cx="13" cy="12" r="4" {...common} />
          <path d="M6 25c1.5-6 5-9 7-9s5.5 3 7 9" {...common} />
          <circle cx="22" cy="14" r="3" {...common} />
          <path d="M19 20c2.5.5 4.5 2.3 5.5 5" {...common} />
        </>
      )}
      {type === "admins" && (
        <>
          <circle cx="16" cy="11" r="4" {...common} />
          <path d="M8 25c2-7 6-10 8-10s6 3 8 10" {...common} />
          <path d="M24 8l2 2 4-5" {...common} />
        </>
      )}
    </svg>
  );
}

function Panel({ title, subtitle, children, right }) {
  return (
    <div className="luxury-panel rounded-[26px] p-5 md:p-6">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-[#fff4df]">{title}</h2>
          {subtitle && <p className="mt-2 text-sm text-stone-400">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

export default function AdminPage({ adminToken, adminUser, onAdminLogout, onMenuChanged, onEventsChanged, theme, onToggleTheme }) {
  const [activeTab, setActiveTab] = React.useState("home");
  const [adminLanguage, setAdminLanguage] = React.useState("bg");
  const [reservations, setReservations] = React.useState([]);
  const [diningOrders, setDiningOrders] = React.useState([]);
  const [menuItems, setMenuItems] = React.useState([]);
  const [eventItems, setEventItems] = React.useState([]);
  const [blacklist, setBlacklist] = React.useState([]);
  const [customerProfiles, setCustomerProfiles] = React.useState([]);
  const [adminUsers, setAdminUsers] = React.useState([]);
  const [auditLogs, setAuditLogs] = React.useState([]);
  const [feedbackEntries, setFeedbackEntries] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [feedbackSearch, setFeedbackSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("All");
  const [expandedId, setExpandedId] = React.useState(null);
  const [expandedOrderId, setExpandedOrderId] = React.useState(null);
  const [expandedCustomerKey, setExpandedCustomerKey] = React.useState(null);
  const [menuMode, setMenuMode] = React.useState("list");
  const [eventMode, setEventMode] = React.useState("list");
  const [selectedMenuDepartment, setSelectedMenuDepartment] = React.useState("Kitchen");
  const [selectedMenuCategory, setSelectedMenuCategory] = React.useState("");
  const menuItemsRef = React.useRef(null);
  const seenKitchenOrderIdsRef = React.useRef(new Set());
  const seenKitchenItemIdsRef = React.useRef(new Set());
  const seenBarOrderIdsRef = React.useRef(new Set());
  const seenBarItemIdsRef = React.useRef(new Set());
  const seenReadyItemIdsRef = React.useRef(new Set());
  const seenWaiterGuestItemIdsRef = React.useRef(new Set());
  const [blacklistMode, setBlacklistMode] = React.useState("list");
  const [customersMode, setCustomersMode] = React.useState("customers");
  const [customerPeriod, setCustomerPeriod] = React.useState("all");
  const [customerSort, setCustomerSort] = React.useState("visits");
  const [showManualCustomerForm, setShowManualCustomerForm] = React.useState(false);
  const [showCreateReservation, setShowCreateReservation] = React.useState(false);
  const [menuForm, setMenuForm] = React.useState(emptyMenuItem);
  const [editingMenuId, setEditingMenuId] = React.useState(null);
  const [eventForm, setEventForm] = React.useState(emptyEventItem);
  const [editingEventId, setEditingEventId] = React.useState(null);
  const [adminReservation, setAdminReservation] = React.useState(emptyAdminReservation);
  const [tableEdits, setTableEdits] = React.useState({});
  const [tableLayout, setTableLayout] = React.useState([]);
  const [layoutArea, setLayoutArea] = React.useState("indoor");
  const [reservationMapArea, setReservationMapArea] = React.useState("indoor");
  const [reservationMapDate, setReservationMapDate] = React.useState(() => formatLocalDate(new Date()));
  const [noteEdits, setNoteEdits] = React.useState({});
  const [orderMenuSearches, setOrderMenuSearches] = React.useState({});
  const [hallBlock, setHallBlock] = React.useState(emptyHallBlock);
  const [hallBlockConflicts, setHallBlockConflicts] = React.useState([]);
  const [adminNotice, setAdminNotice] = React.useState("");
  const [adminError, setAdminError] = React.useState("");
  const [pushPermission, setPushPermission] = React.useState(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
    return Notification.permission;
  });
  const [pushEnabled, setPushEnabled] = React.useState(false);
  const [statsPeriod, setStatsPeriod] = React.useState("today");
  const adminSwipeStartRef = React.useRef(null);
  const [blacklistForm, setBlacklistForm] = React.useState({
    guestName: "",
    phone: "",
    email: "",
    reason: "No-show",
    notes: "",
  });
  const [manualCustomerForm, setManualCustomerForm] = React.useState(emptyManualCustomer);
  const [adminUserForm, setAdminUserForm] = React.useState({
    name: "",
    email: "",
    password: "",
    role: "Administrator",
  });
  const [ownPasswordForm, setOwnPasswordForm] = React.useState({
    currentPassword: "",
    newPassword: "",
  });
  const [showOwnPasswords, setShowOwnPasswords] = React.useState({
    currentPassword: false,
    newPassword: false,
  });
  const [editingAdminId, setEditingAdminId] = React.useState(null);
  const [adminEditForm, setAdminEditForm] = React.useState({
    name: "",
    email: "",
    password: "",
    role: "Administrator",
    isActive: true,
  });
  const [productTier, setProductTier] = React.useState("Basic");
  const isProVersion = productTier === "Pro";
  const currentAdminRole = normalizeAdminRole(adminUser?.role);
  const isWaiterRole = currentAdminRole === "Waiter";
  const isKitchenRole = currentAdminRole === "Kitchen";
  const isBarRole = currentAdminRole === "Bar";
  const isProductionRole = isKitchenRole || isBarRole;
  const isOperationalRole = isWaiterRole || isProductionRole;
  const canClearOperationalData = currentAdminRole === "Developer";
  const canManageMarketing = ["Owner", "Developer"].includes(currentAdminRole);
  const canUseMaintenance = ["Administrator", "Owner", "Developer"].includes(currentAdminRole);
  const canViewFeedback = ["Administrator", "Owner", "Developer"].includes(currentAdminRole);
  const canManageAdmins = ["Owner", "Developer"].includes(currentAdminRole);
  const hasDeveloperAdmin = adminUsers.some((user) => normalizeAdminRole(user.role || user.Role) === "Developer");
  const availableAdminRoleOptions = adminRoleOptions.filter((role) => {
    if (!isProVersion && ["Waiter", "Kitchen", "Bar"].includes(role.value)) return false;
    return currentAdminRole === "Developer" || role.value !== "Developer" || !hasDeveloperAdmin;
  });
  const activeTablesByArea = React.useMemo(() => {
    const areas = ["indoor", "garden", "openTerrace"];
    const next = {};

    areas.forEach((area) => {
      const savedTables = tableLayout
        .filter((item) => item.area === area && item.isActive)
        .map(normalizeLayoutItem)
        .sort((first, second) => first.id.localeCompare(second.id, undefined, { numeric: true }));

      next[area] = savedTables.length
        ? savedTables
        : (tablesByArea[area] || []).map((table) => normalizeLayoutItem({ ...table, area, isActive: true }));
    });

    next.all = areas.flatMap((area) => next[area]);
    return next;
  }, [tableLayout]);
  const activeTableIdsByArea = React.useMemo(
    () => ({
      indoor: activeTablesByArea.indoor.map((table) => table.id),
      garden: activeTablesByArea.garden.map((table) => table.id),
      openTerrace: activeTablesByArea.openTerrace.map((table) => table.id),
      all: activeTablesByArea.all.map((table) => table.id),
    }),
    [activeTablesByArea]
  );

  const withAdminToken = React.useCallback(
    (options = {}) => ({
      ...options,
      headers: {
        ...(options.headers || {}),
        "X-Admin-Token": adminToken,
      },
    }),
    [adminToken]
  );

  const adminFetch = React.useCallback(
    (url, options = {}) => fetch(url, withAdminToken(options)),
    [withAdminToken]
  );

  React.useEffect(() => {
    let isMounted = true;

    async function checkPushSubscription() {
      if (typeof window === "undefined" || !adminToken || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        return;
      }

      try {
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = await registration?.pushManager.getSubscription();
        if (isMounted) {
          setPushEnabled(Boolean(subscription));
          setPushPermission(Notification.permission);
        }
      } catch {
        if (isMounted) {
          setPushEnabled(false);
        }
      }
    }

    checkPushSubscription();

    return () => {
      isMounted = false;
    };
  }, [adminToken]);

  const loadReservations = React.useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setAdminError("");
    }

    try {
      const reservationsData = await fetchJsonOrEmpty(`${API_BASE_URL}/api/reservations`, [], withAdminToken());
      setReservations(Array.isArray(reservationsData) ? reservationsData.map(normalizeReservation) : []);
    } catch (error) {
      console.error("Failed to load reservations", error);
      if (!silent) {
        setAdminError(error?.message || "Failed to load reservations.");
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [withAdminToken]);

  const loadMenuItems = React.useCallback(async () => {
    try {
      const menuData = await fetchJsonOrEmpty(`${API_BASE_URL}/api/menu`, [], withAdminToken());
      setMenuItems(Array.isArray(menuData) ? menuData : []);
    } catch (error) {
      console.error("Failed to load menu", error);
      setAdminError(error?.message || "Failed to load menu.");
    }
  }, [withAdminToken]);

  const loadEvents = React.useCallback(async () => {
    try {
      const eventData = await fetchJsonOrEmpty(`${API_BASE_URL}/api/events/admin`, [], withAdminToken());
      setEventItems(Array.isArray(eventData) ? eventData : []);
    } catch (error) {
      console.error("Failed to load events", error);
      setAdminError(error?.message || "Failed to load events.");
    }
  }, [withAdminToken]);

  const loadFeedbackEntries = React.useCallback(async () => {
    try {
      const query = feedbackSearch.trim() ? `?search=${encodeURIComponent(feedbackSearch.trim())}` : "";
      const feedbackData = await fetchJsonOrEmpty(`${API_BASE_URL}/api/feedback${query}`, [], withAdminToken());
      setFeedbackEntries(Array.isArray(feedbackData) ? feedbackData : []);
    } catch (error) {
      console.error("Failed to load feedback", error);
      setAdminError(error?.message || "Failed to load feedback.");
    }
  }, [feedbackSearch, withAdminToken]);

  async function markFeedbackDiscountUsed(id) {
    setAdminError("");
    const response = await adminFetch(`${API_BASE_URL}/api/feedback/${id}/discount-used`, { method: "PATCH" });
    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to mark discount as used."));
      return;
    }
    await loadFeedbackEntries();
  }

  async function deleteFeedbackEntry(id) {
    if (!window.confirm(adminLocalText(adminLanguage, "Да изтрия ли тази обратна връзка?", "Delete this feedback entry?", "Удалить эту обратную связь?"))) return;

    setAdminError("");
    const response = await adminFetch(`${API_BASE_URL}/api/feedback/${id}`, { method: "DELETE" });
    if (!response.ok) {
      setAdminError(await readErrorMessage(
        response,
        adminLocalText(adminLanguage, "Неуспешно изтриване на обратна връзка.", "Failed to delete feedback.", "Не удалось удалить обратную связь.")
      ));
      return;
    }
    await loadFeedbackEntries();
  }

  const loadDiningOrders = React.useCallback(async ({ silent = false, force = false } = {}) => {
    if (!isProVersion && !force) {
      setDiningOrders([]);
      return;
    }

    try {
      const ordersData = await fetchJsonOrEmpty(`${API_BASE_URL}/api/dining-orders`, [], withAdminToken());
      setDiningOrders(Array.isArray(ordersData) ? ordersData.map(normalizeDiningOrder) : []);
    } catch (error) {
      console.error("Failed to load dining orders", error);
      if (!silent) {
        setAdminError(error?.message || "Failed to load dining orders.");
      }
    }
  }, [isProVersion, withAdminToken]);

  const loadProductTier = React.useCallback(async () => {
    try {
      const data = await fetchJsonOrEmpty(`${API_BASE_URL}/api/product-tier`, { tier: "Basic" }, withAdminToken());
      setProductTier(data?.isPro || data?.tier === "Pro" ? "Pro" : "Basic");
    } catch (error) {
      console.error("Failed to load product tier", error);
      setProductTier("Basic");
    }
  }, [withAdminToken]);

  const loadBlacklist = React.useCallback(async () => {
    try {
      const blacklistData = await fetchJsonOrEmpty(`${API_BASE_URL}/api/blacklist`, [], withAdminToken());
      setBlacklist(Array.isArray(blacklistData) ? blacklistData : []);
    } catch (error) {
      console.error("Failed to load blacklist", error);
      setAdminError(error?.message || "Failed to load blacklist.");
    }
  }, [withAdminToken]);

  const loadCustomerProfiles = React.useCallback(async () => {
    try {
      const data = await fetchJsonOrEmpty(`${API_BASE_URL}/api/customers`, [], withAdminToken());
      setCustomerProfiles(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to load customer profiles", error);
      setAdminError(error?.message || adminLocalText(adminLanguage, "Неуспешно зареждане на клиенти.", "Failed to load customer profiles.", "Не удалось загрузить клиентов."));
    }
  }, [adminLanguage, withAdminToken]);

  const loadTableLayout = React.useCallback(async () => {
    try {
      const layoutData = await fetchJsonOrEmpty(`${API_BASE_URL}/api/table-layouts`, [], withAdminToken());
      setTableLayout(Array.isArray(layoutData) ? layoutData.map(normalizeLayoutItem) : []);
    } catch (error) {
      console.error("Failed to load table layout", error);
      setAdminError(error?.message || "Failed to load table layout.");
    }
  }, [withAdminToken]);

  const loadAdminUsers = React.useCallback(async () => {
    try {
      const data = await fetchJsonOrEmpty(`${API_BASE_URL}/api/admin/users`, [], withAdminToken());
      setAdminUsers(Array.isArray(data) ? data : []);
    } catch (error) {
      setAdminError(error?.message || "Failed to load admin users.");
    }
  }, [withAdminToken]);

  const loadAuditLogs = React.useCallback(async () => {
    try {
      const data = await fetchJsonOrEmpty(`${API_BASE_URL}/api/admin/audit`, [], withAdminToken());
      setAuditLogs(Array.isArray(data) ? data : []);
    } catch (error) {
      setAdminError(error?.message || "Failed to load audit logs.");
    }
  }, [withAdminToken]);

  React.useEffect(() => {
    let cancelled = false;

    async function loadInitialData() {
      await loadProductTier();

      if (isWaiterRole && isProVersion) {
        setLoading(true);
        setAdminError("");
        await Promise.all([loadReservations(), loadDiningOrders(), loadTableLayout(), loadMenuItems()]);
        if (!cancelled) {
          setLoading(false);
        }
        return;
      }

      if (isProductionRole && isProVersion) {
        setLoading(true);
        setAdminError("");
        await Promise.all([loadDiningOrders(), loadMenuItems()]);
        if (!cancelled) {
          setLoading(false);
        }
        return;
      }

      loadReservations();
      loadBlacklist();
      loadCustomerProfiles();
      if (isProVersion) {
        loadDiningOrders();
      }
      loadTableLayout();
      loadEvents();
      if (canViewFeedback) {
        loadFeedbackEntries();
      }
    }

    loadInitialData();

    return () => {
      cancelled = true;
    };
  }, [canViewFeedback, isProductionRole, isProVersion, isWaiterRole, loadBlacklist, loadCustomerProfiles, loadDiningOrders, loadEvents, loadFeedbackEntries, loadMenuItems, loadProductTier, loadReservations, loadTableLayout]);

  React.useEffect(() => {
    setAdminError("");

    if (activeTab === "menu" && !isWaiterRole) {
      loadMenuItems();
    }

    if (activeTab === "events" && !isWaiterRole && !isProductionRole) {
      loadEvents();
    }

    if (activeTab === "feedback" && canViewFeedback) {
      loadFeedbackEntries();
    }

    if (activeTab === "orders" && isProVersion) {
      loadDiningOrders();
      loadMenuItems();
    }

    if ((activeTab === "customers" || activeTab === "reports") && !isWaiterRole && !isProductionRole) {
      loadReservations({ silent: true });
      loadCustomerProfiles();
      if (isProVersion) {
        loadDiningOrders();
      }
    }

    if (activeTab === "blacklist" && !isWaiterRole) {
      loadBlacklist();
    }

    if (activeTab === "layout" || activeTab === "liveMap") {
      loadTableLayout();
    }

    if (activeTab === "liveMap") {
      loadReservations({ silent: true });
      if (isProVersion) {
        loadDiningOrders();
        loadMenuItems();
      }
      loadMenuItems();
    }

    if (activeTab === "admins" && canManageAdmins) {
      loadAdminUsers();
      loadAuditLogs();
    }
  }, [activeTab, canManageAdmins, canViewFeedback, isProductionRole, isProVersion, isWaiterRole, loadAdminUsers, loadAuditLogs, loadBlacklist, loadCustomerProfiles, loadDiningOrders, loadEvents, loadFeedbackEntries, loadMenuItems, loadReservations, loadTableLayout]);

  React.useEffect(() => {
    const pages = isProductionRole
      ? ["home", "orders"]
      : isWaiterRole
      ? ["home", "liveMap", "orders"]
      : canManageAdmins
      ? ["home", "liveMap", "reservations", "orders", "reports", "block", "menu", "events", ...(canViewFeedback ? ["feedback"] : []), "layout", "customers", "admins"]
      : ["home", "liveMap", "reservations", "orders", "reports", "block", "menu", "events", ...(canViewFeedback ? ["feedback"] : []), "layout", "customers"];

    const handleTouchStart = (event) => {
      if (event.touches.length !== 1 || isInteractiveSwipeTarget(event.target)) {
        adminSwipeStartRef.current = null;
        return;
      }

      const touch = event.touches[0];
      adminSwipeStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
      };
    };

    const handleTouchEnd = (event) => {
      const start = adminSwipeStartRef.current;
      adminSwipeStartRef.current = null;
      if (!start || event.changedTouches.length !== 1) return;

      const touch = event.changedTouches[0];
      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;
      if (Math.abs(deltaX) < 70 || Math.abs(deltaX) < Math.abs(deltaY) * 1.35) return;

      const index = pages.indexOf(activeTab);
      if (index === -1) return;

      const nextIndex = deltaX < 0 ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= pages.length) return;

      setActiveTab(pages[nextIndex]);
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [activeTab, canManageAdmins, canViewFeedback, isProductionRole, isWaiterRole]);

  function updateTableLayoutItem(tableId, nextItem) {
    const normalized = normalizeLayoutItem(nextItem);
    if (!normalized.id) {
      setAdminError(adminLanguage === "bg" ? "Въведете номер на масата." : "Enter a table number.");
      return;
    }
    if (
      normalized.id !== tableId &&
      tableLayout.some((item) => item.id.toLowerCase() === normalized.id.toLowerCase())
    ) {
      setAdminError(adminLanguage === "bg" ? "Вече има маса с този номер." : "A table with this number already exists.");
      return;
    }
    if (hasLayoutOverlap(tableLayout, normalized, tableId)) {
      setAdminError(a.layout.overlap);
      return;
    }

    setAdminError("");
    setTableLayout((prev) => prev.map((item) => (item.id === tableId ? normalized : item)));
  }

  function addTableLayoutItem() {
    const areaItems = tableLayout.filter((item) => item.area === layoutArea);
    const nextNumber = Math.max(
      0,
      ...tableLayout.map((item) => Number.parseInt(String(item.id).replace(/\D/g, ""), 10)).filter(Number.isFinite)
    ) + 1;
    const candidate = {
      id: String(nextNumber),
      area: layoutArea,
      x: 50,
      y: Math.min(90, 18 + areaItems.length * 8),
      seats: 4,
      special: false,
      wide: layoutArea === "indoor",
      isActive: true,
    };

    setTableLayout((prev) => [...prev, candidate]);
  }

  function removeTableLayoutItem(tableId) {
    setTableLayout((prev) => prev.filter((item) => item.id !== tableId));
  }

  async function saveTableLayout() {
    setAdminNotice("");
    setAdminError("");

    const response = await adminFetch(`${API_BASE_URL}/api/table-layouts`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tableLayout),
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to save table layout."));
      return;
    }

    setAdminNotice("Table layout saved.");
    await loadTableLayout();
  }

  async function resetTableLayout() {
    setAdminNotice("");
    setAdminError("");

    const response = await adminFetch(`${API_BASE_URL}/api/table-layouts/reset`, {
      method: "POST",
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to reset table layout."));
      return;
    }

    setAdminNotice("Table layout reset.");
    await loadTableLayout();
  }

  async function updateStatus(id, action) {
    setAdminNotice("");
    setAdminError("");

    const response = await adminFetch(`${API_BASE_URL}/api/reservations/${id}/${action}`, {
      method: "PATCH",
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to update reservation status."));
      return;
    }

    await loadReservations();
  }

  async function archiveReservation(id) {
    setAdminNotice("");
    setAdminError("");

    const confirmed = window.confirm(
      adminLanguage === "bg"
        ? "Да архивираме ли тази резервация? Тя ще се скрие от обичайните списъци, но може да се възстанови от Поддръжка."
        : "Archive this reservation? It will be hidden from regular lists, but can be restored from Maintenance."
    );
    if (!confirmed) return;

    const response = await adminFetch(`${API_BASE_URL}/api/maintenance/reservations/${id}/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: adminLanguage === "bg" ? "Архивирана от списъка с резервации" : "Archived from reservations list",
      }),
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to archive reservation."));
      return;
    }

    setAdminNotice(adminLanguage === "bg" ? "Резервацията е архивирана." : "Reservation archived.");
    await loadReservations();
  }

  async function updateDiningOrderStatus(orderId, status) {
    setAdminNotice("");
    setAdminError("");

    const response = await adminFetch(`${API_BASE_URL}/api/dining-orders/${orderId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to update order status."));
      return;
    }

    setAdminNotice(adminLanguage === "bg" ? "Статусът на поръчката е обновен." : "Order status updated.");
    await loadDiningOrders();
  }

  async function claimDiningOrder(orderId) {
    setAdminNotice("");
    setAdminError("");

    const response = await adminFetch(`${API_BASE_URL}/api/dining-orders/${orderId}/claim`, {
      method: "POST",
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to claim order."));
      return;
    }

    setAdminNotice(adminLanguage === "bg" ? "Поръчката е взета от Вас." : "Order assigned to you.");
    await Promise.all([loadReservations(), loadDiningOrders()]);
  }

  async function claimReservationForConsumption(reservationId) {
    setAdminNotice("");
    setAdminError("");

    const response = await adminFetch(`${API_BASE_URL}/api/dining-orders/reservations/${reservationId}/claim`, {
      method: "POST",
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(
        response,
        adminLanguage === "bg"
          ? "Резервацията вече е взета от друг сервитьор."
          : "Reservation is already assigned to another waiter."
      ));
      await Promise.all([loadReservations(), loadDiningOrders()]);
      return false;
    }

    await Promise.all([loadReservations(), loadDiningOrders()]);
    return true;
  }

  async function updateDiningOrderItemStatus(itemId, status) {
    setAdminNotice("");
    setAdminError("");

    const response = await adminFetch(`${API_BASE_URL}/api/dining-orders/items/${itemId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to update item status."));
      return;
    }

    await loadDiningOrders();
  }

  async function seatWalkInFromMap({ area, tableId, seats, guestCount: requestedGuestCount }) {
    setAdminNotice("");
    setAdminError("");

    const now = new Date();
    const minutesNow = now.getHours() * 60 + now.getMinutes();
    const opensAt = 10 * 60;
    const latestWalkIn = 23 * 60 + 30;

    if (minutesNow < opensAt || minutesNow > latestWalkIn) {
      setAdminError(
        adminLanguage === "bg"
          ? "Настаняване без резервация е възможно само в работното време на ресторанта: 10:00-23:30."
          : "Walk-in seating is available only during restaurant working hours: 10:00-23:30."
      );
      return false;
    }

    const guestCount = Math.max(1, Math.min(40, Number.parseInt(requestedGuestCount ?? Math.min(Number(seats || 2), 4), 10) || 2));
    const response = await adminFetch(`${API_BASE_URL}/api/reservations/walk-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        area,
        tableIds: [tableId],
        guestCount,
      }),
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to seat walk-in guest."));
      return false;
    }

    setAdminNotice(adminLanguage === "bg" ? "Гостът е настанен без резервация." : "Walk-in guest seated.");
    await Promise.all([loadReservations(), loadDiningOrders()]);
    return true;
  }

  async function clearReservationsAndOrders() {
    setAdminNotice("");
    setAdminError("");

    const confirmed = window.confirm(
      adminLanguage === "bg"
        ? "Да се изтрият ли всички резервации и поръчки? Менюто и настройките няма да бъдат променени."
        : "Delete all reservations and orders? Menu and settings will not be changed."
    );

    if (!confirmed) return;

    const confirmationCode = window.prompt(
      adminLanguage === "bg"
        ? "Въведете код за потвърждение."
        : "Enter the confirmation code."
    );

    if (confirmationCode !== "2215") {
      setAdminError(adminLanguage === "bg" ? "Грешен код за потвърждение." : "Wrong confirmation code.");
      return;
    }

    const response = await adminFetch(`${API_BASE_URL}/api/maintenance/clear-reservations-and-orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmationCode }),
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to clear reservations and orders."));
      return;
    }

    await Promise.all([loadReservations(), loadDiningOrders()]);
    setAdminNotice(
      adminLanguage === "bg"
        ? "Всички резервации и поръчки са изчистени."
        : "All reservations and orders were cleared."
    );
  }

  async function addConsumptionItem(reservationId, item) {
    setAdminNotice("");
    setAdminError("");

    const response = await adminFetch(`${API_BASE_URL}/api/dining-orders/reservations/${reservationId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to add item."));
      return;
    }

    await loadDiningOrders();
  }

  async function addOrderItem(order, item) {
    setAdminNotice("");
    setAdminError("");

    const response = await adminFetch(`${API_BASE_URL}/api/dining-orders/${order.id}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to add item."));
      return;
    }

    await loadDiningOrders();
    setOrderMenuSearches((prev) => ({ ...prev, [order.id]: "" }));
  }

  async function updateConsumptionItem(itemId, quantity) {
    setAdminNotice("");
    setAdminError("");

    const response = await adminFetch(`${API_BASE_URL}/api/dining-orders/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity }),
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to update item."));
      return;
    }

    await loadDiningOrders();
  }

  async function markReservationArrived(reservation) {
    setAdminNotice("");
    setAdminError("");

    const response = await adminFetch(`${API_BASE_URL}/api/reservations/${reservation.id}/arrive`, {
      method: "PATCH",
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to mark reservation as arrived."));
      return;
    }

    setAdminNotice(adminLanguage === "bg" ? "Гостът е отбелязан като пристигнал." : "Guest marked as arrived.");
    await loadReservations();
  }

  async function markReservationNoShow(reservation) {
    setAdminNotice("");
    setAdminError("");

    const blacklistPayload = {
      guestName: reservation.guestName,
      phone: reservation.phone,
      email: reservation.email,
      reason: "No-show",
      notes: reservation.internalNote || reservation.notes || "",
    };
    const isAlreadyBlacklisted = blacklistKeys.has(String(reservation.phone || "").trim().toLowerCase()) ||
      blacklistKeys.has(String(reservation.email || "").trim().toLowerCase());

    if (!isAlreadyBlacklisted) {
      const saved = await saveBlacklistPayload(blacklistPayload);
      if (!saved) return;
    }

    const response = await adminFetch(`${API_BASE_URL}/api/reservations/${reservation.id}/no-show`, {
      method: "PATCH",
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to mark reservation as no-show."));
      return;
    }

    setAdminNotice(adminLanguage === "bg" ? "Резервацията е освободена като no-show." : "Reservation released as no-show.");
    await loadReservations();
  }

  async function releaseReservationTable(reservation) {
    setAdminNotice("");
    setAdminError("");

    const response = await adminFetch(`${API_BASE_URL}/api/reservations/${reservation.id}/release`, {
      method: "PATCH",
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to release reservation."));
      return;
    }

    setAdminNotice(adminLanguage === "bg" ? "Масата е освободена." : "Table released.");
    await loadReservations();
  }

  async function moveReservationFromMap(reservation, area, tableIds, guestCount) {
    setAdminNotice("");
    setAdminError("");

    const nextGuestCount = Number(guestCount || reservation.guestCount || 0);
    const unavailableTableIds = getUnavailableTableIdsForSlot(
      reservations,
      reservation.reservedDate,
      reservation.reservedTime,
      reservation.id
    );
    const unavailableSelectedTableIds = getUnavailableSelectedTableIds(tableIds, unavailableTableIds);

    if (unavailableSelectedTableIds.length > 0) {
      setAdminError(
        adminLanguage === "bg"
          ? `Маса ${unavailableSelectedTableIds.join(", ")} вече е заета около този час.`
          : `Table ${unavailableSelectedTableIds.join(", ")} is already reserved around this time.`
      );
      return false;
    }

    const response = await adminFetch(`${API_BASE_URL}/api/reservations/${reservation.id}/tables`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        area,
        tableIds,
        guestCount: nextGuestCount,
      }),
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Selected table is not available."));
      return false;
    }

    setAdminNotice(adminLanguage === "bg" ? "Резервацията е преместена." : "Reservation moved.");
    await Promise.all([loadReservations(), loadDiningOrders()]);
    return true;
  }

  function openReservationFromMap(reservation) {
    setSearch("");
    setStatusFilter("All");
    setExpandedId(reservation.id);
    setActiveTab("reservations");
  }

  function openReservationFromBlockConflict(conflict) {
    const id = conflict.id || conflict.Id;
    const guestName = conflict.guestName || conflict.GuestName || "";
    const phone = conflict.phone || conflict.Phone || "";
    setSearch(guestName || phone);
    setStatusFilter("All");
    if (id) setExpandedId(id);
    setActiveTab("reservations");
  }

  function getTableEdit(reservation) {
    return (
      tableEdits[reservation.id] || {
        area: ["garden", "openTerrace"].includes(reservation.area) ? reservation.area : "indoor",
        tableIds: reservation.tableIds,
        guestCount: reservation.guestCount,
        reservedDate: reservation.reservedDate,
        reservedTime: reservation.reservedTime,
      }
    );
  }

  function setTableEditArea(reservation, area) {
    setTableEdits((prev) => ({
      ...prev,
      [reservation.id]: {
        ...getTableEdit(reservation),
        area,
        tableIds: [],
      },
    }));
  }

  function setTableEditDateTime(reservation, key, value) {
    const current = getTableEdit(reservation);

    setTableEdits((prev) => ({
      ...prev,
      [reservation.id]: {
        ...current,
        [key]: value,
      },
    }));
  }

  function setTableEditGuestCount(reservation, guestCount) {
    const current = getTableEdit(reservation);

    setTableEdits((prev) => ({
      ...prev,
      [reservation.id]: {
        ...current,
        guestCount,
      },
    }));
  }

  function toggleTableEdit(reservation, tableId) {
    const current = getTableEdit(reservation);
    const exists = current.tableIds.includes(tableId);
    const nextTableIds = exists
      ? current.tableIds.filter((id) => id !== tableId)
      : [...current.tableIds, tableId];

    setTableEdits((prev) => ({
      ...prev,
      [reservation.id]: {
        ...current,
        tableIds: nextTableIds,
      },
    }));
  }

  function getAdminReservationTableIds() {
    return String(adminReservation.tableIds || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
  }

  function toggleAdminReservationTable(tableId) {
    if (adminReservationUnavailableTableIds.has(tableId)) {
      return;
    }

    const currentTableIds = getAdminReservationTableIds();
    const exists = currentTableIds.includes(tableId);
    const nextTableIds = exists
      ? currentTableIds.filter((id) => id !== tableId)
      : [...currentTableIds, tableId];

    setAdminReservation((prev) => ({
      ...prev,
      tableIds: nextTableIds.join(", "),
    }));
  }

  function selectAdminMenuCategory(categoryId) {
    setSelectedMenuCategory(categoryId);
    window.setTimeout(() => {
      menuItemsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

  function getNoteEdit(reservation) {
    return noteEdits[reservation.id] ?? reservation.internalNote ?? "";
  }

  function setNoteEdit(reservation, value) {
    setNoteEdits((prev) => ({
      ...prev,
      [reservation.id]: value,
    }));
  }

  async function saveReservationNote(reservation) {
    setAdminNotice("");
    setAdminError("");

    const response = await adminFetch(`${API_BASE_URL}/api/reservations/${reservation.id}/note`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        internalNote: getNoteEdit(reservation),
      }),
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to update admin note."));
      return;
    }

    setNoteEdits((prev) => {
      const next = { ...prev };
      delete next[reservation.id];
      return next;
    });
    setAdminNotice("Admin note updated.");
    await loadReservations();
  }

  async function saveReservationTables(reservation) {
    const edit = getTableEdit(reservation);

    setAdminNotice("");
    setAdminError("");

    if (isPastTimeForDate(edit.reservedDate, edit.reservedTime)) {
      setAdminError(
        adminLanguage === "bg"
          ? "Не може да запазите резервация за дата или час, които вече са минали."
          : "You cannot save a reservation for a date or time that has already passed."
      );
      return;
    }

    const unavailableTableIds = getUnavailableTableIdsForSlot(
      reservations,
      edit.reservedDate,
      edit.reservedTime,
      reservation.id
    );
    const unavailableSelectedTableIds = getUnavailableSelectedTableIds(edit.tableIds, unavailableTableIds);

    if (unavailableSelectedTableIds.length > 0) {
      setAdminError(
        adminLanguage === "bg"
          ? `Маса ${unavailableSelectedTableIds.join(", ")} вече е заета около този час.`
          : `Table ${unavailableSelectedTableIds.join(", ")} is already reserved around this time.`
      );
      return;
    }

    const response = await adminFetch(`${API_BASE_URL}/api/reservations/${reservation.id}/tables`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        area: edit.area,
        tableIds: edit.tableIds,
        guestCount: Number(edit.guestCount || reservation.guestCount || 0),
        reservedDate: edit.reservedDate || reservation.reservedDate,
        reservedTime: edit.reservedTime || reservation.reservedTime,
      }),
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Selected table is not available."));
      return;
    }

    setTableEdits((prev) => {
      const next = { ...prev };
      delete next[reservation.id];
      return next;
    });
    setAdminNotice("Tables updated.");
    await Promise.all([loadReservations(), loadDiningOrders()]);
  }

  async function saveBlacklistPayload(payload) {
    setAdminNotice("");
    setAdminError("");

    const response = await adminFetch(`${API_BASE_URL}/api/blacklist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to add to blacklist."));
      return false;
    }

    await loadBlacklist();
    setAdminNotice("Added to blacklist.");
    return true;
  }

  async function addToBlacklist(reservation) {
    await markReservationNoShow(reservation);
  }

  async function addCustomerToBlacklist(customer) {
    await saveBlacklistPayload({
      guestName: customer.guestName || "",
      phone: customer.phone || "",
      email: customer.email || "",
      reason: "Manual review",
      notes: `Added from Customers tab. Reservations: ${customer.count}`,
    });
  }

  async function saveMenuItem(event) {
    event.preventDefault();
    setAdminNotice("");
    setAdminError("");

    const payload = {
      ...menuForm,
      price: Number(menuForm.price || 0),
      department: normalizeDepartment(menuForm.department),
    };

    const url = editingMenuId
      ? `${API_BASE_URL}/api/menu/${editingMenuId}`
      : `${API_BASE_URL}/api/menu`;

    const response = await adminFetch(url, {
      method: editingMenuId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to save menu item."));
      return;
    }

    setMenuForm(emptyMenuItem);
    setEditingMenuId(null);
    setMenuMode("list");
    setAdminNotice(editingMenuId ? "Menu item updated." : "Menu item created.");
    await loadMenuItems();
    await onMenuChanged?.();
  }

  async function deleteMenuItem(id) {
    setAdminNotice("");
    setAdminError("");

    const response = await adminFetch(`${API_BASE_URL}/api/menu/${id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to delete menu item."));
      return;
    }

    setAdminNotice("Menu item deleted.");
    await loadMenuItems();
    await onMenuChanged?.();
  }

  async function seedMenuItems() {
    setAdminNotice("");
    setAdminError("");

    const response = await adminFetch(`${API_BASE_URL}/api/menu/seed`, {
      method: "POST",
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to seed menu items."));
      return;
    }

    const result = await response.json();
    await loadMenuItems();
    await onMenuChanged?.();
    setMenuMode("list");
    setAdminNotice(`Menu ready. Added ${result.created ?? result.Created ?? 0}, total ${result.total ?? result.Total ?? "—"}.`);
  }

  async function handleMenuImageFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const imageUrl = await compressMenuImage(file);
      setMenuForm((prev) => ({ ...prev, imageUrl }));
      setAdminError("");
    } catch (error) {
      setAdminError(error?.message || "Failed to load image.");
    }
  }

  async function saveEventItem(event) {
    event.preventDefault();
    setAdminNotice("");
    setAdminError("");

    const payload = {
      ...eventForm,
      imageUrls: (eventForm.imageUrls || []).filter(Boolean).slice(0, 8),
      activeUntilUtc: eventForm.activeUntilLocal ? new Date(eventForm.activeUntilLocal).toISOString() : null,
    };
    delete payload.activeUntilLocal;

    const url = editingEventId
      ? `${API_BASE_URL}/api/events/${editingEventId}`
      : `${API_BASE_URL}/api/events`;

    const response = await adminFetch(url, {
      method: editingEventId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to save event."));
      return;
    }

    setEventForm(emptyEventItem);
    setEditingEventId(null);
    setEventMode("list");
    setAdminNotice(editingEventId ? "Event updated." : "Event created.");
    await loadEvents();
    await onEventsChanged?.();
  }

  async function deleteEventItem(id) {
    setAdminNotice("");
    setAdminError("");

    const confirmed = window.confirm(adminLanguage === "bg" ? "Да изтрием ли това събитие?" : "Delete this event?");
    if (!confirmed) return;

    const response = await adminFetch(`${API_BASE_URL}/api/events/${id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to delete event."));
      return;
    }

    setAdminNotice("Event deleted.");
    await loadEvents();
    await onEventsChanged?.();
  }

  function startEditingEventItem(item) {
    setEditingEventId(getValue(item, "id"));
    setEventForm({
      titleBg: getValue(item, "titleBg") || "",
      titleEn: getValue(item, "titleEn") || "",
      textBg: getValue(item, "textBg") || "",
      textEn: getValue(item, "textEn") || "",
      badge: getValue(item, "badge") || "",
      imageUrls: getValue(item, "imageUrls") || [],
      isActive: getValue(item, "isActive") ?? true,
      activeUntilLocal: toLocalDateTimeInputValue(getValue(item, "activeUntilUtc")),
    });
    setEventMode("form");
  }

  async function handleEventImageFileChange(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (files.length === 0) return;

    try {
      const imageUrls = await Promise.all(files.slice(0, 8).map((file) => compressEventImage(file)));
      setEventForm((prev) => ({
        ...prev,
        imageUrls: [...(prev.imageUrls || []), ...imageUrls].slice(0, 8),
      }));
      setAdminError("");
    } catch (error) {
      setAdminError(error?.message || "Failed to load event photos.");
    }
  }

  function removeEventImage(index) {
    setEventForm((prev) => ({
      ...prev,
      imageUrls: (prev.imageUrls || []).filter((_, photoIndex) => photoIndex !== index),
    }));
  }

  async function saveAdminReservationPayload(source) {
    const payload = {
      ...source,
      email: source.email || "",
      guestCount: Number(source.guestCount || 0),
      tableIds: Array.isArray(source.tableIds)
        ? source.tableIds
        : String(source.tableIds || "")
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
      createdByAdmin: true,
    };

    setAdminNotice("");
    setAdminError("");

    const unavailableTableIds = getUnavailableTableIdsForSlot(
      reservations,
      payload.reservedDate,
      payload.reservedTime
    );
    const unavailableSelectedTableIds = getUnavailableSelectedTableIds(payload.tableIds, unavailableTableIds);

    if (unavailableSelectedTableIds.length > 0) {
      setAdminError(
        adminLanguage === "bg"
          ? `Маса ${unavailableSelectedTableIds.join(", ")} вече е заета около този час.`
          : `Table ${unavailableSelectedTableIds.join(", ")} is already reserved around this time.`
      );
      return;
    }

    const response = await adminFetch(`${API_BASE_URL}/api/reservations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to create reservation."));
      return false;
    }

    setAdminNotice("Reservation created.");
    await loadReservations();
    return true;
  }

  async function createAdminReservation(event) {
    event.preventDefault();

    const created = await saveAdminReservationPayload(adminReservation);
    if (!created) return;

    setAdminReservation(emptyAdminReservation);
    setActiveTab("reservations");
    setShowCreateReservation(false);
  }

  async function createHallBlock(event) {
    event.preventDefault();

    const times = buildTimeRange(hallBlock.startTime, hallBlock.endTime);

    setAdminNotice("");
    setAdminError("");
    setHallBlockConflicts([]);

    if (!hallBlock.reservedDate || times.length === 0) {
      setAdminError("Choose a valid date and time range.");
      return;
    }

    const response = await adminFetch(`${API_BASE_URL}/api/reservations/block`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservedDate: hallBlock.reservedDate,
        area: hallBlock.area,
        times,
        tableIds: activeTableIdsByArea[hallBlock.area] || activeTableIdsByArea.indoor,
        note: hallBlock.note,
      }),
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to block tables."));
      return;
    }

    const result = await response.json().catch(() => null);
    const conflicts = result?.conflicts || result?.Conflicts || [];

    if (conflicts.length > 0 || Number(result?.created ?? result?.Created ?? 1) === 0) {
      setHallBlockConflicts(conflicts);
      setAdminNotice(
        adminLanguage === "bg"
          ? "В избрания период има резервации. Прегледайте ги преди да блокирате зоната."
          : "There are reservations in the selected period. Review them before blocking the area."
      );
      return;
    }

    setHallBlock(emptyHallBlock);
    setAdminNotice(
      adminLanguage === "bg"
        ? `Блокирани са ${times.length} часови слота.`
        : `Blocked ${times.length} time slots.`
    );
    await loadReservations();
    setActiveTab("reservations");
  }

  async function saveBlacklistEntry(event) {
    event.preventDefault();

    const saved = await saveBlacklistPayload(blacklistForm);
    if (!saved) return;

    setBlacklistForm({
      guestName: "",
      phone: "",
      email: "",
      reason: "No-show",
      notes: "",
    });
    setBlacklistMode("list");
  }

  async function saveManualCustomer(event) {
    event.preventDefault();
    setAdminNotice("");
    setAdminError("");

    const payload = {
      ...manualCustomerForm,
      birthDate: manualCustomerForm.birthDate || null,
      marketingConsent: Boolean(manualCustomerForm.marketingConsent),
    };

    const response = await adminFetch(`${API_BASE_URL}/api/customers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, adminLocalText(adminLanguage, "Неуспешно записване на клиент.", "Failed to save customer.", "Не удалось сохранить клиента.")));
      return;
    }

    setManualCustomerForm(emptyManualCustomer);
    setShowManualCustomerForm(false);
    await loadCustomerProfiles();
    setAdminNotice(adminLocalText(adminLanguage, "Клиентът е запазен.", "Customer saved.", "Клиент сохранён."));
  }

  async function deleteCustomerProfile(customer) {
    const profileId = customer.profileId;
    if (!profileId) return;

    const confirmed = window.confirm(
      adminLocalText(
        adminLanguage,
        `Да изтрием ли клиента "${customer.guestName}" от статистиката?`,
        `Delete "${customer.guestName}" from customer statistics?`,
        `Удалить клиента "${customer.guestName}" из статистики?`
      )
    );

    if (!confirmed) return;

    setAdminNotice("");
    setAdminError("");

    const response = await adminFetch(`${API_BASE_URL}/api/customers/${profileId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(
        response,
        adminLocalText(adminLanguage, "Неуспешно изтриване на клиент.", "Failed to delete customer.", "Не удалось удалить клиента.")
      ));
      return;
    }

    setExpandedCustomerKey(null);
    await loadCustomerProfiles();
    setAdminNotice(adminLocalText(adminLanguage, "Клиентът е изтрит от статистиката.", "Customer removed from statistics.", "Клиент удалён из статистики."));
  }

  async function deleteBlacklistEntry(id) {
    await adminFetch(`${API_BASE_URL}/api/blacklist/${id}`, {
      method: "DELETE",
    });

    await loadBlacklist();
  }

  async function unlockProVersion() {
    setAdminError("");
    setAdminNotice("");

    const code = window.prompt(
      adminLanguage === "bg"
        ? "Въведете developer код за отключване на Pro версия:"
        : "Enter developer code to unlock Pro version:"
    );

    if (code === null) return;

    const response = await adminFetch(`${API_BASE_URL}/api/product-tier/unlock-pro`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to unlock Pro version."));
      return;
    }

    const data = await response.json().catch(() => null);
    setProductTier(data?.isPro || data?.tier === "Pro" ? "Pro" : "Basic");
    setAdminNotice(adminLanguage === "bg" ? "Pro версията е отключена." : "Pro version unlocked.");
    await Promise.all([loadReservations({ silent: true }), loadDiningOrders({ force: true }), loadMenuItems(), loadTableLayout()]);
  }

  async function lockBasicVersion() {
    setAdminError("");
    setAdminNotice("");

    const confirmed = window.confirm(
      adminLanguage === "bg"
        ? "Да върнем ли системата в Basic версия? Поръчки, кухня и сервитьорски роли ще се скрият, но данните няма да бъдат изтрити."
        : "Switch the system back to Basic? Orders, kitchen, and waiter roles will be hidden, but data will not be deleted."
    );

    if (!confirmed) return;

    const code = window.prompt(
      adminLanguage === "bg"
        ? "Въведете developer код за връщане към Basic версия:"
        : "Enter developer code to return to Basic version:"
    );

    if (code === null) return;

    const response = await adminFetch(`${API_BASE_URL}/api/product-tier/lock-basic`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to switch to Basic version."));
      return;
    }

    setProductTier("Basic");
    setDiningOrders([]);
    if (activeTab === "orders") {
      setActiveTab("home");
    }
    setAdminNotice(adminLanguage === "bg" ? "Системата е върната в Basic версия." : "System switched back to Basic version.");
    await Promise.all([loadReservations({ silent: true }), loadMenuItems(), loadTableLayout(), loadAdminUsers(), loadAuditLogs()]);
  }

  async function createAdminUser(event) {
    event.preventDefault();
    setAdminError("");
    setAdminNotice("");

    const response = await adminFetch(`${API_BASE_URL}/api/admin/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(adminUserForm),
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to create admin."));
      return;
    }

    setAdminUserForm({ name: "", email: "", password: "", role: "Administrator" });
    setAdminNotice(adminLanguage === "bg" ? "Админът е създаден." : "Admin created.");
    await Promise.all([loadAdminUsers(), loadAuditLogs()]);
  }

  function startEditingAdminUser(user) {
    setEditingAdminId(getAdminUserId(user));
    setAdminEditForm({
      name: user.name || user.Name || "",
      email: user.email || user.Email || "",
      password: "",
      role: normalizeAdminRole(user.role || user.Role),
      isActive: Boolean(user.isActive ?? user.IsActive ?? true),
    });
  }

  async function saveAdminUser(userId) {
    setAdminError("");
    setAdminNotice("");

    const response = await adminFetch(`${API_BASE_URL}/api/admin/users/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(adminEditForm),
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to update admin."));
      return;
    }

    setEditingAdminId(null);
    setAdminEditForm({ name: "", email: "", password: "", role: "Administrator", isActive: true });
    setAdminNotice(adminLanguage === "bg" ? "Админът е обновен." : "Admin updated.");
    await Promise.all([loadAdminUsers(), loadAuditLogs()]);
  }

  async function deleteAdminUser(user) {
    setAdminError("");
    setAdminNotice("");

    const userId = getAdminUserId(user);
    const userName = user.name || user.Name || user.email || user.Email || "admin";
    const confirmed = window.confirm(
      adminLanguage === "bg"
        ? `Да се изтрие ли админ акаунтът ${userName}?`
        : `Delete admin account ${userName}?`
    );

    if (!confirmed) return;

    const response = await adminFetch(`${API_BASE_URL}/api/admin/users/${userId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to delete admin."));
      return;
    }

    setAdminNotice(adminLanguage === "bg" ? "Админът е изтрит." : "Admin deleted.");
    await Promise.all([loadAdminUsers(), loadAuditLogs()]);
  }

  async function changeOwnPassword(event) {
    event.preventDefault();
    setAdminError("");
    setAdminNotice("");

    if (!ownPasswordForm.currentPassword || !ownPasswordForm.newPassword) {
      setAdminError(adminLanguage === "bg" ? "Въведете текуща и нова парола." : "Enter current and new password.");
      return;
    }

    if (ownPasswordForm.newPassword.length < 8) {
      setAdminError(adminLanguage === "bg" ? "Новата парола трябва да е поне 8 символа." : "New password must be at least 8 characters.");
      return;
    }

    const response = await adminFetch(`${API_BASE_URL}/api/admin/me/password`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ownPasswordForm),
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to change password."));
      return;
    }

    setOwnPasswordForm({ currentPassword: "", newPassword: "" });
    setAdminNotice(adminLanguage === "bg" ? "Паролата е сменена." : "Password changed.");
  }

  async function enableQuickLogin() {
    setAdminError("");
    setAdminNotice("");

    try {
      if (window.PublicKeyCredential && navigator.credentials?.create) {
        await navigator.credentials.create({
          publicKey: {
            challenge: crypto.getRandomValues(new Uint8Array(32)),
            rp: { name: "Casa di Fratelli" },
            user: {
              id: crypto.getRandomValues(new Uint8Array(16)),
              name: adminUser?.email || "admin",
              displayName: adminUser?.name || "Admin",
            },
            pubKeyCredParams: [{ type: "public-key", alg: -7 }],
            authenticatorSelection: { userVerification: "required" },
            timeout: 60000,
          },
        });
      }

      const credentialToken = crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;

      const response = await adminFetch(`${API_BASE_URL}/api/admin/devices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: navigator.userAgent.slice(0, 80),
          credentialToken,
        }),
      });

      if (!response.ok) {
        setAdminError(await readErrorMessage(response, "Failed to enable quick login."));
        return;
      }

      window.localStorage.setItem("admin-device-token", credentialToken);
      setAdminNotice(adminLanguage === "bg" ? "Бързият вход е активиран на това устройство." : "Quick login is enabled on this device.");
      await loadAuditLogs();
    } catch {
      setAdminError(adminLanguage === "bg" ? "Биометричният вход беше отказан." : "Biometric login was cancelled.");
    }
  }

  async function enablePushNotifications() {
    setAdminError("");
    setAdminNotice("");

    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setAdminError(
        adminLanguage === "bg"
          ? "Това устройство или браузър не поддържа push известия. На iPhone/iPad добавете сайта на началния екран, а на Android/компютър разрешете известията в браузъра."
          : "This device or browser does not support push notifications. On iPhone/iPad add the site to the Home Screen; on Android/desktop allow browser notifications."
      );
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      setPushPermission(permission);

      if (permission !== "granted") {
        setAdminError(adminLanguage === "bg" ? "Разрешете известията за Casa di Fratelli." : "Allow notifications for Casa di Fratelli.");
        return;
      }

      const configResponse = await adminFetch(`${API_BASE_URL}/api/admin/push/config`);
      if (!configResponse.ok) {
        setAdminError(await readErrorMessage(configResponse, "Failed to load push configuration."));
        return;
      }

      const { publicKey } = await configResponse.json();
      const registration = await getReadyAdminPushRegistration();
      const existingSubscription = await registration.pushManager.getSubscription();
      const subscription = existingSubscription || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const saveResponse = await adminFetch(`${API_BASE_URL}/api/admin/push/subscriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });

      if (!saveResponse.ok) {
        setAdminError(await readErrorMessage(saveResponse, "Failed to save push subscription."));
        return;
      }

      setPushEnabled(true);
      setAdminNotice(
        adminLanguage === "bg"
          ? "Push известията са включени за това устройство."
          : "Push notifications are enabled for this device."
      );
      showBrowserNotification(
        adminLanguage === "bg" ? "Casa di Fratelli" : "Casa di Fratelli",
        adminLanguage === "bg" ? "Известията са активни на това устройство." : "Notifications are active on this device."
      );
    } catch (error) {
      console.error("Failed to enable push notifications", error);
      setAdminError(
        adminLanguage === "bg"
          ? "Не успях да включа push известията. Презаредете админката, проверете HTTPS и дали уведомленията са разрешени за сайта."
          : "Could not enable push notifications. Reload the admin app, then check HTTPS and site notification permission."
      );
    }
  }

  function isInStatsPeriod(dateValue) {
    if (!dateValue) return false;

    const normalizedDate = String(dateValue).slice(0, 10);
    const today = formatLocalDate(new Date());
    if (statsPeriod === "today") {
      return normalizedDate === today;
    }

    const reservationDate = new Date(dateValue);
    const now = new Date();

    const start = new Date(now);

    if (statsPeriod === "week") {
      start.setDate(now.getDate() - 7);
    }

    if (statsPeriod === "month") {
      start.setMonth(now.getMonth() - 1);
    }

    if (statsPeriod === "year") {
      start.setFullYear(now.getFullYear() - 1);
    }

    return reservationDate >= start;
  }

  function isActiveCustomerReservation(reservation) {
    return reservation.status !== "Cancelled" && !reservation.isNoShow;
  }

  function isReportableVisit(reservation) {
    if (!isActiveCustomerReservation(reservation)) return false;
    if (reservation.createdByAdmin && (reservation.phone === "admin" || reservation.guestName === "Admin block")) return false;
    return true;
  }

  function isUpcomingOperationalReservation(reservation) {
    if (!["Pending", "Approved"].includes(reservation.status)) return false;
    if (reservation.isWalkIn) return false;
    if (reservation.isNoShow || reservation.isArrived) return false;

    const minutes = getReservationMinutesFromNow(reservation);
    return minutes !== null && minutes >= 0;
  }

  function isUpcomingDashboardReservation(reservation) {
    if (!["Pending", "Approved"].includes(reservation.status)) return false;
    if (reservation.isNoShow || reservation.isArrived) return false;

    const minutes = getReservationMinutesFromNow(reservation);
    return minutes !== null && minutes >= 0;
  }

  function isPastDashboardReservation(reservation) {
    const minutes = getReservationMinutesFromNow(reservation);
    return reservation.isNoShow ||
      reservation.isArrived ||
      ["Cancelled", "Released"].includes(reservation.status) ||
      (minutes !== null && minutes < 0);
  }

  function isOrderInStatsPeriod(order) {
    const createdAt = order.createdAtUtc ? new Date(order.createdAtUtc) : null;
    if (!createdAt || Number.isNaN(createdAt.getTime())) return false;
    return isInStatsPeriod(createdAt.toISOString().slice(0, 10));
  }

  const statsReservations = reservations.filter((r) =>
    isInStatsPeriod(r.reservedDate)
  );
  const statsUpcomingReservations = statsReservations.filter(isUpcomingDashboardReservation);
  const statsPastReservations = statsReservations.filter(isPastDashboardReservation);

  const reportsReservations = statsReservations.filter(isReportableVisit);
  const reportsOrders = diningOrders.filter((order) => order.status !== "Cancelled" && isOrderInStatsPeriod(order));
  const walkInReservations = reportsReservations.filter((reservation) => reservation.isWalkIn);
  const reservationReportReservations = reportsReservations.filter((reservation) => !reservation.isWalkIn);
  const siteReservations = reservationReportReservations.filter((reservation) => !reservation.createdByAdmin);
  const adminReservations = reservationReportReservations.filter((reservation) => reservation.createdByAdmin);
  const sumReservationGuests = (items) =>
    items.reduce((total, reservation) => total + Number(reservation.guestCount || 0), 0);
  const siteReservationGuests = sumReservationGuests(siteReservations);
  const adminReservationGuests = sumReservationGuests(adminReservations);
  const walkInGuests = sumReservationGuests(walkInReservations);
  const totalVisitors = siteReservationGuests + adminReservationGuests + walkInGuests;
  const waiterReportRows = Object.values(
    reportsOrders.reduce((acc, order) => {
      const key = order.assignedWaiterId || "unassigned";
      if (!acc[key]) {
        acc[key] = {
          key,
          waiterName: order.assignedWaiterName || (adminLanguage === "bg" ? "Непоети" : "Unassigned"),
          orders: 0,
          revenue: 0,
          tables: new Set(),
        };
      }

      acc[key].orders += 1;
      acc[key].revenue += Number(order.totalPrice || 0);
      String(order.tableLabel || "")
        .split(",")
        .map((table) => table.trim())
        .filter(Boolean)
        .forEach((table) => acc[key].tables.add(table));

      return acc;
    }, {})
  ).map((row) => ({ ...row, tableCount: row.tables.size })).sort((aRow, bRow) => bRow.revenue - aRow.revenue);
  const soldItemRows = Object.values(
    reportsOrders.flatMap((order) => order.items || []).reduce((acc, item) => {
      const key = item.name;
      if (!acc[key]) {
        acc[key] = {
          name: item.name,
          quantity: 0,
          revenue: 0,
        };
      }

      acc[key].quantity += Number(item.quantity || 0);
      acc[key].revenue += Number(item.quantity || 0) * Number(item.unitPrice || 0);
      return acc;
    }, {})
  ).sort((aRow, bRow) => bRow.quantity - aRow.quantity);
  const reportMetrics = [
    {
      label: adminLanguage === "bg" ? "Резервации от сайта" : "Website reservations",
      value: siteReservations.length,
      detail: adminLanguage === "bg" ? "направени от гости" : "made by guests",
    },
    {
      label: adminLanguage === "bg" ? "Резервации от админ" : "Admin reservations",
      value: adminReservations.length,
      detail: adminLanguage === "bg" ? "ръчно въведени" : "entered manually",
    },
    {
      label: adminLanguage === "bg" ? "Без резервация" : "Walk-ins",
      value: walkInReservations.length,
      detail: adminLanguage === "bg" ? "настанявания без резервация" : "seated without reservation",
    },
    {
      label: adminLanguage === "bg" ? "Гости от сайта" : "Website guests",
      value: siteReservationGuests,
      detail: adminLanguage === "bg" ? "хора с онлайн резервации" : "people with online reservations",
    },
    {
      label: adminLanguage === "bg" ? "Гости от админ" : "Admin guests",
      value: adminReservationGuests,
      detail: adminLanguage === "bg" ? "хора с ръчни резервации" : "people with manual reservations",
    },
    {
      label: adminLanguage === "bg" ? "Гости без резервация" : "Walk-in guests",
      value: walkInGuests,
      detail: adminLanguage === "bg" ? "хора настанени директно" : "people seated directly",
    },
    ...(isProVersion
      ? [
          {
            label: adminLanguage === "bg" ? "Онлайн поръчки" : "Online orders",
            value: reportsOrders.length,
            detail: formatEuroAmount(reportsOrders.reduce((total, order) => total + order.totalPrice, 0)),
          },
        ]
      : []),
    {
      label: adminLanguage === "bg" ? "Посетители общо" : "Total visitors",
      value: totalVisitors,
      detail: adminLanguage === "bg" ? "сайт, админ и без резервация" : "site, admin, and walk-ins",
    },
  ];

  const filteredReservations = reservations
    .filter((r) => {
      if (!isUpcomingOperationalReservation(r)) return false;

      const matchesStatus = statusFilter === "All" || r.status === statusFilter;
      const haystack = `${r.guestName} ${r.phone} ${r.email} ${r.tableIds.join(" ")} ${r.reservedDate}`.toLowerCase();

      return matchesStatus && haystack.includes(search.toLowerCase());
    })
    .sort((first, second) => {
      const firstMinutes = getReservationMinutesFromNow(first) ?? 999999;
      const secondMinutes = getReservationMinutesFromNow(second) ?? 999999;
      return firstMinutes - secondMinutes;
    });

  const pendingCount = statsReservations.filter((r) => r.status === "Pending").length;
  const blacklistKeys = new Set(
    blacklist.flatMap((entry) => [
      String(entry.phone || entry.Phone || "").trim().toLowerCase(),
      String(entry.email || entry.Email || "").trim().toLowerCase(),
    ]).filter(Boolean)
  );

  const customerProfileAccumulator = customerProfiles.reduce((acc, profile) => {
    const phone = profile.phone ?? profile.Phone ?? "";
    const email = profile.email ?? profile.Email ?? "";
    const key = getCustomerProfileKey(profile);
    if (!key || key === "—") return acc;

    const firstReservationAt = profile.firstReservationAtUtc ?? profile.FirstReservationAtUtc ?? "";
    const lastReservationAt = profile.lastReservationAtUtc ?? profile.LastReservationAtUtc ?? firstReservationAt;
    const reservationCount = Number(profile.reservationCount ?? profile.ReservationCount ?? 0);
    const profileReservations = (profile.reservations ?? profile.Reservations ?? [])
      .map(normalizeCustomerHistoryReservation)
      .filter((reservation) => reservation.id)
      .sort((first, second) => {
        const firstValue = `${first.reservedDate} ${first.reservedTime}`;
        const secondValue = `${second.reservedDate} ${second.reservedTime}`;
        return secondValue.localeCompare(firstValue);
      });

    acc[key] = {
      key,
      profileId: profile.id ?? profile.Id,
      guestName: profile.guestName ?? profile.GuestName ?? "—",
      phone,
      email,
      count: Math.max(reservationCount, profileReservations.length),
      firstReservation: String(firstReservationAt || formatLocalDate(new Date())).slice(0, 10),
      lastReservation: String(lastReservationAt || firstReservationAt || formatLocalDate(new Date())).slice(0, 10),
      reservations: profileReservations,
      reservationIds: new Set(profileReservations.map((reservation) => Number(reservation.id))),
      isRegularCustomer: Boolean(profile.isRegularCustomer ?? profile.IsRegularCustomer),
      marketingConsent: Boolean(profile.marketingConsent ?? profile.MarketingConsent),
      isManualProfile: reservationCount === 0 && profileReservations.length === 0,
      isBlacklisted:
        blacklistKeys.has(String(phone || "").trim().toLowerCase()) ||
        blacklistKeys.has(String(email || "").trim().toLowerCase()),
    };

    return acc;
  }, {});

  const customers = Object.values(
    reservations.reduce((acc, r) => {
      if (r.createdByAdmin && (r.phone === "admin" || r.guestName === "Admin block")) {
        return acc;
      }

      if (!isActiveCustomerReservation(r)) {
        return acc;
      }

      const key = getReservationCustomerKey(r);
      if (!key || key === "—") return acc;

      if (!acc[key]) {
        return acc;
      }

      const reservationId = Number(r.id);
      const hasReservation = Number.isFinite(reservationId) && acc[key].reservationIds?.has(reservationId);
      acc[key].isManualProfile = false;
      if (!hasReservation) {
        acc[key].reservations.push(r);
        if (Number.isFinite(reservationId)) acc[key].reservationIds?.add(reservationId);
      }
      acc[key].count = Math.max(acc[key].count, acc[key].reservations.length);
      acc[key].guestName = acc[key].guestName === "—" ? r.guestName : acc[key].guestName;
      acc[key].phone = acc[key].phone || r.phone;
      acc[key].email = acc[key].email || r.email;
      if (r.reservedDate < acc[key].firstReservation) {
        acc[key].firstReservation = r.reservedDate;
      }
      if (r.reservedDate > acc[key].lastReservation) {
        acc[key].lastReservation = r.reservedDate;
      }
      acc[key].isRegularCustomer = acc[key].isRegularCustomer || r.isRegularCustomer || acc[key].count >= 5;
      acc[key].marketingConsent = acc[key].marketingConsent || r.marketingConsent;
      acc[key].isBlacklisted =
        acc[key].isBlacklisted ||
        r.isBlacklisted ||
        blacklistKeys.has(String(r.phone || "").trim().toLowerCase()) ||
        blacklistKeys.has(String(r.email || "").trim().toLowerCase());

      return acc;
    }, customerProfileAccumulator)
  ).sort((a, b) => b.count - a.count);

  const ordersByReservationId = React.useMemo(() => {
    const grouped = new Map();

    diningOrders.forEach((order) => {
      if (!order.reservationId || order.status === "Cancelled") return;
      const key = Number(order.reservationId);
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key).push(order);
    });

    return grouped;
  }, [diningOrders]);

  function isInCustomerPeriod(dateValue) {
    if (customerPeriod === "all") return true;
    if (!dateValue) return false;

    const date = new Date(dateValue);
    const now = new Date();
    const start = new Date(now);

    if (customerPeriod === "today") {
      start.setHours(0, 0, 0, 0);
    }

    if (customerPeriod === "week") {
      start.setDate(now.getDate() - 7);
    }

    if (customerPeriod === "month") {
      start.setMonth(now.getMonth() - 1);
    }

    return date >= start;
  }

  const customersForPeriod = customers
    .map((customer) => {
      const periodReservations = customer.reservations.filter((reservation) =>
        isInCustomerPeriod(reservation.reservedDate)
      );

      return {
        ...customer,
        periodCount: customer.isManualProfile
          ? customerPeriod === "all" || isInCustomerPeriod(customer.firstReservation)
            ? 1
            : 0
          : customerPeriod === "all"
            ? customer.count
            : periodReservations.length,
        periodReservations: customerPeriod === "all" ? customer.reservations : periodReservations,
      };
    })
    .filter((customer) => customer.periodCount > 0);

  const visibleCustomersForPeriod = customersMode === "website"
    ? customersForPeriod.filter((customer) => Boolean(String(customer.email || "").trim()) && !customer.isManualProfile)
    : customersForPeriod;

  const sortedCustomers = [...visibleCustomersForPeriod].sort((first, second) => {
    if (customerSort === "new") {
      return new Date(second.firstReservation) - new Date(first.firstReservation);
    }

    if (customerSort === "recent") {
      return new Date(second.lastReservation) - new Date(first.lastReservation);
    }

    if (customerSort === "name") {
      return first.guestName.localeCompare(
        second.guestName,
        adminLanguage === "ru" ? "ru" : adminLanguage === "bg" ? "bg" : "en"
      );
    }

    return second.periodCount - first.periodCount || second.count - first.count;
  });

  const visibleNewCustomersCount = visibleCustomersForPeriod.filter((customer) =>
    isInCustomerPeriod(customer.firstReservation)
  ).length;
  const totalCustomerVisits = visibleCustomersForPeriod.reduce((total, customer) => total + customer.periodCount, 0);

  const a = adminText[adminLanguage] || adminText.bg;

  const menuCategories = React.useMemo(() => {
    const grouped = new Map();

    menuItems
      .filter((item) => normalizeDepartment(getValue(item, "department")) === selectedMenuDepartment)
      .forEach((item) => {
      const category = normalizeCategory(item.category || item.Category);

      if (!grouped.has(category)) {
        grouped.set(category, {
          id: category,
          label: getCategoryLabel(category, adminLanguage),
          count: 0,
          activeCount: 0,
          items: [],
        });
      }

      const group = grouped.get(category);
      group.count += 1;
      if ((item.isActive ?? item.IsActive ?? true) === true) {
        group.activeCount += 1;
      }
      group.items.push(item);
    });

    return Array.from(grouped.values()).sort((first, second) =>
      first.label.localeCompare(second.label, adminLanguage === "ru" ? "ru" : adminLanguage === "bg" ? "bg" : "en")
    );
  }, [adminLanguage, menuItems, selectedMenuDepartment]);

  const menuDepartmentCounts = React.useMemo(() => {
    return menuDepartmentOptions.map((department) => {
      const items = menuItems.filter((item) => normalizeDepartment(getValue(item, "department")) === department.value);
      return {
        ...department,
        count: items.length,
        activeCount: items.filter((item) => (getValue(item, "isActive") ?? true) === true).length,
      };
    });
  }, [menuItems]);

  React.useEffect(() => {
    if (menuMode !== "list") return;

    if (menuCategories.length === 0) {
      if (selectedMenuCategory) setSelectedMenuCategory("");
      return;
    }

    if (!selectedMenuCategory || !menuCategories.some((category) => category.id === selectedMenuCategory)) {
      setSelectedMenuCategory(menuCategories[0].id);
    }
  }, [menuCategories, menuMode, selectedMenuCategory]);

  const selectedCategoryData =
    menuCategories.find((category) => category.id === selectedMenuCategory) || menuCategories[0];
  const selectedCategoryItems = selectedCategoryData?.items || [];
  const todayInput = React.useMemo(() => formatLocalDate(new Date()), []);
  const availableAdminReservationTimes = React.useMemo(
    () => getAvailableReservationTimesForDate(adminReservationTimes, adminReservation.reservedDate),
    [adminReservation.reservedDate]
  );
  const availableHallBlockTimes = React.useMemo(
    () => getAvailableReservationTimesForDate(adminReservationTimes, hallBlock.reservedDate),
    [hallBlock.reservedDate]
  );

  React.useEffect(() => {
    if (!adminReservation.reservedTime) return;
    if (!isPastTimeForDate(adminReservation.reservedDate, adminReservation.reservedTime)) return;

    setAdminReservation((prev) => ({
      ...prev,
      reservedTime: "",
      tableIds: "",
    }));
  }, [adminReservation.reservedDate, adminReservation.reservedTime]);

  React.useEffect(() => {
    if (!hallBlock.reservedDate) return;
    const nextPatch = {};

    if (hallBlock.startTime && isPastTimeForDate(hallBlock.reservedDate, hallBlock.startTime)) {
      nextPatch.startTime = "";
    }

    if (hallBlock.endTime && isPastTimeForDate(hallBlock.reservedDate, hallBlock.endTime)) {
      nextPatch.endTime = "";
    }

    if (Object.keys(nextPatch).length === 0) return;
    setHallBlock((prev) => ({
      ...prev,
      ...nextPatch,
    }));
  }, [hallBlock.reservedDate, hallBlock.startTime, hallBlock.endTime]);

  const adminReservationTableIds = getAdminReservationTableIds();
  const adminReservationUnavailableTableIds = getUnavailableTableIdsForSlot(
    reservations,
    adminReservation.reservedDate,
    adminReservation.reservedTime
  );
  const reservationAreaOptions = [
    {
      value: "indoor",
      title: adminLanguage === "bg" ? "Зала / непушачи" : "Hall / non-smoking",
      subtitle: adminLanguage === "bg" ? "Тиха вътрешна зала" : "Quiet indoor hall",
      meta: `${activeTableIdsByArea.indoor.length} ${adminLanguage === "bg" ? "маси" : "tables"}`,
    },
    {
      value: "garden",
      title: adminLanguage === "bg" ? "Покрита тераса" : "Covered terrace",
      subtitle: adminLanguage === "bg" ? "Зона за пушачи" : "Smoking area",
      meta: `${activeTableIdsByArea.garden.length} ${adminLanguage === "bg" ? "маси" : "tables"}`,
    },
    {
      value: "openTerrace",
      title: adminLanguage === "bg" ? "Открита тераса" : "Open terrace",
      subtitle: adminLanguage === "bg" ? "Навън, компактна зона" : "Outdoor compact area",
      meta: `${activeTableIdsByArea.openTerrace.length} ${adminLanguage === "bg" ? "маси" : "tables"}`,
    },
  ];
  const hallBlockAreaOptions = [
    {
      value: "all",
      title: adminLanguage === "bg" ? "Целият ресторант" : "Whole restaurant",
      subtitle: adminLanguage === "bg" ? "Всички зали и тераси" : "All halls and terraces",
      meta: `${activeTableIdsByArea.all.length} ${adminLanguage === "bg" ? "маси" : "tables"}`,
    },
    ...reservationAreaOptions,
  ];
  const categoryOptions = menuCategories.length
    ? menuCategories
    : Object.keys(categoryDisplayNames[adminLanguage]).map((category) => ({
        id: category,
        label: getCategoryLabel(category, adminLanguage),
        count: 0,
        activeCount: 0,
        items: [],
      }));

  const tabs = React.useMemo(
    () => isProductionRole && isProVersion
      ? [
          ["orders", isBarRole ? (adminLanguage === "bg" ? "Бар" : "Bar") : (adminLanguage === "bg" ? "Кухня" : "Kitchen")],
        ]
      : isWaiterRole && isProVersion
      ? [
          ["liveMap", a.tabs.liveMap],
          ["orders", a.tabs.orders],
        ]
      : [
          ["liveMap", a.tabs.liveMap],
          ["reservations", a.tabs.reservations],
          ...(isProVersion ? [["orders", a.tabs.orders]] : []),
          ["reports", a.tabs.reports],
          ...(isProVersion ? [["inventory", a.tabs.inventory]] : []),
          ["block", a.tabs.block],
          ["menu", a.tabs.menu],
          ["events", a.tabs.events],
          ...(canViewFeedback ? [["feedback", a.tabs.feedback]] : []),
          ...(canManageMarketing ? [["marketing", a.tabs.marketing]] : []),
          ["layout", a.tabs.layout],
          ["customers", a.tabs.customers],
          ...(canUseMaintenance ? [["maintenance", a.tabs.maintenance]] : []),
          ...(canManageAdmins ? [["admins", adminLanguage === "bg" ? "Админи" : "Admins"]] : []),
        ],
    [a.tabs, adminLanguage, canManageAdmins, canManageMarketing, canUseMaintenance, canViewFeedback, isBarRole, isProductionRole, isProVersion, isWaiterRole]
  );
  const readyWaiterItemsCount = React.useMemo(
    () => isWaiterRole
      ? diningOrders.reduce((count, order) => count + (order.items || []).filter((item) => item.status === "Ready").length, 0)
      : 0,
    [diningOrders, isWaiterRole]
  );
  const newWaiterItemsCount = React.useMemo(
    () => isWaiterRole
      ? diningOrders.reduce((count, order) => count + (order.items || []).filter((item) => item.source === "GuestOnline" && !item.waiterSeenAtUtc).length, 0)
      : 0,
    [diningOrders, isWaiterRole]
  );
  const allowedTabKeys = React.useMemo(() => new Set(["home", "profile", ...tabs.map(([key]) => key)]), [tabs]);
  const dashboardNavigationGroups = React.useMemo(() => {
    const operationKeys = new Set(["liveMap", "reservations", "block", "orders"]);
    const operationTabs = tabs.filter(([key]) => operationKeys.has(key));
    const managementTabs = tabs.filter(([key]) => !operationKeys.has(key));

    return [
      {
        key: "operations",
        title: adminLanguage === "bg" ? "Резервации и поръчки" : "Reservations and orders",
        subtitle:
          adminLanguage === "bg"
            ? "Бърз достъп до залата, календарите и текущите консумации."
            : "Fast access to the floor, calendars, and live consumption.",
        icon: "reservations",
        tabs: operationTabs,
      },
      {
        key: "management",
        title: adminLanguage === "bg" ? "Управление" : "Management",
        subtitle:
          adminLanguage === "bg"
            ? "Меню, клиенти, отчети, разпределение и админ настройки."
            : "Menu, guests, reports, layout, and admin settings.",
        icon: "layout",
        tabs: managementTabs,
      },
    ].filter((group) => group.tabs.length > 0);
  }, [adminLanguage, tabs]);

  React.useEffect(() => {
    if (!allowedTabKeys.has(activeTab)) {
      setActiveTab(isProVersion && (isWaiterRole || isProductionRole) ? "orders" : "home");
    }
  }, [activeTab, allowedTabKeys, isProductionRole, isProVersion, isWaiterRole]);

  const refreshActiveTab = React.useCallback(async ({ silent = false } = {}) => {
    if (activeTab === "home") {
      await Promise.all([
        ...(isWaiterRole || isProductionRole ? [] : [loadReservations({ silent }), loadBlacklist()]),
        ...(isProVersion ? [loadDiningOrders()] : []),
        ...(isProductionRole ? [] : [loadTableLayout()]),
      ]);
      return;
    }

    if (activeTab === "orders" && isProVersion) {
      await Promise.all([loadDiningOrders(), loadMenuItems()]);
      return;
    }

    if (activeTab === "reports" && !isWaiterRole && !isProductionRole) {
      await Promise.all([
        loadReservations({ silent }),
        ...(isProVersion ? [loadDiningOrders()] : []),
      ]);
      return;
    }

    if (activeTab === "menu" && !isWaiterRole) {
      await loadMenuItems();
      return;
    }

    if (activeTab === "events" && !isWaiterRole && !isProductionRole) {
      await loadEvents();
      return;
    }

    if (activeTab === "feedback" && canViewFeedback) {
      await loadFeedbackEntries();
      return;
    }

    if (activeTab === "blacklist" && !isWaiterRole) {
      await loadBlacklist();
      return;
    }

    if (activeTab === "layout") {
      await loadTableLayout();
      return;
    }

    if (activeTab === "admins" && canManageAdmins) {
      await Promise.all([loadAdminUsers(), loadAuditLogs()]);
      return;
    }

    if (activeTab === "liveMap") {
      await Promise.all([
        ...(isWaiterRole ? [loadMenuItems()] : [loadReservations({ silent }), ...(isProVersion ? [loadMenuItems()] : [])]),
        ...(isProVersion ? [loadDiningOrders()] : []),
        loadTableLayout(),
      ]);
      return;
    }

    if (!isWaiterRole && !isProductionRole) {
      await loadReservations({ silent });
    }
  }, [
    activeTab,
    canManageAdmins,
    canViewFeedback,
    isProductionRole,
    isProVersion,
    isWaiterRole,
    loadAdminUsers,
    loadAuditLogs,
    loadBlacklist,
    loadDiningOrders,
    loadEvents,
    loadFeedbackEntries,
    loadMenuItems,
    loadReservations,
    loadTableLayout,
  ]);

  const refreshLiveData = React.useCallback(async () => {
    await Promise.all([
      ...(isProductionRole ? [] : [loadReservations({ silent: true })]),
      loadDiningOrders({ silent: true }),
    ]);
  }, [isProductionRole, loadDiningOrders, loadReservations]);

  const shouldPauseLiveDataRefresh = Boolean(
    showCreateReservation ||
    menuMode !== "list" ||
    eventMode !== "list" ||
    blacklistMode !== "list" ||
    Object.keys(tableEdits).length > 0 ||
    Object.keys(noteEdits).length > 0 ||
    Object.values(orderMenuSearches).some((value) => String(value || "").trim())
  );

  React.useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return undefined;
    const liveDataTabs = new Set(["home", "liveMap", "reservations", "orders"]);

    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (!liveDataTabs.has(activeTab)) return;
      if (shouldPauseLiveDataRefresh) return;
      void refreshLiveData();
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [activeTab, refreshLiveData, shouldPauseLiveDataRefresh]);

  React.useEffect(() => {
    if (isProductionRole) {
      const productionKind = isBarRole ? "Drink" : "Dish";
      const productionLabel = isBarRole
        ? adminLanguage === "bg" ? "бара" : "bar"
        : adminLanguage === "bg" ? "кухнята" : "kitchen";
      const orderIdsRef = isBarRole ? seenBarOrderIdsRef : seenKitchenOrderIdsRef;
      const itemIdsRef = isBarRole ? seenBarItemIdsRef : seenKitchenItemIdsRef;
      const activeOrderIds = diningOrders
        .filter((order) => !["Done", "Cancelled"].includes(order.status))
        .filter((order) => (order.items || []).some((item) => item.kind === productionKind))
        .map((order) => order.id);
      const newOrderIds = activeOrderIds.filter((id) => !orderIdsRef.current.has(id));
      const hadSeenOrders = orderIdsRef.current.size > 0;

      activeOrderIds.forEach((id) => orderIdsRef.current.add(id));
      if (hadSeenOrders && newOrderIds.length > 0) {
        const firstOrder = diningOrders.find((order) => order.id === newOrderIds[0]);
        const title = adminLanguage === "bg" ? `Нова поръчка за ${productionLabel}` : `New ${productionLabel} order`;
        const body = firstOrder
          ? `${adminLanguage === "bg" ? "Маса" : "Table"} ${firstOrder.tableLabel} · #${firstOrder.id}`
          : title;
        setAdminNotice(`${title}${firstOrder ? ` · ${body}` : "."}`);
        showBrowserNotification(title, body);
      }

      const newKitchenItems = diningOrders.flatMap((order) =>
        (order.items || [])
          .filter((item) => item.status === "New" && item.kind === productionKind)
          .map((item) => ({ id: item.id, name: item.name, tableLabel: order.tableLabel }))
      );
      const unseenKitchenItems = newKitchenItems.filter((item) => !itemIdsRef.current.has(item.id));
      const hadSeenKitchenItems = itemIdsRef.current.size > 0;

      newKitchenItems.forEach((item) => itemIdsRef.current.add(item.id));
      if (hadSeenKitchenItems && unseenKitchenItems.length > 0) {
        const first = unseenKitchenItems[0];
        const title = adminLanguage === "bg" ? `Нова позиция за ${productionLabel}` : `New ${productionLabel} item`;
        const body = `${first.name} · ${adminLanguage === "bg" ? "маса" : "table"} ${first.tableLabel}`;
        setAdminNotice(`${title} · ${body}`);
        showBrowserNotification(title, body);
      }
    }

    if (isWaiterRole) {
      const guestItems = diningOrders.flatMap((order) =>
        (order.items || [])
          .filter((item) => item.source === "GuestOnline" && !item.waiterSeenAtUtc)
          .map((item) => ({ id: item.id, name: item.name, kind: item.kind, tableLabel: order.tableLabel }))
      );
      const newGuestItems = guestItems.filter((item) => !seenWaiterGuestItemIdsRef.current.has(item.id));
      const hadSeenGuestItems = seenWaiterGuestItemIdsRef.current.size > 0;

      guestItems.forEach((item) => seenWaiterGuestItemIdsRef.current.add(item.id));
      if (hadSeenGuestItems && newGuestItems.length > 0) {
        const first = newGuestItems[0];
        const title = first.kind === "BillRequest"
          ? adminLanguage === "bg" ? "Клиент поиска сметка" : "Guest requested bill"
          : first.kind === "WaiterCall"
          ? adminLanguage === "bg" ? "Клиент повика сервитьор" : "Guest called waiter"
          : adminLanguage === "bg" ? "Нова онлайн добавка" : "New online addition";
        const body = first.kind === "Dish"
          ? `${first.name} · ${adminLanguage === "bg" ? "маса" : "table"} ${first.tableLabel}`
          : `${adminLanguage === "bg" ? "маса" : "table"} ${first.tableLabel}`;
        setAdminNotice(`${title} · ${body}`);
        showBrowserNotification(title, body);
      }

      const readyItems = diningOrders.flatMap((order) =>
        (order.items || [])
          .filter((item) => item.status === "Ready")
          .map((item) => ({ id: item.id, name: item.name, tableLabel: order.tableLabel }))
      );
      const newReadyItems = readyItems.filter((item) => !seenReadyItemIdsRef.current.has(item.id));
      const hadSeenReadyItems = seenReadyItemIdsRef.current.size > 0;

      readyItems.forEach((item) => seenReadyItemIdsRef.current.add(item.id));
      if (hadSeenReadyItems && newReadyItems.length > 0) {
        const first = newReadyItems[0];
        setAdminNotice(
          adminLanguage === "bg"
            ? `Готово блюдо: ${first.name} · маса ${first.tableLabel}`
            : `Ready dish: ${first.name} · table ${first.tableLabel}`
        );
        showBrowserNotification(
          adminLanguage === "bg" ? "Готово блюдо" : "Dish ready",
          `${first.name} · ${adminLanguage === "bg" ? "маса" : "table"} ${first.tableLabel}`
        );
      }
    }
  }, [adminLanguage, diningOrders, isBarRole, isProductionRole, isWaiterRole]);

  const isDashboard = activeTab === "home";
  const activeTabLabel =
    activeTab === "profile"
      ? (adminLanguage === "bg" ? "Моят профил" : "My profile")
      : tabs.find(([key]) => key === activeTab)?.[1] || a.appTitle;
  const todayDashboardReservations = reservations
    .filter((reservation) => reservation.reservedDate === formatLocalDate(new Date()))
    .sort((first, second) => first.reservedTime.localeCompare(second.reservedTime, undefined, { numeric: true }));
  const upcomingDashboardReservations = (statsPeriod === "today" ? todayDashboardReservations : reservations)
    .filter(isUpcomingDashboardReservation)
    .sort((first, second) => {
      const firstMinutes = getReservationMinutesFromNow(first) ?? 999999;
      const secondMinutes = getReservationMinutesFromNow(second) ?? 999999;
      return firstMinutes - secondMinutes;
    })
    .slice(0, 5);
  const pastDashboardReservations = todayDashboardReservations
    .filter(isPastDashboardReservation)
    .sort((first, second) => second.reservedTime.localeCompare(first.reservedTime, undefined, { numeric: true }))
    .slice(0, 5);
  const dashboardReservationSections = statsPeriod === "today"
    ? [
        {
          key: "all-today",
          title: adminLanguage === "bg" ? "Всички резервации днес" : "All reservations today",
          empty: adminLanguage === "bg" ? "Няма резервации за днес." : "No reservations for today.",
          items: todayDashboardReservations,
        },
        {
          key: "upcoming-today",
          title: adminLanguage === "bg" ? "Чакащи / предстоящи" : "Pending / upcoming",
          empty: adminLanguage === "bg" ? "Няма предстоящи резервации за днес." : "No upcoming reservations for today.",
          items: upcomingDashboardReservations,
        },
        {
          key: "past-today",
          title: adminLanguage === "bg" ? "Изминали" : "Past",
          empty: adminLanguage === "bg" ? "Няма изминали резервации за днес." : "No past reservations for today.",
          items: pastDashboardReservations,
        },
      ]
    : [
        {
          key: "upcoming",
          title: adminLanguage === "bg" ? "Следващите 5 резервации" : "Next 5 reservations",
          empty: adminLanguage === "bg"
            ? "Няма предстоящи резервации за показване."
            : "No upcoming reservations to show.",
          items: upcomingDashboardReservations,
        },
      ];
  const recentDashboardOrders = diningOrders
    .filter((order) => !["Done", "Cancelled"].includes(order.status))
    .slice(0, 5);

  return (
    <div className="admin-page luxury-shell min-h-screen text-white">
      <div className="mx-auto max-w-[1500px] px-5 py-8 md:px-8">
        <div className={`admin-hero-panel luxury-panel relative mb-8 rounded-[28px] flex flex-col ${
          isDashboard
            ? "min-h-[236px] p-6 pr-24 pb-24 md:min-h-[232px] md:p-8 md:pr-32 md:pb-8"
            : "min-h-[156px] p-4 pr-20 pb-24 md:min-h-[148px] md:p-5 md:pr-32 md:pb-5"
        }`}>
          <button
            type="button"
            onClick={() => setActiveTab("profile")}
            className={`admin-profile-anchor absolute right-5 top-5 flex h-16 w-12 items-center justify-center rounded-[22px] border p-1 transition md:right-7 md:top-7 ${
              activeTab === "profile"
                ? "border-[#f2d39a]/60 bg-[#c9a56a]/18 text-[#f2d39a]"
                : "border-white/10 bg-black/20 text-white/75 hover:border-[#c9a56a]/35 hover:text-[#f2d39a]"
            }`}
            title={adminLanguage === "bg" ? "Моят профил" : "My profile"}
            aria-label={adminLanguage === "bg" ? "Моят профил" : "My profile"}
          >
            <RoleProfileIcon role={adminUser?.role} className="h-full w-full rounded-[18px]" />
          </button>

          <div className={isDashboard ? "max-w-[760px]" : "pr-2"}>
            <img
              src="/casa-di-fratelli-logo.svg"
              alt="Casa di Fratelli"
              className={`brand-logo object-left ${isDashboard ? "mb-5 h-16 w-[220px]" : "h-12 w-[168px]"}`}
            />
            {isDashboard && (
              <>
                <p className="section-kicker">
                  Casa di Fratelli Admin OS
                </p>
                <h1 className="admin-hero-title mt-3 text-4xl font-semibold text-[#fff4df] md:text-5xl">
                  {a.appTitle}
                </h1>
              </>
            )}
          </div>

          <div
            className={`admin-header-controls absolute bottom-5 right-5 flex w-auto items-center justify-end gap-3 ${
              isDashboard
                ? "md:bottom-7 md:right-7"
                : "md:bottom-auto md:right-32 md:top-1/2 md:-translate-y-1/2"
            }`}
          >
            <div className="flex rounded-full border border-white/10 bg-black/20 p-1">
              {["bg", "en", "ru"].map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setAdminLanguage(lang)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    adminLanguage === lang ? "luxury-button" : "text-white/70 hover:text-white"
                  }`}
                  aria-label={`${a.language}: ${lang.toUpperCase()}`}
                >
                  {lang.toUpperCase()}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => refreshActiveTab()}
                className="ghost-button flex h-12 w-12 items-center justify-center rounded-full text-white/80"
                title={a.refresh}
                aria-label={a.refresh}
              >
                <RefreshIcon />
              </button>
              {onToggleTheme ? (
                <button
                  type="button"
                  onClick={onToggleTheme}
                  className="ghost-button flex h-12 w-12 items-center justify-center rounded-full text-white/80"
                  title={theme === "light" ? "Dark" : "Light"}
                  aria-label={theme === "light" ? "Dark" : "Light"}
                >
                  <ThemeIcon theme={theme} />
                </button>
              ) : null}
            </div>
          </div>
        </div>
        {isDashboard ? (
          <>
            <div className="mb-4 flex flex-wrap gap-2">
              {[
                ["today", a.stats.today],
                ["week", a.stats.week],
                ["month", a.stats.month],
                ["year", a.stats.year],
              ].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setStatsPeriod(key)}
                  className={`rounded-full px-4 py-2 text-sm transition ${
                    statsPeriod === key ? "luxury-button" : "ghost-button"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className={`mb-8 grid gap-4 ${isOperationalRole ? "md:grid-cols-2" : isProVersion ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
              {!isOperationalRole && <StatCard label={a.stats.allReservations} value={statsReservations.length} />}
              {!isOperationalRole && (
                <StatCard
                  label={statsPeriod === "today" ? (adminLanguage === "bg" ? "Чакащи" : "Upcoming") : a.stats.pending}
                  value={statsPeriod === "today" ? statsUpcomingReservations.length : pendingCount}
                />
              )}
              {!isOperationalRole && (
                <StatCard
                  label={adminLanguage === "bg" ? "Изминали" : "Past"}
                  value={statsPastReservations.length}
                />
              )}
              {isProVersion && <StatCard label={a.stats.orders} value={diningOrders.length} />}
            </div>

            <div className="mb-8 grid gap-4 xl:grid-cols-2">
              {dashboardNavigationGroups.map((group) => (
                <section
                  key={group.key}
                  className="relative overflow-hidden rounded-[28px] border border-white/10 bg-black/20 p-4 shadow-2xl shadow-black/15"
                >
                  <div className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full border border-[#c9a56a]/10 bg-[#c9a56a]/5" />
                  <div className="relative mb-4 flex items-start gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#f2d39a]/18 bg-[#c9a56a]/10 text-[#f2d39a]">
                      <AdminNavIcon type={group.icon} />
                    </div>
                    <div>
                      <div className="section-kicker">{group.title}</div>
                      <p className="mt-2 text-sm leading-5 text-white/45">
                        {group.subtitle}
                      </p>
                    </div>
                  </div>

                  <div className="relative grid gap-2 sm:grid-cols-2">
                    {group.tabs.map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
	                        onClick={() => setActiveTab(key)}
	                        className={`group flex min-h-[82px] items-center gap-3 rounded-[20px] border border-white/10 bg-white/[0.035] p-3 text-left transition hover:border-[#c9a56a]/45 hover:bg-[#c9a56a]/10 ${
	                          key === "liveMap" && newWaiterItemsCount > 0
	                            ? "waiter-new-alert"
	                            : key === "orders" && readyWaiterItemsCount > 0
	                            ? "waiter-ready-alert"
	                            : ""
	                        }`}
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-black/20 text-[#f2d39a] transition group-hover:border-[#f2d39a]/30 group-hover:bg-[#c9a56a]/12">
                          <AdminNavIcon type={key} className="h-6 w-6" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-[#fff4df]">
                            {label}
                          </span>
                          <span className="mt-1 block text-xs uppercase tracking-[0.16em] text-white/35">
                            {group.key === "operations"
                              ? adminLanguage === "bg" ? "Оперативно" : "Operations"
                              : adminLanguage === "bg" ? "Контрол" : "Control"}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <div className={`mb-8 grid gap-5 ${isOperationalRole ? "" : "xl:grid-cols-2"}`}>
              {!isOperationalRole && (
              <div className="rounded-[26px] border border-white/10 bg-black/20 p-4 md:p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="section-kicker">
                      {adminLanguage === "bg" ? "Резервации" : "Reservations"}
                    </div>
                    <h2 className="mt-2 text-2xl font-semibold text-[#fff4df]">
                      {statsPeriod === "today"
                        ? (adminLanguage === "bg" ? "Днешни резервации" : "Today's reservations")
                        : (adminLanguage === "bg" ? "Следващите 5 резервации" : "Next 5 reservations")}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab("reservations")}
                    className="ghost-button hidden rounded-full px-4 py-2 text-sm font-semibold sm:block"
                  >
                    {a.tabs.reservations}
                  </button>
                </div>

                <div className="grid gap-5">
                  {dashboardReservationSections.map((section) => (
                    <section key={section.key}>
                      {statsPeriod === "today" && (
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#f2d39a]">
                            {section.title}
                          </h3>
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/55">
                            {section.items.length}
                          </span>
                        </div>
                      )}
                      {section.items.length === 0 ? (
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/55">
                          {section.empty}
                        </div>
                      ) : (
                        <div className="grid gap-3 sm:grid-cols-2">
                          {section.items.map((reservation) => (
                            <button
                              key={`${section.key}-${reservation.id}`}
                              type="button"
                              onClick={() => {
                                setExpandedId(reservation.id);
                                setSearch("");
                                setStatusFilter("All");
                                setActiveTab("reservations");
                              }}
                              className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-left transition hover:border-[#c9a56a]/45 hover:bg-[#c9a56a]/10"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <span className="min-w-0 truncate text-base font-semibold text-[#fff4df]">
                                  {reservation.guestName}
                                </span>
                                <span className="shrink-0 rounded-full border border-[#f2d39a]/20 bg-[#c9a56a]/12 px-2.5 py-1 text-xs font-semibold text-[#f2d39a]">
                                  {reservation.reservedTime}
                                </span>
                              </div>
                              <div className="mt-3 text-xs leading-5 text-white/50">
                                {reservation.reservedDate} · {reservation.guestCount} {a.liveMap.guests}
                              </div>
                              <div className="mt-1 text-xs text-white/40">
                                {a.liveMap.table} {reservation.tableIds.join(", ")}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </section>
                  ))}
                </div>
              </div>
              )}

              {isProVersion && <div className="rounded-[26px] border border-white/10 bg-black/20 p-4 md:p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="section-kicker">
                      {adminLanguage === "bg" ? "Поръчки" : "Orders"}
                    </div>
                    <h2 className="mt-2 text-2xl font-semibold text-[#fff4df]">
                      {adminLanguage === "bg" ? "Активни поръчки" : "Active orders"}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab("orders")}
                    className="ghost-button hidden rounded-full px-4 py-2 text-sm font-semibold sm:block"
                  >
                    {a.tabs.orders}
                  </button>
                </div>

                {recentDashboardOrders.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/55">
                    {adminLanguage === "bg"
                      ? "Няма активни поръчки за показване."
                      : "No active orders to show."}
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {recentDashboardOrders.map((order) => (
                      <button
                        key={order.id}
                        type="button"
                        onClick={() => {
                          setExpandedOrderId(order.id);
                          setActiveTab("orders");
                        }}
	                        className={`rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-left transition hover:border-[#c9a56a]/45 hover:bg-[#c9a56a]/10 ${
	                          isWaiterRole && hasUnseenGuestItems(order)
	                            ? "waiter-new-alert"
	                            : isWaiterRole && hasReadyDiningItems(order)
	                            ? "waiter-ready-alert"
	                            : ""
	                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span className="min-w-0 truncate text-base font-semibold text-[#fff4df]">
                            {order.tableLabel}
                          </span>
                          <span className="shrink-0 rounded-full border border-emerald-300/20 bg-emerald-400/12 px-2.5 py-1 text-xs font-semibold text-emerald-100">
                            {order.status}
                          </span>
                        </div>
                        <div className="mt-3 truncate text-xs leading-5 text-white/50">
                          {order.guestName || "—"} · {formatEuroAmount(order.totalPrice)}
                        </div>
	                        {isWaiterRole && hasWaiterAttentionItems(order) && (
	                          <div className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
	                            hasUnseenGuestItems(order)
	                              ? "border-amber-300/30 bg-amber-400/15 text-amber-100"
	                              : "border-emerald-300/30 bg-emerald-400/15 text-emerald-100"
	                          }`}>
	                            {hasUnseenGuestItems(order)
	                              ? adminLanguage === "bg" ? "Нова добавка" : "New addition"
	                              : adminLanguage === "bg" ? "Има готово блюдо" : "Ready dish"}
	                          </div>
	                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>}
            </div>
          </>
        ) : (
          <div className="mb-8 flex flex-col gap-3 rounded-[22px] border border-white/10 bg-black/20 p-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => setActiveTab("home")}
              className="ghost-button w-full rounded-2xl px-4 py-3 text-sm font-semibold sm:w-auto"
            >
              ← {adminLanguage === "bg" ? "Назад" : "Back"}
            </button>
            <div className="px-2 text-sm font-semibold uppercase tracking-[0.2em] text-[#c9a56a]">
              {activeTabLabel}
            </div>
          </div>
        )}

        {adminError && (
          <div className="mb-6 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {adminError}
          </div>
        )}

        {adminNotice && (
          <div className="mb-6 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {adminNotice}
          </div>
        )}

        {loading && !isDashboard ? (
          <Panel title="Loading">Loading...</Panel>
        ) : !isDashboard ? (
          <>
            {activeTab === "profile" && (
              <Panel
                title={adminLanguage === "bg" ? "Моят профил" : "My profile"}
                subtitle={
                  adminLanguage === "bg"
                    ? "Личен достъп, смяна на парола и изход от системата."
                    : "Personal access, password change, and logout."
                }
                right={
                  <button
                    type="button"
                    onClick={onAdminLogout}
                    className="rounded-2xl border border-red-300/25 bg-red-500/12 px-5 py-3 text-sm font-semibold text-red-100 transition hover:bg-red-500/20"
                  >
                    {adminLanguage === "bg" ? "Изход" : "Logout"}
                  </button>
                }
              >
                <div className="grid gap-5 xl:grid-cols-[0.75fr_1.25fr]">
                  <div className="rounded-[26px] border border-white/10 bg-black/20 p-5 text-center md:p-6">
                    <RoleProfileIcon role={adminUser?.role} className="mx-auto h-48 w-32 md:h-56 md:w-36" />
                    <h3 className="mt-5 text-2xl font-semibold text-[#fff4df]">
                      {adminUser?.name || adminUser?.email || "Admin"}
                    </h3>
                    <div className="mt-2 text-sm text-white/45">{adminUser?.email}</div>
                    <div className="mt-4 inline-flex rounded-full border border-[#f2d39a]/20 bg-[#c9a56a]/12 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#f2d39a]">
                      {getAdminRoleLabel(adminUser?.role, adminLanguage)}
                    </div>
                  </div>

                  <div className="grid gap-5">
                    <div className="rounded-[26px] border border-white/10 bg-black/20 p-5 md:p-6">
                      <div className="section-kicker">
                        {adminLanguage === "bg" ? "Известия" : "Notifications"}
                      </div>
                      <h3 className="mt-2 text-2xl font-semibold text-[#fff4df]">
                        {adminLanguage === "bg" ? "Push известия на това устройство" : "Push notifications on this device"}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-white/45">
                        {adminLanguage === "bg"
                          ? "Включете ги на всяко устройство, което трябва да получава известие при нова потвърдена резервация."
                          : "Enable them on every device that should receive an alert for each new confirmed reservation."}
                      </p>
                      <p className="mt-2 text-xs leading-5 text-white/35">
                        {adminLanguage === "bg"
                          ? "Компютър и Android работят директно от браузъра. На iPhone/iPad първо добавете админката на началния екран и я отворете от иконата."
                          : "Desktop and Android work directly from the browser. On iPhone/iPad, first add the admin to the Home Screen and open it from the icon."}
                      </p>
                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={enablePushNotifications}
                          className="luxury-button rounded-2xl px-6 py-3 text-sm font-semibold"
                        >
                          {pushEnabled
                            ? adminLanguage === "bg" ? "Включени са" : "Enabled"
                            : adminLanguage === "bg" ? "Включи известия" : "Enable notifications"}
                        </button>
                        <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
                          {pushPermission === "granted"
                            ? adminLanguage === "bg" ? "разрешени" : "allowed"
                            : pushPermission === "denied"
                              ? adminLanguage === "bg" ? "блокирани" : "blocked"
                              : pushPermission === "unsupported"
                                ? adminLanguage === "bg" ? "неподдържани" : "unsupported"
                                : adminLanguage === "bg" ? "изчаква разрешение" : "waiting for permission"}
                        </span>
                      </div>
                    </div>

                  <form onSubmit={changeOwnPassword} className="rounded-[26px] border border-white/10 bg-black/20 p-5 md:p-6">
                    <div className="section-kicker">
                      {adminLanguage === "bg" ? "Сигурност" : "Security"}
                    </div>
                    <h3 className="mt-2 text-2xl font-semibold text-[#fff4df]">
                      {adminLanguage === "bg" ? "Смяна на парола" : "Change password"}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-white/45">
                      {adminLanguage === "bg"
                        ? "Въведете текущата парола и нова парола с поне 8 символа."
                        : "Enter your current password and a new password with at least 8 characters."}
                    </p>

	                    <div className="mt-5 grid gap-4 md:grid-cols-2">
	                      <label className="block text-sm text-white/60">
	                        {adminLanguage === "bg" ? "Текуща парола" : "Current password"}
	                        <span className="mt-2 flex overflow-hidden rounded-2xl border border-white/10 bg-black/25 focus-within:border-amber-300">
	                          <input
	                            type={showOwnPasswords.currentPassword ? "text" : "password"}
	                            autoComplete="current-password"
	                            value={ownPasswordForm.currentPassword}
	                            onChange={(event) => setOwnPasswordForm((prev) => ({ ...prev, currentPassword: event.target.value }))}
	                            className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm text-white outline-none placeholder:text-white/35"
	                          />
	                          <button
	                            type="button"
	                            onClick={() => setShowOwnPasswords((prev) => ({ ...prev, currentPassword: !prev.currentPassword }))}
	                            className="border-l border-white/10 px-3 text-xs font-semibold text-[#f2d39a] transition hover:bg-white/5"
	                          >
	                            {showOwnPasswords.currentPassword
	                              ? adminLanguage === "bg" ? "Скрий" : "Hide"
	                              : adminLanguage === "bg" ? "Покажи" : "Show"}
	                          </button>
	                        </span>
	                      </label>
	                      <label className="block text-sm text-white/60">
	                        {adminLanguage === "bg" ? "Нова парола" : "New password"}
	                        <span className="mt-2 flex overflow-hidden rounded-2xl border border-white/10 bg-black/25 focus-within:border-amber-300">
	                          <input
	                            type={showOwnPasswords.newPassword ? "text" : "password"}
	                            autoComplete="new-password"
	                            value={ownPasswordForm.newPassword}
	                            onChange={(event) => setOwnPasswordForm((prev) => ({ ...prev, newPassword: event.target.value }))}
	                            className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm text-white outline-none placeholder:text-white/35"
	                          />
	                          <button
	                            type="button"
	                            onClick={() => setShowOwnPasswords((prev) => ({ ...prev, newPassword: !prev.newPassword }))}
	                            className="border-l border-white/10 px-3 text-xs font-semibold text-[#f2d39a] transition hover:bg-white/5"
	                          >
	                            {showOwnPasswords.newPassword
	                              ? adminLanguage === "bg" ? "Скрий" : "Hide"
	                              : adminLanguage === "bg" ? "Покажи" : "Show"}
	                          </button>
	                        </span>
	                      </label>
	                    </div>

                    <button className="luxury-button mt-5 rounded-2xl px-6 py-3 text-sm font-semibold">
                      {adminLanguage === "bg" ? "Смени паролата" : "Change password"}
                    </button>
                  </form>
                  </div>
                </div>
              </Panel>
            )}

            {activeTab === "liveMap" && (
              <ReservationOperationsMap
                text={a.liveMap}
                language={adminLanguage}
                layout={tableLayout}
                reservations={reservations}
                diningOrders={diningOrders}
                menuItems={menuItems}
                selectedArea={reservationMapArea}
                onAreaChange={setReservationMapArea}
                selectedDate={reservationMapDate}
                onDateChange={setReservationMapDate}
                onArrived={markReservationArrived}
                onAddConsumptionItem={addConsumptionItem}
                onUpdateConsumptionItem={updateConsumptionItem}
                onMove={moveReservationFromMap}
                onNoShow={markReservationNoShow}
                onOpenReservation={isWaiterRole ? null : openReservationFromMap}
                onOpenOrder={(orderId) => {
                  setExpandedOrderId(orderId);
                  setActiveTab("orders");
                }}
                onSeatWalkIn={seatWalkInFromMap}
                onCreateReservation={isWaiterRole ? null : saveAdminReservationPayload}
                onClaimReservation={isWaiterRole ? claimReservationForConsumption : null}
                onRelease={releaseReservationTable}
                requireTableClaim={isWaiterRole}
                diningEnabled={isProVersion}
                ordersOnly={false}
              />
            )}

            {activeTab === "reservations" && (
              <Panel
                title={a.reservations.title}
                subtitle={a.reservations.subtitle}
                right={
                  <div className="flex flex-col gap-3 md:flex-row">
                    <button
                      type="button"
                      onClick={() => setShowCreateReservation((isOpen) => !isOpen)}
                      className="luxury-button rounded-2xl px-5 py-3 text-sm font-semibold"
                    >
                      {adminLanguage === "bg" ? "Нова резервация" : "New reservation"}
                    </button>

                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={a.reservations.search}
                      className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none placeholder:text-white/35 focus:border-amber-300"
                    />

                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none focus:border-amber-300"
                    >
                      {[
                        ["All", adminLanguage === "bg" ? "Всички" : "All"],
                        ["Pending", adminLanguage === "bg" ? "Чакащи" : "Pending"],
                        ["Approved", adminLanguage === "bg" ? "Потвърдени" : "Approved"],
                        ["Cancelled", adminLanguage === "bg" ? "Отказани" : "Cancelled"],
                      ].map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                }
              >
                {showCreateReservation && (
                  <div className="mb-6 overflow-hidden rounded-[26px] border border-[#c9a56a]/22 bg-[radial-gradient(circle_at_top_left,rgba(201,165,106,0.16),transparent_36%),rgba(0,0,0,0.2)] p-5 shadow-2xl shadow-black/20">
                    <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                      <div>
                        <div className="section-kicker">
                          {adminLanguage === "bg" ? "Бързо добавяне" : "Quick create"}
                        </div>
                        <h3 className="mt-2 text-2xl font-semibold text-[#fff4df]">
                          {adminLanguage === "bg" ? "Нова резервация" : "New reservation"}
                        </h3>
                        <p className="mt-2 text-sm text-stone-400">
                          {adminLanguage === "bg"
                            ? "За телефонни резервации. Email може да остане празен."
                            : "For phone reservations. Email can stay empty."}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setShowCreateReservation(false)}
                        className="ghost-button rounded-full px-4 py-2 text-sm"
                      >
                        {adminLanguage === "bg" ? "Скрий" : "Hide"}
                      </button>
                    </div>

                    <form onSubmit={createAdminReservation} className="grid gap-4 lg:grid-cols-3">
                      {[
                        ["guestName", adminLanguage === "bg" ? "Име на гост" : "Guest name"],
                        ["phone", adminLanguage === "bg" ? "Телефон" : "Phone"],
                        ["email", adminLanguage === "bg" ? "Email по желание" : "Email optional"],
                        ["reservedDate", adminLanguage === "bg" ? "Дата" : "Date"],
                        ["reservedTime", adminLanguage === "bg" ? "Час" : "Time"],
                        ["guestCount", adminLanguage === "bg" ? "Гости" : "Guests"],
                      ].map(([key, label]) => (
                        <div key={key}>
                          <label className="mb-2 block text-sm text-stone-400">{label}</label>
                          {key === "reservedTime" ? (
                            <select
                              value={adminReservation.reservedTime}
                              onChange={(e) =>
                                setAdminReservation((prev) => ({
                                  ...prev,
                                  reservedTime: e.target.value,
                                  tableIds: "",
                                }))
                              }
                              required
                              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                            >
                              <option value="">{adminLanguage === "bg" ? "Избери час" : "Select time"}</option>
                              {availableAdminReservationTimes.map((time) => (
                                <option key={time} value={time}>
                                  {time}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type={key === "reservedDate" ? "date" : key === "guestCount" ? "number" : "text"}
                              value={adminReservation[key]}
                              onChange={(e) =>
                                setAdminReservation((prev) => ({
                                  ...prev,
                                  [key]: e.target.value,
                                  ...(key === "reservedDate" ? { tableIds: "" } : {}),
                                }))
                              }
                              required={["phone", "reservedDate", "guestCount", "tableIds"].includes(key)}
                              {...(key === "reservedDate" ? { min: todayInput } : {})}
                              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                            />
                          )}
                        </div>
                      ))}

                      <div className="lg:col-span-3">
                        <label className="mb-3 block text-sm text-stone-400">
                          {adminLanguage === "bg" ? "Зона за гостите" : "Guest area"}
                        </label>
                        <div className="grid gap-3 md:grid-cols-3">
                          {reservationAreaOptions.map((option) => {
                            const selected = adminReservation.area === option.value;

                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() =>
                                  setAdminReservation((prev) => ({
                                    ...prev,
                                    area: option.value,
                                    tableIds: "",
                                  }))
                                }
                                className={`menu-spark rounded-[22px] border p-4 text-left transition ${
                                  selected
                                    ? "border-[#c9a56a]/55 bg-[#c9a56a]/15 shadow-xl shadow-black/25"
                                    : "border-white/10 bg-white/[0.04] hover:border-[#c9a56a]/30"
                                }`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="font-semibold text-[#fff4df]">{option.title}</div>
                                    <div className="mt-1 text-sm text-stone-400">{option.subtitle}</div>
                                  </div>
                                  <span
                                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                      selected ? "bg-[#c9a56a] text-black" : "border border-white/10 text-stone-300"
                                    }`}
                                  >
                                    {option.meta}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="lg:col-span-3">
                        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                          <div>
                            <label className="block text-sm text-stone-400">
                              {adminLanguage === "bg" ? "Маси" : "Tables"}
                            </label>
                            <p className="mt-1 text-xs text-stone-500">
                              {adminLanguage === "bg"
                                ? "Избери от бутоните или въведи номера ръчно."
                                : "Pick from chips or type table numbers manually."}
                            </p>
                          </div>
                          {adminReservationTableIds.length > 0 && (
                            <div className="rounded-full border border-[#c9a56a]/25 bg-[#c9a56a]/10 px-4 py-2 text-sm text-[#f2d39a]">
                              {adminReservationTableIds.join(", ")}
                            </div>
                          )}
                        </div>
                        <input
                          value={adminReservation.tableIds}
                          onChange={(e) =>
                            setAdminReservation((prev) => ({
                              ...prev,
                              tableIds: e.target.value,
                            }))
                          }
                          required
                          placeholder={adminLanguage === "bg" ? "Напр. 20, 21, 22" : "Example: 20, 21, 22"}
                          className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none placeholder:text-white/30 focus:border-amber-300"
                        />
                        <div className="mt-3 rounded-[22px] border border-white/10 bg-black/15 p-3">
                          <TableChipSelector
                            area={adminReservation.area}
                            selectedTableIds={adminReservationTableIds}
                            onToggle={toggleAdminReservationTable}
                            unavailableTableIds={adminReservationUnavailableTableIds}
                            requiredSeats={Number(adminReservation.guestCount || 0)}
                            unrestrictedSelection
                            tableIdsOverride={activeTableIdsByArea[adminReservation.area]}
                            areaTables={activeTablesByArea[adminReservation.area]}
                            hideUnavailable={Boolean(adminReservation.reservedDate && adminReservation.reservedTime)}
                            emptyMessage={
                              adminLanguage === "bg"
                                ? "Няма свободни маси за този час."
                                : "No free tables for this time."
                            }
                          />
                        </div>
                      </div>

                      <div className="lg:col-span-3">
                        <label className="mb-2 block text-sm text-stone-400">
                          {adminLanguage === "bg" ? "Вътрешна бележка" : "Internal note"}
                        </label>
                        <textarea
                          value={adminReservation.internalNote}
                          onChange={(e) =>
                            setAdminReservation((prev) => ({
                              ...prev,
                              internalNote: e.target.value,
                            }))
                          }
                          rows={4}
                          className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                        />
                      </div>

                      <button className="luxury-button rounded-2xl px-6 py-4 font-semibold lg:col-span-3">
                        {adminLanguage === "bg" ? "Създай резервация" : "Create reservation"}
                      </button>
                    </form>
                  </div>
                )}

                <div className="grid gap-3 xl:hidden">
                  {filteredReservations.map((r) => {
                    const expanded = expandedId === r.id;
                    const tableEdit = getTableEdit(r);

                    return (
                      <article
                        key={r.id}
                        className={`rounded-[24px] border p-4 transition ${
                          r.isBlacklisted
                            ? "border-yellow-400/25 bg-yellow-500/10"
                            : r.isRegularCustomer
                            ? "border-emerald-400/20 bg-emerald-500/10"
                            : "border-white/10 bg-white/[0.04]"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setExpandedId(expanded ? null : r.id)}
                          className="w-full text-left"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-lg font-semibold text-white">{r.guestName}</div>
                              <div className="mt-1 text-xs text-stone-500">
                                #{r.id} · {r.createdByAdmin ? a.reservations.sourceAdmin : a.reservations.sourceWebsite}
                              </div>
                            </div>
                            <StatusBadge status={r.status} />
                          </div>

                          <div className="mt-4 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                            <div className="rounded-2xl bg-black/20 p-3">
                              <div className="text-xs text-stone-500">{a.reservations.date}</div>
                              <div className="mt-1 text-white">{r.reservedDate}</div>
                            </div>
                            <div className="rounded-2xl bg-black/20 p-3">
                              <div className="text-xs text-stone-500">{a.reservations.time}</div>
                              <div className="mt-1 text-white">{r.reservedTime}</div>
                            </div>
                            <div className="rounded-2xl bg-black/20 p-3">
                              <div className="text-xs text-stone-500">{a.reservations.guests}</div>
                              <div className="mt-1 text-white">{r.guestCount}</div>
                            </div>
                            <div className="rounded-2xl bg-black/20 p-3">
                              <div className="text-xs text-stone-500">{a.reservations.tables}</div>
                              <div className="mt-1 truncate text-white">{r.tableIds.join(", ")}</div>
                            </div>
                          </div>

                          <div className="mt-3 text-right text-xs uppercase tracking-[0.22em] text-[#d8b377]">
                            {expanded ? a.reservations.close : a.reservations.open}
                          </div>
                        </button>

                        {expanded && (
                          <div className="mt-4 border-t border-white/10 pt-4">
                            <div className="grid gap-3 md:grid-cols-3">
                              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                <div className="text-xs uppercase tracking-[0.22em] text-amber-300">
                                  {a.reservations.contact}
                                </div>
                                <div className="mt-3 text-sm text-stone-300">{a.reservations.phone}: {r.phone}</div>
                                <div className="mt-2 text-sm text-stone-300">{a.reservations.email}: {r.email || "—"}</div>
                                <div className="mt-2 text-sm text-stone-300">{a.reservations.birthday}: {formatBirthday(r.birthDate, adminLanguage)}</div>
                              </div>

                              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                <div className="text-xs uppercase tracking-[0.22em] text-amber-300">
                                  {a.reservations.notes}
                                </div>
                                <div className="mt-3 text-sm text-stone-300">{a.reservations.client}: {r.notes || "—"}</div>
                                <label className="mt-3 block text-xs text-stone-500">{a.reservations.internal}</label>
                                <textarea
                                  value={getNoteEdit(r)}
                                  onChange={(event) => setNoteEdit(r, event.target.value)}
                                  rows={3}
                                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none focus:border-amber-300"
                                  placeholder={adminLanguage === "bg" ? "Вътрешна бележка за екипа..." : "Internal note for the team..."}
                                />
                                <button
                                  type="button"
                                  onClick={() => saveReservationNote(r)}
                                  className="ghost-button mt-3 rounded-xl px-4 py-2 text-xs font-semibold"
                                >
                                  {adminLanguage === "bg" ? "Запази бележка" : "Save note"}
                                </button>
                              </div>

                              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                <div className="text-xs uppercase tracking-[0.22em] text-amber-300">
                                  {a.reservations.flags}
                                </div>
                                <div className="mt-3 text-sm text-stone-300">Blacklist: {r.isBlacklisted ? (adminLanguage === "bg" ? "Да" : "Yes") : (adminLanguage === "bg" ? "Не" : "No")}</div>
                                <div className="mt-2 text-sm text-stone-300">{adminLanguage === "bg" ? "Редовен клиент" : "Regular"}: {r.isRegularCustomer ? (adminLanguage === "bg" ? "Да" : "Yes") : (adminLanguage === "bg" ? "Не" : "No")}</div>
                                <div className="mt-2 text-sm text-stone-300">Marketing: {r.marketingConsent ? (adminLanguage === "bg" ? "Да" : "Yes") : (adminLanguage === "bg" ? "Не" : "No")}</div>
                                <div className="mt-2 text-sm text-stone-300">Privacy: {r.privacyConsent ? (adminLanguage === "bg" ? "Да" : "Yes") : (adminLanguage === "bg" ? "Не" : "No")}</div>
                              </div>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                              <button
                                onClick={() => updateStatus(r.id, "cancel")}
                                disabled={r.status === "Cancelled"}
                                className="rounded-xl bg-red-500 px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
                              >
                                {a.reservations.cancel}
                              </button>
                              <button
                                onClick={() => archiveReservation(r.id)}
                                className="rounded-xl border border-red-300/25 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-100"
                              >
                                {a.reservations.archive}
                              </button>
                              <button
                                onClick={() => addToBlacklist(r)}
                                className="rounded-xl border border-yellow-400/30 bg-yellow-400/10 px-3 py-2 text-xs font-medium text-yellow-200"
                              >
                                {a.reservations.noShow}
                              </button>
                            </div>

                            <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4">
                              <div className="text-xs uppercase tracking-[0.22em] text-amber-300">
                                {a.reservations.changeTables}
                              </div>
                              <p className="mt-2 text-sm text-stone-400">{a.reservations.changeTablesHint}</p>
                              <div className="mt-4 grid gap-2 lg:grid-cols-[1fr_1fr_0.9fr_1fr_auto]">
                                <label className="min-w-[140px]">
                                  <span className="mb-1 block text-xs text-stone-500">
                                    {a.reservations.date}
                                  </span>
                                  <input
                                    type="date"
                                    min={todayInput}
                                    value={tableEdit.reservedDate}
                                    onChange={(e) => setTableEditDateTime(r, "reservedDate", e.target.value)}
                                    disabled={r.status === "Cancelled"}
                                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-amber-300 disabled:opacity-40"
                                  />
                                </label>
                                <label className="min-w-[140px]">
                                  <span className="mb-1 block text-xs text-stone-500">
                                    {a.reservations.time}
                                  </span>
                                  <select
                                    value={tableEdit.reservedTime}
                                    onChange={(e) => setTableEditDateTime(r, "reservedTime", e.target.value)}
                                    disabled={r.status === "Cancelled"}
                                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-amber-300 disabled:opacity-40"
                                  >
                                    {getAvailableReservationTimesForDate(adminReservationTimes, tableEdit.reservedDate).map((time) => (
                                      <option key={time} value={time}>{time}</option>
                                    ))}
                                  </select>
                                </label>
                                <label className="min-w-[140px]">
                                  <span className="mb-1 block text-xs text-stone-500">
                                    {a.reservations.guests}
                                  </span>
                                  <input
                                    type="number"
                                    min="1"
                                    max="40"
                                    value={tableEdit.guestCount}
                                    onChange={(e) => setTableEditGuestCount(r, e.target.value)}
                                    disabled={r.status === "Cancelled"}
                                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-amber-300 disabled:opacity-40"
                                  />
                                </label>
                                <select
                                  value={tableEdit.area}
                                  onChange={(e) => setTableEditArea(r, e.target.value)}
                                  disabled={r.status === "Cancelled"}
                                  className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-amber-300 disabled:opacity-40"
                                >
                                  <option value="indoor">{adminLanguage === "bg" ? "Зала / непушачи" : "Hall / non-smoking"}</option>
                                  <option value="garden">{adminLanguage === "bg" ? "Покрита тераса / пушачи" : "Covered terrace / smoking"}</option>
                                  <option value="openTerrace">{adminLanguage === "bg" ? "Открита тераса / пушачи" : "Open terrace / smoking"}</option>
                                </select>
                                <button
                                  type="button"
                                  onClick={() => saveReservationTables(r)}
                                  disabled={r.status === "Cancelled" || tableEdit.tableIds.length === 0}
                                  className="rounded-2xl bg-amber-400 px-5 py-3 text-sm font-semibold text-black disabled:opacity-40"
                                >
                                  {a.reservations.saveTables}
                                </button>
                              </div>
                              <div className="mt-4">
                                <TableChipSelector
                                  area={tableEdit.area}
                                  selectedTableIds={tableEdit.tableIds}
                                  onToggle={(tableId) => toggleTableEdit(r, tableId)}
                                  requiredSeats={Number(tableEdit.guestCount || r.guestCount || 0)}
                                  unrestrictedSelection
                                  tableIdsOverride={activeTableIdsByArea[tableEdit.area]}
                                  areaTables={activeTablesByArea[tableEdit.area]}
                                  unavailableTableIds={getUnavailableTableIdsForSlot(
                                    reservations,
                                    tableEdit.reservedDate,
                                    tableEdit.reservedTime,
                                    r.id
                                  )}
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>

                <div className="hidden overflow-x-auto xl:block">
                  <table className="w-full min-w-[950px] text-left text-sm">
                    <thead className="text-stone-400">
                      <tr className="border-b border-white/10">
                        <th className="p-4">{a.reservations.guest}</th>
                        <th className="p-4">{a.reservations.date}</th>
                        <th className="p-4">{a.reservations.time}</th>
                        <th className="p-4">{a.reservations.tables}</th>
                        <th className="p-4">{a.reservations.guests}</th>
                        <th className="p-4">{a.reservations.status}</th>
                        <th className="p-4">{a.reservations.actions}</th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredReservations.map((r) => {
                        const expanded = expandedId === r.id;
                        const tableEdit = getTableEdit(r);

                        return (
                          <React.Fragment key={r.id}>
                            <tr
                              className={`border-b border-white/10 transition ${
                                r.isBlacklisted
                                  ? "bg-yellow-500/10"
                                  : r.isRegularCustomer
                                  ? "bg-emerald-500/10"
                                  : "hover:bg-white/[0.03]"
                              }`}
                            >
                              <td className="p-4">
                                <button
                                  onClick={() => setExpandedId(expanded ? null : r.id)}
                                  className="text-left"
                                >
                                  <div className="font-medium text-white">{r.guestName}</div>
                                  <div className="mt-1 text-xs text-stone-500">
                                    #{r.id} · {r.createdByAdmin ? a.reservations.sourceAdmin : a.reservations.sourceWebsite}
                                  </div>
                                </button>
                              </td>

                              <td className="p-4">{r.reservedDate}</td>
                              <td className="p-4">{r.reservedTime}</td>
                              <td className="p-4">{r.tableIds.join(", ")}</td>
                              <td className="p-4">{r.guestCount}</td>
                              <td className="p-4">
                                <StatusBadge status={r.status} />
                              </td>

                              <td className="p-4">
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    onClick={() => updateStatus(r.id, "cancel")}
                                    disabled={r.status === "Cancelled"}
                                    className="rounded-xl bg-red-500 px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
                                  >
                                    {a.reservations.cancel}
                                  </button>
                                  <button
                                    onClick={() => archiveReservation(r.id)}
                                    className="rounded-xl border border-red-300/25 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-100"
                                  >
                                    {a.reservations.archive}
                                  </button>

                                  <button
                                    onClick={() => addToBlacklist(r)}
                                    className="rounded-xl border border-yellow-400/30 bg-yellow-400/10 px-3 py-2 text-xs font-medium text-yellow-200"
                                  >
                                    {a.reservations.noShow}
                                  </button>
                                </div>
                              </td>
                            </tr>

                            {expanded && (
                              <tr className="border-b border-white/10 bg-black/20">
                                <td colSpan={7} className="p-5">
                                  <div className="grid gap-4 md:grid-cols-3">
                                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                                      <div className="text-xs uppercase tracking-[0.25em] text-amber-300">
                                        {a.reservations.contact}
                                      </div>
                                      <div className="mt-3 text-sm text-stone-300">
                                        {a.reservations.phone}: {r.phone}
                                      </div>
                                      <div className="mt-2 text-sm text-stone-300">
                                        {a.reservations.email}: {r.email || "—"}
                                      </div>
                                      <div className="mt-2 text-sm text-stone-300">
                                        {a.reservations.birthday}: {formatBirthday(r.birthDate, adminLanguage)}
                                      </div>
                                    </div>

                                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                                      <div className="text-xs uppercase tracking-[0.25em] text-amber-300">
                                        {a.reservations.notes}
                                      </div>
                                      <div className="mt-3 text-sm text-stone-300">
                                        {a.reservations.client}: {r.notes || "—"}
                                      </div>
                                      <label className="mt-3 block text-xs text-stone-500">{a.reservations.internal}</label>
                                      <textarea
                                        value={getNoteEdit(r)}
                                        onChange={(event) => setNoteEdit(r, event.target.value)}
                                        rows={3}
                                        className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none focus:border-amber-300"
                                        placeholder={adminLanguage === "bg" ? "Вътрешна бележка за екипа..." : "Internal note for the team..."}
                                      />
                                      <button
                                        type="button"
                                        onClick={() => saveReservationNote(r)}
                                        className="ghost-button mt-3 rounded-xl px-4 py-2 text-xs font-semibold"
                                      >
                                        {adminLanguage === "bg" ? "Запази бележка" : "Save note"}
                                      </button>
                                    </div>

                                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                                      <div className="text-xs uppercase tracking-[0.25em] text-amber-300">
                                        {a.reservations.flags}
                                      </div>
                                      <div className="mt-3 text-sm text-stone-300">
                                        Blacklist: {r.isBlacklisted ? (adminLanguage === "bg" ? "Да" : "Yes") : (adminLanguage === "bg" ? "Не" : "No")}
                                      </div>
                                      <div className="mt-2 text-sm text-stone-300">
                                        {adminLanguage === "bg" ? "Редовен клиент" : "Regular"}: {r.isRegularCustomer ? (adminLanguage === "bg" ? "Да" : "Yes") : (adminLanguage === "bg" ? "Не" : "No")}
                                      </div>
                                      <div className="mt-2 text-sm text-stone-300">
                                        Marketing: {r.marketingConsent ? (adminLanguage === "bg" ? "Да" : "Yes") : (adminLanguage === "bg" ? "Не" : "No")}
                                      </div>
                                      <div className="mt-2 text-sm text-stone-300">
                                        Privacy: {r.privacyConsent ? (adminLanguage === "bg" ? "Да" : "Yes") : (adminLanguage === "bg" ? "Не" : "No")}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4">
                                    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                                      <div>
                                        <div className="text-xs uppercase tracking-[0.25em] text-amber-300">
                                          {a.reservations.changeTables}
                                        </div>
                                        <p className="mt-2 text-sm text-stone-400">
                                          {a.reservations.changeTablesHint}
                                        </p>
                                      </div>

                              <div className="flex flex-col gap-2 sm:flex-row">
                                <label className="min-w-[140px]">
                                  <span className="mb-1 block text-xs text-stone-500">
                                    {a.reservations.date}
                                  </span>
                                  <input
                                    type="date"
                                    min={todayInput}
                                    value={tableEdit.reservedDate}
                                    onChange={(e) => setTableEditDateTime(r, "reservedDate", e.target.value)}
                                    disabled={r.status === "Cancelled"}
                                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-amber-300 disabled:opacity-40"
                                  />
                                </label>
                                <label className="min-w-[140px]">
                                  <span className="mb-1 block text-xs text-stone-500">
                                    {a.reservations.time}
                                  </span>
                                  <select
                                    value={tableEdit.reservedTime}
                                    onChange={(e) => setTableEditDateTime(r, "reservedTime", e.target.value)}
                                    disabled={r.status === "Cancelled"}
                                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-amber-300 disabled:opacity-40"
                                  >
                                    {getAvailableReservationTimesForDate(adminReservationTimes, tableEdit.reservedDate).map((time) => (
                                      <option key={time} value={time}>{time}</option>
                                    ))}
                                  </select>
                                </label>
                                <label className="min-w-[140px]">
                                          <span className="mb-1 block text-xs text-stone-500">
                                            {a.reservations.guests}
                                          </span>
                                          <input
                                            type="number"
                                            min="1"
                                            max="40"
                                            value={tableEdit.guestCount}
                                            onChange={(e) => setTableEditGuestCount(r, e.target.value)}
                                            disabled={r.status === "Cancelled"}
                                            className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-amber-300 disabled:opacity-40"
                                          />
                                        </label>
                                        <select
                                          value={tableEdit.area}
                                          onChange={(e) => setTableEditArea(r, e.target.value)}
                                          disabled={r.status === "Cancelled"}
                                          className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-amber-300 disabled:opacity-40"
                                        >
                                          <option value="indoor">{adminLanguage === "bg" ? "Зала / непушачи" : "Hall / non-smoking"}</option>
                                          <option value="garden">{adminLanguage === "bg" ? "Покрита тераса / пушачи" : "Covered terrace / smoking"}</option>
                                          <option value="openTerrace">{adminLanguage === "bg" ? "Открита тераса / пушачи" : "Open terrace / smoking"}</option>
                                        </select>

                                        <button
                                          type="button"
                                          onClick={() => saveReservationTables(r)}
                                          disabled={r.status === "Cancelled" || tableEdit.tableIds.length === 0}
                                          className="rounded-2xl bg-amber-400 px-5 py-3 text-sm font-semibold text-black disabled:opacity-40"
                                        >
                                          {a.reservations.saveTables}
                                        </button>
                                      </div>
                                    </div>

                                    <div className="mt-4">
                                      <TableChipSelector
                                        area={tableEdit.area}
                                        selectedTableIds={tableEdit.tableIds}
                                        onToggle={(tableId) => toggleTableEdit(r, tableId)}
                                        requiredSeats={Number(tableEdit.guestCount || r.guestCount || 0)}
                                        unrestrictedSelection
                                        tableIdsOverride={activeTableIdsByArea[tableEdit.area]}
                                        areaTables={activeTablesByArea[tableEdit.area]}
                                        unavailableTableIds={getUnavailableTableIdsForSlot(
                                          reservations,
                                          tableEdit.reservedDate,
                                          tableEdit.reservedTime,
                                          r.id
                                        )}
                                      />
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Panel>
            )}

            {activeTab === "orders" && (
              <Panel title={a.orders.title} subtitle={a.orders.subtitle}>
                {diningOrders.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-white/55">
                    {a.orders.empty}
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {diningOrders.map((order) => {
	                      const detailsId = `dining-order-${order.id}-details`;
	                      const hasReadyItems = hasReadyDiningItems(order);
	                      const hasNewItems = isWaiterRole ? hasUnseenGuestItems(order) : hasNewDiningItems(order);
                      const visibleOrderItems = isWaiterRole
                        ? order.items.filter((item) => item.status !== "Done" && item.status !== "Cancelled")
                        : order.items;
                      const productionOrderComplete =
                        isProductionRole &&
                        order.items.length > 0 &&
                        order.items.every((item) => ["Ready", "Done"].includes(item.status));
                      const waiterOrderServed =
                        isWaiterRole &&
                        order.items.length > 0 &&
                        visibleOrderItems.length === 0;
                      const compactOrder = productionOrderComplete || waiterOrderServed;
                      const expanded = isProductionRole ? !productionOrderComplete : !waiterOrderServed && expandedOrderId === order.id;

                      return (
                        <article
                          key={order.id}
                          className={`rounded-[24px] border p-4 ${
	                            productionOrderComplete
	                              ? "border-emerald-300/20 bg-emerald-400/[0.06]"
	                            : isProductionRole && order.status === "New"
	                              ? "new-kitchen-order border-amber-300/45 bg-amber-400/10 shadow-[0_0_34px_rgba(251,191,36,0.14)]"
	                              : isWaiterRole && hasNewItems
	                              ? "waiter-new-alert border-amber-300/35 bg-amber-400/10"
	                              : isWaiterRole && hasReadyItems
	                              ? "waiter-ready-alert border-emerald-300/35 bg-emerald-400/10"
                              : "border-white/10 bg-white/[0.04]"
                          }`}
                        >
                          <button
                            type="button"
	                            aria-expanded={expanded}
	                            aria-controls={detailsId}
	                            disabled={isProductionRole || compactOrder}
	                            onClick={() => setExpandedOrderId(expanded ? null : order.id)}
	                            className={`grid w-full gap-3 text-left md:items-center disabled:cursor-default ${
	                              compactOrder ? "md:grid-cols-[1fr_auto]" : "md:grid-cols-[1fr_1fr_auto]"
	                            }`}
	                          >
                            <div>
                              <div className="text-xs uppercase tracking-[0.2em] text-[#c9a56a]">
                                {a.orders.table}
                              </div>
                              <div className="mt-1 text-xl font-semibold text-[#fff4df]">{order.tableLabel}</div>
                            </div>
	                            {!compactOrder && (
	                            <div className={isProductionRole ? "hidden md:block" : ""}>
                              <div className="text-xs uppercase tracking-[0.2em] text-white/35">
                                {isProductionRole ? (adminLanguage === "bg" ? "Поръчка" : "Order") : a.orders.guest}
                              </div>
                              <div className="mt-1 text-base font-semibold text-white">
                                {isProductionRole ? `#${order.id}` : order.guestName}
                                {!isProductionRole && order.reservation?.isWalkIn && (
                                  <span className="ml-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-emerald-100">
                                    Walk-in
                                  </span>
                                )}
                              </div>
                              {!isWaiterRole && (
                                <div className="mt-1 text-xs text-white/40">
                                  {order.assignedWaiterName
                                    ? `${adminLanguage === "bg" ? "Сервитьор" : "Waiter"}: ${order.assignedWaiterName}`
                                    : adminLanguage === "bg" ? "Непоета поръчка" : "Unclaimed order"}
                                </div>
	                              )}
	                            </div>
	                            )}
	                            <div className="flex items-center justify-between gap-3 md:justify-end">
                              <div className="text-left md:text-right">
                                <div className="text-xs uppercase tracking-[0.2em] text-white/35">
                                  {isProductionRole ? a.orders.status : a.orders.total}
                                </div>
                                <div className="mt-1 text-xl font-semibold text-[#f2d39a]">
	                                  {productionOrderComplete
	                                    ? adminLanguage === "bg" ? "Готово" : "Ready"
	                                    : isProductionRole ? order.status : formatEuroAmount(order.totalPrice)}
	                                </div>
	                              </div>
	                              {!isProductionRole && !waiterOrderServed && <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs text-white/65">
	                                {expanded ? a.reservations.close : a.reservations.open}
	                              </span>}
	                            </div>
	                          </button>

	                          {compactOrder && (
	                            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/18 px-3 py-2">
	                              <div className="text-xs text-white/50">
	                                {productionOrderComplete
	                                  ? isBarRole
                                      ? adminLanguage === "bg" ? "Всички напитки са готови." : "All drinks are ready."
                                      : adminLanguage === "bg" ? "Всички блюда са готови." : "All dishes are ready."
	                                  : adminLanguage === "bg" ? "Всички блюда са сервирани." : "All dishes are served."}
	                              </div>
	                              {waiterOrderServed && (
	                                <button
	                                  type="button"
	                                  onClick={() => updateDiningOrderStatus(order.id, "Paid")}
	                                  className="rounded-xl border border-emerald-300/25 bg-emerald-400/15 px-4 py-2 text-xs font-semibold text-emerald-100"
	                                >
	                                  {a.orders.paid}
	                                </button>
	                              )}
	                            </div>
	                          )}

	                          {expanded && (
                            <div id={detailsId} className="mt-4 border-t border-white/10 pt-4">
                              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                <div className="flex flex-wrap items-center gap-2">
                                  {!isWaiterRole && (
                                    <>
                                      <span className="rounded-full border border-[#c9a56a]/25 bg-[#c9a56a]/12 px-3 py-1 text-xs font-semibold text-[#f2d39a]">
                                        #{order.id}
                                      </span>
                                      <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs text-white/65">
                                        {a.orders.status}: {order.status}
                                      </span>
                                      <span className="rounded-full border border-sky-300/20 bg-sky-400/10 px-3 py-1 text-xs text-sky-100">
                                        {order.source === "Waiter"
                                          ? adminLanguage === "bg" ? "От сервитьор" : "Waiter order"
                                          : order.source === "Admin"
                                          ? adminLanguage === "bg" ? "От админ" : "Admin order"
                                          : adminLanguage === "bg" ? "Онлайн" : "Online"}
                                      </span>
                                    </>
                                  )}
                                  {order.notes && (
                                    <span className="rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1 text-xs text-amber-100">
                                      {a.orders.notes}: {order.notes}
                                    </span>
                                  )}
                                </div>

                                <div className="flex flex-wrap gap-2">
                                  {isProductionRole && order.status === "New" && (
                                    <button
                                      type="button"
                                      onClick={() => updateDiningOrderStatus(order.id, "Seen")}
                                      className="luxury-button rounded-xl px-4 py-2 text-xs font-semibold"
                                    >
                                      {adminLanguage === "bg" ? "Приета" : "Accepted"}
                                    </button>
                                  )}
                                  {isWaiterRole && !order.assignedWaiterId && (
                                    <button
                                      type="button"
                                      onClick={() => claimDiningOrder(order.id)}
                                      className="luxury-button rounded-xl px-3 py-2 text-xs font-semibold"
                                    >
                                      {adminLanguage === "bg" ? "Вземи поръчка" : "Claim order"}
                                    </button>
                                  )}
                                  {isWaiterRole ? (
                                    <>
                                      {hasUnseenGuestItems(order) && (
                                        <button
                                          type="button"
                                          onClick={() => updateDiningOrderStatus(order.id, "Seen")}
                                          className="luxury-button rounded-xl px-3 py-2 text-xs font-semibold"
                                        >
                                          {a.orders.markSeen}
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => updateDiningOrderStatus(order.id, "Paid")}
                                        className="rounded-xl border border-emerald-300/25 bg-emerald-400/15 px-3 py-2 text-xs font-semibold text-emerald-100"
                                      >
                                        {a.orders.paid}
                                      </button>
                                    </>
                                  ) : !isProductionRole && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => updateDiningOrderStatus(order.id, "Seen")}
                                        className="ghost-button rounded-xl px-3 py-2 text-xs font-semibold"
                                      >
                                        {a.orders.markSeen}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => updateDiningOrderStatus(order.id, "Preparing")}
                                        className="rounded-xl border border-[#f2d39a]/25 bg-[#c9a56a]/15 px-3 py-2 text-xs font-semibold text-[#f2d39a]"
                                      >
                                        {a.orders.preparing}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => updateDiningOrderStatus(order.id, "Done")}
                                        className="rounded-xl border border-emerald-300/25 bg-emerald-400/15 px-3 py-2 text-xs font-semibold text-emerald-100"
                                      >
                                        {a.orders.done}
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>

                              <div className="mt-4 grid gap-2 md:grid-cols-2">
                                {visibleOrderItems.map((item) => (
                                  <div
                                    key={item.id || item.name}
                                    className={`rounded-2xl border p-3 ${
	                                      item.status === "New"
	                                        ? "waiter-new-dish border-amber-300/35 bg-amber-400/12"
	                                        : isWaiterRole && item.status === "Ready"
	                                        ? "waiter-ready-dish border-emerald-300/35 bg-emerald-400/12"
                                        : "border-white/10 bg-black/20"
                                    }`}
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className="font-semibold text-white">{item.name}</div>
                                        {item.notes && <div className="mt-1 text-xs text-white/45">{item.notes}</div>}
                                        <div className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                                          item.status === "Ready"
                                            ? "border-emerald-300/30 bg-emerald-400/15 text-emerald-100"
                                            : "border-white/10 bg-black/25 text-white/55"
                                        }`}>
                                          {getDiningItemStatusLabel(item, adminLanguage)}
                                        </div>
                                      </div>
                                      <div className="shrink-0 text-right">
                                        <div className="mb-1 text-xs text-white/45">{formatEuroAmount(item.unitPrice * item.quantity)}</div>
                                        {isProductionRole ? (
                                          <button
                                            type="button"
                                            onClick={() => updateDiningOrderItemStatus(item.id, "Ready")}
                                            disabled={item.status === "Ready" || item.status === "Done"}
                                            className="rounded-full border border-emerald-300/25 bg-emerald-400/15 px-3 py-1.5 text-[11px] font-semibold text-emerald-100 disabled:cursor-default disabled:border-white/10 disabled:bg-white/[0.04] disabled:text-white/40"
                                          >
                                            {item.status === "Ready" || item.status === "Done"
                                              ? adminLanguage === "bg" ? "Готово" : "Ready"
                                            : adminLanguage === "bg" ? "Готово" : "Ready"}
                                          </button>
                                        ) : isWaiterRole ? (
                                          <div className="space-y-2">
                                            <div className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-3 py-1 text-sm text-white">
                                              × {item.quantity}
                                            </div>
                                            {item.status === "Ready" && (
                                              <button
                                                type="button"
                                                onClick={() => updateDiningOrderItemStatus(item.id, "Done")}
                                                className="block rounded-full border border-emerald-300/25 bg-emerald-400/15 px-3 py-1.5 text-[11px] font-semibold text-emerald-100"
                                              >
                                                {a.orders.served}
                                              </button>
                                            )}
                                          </div>
                                        ) : (
                                          <div className="flex items-center overflow-hidden rounded-full border border-white/10">
                                            <button type="button" onClick={() => updateConsumptionItem(item.id, item.quantity - 1)} className="px-3 py-1 text-[#f2d39a]" aria-label={`${a.orders.addItem} ${item.name}`}>-</button>
                                            <span className="min-w-8 text-center text-sm text-white">{item.quantity}</span>
                                            <button type="button" onClick={() => updateConsumptionItem(item.id, item.quantity + 1)} className="px-3 py-1 text-[#f2d39a]" aria-label={`${a.orders.addItem} ${item.name}`}>+</button>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {!isProductionRole && (
                              <div className="mt-4 rounded-2xl border border-emerald-300/15 bg-emerald-400/10 p-4">
                                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100">
                                  {a.orders.addItem}
                                </div>
                                <input
                                  value={orderMenuSearches[order.id] || ""}
                                  onChange={(event) =>
                                    setOrderMenuSearches((prev) => ({ ...prev, [order.id]: event.target.value }))
                                  }
                                  placeholder={a.orders.searchDish}
                                  className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 focus:border-[#f2d39a]/50"
                                />
                                {(orderMenuSearches[order.id] || "").trim() && (
                                  <div className="mt-2 grid max-h-72 gap-2 overflow-y-auto pr-1 md:grid-cols-2">
                                    {menuItems
                                      .filter((item) => (item.isActive ?? item.IsActive ?? true) === true)
                                      .filter((item) => {
                                        const haystack = `${getValue(item, "nameBg") || ""} ${getValue(item, "nameEn") || ""}`.toLowerCase();
                                        return haystack.includes((orderMenuSearches[order.id] || "").trim().toLowerCase());
                                      })
                                      .slice(0, 12)
                                      .map((item) => {
                                        const name = getValue(item, "nameBg") || getValue(item, "nameEn") || "";
                                        const price = Number(getValue(item, "price") || 0);
                                        return (
                                          <button
                                            key={getValue(item, "id") || name}
                                            type="button"
                                            onClick={() => addOrderItem(order, {
                                              menuItemId: getValue(item, "id"),
                                              name,
                                              unitPrice: price,
                                              kind: getMenuItemKind(item),
                                              quantity: 1,
                                            })}
                                            className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-left transition hover:border-[#c9a56a]/40"
                                          >
                                            <span className="min-w-0 truncate text-sm text-white/80">{name}</span>
                                            <span className="shrink-0 text-xs font-semibold text-[#f2d39a]">{formatEuroAmount(price)}</span>
                                          </button>
                                        );
                                      })}
                                  </div>
                                )}
                              </div>
                              )}
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </Panel>
            )}

            {activeTab === "block" && (
              <Panel
                title={adminLanguage === "bg" ? "Блокирай зала" : "Block hall"}
                subtitle={
                  adminLanguage === "bg"
                    ? "Затваря избраната зона или целия ресторант за ден или диапазон от часове."
                    : "Close one area or the whole restaurant for a day or a time range."
                }
              >
                <form onSubmit={createHallBlock} className="grid gap-4 md:grid-cols-4">
                  <div className="md:col-span-4">
                    <label className="mb-3 block text-sm text-stone-400">
                      {adminLanguage === "bg" ? "Какво резервираме" : "What to block"}
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {hallBlockAreaOptions.map((option) => {
                        const selected = hallBlock.area === option.value;

                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => {
                              setHallBlockConflicts([]);
                              setHallBlock((prev) => ({
                                ...prev,
                                area: option.value,
                              }));
                            }}
                            className={`menu-spark rounded-[24px] border p-5 text-left transition ${
                              selected
                                ? "border-[#c9a56a]/55 bg-[#c9a56a]/15 shadow-xl shadow-black/25"
                                : "border-white/10 bg-white/[0.04] hover:border-[#c9a56a]/30"
                            }`}
                          >
                            <div className="section-kicker text-[0.62rem]">
                              {option.value === "all"
                                ? adminLanguage === "bg"
                                  ? "Цял ресторант"
                                  : "Full buyout"
                                : adminLanguage === "bg"
                                ? "Зона"
                                : "Area"}
                            </div>
                            <div className="mt-3 text-lg font-semibold text-[#fff4df]">{option.title}</div>
                            <div className="mt-2 text-sm leading-6 text-stone-400">{option.subtitle}</div>
                            <div
                              className={`mt-4 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                                selected ? "bg-[#c9a56a] text-black" : "border border-white/10 text-stone-300"
                              }`}
                            >
                              {option.meta}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-stone-400">
                      {adminLanguage === "bg" ? "Дата" : "Date"}
                    </label>
                    <input
                      type="date"
                      value={hallBlock.reservedDate}
                      min={todayInput}
                      onChange={(e) => {
                        setHallBlockConflicts([]);
                        setHallBlock((prev) => ({
                          ...prev,
                          reservedDate: e.target.value,
                        }));
                      }}
                      required
                      className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-stone-400">
                      {adminLanguage === "bg" ? "От" : "From"}
                    </label>
                    <select
                      value={hallBlock.startTime}
                      onChange={(e) => {
                        setHallBlockConflicts([]);
                        setHallBlock((prev) => ({
                          ...prev,
                          startTime: e.target.value,
                        }));
                      }}
                      required
                      className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                    >
                      {availableHallBlockTimes.map((time) => (
                        <option key={time} value={time}>
                          {time}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-stone-400">
                      {adminLanguage === "bg" ? "До" : "To"}
                    </label>
                    <select
                      value={hallBlock.endTime}
                      onChange={(e) => {
                        setHallBlockConflicts([]);
                        setHallBlock((prev) => ({
                          ...prev,
                          endTime: e.target.value,
                        }));
                      }}
                      required
                      className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                    >
                      {availableHallBlockTimes.map((time) => (
                        <option key={time} value={time}>
                          {time}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-4">
                    <label className="mb-2 block text-sm text-stone-400">
                      {adminLanguage === "bg" ? "Бележка" : "Note"}
                    </label>
                    <textarea
                      value={hallBlock.note}
                      onChange={(e) =>
                        setHallBlock((prev) => ({
                          ...prev,
                          note: e.target.value,
                        }))
                      }
                      rows={3}
                      placeholder={
                        adminLanguage === "bg"
                          ? "Частно събитие, ремонт, запазен ресторант..."
                          : "Private event, maintenance, full buyout..."
                      }
                      className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none placeholder:text-white/30 focus:border-amber-300"
                    />
                  </div>

                  <div className="grid gap-3 text-sm text-stone-300 md:col-span-4 md:grid-cols-3">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                      <div className="text-stone-500">{adminLanguage === "bg" ? "Часове" : "Slots"}</div>
                      <div className="mt-1 text-lg font-semibold text-[#fff4df]">
                        {buildTimeRange(hallBlock.startTime, hallBlock.endTime).length}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                      <div className="text-stone-500">{adminLanguage === "bg" ? "Маси" : "Tables"}</div>
                      <div className="mt-1 text-lg font-semibold text-[#fff4df]">
                        {(activeTableIdsByArea[hallBlock.area] || activeTableIdsByArea.indoor).length}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-[#c9a56a]/20 bg-[#c9a56a]/10 p-4">
                      <div className="text-[#f2d39a]/70">{adminLanguage === "bg" ? "Статус" : "Status"}</div>
                      <div className="mt-1 text-lg font-semibold text-[#f2d39a]">
                        {adminLanguage === "bg" ? "Блокираща резервация" : "Blocking reservation"}
                      </div>
                    </div>
                  </div>

                  <button className="luxury-button rounded-2xl px-6 py-4 font-semibold md:col-span-4">
                    {adminLanguage === "bg" ? "Блокирай избраната зона" : "Block selected area"}
                  </button>

                  {hallBlockConflicts.length > 0 && (
                    <div className="md:col-span-4 rounded-[26px] border border-[#f2d39a]/25 bg-[#c9a56a]/10 p-5 shadow-[0_20px_55px_rgba(0,0,0,0.18)]">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="section-kicker text-[0.66rem]">
                            {adminLanguage === "bg" ? "Намерени резервации" : "Existing reservations"}
                          </div>
                          <h3 className="mt-2 text-xl font-semibold text-[#fff4df]">
                            {adminLanguage === "bg"
                              ? "Този период вече има гости"
                              : "This period already has guests"}
                          </h3>
                          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">
                            {adminLanguage === "bg"
                              ? "Премести или откажи тези резервации, след което можеш спокойно да блокираш залата."
                              : "Move or cancel these reservations, then you can block the area safely."}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => openReservationFromBlockConflict(hallBlockConflicts[0])}
                          className="ghost-button rounded-2xl px-4 py-3 text-sm font-semibold"
                        >
                          {adminLanguage === "bg" ? "Открий в резервации" : "Open in reservations"}
                        </button>
                      </div>

                      <div className="mt-4 grid gap-3 lg:grid-cols-2">
                        {hallBlockConflicts.map((conflict, index) => {
                          const id = conflict.id || conflict.Id || index;
                          const guestName = conflict.guestName || conflict.GuestName || "Reservation";
                          const phone = conflict.phone || conflict.Phone || "";
                          const reservedDate = conflict.reservedDate || conflict.ReservedDate || hallBlock.reservedDate;
                          const reservedTime = conflict.reservedTime || conflict.ReservedTime || conflict.requestedTime || conflict.RequestedTime || "";
                          const requestedTime = conflict.requestedTime || conflict.RequestedTime || "";
                          const tables = conflict.tableIds || conflict.TableIds || [];
                          const guestCount = conflict.guestCount ?? conflict.GuestCount ?? 0;

                          return (
                            <button
                              key={`${id}-${requestedTime}-${index}`}
                              type="button"
                              onClick={() => openReservationFromBlockConflict(conflict)}
                              className="rounded-2xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-[#f2d39a]/35 hover:bg-[#f2d39a]/10"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="truncate text-base font-semibold text-[#fff4df]">{guestName}</div>
                                  <div className="mt-1 text-sm text-white/58">
                                    {reservedDate} · {reservedTime}
                                    {requestedTime && requestedTime !== reservedTime ? ` · ${requestedTime}` : ""}
                                  </div>
                                </div>
                                <span className="rounded-full border border-[#f2d39a]/25 bg-[#c9a56a]/15 px-3 py-1 text-xs font-semibold text-[#f2d39a]">
                                  #{id}
                                </span>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/55">
                                <span className="rounded-full border border-white/10 px-3 py-1">
                                  {adminLanguage === "bg" ? "Маси" : "Tables"}: {tables.join(", ") || "—"}
                                </span>
                                <span className="rounded-full border border-white/10 px-3 py-1">
                                  {guestCount} {adminLanguage === "bg" ? "гости" : "guests"}
                                </span>
                                {phone && (
                                  <span className="rounded-full border border-white/10 px-3 py-1">
                                    {phone}
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </form>
              </Panel>
            )}

            {activeTab === "menu" && (
              <Panel
                title={a.menu.title}
                subtitle={a.menu.subtitle}
                right={
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      onClick={seedMenuItems}
                      className="ghost-button rounded-full px-4 py-2 text-sm font-semibold"
                    >
                      {adminLanguage === "bg" ? "Запълни от менюто на сайта" : "Seed from site menu"}
                    </button>

                    <div className="flex rounded-full border border-white/10 bg-black/20 p-1">
                      {[
                        ["list", a.menu.list],
                        ["form", editingMenuId ? a.menu.edit : a.menu.add],
                      ].map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => {
                            if (key === "form" && menuMode !== "form") {
                              setEditingMenuId(null);
                              setMenuForm({ ...emptyMenuItem, department: selectedMenuDepartment });
                            }
                            setMenuMode(key);
                          }}
                          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                            menuMode === key ? "luxury-button" : "text-white/70 hover:text-white"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                }
              >
                {menuMode === "form" ? (
                  <form onSubmit={saveMenuItem} className="space-y-5">
                    <div className="rounded-[26px] border border-white/10 bg-black/20 p-5 md:p-6">
                      <div className="mb-5">
                        <div className="section-kicker">
                          {editingMenuId
                            ? adminLanguage === "bg" ? "Редакция" : "Edit"
                            : adminLanguage === "bg" ? "Ново ястие" : "New dish"}
                        </div>
                        <h3 className="mt-2 text-2xl font-semibold text-[#fff4df]">
                          {editingMenuId ? a.menu.editTitle : a.menu.addTitle}
                        </h3>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="mb-2 block text-sm text-stone-400">{a.menu.nameBg}</label>
                          <input
                            value={menuForm.nameBg}
                            onChange={(e) => setMenuForm((prev) => ({ ...prev, nameBg: e.target.value }))}
                            required
                            className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm text-stone-400">{a.menu.nameEn}</label>
                          <input
                            value={menuForm.nameEn}
                            onChange={(e) => setMenuForm((prev) => ({ ...prev, nameEn: e.target.value }))}
                            className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm text-stone-400">{a.menu.weight}</label>
                          <input
                            value={menuForm.weight}
                            onChange={(e) => setMenuForm((prev) => ({ ...prev, weight: e.target.value }))}
                            placeholder={adminLanguage === "bg" ? "напр. 350 гр" : "e.g. 350 g"}
                            className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm text-stone-400">{a.menu.price}</label>
                          <div className="relative">
                            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#f2d39a]">
                              €
                            </span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={menuForm.price}
                              onChange={(e) => setMenuForm((prev) => ({ ...prev, price: e.target.value }))}
                              required
                              className="w-full rounded-2xl border border-white/10 bg-black/20 px-9 py-3 outline-none focus:border-amber-300"
                            />
                          </div>
                          <p className="mt-2 text-xs leading-5 text-stone-500">
                            {a.menu.priceHelp}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_180px]">
                        <div>
                          <label className="mb-2 block text-sm text-stone-400">{a.menu.imageUrl}</label>
                          <input
                            value={menuForm.imageUrl}
                            onChange={(e) => setMenuForm((prev) => ({ ...prev, imageUrl: e.target.value }))}
                            placeholder="https://..."
                            className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                          />
                          <div className="mt-3 flex flex-wrap gap-2">
                            <label className="ghost-button cursor-pointer rounded-2xl px-4 py-3 text-sm font-semibold">
                              <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                onChange={handleMenuImageFileChange}
                                className="sr-only"
                              />
                              {a.menu.uploadImage}
                            </label>
                            {menuForm.imageUrl && (
                              <button
                                type="button"
                                onClick={() => setMenuForm((prev) => ({ ...prev, imageUrl: "" }))}
                                className="rounded-2xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-100"
                              >
                                {a.menu.removeImage}
                              </button>
                            )}
                          </div>
                          <p className="mt-2 text-xs leading-5 text-stone-500">
                            {a.menu.imageHelp}
                          </p>
                        </div>

                        <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                          {menuForm.imageUrl ? (
                            <img
                              src={menuForm.imageUrl}
                              alt={menuForm.nameBg || a.menu.imageUrl}
                              className="h-36 w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-36 items-center justify-center px-4 text-center text-xs text-stone-500">
                              {adminLanguage === "bg" ? "Preview на снимката" : "Image preview"}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[26px] border border-white/10 bg-white/[0.04] p-5 md:p-6">
                      <div className="mb-5">
                        <div className="section-kicker">
                          {adminLanguage === "bg" ? "Основен раздел" : "Main section"}
                        </div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          {menuDepartmentOptions.map((department) => {
                            const selected = normalizeDepartment(menuForm.department) === department.value;

                            return (
                              <button
                                key={department.value}
                                type="button"
                                onClick={() => {
                                  setSelectedMenuDepartment(department.value);
                                  setSelectedMenuCategory("");
                                  setMenuForm((prev) => ({
                                    ...prev,
                                    department: department.value,
                                    category: department.value === "Bar" ? "cold-drinks" : "Main",
                                  }));
                                }}
                                className={`rounded-2xl border p-4 text-left transition ${
                                  selected
                                    ? "border-[#c9a56a]/50 bg-[#c9a56a]/15"
                                    : "border-white/10 bg-black/20 hover:border-[#c9a56a]/35"
                                }`}
                              >
                                <div className="font-semibold text-[#fff4df]">
                                  {department.labels[adminLanguage]}
                                </div>
                                <div className="mt-1 text-xs text-stone-500">
                                  {department.value === "Bar"
                                    ? adminLanguage === "bg" ? "Изпраща се към бара" : "Sent to the bar"
                                    : adminLanguage === "bg" ? "Изпраща се към кухнята" : "Sent to the kitchen"}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                        <div>
                          <div className="section-kicker">{a.menu.category}</div>
                          <h4 className="mt-2 text-xl font-semibold text-[#fff4df]">
                            {adminLanguage === "bg" ? "Избери секция" : "Choose section"}
                          </h4>
                        </div>
                        <div className="text-sm text-stone-500">
                          {adminLanguage === "bg" ? "Или създай нова секция по-долу" : "Or create a new section below"}
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {categoryOptions.map((category) => {
                          const selected = normalizeCategory(menuForm.category) === category.id;

                          return (
                            <button
                              key={category.id}
                              type="button"
                              onClick={() => setMenuForm((prev) => ({ ...prev, category: category.id }))}
                              className={`rounded-2xl border p-4 text-left transition ${
                                selected
                                  ? "border-[#c9a56a]/50 bg-[#c9a56a]/15"
                                  : "border-white/10 bg-black/20 hover:border-[#c9a56a]/35"
                              }`}
                            >
                              <div className="font-semibold text-[#fff4df]">{category.label}</div>
                              <div className="mt-1 text-xs text-stone-500">
                                {category.count} {adminLanguage === "bg" ? "ястия" : "dishes"}
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      <div className="mt-4 rounded-2xl border border-dashed border-white/15 bg-black/20 p-4">
                        <label className="mb-2 block text-sm text-stone-400">
                          {adminLanguage === "bg" ? "Нова секция" : "New section"}
                        </label>
                        <input
                          value={
                            categoryOptions.some((category) => category.id === normalizeCategory(menuForm.category))
                              ? ""
                              : menuForm.category
                          }
                          onChange={(e) => setMenuForm((prev) => ({ ...prev, category: e.target.value }))}
                          placeholder={adminLanguage === "bg" ? "например: Напитки" : "for example: Drinks"}
                          className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-amber-300"
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm text-stone-400">{a.menu.descriptionBg}</label>
                        <textarea
                          value={menuForm.descriptionBg}
                          onChange={(e) => setMenuForm((prev) => ({ ...prev, descriptionBg: e.target.value }))}
                          rows={5}
                          className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm text-stone-400">{a.menu.descriptionEn}</label>
                        <textarea
                          value={menuForm.descriptionEn}
                          onChange={(e) => setMenuForm((prev) => ({ ...prev, descriptionEn: e.target.value }))}
                          rows={5}
                          className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-stone-300">
                        <input
                          type="checkbox"
                          checked={menuForm.isActive}
                          onChange={(e) => setMenuForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                        />
                        {a.menu.active}
                      </label>

                      <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-stone-300">
                        <input
                          type="checkbox"
                          checked={menuForm.notifySubscribers}
                          onChange={(e) => setMenuForm((prev) => ({ ...prev, notifySubscribers: e.target.checked }))}
                        />
                        {a.menu.notify}
                      </label>
                    </div>

                    <div className="flex flex-col gap-3 md:flex-row">
                      <button className="luxury-button rounded-2xl px-6 py-4 font-semibold">
                        {editingMenuId ? a.menu.saveEdit : a.menu.saveAdd}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingMenuId(null);
                          setMenuForm(emptyMenuItem);
                          setMenuMode("list");
                        }}
                        className="ghost-button rounded-2xl px-6 py-4 font-semibold"
                      >
                        {a.menu.cancelEdit}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-5">
                    {menuItems.length === 0 && (
                      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-stone-400">
                        <div>{a.menu.empty}</div>
                        <button
                          type="button"
                          onClick={seedMenuItems}
                          className="luxury-button mt-4 rounded-2xl px-5 py-3 text-sm font-semibold"
                        >
                          {adminLanguage === "bg" ? "Добави всички базови ястия" : "Add all base dishes"}
                        </button>
                      </div>
                    )}

                    <div className="grid gap-3 sm:grid-cols-2">
                      {menuDepartmentCounts.map((department) => {
                        const selected = selectedMenuDepartment === department.value;

                        return (
                          <button
                            key={department.value}
                            type="button"
                            onClick={() => {
                              setSelectedMenuDepartment(department.value);
                              setSelectedMenuCategory("");
                            }}
                            className={`menu-spark rounded-[24px] border p-5 text-left transition ${
                              selected
                                ? "border-[#c9a56a]/45 bg-[#c9a56a]/15 shadow-xl shadow-black/20"
                                : "border-white/10 bg-white/[0.04] hover:border-[#c9a56a]/30 hover:bg-white/[0.07]"
                            }`}
                          >
                            <div className="section-kicker">
                              {department.value === "Bar"
                                ? adminLanguage === "bg" ? "Бар" : "Bar"
                                : adminLanguage === "bg" ? "Кухня" : "Kitchen"}
                            </div>
                            <div className="mt-2 text-2xl font-semibold text-[#fff4df]">
                              {department.labels[adminLanguage]}
                            </div>
                            <div className="mt-2 text-sm text-stone-400">
                              {department.count} {adminLanguage === "bg" ? "позиции" : "items"} · {department.activeCount} active
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {menuCategories.length > 0 && (
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        {menuCategories.map((category) => {
                          const selected = selectedCategoryData?.id === category.id;

                          return (
                            <button
                              key={category.id}
                              type="button"
                              onClick={() => selectAdminMenuCategory(category.id)}
                              className={`menu-spark rounded-[24px] border p-5 text-left transition ${
                                selected
                                  ? "border-[#c9a56a]/45 bg-[#c9a56a]/15 shadow-xl shadow-black/20"
                                  : "border-white/10 bg-white/[0.04] hover:border-[#c9a56a]/30 hover:bg-white/[0.07]"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-lg font-semibold text-[#fff4df]">
                                    {category.label}
                                  </div>
                                  <div className="mt-2 text-sm text-stone-400">
                                    {category.count} {adminLanguage === "bg" ? "ястия" : "dishes"}
                                  </div>
                                </div>
                                <div className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                  selected
                                    ? "bg-[#c9a56a] text-black"
                                    : "border border-white/10 bg-black/20 text-stone-300"
                                }`}>
                                  {category.activeCount}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {selectedCategoryData && (
                      <div ref={menuItemsRef} className="scroll-mt-6 rounded-[26px] border border-white/10 bg-black/20 p-4 md:p-5">
                        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                          <div>
                            <div className="section-kicker">
                              {adminLanguage === "bg" ? "Отворена секция" : "Open section"}
                            </div>
                            <h3 className="mt-2 text-2xl font-semibold text-[#fff4df]">
                              {selectedCategoryData.label}
                            </h3>
                          </div>
                          <div className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-stone-300">
                            {selectedCategoryData.count} {adminLanguage === "bg" ? "позиции" : "items"}
                          </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {selectedCategoryItems.map((item) => (
                      <div key={item.id || item.Id} className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                        {(item.imageUrl || item.ImageUrl) && (
                          <div className="-mx-1 mb-4 overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                            <img
                              src={item.imageUrl || item.ImageUrl}
                              alt={item.nameBg || item.NameBg || ""}
                              loading="lazy"
                              className="h-40 w-full object-cover"
                            />
                          </div>
                        )}
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-lg font-semibold">{item.nameBg || item.NameBg}</div>
                            <div className="mt-1 text-sm text-stone-400">{item.nameEn || item.NameEn || "—"}</div>
                          </div>
                          <div className="rounded-full bg-amber-400 px-3 py-1 text-sm font-semibold text-black">
                            €{Number(item.price || item.Price || 0).toFixed(2)}
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2 text-xs">
                          <span className="rounded-full border border-[#c9a56a]/20 bg-[#c9a56a]/10 px-3 py-1 text-[#f2d39a]">
                            {getDepartmentLabel(item.department || item.Department, adminLanguage)}
                          </span>
                          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-stone-300">
                            {item.category || item.Category || "Main"}
                          </span>
                          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-stone-300">
                            {item.weight || item.Weight || "—"}
                          </span>
                          <span className={`rounded-full border px-3 py-1 ${
                            (item.isActive ?? item.IsActive ?? true)
                              ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
                              : "border-red-400/25 bg-red-400/10 text-red-200"
                          }`}>
                            {(item.isActive ?? item.IsActive ?? true) ? "Active" : "Hidden"}
                          </span>
                        </div>

                        <p className="mt-4 text-sm leading-6 text-stone-300">
                          {item.descriptionBg || item.DescriptionBg || "—"}
                        </p>
                        <p className="mt-3 text-sm leading-6 text-stone-500">
                          {item.descriptionEn || item.DescriptionEn || "—"}
                        </p>

                        <div className="mt-5 flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const department = normalizeDepartment(item.department || item.Department);
                              setSelectedMenuDepartment(department);
                              setEditingMenuId(item.id || item.Id);
                              setMenuForm({
                                nameBg: item.nameBg || item.NameBg || "",
                                nameEn: item.nameEn || item.NameEn || "",
                                descriptionBg: item.descriptionBg || item.DescriptionBg || "",
                                descriptionEn: item.descriptionEn || item.DescriptionEn || "",
                                imageUrl: item.imageUrl || item.ImageUrl || "",
                                weight: item.weight || item.Weight || "",
                                price: item.price || item.Price || "",
                                department,
                                category: item.category || item.Category || "Main",
                                isActive: item.isActive ?? item.IsActive ?? true,
                                notifySubscribers: false,
                              });
                              setMenuMode("form");
                            }}
                            className="ghost-button rounded-xl px-4 py-2 text-sm"
                          >
                            {a.menu.edit}
                          </button>

                          <button
                            type="button"
                            onClick={() => deleteMenuItem(item.id || item.Id)}
                            className="rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white"
                          >
                            {a.menu.delete}
                          </button>
                        </div>
                      </div>
                    ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Panel>
            )}

            {activeTab === "events" && (
              <Panel
                title={a.events.title}
                subtitle={a.events.subtitle}
                right={
                  <div className="flex rounded-full border border-white/10 bg-black/20 p-1">
                    {[
                      ["list", a.events.list],
                      ["form", editingEventId ? a.events.edit : a.events.add],
                    ].map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          if (key === "form" && eventMode !== "form") {
                            setEditingEventId(null);
                            setEventForm(emptyEventItem);
                          }
                          setEventMode(key);
                        }}
                        className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                          eventMode === key ? "luxury-button" : "text-white/70 hover:text-white"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                }
              >
                {eventMode === "form" ? (
                  <form onSubmit={saveEventItem} className="space-y-5">
                    <div className="rounded-[26px] border border-white/10 bg-black/20 p-5 md:p-6">
                      <div className="mb-5">
                        <div className="section-kicker">
                          {editingEventId
                            ? adminLanguage === "bg" ? "Редакция на събитие" : "Edit event"
                            : adminLanguage === "bg" ? "Ново събитие" : "New event"}
                        </div>
                        <h3 className="mt-2 text-2xl font-semibold text-[#fff4df]">
                          {editingEventId ? a.events.editTitle : a.events.addTitle}
                        </h3>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="mb-2 block text-sm text-stone-400">{a.events.titleBg}</label>
                          <input
                            value={eventForm.titleBg}
                            onChange={(e) => setEventForm((prev) => ({ ...prev, titleBg: e.target.value }))}
                            required
                            className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm text-stone-400">{a.events.titleEn}</label>
                          <input
                            value={eventForm.titleEn}
                            onChange={(e) => setEventForm((prev) => ({ ...prev, titleEn: e.target.value }))}
                            className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                          />
                        </div>

                        <div className="md:col-span-2">
                          <label className="mb-2 block text-sm text-stone-400">{a.events.badge}</label>
                          <input
                            value={eventForm.badge}
                            onChange={(e) => setEventForm((prev) => ({ ...prev, badge: e.target.value }))}
                            placeholder={adminLanguage === "bg" ? "напр. 14.02 GIVEAWAY" : "e.g. 14.02 GIVEAWAY"}
                            className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                          />
                        </div>

                        <div className="md:col-span-2">
                          <label className="mb-2 block text-sm text-stone-400">{a.events.activeUntil}</label>
                          <input
                            type="datetime-local"
                            value={eventForm.activeUntilLocal}
                            onChange={(e) => setEventForm((prev) => ({ ...prev, activeUntilLocal: e.target.value }))}
                            className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                          />
                          <p className="mt-2 text-xs leading-5 text-stone-500">{a.events.activeUntilHelp}</p>
                        </div>

                        <div>
                          <label className="mb-2 block text-sm text-stone-400">{a.events.textBg}</label>
                          <textarea
                            value={eventForm.textBg}
                            onChange={(e) => setEventForm((prev) => ({ ...prev, textBg: e.target.value }))}
                            rows={7}
                            className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm text-stone-400">{a.events.textEn}</label>
                          <textarea
                            value={eventForm.textEn}
                            onChange={(e) => setEventForm((prev) => ({ ...prev, textEn: e.target.value }))}
                            rows={7}
                            className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[26px] border border-white/10 bg-white/[0.04] p-5 md:p-6">
                      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                        <div>
                          <div className="section-kicker">{a.events.photos}</div>
                          <h4 className="mt-2 text-xl font-semibold text-[#fff4df]">
                            {adminLanguage === "bg" ? "Галерия на събитието" : "Event gallery"}
                          </h4>
                        </div>

                        <label className="ghost-button cursor-pointer rounded-2xl px-4 py-3 text-sm font-semibold">
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={handleEventImageFileChange}
                            className="sr-only"
                          />
                          {a.events.uploadPhotos}
                        </label>
                      </div>

                      <p className="mb-4 text-sm leading-6 text-stone-500">{a.events.photoHelp}</p>

                      {(eventForm.imageUrls || []).length > 0 ? (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                          {eventForm.imageUrls.map((imageUrl, index) => (
                            <div key={`${imageUrl}-${index}`} className="overflow-hidden rounded-3xl border border-white/10 bg-black/20">
                              <img
                                src={imageUrl}
                                alt={`${eventForm.titleBg || a.events.photos} ${index + 1}`}
                                className="h-44 w-full object-cover"
                              />
                              <button
                                type="button"
                                onClick={() => removeEventImage(index)}
                                className="w-full border-t border-white/10 px-4 py-3 text-sm font-semibold text-red-100 hover:bg-red-500/10"
                              >
                                {a.events.removePhoto}
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-3xl border border-dashed border-white/15 bg-black/20 p-8 text-center text-sm text-stone-500">
                          {adminLanguage === "bg" ? "Качете една или няколко снимки за събитието." : "Upload one or more event photos."}
                        </div>
                      )}
                    </div>

                    <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-stone-300">
                      <input
                        type="checkbox"
                        checked={eventForm.isActive}
                        onChange={(e) => setEventForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                      />
                      {a.events.active}
                    </label>

                    <div className="flex flex-col gap-3 md:flex-row">
                      <button className="luxury-button rounded-2xl px-6 py-4 font-semibold">
                        {editingEventId ? a.events.saveEdit : a.events.saveAdd}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingEventId(null);
                          setEventForm(emptyEventItem);
                          setEventMode("list");
                        }}
                        className="ghost-button rounded-2xl px-6 py-4 font-semibold"
                      >
                        {a.events.cancelEdit}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-5">
                    {eventItems.length === 0 && (
                      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-stone-400">
                        {a.events.empty}
                      </div>
                    )}

                    <div className="grid gap-5 lg:grid-cols-2">
                      {eventItems.map((item) => {
                        const id = getValue(item, "id");
                        const photos = getValue(item, "imageUrls") || [];
                        const title = getValue(item, "titleBg") || getValue(item, "titleEn") || "Event";
                        const subtitle = getValue(item, "textBg") || getValue(item, "textEn") || "";
                        const active = getValue(item, "isActive") ?? true;
                        const activeUntilUtc = getValue(item, "activeUntilUtc");
                        const isExpired = activeUntilUtc ? new Date(activeUntilUtc).getTime() <= Date.now() : false;
                        const activeUntilLabel = activeUntilUtc
                          ? new Date(activeUntilUtc).toLocaleString(adminLanguage === "bg" ? "bg-BG" : "en-US", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })
                          : "";

                        return (
                          <div key={id} className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04]">
                            <div className="grid gap-0 md:grid-cols-[220px_1fr]">
                              <div className="relative min-h-[210px] bg-black/25">
                                {photos[0] ? (
                                  <img
                                    src={photos[0]}
                                    alt={title}
                                    loading="lazy"
                                    className="absolute inset-0 h-full w-full object-cover"
                                  />
                                ) : (
                                  <div className="absolute inset-0 flex items-center justify-center text-xs uppercase tracking-[0.35em] text-[#f2d39a]">
                                    Casa
                                  </div>
                                )}
                                <div className="absolute left-4 top-4 rounded-full border border-white/10 bg-black/55 px-3 py-1 text-xs font-semibold text-white">
                                  {photos.length} {adminLanguage === "bg" ? "снимки" : "photos"}
                                </div>
                              </div>

                              <div className="p-5">
                                <div className="mb-4 flex flex-wrap items-center gap-2">
                                  {getValue(item, "badge") && (
                                    <span className="rounded-full border border-[#c9a56a]/30 bg-[#c9a56a]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-[#f2d39a]">
                                      {getValue(item, "badge")}
                                    </span>
                                  )}
                                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                                    active && !isExpired
                                      ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
                                      : "border-red-400/25 bg-red-400/10 text-red-200"
                                  }`}>
                                    {isExpired
                                      ? adminLanguage === "bg" ? "Изтекло" : "Expired"
                                      : active ? (adminLanguage === "bg" ? "Активно" : "Active") : (adminLanguage === "bg" ? "Скрито" : "Hidden")}
                                  </span>
                                </div>

                                <h3 className="text-xl font-semibold text-[#fff4df]">{title}</h3>
                                {activeUntilLabel && (
                                  <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#f2d39a]/75">
                                    {adminLanguage === "bg" ? "Активно до " : "Active until "}
                                    {activeUntilLabel}
                                  </p>
                                )}
                                <p className="mt-3 line-clamp-3 text-sm leading-6 text-stone-400">
                                  {subtitle || "—"}
                                </p>

                                <div className="mt-5 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => startEditingEventItem(item)}
                                    className="ghost-button rounded-xl px-4 py-2 text-sm"
                                  >
                                    {a.events.edit}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => deleteEventItem(id)}
                                    className="rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white"
                                  >
                                    {a.events.delete}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </Panel>
            )}

            {activeTab === "layout" && (
              <TableLayoutEditor
                text={a.layout}
                layout={tableLayout}
                selectedArea={layoutArea}
                onAreaChange={setLayoutArea}
                onUpdate={updateTableLayoutItem}
                onAdd={addTableLayoutItem}
                onRemove={removeTableLayoutItem}
                onSave={saveTableLayout}
                onReset={resetTableLayout}
              />
            )}

            {activeTab === "blacklist" && (
              <Panel
                title="Blacklist"
                subtitle={adminLocalText(
                  adminLanguage,
                  "No-show клиенти и проблемни резервации.",
                  "No-show guests and problematic reservations.",
                  "No-show гости и проблемные резервации."
                )}
                right={
                  <div className="flex rounded-full border border-white/10 bg-black/20 p-1">
                    {[
                      ["list", adminLocalText(adminLanguage, "Списък", "List", "Список")],
                      ["form", adminLocalText(adminLanguage, "Добави ръчно", "Add manually", "Добавить вручную")],
                    ].map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setBlacklistMode(key)}
                        className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                          blacklistMode === key ? "luxury-button" : "text-white/70 hover:text-white"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                }
              >
                {blacklistMode === "form" ? (
                  <form onSubmit={saveBlacklistEntry} className="grid gap-4 md:grid-cols-3">
                    {[
                      ["guestName", adminLocalText(adminLanguage, "Име", "Guest name", "Имя гостя")],
                      ["phone", adminLocalText(adminLanguage, "Телефон", "Phone", "Телефон")],
                      ["email", "Email"],
                      ["reason", adminLocalText(adminLanguage, "Причина", "Reason", "Причина")],
                    ].map(([key, label]) => (
                      <div key={key}>
                        <label className="mb-2 block text-sm text-stone-400">{label}</label>
                        <input
                          value={blacklistForm[key]}
                          onChange={(e) =>
                            setBlacklistForm((prev) => ({
                              ...prev,
                              [key]: e.target.value,
                            }))
                          }
                          required={["guestName", "phone", "reason"].includes(key)}
                          className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                        />
                      </div>
                    ))}

                    <div className="md:col-span-3">
                      <label className="mb-2 block text-sm text-stone-400">
                        {adminLocalText(adminLanguage, "Бележки", "Notes", "Заметки")}
                      </label>
                      <textarea
                        value={blacklistForm.notes}
                        onChange={(e) =>
                          setBlacklistForm((prev) => ({
                            ...prev,
                            notes: e.target.value,
                          }))
                        }
                        rows={4}
                        className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                      />
                    </div>

                    <div className="flex flex-col gap-3 md:col-span-3 md:flex-row">
                      <button className="rounded-2xl bg-yellow-400 px-6 py-4 font-semibold text-black">
                        {adminLocalText(adminLanguage, "Добави в blacklist", "Add to blacklist", "Добавить в blacklist")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setBlacklistMode("list")}
                        className="ghost-button rounded-2xl px-6 py-4 font-semibold"
                      >
                        {adminLocalText(adminLanguage, "Назад към списъка", "Back to list", "Назад к списку")}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-4">
                    {blacklist.length === 0 && (
                      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-stone-400">
                        {adminLocalText(adminLanguage, "Blacklist е празен.", "Blacklist is empty.", "Blacklist пуст.")}
                      </div>
                    )}

                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {blacklist.map((item) => (
                        <div key={item.id || item.Id} className="rounded-3xl border border-yellow-400/20 bg-yellow-400/10 p-5">
                          <div className="font-semibold">{item.guestName || item.GuestName || "—"}</div>
                          <div className="mt-2 text-sm text-yellow-100/80">{item.phone || item.Phone}</div>
                          <div className="mt-1 text-sm text-yellow-100/80">{item.email || item.Email || "—"}</div>
                          <div className="mt-4 rounded-2xl border border-yellow-300/15 bg-black/15 p-3 text-sm">
                            {item.reason || item.Reason}
                          </div>
                          <div className="mt-2 text-sm text-yellow-100/60">{item.notes || item.Notes}</div>

                          <button
                            type="button"
                            onClick={() => deleteBlacklistEntry(item.id || item.Id)}
                            className="mt-5 rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Panel>
            )}

            {activeTab === "reports" && (
              <Panel
                title={adminLanguage === "bg" ? "Отчети" : "Reports"}
                subtitle={
                  adminLanguage === "bg"
                    ? "Бърз оперативен отчет за резервации, онлайн поръчки и гости."
                    : "Quick operating report for reservations, online orders, and guests."
                }
                right={
                  <div className="flex rounded-full border border-white/10 bg-black/20 p-1">
                    {[
                      ["today", adminLanguage === "bg" ? "Днес" : "Today"],
                      ["week", adminLanguage === "bg" ? "Седмица" : "Week"],
                      ["month", adminLanguage === "bg" ? "Месец" : "Month"],
                    ].map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setStatsPeriod(key)}
                        className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                          statsPeriod === key ? "luxury-button" : "text-white/70 hover:text-white"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                }
              >
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                  {reportMetrics.map((metric) => (
                    <div key={metric.label} className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                      <div className="text-xs uppercase tracking-[0.22em] text-[#f2d39a]/70">{metric.label}</div>
                      <div className="mt-3 text-4xl font-semibold text-[#fff4df]">{metric.value}</div>
                      <div className="mt-2 text-sm text-white/45">{metric.detail}</div>
                    </div>
                  ))}
                </div>

                <div className={`mt-6 grid gap-4 ${isProVersion ? "xl:grid-cols-2" : ""}`}>
                  <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
                    <div className="section-kicker">
                      {adminLanguage === "bg" ? "Резервации по източник" : "Reservations by source"}
                    </div>
                    <div className="mt-4 space-y-3 text-sm text-white/70">
                      <div className="flex justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                        <span>{adminLanguage === "bg" ? "През сайта" : "Website"}</span>
                        <strong className="text-[#fff4df]">{siteReservations.length}</strong>
                      </div>
                      <div className="flex justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                        <span>{adminLanguage === "bg" ? "От админ" : "Admin created"}</span>
                        <strong className="text-[#fff4df]">{adminReservations.length}</strong>
                      </div>
                      <div className="flex justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                        <span>{adminLanguage === "bg" ? "Без резервация" : "Walk-ins"}</span>
                        <strong className="text-[#fff4df]">{walkInReservations.length}</strong>
                      </div>
                    </div>
                  </div>

                  {isProVersion && (
                    <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
                      <div className="section-kicker">
                        {adminLanguage === "bg" ? "Оборот по сервитьори" : "Revenue by waiter"}
                      </div>
                      <div className="mt-4 space-y-3">
                        {waiterReportRows.map((row) => (
                          <div key={row.key} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm">
                            <div className="flex items-center justify-between gap-3">
                              <span className="min-w-0 truncate font-semibold text-[#fff4df]">{row.waiterName}</span>
                              <span className="shrink-0 text-[#f2d39a]">{formatEuroAmount(row.revenue)}</span>
                            </div>
                            <div className="mt-1 text-xs text-white/45">
                              {row.orders} {adminLanguage === "bg" ? "поръчки" : "orders"} · {row.tableCount} {adminLanguage === "bg" ? "маси" : "tables"}
                            </div>
                          </div>
                        ))}
                        {waiterReportRows.length === 0 && (
                          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/45">
                            {adminLanguage === "bg" ? "Няма поръчки за периода." : "No orders for the period."}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {isProVersion && (
                  <div className="mt-6 rounded-3xl border border-white/10 bg-black/20 p-5">
                    <div className="section-kicker">
                      {adminLanguage === "bg" ? "Продадени артикули" : "Sold items"}
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {soldItemRows.slice(0, 12).map((row) => (
                        <div key={row.name} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <span className="min-w-0 truncate font-semibold text-[#fff4df]">{row.name}</span>
                            <span className="shrink-0 rounded-full border border-[#f2d39a]/20 bg-[#c9a56a]/10 px-2.5 py-1 text-xs font-semibold text-[#f2d39a]">
                              {row.quantity}x
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-white/45">{formatEuroAmount(row.revenue)}</div>
                        </div>
                      ))}
                      {soldItemRows.length === 0 && (
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/45">
                          {adminLanguage === "bg" ? "Няма продадени артикули за периода." : "No sold items for the period."}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Panel>
            )}

            {activeTab === "inventory" && isProVersion && !isWaiterRole && !isProductionRole && (
              <InventoryModule
                adminLanguage={adminLanguage}
                adminFetch={adminFetch}
                menuItems={menuItems}
                loadMenuItems={loadMenuItems}
              />
            )}

            {activeTab === "maintenance" && canUseMaintenance && (
              <MaintenanceModule
                adminLanguage={adminLanguage}
                adminFetch={adminFetch}
                loadReservations={loadReservations}
                loadDiningOrders={loadDiningOrders}
                isProVersion={isProVersion}
              />
            )}

            {activeTab === "feedback" && canViewFeedback && (
              <Panel
                title={adminLocalText(adminLanguage, "Обратна връзка", "Customer feedback", "Обратная связь")}
                subtitle={
                  adminLocalText(
                    adminLanguage,
                    "Кратки клиентски впечатления за атмосфера, храна, обслужване и дигиталната система.",
                    "Guest impressions about atmosphere, food, service, and the digital system.",
                    "Короткие впечатления гостей об атмосфере, еде, обслуживании и цифровой системе."
                  )
                }
                right={
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <input
                      value={feedbackSearch}
                      onChange={(event) => setFeedbackSearch(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") loadFeedbackEntries();
                      }}
                      placeholder={adminLocalText(adminLanguage, "Промокод, име, email...", "Promo code, name, email...", "Промокод, имя, email...")}
                      className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none placeholder:text-white/35 focus:border-amber-300"
                    />
                    <button type="button" onClick={loadFeedbackEntries} className="ghost-button rounded-2xl px-4 py-3 text-sm font-semibold">
                      {adminLocalText(adminLanguage, "Търси / обнови", "Search / refresh", "Искать / обновить")}
                    </button>
                  </div>
                }
              >
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-3xl border border-[#c9a56a]/20 bg-[#c9a56a]/10 p-5">
                    <div className="section-kicker">{adminLocalText(adminLanguage, "Получени", "Received", "Получено")}</div>
                    <div className="mt-3 text-4xl font-semibold text-[#fff4df]">{feedbackEntries.length}</div>
                  </div>
                  <div className="rounded-3xl border border-emerald-300/20 bg-emerald-500/10 p-5">
                    <div className="section-kicker">{adminLocalText(adminLanguage, "Средна оценка", "Average rating", "Средняя оценка")}</div>
                    <div className="mt-3 text-4xl font-semibold text-emerald-100">
                      {feedbackEntries.length
                        ? (
                            feedbackEntries.reduce((total, item) => {
                              const ratings = [
                                item.atmosphereRating,
                                item.foodRating,
                                item.serviceRating,
                                item.onlineReservationRating,
                                item.softwareRating,
                              ].map(Number).filter(Boolean);
                              return total + (ratings.reduce((sum, value) => sum + value, 0) / Math.max(1, ratings.length));
                            }, 0) / feedbackEntries.length
                          ).toFixed(1)
                        : "—"}
                    </div>
                  </div>
                  <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                    <div className="section-kicker">Google</div>
                    <div className="mt-3 text-4xl font-semibold text-[#fff4df]">
                      {feedbackEntries.filter((item) => item.googleReviewClicked).length}
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 xl:grid-cols-2">
                  {feedbackEntries.map((item) => {
                    const ratings = [
                      ["Атмосфера", item.atmosphereRating],
                      ["Храна", item.foodRating],
                      ["Обслужване", item.serviceRating],
                      ["Онлайн", item.onlineReservationRating],
                      ["Карта", item.tableMapRating],
                      ["Полезност", item.tableMapUsefulnessRating],
                      ["Софтуер", item.softwareRating],
                    ];
                    const analytics = [
                      ["Процес резервация", item.onlineReservationEase],
                      ["Пак избор на маса", item.tableMapReuseIntent],
                      ["Важност маса", item.tableChoiceImportance],
                      ["Най-полезна функция", item.mostUsefulDigitalFeature],
                      ["Повторно посещение", item.returnLikelihood ? `${item.returnLikelihood}/10` : ""],
                      ["Препоръка", item.recommendLikelihood || item.recommendLikelihood === 0 ? `${item.recommendLikelihood}/10` : ""],
                    ].filter(([, value]) => String(value ?? "").trim());
                    const texts = [
                      ["Атмосфера - приятно", item.atmosphereImpression],
                      ["Атмосфера - промяна", item.atmosphereChange],
                      ["Храна - приятно", item.foodImpression],
                      ["Храна - промяна", item.foodChange],
                      ["Обслужване - приятно", item.serviceImpression],
                      ["Обслужване - промяна", item.serviceChange],
                      ["Онлайн резервация", item.onlineReservationFeedback],
                      ["Интерактивна карта", item.tableMapFavoriteFeature],
                      ["Софтуер", item.softwareFeedback],
                      ["Отношение към клиенти", item.clientCareFeedback],
                      ["Малки детайли", item.smallDetailsFeedback],
                      ["Едно нещо за промяна", item.oneThingToChange],
                    ].filter(([, value]) => String(value || "").trim());

                    return (
                      <div key={item.id} className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-lg font-semibold text-[#fff4df]">{item.guestName || "—"}</div>
                            <div className="mt-1 text-sm text-white/45">{item.email || "—"} · #{item.reservationId || "—"}</div>
                          </div>
                          <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                            item.discountCodeUsed
                              ? "border-emerald-300/25 bg-emerald-400/12 text-emerald-100"
                              : "border-[#f2d39a]/25 bg-[#c9a56a]/12 text-[#f2d39a]"
                          }`}>
                            {item.discountCode || "5%"} {item.discountCodeUsed ? "· използван" : ""}
                          </div>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                          {ratings.map(([label, rating]) => (
                            <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-center">
                              <div className="text-[10px] uppercase tracking-[0.16em] text-white/35">{label}</div>
                              <div className="mt-1 text-lg font-semibold text-[#f2d39a]">{rating || "—"}</div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {analytics.map(([label, value]) => (
                            <span key={label} className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-xs text-white/62">
                              <span className="text-[#f2d39a]/70">{label}:</span> {value}
                            </span>
                          ))}
                        </div>
                        <div className="mt-4 space-y-2">
                          {texts.length === 0 && (
                            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/45">
                              {adminLocalText(adminLanguage, "Няма текстови бележки.", "No text notes.", "Текстовых заметок нет.")}
                            </div>
                          )}
                          {texts.map(([label, value]) => (
                            <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm">
                              <div className="text-[10px] uppercase tracking-[0.16em] text-[#f2d39a]/70">{label}</div>
                              <div className="mt-1 leading-6 text-white/70">{value}</div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 text-xs text-white/35">
                          {new Date(item.createdAtUtc).toLocaleString()}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {!item.discountCodeUsed && (
                            <button
                              type="button"
                              onClick={() => markFeedbackDiscountUsed(item.id)}
                              className="rounded-2xl border border-emerald-300/25 bg-emerald-500/12 px-4 py-2 text-xs font-semibold text-emerald-100"
                            >
                              {adminLocalText(adminLanguage, "Маркирай кода използван", "Mark code used", "Отметить код использованным")}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => deleteFeedbackEntry(item.id)}
                            className="rounded-2xl border border-red-300/25 bg-red-500/12 px-4 py-2 text-xs font-semibold text-red-100"
                          >
                            {adminLocalText(adminLanguage, "Изтрий", "Delete", "Удалить")}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {feedbackEntries.length === 0 && (
                    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-stone-400">
                      {adminLocalText(adminLanguage, "Все още няма обратна връзка.", "No feedback yet.", "Обратной связи пока нет.")}
                    </div>
                  )}
                </div>
              </Panel>
            )}

            {activeTab === "marketing" && canManageMarketing && (
              <MarketingModule
                adminLanguage={adminLanguage}
                adminFetch={adminFetch}
              />
            )}

            {activeTab === "customers" && (
              <Panel
                title={adminLocalText(adminLanguage, "Клиенти", "Customers", "Клиенты")}
                subtitle={
                  adminLocalText(
                    adminLanguage,
                    "Рейтинг по посещения, детайли при отваряне и blacklist в една секция.",
                    "Visit ranking, expandable details, and blacklist in one section.",
                    "Рейтинг по посещениям, детали и blacklist в одном разделе."
                  )
                }
                right={
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    {customersMode === "customers" && (
                      <button
                        type="button"
                        onClick={() => setShowManualCustomerForm((value) => !value)}
                        className="luxury-button rounded-full px-4 py-2 text-sm font-semibold"
                      >
                        {showManualCustomerForm
                          ? adminLocalText(adminLanguage, "Скрий формата", "Hide form", "Скрыть форму")
                          : adminLocalText(adminLanguage, "Добави клиент", "Add customer", "Добавить клиента")}
                      </button>
                    )}
                    <div className="flex rounded-full border border-white/10 bg-black/20 p-1">
                      {[
                        ["customers", adminLocalText(adminLanguage, "Клиенти", "Customers", "Клиенты")],
                        ["website", adminLocalText(adminLanguage, "От сайта", "From website", "С сайта")],
                        ["blacklist", "Blacklist"],
                      ].map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setCustomersMode(key)}
                          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                            customersMode === key ? "luxury-button" : "text-white/70 hover:text-white"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                }
              >
                {customersMode === "blacklist" ? (
                  <div className="space-y-5">
                    <div className="flex justify-end">
                      <div className="flex rounded-full border border-white/10 bg-black/20 p-1">
                        {[
                          ["list", adminLocalText(adminLanguage, "Списък", "List", "Список")],
                          ["form", adminLocalText(adminLanguage, "Добави ръчно", "Add manually", "Добавить вручную")],
                        ].map(([key, label]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setBlacklistMode(key)}
                            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                              blacklistMode === key ? "luxury-button" : "text-white/70 hover:text-white"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {blacklistMode === "form" ? (
                      <form onSubmit={saveBlacklistEntry} className="grid gap-4 md:grid-cols-3">
                        {[
                          ["guestName", adminLocalText(adminLanguage, "Име", "Guest name", "Имя гостя")],
                          ["phone", adminLocalText(adminLanguage, "Телефон", "Phone", "Телефон")],
                          ["email", "Email"],
                          ["reason", adminLocalText(adminLanguage, "Причина", "Reason", "Причина")],
                        ].map(([key, label]) => (
                          <div key={key}>
                            <label className="mb-2 block text-sm text-stone-400">{label}</label>
                            <input
                              value={blacklistForm[key]}
                              onChange={(e) =>
                                setBlacklistForm((prev) => ({
                                  ...prev,
                                  [key]: e.target.value,
                                }))
                              }
                              required={["guestName", "phone", "reason"].includes(key)}
                              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                            />
                          </div>
                        ))}

                        <div className="md:col-span-3">
                          <label className="mb-2 block text-sm text-stone-400">
                            {adminLocalText(adminLanguage, "Бележки", "Notes", "Заметки")}
                          </label>
                          <textarea
                            value={blacklistForm.notes}
                            onChange={(e) =>
                              setBlacklistForm((prev) => ({
                                ...prev,
                                notes: e.target.value,
                              }))
                            }
                            rows={4}
                            className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                          />
                        </div>

                        <div className="flex flex-col gap-3 md:col-span-3 md:flex-row">
                          <button className="luxury-button rounded-2xl px-6 py-4 font-semibold">
                            {adminLocalText(adminLanguage, "Добави в blacklist", "Add to blacklist", "Добавить в blacklist")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setBlacklistMode("list")}
                            className="ghost-button rounded-2xl px-6 py-4 font-semibold"
                          >
                            {adminLocalText(adminLanguage, "Назад към списъка", "Back to list", "Назад к списку")}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="space-y-4">
                        {blacklist.length === 0 && (
                          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-stone-400">
                            {adminLocalText(adminLanguage, "Blacklist е празен.", "Blacklist is empty.", "Blacklist пуст.")}
                          </div>
                        )}

                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                          {blacklist.map((item) => (
                            <div key={item.id || item.Id} className="rounded-3xl border border-red-300/20 bg-red-500/10 p-5">
                              <div className="font-semibold text-[#fff4df]">{item.guestName || item.GuestName || "—"}</div>
                              <div className="mt-2 text-sm text-red-100/80">{item.phone || item.Phone}</div>
                              <div className="mt-1 text-sm text-red-100/70">{item.email || item.Email || "—"}</div>
                              <div className="mt-4 rounded-2xl border border-red-300/15 bg-black/15 p-3 text-sm text-red-50/90">
                                {item.reason || item.Reason}
                              </div>
                              <div className="mt-2 text-sm text-red-100/60">{item.notes || item.Notes}</div>

                              <button
                                type="button"
                                onClick={() => deleteBlacklistEntry(item.id || item.Id)}
                                className="mt-5 rounded-xl border border-red-300/25 bg-red-500/20 px-4 py-2 text-sm font-semibold text-red-100"
                              >
                                {adminLocalText(adminLanguage, "Премахни", "Remove", "Убрать")}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {showManualCustomerForm && (
                      <form onSubmit={saveManualCustomer} className="rounded-[28px] border border-[#c9a56a]/18 bg-[#c9a56a]/10 p-4 md:p-5">
                        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                          <div>
                            <div className="section-kicker">
                              {adminLocalText(adminLanguage, "Ръчен клиент", "Manual customer", "Ручной клиент")}
                            </div>
                            <p className="mt-2 text-sm text-white/50">
                              {adminLocalText(
                                adminLanguage,
                                "Добави контакт без резервация. Ако телефонът или имейлът вече съществува, профилът ще се обнови.",
                                "Add a contact without a reservation. Existing phone or email will update the profile.",
                                "Добавьте контакт без резервации. Если телефон или email уже существует, профиль обновится."
                              )}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setManualCustomerForm(emptyManualCustomer);
                              setShowManualCustomerForm(false);
                            }}
                            className="ghost-button rounded-full px-4 py-2 text-sm font-semibold"
                          >
                            {adminLocalText(adminLanguage, "Откажи", "Cancel", "Отмена")}
                          </button>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <label className="block text-sm text-white/60 xl:col-span-2">
                            {adminLocalText(adminLanguage, "Име", "Name", "Имя")}
                            <input
                              value={manualCustomerForm.guestName}
                              onChange={(event) => setManualCustomerForm((prev) => ({ ...prev, guestName: event.target.value }))}
                              required
                              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none focus:border-[#f2d39a]/50"
                            />
                          </label>
                          <label className="block text-sm text-white/60">
                            {adminLocalText(adminLanguage, "Телефон", "Phone", "Телефон")}
                            <input
                              value={manualCustomerForm.phone}
                              onChange={(event) => setManualCustomerForm((prev) => ({ ...prev, phone: event.target.value }))}
                              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none focus:border-[#f2d39a]/50"
                            />
                          </label>
                          <label className="block text-sm text-white/60">
                            Email
                            <input
                              type="email"
                              value={manualCustomerForm.email}
                              onChange={(event) => setManualCustomerForm((prev) => ({ ...prev, email: event.target.value }))}
                              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none focus:border-[#f2d39a]/50"
                            />
                          </label>
                          <label className="block text-sm text-white/60">
                            {adminLocalText(adminLanguage, "Рожден ден", "Birthday", "День рождения")}
                            <input
                              type="date"
                              value={manualCustomerForm.birthDate}
                              onChange={(event) => setManualCustomerForm((prev) => ({ ...prev, birthDate: event.target.value }))}
                              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none focus:border-[#f2d39a]/50"
                            />
                          </label>
                          <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/70 xl:col-span-2">
                            <input
                              type="checkbox"
                              checked={manualCustomerForm.marketingConsent}
                              onChange={(event) => setManualCustomerForm((prev) => ({ ...prev, marketingConsent: event.target.checked }))}
                            />
                            {adminLocalText(adminLanguage, "Съгласие за маркетинг имейли", "Marketing email consent", "Согласие на маркетинговые email")}
                          </label>
                          <button type="submit" className="luxury-button rounded-2xl px-5 py-3 text-sm font-semibold xl:col-span-1">
                            {adminLocalText(adminLanguage, "Запази клиент", "Save customer", "Сохранить клиента")}
                          </button>
                        </div>
                      </form>
                    )}

                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-3xl border border-[#c9a56a]/18 bg-[#c9a56a]/10 p-5">
                        <div className="text-xs uppercase tracking-[0.22em] text-[#f2d39a]/70">
                          {adminLocalText(adminLanguage, "Клиенти", "Customers", "Клиенты")}
                        </div>
                        <div className="mt-2 text-3xl font-semibold text-[#fff4df]">{visibleCustomersForPeriod.length}</div>
                      </div>
                      <div className="rounded-3xl border border-emerald-300/18 bg-emerald-400/10 p-5">
                        <div className="text-xs uppercase tracking-[0.22em] text-emerald-100/70">
                          {adminLocalText(adminLanguage, "Нови клиенти", "New customers", "Новые клиенты")}
                        </div>
                        <div className="mt-2 text-3xl font-semibold text-emerald-100">{visibleNewCustomersCount}</div>
                      </div>
                      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                        <div className="text-xs uppercase tracking-[0.22em] text-stone-500">
                          {adminLocalText(adminLanguage, "Посещения", "Visits", "Посещения")}
                        </div>
                        <div className="mt-2 text-3xl font-semibold text-[#fff4df]">{totalCustomerVisits}</div>
                      </div>
                    </div>

                    <div className="grid gap-3 xl:grid-cols-2">
                      <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
                        <div className="mb-3 text-xs uppercase tracking-[0.22em] text-stone-500">
                          {adminLocalText(adminLanguage, "Период", "Period", "Период")}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {[
                            ["today", adminLocalText(adminLanguage, "Днес", "Today", "Сегодня")],
                            ["week", adminLocalText(adminLanguage, "Седмица", "Week", "Неделя")],
                            ["month", adminLocalText(adminLanguage, "Месец", "Month", "Месяц")],
                            ["all", adminLocalText(adminLanguage, "Цялото време", "All time", "Всё время")],
                          ].map(([key, label]) => (
                            <button
                              key={key}
                              type="button"
                              onClick={() => setCustomerPeriod(key)}
                              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                                customerPeriod === key ? "luxury-button" : "ghost-button text-white/75"
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
                        <div className="mb-3 text-xs uppercase tracking-[0.22em] text-stone-500">
                          {adminLocalText(adminLanguage, "Сортиране", "Sort", "Сортировка")}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {[
                            ["visits", adminLocalText(adminLanguage, "Най-чести", "Top visits", "Чаще всего")],
                            ["new", adminLocalText(adminLanguage, "Най-нови", "Newest", "Новые")],
                            ["recent", adminLocalText(adminLanguage, "Последно дошли", "Recent", "Недавние")],
                            ["name", adminLocalText(adminLanguage, "Име", "Name", "Имя")],
                          ].map(([key, label]) => (
                            <button
                              key={key}
                              type="button"
                              onClick={() => setCustomerSort(key)}
                              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                                customerSort === key ? "border border-[#f2d39a]/35 bg-[#c9a56a]/18 text-[#f2d39a]" : "border border-white/10 bg-white/[0.03] text-white/65"
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {sortedCustomers.length === 0 && (
                      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-stone-400">
                        {adminLocalText(adminLanguage, "Няма клиенти за избрания период.", "No customers for the selected period.", "Нет клиентов за выбранный период.")}
                      </div>
                    )}

                    {sortedCustomers.map((c, index) => {
                      const expanded = expandedCustomerKey === c.key;
                      const visitsLabel = adminLocalText(adminLanguage, "посещения", "visits", "посещений");
                      const customerReservationsToShow = c.periodReservations?.length ? c.periodReservations : c.reservations;

                      return (
                        <div key={c.key} className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 md:p-5">
                          <button
                            type="button"
                            onClick={() => setExpandedCustomerKey(expanded ? null : c.key)}
                            className="flex w-full items-center justify-between gap-4 text-left"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#c9a56a]/25 bg-[#c9a56a]/12 text-sm font-bold text-[#f2d39a]">
                                #{index + 1}
                              </div>
                              <div className="min-w-0">
                                <div className="truncate text-lg font-semibold text-[#fff4df]">{c.guestName}</div>
                                <div className="mt-1 text-sm text-stone-400">
                                  {c.count === 0
                                    ? adminLocalText(adminLanguage, "ръчен контакт", "manual contact", "ручной контакт")
                                    : `${c.periodCount} ${visitsLabel}`}
                                  {customerPeriod !== "all" ? ` · ${c.count} ${adminLocalText(adminLanguage, "общо", "total", "всего")}` : ""}
                                </div>
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              {c.isRegularCustomer && (
                                <span className="hidden rounded-full bg-emerald-400/15 px-3 py-1 text-xs text-emerald-300 sm:inline-flex">
                                  {adminLocalText(adminLanguage, "Редовен", "Regular", "Постоянный")}
                                </span>
                              )}
                              {c.isBlacklisted && (
                                <span className="rounded-full bg-red-400/15 px-3 py-1 text-xs text-red-300">
                                  Blacklist
                                </span>
                              )}
                              <span className="ghost-button rounded-full px-3 py-1 text-xs">
                                {expanded
                                  ? adminLocalText(adminLanguage, "Скрий", "Hide", "Скрыть")
                                  : adminLocalText(adminLanguage, "Детайли", "Details", "Детали")}
                              </span>
                            </div>
                          </button>

                          {expanded && (
                            <div className="mt-5 grid gap-4 border-t border-white/10 pt-5 lg:grid-cols-[0.8fr_1.2fr]">
                              <div className="space-y-3 text-sm text-stone-300">
                                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                  <div className="text-xs uppercase tracking-[0.2em] text-stone-500">
                                    {adminLocalText(adminLanguage, "Контакт", "Contact", "Контакт")}
                                  </div>
                                  <div className="mt-3">{c.phone || "—"}</div>
                                  <div className="mt-2">{c.email || "—"}</div>
                                  <div className="mt-2 text-stone-500">
                                    {adminLocalText(adminLanguage, "Последна резервация", "Last reservation", "Последняя резервация")}: {c.lastReservation || "—"}
                                  </div>
                                  <div className="mt-2 text-stone-500">
                                    {adminLocalText(adminLanguage, "Първа резервация", "First reservation", "Первая резервация")}: {c.firstReservation || "—"}
                                  </div>
                                </div>
                                <div className="grid gap-2">
                                  <button
                                    type="button"
                                    onClick={() => addCustomerToBlacklist(c)}
                                    disabled={c.isBlacklisted}
                                    className="w-full rounded-2xl border border-red-300/25 bg-red-500/12 px-4 py-3 text-sm font-semibold text-red-100 disabled:opacity-40"
                                  >
                                    {c.isBlacklisted
                                      ? adminLocalText(adminLanguage, "В blacklist", "Blacklisted", "В blacklist")
                                      : adminLocalText(adminLanguage, "Добави в blacklist", "Add to blacklist", "Добавить в blacklist")}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => deleteCustomerProfile(c)}
                                    className="w-full rounded-2xl border border-red-300/35 bg-red-500/20 px-4 py-3 text-sm font-semibold text-red-50"
                                  >
                                    {adminLocalText(adminLanguage, "Изтрий клиент", "Delete customer", "Удалить клиента")}
                                  </button>
                                </div>
                              </div>

                              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                <div className="text-xs uppercase tracking-[0.2em] text-stone-500">
                                  {adminLocalText(adminLanguage, "Посещения", "Visits", "Посещения")}
                                </div>
                                <div className="mt-3 space-y-2">
                                  {customerReservationsToShow.map((reservation) => {
                                    const reservationOrders = ordersByReservationId.get(Number(reservation.id)) || [];
                                    const firstOrder = reservationOrders[0];

                                    return (
                                      <div key={reservation.id} className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                          <span className="text-[#fff4df]">{reservation.reservedDate} · {reservation.reservedTime}</span>
                                          <span className="ml-2 text-stone-400">{reservation.tableIds.join(", ")}</span>
                                        </div>
                                        {firstOrder && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setExpandedOrderId(firstOrder.id);
                                              setActiveTab("orders");
                                            }}
                                            className="rounded-full border border-[#c9a56a]/25 bg-[#c9a56a]/12 px-3 py-1 text-xs font-semibold text-[#f2d39a] transition hover:bg-[#c9a56a]/20"
                                          >
                                            {adminLocalText(adminLanguage, "Виж поръчката", "View order", "Посмотреть заказ")} · {formatEuroAmount(firstOrder.totalPrice)}
                                          </button>
                                        )}
                                      </div>
                                    );
                                  })}
                                  {customerReservationsToShow.length === 0 && (
                                    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-stone-400">
                                      {adminLocalText(adminLanguage, "Няма заредени посещения.", "No loaded visits.", "Нет загруженных посещений.")}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Panel>
            )}

            {activeTab === "admins" && (
              <Panel
                title={adminLanguage === "bg" ? "Админи и audit" : "Admins and audit"}
                subtitle={adminLanguage === "bg" ? "Управление на достъпа, бърз вход и история на важните промени." : "Access management, quick login, and history of important changes."}
                right={
                  <button
                    type="button"
                    onClick={enableQuickLogin}
                    className="luxury-button rounded-2xl px-5 py-3 text-sm font-semibold"
                  >
                    Face ID / Touch ID
                  </button>
                }
              >
                <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                  <div className="space-y-4">
                    {canClearOperationalData && (
                      <div className="grid gap-3">
                        <div className={`rounded-3xl border p-5 ${
                          isProVersion
                            ? "border-emerald-300/20 bg-emerald-500/10"
                            : "border-[#f2d39a]/25 bg-[#c9a56a]/10"
                        }`}>
                          <div className="section-kicker">
                            {adminLanguage === "bg" ? "Версия на системата" : "System version"}
                          </div>
                          <div className="mt-2 text-2xl font-semibold text-[#fff4df]">
                            {isProVersion ? "Pro" : "Basic"}
                          </div>
                          <p className="mt-3 text-sm leading-6 text-white/60">
                            {isProVersion
                              ? adminLanguage === "bg"
                                ? "Пълният оперативен модул е активен: сервитьори, кухня, поръчки и дигитално меню."
                                : "Full operations are active: waiters, kitchen, orders, and digital menu."
                              : adminLanguage === "bg"
                                ? "Активни са сайтът и резервациите. Поръчки, кухня и сервитьорски роли са заключени."
                                : "Website and reservations are active. Orders, kitchen, and waiter roles are locked."}
                          </p>
                          {!isProVersion && (
                            <button
                              type="button"
                              onClick={unlockProVersion}
                              className="luxury-button mt-4 w-full rounded-2xl px-5 py-3 text-sm font-semibold"
                            >
                              {adminLanguage === "bg" ? "Отключи Pro версия" : "Unlock Pro version"}
                            </button>
                          )}
                          {isProVersion && (
                            <button
                              type="button"
                              onClick={lockBasicVersion}
                              className="mt-4 w-full rounded-2xl border border-[#f2d39a]/30 bg-black/20 px-5 py-3 text-sm font-semibold text-[#f2d39a] transition hover:bg-[#c9a56a]/10"
                            >
                              {adminLanguage === "bg" ? "Върни Basic версия" : "Return to Basic version"}
                            </button>
                          )}
                        </div>

                        <div className="rounded-3xl border border-red-300/20 bg-red-500/10 p-5">
                          <div className="section-kicker text-red-100/80">
                            {adminLanguage === "bg" ? "Developer действие" : "Developer action"}
                          </div>
                          <p className="mt-3 text-sm leading-6 text-red-50/75">
                            {adminLanguage === "bg"
                              ? "Изчиства само резервации и поръчки. Менюто, масите, клиентските настройки и админите остават."
                              : "Clears only reservations and orders. Menu, tables, customer settings, and admins stay intact."}
                          </p>
                          <button
                            type="button"
                            onClick={clearReservationsAndOrders}
                            className="mt-4 w-full rounded-2xl border border-red-300/30 bg-red-500/20 px-5 py-3 text-sm font-semibold text-red-100 transition hover:bg-red-500/30"
                          >
                            {adminLanguage === "bg" ? "Изчисти резервации и поръчки" : "Clear reservations and orders"}
                          </button>
                        </div>
                      </div>
                    )}

                    <form onSubmit={createAdminUser} className="rounded-3xl border border-white/10 bg-black/20 p-5">
                      <div className="section-kicker">{adminLanguage === "bg" ? "Нов админ" : "New admin"}</div>
                      <div className="mt-4 grid gap-3">
                        {[
                          ["name", adminLanguage === "bg" ? "Име" : "Name", "text"],
                          ["email", "Email", "email"],
                          ["password", adminLanguage === "bg" ? "Парола" : "Password", "password"],
                        ].map(([key, label, type]) => (
                          <label key={key} className="block text-sm text-white/60">
                            {label}
                            <input
                              type={type}
                              value={adminUserForm[key]}
                              onChange={(event) => setAdminUserForm((prev) => ({ ...prev, [key]: event.target.value }))}
                              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none focus:border-[#f2d39a]/50"
                            />
                          </label>
                        ))}
                        <label className="block text-sm text-white/60">
                          {adminLanguage === "bg" ? "Роля" : "Role"}
                          <select
                            value={adminUserForm.role}
                            onChange={(event) => setAdminUserForm((prev) => ({ ...prev, role: event.target.value }))}
                            className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none focus:border-[#f2d39a]/50"
                          >
                            {availableAdminRoleOptions.map((role) => (
                              <option key={role.value} value={role.value}>
                                {role.labels[adminLanguage]}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button type="submit" className="luxury-button rounded-2xl px-5 py-3 text-sm font-semibold">
                          {adminLanguage === "bg" ? "Създай админ" : "Create admin"}
                        </button>
                      </div>
                    </form>

                    <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
                      <div className="section-kicker">{adminLanguage === "bg" ? "Админ профили" : "Admin users"}</div>
                      <div className="mt-4 space-y-2">
                        {adminUsers.map((user) => (
                          <div key={getAdminUserId(user)} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                            {editingAdminId === getAdminUserId(user) ? (
                              <div className="grid gap-3">
                                <input
                                  value={adminEditForm.name}
                                  onChange={(event) => setAdminEditForm((prev) => ({ ...prev, name: event.target.value }))}
                                  placeholder={adminLanguage === "bg" ? "Име" : "Name"}
                                  className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none focus:border-[#f2d39a]/50"
                                />
                                <input
                                  type="email"
                                  value={adminEditForm.email}
                                  onChange={(event) => setAdminEditForm((prev) => ({ ...prev, email: event.target.value }))}
                                  placeholder="Email"
                                  className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none focus:border-[#f2d39a]/50"
                                />
                                <input
                                  type="password"
                                  value={adminEditForm.password}
                                  onChange={(event) => setAdminEditForm((prev) => ({ ...prev, password: event.target.value }))}
                                  placeholder={adminLanguage === "bg" ? "Нова парола, ако искаш промяна" : "New password, only if changing"}
                                  className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none focus:border-[#f2d39a]/50"
                                />
                                <p className="-mt-1 text-xs leading-5 text-white/40">
                                  {adminLanguage === "bg"
                                    ? "Сегашната парола не се показва от съображения за сигурност. Въведи тук нова, за да я смениш."
                                    : "The current password is not shown for security. Enter a new one here to replace it."}
                                </p>
                                <select
                                  value={adminEditForm.role}
                                  onChange={(event) => setAdminEditForm((prev) => ({ ...prev, role: event.target.value }))}
                                  className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none focus:border-[#f2d39a]/50"
                                >
                                  {availableAdminRoleOptions.map((role) => (
                                    <option key={role.value} value={role.value}>
                                      {role.labels[adminLanguage]}
                                    </option>
                                  ))}
                                </select>
                                <label className="flex items-center gap-2 text-sm text-white/70">
                                  <input
                                    type="checkbox"
                                    checked={adminEditForm.isActive}
                                    onChange={(event) => setAdminEditForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                                  />
                                  {adminLanguage === "bg" ? "Активен акаунт" : "Active account"}
                                </label>
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => saveAdminUser(getAdminUserId(user))}
                                    className="luxury-button rounded-xl px-4 py-2 text-xs font-semibold"
                                  >
                                    {adminLanguage === "bg" ? "Запази" : "Save"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingAdminId(null)}
                                    className="ghost-button rounded-xl px-4 py-2 text-xs font-semibold"
                                  >
                                    {adminLanguage === "bg" ? "Откажи" : "Cancel"}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="font-semibold text-[#fff4df]">{user.name}</div>
                                <div className="mt-1 text-sm text-white/50">
                                  {user.email} · {getAdminRoleLabel(user.role, adminLanguage)}
                                </div>
                                <div className="mt-1 text-xs text-white/35">
                                  {adminLanguage === "bg" ? "Последен вход" : "Last login"}: {user.lastLoginAtUtc || "—"}
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {canActorManageAdminUser(currentAdminRole, user.role) && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => startEditingAdminUser(user)}
                                        className="ghost-button rounded-xl px-3 py-2 text-xs font-semibold"
                                      >
                                        {adminLanguage === "bg" ? "Редактирай" : "Edit"}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => deleteAdminUser(user)}
                                        className="rounded-xl border border-red-300/25 bg-red-500/15 px-3 py-2 text-xs font-semibold text-red-100"
                                      >
                                        {adminLanguage === "bg" ? "Изтрий" : "Delete"}
                                      </button>
                                    </>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
                    <div className="section-kicker">Audit log</div>
                    <div className="mt-4 max-h-[680px] space-y-2 overflow-auto pr-1">
                      {auditLogs.map((log) => (
                        <div key={log.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-semibold text-[#fff4df]">{log.action} · {log.entity}</span>
                            <span className="text-xs text-white/40">{log.createdAtUtc}</span>
                          </div>
                          <div className="mt-1 text-sm text-white/50">
                            {log.adminName || "System"} · #{log.entityId}
                          </div>
                          {(log.beforeJson || log.afterJson) && (
                            <details className="mt-3 text-xs text-white/45">
                              <summary className="cursor-pointer text-[#f2d39a]">JSON</summary>
                              <pre className="mt-2 max-h-48 overflow-auto rounded-xl bg-black/35 p-3">
                                {log.afterJson || log.beforeJson}
                              </pre>
                            </details>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Panel>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
