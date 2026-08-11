import { useEffect, useState } from "react";
import Poll from "./Poll.jsx";
import Builder from "./Builder.jsx";
// import Players from "./Players.jsx"; // ← re-enable with the route below

// Tiny path router (no dependency). `/` is the shareable poll landing so link
// previews in group chats point at the next game's RSVP; `/build` is the
// formation tool.
//
// Player profiles are OFF until there are a few months of ratings under the
// expanded skill list — every rating collected so far predates it, so the
// archetypes would read skewed. The view still lives in src/Players.jsx: to
// bring it back, uncomment the import above, the route below, and the render
// line in the component.
function viewFor(pathname) {
  const path = pathname.replace(/\/+$/, "");
  if (path === "/build") return "build";
  // if (path === "/feature/profiles") return "players";
  return "poll";
}

export default function App() {
  const [view, setView] = useState(() => viewFor(window.location.pathname));

  useEffect(() => {
    const onPop = () => setView(viewFor(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function navigate(path) {
    if (path !== window.location.pathname) window.history.pushState({}, "", path);
    setView(viewFor(path));
    window.scrollTo(0, 0);
  }

  if (view === "build") return <Builder onNavigate={navigate} />;
  // if (view === "players") return <Players onNavigate={navigate} />;
  return <Poll onNavigate={navigate} />;
}
