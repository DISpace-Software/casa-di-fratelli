import { useEffect, useRef, useState } from 'react';
import useCofeinMotion from './useCofeinMotion';
import CofeinMenu from './CofeinMenu.jsx';
import CofeinBooking from './CofeinBooking.jsx';

const bookingsEnabled = import.meta.env.VITE_COFEIN_BOOKINGS_ENABLED === 'true' && Boolean(import.meta.env.VITE_COFEIN_API_BASE_URL);
const modalFromHash = () => ['#menu', '#booking'].includes(window.location.hash) ? { type: window.location.hash.slice(1) } : null;

const photographs = [
  { id: 'lounge', label: 'Салонът', alt: 'Салонът на Cofein с меки сливови дивани, тъмно дърво и червена светлина' },
  { id: 'terrace', label: 'Терасата', alt: 'Остъклената тераса на Cofein с плетени кресла и зеленина' },
  { id: 'wooden-room', label: 'Уютните кътове', alt: 'Дървени маси и столове със сливови възглавници край прозорците на Cofein' },
  { id: 'bar', label: 'Барът', alt: 'Барът на Cofein с тъмно дърво, картини и приглушена светлина' },
  { id: 'garden', label: 'Зелената алея', alt: 'Зелена алея до терасата на Cofein' },
];
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
  return <span className="wordmark">COFEIN<span>COFFEE BAR & DINER</span></span>;
}
function SectionLabel({ number, children }) {
  return <p className="section-label"><span>{number}</span>{children}</p>;
}

function CofeinDialog({ modal, onClose, onPhotoChange, returnFocus }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      returnFocus?.focus({ preventScroll: true });
    };
  }, [returnFocus]);
  const photo = modal.type === 'photo' ? photographs[modal.index] : null;
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
      <button ref={closeRef} type="button" className="close-modal icon-button" aria-label="Затвори прозореца" onClick={onClose}><span aria-hidden="true">×</span></button>
      {photo ? <>
        <div className="modal-image"><Photo key={photo.id} id={photo.id} alt={photo.alt} eager /></div>
        <div className="modal-caption"><div aria-live="polite"><p className="eyebrow">COFEIN · {String(modal.index + 1).padStart(2, '0')} / 05</p><h2 id="dialog-title">{photo.label}</h2></div><div className="gallery-controls"><button type="button" className="icon-button" aria-label="Предишна снимка" onClick={() => onPhotoChange(-1)}><Arrow direction="left" /></button><button type="button" className="icon-button" aria-label="Следваща снимка" onClick={() => onPhotoChange(1)}><Arrow direction="right" /></button></div></div>
      </> : modal.type === 'menu' ? <CofeinMenu /> : <CofeinBooking onClose={onClose} />}
    </dialog>
  );
}

