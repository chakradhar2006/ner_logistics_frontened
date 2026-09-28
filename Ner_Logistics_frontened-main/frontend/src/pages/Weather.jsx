import PageShell from '../components/PageShell.jsx';
import desktopHtml from '../fragments/desktop-weather.html?raw';
import mobileHtml from '../fragments/mobile-weather.html?raw';

export default function Weather() {
  return <PageShell desktopHtml={desktopHtml} mobileHtml={mobileHtml} />;
}
