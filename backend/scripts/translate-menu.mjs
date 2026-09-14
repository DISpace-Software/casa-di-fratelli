import fs from "node:fs";

const [, , sourcePath, targetPath] = process.argv;

if (!sourcePath || !targetPath) {
  console.error("Usage: node translate-menu.mjs <source.json> <target.json>");
  process.exit(1);
}

const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const sourceItems = Array.isArray(source.items) ? source.items : [];
const separator = "<<<MENU_SPLIT>>>";

const nameOverrides = new Map([
  ["Биволарска салата", ["Buffalo Cheese Salad", "Салат с буйволиным сыром"]],
  ["Бейби калмари с манго сос", ["Baby Calamari with Mango Sauce", "Бейби-кальмары с соусом манго"]],
  ["Ризото с рибай „Талията“", ["Risotto with Ribeye Tagliata", "Ризотто с рибай тальята"]],
  ["Свински кралски котлет", ["Pork Loin Chop", "Свиной королевский котлет"]],
  ["Свински гърдички", ["Pork Belly", "Свиная грудинка"]],
  ["Домашната плескавица", ["Homemade Pleskavitsa", "Домашняя плескавица"]],
  ["Прошуто фунги", ["Prosciutto Funghi", "Прошутто фунги"]],
  ["Капричоза", ["Capricciosa", "Капричоза"]],
  ["Пеперони специална", ["Pepperoni Special", "Пепперони специальная"]],
  ["Куатро стаджони", ["Quattro Stagioni", "Кватро Стаджони"]],
  ["Куатро формаджи", ["Quattro Formaggi", "Кватро Формаджи"]],
  ["Бурата", ["Burrata", "Буррата"]],
  ["Цял домашен хляб", ["Whole Homemade Bread", "Целый домашний хлеб"]],
  ["Фокача на парче", ["Focaccia Slice", "Кусочек фокаччи"]],
  ["Домашна питка с Филаделфия", ["Homemade Bread Roll with Philadelphia", "Домашняя лепёшка с сыром Филадельфия"]],
  ["Домашна питка на пещ", ["Homemade Oven-Baked Bread Roll", "Домашняя лепёшка из печи"]],
  ["Пърленка с кашкавал", ["Flatbread with Yellow Cheese", "Лепёшка с кашкавалом"]],
  ["Пърленка със сирене", ["Flatbread with White Cheese", "Лепёшка с брынзой"]],
  ["Пърленка с масло", ["Flatbread with Butter", "Лепёшка с маслом"]],
  ["Пърленка с чесново масло", ["Flatbread with Garlic Butter", "Лепёшка с чесночным маслом"]],
  ["Комбинирана пърленка със сирене и кашкавал", ["Flatbread with White and Yellow Cheese", "Лепёшка с брынзой и кашкавалом"]],
  ["Неаполитански „Баба“ десерт", ["Neapolitan Baba Dessert", "Неаполитанский десерт «Баба»"]],
  ["Шоколадов мус от бял и черен шоколад", ["White and Dark Chocolate Mousse", "Мусс из белого и тёмного шоколада"]],
  ["Нес кафе", ["Instant Coffee", "Растворимый кофе"]],
  ["Мляко с нес", ["Milk with Instant Coffee", "Молоко с растворимым кофе"]],
  ["Мед", ["Honey", "Мёд"]],
  ["Айрян малък", ["Small Ayran", "Маленький айран"]],
  ["Айрян голям", ["Large Ayran", "Большой айран"]],
  ["Бъз и джинджифил", ["Elderflower and Ginger", "Бузина и имбирь"]],
  ["Бъз", ["Elderflower", "Бузина"]],
  ["Оранжада", ["Orangeade", "Оранжад"]],
  ["Банкя", ["Bankya", "Банкя"]],
  ["Портокал", ["Orange", "Апельсин"]],
  ["Бланка 1664", ["1664 Blanc", "1664 Блан"]],
  ["Шуменско бомбичка", ["Shumensko Small Bottle", "Шуменско, маленькая бутылка"]],
  ["Корона", ["Corona", "Корона"]],
  ["Самърсби", ["Somersby", "Сомерсби"]],
  ["Перно", ["Pernod", "Перно"]],
  ["Пещерска гроздова", ["Peshterska Grape Rakia", "Пещерска виноградная ракия"]],
  ["Пещерска гроздова отлежала", ["Peshterska Aged Grape Rakia", "Пещерска выдержанная виноградная ракия"]],
  ["Троянска сливова", ["Troyanska Plum Rakia", "Троянска сливовая ракия"]],
  ["Троянска сливова 7 г.", ["Troyanska Plum Rakia, 7 Years", "Троянска сливовая ракия, 7 лет"]],
  ["Сливенска перла", ["Slivenska Perla Rakia", "Ракия Сливенска Перла"]],
  ["Бургаска мускатова", ["Burgaska Muscat Rakia", "Бургаска мускатная ракия"]],
  ["Поморийска мускатова", ["Pomoriyska Muscat Rakia", "Поморийска мускатная ракия"]],
  ["Кортен отлежала мускат", ["Korten Aged Muscat Rakia", "Кортен выдержанная мускатная ракия"]],
  ["Стралджанска мускат отлежала", ["Straldzhanska Aged Muscat Rakia", "Стралджанска выдержанная мускатная ракия"]],
  ["Стралджанска мускат барел", ["Straldzhanska Muscat Barrel Rakia", "Стралджанска мускатная ракия Barrel"]],
  ["Бургас 63 барел", ["Burgas 63 Barrel", "Бургас 63 Barrel"]],
  ["Бранко Юлева сръбска", ["Branko Yuleva Serbian Rakia", "Сербская ракия Бранко Юлева"]],
  ["Аперо шприц", ["Apero Spritz", "Аперо Шприц"]],
]);

