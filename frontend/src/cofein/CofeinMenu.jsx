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

export default function CofeinMenu({ initialDepartment = 'food' }) {
  const startingDepartment = initialDepartment === 'drinks' ? 'drinks' : 'food';
  const [department, setDepartment] = useState(startingDepartment);
  const [categoryId, setCategoryId] = useState(sections[startingDepartment][0].id);
  const [query, setQuery] = useState('');
  const searchRef = useRef(null);
  const paperRef = useRef(null);
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
    // Keep the new category's first dish visible after browsing a long menu.
    paperRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
  function clearSearch() {
    setQuery('');
    searchRef.current?.focus();
  }

  return <div className="cofein-menu">
    <header className="menu-intro">
      <p className="eyebrow">COFEIN · МЕНЮ</p>
      <h2 id="dialog-title">Вкусът на <span>твоя ден.</span></h2>
      <p id="dialog-description">От първото кафе до вечерята с приятели.</p>
      <div className="menu-tools">
        <div className="menu-departments" role="group" aria-label="Раздел на менюто">
          <button type="button" aria-pressed={department === 'food'} onClick={() => changeDepartment('food')}>Кухня</button>
          <button type="button" aria-pressed={department === 'drinks'} onClick={() => changeDepartment('drinks')}>Бар</button>
        </div>
        <div className="menu-search"><label htmlFor="cofein-menu-search">Търси в {department === 'food' ? 'кухнята' : 'бара'}</label><div className="menu-search-field"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg><input id="cofein-menu-search" ref={searchRef} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Име или съставка…" autoComplete="off" />{query && <button type="button" onClick={clearSearch} aria-label="Изчисти търсенето"><span aria-hidden="true">×</span></button>}</div></div>
      </div>
    </header>
    <div className="menu-paper" ref={paperRef}>
      <aside className="menu-index" aria-label="Категории">
        <p className="eyebrow">КАТЕГОРИИ</p>
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
