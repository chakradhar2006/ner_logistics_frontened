import PageShell from '../components/PageShell.jsx';
import desktopHtml from '../fragments/desktop-dashboard.html?raw';
import mobileHtml from '../fragments/mobile-dashboard.html?raw';

export default function Dashboard() {
  return <PageShell desktopHtml={desktopHtml} mobileHtml={mobileHtml} />;
}
