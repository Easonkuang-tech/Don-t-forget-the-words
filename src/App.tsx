import { useEffect, useRef, useState } from "react";
import { AppShell, type AppTab } from "./components/AppShell";
import { clearLocalSession, createLocalSession, readLocalSession } from "./lib/auth";
import { activateCloudUser, deactivateCloudUser } from "./lib/db";
import { CreatePage } from "./pages/CreatePage";
import { DeckDetailPage } from "./pages/DeckDetailPage";
import { DiscoverPage } from "./pages/DiscoverPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { ProfilePage } from "./pages/ProfilePage";
import { ReviewPage } from "./pages/ReviewPage";
import { StatsPage } from "./pages/StatsPage";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import type { ReviewSessionRequest } from "./types";

type Route =
  | { name: "tab"; tab: AppTab }
  | { name: "review"; request: ReviewSessionRequest }
  | { name: "deck"; deckId: string };

interface AppSession {
  mode: "local" | "cloud";
  name: string;
  email?: string;
  userId?: string;
}

export function App() {
  const [session, setSession] = useState<AppSession | null>(() => {
    if (isSupabaseConfigured) {
      return null;
    }
    const local = readLocalSession();
    return local
      ? {
          mode: "local",
          name: local.name
        }
      : null;
  });
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [route, setRoute] = useState<Route>({ name: "tab", tab: "home" });
  const [reviewRun, setReviewRun] = useState(0);
  const authSyncUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      return;
    }

    let active = true;

    const applySupabaseSession = async (user: {
      id: string;
      email?: string;
      user_metadata?: { full_name?: string };
    }) => {
      if (authSyncUserId.current === user.id) {
        return;
      }
      authSyncUserId.current = user.id;
      try {
        await activateCloudUser(user.id);
        if (!active) {
          return;
        }
        setSession({
          mode: "cloud",
          userId: user.id,
          email: user.email,
          name:
            user.user_metadata?.full_name ||
            user.email?.split("@")[0] ||
            "RepLoop User"
        });
      } catch (error) {
        console.error("Supabase 登录同步失败", error);
        authSyncUserId.current = null;
      } finally {
        if (active) {
          setAuthReady(true);
        }
      }
    };

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (nextSession?.user) {
        void applySupabaseSession(nextSession.user);
      } else {
        authSyncUserId.current = null;
        void deactivateCloudUser();
        setSession(null);
        setAuthReady(true);
      }
    });

    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!data.session && active) {
          setAuthReady(true);
        }
      })
      .catch((error) => {
        console.error("Supabase Session 读取失败", error);
        if (active) {
          setAuthReady(true);
        }
      });

    return () => {
      active = false;
      authSyncUserId.current = null;
      subscription.unsubscribe();
      void deactivateCloudUser();
    };
  }, []);

  if (!authReady) {
    return (
      <main className="app-loading">
        <span />
        <p>正在同步云端记忆库...</p>
      </main>
    );
  }

  if (!session) {
    return (
      <LoginPage
        cloudEnabled={isSupabaseConfigured}
        onLocalLogin={(name) => {
          setSession({
            mode: "local",
            name: createLocalSession(name).name
          });
        }}
        onCloudLogin={async (email, password) => {
          if (!supabase) {
            throw new Error("Supabase 尚未配置");
          }
          const { error } = await supabase.auth.signInWithPassword({
            email,
            password
          });
          if (error) {
            throw new Error(error.message);
          }
        }}
        onCloudRegister={async (email, password) => {
          if (!supabase) {
            throw new Error("Supabase 尚未配置");
          }
          const { data, error } = await supabase.auth.signUp({
            email,
            password
          });
          if (error) {
            throw new Error(error.message);
          }
          return data.session
            ? "账号已创建"
            : "账号已创建，请检查邮箱确认后再登录";
        }}
      />
    );
  }

  const navigate = (tab: AppTab) => setRoute({ name: "tab", tab });
  const startReview = (request: ReviewSessionRequest) => {
    setReviewRun((current) => current + 1);
    setRoute({ name: "review", request });
  };
  const openDeck = (deckId: string) => setRoute({ name: "deck", deckId });

  if (route.name === "review") {
    return (
      <div className="review-shell">
        <ReviewPage
          key={`${reviewRun}-${route.request.scope}-${route.request.mode}-${route.request.deckId ?? "all"}`}
          request={route.request}
          onExit={() => setRoute({ name: "tab", tab: "home" })}
        />
      </div>
    );
  }

  if (route.name === "deck") {
    return (
      <div className="review-shell">
        <DeckDetailPage
          deckId={route.deckId}
          onBack={() => setRoute({ name: "tab", tab: "home" })}
          onStartReview={(deckId) =>
            startReview({ scope: "focused", mode: "mixed", deckId })
          }
        />
      </div>
    );
  }

  return (
    <AppShell activeTab={route.tab} onNavigate={navigate}>
      {route.tab === "home" ? (
        <HomePage onStartReview={startReview} onOpenDeck={openDeck} />
      ) : null}
      {route.tab === "discover" ? <DiscoverPage /> : null}
      {route.tab === "create" ? <CreatePage /> : null}
      {route.tab === "stats" ? <StatsPage /> : null}
      {route.tab === "profile" ? (
        <ProfilePage
          userName={session.name}
          userEmail={session.email}
          cloudMode={session.mode === "cloud"}
          onLogout={async () => {
            if (session.mode === "cloud" && supabase) {
              await supabase.auth.signOut();
              await deactivateCloudUser();
            } else {
              clearLocalSession();
            }
            setSession(null);
            setRoute({ name: "tab", tab: "home" });
          }}
        />
      ) : null}
    </AppShell>
  );
}
