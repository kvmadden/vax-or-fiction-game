import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { earlyWarmSurface, warmEarlyMusic } from './engine/music-warm';
import { hasHostIntent, rememberHostTab, resolveAppRoute, withHostRoom } from './network/room';
import { Entry } from './screens/Entry';

// Styles
import './styles/presentation.css';
import './styles/phone-live.css';
import './styles/opening-stage.css';
import './styles/question-chrome.css';
import './styles/presenter-remote.css';
import './styles/closing-critique.css'; // closing composition (critique item 9); after presentation.css on purpose
import './styles/leaderboard.css';
import './styles/editorial-cards.css';
// Scoped stage modules extracted from presentation.css:
import './styles/preshow-stage.css';
import './styles/show-atmosphere.css';
import './styles/restart-run.css';
import './styles/keyboard-help.css';
import './styles/admin.css';
import './styles/lyric-scroll.css';
import './styles/site-pages.css';
// The premium room phone screens and the presenter's pad, after the phone and pad styles above so they sit over them.
import './styles/phone-room.css';
import './styles/remote-clicker.css';
import './styles/emphasis.css';
// Game night on every screen (VOF-88, VOF-89), before the stage owner so it never places anything.
import './styles/game-night.css';
import './styles/question-stage.css';
// Show looks (VOF-93). The look picker's own styles are small and live in setup. The drawn looks' stylesheets load
// the first time a page wears one (looks/looks-styles.ts), so Today never downloads them.
import './looks/picker.css';

const PresentationSuite = lazy(() => import('./presentation/PresentationSuite'));
const PhoneSuite = lazy(() => import('./phone/PhoneSuite'));
const RemoteSuite = lazy(() => import('./phone/RemoteSuite'));
// Solo play (VOF-44) carries answers for its topics, so it stays its own lazy chunk that /join never loads.
const SoloSuite = lazy(() => import('./solo/SoloSuite'));
const Admin = lazy(() => import('./screens/Admin'));
// Site pages (VOF-45): about, legal and credits. Each its own lazy chunk so the game bundle
// never grows for them; a visitor to any one of these never fetches the others.
const About = lazy(() => import('./screens/site/About'));
const Disclaimer = lazy(() => import('./screens/site/Disclaimer'));
const Privacy = lazy(() => import('./screens/site/Privacy'));
const Terms = lazy(() => import('./screens/site/Terms'));
const Credits = lazy(() => import('./screens/site/Credits'));

// A path outside this set (a typo, a dead link, a deleted page) never reaches this SPA at all:
// the root 404.html is Vercel's own static 404 (filesystem-served, real 404 status, no rewrite
// involved). So this map only needs the five real pages a full navigation can land on.
const SITE_PAGES: Record<string, LazyExoticComponent<ComponentType>> = {
  '/about': About,
  '/disclaimer': Disclaimer,
  '/privacy': Privacy,
  '/terms': Terms,
  '/credits': Credits,
};

let route: ReturnType<typeof resolveAppRoute> | null = null;
let routeError = '';
const initialUrl = new URL(window.location.href);
try { route = resolveAppRoute(initialUrl); }
catch (error) { routeError = error instanceof Error ? error.message : 'This room link is invalid.'; }
const undecided = route?.mode === 'host' && !initialUrl.searchParams.has('room');
const autoHost = Boolean(undecided && route && hasHostIntent(initialUrl));
if (autoHost && typeof window !== 'undefined' && route) {
  rememberHostTab(route.roomId);
  window.location.replace(withHostRoom(initialUrl, route.roomId).href);
}

// A hosted show or a solo round warms its opening beds while its suite chunk loads (music-warm.ts). Nothing else does.
warmEarlyMusic(earlyWarmSurface({
  mode: route?.mode ?? null,
  undecided,
  redirecting: autoHost,
  sitePage: Boolean(SITE_PAGES[initialUrl.pathname]) || initialUrl.pathname === '/admin',
}));

function App() {
  if (autoHost) return null;
  const SitePageComponent = SITE_PAGES[initialUrl.pathname];
  if (SitePageComponent) {
    return <ErrorBoundary><Suspense fallback={null}><SitePageComponent /></Suspense></ErrorBoundary>;
  }
  if (initialUrl.pathname === '/admin') {
    return <ErrorBoundary><Suspense fallback={null}><Admin /></Suspense></ErrorBoundary>;
  }
  if (!route) return <main className="route-error"><h1>Check your room link</h1><p>{routeError}</p><a href="/join">Enter a room code</a></main>;
  if (undecided) {
    const openHost = () => {
      rememberHostTab(route.roomId);
      window.location.assign(withHostRoom(new URL(window.location.href), route.roomId).href);
    };
    const openJoin = () => window.location.assign(new URL('/join', window.location.origin));
    const openSolo = () => window.location.assign(new URL('/play', window.location.origin));
    return <ErrorBoundary><Entry onHost={openHost} onJoin={openJoin} onSolo={openSolo} /></ErrorBoundary>;
  }
  return (
    <ErrorBoundary>
        <Suspense fallback={null}>
          {route.mode === 'attendee' && <PhoneSuite roomId={route.roomId} />}
          {route.mode === 'remote' && <RemoteSuite roomId={route.roomId} />}
          {route.mode === 'solo' && <SoloSuite />}
          {route.mode === 'host' && <PresentationSuite roomId={route.roomId} />}
        </Suspense>
    </ErrorBoundary>
  );
}

export default App;
