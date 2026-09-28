import { useEffect, useRef } from 'react';
import { initPageBehaviors, hideSuccessBanner } from '../legacy/legacy.js';
import desktopHtml from '../fragments/desktop-register.html?raw';
import mobileHtml from '../fragments/mobile-register.html?raw';

export default function Register() {
  const ref = useRef(null);

  useEffect(() => {
    hideSuccessBanner();
    initPageBehaviors(ref.current);
  }, []);

  return (
    <div ref={ref}>
      <div className="desktop-only" dangerouslySetInnerHTML={{ __html: desktopHtml }} />
      <div className="mobile-only">
        <div className="mobile-screen auth-mobile-screen" dangerouslySetInnerHTML={{ __html: mobileHtml }} />
      </div>
    </div>
  );
}
