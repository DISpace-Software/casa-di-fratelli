import { useMemo, useRef, useState } from 'react';
import food from './data/menu-food.json';
import drinks from './data/menu-drinks.json';
import allergens from './data/menu-allergens.json';
import './cofein-menu.css';

const sections = { food, drinks };
const formatPrice = value => value.toLocaleString('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const normalize = value => value.toLocaleLowerCase('bg').normalize('NFKC').trim();
const allergenLabels = new Map(allergens.map(allergen => [allergen.id, allergen.label]));
const describeAllergens = ids => ids.map(id => allergenLabels.has(id) ? `${id} – ${allergenLabels.get(id)}` : String(id)).join('; ');

export default function CofeinMenu() {
  const [department, setDepartment] = useState('food');
  const [categoryId, setCategoryId] = useState(food[0].id);
  const [query, setQuery] = useState('');
  const searchRef = useRef(null);
  const searchTerm = normalize(query);
  const isSearching = searchTerm.length > 0;
  const categories = sections[department];
  const selected = categories.find(category => category.id === categoryId) || categories[0];
  const result = useMemo(() => {
    return searchTerm
      ? categories.map(category => ({ ...category, items: category.items.filter(item => normalize(`${item.name} ${item.description}`).includes(searchTerm)) })).filter(category => category.items.length)
      : [selected];
  }, [searchTerm, categories, selected]);
  const count = result.reduce((total, category) => total + category.items.length, 0);

  function changeDepartment(next) {
    setDepartment(next);
    setCategoryId(sections[next][0].id);
    setQuery('');
  }
  function changeCategory(id) {
    setCategoryId(id);
    setQuery('');
  }
  function clearSearch() {
    setQuery('');
    searchRef.current?.focus();
  }

  return <div className="cofein-menu">
    <header className="menu-intro">
      <p className="eyebrow">COFEIN · COFFEE BAR & DINER</p>
      <h2 id="dialog-title">За всеки <span>вкус.</span></h2>
      <p id="dialog-description">От първото кафе до вечерята с приятели.</p>
      <div className="menu-tools">
        <div className="menu-departments" role="group" aria-label="Раздел на менюто">
          <button type="button" aria-pressed={department === 'food'} onClick={() => changeDepartment('food')}>Кухня <span>01</span></button>
          <button type="button" aria-pressed={department === 'drinks'} onClick={() => changeDepartment('drinks')}>Бар <span>02</span></button>
        </div>
        <label className="menu-search"><span>Търси в {department === 'food' ? 'кухнята' : 'бара'}</span><input ref={searchRef} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Име или съставка…" autoComplete="off" /></label>
      </div>
    </header>
    <div className="menu-paper">
      <aside className="menu-index" aria-label="Категории">
        <p className="eyebrow">ИЗБЕРИ СВОЯ МОМЕНТ</p>
        <div className="menu-category-buttons">{categories.map(category => <button type="button" key={category.id} aria-pressed={!isSearching && selected.id === category.id} onClick={() => changeCategory(category.id)}>{category.label}<span>{String(category.items.length).padStart(2, '0')}</span></button>)}</div>
        <label className="menu-category-select">Категория<select value={isSearching ? '' : selected.id} onChange={event => changeCategory(event.target.value)}>{isSearching && <option value="" disabled>Резултати от търсенето</option>}{categories.map(category => <option key={category.id} value={category.id}>{category.label}</option>)}</select></label>
      </aside>
      <div className="menu-dishes">
        <div className="menu-result-line"><span>{isSearching ? 'РЕЗУЛТАТИ ОТ ТЪРСЕНЕТО' : department === 'food' ? 'ОТ НАШАТА КУХНЯ' : 'ОТ НАШИЯ БАР'}</span><span role="status" aria-live="polite">{count} {count === 1 ? 'предложение' : 'предложения'}</span></div>
        {result.map(category => <section key={category.id} aria-labelledby={`menu-${category.id}`} className="menu-category">
          <h3 id={`menu-${category.id}`}>{category.label}</h3>
          <div className="menu-dish-list">{category.items.map(item => <article key={item.id} className="menu-dish">
            <div className="menu-dish-heading"><h4>{item.name}</h4><div className="menu-price">{item.priceEur !== null ? <strong>{formatPrice(item.priceEur)} <span>€</span></strong> : <strong className="menu-price-pending">Цената се уточнява</strong>}{item.priceBgn !== null && <span>{formatPrice(item.priceBgn)} лв.</span>}</div></div>
            {item.description && <p>{item.description}</p>}
            <div className="menu-dish-meta"><span>{item.portion}</span>{item.allergenIds?.length > 0 && <span title={describeAllergens(item.allergenIds)}><span aria-hidden="true">Алергени: {item.allergenIds.join(', ')}</span><span className="menu-sr-only">Алергени: {describeAllergens(item.allergenIds)}.</span></span>}</div>
          </article>)}</div>
        </section>)}
        {!count && <div className="menu-empty"><h3>Да опитаме друго?</h3><p>Няма предложения с „{query}“ в този раздел.</p><button type="button" className="menu-reset" onClick={clearSearch}>Изчисти търсенето</button></div>}
        <details className="menu-allergens"><summary>Информация за алергените <span aria-hidden="true">+</span></summary><p>Номерата са от печатното меню. Липсата на обозначение не означава липса на алергени. За конкретно ястие или напитка попитай екипа.</p><dl>{allergens.map(allergen => <div key={allergen.id}><dt>{allergen.id}</dt><dd>{allergen.label}</dd></div>)}</dl></details>
      </div>
    </div>
  </div>;
}
