import PageShell from '../components/PageShell.jsx';
import desktopHtml from '../fragments/desktop-roads.html?raw';
import mobileHtml from '../fragments/mobile-roads.html?raw';

export default function Roads() {
  return <PageShell desktopHtml={desktopHtml} mobileHtml={mobileHtml} />;
}
