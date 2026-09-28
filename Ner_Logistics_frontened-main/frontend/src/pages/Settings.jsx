import PageShell from '../components/PageShell.jsx';
import desktopHtml from '../fragments/desktop-settings.html?raw';
import mobileHtml from '../fragments/mobile-settings.html?raw';

export default function Settings() {
  return <PageShell desktopHtml={desktopHtml} mobileHtml={mobileHtml} />;
}
