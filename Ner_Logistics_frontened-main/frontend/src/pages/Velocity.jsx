import PageShell from '../components/PageShell.jsx';
import desktopHtml from '../fragments/desktop-velocity.html?raw';
import mobileHtml from '../fragments/mobile-velocity.html?raw';

export default function Velocity() {
  return <PageShell desktopHtml={desktopHtml} mobileHtml={mobileHtml} />;
}
