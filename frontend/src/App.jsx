
import { useEffect, useState } from "react";
import "./App.css";
import Admin from "./Admin";
import ReaderAccount from "./ReaderAccount";

const API_URL = "http://localhost:5000/api";
const SERIES_SLUG = "the-message";

function getChoiceLetter(index) {
  return String.fromCharCode(65 + index);
}

function sortEpisodes(episodes) {
  return [...episodes].sort(
    (a, b) => Number(a.episode || 0) - Number(b.episode || 0)
  );
}

function getReadingTime(content = "") {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

function getEpisodeStatus(story) {
  if (!story) {
    return { label: "LOADING", className: "status-loading" };
  }

  if (story.runoffStatus === "voting") {
    return { label: "RUNOFF LIVE", className: "status-runoff" };
  }

  if (story.status === "completed") {
    return { label: "COMPLETED", className: "status-completed" };
  }

  if (story.status === "voting") {
    return { label: "LIVE", className: "status-live" };
  }

  return { label: "AWAITING VOTES", className: "status-awaiting" };
}

function PublicApp() {
  const [stories, setStories] = useState([]);
  const [selectedSlug, setSelectedSlug] = useState("");
  const [story, setStory] = useState(null);

  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);
  const [votedRound, setVotedRound] = useState(null);

  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [voteHistoryLoading, setVoteHistoryLoading] = useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [listError, setListError] = useState("");

  const runoffActive = story?.runoffStatus === "voting";
  const activeRound = runoffActive ? "runoff" : "original";

  const activeChoices = runoffActive
    ? story?.runoffChoices || []
    : story?.choices || [];

  const totalVotes = activeChoices.reduce(
    (total, choice) => total + (Number(choice.votes) || 0),
    0
  );

  const originalTotalVotes = (story?.choices || []).reduce(
    (total, choice) => total + (Number(choice.votes) || 0),
    0
  );

  const runoffTotalVotes = (story?.runoffChoices || []).reduce(
    (total, choice) => total + (Number(choice.votes) || 0),
    0
  );

  const officialWinnerId =
    story?.runoffStatus === "completed"
      ? story?.runoffWinningChoiceId
      : story?.winningChoiceId;

  const allChoices = [
    ...(story?.choices || []),
    ...(story?.runoffChoices || []),
  ];

  const officialWinner = allChoices.find(
    (choice) => choice.id === officialWinnerId
  );

  const votingClosed =
    story?.status === "completed" && !runoffActive;

  const alreadyVotedThisRound =
    hasVoted && votedRound === activeRound;

  // Readers may select a choice before signing in.
  // They must authenticate before submitting the vote.
  const canSelectChoice =
    authChecked &&
    !loading &&
    !submitting &&
    !voteHistoryLoading &&
    !votingClosed &&
    !alreadyVotedThisRound &&
    activeChoices.length > 0;

  const canVote =
    Boolean(user) &&
    canSelectChoice;

  const readerId = user?._id || user?.id || "";

  const currentEpisodeIndex = stories.findIndex(
    (episode) => episode.slug === selectedSlug
  );

  const previousEpisode =
    currentEpisodeIndex > 0
      ? stories[currentEpisodeIndex - 1]
      : null;

  const nextEpisode =
    currentEpisodeIndex >= 0 &&
    currentEpisodeIndex < stories.length - 1
      ? stories[currentEpisodeIndex + 1]
      : null;

  const currentEpisodeNumber =
    story?.episode || currentEpisodeIndex + 1 || 1;

  const totalEpisodes = stories.length;

  const episodeProgress =
    totalEpisodes > 0
      ? ((currentEpisodeIndex + 1) / totalEpisodes) * 100
      : 0;

  const episodeStatus = getEpisodeStatus(story);

  const storyParagraphs = story?.content
    ? story.content
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
    : [];

  const readingTime = getReadingTime(story?.content || "");

  // Check whether the reader already has an authenticated session.
  useEffect(() => {
    let cancelled = false;

    async function checkReaderSession() {
      try {
        const response = await fetch(`${API_URL}/auth/me`, {
          method: "GET",
          credentials: "include",
        });

        const data = await response.json();

        if (cancelled) return;

        if (response.ok && data.user) {
          setUser(data.user);
        } else {
          setUser(null);
        }
      } catch {
        if (!cancelled) {
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setAuthChecked(true);
        }
      }
    }

    checkReaderSession();

    return () => {
      cancelled = true;
    };
  }, []);

  // Load the reader's voting history for the selected episode.
  useEffect(() => {
    let cancelled = false;

    async function loadReaderVoteStatus() {
      if (!readerId || !selectedSlug) {
        setHasVoted(false);
        setVotedRound(null);
        setVoteHistoryLoading(false);
        return;
      }

      try {
        setVoteHistoryLoading(true);

        const response = await fetch(
          `${API_URL}/auth/voting-history`,
          {
            method: "GET",
            credentials: "include",
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.message || "Could not load your voting history."
          );
        }

        if (cancelled) return;

        const history = Array.isArray(data.history)
          ? data.history
          : [];

        const episodeVotes = history.filter(
          (item) => item.story?.slug === selectedSlug
        );

        // Prefer the vote in the currently active round.
        // If only an original vote exists during a runoff,
        // the reader should still be allowed to vote in the runoff.
        const matchingVote =
          episodeVotes.find((item) => item.round === activeRound) ||
          episodeVotes[0];

        setHasVoted(Boolean(matchingVote));
        setVotedRound(matchingVote?.round || null);
      } catch {
        if (!cancelled) {
          setHasVoted(false);
          setVotedRound(null);
        }
      } finally {
        if (!cancelled) {
          setVoteHistoryLoading(false);
        }
      }
    }

    if (authChecked) {
      loadReaderVoteStatus();
    }

    return () => {
      cancelled = true;
    };
  }, [readerId, selectedSlug, activeRound, authChecked]);

  // Load all published episodes.
  useEffect(() => {
    let cancelled = false;

    async function loadEpisodes() {
      try {
        const response = await fetch(`${API_URL}/stories`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.message || "Could not load published episodes."
          );
        }

        const episodeList = Array.isArray(data.stories)
          ? data.stories
          : Array.isArray(data)
            ? data
            : [];

        let publishedEpisodes = episodeList.filter(
          (episode) =>
            episode.status !== "draft" &&
            (
              episode.seriesSlug === SERIES_SLUG ||
              episode.slug === SERIES_SLUG ||
              episode.previousEpisodeSlug === SERIES_SLUG
            )
        );

        const episodeOneExists = publishedEpisodes.some(
          (episode) => episode.slug === SERIES_SLUG
        );

        if (!episodeOneExists) {
          try {
            const firstEpisodeResponse = await fetch(
              `${API_URL}/stories/${SERIES_SLUG}`
            );

            const firstEpisodeData =
              await firstEpisodeResponse.json();

            if (
              firstEpisodeResponse.ok &&
              firstEpisodeData.story &&
              firstEpisodeData.story.status !== "draft"
            ) {
              publishedEpisodes.push(firstEpisodeData.story);
            }
          } catch {
            // Continue with the episodes already retrieved.
          }
        }

        if (cancelled) return;

        const uniqueEpisodes = Array.from(
          new Map(
            publishedEpisodes.map((episode) => [
              episode.slug,
              episode,
            ])
          ).values()
        );

        const sortedEpisodes = sortEpisodes(uniqueEpisodes);

        setStories(sortedEpisodes);
        setListError("");

        if (sortedEpisodes.length === 0) {
          setListError("No published episodes are available yet.");
          return;
        }

        setSelectedSlug((currentSlug) => {
          if (
            currentSlug &&
            sortedEpisodes.some(
              (episode) => episode.slug === currentSlug
            )
          ) {
            return currentSlug;
          }

          return sortedEpisodes[sortedEpisodes.length - 1].slug;
        });
      } catch (err) {
        if (!cancelled) {
          setListError(
            err.message || "Could not load the episode list."
          );
        }
      }
    }

    loadEpisodes();

    const intervalId = window.setInterval(loadEpisodes, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  // Load the selected episode.
  useEffect(() => {
    if (!selectedSlug) return;

    let cancelled = false;

    async function loadStory() {
      try {
        setLoading(true);
        setError("");
        setNotice("");
        setSelected("");

        const response = await fetch(
          `${API_URL}/stories/${selectedSlug}`
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.message || "Could not load this episode."
          );
        }

        if (!data.story) {
          throw new Error("This episode could not be found.");
        }

        if (cancelled) return;

        setStory(data.story);
      } catch (err) {
        if (!cancelled) {
          setError(
            err.message || "Could not connect to TWISTED."
          );
          setStory(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadStory();

    return () => {
      cancelled = true;
    };
  }, [selectedSlug]);

  // Refresh vote totals every five seconds.
  useEffect(() => {
    if (!selectedSlug) return;

    let cancelled = false;

    async function refreshVoteTotals() {
      try {
        const response = await fetch(
          `${API_URL}/stories/${selectedSlug}`
        );

        if (!response.ok) return;

        const data = await response.json();

        if (!data.story || cancelled) return;

        setStory(data.story);

        setSelected((currentSelected) => {
          const choices =
            data.story.runoffStatus === "voting"
              ? data.story.runoffChoices || []
              : data.story.choices || [];

          return choices.some(
            (choice) => choice.id === currentSelected
          )
            ? currentSelected
            : "";
        });
      } catch {
        // Keep the last successfully loaded episode.
      }
    }

    const intervalId = window.setInterval(
      refreshVoteTotals,
      5000
    );

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [selectedSlug]);

  // Clear selection when the voting round changes.
  useEffect(() => {
    setSelected("");
    setNotice("");
  }, [activeRound]);

  function changeEpisode(slug) {
    if (!slug) return;

    setSelectedSlug(slug);
    setSelected("");

    document.getElementById("story")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  async function handleVote() {
    if (!user) {
      setAuthOpen(true);
      return;
    }

    if (!selected || !canVote || !story) return;

    try {
      setSubmitting(true);
      setError("");
      setNotice("");

      const response = await fetch(
        `${API_URL}/stories/${selectedSlug}/vote`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          // The backend identifies the voter from the session cookie.
          body: JSON.stringify({
            choiceId: selected,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          setUser(null);
          setAuthOpen(true);
          throw new Error("Please log in to vote.");
        }

        if (response.status === 409) {
          setHasVoted(true);
          setVotedRound(activeRound);
        }

        throw new Error(
          data.message || "Your vote could not be recorded."
        );
      }

      if (data.story) {
        setStory(data.story);
      }

      setHasVoted(true);

      const recordedRound = data.round || activeRound;

      setVotedRound(recordedRound);

      setNotice(
        recordedRound === "runoff"
          ? "Your runoff vote has been recorded. The community is choosing the final direction."
          : "Your vote has been recorded. The story is in your hands."
      );

      setSelected("");
    } catch (err) {
      setError(
        err.message ||
          "Something went wrong while submitting your vote."
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleEpisodeChange(event) {
    changeEpisode(event.target.value);
  }

  return (
    <main>
      <nav className="navbar">
        <a className="brand" href="#home">
          TWISTED<span>.</span>
        </a>

        <div className="nav-links">
          <a href="#story">The Story</a>
          <a href="#how-it-works">How It Works</a>
        </div>

        <div className="nav-account-actions">
          <a className="nav-button" href="#story">
            Enter the story <span>↗</span>
          </a>

          <ReaderAccount
            user={user}
            onUserChange={setUser}
            isOpen={authOpen}
            onOpen={() => setAuthOpen(true)}
            onClose={() => setAuthOpen(false)}
          />
        </div>
      </nav>

      <section className="hero" id="home">
        <div className="hero-content">
          <p className="eyebrow">
            ONE STORY. MILLIONS OF POSSIBILITIES.
          </p>

          <h1>
            YOUR CHOICE.
            <br />
            YOUR <span>CONSEQUENCES.</span>
          </h1>

          <p className="hero-description">
            Every decision changes what happens next. Read the
            story, make your choice and discover what the community
            decides.
          </p>

          <a className="primary-button" href="#story">
            Enter the story <span>↓</span>
          </a>

          <p className="hero-note">
            THE STORY IS SHARED. THE CONSEQUENCES ARE REAL.
          </p>
        </div>

        <div className="hero-art">
          <div className="hero-art-glow" />

          <div className="door">
            <div className="door-panel" />
            <div className="door-handle" />
          </div>

          <div className="art-label">
            <span>CASE FILE 001</span>
            <strong>THE MESSAGE</strong>
            <span>11:47 PM · UNKNOWN SENDER</span>
          </div>
        </div>
      </section>

      <section className="story-section" id="story">
        <div className="story-heading">
          <div>
            <p className="eyebrow">ENTER THE TWISTED UNIVERSE</p>
            <h2>THE MESSAGE</h2>
            <p className="story-heading-description">
              One story. Every episode shaped by the community.
            </p>
          </div>

          <div className="series-tag">
            <span className="status-dot" />
            INTERACTIVE SERIES
          </div>
        </div>

        <div className="episode-toolbar">
          <div className="episode-navigation">
            <label htmlFor="episode-select">
              SELECT AN EPISODE
            </label>

            <select
              id="episode-select"
              className="episode-selector"
              value={selectedSlug}
              onChange={handleEpisodeChange}
              disabled={stories.length === 0}
            >
              {stories.map((episode) => (
                <option key={episode.slug} value={episode.slug}>
                  Episode {episode.episode}: {episode.title}
                </option>
              ))}
            </select>
          </div>

          {story && (
            <div className="reading-meta">
              <span>EPISODE {currentEpisodeNumber}</span>
              <span className="meta-divider">·</span>
              <span>{readingTime} MIN READ</span>
            </div>
          )}
        </div>

        {story && totalEpisodes > 0 && currentEpisodeIndex >= 0 && (
          <div className="episode-progress">
            <div className="episode-progress-labels">
              <span>YOUR JOURNEY</span>
              <span>
                EPISODE {currentEpisodeIndex + 1} OF {totalEpisodes}
              </span>
            </div>

            <div
              className="episode-progress-track"
              role="progressbar"
              aria-label="Episode progress"
              aria-valuemin={0}
              aria-valuemax={totalEpisodes}
              aria-valuenow={currentEpisodeIndex + 1}
            >
              <span
                className="episode-progress-fill"
                style={{ width: `${episodeProgress}%` }}
              />
            </div>
          </div>
        )}

        {listError && (
          <p className="notice" role="alert">
            {listError}
          </p>
        )}

        <div className="story-layout">
          <article className="story-card">
            {loading ? (
              <div className="loading-state">
                <span className="loading-spinner" />
                <p>Opening the story...</p>
              </div>
            ) : story ? (
              <>
                <div className="story-card-top">
                  <div>
                    <p className="story-time">
                      CHAPTER {story.episode}
                    </p>
                    <h3 className="story-card-title">
                      {story.title}
                    </h3>
                  </div>

                  <span
                    className={`story-status ${episodeStatus.className}`}
                  >
                    {episodeStatus.label}
                  </span>
                </div>

                {story.description && (
                  <p className="episode-description">
                    {story.description}
                  </p>
                )}

                <div className="story-divider" />

                <div className="story-content">
                  {storyParagraphs.length > 0 ? (
                    storyParagraphs.map((paragraph, index) => (
                      <p key={index}>{paragraph}</p>
                    ))
                  ) : (
                    <p>
                      The story content is not available yet.
                    </p>
                  )}
                </div>

                <div className="story-ending">
                  <span>THE STORY CONTINUES...</span>
                  <span>YOUR DECISION MATTERS</span>
                </div>

                <div className="episode-navigation-buttons">
                  <button
                    type="button"
                    className="episode-nav-button"
                    disabled={!previousEpisode}
                    onClick={() =>
                      previousEpisode &&
                      changeEpisode(previousEpisode.slug)
                    }
                  >
                    <span>← PREVIOUS EPISODE</span>
                    <strong>
                      {previousEpisode
                        ? `Episode ${previousEpisode.episode}: ${previousEpisode.title}`
                        : "This is the first episode"}
                    </strong>
                  </button>

                  <button
                    type="button"
                    className="episode-nav-button next"
                    disabled={!nextEpisode}
                    onClick={() =>
                      nextEpisode && changeEpisode(nextEpisode.slug)
                    }
                  >
                    <span>NEXT EPISODE →</span>
                    <strong>
                      {nextEpisode
                        ? `Episode ${nextEpisode.episode}: ${nextEpisode.title}`
                        : "You're at the latest episode"}
                    </strong>
                  </button>
                </div>
              </>
            ) : (
              <p>This episode could not be loaded.</p>
            )}
          </article>

          <aside className="vote-panel">
            <div className="vote-panel-heading">
              <p className="eyebrow">COMMUNITY DECISION</p>

              <span
                className={`vote-live-indicator ${episodeStatus.className}`}
              >
                <span className="status-dot" />
                {episodeStatus.label}
              </span>
            </div>

            <h3>
              {runoffActive
                ? "The final decision."
                : "What happens next?"}
            </h3>

            <p className="muted">
              {runoffActive
                ? "The original vote ended in a tie. Cast your runoff vote to help decide the official story direction."
                : "Choose the direction you want the story to take. The community decides which choice becomes official."}
            </p>

            {loading && (
              <p className="notice">
                Loading story and votes...
              </p>
            )}

            {error && (
              <p className="notice" role="alert">
                {error}
              </p>
            )}

            {!loading && story && (
              <>
                {runoffActive && (
                  <div className="runoff-results">
                    <strong>RUNOFF VOTING</strong>
                    <p>
                      The original vote ended in a tie. The community
                      is choosing between the tied directions.
                    </p>
                    <p>
                      Original round:{" "}
                      {originalTotalVotes.toLocaleString()} votes
                    </p>
                  </div>
                )}

                <div className="vote-summary">
                  <div>
                    <strong>
                      {totalVotes.toLocaleString()}
                    </strong>
                    <span>
                      {totalVotes === 1 ? " VOTE" : " VOTES"}
                    </span>
                  </div>

                  <small>
                    {runoffActive
                      ? "RUNOFF ROUND"
                      : "COMMUNITY TOTAL"}
                  </small>
                </div>

                {officialWinner && (
                  <div className="official-result">
                    <p className="eyebrow">
                      OFFICIAL STORY DIRECTION
                    </p>
                    <h3>{officialWinner.title}</h3>
                    <p>
                      The community's winning choice has been confirmed.
                    </p>
                  </div>
                )}

                {votingClosed && !officialWinner && (
                  <div className="official-result tie-result">
                    <p className="eyebrow">VOTING CLOSED</p>
                    <h3>
                      {story.runoffStatus === "completed" &&
                      (story.runoffTiedChoiceIds || []).length > 0
                        ? "The runoff ended in a tie."
                        : "The vote has ended in a tie."}
                    </h3>
                    <p>
                      The official story direction has not been selected yet.
                    </p>
                  </div>
                )}

                <div className="choices">
                  {activeChoices.map((choice, index) => {
                    const percentage =
                      totalVotes > 0
                        ? Math.round(
                            ((Number(choice.votes) || 0) /
                              totalVotes) *
                              100
                          )
                        : 0;

                    const isWinner =
                      choice.id === officialWinnerId;

                    return (
                      <button
                        type="button"
                        key={choice.id}
                        className={`choice ${
                          selected === choice.id ? "selected" : ""
                        } ${isWinner ? "winning-choice" : ""}`}
                        onClick={() => {
                          if (!canSelectChoice) return;

                          setSelected(choice.id);
                          setNotice("");
                          setError("");
                        }}
                        disabled={!canSelectChoice}
                        aria-pressed={selected === choice.id}
                      >
                        <span className="choice-letter">
                          {getChoiceLetter(index)}
                        </span>

                        <span className="choice-copy">
                          <strong>
                            {choice.title}
                            {isWinner ? " — WINNER" : ""}
                          </strong>

                          <small>
                            {(Number(choice.votes) || 0).toLocaleString()}{" "}
                            {(Number(choice.votes) || 0) === 1
                              ? "vote"
                              : "votes"}{" "}
                            · {percentage}%
                          </small>

                          <span
                            className="vote-bar"
                            aria-label={`${percentage}% of votes`}
                          >
                            <span
                              className="vote-bar-fill"
                              style={{ width: `${percentage}%` }}
                            />
                          </span>
                        </span>

                        <span className="choice-arrow">↗</span>
                      </button>
                    );
                  })}
                </div>

                {alreadyVotedThisRound ? (
                  <p className="notice">
                    You've already voted in this round using your account.
                  </p>
                ) : votingClosed ? (
                  <p className="notice">
                    Voting is closed. The result is shown above.
                  </p>
                ) : !authChecked ? (
                  <p className="notice">
                    Checking your reader account...
                  </p>
                ) : !user ? (
                  <>
                    <button
                      type="button"
                      className="primary-button vote-button"
                      disabled={!selected}
                      onClick={() => setAuthOpen(true)}
                    >
                      Log in to vote →
                    </button>

                    <p className="notice">
                      Choose an option, then log in or create an account
                      to submit your vote.
                    </p>
                  </>
                ) : voteHistoryLoading ? (
                  <p className="notice">
                    Checking your voting history...
                  </p>
                ) : canVote ? (
                  <button
                    type="button"
                    className="primary-button vote-button"
                    disabled={!selected || submitting}
                    onClick={handleVote}
                  >
                    {submitting
                      ? "Submitting vote..."
                      : runoffActive
                        ? "Cast your runoff vote →"
                        : "Cast your vote →"}
                  </button>
                ) : activeChoices.length === 0 ? (
                  <p className="notice">
                    There are currently no choices available for this voting round.
                  </p>
                ) : null}

                {notice && (
                  <p className="notice success-notice" role="status">
                    {notice}
                  </p>
                )}

                {!runoffActive &&
                  story.runoffStatus === "completed" && (
                    <div className="runoff-results">
                      <strong>FINAL VOTING TOTALS</strong>
                      <p>
                        Original round:{" "}
                        {originalTotalVotes.toLocaleString()} votes
                      </p>
                      <p>
                        Runoff round:{" "}
                        {runoffTotalVotes.toLocaleString()} votes
                      </p>
                    </div>
                  )}

                <p className="vote-footer">
                  Every vote helps shape the next official episode.
                </p>
              </>
            )}
          </aside>
        </div>
      </section>

      <section className="how-section" id="how-it-works">
        <p className="eyebrow">YOU ARE PART OF THE PLOT</p>
        <h2>THE CROWD DECIDES.</h2>

        <div className="steps">
          <article>
            <span>01</span>
            <h3>Read</h3>
            <p>Discover what is at stake.</p>
          </article>

          <article>
            <span>02</span>
            <h3>Vote</h3>
            <p>
              Choose the action you want the character to take.
            </p>
          </article>

          <article>
            <span>03</span>
            <h3>Discover</h3>
            <p>
              The winning choice shapes the next episode.
            </p>
          </article>
        </div>
      </section>

      <footer className="footer">
        <a className="brand" href="#home">
          TWISTED<span>.</span>
        </a>

        <p>One story. Countless ways to ruin everything.</p>

        <span>© {new Date().getFullYear()} TWISTED</span>
      </footer>
    </main>
  );
}

export default function App() {
  const currentPath =
    window.location.pathname.replace(/\/+$/, "") || "/";

  if (currentPath === "/admin") {
    return <Admin />;
  }

  return <PublicApp />;
}
