import { useCallback, useEffect, useState } from 'react';
import { Landing } from './screens/Landing.tsx';
import { Create } from './screens/Create.tsx';
import { Join } from './screens/Join.tsx';
import { Table } from './screens/Table.tsx';
import { initSound } from './lib/sound.ts';
import { isConfigured } from './lib/supabase.ts';
import { toAppPath, toHref } from './lib/routing.ts';

type Route =
  | { name: 'home' }
  | { name: 'create' }
  | { name: 'join'; code?: string }
  | { name: 'table'; code: string };

const parse = (path: string): Route => {
  const table = /^\/g\/([A-Za-z0-9]{4,8})/.exec(path);
  if (table) return { name: 'table', code: table[1].toUpperCase() };
  const join = /^\/join(?:\/([A-Za-z0-9]{4,8}))?/.exec(path);
  if (join) return { name: 'join', code: join[1]?.toUpperCase() };
  if (path.startsWith('/new')) return { name: 'create' };
  return { name: 'home' };
};

const pathFor = (r: Route) => {
  switch (r.name) {
    case 'table':
      return `/g/${r.code}`;
    case 'create':
      return '/new';
    case 'join':
      return r.code ? `/join/${r.code}` : '/join';
    default:
      return '/';
  }
};

/**
 * GitHub Pages answers unknown paths with 404.html. That copy of the app stashes
 * the path the visitor actually asked for, so a shared /g/K7PX link still lands
 * on the right table instead of the home screen.
 */
function initialPath(): string {
  try {
    const redirected = sessionStorage.getItem('chiptable.redirect');
    if (redirected) {
      sessionStorage.removeItem('chiptable.redirect');
      history.replaceState(null, '', redirected);
      return toAppPath(new URL(redirected, location.origin).pathname);
    }
  } catch {
    /* storage unavailable — fall back to the current URL */
  }
  return toAppPath(location.pathname);
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => parse(initialPath()));

  useEffect(() => {
    initSound();
    const onPop = () => setRoute(parse(toAppPath(location.pathname)));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Navigation never reloads the page — game state and the socket survive.
  const go = useCallback((next: Route, replace = false) => {
    const href = toHref(pathFor(next));
    if (replace) history.replaceState(null, '', href);
    else history.pushState(null, '', href);
    setRoute(next);
  }, []);

  if (!isConfigured) return <Misconfigured />;

  switch (route.name) {
    case 'create':
      return (
        <Create
          onReady={(code) => go({ name: 'table', code }, true)}
          onBack={() => go({ name: 'home' })}
        />
      );
    case 'join':
      return (
        <Join
          initialCode={route.code}
          onJoined={(code) => go({ name: 'table', code }, true)}
          onBack={() => go({ name: 'home' })}
        />
      );
    case 'table':
      return (
        <Table
          key={route.code}
          code={route.code}
          onLeave={() => go({ name: 'home' })}
          onJoinNeeded={() => go({ name: 'join', code: route.code })}
        />
      );
    default:
      return <Landing onCreate={() => go({ name: 'create' })} onJoin={() => go({ name: 'join' })} />;
  }
}

function Misconfigured() {
  return (
    <div className="mx-auto flex h-full max-w-sm flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="gold-text text-4xl font-black">ChipTable ♠</h1>
      <p className="text-sm text-[var(--color-muted)]">
        Almost there — this build has no Supabase project attached yet.
      </p>
      <pre className="w-full rounded-2xl bg-black/40 p-3 text-left text-[11px] text-white/60">
        VITE_SUPABASE_URL{'\n'}VITE_SUPABASE_ANON_KEY
      </pre>
      <p className="text-xs text-white/35">
        Set both in <code>.env</code> when running locally, or as repository secrets when
        deploying. Full setup is in the README.
      </p>
    </div>
  );
}
