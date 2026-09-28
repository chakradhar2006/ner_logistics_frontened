import PageShell from '../components/PageShell.jsx';
import desktopHtml from '../fragments/desktop-alerts.html?raw';
import mobileHtml from '../fragments/mobile-alerts.html?raw';

export default function Alerts() {
  return <PageShell desktopHtml={desktopHtml} mobileHtml={mobileHtml} />;
}
