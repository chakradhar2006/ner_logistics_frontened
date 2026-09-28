import PageShell from '../components/PageShell.jsx';
import desktopHtml from '../fragments/desktop-deliveries.html?raw';
import mobileHtml from '../fragments/mobile-deliveries.html?raw';

export default function Deliveries() {
  return <PageShell desktopHtml={desktopHtml} mobileHtml={mobileHtml} />;
}