export default function CofeinPage() {
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const tabRefs = useRef([]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeSpace, setActiveSpace] = useState(1);
  const [modal, setModal] = useState(modalFromHash);
  useCofeinMotion(rootRef);

  useEffect(() => {
    const syncHash = () => {
      setModal(modalFromHash());
    };
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, []);

  function closeModal() {
    setModal(null);
    if (['#menu', '#booking'].includes(window.location.hash)) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function openModal(value, event) {
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

  return (
    <div className="cofein-site" ref={rootRef} id="top" tabIndex={-1}>
      <a className="skip-link" href="#main">Към съдържанието</a>
      <header className={`site-header ${mobileOpen ? 'has-open-menu' : ''}`} onKeyDown={event => { if (event.key === 'Escape' && mobileOpen) closeNavigation(); }}>
        <div className="header-inner">
          <a href="#top" className="brand-link" aria-label="Cofein — начало" onClick={navigate}><Wordmark /></a>
          <nav id="site-navigation" className={`navigation ${mobileOpen ? 'is-open' : ''}`} aria-label="Основна навигация">
            <a href="#atmosphere" onClick={navigate}>Атмосфера</a><a href="#spaces" onClick={navigate}>Пространства</a><a href="#gallery" onClick={navigate}>Галерия</a>
            <button type="button" onClick={event => openModal({ type: 'menu' }, event)}>Меню</button>
            <p className="mobile-nav-note">Твоето място. От деня до вечерта.</p>
          </nav>
          <button className="header-book" type="button" onClick={event => openModal({ type: 'booking' }, event)}><span>Резервация{!bookingsEnabled && <small>ПРЕДСТОИ</small>}</span><Arrow /></button>
          <button ref={menuRef} className={`menu-toggle ${mobileOpen ? 'is-open' : ''}`} type="button" aria-label={mobileOpen ? 'Затвори навигацията' : 'Отвори навигацията'} aria-expanded={mobileOpen} aria-controls="site-navigation" onClick={() => setMobileOpen(current => !current)}><span /><span /></button>
        </div>
      </header>
      {mobileOpen && <button className="nav-backdrop" type="button" aria-label="Затвори навигацията" tabIndex={-1} onClick={closeNavigation} />}

      <main id="main" tabIndex={-1}>
        <section className="hero" aria-labelledby="hero-title" data-hero-visual>
          <Photo id="lounge" alt={photographs[0].alt} className="hero-image" sizes="(max-width: 760px) 1200px, 100vw" eager />
          <div className="hero-shade" />
          <div className="hero-inner section-wrap">
            <div className="hero-story"><p className="eyebrow hero-kicker"><span />ДОБРЕ ДОШЪЛ В COFEIN</p><h1 id="hero-title">Твоето място.<br /><span>От деня<br className="hero-break" /> до вечерта.</span></h1><p className="hero-description">За първото кафе. За дългия разговор.<br />За вечерите, които остават.</p><div className="hero-actions"><a className="button button-gold" href="#spaces" onClick={navigate}>Открий пространствата <Arrow /></a><a className="text-link" href="#atmosphere" onClick={navigate}>За атмосферата <Arrow direction="down" /></a></div></div>
            <div className="hero-bottom"><a className="scroll-cue" href="#atmosphere" onClick={navigate}><span className="scroll-line" aria-hidden="true" />ОСТАНИ ЗА ОЩЕ</a><span className="hero-location">01 <span /> САЛОНЪТ</span></div>
          </div>
        </section>

        <section className="character section-wrap" id="atmosphere" tabIndex={-1} aria-labelledby="character-title">
          <div className="character-copy" data-reveal><SectionLabel number="01">АТМОСФЕРАТА</SectionLabel><h2 id="character-title">Място<br /> с <span className="text-warm">характер.</span></h2><p className="body-copy">Тъмно дърво. Меки дивани. Светлината, която променя ритъма на вечерта.</p><p className="body-copy secondary-copy">И онзи уютен кът, в който един разговор естествено води до следващия.</p><a className="text-link" href="#gallery" onClick={navigate}>Cofein отблизо <Arrow /></a></div>
          <figure className="character-figure" data-reveal><button className="photo-button character-photo" type="button" aria-label="Отвори снимка: Барът" onClick={event => openModal({ type: 'photo', index: 3 }, event)}><Photo id="bar" alt={photographs[3].alt} sizes="(max-width: 760px) 100vw, 58vw" /><span className="photo-open" aria-hidden="true"><Arrow /></span></button><figcaption><span>БАРЪТ</span><span>МАЛКО ПОВЕЧЕ COFEIN.</span></figcaption></figure>
        </section>

        <section className="spaces-section section-wrap" id="spaces" tabIndex={-1} aria-labelledby="spaces-title">
          <div className="section-heading" data-reveal><SectionLabel number="02">ПРОСТРАНСТВАТА</SectionLabel><div className="heading-row"><h2 id="spaces-title">Различен ритъм.<br /><span className="text-warm">Същият Cofein.</span></h2><p className="section-aside">Намери своя кът.<br /> Остани за още малко.</p></div></div>
          <div className="space-tabs" role="tablist" aria-label="Пространства в Cofein" data-reveal>{spaces.map((space, index) => <button key={space.id} ref={node => { tabRefs.current[index] = node; }} id={`tab-${space.id}`} type="button" role="tab" aria-selected={activeSpace === index} aria-controls={`panel-${space.id}`} tabIndex={activeSpace === index ? 0 : -1} className={`space-tab ${activeSpace === index ? 'is-active' : ''}`} onClick={() => setActiveSpace(index)} onKeyDown={event => handleSpaceKeys(event, index)}><span className="tab-number">0{index + 1}</span><span>{space.label}</span><Arrow /></button>)}</div>
          <div className="space-stage" data-reveal>{spaces.map((space, index) => <div key={space.id} id={`panel-${space.id}`} role="tabpanel" aria-labelledby={`tab-${space.id}`} hidden={activeSpace !== index} tabIndex={0}><button className={`photo-button space-photo space-photo-${space.id}`} type="button" aria-label={`Разгледай снимка: ${space.label}`} onClick={event => openModal({ type: 'photo', index }, event)}><Photo id={space.id} alt={space.alt} sizes="(min-width: 1440px) 1280px, 94vw" /><span className="space-photo-label" aria-hidden="true">{space.label}</span><span className="photo-open" aria-hidden="true"><Arrow /></span></button><div className="space-caption"><div><p className="eyebrow">{space.detail}</p><h3>{space.title}</h3></div><p>{space.text}</p><span className="space-counter" aria-hidden="true">0{index + 1}<span> / 03</span></span></div></div>)}</div>
        </section>

        <section className="gallery-section" id="gallery" tabIndex={-1} aria-labelledby="gallery-title"><div className="section-wrap"><div className="gallery-heading" data-reveal><div><SectionLabel number="03">ПОГЛЕД ОТБЛИЗО</SectionLabel><h2 id="gallery-title">В детайлите<br />е усещането.</h2></div><button className="text-link" type="button" onClick={event => openModal({ type: 'photo', index: 0 }, event)}>Всички снимки <span className="photo-count">05</span><Arrow /></button></div><div className="gallery-composition"><figure className="gallery-large" data-reveal><button className="photo-button" type="button" aria-label="Отвори снимка: Уютните кътове" onClick={event => openModal({ type: 'photo', index: 2 }, event)}><Photo id="wooden-room" alt={photographs[2].alt} sizes="(max-width: 760px) 94vw, 58vw" /><span className="photo-open" aria-hidden="true"><Arrow /></span></button><figcaption><span>ТОПЛИНАТА НА ДЪРВОТО</span><span>01 / 02</span></figcaption></figure><figure className="gallery-small" data-reveal><button className="photo-button" type="button" aria-label="Отвори снимка: Светлината на салона" onClick={event => openModal({ type: 'photo', index: 0 }, event)}><Photo id="lounge" alt={photographs[0].alt} sizes="(max-width: 760px) 76vw, 32vw" /><span className="photo-open" aria-hidden="true"><Arrow /></span></button><figcaption><span>СВЕТЛИНАТА НА ВЕЧЕРТА</span><span>02 / 02</span></figcaption><p className="gallery-note">Някои места<br />просто те задържат.</p></figure></div></div></section>

        <section className="booking-section" aria-labelledby="booking-title"><Photo id="garden" alt={photographs[4].alt} className="booking-image" sizes="(max-width: 760px) 900px, 100vw" /><div className="booking-shade" /><div className="booking-content section-wrap" data-reveal><p className="eyebrow">ТВОЯТ СЛЕДВАЩ МОМЕНТ</p><h2 id="booking-title">Следващата среща<br />е тук.</h2><p>Хубавата компания заслужава своето място.</p><button className="button button-gold" type="button" onClick={event => openModal({ type: 'booking' }, event)}>Резервация <Arrow /></button><span className="booking-status"><span />{bookingsEnabled ? 'Избери своята маса онлайн' : 'Онлайн резервациите предстоят'}</span></div></section>
      </main>

      <footer className="site-footer section-wrap"><div className="footer-top"><a className="brand-link" href="#top" aria-label="Cofein — начало" onClick={navigate}><Wordmark /></a><p>Твоето място.<br />От деня до вечерта.</p><a className="back-top" href="#top" onClick={navigate}>Нагоре <Arrow direction="up" /></a></div><div className="footer-contacts" aria-label="Контакти"><div><span className="eyebrow">НАМЕРИ НИ</span><address>ул. „Орфей“ 24<br />Пловдив</address></div><div><span className="eyebrow">ОБАДИ СЕ</span><a href="tel:+359893300305">089 330 0305</a></div><div><span className="eyebrow">ОЧАКВАМЕ ТЕ</span><p>Всеки ден<br />07:30 — 23:00</p></div></div><div className="footer-bottom"><span>COFEIN · ПЛОВДИВ</span><button type="button" onClick={event => openModal({ type: 'menu' }, event)}>Разгледай менюто <Arrow /></button><span>RESERVATIONS BY <strong>SeatMap</strong></span></div></footer>
      {modal && <CofeinDialog modal={modal} onClose={closeModal} onPhotoChange={changePhoto} returnFocus={modal.returnFocus} />}
    </div>
  );
}
