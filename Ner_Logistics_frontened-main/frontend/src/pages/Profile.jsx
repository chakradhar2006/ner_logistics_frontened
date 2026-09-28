import PageShell from '../components/PageShell.jsx';
import desktopHtml from '../fragments/desktop-profile.html?raw';
import mobileHtml from '../fragments/mobile-profile.html?raw';

export default function Profile() {
  return <PageShell desktopHtml={desktopHtml} mobileHtml={mobileHtml} />;
}