const descriptionOverrides = new Map([
  ["Бурата, микс чери домати, кедрови ядки, валериана, песто и домашна фокача", ["Burrata, mixed cherry tomatoes, pine nuts, lamb's lettuce, pesto and homemade focaccia", "Буррата, микс помидоров черри, кедровые орехи, корн-салат, песто и домашняя фокачча"]],
  ["С пържени картофки и млечен сос", ["With French fries and yogurt sauce", "С картофелем фри и йогуртовым соусом"]],
  ["С копър и млечен мус от катък и цвекло", ["With dill and a yogurt-cheese mousse with beetroot", "С укропом и муссом из катыка со свёклой"]],
  ["С домашно масло, манатарки, пушена скаморца и жу", ["With homemade butter, porcini mushrooms, smoked scamorza and jus", "С домашним маслом, белыми грибами, копчёной скаморцей и соусом жу"]],
  ["Ориз арборио, кладница, манатарка и пармезан", ["Arborio rice, oyster mushrooms, porcini and parmesan", "Рис арборио, вешенки, белые грибы и пармезан"]],
  ["С опушен катък, домашна лютеница и фокача", ["With smoked katak, homemade lutenitsa and focaccia", "С копчёным катыком, домашней лютеницей и фокаччей"]],
  ["Печени картофи, гриловани сезонни зеленчуци и тиро", ["Roasted potatoes, grilled seasonal vegetables and tirokafteri", "Запечённый картофель, сезонные овощи гриль и тирокафтери"]],
  ["Пилешки пържолки, свински гърдички, телешки кюфтенца, свински врат, чеснови бейби картофки и задушени гъби", ["Chicken steaks, pork belly, beef meatballs, pork neck, garlic baby potatoes and sautéed mushrooms", "Куриные стейки, свиная грудинка, говяжьи тефтели, свиная шея, молодой картофель с чесноком и жареные грибы"]],
  ["Бор Филаделфия, доматен сос, моцарела, пеперони и панчета", ["Philadelphia-stuffed crust, tomato sauce, mozzarella, pepperoni and pancetta", "Борт с сыром Филадельфия, томатный соус, моцарелла, пепперони и панчетта"]],
]);

const cleanItems = sourceItems.map((item) => ({
  category: item.category,
  name_bg: String(item.name_bg || "").trim(),
  name_en: "",
  name_ru: "",
  price_eur: Number(item.price_eur),
  quantity: String(item.quantity || "").trim(),
  description_bg: item.name_bg === "Цял домашен хляб" ? "" : String(item.description_bg || "").trim(),
  description_en: "",
  description_ru: "",
}));

const texts = [...new Set(cleanItems.flatMap((item) => [item.name_bg, item.description_bg]).filter(Boolean))];

async function translateBatch(batch, language) {
  const body = new URLSearchParams({
    client: "gtx",
    sl: "bg",
    tl: language,
    dt: "t",
    q: batch.join(`\n${separator}\n`),
  });
  const response = await fetch("https://translate.googleapis.com/translate_a/single", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body,
  });
  if (!response.ok) throw new Error(`Translation request failed: ${response.status}`);

  const payload = await response.json();
  const translated = (payload[0] || []).map((part) => part[0] || "").join("");
  const parts = translated.split(separator).map((part) => part.trim());
  if (parts.length !== batch.length) {
    throw new Error(`Translation batch size mismatch: expected ${batch.length}, received ${parts.length}`);
  }
  return parts;
}

async function translateAll(language) {
  const translated = new Map();
  const batchSize = 12;
  for (let index = 0; index < texts.length; index += batchSize) {
    const batch = texts.slice(index, index + batchSize);
    const values = await translateBatch(batch, language);
    batch.forEach((text, batchIndex) => translated.set(text, values[batchIndex]));
  }
  return translated;
}

const [english, russian] = await Promise.all([translateAll("en"), translateAll("ru")]);

for (const item of cleanItems) {
  item.name_en = english.get(item.name_bg) || item.name_bg;
  item.name_ru = russian.get(item.name_bg) || item.name_bg;
  item.description_en = english.get(item.description_bg) || "";
  item.description_ru = russian.get(item.description_bg) || "";

  const mostlyLatinName = !/[А-Яа-яЁё]/.test(item.name_bg);
  if (mostlyLatinName) {
    item.name_en = item.name_bg;
    item.name_ru = item.name_bg;
  }

  const nameOverride = nameOverrides.get(item.name_bg);
  if (nameOverride) [item.name_en, item.name_ru] = nameOverride;

  const descriptionOverride = descriptionOverrides.get(item.description_bg);
  if (descriptionOverride) [item.description_en, item.description_ru] = descriptionOverride;
}

fs.writeFileSync(targetPath, `${JSON.stringify({
  restaurant: source.restaurant,
  currency: source.currency,
  items: cleanItems,
}, null, 2)}\n`);

console.log(`Translated ${cleanItems.length} menu items into ${targetPath}`);
