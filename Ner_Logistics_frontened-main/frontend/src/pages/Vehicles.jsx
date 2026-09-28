import PageShell from '../components/PageShell.jsx';
import desktopHtml from '../fragments/desktop-vehicles.html?raw';
import mobileHtml from '../fragments/mobile-vehicles.html?raw';

export default function Vehicles() {
  return <PageShell desktopHtml={desktopHtml} mobileHtml={mobileHtml} />;
}
