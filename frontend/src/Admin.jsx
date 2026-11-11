
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import "./Admin.css";

const API_URL = "http://localhost:5000/api";
const MIN_EPISODE_WORDS = 100;
const MAX_EPISODE_WORDS = 180;

const emptyNewStory = {
  title: "",
  genre: "Psychological Thriller",
  description: "",
  content: "",
  plannedEpisodes: 8,
  choices: ["", "", ""],
};

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "X-Twisted-Admin-Action": "1",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.message || `Request failed (${response.status}).`
    );
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
  if (story.runoffStatus === "voting") return "Runoff live";
  if (story.status === "completed") return "Completed";
  if (story.status === "voting") return "Live voting";
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
        <p className="admin-muted">
          No voting choices are available.
        </p>
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
                      <span className="admin-winner-inline">
                        {" "}· WINNER
                      </span>
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

  // NEW STORY FORM STATE
  const [showNewStory, setShowNewStory] = useState(false);
  const [newStory, setNewStory] = useState(emptyNewStory);
  const [creatingStory, setCreatingStory] = useState(false);

  const selectedStory = stories.find(
    (story) => story.slug === selectedSlug
  );

  // GROUP EPISODES BY SERIES
  const groupedStories = useMemo(() => {
    const groups = new Map();

    stories.forEach((story) => {
      const seriesKey = story.seriesSlug || story.slug;

      if (!groups.has(seriesKey)) {
        groups.set(seriesKey, []);
      }

      groups.get(seriesKey).push(story);
    });

    return Array.from(groups.entries()).map(
      ([seriesKey, episodes]) => {
        const sortedEpisodes = [...episodes].sort(
          (a, b) =>
            Number(a.episode || 0) - Number(b.episode || 0)
        );

        const firstEpisode =
          sortedEpisodes.find(
            (episode) => Number(episode.episode) === 1
          ) || sortedEpisodes[0];

        return {
          seriesKey,
          title: firstEpisode?.title || seriesKey,
          genre: firstEpisode?.genre || "Uncategorised",
          episodes: sortedEpisodes,
        };
      }
    );
  }, [stories]);

  // FIND THE SERIES BELONGING TO THE SELECTED EPISODE
  const selectedSeriesKey = selectedStory
    ? selectedStory.seriesSlug || selectedStory.slug
    : "";

  const selectedSeries = groupedStories.find(
    (series) => series.seriesKey === selectedSeriesKey
  );

  const selectedSeriesEpisodes = selectedSeries?.episodes || [];

  const draftWordCount = getWordCount(draft?.content || "");
  const draftValidationErrors = getDraftValidation(draft);

  const sortStories = (list) => {
    return [...list].sort((a, b) => {
      const seriesA = a.seriesSlug || a.slug;
      const seriesB = b.seriesSlug || b.slug;

      if (seriesA !== seriesB) {
        return seriesA.localeCompare(seriesB);
      }

      return Number(a.episode || 0) - Number(b.episode || 0);
    });
  };

  const loadStories = useCallback(async () => {
    const data = await apiRequest("/admin/stories");
    const list = sortStories(
      Array.isArray(data.stories) ? data.stories : []
    );

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

        const list = sortStories(
          Array.isArray(data.stories) ? data.stories : []
        );

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

  // SELECT A DIFFERENT SERIES
  function handleSeriesChange(seriesKey) {
    const series = groupedStories.find(
      (item) => item.seriesKey === seriesKey
    );

    if (!series || !series.episodes.length) return;

    setSelectedSlug(series.episodes[0].slug);
    setDraft(null);
    setDraftSlug("");
    setError("");
    setNotice("");
  }

  // SELECT A DIFFERENT EPISODE
  function handleEpisodeChange(slug) {
    setSelectedSlug(slug);
    setDraft(null);
    setDraftSlug("");
    setError("");
    setNotice("");
  }

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

  // CREATE NEW STORY

  function updateNewStory(field, value) {
    setNewStory((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateNewStoryChoice(index, value) {
    setNewStory((current) => {
      const choices = [...current.choices];
      choices[index] = value;

      return {
        ...current,
        choices,
      };
    });
  }

  async function handleCreateStory(event) {
    event.preventDefault();

    setError("");
    setNotice("");

    const {
      title,
      genre,
      description,
      content,
      plannedEpisodes,
      choices,
    } = newStory;

    if (
      !title.trim() ||
      !genre.trim() ||
      !description.trim() ||
      !content.trim()
    ) {
      setError(
        "Please complete all story details and opening episode content."
      );
      return;
    }

    if (
      !Number.isInteger(Number(plannedEpisodes)) ||
      Number(plannedEpisodes) < 1 ||
      Number(plannedEpisodes) > 50
    ) {
      setError("Planned episodes must be between 1 and 50.");
      return;
    }

    if (
      choices.length !== 3 ||
      choices.some((choice) => !choice.trim())
    ) {
      setError("Please provide exactly three voting choices.");
      return;
    }

    setCreatingStory(true);

    try {
      const data = await apiRequest("/admin/stories", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          genre: genre.trim(),
          description: description.trim(),
          content: content.trim(),
          plannedEpisodes: Number(plannedEpisodes),
          choices: choices.map((choice) => ({
            title: choice.trim(),
          })),
        }),
      });

      if (!data.story?.slug) {
        throw new Error("The server did not return the new story.");
      }

      const createdSlug = data.story.slug;

      setNewStory(emptyNewStory);
      setShowNewStory(false);
      setDraft(null);
      setDraftSlug("");

      await loadStories();

      // Select the newly created story.
      setSelectedSlug(createdSlug);

      setNotice(
        data.message ||
          "New story created successfully. Voting is now open."
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setCreatingStory(false);
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
        `/admin/stories/${encodeURIComponent(
          selectedStory.slug
        )}/episodes/draft`,
        { method: "POST" }
      );

      const generated = getStoryFromResponse(data);

      if (!generated || !generated.slug) {
        throw new Error(
          "The server generated a response, but no draft episode slug was returned."
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

      if (savedDraft?.slug) {
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
            <p className="admin-alert admin-alert-error">
              {loginError}
            </p>
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

  const seriesIsCompleted =
    selectedStory?.seriesCompleted ||
    Number(selectedStory?.episode || 1) >=
      Number(selectedStory?.plannedEpisodes || 8);

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
            disabled={busy || creatingStory}
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

          <div className="admin-heading-actions">
            <button
              className="admin-primary"
              onClick={() => {
                setShowNewStory((current) => !current);
                setError("");
                setNotice("");
                setDraft(null);
                setDraftSlug("");
              }}
              disabled={busy || creatingStory}
            >
              {showNewStory ? "Close form" : "+ Create new story"}
            </button>

            <button
              className="admin-secondary"
              onClick={() =>
                loadStories().catch((err) => setError(err.message))
              }
              disabled={busy || creatingStory}
            >
              ↻ Refresh stories
            </button>
          </div>
        </div>

        {notice && (
          <p className="admin-alert admin-alert-success">
            {notice}
          </p>
        )}

        {error && (
          <p className="admin-alert admin-alert-error admin-alert-multiline">
            {error}
          </p>
        )}

        {/* NEW STORY CREATION FORM */}

        {showNewStory && (
          <section className="admin-panel admin-new-story">
            <div className="admin-panel-heading">
              <div>
                <p className="admin-eyebrow">NEW SERIES</p>
                <h2>Create a new story</h2>

                <p className="admin-muted">
                  Start a completely independent TWISTED community story.
                </p>
              </div>

              <span className="admin-status status-voting">
                EPISODE 1
              </span>
            </div>

            <form onSubmit={handleCreateStory}>
              <div className="admin-new-story-grid">
                <div>
                  <label htmlFor="new-story-title">Story title</label>

                  <input
                    id="new-story-title"
                    value={newStory.title}
                    onChange={(event) =>
                      updateNewStory("title", event.target.value)
                    }
                    placeholder="e.g. THE LAST CALL"
                    maxLength={100}
                    required
                  />
                </div>

                <div>
                  <label htmlFor="new-story-genre">Genre</label>

                  <select
                    id="new-story-genre"
                    value={newStory.genre}
                    onChange={(event) =>
                      updateNewStory("genre", event.target.value)
                    }
                    required
                  >
                    <option>Psychological Thriller</option>
                    <option>Horror</option>
                    <option>Mystery</option>
                    <option>Science Fiction</option>
                    <option>Fantasy</option>
                    <option>Romance</option>
                    <option>Drama</option>
                    <option>Crime</option>
                    <option>Adventure</option>
                    <option>Comedy</option>
                    <option>Supernatural</option>
                    <option>Other</option>
                  </select>
                </div>
              </div>

              <label htmlFor="new-story-description">
                Story description
              </label>

              <textarea
                id="new-story-description"
                rows="3"
                value={newStory.description}
                onChange={(event) =>
                  updateNewStory("description", event.target.value)
                }
                placeholder="Write a short introduction that makes readers curious..."
                maxLength={1000}
                required
              />

              <div className="admin-new-story-grid">
                <div>
                  <label htmlFor="new-story-episodes">
                    Planned number of episodes
                  </label>

                  <input
                    id="new-story-episodes"
                    type="number"
                    min="1"
                    max="50"
                    value={newStory.plannedEpisodes}
                    onChange={(event) =>
                      updateNewStory(
                        "plannedEpisodes",
                        event.target.value
                      )
                    }
                    required
                  />

                  <p className="admin-field-help">
                    Choose between 1 and 50 episodes. Default: 8.
                  </p>
                </div>

                <div className="admin-series-preview">
                  <span>SERIES LENGTH</span>
                  <strong>
                    {newStory.plannedEpisodes || 0} episodes
                  </strong>
                  <small>Episode 1 will open for voting.</small>
                </div>
              </div>

              <label htmlFor="new-story-content">
                Opening episode content
              </label>

              <textarea
                id="new-story-content"
                className="admin-story-editor"
                rows="12"
                value={newStory.content}
                onChange={(event) =>
                  updateNewStory("content", event.target.value)
                }
                placeholder="Write the opening episode here..."
                required
              />

              <div className="admin-content-label">
                <span className="admin-muted">
                  Opening episode word count
                </span>

                <span className="admin-word-count">
                  {getWordCount(newStory.content)} words
                </span>
              </div>

              <div className="admin-choices-editor">
                <div className="admin-editor-subheading">
                  <h3>Community voting choices</h3>
                  <span>Exactly 3 required</span>
                </div>

                {newStory.choices.map((choice, index) => (
                  <div className="admin-choice-edit-row" key={index}>
                    <span className="admin-choice-number">
                      {String.fromCharCode(65 + index)}
                    </span>

                    <input
                      value={choice}
                      onChange={(event) =>
                        updateNewStoryChoice(index, event.target.value)
                      }
                      placeholder={`Voting choice ${index + 1}`}
                      maxLength={150}
                      required
                    />
                  </div>
                ))}
              </div>

              <div className="admin-new-story-notice">
                <strong>Before creating your story</strong>

                <p>
                  Episode 1 will be published immediately. Readers will be
                  able to vote on the three choices. This story will have its
                  own independent voting and episode history.
                </p>
              </div>

              <div className="admin-actions admin-publish-actions">
                <button
                  type="submit"
                  className="admin-primary"
                  disabled={creatingStory || busy}
                >
                  {creatingStory
                    ? "Creating story..."
                    : "Create story and open voting →"}
                </button>

                <button
                  type="button"
                  className="admin-secondary"
                  onClick={() => {
                    setShowNewStory(false);
                    setNewStory(emptyNewStory);
                  }}
                  disabled={creatingStory}
                >
                  Cancel
                </button>
              </div>
            </form>
          </section>
        )}

        {/* ADMIN STATISTICS */}

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

        {/* MAIN ADMIN GRID */}

        <div className="admin-grid">
          <section className="admin-panel">
            <div className="admin-panel-heading">
              <div>
                <p className="admin-eyebrow">LIBRARY</p>
                <h2>Episode management</h2>

                <p className="admin-muted">
                  Choose a story series and then select an episode to manage.
                </p>
              </div>
            </div>

            {stories.length === 0 ? (
              <p className="admin-muted">No episodes found.</p>
            ) : (
              <div className="admin-library-selectors">
                <div className="admin-library-selector">
                  <label htmlFor="admin-series-select">
                    SELECT A STORY
                  </label>

                  <select
                    id="admin-series-select"
                    className="admin-library-select"
                    value={selectedSeriesKey}
                    onChange={(event) =>
                      handleSeriesChange(event.target.value)
                    }
                  >
                    {groupedStories.map((series) => (
                      <option
                        key={series.seriesKey}
                        value={series.seriesKey}
                      >
                        {series.title} · {series.genre}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="admin-library-selector">
                  <label htmlFor="admin-episode-select">
                    SELECT AN EPISODE
                  </label>

                  <select
                    id="admin-episode-select"
                    className="admin-library-select"
                    value={selectedSlug}
                    onChange={(event) =>
                      handleEpisodeChange(event.target.value)
                    }
                    disabled={selectedSeriesEpisodes.length === 0}
                  >
                    {selectedSeriesEpisodes.map((episode) => (
                      <option
                        key={episode.slug}
                        value={episode.slug}
                      >
                        Episode {episode.episode || "—"} — {episode.title} (
                        {getStatusLabel(episode)})
                      </option>
                    ))}
                  </select>
                </div>

                {selectedSeries && (
                  <div className="admin-library-summary">
                    <div>
                      <span>SELECTED SERIES</span>
                      <strong>{selectedSeries.title}</strong>
                    </div>

                    <span className="admin-series-count">
                      {selectedSeries.episodes.length}{" "}
                      {selectedSeries.episodes.length === 1
                        ? "episode"
                        : "episodes"}
                    </span>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* SELECTED EPISODE DETAILS */}

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

                <div className="admin-series-information">
                  <span>SERIES PROGRESS</span>

                  <strong>
                    Episode {selectedStory.episode || 1} of{" "}
                    {selectedStory.plannedEpisodes || 8}
                  </strong>

                  {seriesIsCompleted && (
                    <small>Series episode limit reached.</small>
                  )}
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

                  {canGenerateNextEpisode && !seriesIsCompleted && (
                    <button
                      className="admin-primary"
                      disabled={busy}
                      onClick={generateEpisode}
                    >
                      ✦ Generate next episode with AI
                    </button>
                  )}
                </div>

                {seriesIsCompleted && (
                  <div className="admin-series-finished">
                    <strong>
                      This series has reached its planned ending.
                    </strong>

                    <p>
                      You can create another independent story using the
                      Create New Story button above.
                    </p>
                  </div>
                )}

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

        {/* DRAFT EDITOR */}

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

              <span className="admin-status status-draft">
                DRAFT
              </span>
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

            <label htmlFor="draft-description">
              Short description
            </label>

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
                ? `Add ${
                    MIN_EPISODE_WORDS - draftWordCount
                  } more words to reach the minimum.`
                : draftWordCount > MAX_EPISODE_WORDS
                  ? `Remove ${
                      draftWordCount - MAX_EPISODE_WORDS
                    } words to meet the limit.`
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
                <div
                  className="admin-choice-edit-row"
                  key={choice.id || index}
                >
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
                    <li key={validationError}>
                      {validationError}
                    </li>
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
