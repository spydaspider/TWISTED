import { useCallback, useEffect, useState } from "react";
import "./Admin.css";

const API_URL = "http://localhost:5000/api";
const MIN_EPISODE_WORDS = 100;
const MAX_EPISODE_WORDS = 180;

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

function getWordCount(content = "") {
  const trimmed = content.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function getOfficialWinner(story) {
  if (!story) return null;

  const winnerId =
    story.runoffWinningChoiceId || story.winningChoiceId;

  if (!winnerId) return null;

  const allChoices = [
    ...(story.choices || []),
    ...(story.runoffChoices || []),
  ];

  return (
    allChoices.find((choice) => choice.id === winnerId) || {
      id: winnerId,
      title: winnerId,
    }
  );
}

function getVoteTotal(choices = []) {
  return choices.reduce(
    (total, choice) => total + (Number(choice.votes) || 0),
    0
  );
}

function getVotePercentage(votes, total) {
  if (!total) return 0;
  return Math.round(((Number(votes) || 0) / total) * 100);
}

function getStatusLabel(story) {
  if (!story) return "Unknown";

  if (story.status === "draft") return "Draft";

  if (story.runoffStatus === "voting") {
    return "Runoff live";
  }

  if (story.status === "completed") {
    return "Completed";
  }

  if (story.status === "voting") {
    return "Live voting";
  }

  return story.status || "Unknown";
}

function getStatusClass(story) {
  if (!story) return "unknown";

  if (story.status === "draft") return "draft";

  if (story.runoffStatus === "voting") return "runoff";

  return story.status || "unknown";
}

function getDraftValidation(draft) {
  if (!draft) return [];

  const errors = [];
  const wordCount = getWordCount(draft.content || "");
  const choices = draft.choices || [];

  if (!draft.title?.trim()) {
    errors.push("Add an episode title.");
  }

  if (!draft.description?.trim()) {
    errors.push("Add a short episode description.");
  }

  if (wordCount < MIN_EPISODE_WORDS) {
    errors.push(
      `The story needs at least ${MIN_EPISODE_WORDS} words. It currently has ${wordCount}.`
    );
  }

  if (wordCount > MAX_EPISODE_WORDS) {
    errors.push(
      `The story must not exceed ${MAX_EPISODE_WORDS} words. It currently has ${wordCount}.`
    );
  }

  if (choices.length !== 3) {
    errors.push("An episode must have exactly 3 voting choices.");
  }

  if (choices.some((choice) => !choice.title?.trim())) {
    errors.push("All 3 voting choices must have text.");
  }

  return errors;
}

function getDraftPayload(draft) {
  return {
    title: draft.title,
    genre: draft.genre,
    description: draft.description,
    content: draft.content,
    choices: (draft.choices || []).map((choice) => ({
      id: choice.id,
      title: choice.title,
    })),
  };
}

function VoteResults({ title, choices = [], winnerId }) {
  const total = getVoteTotal(choices);

  return (
    <div className="admin-voting-block">
      <div className="admin-voting-heading">
        <h3>{title}</h3>
        <span>{total} total votes</span>
      </div>

      {choices.length === 0 ? (
        <p className="admin-muted">No voting choices are available.</p>
      ) : (
        <div className="admin-vote-list">
          {choices.map((choice) => {
            const votes = Number(choice.votes) || 0;
            const percentage = getVotePercentage(votes, total);
            const isWinner = winnerId === choice.id;

            return (
              <div className="admin-vote-result" key={choice.id}>
                <div className="admin-vote-row">
                  <span>
                    {choice.title}
                    {isWinner && (
                      <span className="admin-winner-inline"> · WINNER</span>
                    )}
                  </span>
                  <strong>
                    {votes} <small>({percentage}%)</small>
                  </strong>
                </div>

                <div className="admin-vote-track">
                  <div
                    className="admin-vote-fill"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
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

  const draftWordCount = getWordCount(draft?.content || "");
  const draftValidationErrors = getDraftValidation(draft);

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

      setNotice(
        data.message ||
          "Your AI episode draft has been generated. Review its length and content before publishing."
      );

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

      if (!loadedDraft || !loadedDraft.slug) {
        throw new Error("The server did not return a valid draft.");
      }

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

  async function saveDraft() {
    if (!draft || !draftSlug) return;

    setDraftSaving(true);
    setError("");
    setNotice("");

    try {
      const data = await apiRequest(
        `/admin/episodes/${encodeURIComponent(draftSlug)}`,
        {
          method: "PUT",
          body: JSON.stringify(getDraftPayload(draft)),
        }
      );

      const savedDraft = getStoryFromResponse(data);

      if (savedDraft && savedDraft.slug) {
        setDraft(savedDraft);
      }

      setNotice(data.message || "Draft saved successfully.");
      await loadStories();
    } catch (err) {
      setError(err.message);
    } finally {
      setDraftSaving(false);
    }
  }

  async function publishDraft() {
    if (!draft || !draftSlug) return;

    const validationErrors = getDraftValidation(draft);

    if (validationErrors.length > 0) {
      setError(
        `This episode is not ready to publish:\n${validationErrors.join("\n")}`
      );
      setNotice("");
      return;
    }

    const confirmed = window.confirm(
      "Publish this episode? Your latest edits will be saved first. It will become visible on the public website and voting will begin."
    );

    if (!confirmed) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      // Save the latest editor contents before publishing.
      await apiRequest(
        `/admin/episodes/${encodeURIComponent(draftSlug)}`,
        {
          method: "PUT",
          body: JSON.stringify(getDraftPayload(draft)),
        }
      );

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

  const totalEpisodes = stories.length;
  const liveEpisodes = stories.filter(
    (story) =>
      story.status === "voting" || story.runoffStatus === "voting"
  ).length;
  const completedEpisodes = stories.filter(
    (story) => story.status === "completed"
  ).length;
  const draftEpisodes = stories.filter(
    (story) => story.status === "draft"
  ).length;

  const officialWinner = getOfficialWinner(selectedStory);

  const canCloseOriginalVoting =
    selectedStory?.status === "voting" &&
    selectedStory?.runoffStatus !== "voting";

  const canStartRunoff =
    selectedStory?.status === "completed" &&
    selectedStory?.runoffStatus !== "voting" &&
    !selectedStory?.runoffWinningChoiceId &&
    (selectedStory?.tiedChoiceIds || []).length > 1;

  const canCloseRunoff =
    selectedStory?.runoffStatus === "voting";

  const canGenerateNextEpisode =
    selectedStory?.status === "completed" &&
    selectedStory?.runoffStatus !== "voting" &&
    Boolean(officialWinner);

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
            onClick={() =>
              loadStories().catch((err) => setError(err.message))
            }
            disabled={busy}
          >
            ↻ Refresh stories
          </button>
        </div>

        {notice && (
          <p className="admin-alert admin-alert-success">{notice}</p>
        )}

        {error && (
          <p className="admin-alert admin-alert-error admin-alert-multiline">
            {error}
          </p>
        )}

        <section className="admin-stats">
          <article>
            <span>ALL EPISODES</span>
            <strong>{totalEpisodes}</strong>
          </article>

          <article>
            <span>LIVE VOTING</span>
            <strong>{liveEpisodes}</strong>
          </article>

          <article>
            <span>COMPLETED</span>
            <strong>{completedEpisodes}</strong>
          </article>

          <article>
            <span>DRAFTS</span>
            <strong>{draftEpisodes}</strong>
          </article>
        </section>

        <div className="admin-grid">
          <section className="admin-panel">
            <div className="admin-panel-heading">
              <div>
                <p className="admin-eyebrow">LIBRARY</p>
                <h2>Episodes</h2>
                <p className="admin-muted">
                  Select an episode to view its status and manage voting.
                </p>
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

                    <span
                      className={`admin-status status-${getStatusClass(item)}`}
                    >
                      {getStatusLabel(item)}
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
                      EPISODE {selectedStory.episode || "—"}
                    </p>
                    <h2>{selectedStory.title}</h2>
                    <p className="admin-muted">
                      {selectedStory.genre || "Uncategorised"} ·{" "}
                      {selectedStory.slug}
                    </p>
                  </div>

                  <span
                    className={`admin-status status-${getStatusClass(
                      selectedStory
                    )}`}
                  >
                    {getStatusLabel(selectedStory)}
                  </span>
                </div>

                <p className="admin-description">
                  {selectedStory.description || "No description available."}
                </p>

                <VoteResults
                  title="Original voting"
                  choices={selectedStory.choices || []}
                  winnerId={
                    selectedStory.runoffWinningChoiceId
                      ? null
                      : selectedStory.winningChoiceId
                  }
                />

                {selectedStory.runoffChoices?.length > 0 && (
                  <VoteResults
                    title="Runoff voting"
                    choices={selectedStory.runoffChoices}
                    winnerId={selectedStory.runoffWinningChoiceId}
                  />
                )}

                {officialWinner ? (
                  <div className="admin-winner">
                    <span>OFFICIAL STORY DIRECTION</span>
                    <strong>{officialWinner.title}</strong>
                    <p>
                      This is the community decision that should guide the
                      next episode.
                    </p>
                  </div>
                ) : selectedStory.status === "completed" ? (
                  <div className="admin-no-winner">
                    <strong>No official winner recorded yet.</strong>
                    <p>
                      Check the voting results or complete the runoff before
                      generating the next episode.
                    </p>
                  </div>
                ) : null}

                <div className="admin-actions">
                  {canCloseOriginalVoting && (
                    <button
                      className="admin-secondary"
                      disabled={busy}
                      onClick={() =>
                        performAction(
                          "Closing voting",
                          `/stories/${encodeURIComponent(
                            selectedStory.slug
                          )}/close-voting`
                        )
                      }
                    >
                      Close original voting
                    </button>
                  )}

                  {canStartRunoff && (
                    <button
                      className="admin-secondary"
                      disabled={busy}
                      onClick={() =>
                        performAction(
                          "Starting runoff",
                          `/stories/${encodeURIComponent(
                            selectedStory.slug
                          )}/runoff/start`
                        )
                      }
                    >
                      Start runoff
                    </button>
                  )}

                  {canCloseRunoff && (
                    <button
                      className="admin-primary"
                      disabled={busy}
                      onClick={() =>
                        performAction(
                          "Closing runoff",
                          `/stories/${encodeURIComponent(
                            selectedStory.slug
                          )}/runoff/close`
                        )
                      }
                    >
                      Close runoff
                    </button>
                  )}

                  {canGenerateNextEpisode && (
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
                    className="admin-secondary admin-open-draft"
                    disabled={busy}
                    onClick={() => openDraft(selectedStory.slug)}
                  >
                    Open this draft for review
                  </button>
                )}

                {selectedStory.status === "voting" && (
                  <p className="admin-help-text">
                    Voting is currently open. Close voting to determine the
                    community's official direction.
                  </p>
                )}

                {selectedStory.runoffStatus === "voting" && (
                  <p className="admin-help-text">
                    A runoff is in progress. Close the runoff to determine the
                    final community decision.
                  </p>
                )}
              </>
            ) : (
              <p className="admin-muted">
                Select an episode to manage it.
              </p>
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
                  Review the story carefully. It will not appear publicly
                  until you publish it.
                </p>
              </div>

              <span className="admin-status status-draft">DRAFT</span>
            </div>

            <div className="admin-editor-guideline">
              <strong>TWISTED SHORT STORY STANDARD</strong>
              <span>
                Aim for 100–180 words, with exactly 3 engaging choices.
              </span>
            </div>

            <label htmlFor="draft-title">Episode title</label>
            <input
              id="draft-title"
              value={draft.title || ""}
              onChange={(event) =>
                updateDraft("title", event.target.value)
              }
              maxLength={100}
            />

            <label htmlFor="draft-genre">Genre</label>
            <input
              id="draft-genre"
              value={draft.genre || ""}
              onChange={(event) =>
                updateDraft("genre", event.target.value)
              }
            />

            <label htmlFor="draft-description">Short description</label>
            <textarea
              id="draft-description"
              rows="3"
              value={draft.description || ""}
              onChange={(event) =>
                updateDraft("description", event.target.value)
              }
            />

            <div className="admin-content-label">
              <label htmlFor="draft-content">Story content</label>

              <span
                className={`admin-word-count ${
                  draftWordCount < MIN_EPISODE_WORDS ||
                  draftWordCount > MAX_EPISODE_WORDS
                    ? "word-count-warning"
                    : "word-count-valid"
                }`}
              >
                {draftWordCount} / {MAX_EPISODE_WORDS} words
              </span>
            </div>

            <textarea
              id="draft-content"
              className="admin-story-editor"
              rows="14"
              value={draft.content || ""}
              onChange={(event) =>
                updateDraft("content", event.target.value)
              }
              placeholder="The short story episode will appear here..."
            />

            <p className="admin-word-guidance">
              {draftWordCount < MIN_EPISODE_WORDS
                ? `Add ${MIN_EPISODE_WORDS - draftWordCount} more words to reach the minimum.`
                : draftWordCount > MAX_EPISODE_WORDS
                  ? `Remove ${draftWordCount - MAX_EPISODE_WORDS} words to meet the limit.`
                  : "Word count is within the agreed episode length."}
            </p>

            <div className="admin-choices-editor">
              <div className="admin-editor-subheading">
                <h3>Voting choices</h3>
                <span>
                  {(draft.choices || []).length} / 3 choices
                </span>
              </div>

              {(draft.choices || []).map((choice, index) => (
                <div className="admin-choice-edit-row" key={choice.id || index}>
                  <span className="admin-choice-number">
                    {String.fromCharCode(65 + index)}
                  </span>

                  <input
                    value={choice.title || ""}
                    onChange={(event) =>
                      updateChoice(index, event.target.value)
                    }
                    aria-label={`Choice ${index + 1}`}
                    placeholder={`Voting choice ${index + 1}`}
                  />
                </div>
              ))}
            </div>

            {draftValidationErrors.length > 0 && (
              <div className="admin-validation">
                <strong>Review required before publishing</strong>
                <ul>
                  {draftValidationErrors.map((validationError) => (
                    <li key={validationError}>{validationError}</li>
                  ))}
                </ul>
              </div>
            )}

            {draftValidationErrors.length === 0 && (
              <div className="admin-validation-success">
                <strong>Draft meets the publishing checks.</strong>
                <span>
                  You can save your changes or publish this episode.
                </span>
              </div>
            )}

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
                disabled={
                  busy ||
                  draftSaving ||
                  draftValidationErrors.length > 0
                }
              >
                {busy ? "Publishing..." : "Publish episode →"}
              </button>

              <button
                className="admin-text-button"
                onClick={() => {
                  setDraft(null);
                  setDraftSlug("");
                  setError("");
                  setNotice("");
                }}
                disabled={busy || draftSaving}
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