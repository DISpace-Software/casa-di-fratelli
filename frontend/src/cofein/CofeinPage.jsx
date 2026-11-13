import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import useCofeinMotion from './useCofeinMotion';
import { cofeinContact } from './contact.js';
import CofeinBrand from './CofeinBrand.jsx';
// Keep the lightweight dialog shell styled while the form or menu loads.
import './cofein-booking.css';
const CofeinMenu = lazy(() => import('./CofeinMenu.jsx'));
const CofeinBooking = lazy(() => import('./CofeinBooking.jsx'));

const bookingsEnabled = import.meta.env.VITE_COFEIN_BOOKINGS_ENABLED === 'true' && Boolean(import.meta.env.VITE_COFEIN_API_BASE_URL);
const modalFromHash = () => ['#menu', '#booking'].includes(window.location.hash) ? { type: window.location.hash.slice(1) } : null;

const photographs = [
  { id: 'lounge', label: 'Салонът', alt: 'Салонът на Cofein с меки сливови дивани, тъмно дърво и червена светлина' },
  { id: 'terrace', label: 'Терасата', alt: 'Остъклената тераса на Cofein с плетени кресла и зеленина' },
  { id: 'wooden-room', label: 'Уютните кътове', alt: 'Дървени маси и столове със сливови възглавници край прозорците на Cofein' },
  { id: 'bar', label: 'Барът', alt: 'Барът на Cofein с тъмно дърво, картини и приглушена светлина' },
  { id: 'garden', label: 'Зелената алея', alt: 'Зелена алея до терасата на Cofein' },
];
const moments = [
  { label: 'Сутрин', id: 'terrace', photo: 'Терасата' },
  { label: 'Следобед', id: 'wooden-room', photo: 'Уютните кътове' },
  { label: 'Вечер', id: 'lounge', photo: 'Салонът' },
];
const directionsUrl = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent('Cofein, ул. Орфей 24, Пловдив');
const spaces = [
  { ...photographs[0], title: 'В ритъма на вечерта.', detail: 'МЕКА СВЕТЛИНА · СЛИВОВИ ТОНОВЕ', text: 'Меки дивани, приглушена светлина и усещането, че вечерта тепърва започва.' },
  { ...photographs[1], title: 'Светлина и зеленина.', detail: 'ЕСТЕСТВЕНА СВЕТЛИНА · ОТВОРЕН ПОГЛЕД', text: 'Място за първото кафе и за разговорите, които продължават още малко.' },
  { ...photographs[2], title: 'Още един разговор.', detail: 'ТОПЛО ДЪРВО · МЕСТА КРАЙ ПРОЗОРЦИТЕ', text: 'Топлината на дървото и спокойният кът, който избираш отново.' },
];

