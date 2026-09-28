import PageShell from '../components/PageShell.jsx';
import desktopHtml from '../fragments/desktop-reports.html?raw';
import mobileHtml from '../fragments/mobile-reports.html?raw';

export default function Reports() {
  return <PageShell desktopHtml={desktopHtml} mobileHtml={mobileHtml} />;
}
