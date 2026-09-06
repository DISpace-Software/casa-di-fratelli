import { useTenantBranding } from "../context/TenantBrandingContext";
import Header from "../components/layout/Header";
import HeroSection from "../components/home/HeroSection";
import Footer from "../components/layout/Footer";
import AboutSection from "../components/home/AboutSection";
import MenuSection from "../components/home/MenuSection";
import GallerySection from "../components/home/GallerySection";
import ReservationPreviewSection from "../components/home/ReservationPreviewSection";
import ReviewsSection from "../components/home/ReviewsSection";
import AwardsSection from "../components/home/AwardsSection";
import EventsSection from "../components/home/EventsSection";
import ContactSection from "../components/home/ContactSection";
import DeliverySection from "../components/home/DeliverySection";

export default function HomePage({
  t,
  language,
  setLanguage,
  onOpenReservation,
  onOpenMenu,
  onOpenSection,
  onOpenPrivacy,
  cmsMenuItems,
  cmsEvents,
  theme,
  onToggleTheme,
}) {
  const { branding } = useTenantBranding();
  return (
    <div className="luxury-shell min-h-screen overflow-x-hidden text-stone-100">
      <Header
        t={t}
        language={language}
        setLanguage={setLanguage}
        onOpenReservation={onOpenReservation}
        onOpenMenu={onOpenMenu}
        onOpenSection={onOpenSection}
        onGoHome={() => {}}
        theme={theme}
        onToggleTheme={onToggleTheme}
      />

      <HeroSection
        t={t}
        onOpenReservation={onOpenReservation}
        onOpenMenu={onOpenMenu}
        language={language}
      />

      {branding.isCasa && <AboutSection t={t} />}
      <MenuSection
        t={t}
        language={language}
        onOpenMenu={onOpenMenu}
        cmsMenuItems={cmsMenuItems}
      />
      {branding.isCasa && <DeliverySection language={language} />}
      {branding.isCasa && <GallerySection t={t} />}
      {branding.isCasa && <AwardsSection language={language} />}
      <ReservationPreviewSection t={t} onOpenReservation={onOpenReservation} />
      {branding.isCasa && <ReviewsSection language={language} />}
      <EventsSection language={language} events={cmsEvents} />
      <ContactSection t={t} />
      <Footer t={t} onOpenPrivacy={onOpenPrivacy} />
    </div>
  );
}
