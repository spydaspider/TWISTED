
import { useCallback, useEffect, useState } from "react";
import "./Admin.css";

const API_URL = "http://localhost:5000/api";

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || `Request failed (${response.status}).`);
  }

  return data;
}

function getStoryFromResponse(data) {
  return data.draft || data.story || data.episode || data;
}

export default function Admin() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [secret, setSecret] = useState("");
  const [loginError, setLoginError] = useState("");
  const [busy, setBusy] = useState(false);

  const [stories, setStories] = useState([]);
  const [selectedSlug, setSelectedSlug] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const [draft, setDraft] = useState(null);
  const [draftSlug, setDraftSlug] = useState("");
  const [draftSaving, setDraftSaving] = useState(false);

  const selectedStory = stories.find(
    (story) => story.slug === selectedSlug
  );

  const loadStories = useCallback(async () => {
    const data = await apiRequest("/admin/stories");
    const list = Array.isArray(data.stories) ? data.stories : [];

    list.sort((a, b) => {
      const seriesA = a.seriesSlug || a.slug;
      const seriesB = b.seriesSlug || b.slug;

      if (seriesA !== seriesB) {
        return seriesA.localeCompare(seriesB);
      }

      return Number(a.episode || 0) - Number(b.episode || 0);
    });

    setStories(list);

    setSelectedSlug((current) => {
      if (current && list.some((story) => story.slug === current)) {
        return current;
      }

      return list[0]?.slug || "";
    });

    return list;
  }, []);

  useEffect(() => {
    let active = true;

    async function checkSession() {
      try {
        const data = await apiRequest("/admin/session");

        if (active && data.authenticated) {
          setAuthenticated(true);
        }
      } catch {
        if (active) setAuthenticated(false);
      } finally {
        if (active) setCheckingSession(false);
      }
    }

    checkSession();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!authenticated) return;

    let active = true;

    async function refresh() {
      try {
        const data = await apiRequest("/admin/stories");
        if (!active) return;

        const list = Array.isArray(data.stories) ? data.stories : [];

        list.sort((a, b) => {
          const seriesA = a.seriesSlug || a.slug;
          const seriesB = b.seriesSlug || b.slug;

          if (seriesA !== seriesB) {
            return seriesA.localeCompare(seriesB);
          }

          return Number(a.episode || 0) - Number(b.episode || 0);
        });

        setStories(list);
        setSelectedSlug((current) => {
          if (current && list.some((story) => story.slug === current)) {
            return current;
          }
          return list[0]?.slug || "";
        });
      } catch (err) {
        if (active) setError(err.message);
      }
    }

    refresh();
    const intervalId = window.setInterval(refresh, 15000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [authenticated]);

  async function handleLogin(event) {
    event.preventDefault();
    setLoginError("");
    setBusy(true);

    try {
      await apiRequest("/admin/login", {
        method: "POST",
        body: JSON.stringify({ secret }),
      });

      setSecret("");
      setAuthenticated(true);
      setNotice("You are now signed in to TWISTED Admin Studio.");
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    setBusy(true);

    try {
      await apiRequest("/admin/logout", { method: "POST" });
    } catch {
      // Clear the local admin view even if the session has expired.
    } finally {
      setAuthenticated(false);
      setStories([]);
      setDraft(null);
      setDraftSlug("");
      setSelectedSlug("");
      setNotice("");
      setError("");
      setBusy(false);
    }
  }

  async function performAction(label, path, method = "POST") {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const data = await apiRequest(path, { method });
      setNotice(data.message || `${label} completed successfully.`);
      await loadStories();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function generateEpisode() {
    if (!selectedStory) return;

    setBusy(true);
    setError("");
    setNotice("");
    setDraft(null);
    setDraftSlug("");

    try {
      const data = await apiRequest(
        `/admin/stories/${encodeURIComponent(selectedStory.slug)}/episodes/draft`,
        { method: "POST" }
      );

      const generated = getStoryFromResponse(data);

      if (!generated || !generated.slug) {
        throw new Error(
          "The server generated a response, but no draft episode slug was returned. Check the backend response in Postman."
        );
      }

      setDraft(generated);
      setDraftSlug(generated.slug);
      setNotice(data.message || "Your AI episode draft has been generated. Review it before publishing.");
      await loadStories();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function openDraft(slug) {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const data = await apiRequest(
        `/admin/episodes/${encodeURIComponent(slug)}`
      );

      const loadedDraft = getStoryFromResponse(data);

      setDraft(loadedDraft);
      setDraftSlug(slug);
      setNotice("Draft loaded. You can now review and edit it.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function updateDraft(field, value) {
    setDraft((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateChoice(index, value) {
    setDraft((current) => {
      const choices = [...(current.choices || [])];
      choices[index] = {
        ...choices[index],
        title: value,
      };

      return { ...current, choices };
    });
  }

  function addChoice() {
    setDraft((current) => {
      const choices = [...(current.choices || [])];

      if (choices.length >= 4) return current;

      choices.push({
        id: `option-${choices.length + 1}`,
        title: "",
        votes: 0,
      });

      return { ...current, choices };
    });
  }

  function removeChoice(index) {
    setDraft((current) => {
      const choices = [...(current.choices || [])];

      if (choices.length <= 2) return current;

      choices.splice(index, 1);

      return { ...current, choices };
    });
  }

  async function saveDraft() {
    if (!draft || !draftSlug) return;

    setDraftSaving(true);
    setError("");
    setNotice("");

    try {
      const payload = {
        title: draft.title,
        genre: draft.genre,
        description: draft.description,
        content: draft.content,
        choices: (draft.choices || []).map((choice) => ({
          id: choice.id,
          title: choice.title,
        })),
      };

      const data = await apiRequest(
        `/admin/episodes/${encodeURIComponent(draftSlug)}`,
        {
          method: "PUT",
          body: JSON.stringify(payload),
        }
      );

      const savedDraft = getStoryFromResponse(data);
      if (savedDraft && savedDraft.slug) setDraft(savedDraft);

      setNotice(data.message || "Draft saved successfully.");
      await loadStories();
    } catch (err) {
      setError(err.message);
    } finally {
      setDraftSaving(false);
    }
  }

  async function publishDraft() {
    if (!draftSlug) return;

    const confirmed = window.confirm(
      "Publish this episode? It will become visible on the public website and voting will begin."
    );

    if (!confirmed) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const data = await apiRequest(
        `/admin/episodes/${encodeURIComponent(draftSlug)}/publish`,
        { method: "POST" }
      );

      setNotice(data.message || "Episode published. Voting is now open.");
      setDraft(null);
      setDraftSlug("");
      await loadStories();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (checkingSession) {
    return (
      <main className="admin-page">
        <p className="admin-loading">Checking admin session...</p>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className="admin-page admin-login-page">
        <a className="admin-brand" href="/">
          TWISTED<span>.</span>
        </a>

        <form className="admin-login-card" onSubmit={handleLogin}>
          <p className="admin-eyebrow">RESTRICTED ACCESS</p>
          <h1>Admin Studio</h1>
          <p className="admin-muted">
            Sign in to manage stories, voting and episode publication.
          </p>

          <label htmlFor="admin-secret">Admin secret</label>
          <input
            id="admin-secret"
            type="password"
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            placeholder="Enter your admin secret"
            autoComplete="current-password"
            required
          />

          {loginError && (
            <p className="admin-alert admin-alert-error">{loginError}</p>
          )}

          <button className="admin-primary" disabled={busy}>
            {busy ? "Signing in..." : "Sign in"}
          </button>

          <a className="admin-back-link" href="/">
            ← Return to the public website
          </a>
        </form>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <header className="admin-header">
        <a className="admin-brand" href="/">
          TWISTED<span>.</span>
          <small>ADMIN STUDIO</small>
        </a>

        <div className="admin-header-actions">
          <a href="/" className="admin-public-link">
            View public website ↗
          </a>
          <button
            className="admin-logout"
            onClick={handleLogout}
            disabled={busy}
          >
            Sign out
          </button>
        </div>
      </header>

      <section className="admin-main">
        <div className="admin-heading">
          <div>
            <p className="admin-eyebrow">CONTROL ROOM</p>
            <h1>Story management</h1>
            <p className="admin-muted">
              Manage community decisions and shape the next official chapter.
            </p>
          </div>

          <button
            className="admin-secondary"
            onClick={() => loadStories().catch((err) => setError(err.message))}
            disabled={busy}
          >
            ↻ Refresh stories
          </button>
        </div>

        {notice && <p className="admin-alert admin-alert-success">{notice}</p>}
        {error && <p className="admin-alert admin-alert-error">{error}</p>}

        <section className="admin-stats">
          <article>
            <span>ALL EPISODES</span>
            <strong>{stories.length}</strong>
          </article>
          <article>
            <span>PUBLISHED</span>
            <strong>{stories.filter((story) => story.status !== "draft").length}</strong>
          </article>
          <article>
            <span>DRAFTS</span>
            <strong>{stories.filter((story) => story.status === "draft").length}</strong>
          </article>
        </section>

        <div className="admin-grid">
          <section className="admin-panel">
            <div className="admin-panel-heading">
              <div>
                <p className="admin-eyebrow">LIBRARY</p>
                <h2>Episodes</h2>
              </div>
            </div>

            {stories.length === 0 ? (
              <p className="admin-muted">No episodes found.</p>
            ) : (
              <div className="admin-episode-list">
                {stories.map((item) => (
                  <button
                    key={item.slug}
                    className={`admin-episode-item ${
                      selectedSlug === item.slug ? "active" : ""
                    }`}
                    onClick={() => {
                      setSelectedSlug(item.slug);
                      setDraft(null);
                      setDraftSlug("");
                      setError("");
                      setNotice("");
                    }}
                  >
                    <span>
                      <small>EPISODE {item.episode || "—"}</small>
                      <strong>{item.title}</strong>
                      <em>{item.genre || "Uncategorised"}</em>
                    </span>
                    <span className={`admin-status status-${item.status}`}>
                      {item.status || "unknown"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="admin-panel admin-detail-panel">
            {selectedStory ? (
              <>
                <div className="admin-panel-heading">
                  <div>
                    <p className="admin-eyebrow">
                      EPISODE {selectedStory.episode}
                    </p>
                    <h2>{selectedStory.title}</h2>
                    <p className="admin-muted">
                      {selectedStory.genre} · {selectedStory.slug}
                    </p>
                  </div>
                  <span className={`admin-status status-${selectedStory.status}`}>
                    {selectedStory.status}
                  </span>
                </div>

                <p className="admin-description">
                  {selectedStory.description}
                </p>

                <div className="admin-voting-block">
                  <h3>Original voting</h3>
                  {(selectedStory.choices || []).map((choice) => (
                    <div className="admin-vote-row" key={choice.id}>
                      <span>{choice.title}</span>
                      <strong>{choice.votes || 0}</strong>
                    </div>
                  ))}
                  <p className="admin-muted">
                    Total: {(selectedStory.choices || []).reduce(
                      (sum, choice) => sum + (Number(choice.votes) || 0), 0
                    )} votes
                  </p>
                </div>

                {selectedStory.runoffChoices?.length > 0 && (
                  <div className="admin-voting-block">
                    <h3>Runoff voting</h3>
                    {(selectedStory.runoffChoices || []).map((choice) => (
                      <div className="admin-vote-row" key={choice.id}>
                        <span>{choice.title}</span>
                        <strong>{choice.votes || 0}</strong>
                      </div>
                    ))}
                    <p className="admin-muted">
                      Runoff status: {selectedStory.runoffStatus || "not started"}
                    </p>
                  </div>
                )}

                {selectedStory.runoffWinningChoiceId && (
                  <div className="admin-winner">
                    <span>OFFICIAL DIRECTION</span>
                    <strong>
                      {[
                        ...(selectedStory.choices || []),
                        ...(selectedStory.runoffChoices || []),
                      ].find(
                        (choice) =>
                          choice.id === selectedStory.runoffWinningChoiceId
                      )?.title || selectedStory.runoffWinningChoiceId}
                    </strong>
                  </div>
                )}

                <div className="admin-actions">
                  {selectedStory.status !== "completed" &&
                    selectedStory.runoffStatus !== "voting" && (
                      <button
                        className="admin-secondary"
                        disabled={busy}
                        onClick={() =>
                          performAction(
                            "Closing voting",
                            `/stories/${encodeURIComponent(selectedStory.slug)}/close-voting`
                          )
                        }
                      >
                        Close original voting
                      </button>
                    )}

                  {selectedStory.status === "completed" &&
                    selectedStory.runoffStatus !== "voting" &&
                    !selectedStory.runoffWinningChoiceId &&
                    (selectedStory.tiedChoiceIds || []).length > 1 && (
                      <button
                        className="admin-secondary"
                        disabled={busy}
                        onClick={() =>
                          performAction(
                            "Starting runoff",
                            `/stories/${encodeURIComponent(selectedStory.slug)}/runoff/start`
                          )
                        }
                      >
                        Start runoff
                      </button>
                    )}

                  {selectedStory.runoffStatus === "voting" && (
                    <button
                      className="admin-primary"
                      disabled={busy}
                      onClick={() =>
                        performAction(
                          "Closing runoff",
                          `/stories/${encodeURIComponent(selectedStory.slug)}/runoff/close`
                        )
                      }
                    >
                      Close runoff
                    </button>
                  )}

                  {selectedStory.status === "completed" &&
                    (selectedStory.runoffWinningChoiceId ||
                      selectedStory.winningChoiceId) && (
                      <button
                        className="admin-primary"
                        disabled={busy}
                        onClick={generateEpisode}
                      >
                        ✦ Generate next episode with AI
                      </button>
                    )}
                </div>

                {selectedStory.status === "draft" && (
                  <button
                    className="admin-secondary"
                    disabled={busy}
                    onClick={() => openDraft(selectedStory.slug)}
                  >
                    Open this draft for review
                  </button>
                )}
              </>
            ) : (
              <p className="admin-muted">Select an episode to manage it.</p>
            )}
          </section>
        </div>

        {draft && (
          <section className="admin-panel admin-editor">
            <div className="admin-panel-heading">
              <div>
                <p className="admin-eyebrow">AI-GENERATED CONTENT</p>
                <h2>Review episode draft</h2>
                <p className="admin-muted">
                  This episode is not public until you publish it.
                </p>
              </div>
              <span className="admin-status status-draft">DRAFT</span>
            </div>

            <label htmlFor="draft-title">Episode title</label>
            <input
              id="draft-title"
              value={draft.title || ""}
              onChange={(event) => updateDraft("title", event.target.value)}
            />

            <label htmlFor="draft-genre">Genre</label>
            <input
              id="draft-genre"
              value={draft.genre || ""}
              onChange={(event) => updateDraft("genre", event.target.value)}
            />

            <label htmlFor="draft-description">Short description</label>
            <textarea
              id="draft-description"
              rows="3"
              value={draft.description || ""}
              onChange={(event) => updateDraft("description", event.target.value)}
            />

            <label htmlFor="draft-content">Story content</label>
            <textarea
              id="draft-content"
              className="admin-story-editor"
              rows="18"
              value={draft.content || ""}
              onChange={(event) => updateDraft("content", event.target.value)}
            />

            <div className="admin-choices-editor">
              <div className="admin-editor-subheading">
                <h3>Voting choices</h3>
                <button
                  type="button"
                  className="admin-text-button"
                  onClick={addChoice}
                  disabled={(draft.choices || []).length >= 4}
                >
                  + Add choice
                </button>
              </div>

              {(draft.choices || []).map((choice, index) => (
                <div className="admin-choice-edit-row" key={choice.id || index}>
                  <input
                    value={choice.title || ""}
                    onChange={(event) => updateChoice(index, event.target.value)}
                    aria-label={`Choice ${index + 1}`}
                  />
                  <button
                    type="button"
                    className="admin-remove-choice"
                    onClick={() => removeChoice(index)}
                    disabled={(draft.choices || []).length <= 2}
                    aria-label={`Remove choice ${index + 1}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <div className="admin-actions admin-publish-actions">
              <button
                className="admin-secondary"
                onClick={saveDraft}
                disabled={draftSaving || busy}
              >
                {draftSaving ? "Saving..." : "Save draft"}
              </button>

              <button
                className="admin-primary"
                onClick={publishDraft}
                disabled={busy || draftSaving}
              >
                Publish episode →
              </button>

              <button
                className="admin-text-button"
                onClick={() => {
                  setDraft(null);
                  setDraftSlug("");
                }}
              >
                Close editor
              </button>
            </div>
          </section>
        )}
      </section>

      <footer className="admin-footer">
        TWISTED ADMIN STUDIO · CONTROL THE STORY, NOT THE VOTE.
      </footer>
    </main>
  );
}