function Arrow({ direction = 'diagonal', className = '' }) {
  return <svg className={`arrow arrow-${direction} ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function Photo({ id, alt, className = '', eager = false, sizes = '100vw' }) {
  return <img className={className} src={`/cofein/${id}-1280.webp`} srcSet={`/cofein/${id}-640.webp 640w, /cofein/${id}-1280.webp 1280w, /cofein/${id}-1920.webp 1920w`} sizes={sizes} alt={alt} width="1920" height="1440" loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : 'auto'} decoding="async" />;
}
function Wordmark() {
  return <CofeinBrand className="wordmark" />;
}
function SectionLabel({ number, children }) {
  return <p className="section-label"><span>{number}</span>{children}</p>;
}

function DialogLoading({ type }) {
  return <section className="cofein-dialog-loading" style={{ padding: '48px 28px', maxWidth: 640, marginInline: 'auto' }} aria-busy="true">
    <h2 id="dialog-title">{type === 'menu' ? 'Менюто на ' : 'Резервация в '}<CofeinBrand compact /></h2>
    <p id="dialog-description" role="status">{type === 'menu' ? 'Зареждаме менюто…' : 'Зареждаме резервациите…'}</p>
  </section>;
}

class DialogContentBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <section className="cofein-dialog-loading" style={{ padding: '48px 28px', maxWidth: 640, marginInline: 'auto' }}>
      <h2 id="dialog-title">Не успяхме да заредим прозореца.</h2>
      <p id="dialog-description" role="alert">Презаредете страницата и опитайте отново.</p>
      <button type="button" className="cofein-booking-secondary" onClick={() => window.location.reload()}>Презареди страницата</button>
    </section>;
  }
}

function CofeinDialog({ modal, onClose, onPhotoChange, returnFocus, bookingBusy, onBookingBusyChange }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    closeRef.current?.focus();
    return () => {
      dialog.close();
      returnFocus?.focus({ preventScroll: true });
    };
  }, [returnFocus]);
  const photo = modal.type === 'photo' ? photographs[modal.index] : null;
  const closeButton = <button ref={closeRef} type="button" className="close-modal icon-button" aria-label="Затвори прозореца" disabled={modal.type === 'booking' && bookingBusy} onClick={onClose}><span aria-hidden="true">×</span></button>;
  return (
    <dialog ref={dialogRef} className={`modal ${photo ? 'photo-modal' : modal.type === 'menu' ? 'menu-modal' : 'booking-modal'}`} aria-labelledby="dialog-title" aria-describedby={photo ? undefined : 'dialog-description'}
      onCancel={event => { event.preventDefault(); onClose(); }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
      }}
      onKeyDown={event => {
        if (!photo || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        onPhotoChange(event.key === 'ArrowRight' ? 1 : -1);
      }}>
      {modal.type === 'booking' ? <div className="cofein-booking-toolbar"><span className="booking-brand-label"><CofeinBrand compact /><span aria-live="polite" role="status">{bookingBusy ? 'Бронираме…' : 'РЕЗЕРВАЦИИ'}</span></span>{closeButton}</div> : closeButton}
      {photo ? <>
        <div className="modal-image"><Photo key={photo.id} id={photo.id} alt={photo.alt} eager /></div>
        <div className="modal-caption"><div aria-live="polite"><p className="eyebrow"><CofeinBrand compact /> · {String(modal.index + 1).padStart(2, '0')} / 05</p><h2 id="dialog-title">{photo.label}</h2></div><div className="gallery-controls"><button type="button" className="icon-button" aria-label="Предишна снимка" onClick={() => onPhotoChange(-1)}><Arrow direction="left" /></button><button type="button" className="icon-button" aria-label="Следваща снимка" onClick={() => onPhotoChange(1)}><Arrow direction="right" /></button></div></div>
      </> : <DialogContentBoundary key={modal.type}><Suspense fallback={<DialogLoading type={modal.type} />}>
        {modal.type === 'menu' ? <CofeinMenu initialDepartment={modal.department} /> : <CofeinBooking onClose={onClose} onBusyChange={onBookingBusyChange} />}
      </Suspense></DialogContentBoundary>}
    </dialog>
  );
}

export default function CofeinPage() {
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const tabRefs = useRef([]);
  const momentRefs = useRef([]);
  const [activeMoment, setActiveMoment] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeSpace, setActiveSpace] = useState(1);
  const [modal, setModal] = useState(modalFromHash);
  const [bookingBusy, setBookingBusy] = useState(false);
  const bookingBusyRef = useRef(false);
  const onBookingBusyChange = useCallback(value => {
    // Ref gates close/hash events immediately, before React paints disabled UI.
    bookingBusyRef.current = Boolean(value);
    setBookingBusy(Boolean(value));
  }, []);

  const pageLocked = mobileOpen || Boolean(modal);
  useEffect(() => {
    if (!pageLocked) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; };
  }, [pageLocked]);

  useEffect(() => {
    if (!mobileOpen) return;
    const header = rootRef.current?.querySelector('.site-header');
    header?.querySelector('.navigation a, .navigation button')?.focus();
    const keepFocusInNavigation = event => {
      if (event.key !== 'Tab') return;
      const controls = [...header.querySelectorAll('a[href], button:not([disabled])')].filter(node => node.getClientRects().length);
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    const desktop = window.matchMedia('(min-width: 761px)');
    const closeOnDesktop = () => { if (desktop.matches) setMobileOpen(false); };
    header?.addEventListener('keydown', keepFocusInNavigation);
    desktop.addEventListener('change', closeOnDesktop);
    return () => {
      header?.removeEventListener('keydown', keepFocusInNavigation);
      desktop.removeEventListener('change', closeOnDesktop);
    };
  }, [mobileOpen]);
  useCofeinMotion(rootRef);

  useEffect(() => {
    const syncHash = () => {
      if (bookingBusyRef.current) {
        if (window.location.hash !== '#booking') window.history.replaceState(null, '', '#booking');
        return;
      }
      setModal(modalFromHash());
    };
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, []);

  useEffect(() => {
    if (!bookingBusy) return;
    // Ordinary modal closing never prompts. Only leaving/reloading the page
    // while a request is in flight asks the browser to retain the result.
    const protectPendingBooking = event => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protectPendingBooking);
    return () => window.removeEventListener('beforeunload', protectPendingBooking);
  }, [bookingBusy]);

  function closeModal() {
    if (bookingBusyRef.current) return;
    setModal(null);
    if (['#menu', '#booking'].includes(window.location.hash)) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function openModal(value, event) {
    if (bookingBusyRef.current) return;
    const returnFocus = mobileOpen ? menuRef.current : event.currentTarget;
    setMobileOpen(false);
    setModal({ ...value, returnFocus });
    if (['menu', 'booking'].includes(value.type)) window.history.replaceState(null, '', `#${value.type}`);
  }
  function closeNavigation() {
    setMobileOpen(false);
    menuRef.current?.focus();
  }
  function navigate(event) {
    setMobileOpen(false);
    const destination = document.querySelector(event.currentTarget.hash);
    // Preserve native anchor scrolling while moving keyboard focus out of the closed menu.
    requestAnimationFrame(() => destination?.focus({ preventScroll: true }));
  }
  function handleSpaceKeys(event, index) {
    let next;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % spaces.length;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index + spaces.length - 1) % spaces.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = spaces.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    setActiveSpace(next);
    tabRefs.current[next]?.focus();
  }
  function changePhoto(direction) {
    setModal(current => ({ ...current, index: (current.index + direction + photographs.length) % photographs.length }));
  }

  const moment = moments[activeMoment];
  function handleMomentKeys(event, index) {
    const next = event.key === 'ArrowRight' ? (index + 1) % moments.length
      : event.key === 'ArrowLeft' ? (index + moments.length - 1) % moments.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? moments.length - 1 : undefined;
    if (next === undefined) return;
    event.preventDefault();
    setActiveMoment(next);
    momentRefs.current[next]?.focus();
  }

  return (
    <div className="cofein-site" ref={rootRef} id="top" tabIndex={-1}>
      <a className="skip-link" href="#main">Към съдържанието</a>
      <header className={`site-header ${mobileOpen ? 'has-open-menu' : ''}`} onKeyDown={event => { if (event.key === 'Escape' && mobileOpen) closeNavigation(); }}>
        <div className="header-inner">
          <a href="#top" className="brand-link" aria-label="Cofein — начало" onClick={navigate}><Wordmark /></a>
          <nav id="site-navigation" className={`navigation ${mobileOpen ? 'is-open' : ''}`} aria-label="Основна навигация">
            <button type="button" onClick={event => openModal({ type: 'menu' }, event)}>Меню</button>
            <a href="#spaces" onClick={navigate}>Пространства</a>
            <a href="#gallery" onClick={navigate}>Галерия</a>
            <a href="#visit" onClick={navigate}>Контакти</a>
            <p className="mobile-nav-note">Пловдив · ул. „Орфей“ 24<br />Всеки ден, 07:30 — 23:00</p>
          </nav>
          <button className="header-book" type="button" onClick={event => openModal({ type: 'booking' }, event)}>Резервация <Arrow /></button>
          <button ref={menuRef} className={`menu-toggle ${mobileOpen ? 'is-open' : ''}`} type="button" aria-label={mobileOpen ? 'Затвори навигацията' : 'Отвори навигацията'} aria-expanded={mobileOpen} aria-controls="site-navigation" onClick={() => setMobileOpen(current => !current)}><span /><span /></button>
        </div>
      </header>
      {mobileOpen && <button className="nav-backdrop" type="button" aria-label="Затвори навигацията" tabIndex={-1} onClick={closeNavigation} />}

      <main id="main" tabIndex={-1} inert={mobileOpen}>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-inner section-wrap">
            <div className="hero-story">
              <p className="eyebrow hero-kicker">ПЛОВДИВ · ОРФЕЙ 24</p>
              <h1 id="hero-title"><CofeinBrand /></h1>
              <p className="hero-title">Време за вас.<br />Място за разговор.</p>
              <p className="hero-description">От първото кафе до вечерята.<br />С добра храна и любимата компания.</p>
              <div className="hero-actions">
                <button className="button button-gold" type="button" onClick={event => openModal({ type: 'booking' }, event)}>Резервирай маса <Arrow /></button>
                <button className="text-link" type="button" onClick={event => openModal({ type: 'menu' }, event)}>Разгледай менюто <Arrow direction="right" /></button>
              </div>
            </div>
            <div className="hero-visual">
              {moments.map((item, index) => <div key={item.id} id={`moment-panel-${index}`} role="tabpanel" aria-labelledby={`moment-tab-${index}`} hidden={activeMoment !== index} className="hero-frame">
                {activeMoment === index && <Photo id={item.id} alt={photographs.find(photo => photo.id === item.id).alt} className="hero-image" sizes="(max-width: 760px) 100vw, (max-width: 1440px) 52vw, 720px" eager />}
              </div>)}
              <div className="hero-moments">
                <div className="moment-tabs" role="tablist" aria-label="Ритъмът на деня">
                  {moments.map((item, index) => <button key={item.id} ref={node => { momentRefs.current[index] = node; }} id={`moment-tab-${index}`} type="button" role="tab" aria-selected={activeMoment === index} aria-controls={`moment-panel-${index}`} tabIndex={activeMoment === index ? 0 : -1} onClick={() => setActiveMoment(index)} onKeyDown={event => handleMomentKeys(event, index)}>{item.label}</button>)}
                </div>
                <span className="hero-photo-caption" aria-live="polite">{moment.photo}</span>
              </div>
            </div>
          </div>
        </section>

        <div className="visit-strip section-wrap" aria-label="Cofein накратко">
          <a href={directionsUrl} target="_blank" rel="noreferrer"><span>НАШИЯТ АДРЕС</span><strong>Пловдив, ул. „Орфей“ 24</strong><Arrow /></a>
          <div><span>ВСЕКИ ДЕН</span><strong>07:30 — 23:00</strong></div>
          <a href={`tel:${cofeinContact.telephone}`}><span>ЧУЙ СЕ С НАС</span><strong>{cofeinContact.phone}</strong><Arrow /></a>
        </div>

        <section className="character section-wrap" id="atmosphere" tabIndex={-1} aria-labelledby="character-title">
          <div className="character-copy" data-reveal>
            <SectionLabel number="01">НА МАСАТА</SectionLabel>
            <h2 id="character-title">Хубавият ден<br />започва тук.</h2>
          </div>
          <div className="character-detail" data-reveal>
            <p className="body-copy">Кафе на светлата тераса, обяд с приятели или вечеря в уюта на салона. Разгледайте менюто и изберете как да прекарате времето си при нас.</p>
            <div className="menu-preview-links">
              <button type="button" onClick={event => openModal({ type: 'menu', department: 'food' }, event)}><span className="menu-preview-number">01</span><span><strong>От кухнята</strong><small>Салати, основни ястия и още</small></span><Arrow /></button>
              <button type="button" onClick={event => openModal({ type: 'menu', department: 'drinks' }, event)}><span className="menu-preview-number">02</span><span><strong>От бара</strong><small>Кафе, напитки и твоят любим вкус</small></span><Arrow /></button>
            </div>
          </div>
        </section>

        <section className="spaces-section" id="spaces" tabIndex={-1} aria-labelledby="spaces-title">
          <div className="section-wrap">
            <div className="section-heading" data-reveal><SectionLabel number="02">ПРОСТРАНСТВАТА</SectionLabel><div className="heading-row"><h2 id="spaces-title">За всяка компания.<br />За всеки момент.</h2><p className="section-aside">От светлата тераса<br /> до уюта на салона.</p></div></div>
            <div className="spaces-layout" data-reveal>
              <div className="space-tabs" role="tablist" aria-label="Пространства в Cofein">{spaces.map((space, index) => <button key={space.id} ref={node => { tabRefs.current[index] = node; }} id={`tab-${space.id}`} type="button" role="tab" aria-selected={activeSpace === index} aria-controls={`panel-${space.id}`} tabIndex={activeSpace === index ? 0 : -1} className={`space-tab ${activeSpace === index ? 'is-active' : ''}`} onClick={() => setActiveSpace(index)} onKeyDown={event => handleSpaceKeys(event, index)}><span className="tab-number">0{index + 1}</span><span>{space.label}<small>{index === 0 ? 'Приглушена светлина' : index === 1 ? 'Светлина и зеленина' : 'Топлина и спокойствие'}</small></span><Arrow direction="right" /></button>)}</div>
              <div className="space-stage">{spaces.map((space, index) => <div key={space.id} id={`panel-${space.id}`} role="tabpanel" aria-labelledby={`tab-${space.id}`} hidden={activeSpace !== index} tabIndex={0}>
                {activeSpace === index && <><button className={`photo-button space-photo space-photo-${space.id}`} type="button" aria-label={`Разгледай снимка: ${space.label}`} onClick={event => openModal({ type: 'photo', index }, event)}><Photo id={space.id} alt={space.alt} sizes="(max-width: 760px) 100vw, (max-width: 1440px) 70vw, 960px" /><span className="photo-open" aria-hidden="true"><Arrow /></span></button><div className="space-caption"><h3>{space.title}</h3><p>{space.text}</p></div></>}
              </div>)}</div>
            </div>
            <div className="spaces-booking-link"><span>Вече имаш любим кът?</span><button type="button" className="text-link" onClick={event => openModal({ type: 'booking' }, event)}>Избери маса на картата <Arrow /></button></div>
          </div>
        </section>

        <section className="gallery-section section-wrap" id="gallery" tabIndex={-1} aria-labelledby="gallery-title">
          <div className="gallery-heading" data-reveal><div><SectionLabel number="03">АТМОСФЕРАТА</SectionLabel><h2 id="gallery-title">Поглед отвътре.</h2></div><button className="text-link" type="button" onClick={event => openModal({ type: 'photo', index: 0 }, event)}>Всички снимки <span className="photo-count">05</span><Arrow /></button></div>
          <div className="gallery-composition">
            <figure className="gallery-large" data-reveal><button className="photo-button" type="button" aria-label="Отвори снимка: Уютните кътове" onClick={event => openModal({ type: 'photo', index: 2 }, event)}><Photo id="wooden-room" alt={photographs[2].alt} sizes="(max-width: 760px) 100vw, 54vw" /><span className="photo-open" aria-hidden="true"><Arrow /></span></button><figcaption><span>ДЪРВО, СВЕТЛИНА, СПОКОЙСТВИЕ</span><span>01</span></figcaption></figure>
            <figure className="gallery-small" data-reveal><button className="photo-button" type="button" aria-label="Отвори снимка: Барът" onClick={event => openModal({ type: 'photo', index: 3 }, event)}><Photo id="bar" alt={photographs[3].alt} sizes="(max-width: 760px) 100vw, 35vw" /><span className="photo-open" aria-hidden="true"><Arrow /></span></button><figcaption><span>БАРЪТ · ВЕЧЕРНО НАСТРОЕНИЕ</span><span>02</span></figcaption></figure>
          </div>
        </section>

        <section className="booking-section" id="visit" tabIndex={-1} aria-labelledby="booking-title">
          <div className="booking-content section-wrap">
            <div className="booking-invitation" data-reveal><SectionLabel number="04">ВАШЕТО ПОСЕЩЕНИЕ</SectionLabel><h2 id="booking-title">Очакваме ви<br />на вашата маса.</h2><p>Изберете дата, час и място на картата.<br />Останалото оставете на нас.</p><button className="button button-gold" type="button" onClick={event => openModal({ type: 'booking' }, event)}>Резервирай маса <Arrow /></button><span className="booking-status">{bookingsEnabled ? 'Резервация с избор на маса.' : 'За резервация се свържете с нас по телефона.'}</span></div>
            <div className="visit-card" data-reveal>
              <Photo id="garden" alt={photographs[4].alt} sizes="(max-width: 760px) 100vw, 460px" />
              <div className="visit-card-details"><p className="eyebrow">НАШЕТО МЯСТО В ПЛОВДИВ</p><address>ул. „Орфей“ 24</address><p>Всеки ден · 07:30 — 23:00</p><div><a href={directionsUrl} target="_blank" rel="noreferrer" className="text-link">Как да стигнеш <Arrow /></a><a href={`tel:${cofeinContact.telephone}`} className="visit-phone">{cofeinContact.phone}</a></div></div>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer" inert={mobileOpen}><div className="section-wrap"><div className="footer-top"><a className="brand-link" href="#top" aria-label="Cofein — начало" onClick={navigate}><Wordmark /></a><p>Кафе. Кухня. Компания.<br />Всеки ден в Пловдив.</p><a className="back-top" href="#top" onClick={navigate}>Нагоре <Arrow direction="up" /></a></div><div className="footer-bottom"><span>ПЛОВДИВ · ОРФЕЙ 24</span><button type="button" onClick={event => openModal({ type: 'menu' }, event)}>Разгледай менюто <Arrow /></button><span>RESERVATIONS BY <strong>SeatMap</strong></span></div></div></footer>
      {modal && <CofeinDialog modal={modal} onClose={closeModal} onPhotoChange={changePhoto} returnFocus={modal.returnFocus} bookingBusy={bookingBusy} onBookingBusyChange={onBookingBusyChange} />}
    </div>
  );
}
