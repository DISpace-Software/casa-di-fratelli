import 'language_state.dart';

String menuCategoryLabel(String slug) {
  const names = <String, List<String>>{
    'salads': ['Salads', 'Салати', 'Салаты'],
    'starters': ['Starters', 'Предястия', 'Закуски'],
    'mains': ['Mains', 'Основни', 'Основные блюда'],
    'desserts': ['Desserts', 'Десерти', 'Десерты'],
    'pizza': ['Pizza', 'Пица', 'Пицца'],
    'pizzas': ['Pizza', 'Пици', 'Пицца'],
    'pasta-risotto': ['Pasta & risotto', 'Паста и ризото', 'Паста и ризотто'],
    'spaghetti': ['Pasta', 'Спагети', 'Паста'],
    'bbq': ['BBQ', 'Барбекю', 'Барбекю'],
    'grill': ['Grill', 'Скара', 'Гриль'],
    'bread': ['Bread', 'Хляб', 'Хлеб'],
    'breakfast': ['Breakfast', 'Закуски', 'Завтраки'],
    'bruschetta': ['Bruschetta', 'Брускети', 'Брускетты'],
    'burgers': ['Burgers', 'Бургери', 'Бургеры'],
    'club-sandwiches': ['Sandwiches', 'Сандвичи', 'Сэндвичи'],
    'flatbreads': ['Flatbreads', 'Пърленки', 'Лепёшки'],
    'mixed-platters': ['Sharing platters', 'Плата', 'Ассорти'],
    'savory-pancakes': [
      'Savory pancakes',
      'Солени палачинки',
      'Несладкие блинчики',
    ],
    'spreads': ['Spreads', 'Разядки', 'Намазки'],
    'hot-drinks': ['Coffee & tea', 'Кафе и чай', 'Кофе и чай'],
    'cold-drinks': ['Cold drinks', 'Студени напитки', 'Холодные напитки'],
    'soft-drinks': ['Soft drinks', 'Безалкохолни', 'Безалкогольные'],
    'water': ['Water', 'Вода', 'Вода'],
    'fresh-juice': ['Fresh juices', 'Фрешове', 'Свежие соки'],
    'fresh-bar': ['Fresh bar', 'Фреш бар', 'Фреш-бар'],
    'lemonades': ['Lemonades', 'Лимонади', 'Лимонады'],
    'cocktails': ['Cocktails', 'Коктейли', 'Коктейли'],
    'mocktails': [
      'Mocktails',
      'Безалкохолни коктейли',
      'Безалкогольные коктейли',
    ],
    'energy-drinks': [
      'Energy drinks',
      'Енергийни напитки',
      'Энергетические напитки',
    ],
    'protein-bar': ['Protein bar', 'Протеинов бар', 'Протеиновые напитки'],
    'beer-cider': ['Beer & cider', 'Бира и сайдер', 'Пиво и сидр'],
    'bottled-beer-cider': [
      'Beer & cider',
      'Бутилирана бира и сайдер',
      'Пиво и сидр',
    ],
    'draft-beer': ['Draft beer', 'Наливна бира', 'Разливное пиво'],
    'wine-sangria': ['Wine & sangria', 'Вино и сангрия', 'Вино и сангрия'],
    'gin': ['Gin', 'Джин', 'Джин'],
    'vodka': ['Vodka', 'Водка', 'Водка'],
    'rum': ['Rum', 'Ром', 'Ром'],
    'tequila': ['Tequila', 'Текила', 'Текила'],
    'rakia': ['Rakia', 'Ракия', 'Ракия'],
    'whisky': ['Whisky', 'Уиски', 'Виски'],
    'scotch-whisky': ['Scotch whisky', 'Шотландско уиски', 'Шотландский виски'],
    'irish-whisky': ['Irish whisky', 'Ирландско уиски', 'Ирландский виски'],
    'bourbon': ['Bourbon', 'Бърбън', 'Бурбон'],
    'bourbon-tennessee': [
      'Bourbon & Tennessee',
      'Бърбън и Тенеси',
      'Бурбон и Теннесси',
    ],
    'cognac-brandy': ['Cognac & brandy', 'Коняк и бренди', 'Коньяк и бренди'],
    'liqueurs': ['Liqueurs', 'Ликьори', 'Ликёры'],
    'liqueurs-vermouth': [
      'Liqueurs & vermouth',
      'Ликьори и вермут',
      'Ликёры и вермут',
    ],
    'mastika-digestifs': ['Digestifs', 'Мастика и дижестиви', 'Дижестивы'],
    'anise-drinks': ['Anise spirits', 'Анасонови напитки', 'Анисовые напитки'],
    'alcohol': ['Spirits', 'Алкохол', 'Крепкие напитки'],
    'shots': ['Shots', 'Шотове', 'Шоты'],
    'drink-extras': ['Extras', 'Добавки', 'Дополнения'],
  };
  final index = AppLanguage.code == 'bg'
      ? 1
      : AppLanguage.code == 'ru'
      ? 2
      : 0;
  return names[slug.toLowerCase()]?[index] ?? slug.replaceAll('-', ' ');
}
