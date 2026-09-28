import PageShell from '../components/PageShell.jsx';
import desktopHtml from '../fragments/desktop-sync.html?raw';
import mobileHtml from '../fragments/mobile-sync.html?raw';

export default function Sync() {
  return <PageShell desktopHtml={desktopHtml} mobileHtml={mobileHtml} />;
}
