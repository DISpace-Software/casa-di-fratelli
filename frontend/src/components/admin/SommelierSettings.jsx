import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL } from '../../config/api';

const profileDefaults = { kind: 'dish', wineId: null, serving: 'bottle', available: false, verified: false, body: 0, acidity: 0, sweetness: 0, fat: 0, heat: 0, umami: 0, notes: '' };
const wineDefaults = { name: '', source: '', style: 'white', body: 0, acidity: 0, sweetness: 0, tannin: 0, alcohol: 0, verified: false };
export default function SommelierSettings({ adminFetch, language }) {
  const bg = language === 'bg';
  const [data, setData] = useState(null), [menu, setMenu] = useState([]), [id, setId] = useState('');
  const [profile, setProfile] = useState(profileDefaults), [wine, setWine] = useState(wineDefaults);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false);
  const request = useCallback(async (path, options) => {
    const response = await adminFetch(`${API_BASE_URL}/api/${path}`, options);
    if (!response.ok) throw new Error(bg ? 'Промяната не е запазена. Проверете връзката и правата си.' : 'Request failed. Check your connection and permissions.');
    return response.json();
  }, [adminFetch, bg]);
  const load = useCallback(async () => {
    setError('');
    try {
      const [config, items] = await Promise.all([request('sommelier/configuration'), request('menu')]);
      setData(config); setMenu(items);
    } catch (e) { setError(e.message); }
  }, [request]);
  useEffect(() => { load(); }, [load]);
  function select(value) { setId(value); setSaved(false); setProfile(data.profiles.find(p => p.menuItemId === Number(value)) || { ...profileDefaults }); }
  async function save(event) {
    event.preventDefault(); setBusy(true); setError(''); setSaved(false);
    try {
      const result = await request(`sommelier/profiles/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...profile, menuItemId: Number(id) }) });
      setData(d => ({ ...d, profiles: [...d.profiles.filter(p => p.menuItemId !== Number(id)), result] })); setSaved(true);
    } catch(e) { setError(e.message); } finally { setBusy(false); }
  }
  async function saveWine(event) {
    event.preventDefault(); setBusy(true); setError('');
    const wineId = wine.id || crypto.randomUUID();
    try {
      const result = await request(`sommelier/wines/${wineId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...wine, id: wineId }) });
      setData(d => ({ ...d, wines: [...d.wines.filter(w => w.id !== wineId), result] })); setWine(wineDefaults);
    } catch(e) { setError(e.message); } finally { setBusy(false); }
  }
  const input = 'w-full rounded-xl border border-white/20 bg-stone-900 p-3';
  const labels = bg ? { body: 'Плътност / интензивност', acidity: 'Киселинност', sweetness: 'Сладост', fat: 'Мазнина', heat: 'Лютивина', umami: 'Умами', tannin: 'Танини', alcohol: 'Алкохол %' } : { body: 'Body / intensity', acidity: 'Acidity', sweetness: 'Sweetness', fat: 'Fat', heat: 'Chilli heat', umami: 'Umami', tannin: 'Tannin', alcohol: 'Alcohol %' };
  const levels = (value, setter, keys) => <div className="grid gap-3 sm:grid-cols-3">{keys.map(key => <label key={key}>{labels[key]}<input className={input} type="number" required min="0" max={key === 'alcohol' ? 25 : 5} step={key === 'alcohol' ? .1 : 1} value={value[key]} onChange={e => setter(v => ({ ...v, [key]: Number(e.target.value) }))} /></label>)}</div>;
  return <details className="mb-6 rounded-2xl border border-purple-300/30 p-5">
    <summary className="cursor-pointer text-lg font-semibold">🍷 {bg ? 'Онлайн сомелиер' : 'Online sommelier'}</summary>
    <p className="my-3 text-stone-400">{bg ? 'Само потвърдени профили и налични вина участват в препоръките. Скала: 0 = липсва, 5 = много високо. Включете соса и начина на приготвяне в профила на ястието.' : 'Only verified profiles and available wines are recommended. Scale: 0 = absent, 5 = very high. Include sauce and preparation in the dish profile.'}</p>
    {error && <p role="alert" className="text-red-300">{error} <button onClick={load} type="button">{bg ? 'Опитай пак' : 'Retry'}</button></p>}
    {!data ? <p>{bg ? 'Зареждане…' : 'Loading…'}</p> : <>
      {!data.platformAvailable && <p role="alert">{bg ? 'Общият каталог не е свързан.' : 'Shared catalogue is not connected.'}</p>}
      <form onSubmit={save} className="space-y-4">
        <label>{bg ? 'Позиция от менюто' : 'Menu item'}<select className={input} value={id} onChange={e => select(e.target.value)} required><option value="">—</option>{menu.map(m => <option key={m.id} value={m.id}>{m.nameBg} · {m.weight} · €{m.price}</option>)}</select></label>
        {id && <>
          <label>{bg ? 'Тип' : 'Type'}<select className={input} value={profile.kind} onChange={e => setProfile(p => ({ ...p, kind: e.target.value, verified: false }))}><option value="dish">{bg ? 'Ястие' : 'Dish'}</option><option value="wine">{bg ? 'Вино' : 'Wine'}</option></select></label>
          {profile.kind === 'wine' ? <>
            <label>{bg ? 'Вино от общия каталог' : 'Wine in shared catalogue'}<select required className={input} value={profile.wineId || ''} onChange={e => setProfile(p => ({ ...p, wineId: e.target.value, verified: false }))}><option value="">—</option>{data.wines.map(w => <option key={w.id} value={w.id}>{w.name}{w.verified ? ' ✓' : ' — draft'}</option>)}</select></label>
            <label>{bg ? 'Сервиране' : 'Serving'}<select className={input} value={profile.serving} onChange={e => setProfile(p => ({ ...p, serving: e.target.value }))}><option value="glass">{bg ? 'Чаша' : 'Glass'}</option><option value="bottle">{bg ? 'Бутилка' : 'Bottle'}</option></select></label>
            <label className="block"><input type="checkbox" checked={profile.available} onChange={e => setProfile(p => ({ ...p, available: e.target.checked }))} /> {bg ? 'Налично в ресторанта' : 'Available in restaurant'}</label>
          </> : levels(profile, setProfile, ['body','acidity','sweetness','fat','heat','umami'])}
          <label className="block">{bg ? 'Бележки за профила / сос / приготвяне' : 'Profile notes / sauce / preparation'}<textarea className={input} maxLength={500} value={profile.notes} onChange={e => setProfile(p => ({ ...p, notes: e.target.value }))} /></label>
          <label className="block"><input type="checkbox" checked={profile.verified} onChange={e => setProfile(p => ({ ...p, verified: e.target.checked }))} /> {bg ? 'Проверих характеристиките и съответствието с менюто' : 'I verified the characteristics and menu mapping'}</label>
          <button className="luxury-button rounded-xl px-5 py-3" disabled={busy}>{bg ? 'Запази профила' : 'Save profile'}</button>
          {saved && <p role="status">{bg ? 'Запазено' : 'Saved'}</p>}
        </>}
      </form>
      {data.canEditCatalogue && <form onSubmit={saveWine} className="mt-6 space-y-4 border-t border-white/10 pt-5">
        <h3>{bg ? 'Общ каталог на вината — всички ресторанти' : 'Shared wine catalogue — all restaurants'}</h3>
        <select aria-label="Edit wine" className={input} value={wine.id || ''} onChange={e => setWine(data.wines.find(w => w.id === e.target.value) || wineDefaults)}><option value="">{bg ? 'Ново вино' : 'New wine'}</option>{data.wines.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
        <label>{bg ? 'Производител, име, реколта' : 'Producer, name, vintage'}<input className={input} required maxLength={200} value={wine.name} onChange={e => setWine(w => ({ ...w, name: e.target.value }))} /></label>
        <label>{bg ? 'Източник / технически лист / дегустация' : 'Source / technical sheet / tasting'}<input className={input} required maxLength={500} value={wine.source} onChange={e => setWine(w => ({ ...w, source: e.target.value }))} /></label>
        <label>{bg ? 'Стил' : 'Style'}<select className={input} value={wine.style} onChange={e => setWine(w => ({ ...w, style: e.target.value }))}>{['white','red','rose','sparkling','dessert'].map((s,i) => <option key={s} value={s}>{bg ? ['Бяло','Червено','Розе','Пенливо','Десертно'][i] : s}</option>)}</select></label>
        {levels(wine, setWine, ['body','acidity','sweetness','tannin','alcohol'])}
        <label className="block"><input type="checkbox" checked={wine.verified} onChange={e => setWine(w => ({ ...w, verified: e.target.checked }))} /> {bg ? 'Характеристиките са проверени' : 'Characteristics verified'}</label>
        <button disabled={busy} className="luxury-button rounded-xl px-5 py-3">{bg ? 'Запази в общия каталог' : 'Save shared wine'}</button>
      </form>}
    </>}
  </details>;
}
