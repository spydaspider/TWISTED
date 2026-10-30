
import { useEffect, useState } from "react";
import "./App.css";

const API_URL = "http://localhost:5000/api";
const SERIES_SLUG = "the-message";

function getVoterId() {
  const storageKey = "twisted-voter-id";

  let voterId = localStorage.getItem(storageKey);

  if (!voterId) {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      voterId = crypto.randomUUID();
    } else {
      voterId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }

    localStorage.setItem(storageKey, voterId);
  }

  return voterId;
}

function getSavedVote(slug) {
  try {
    const saved = localStorage.getItem(`twisted-voted-${slug}`);

    if (!saved) return null;

    if (saved === "true") {
      return { round: "original" };
    }

    return JSON.parse(saved);
  } catch {
    return null;
  }
}

function saveVote(slug, round) {
  localStorage.setItem(
    `twisted-voted-${slug}`,
    JSON.stringify({ round })
  );
}

function getChoiceLetter(index) {
  return String.fromCharCode(65 + index);
}

function getChoiceDescription(index) {
  const descriptions = [
    "This is one possible direction for the story.",
    "Your decision could change everything.",
    "The community will decide what happens next.",
    "Choose the path you want the story to follow.",
  ];

  return descriptions[index] || descriptions[0];
}

function sortEpisodes(episodes) {
  return [...episodes].sort(
    (a, b) => Number(a.episode || 0) - Number(b.episode || 0)
  );
}

export default function App() {
  const [stories, setStories] = useState([]);
  const [selectedSlug, setSelectedSlug] = useState("");
  const [story, setStory] = useState(null);

  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);
  const [votedRound, setVotedRound] = useState(null);

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

  const canVote =
    !loading &&
    !submitting &&
    !votingClosed &&
    !alreadyVotedThisRound &&
    activeChoices.length > 0;

  // Load all published episodes, including the original Episode 1.
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

        // Episode 1 may not have seriesSlug because it was
        // created before the episode-series system existed.
        let publishedEpisodes = episodeList.filter(
          (episode) =>
            episode.status !== "draft" &&
            (
              episode.seriesSlug === SERIES_SLUG ||
              episode.slug === SERIES_SLUG ||
              episode.previousEpisodeSlug === SERIES_SLUG
            )
        );

        // If Episode 1 is missing from the list, fetch it directly.
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
            // Continue with episodes already retrieved.
          }
        }

        if (cancelled) return;

        // Remove duplicates and sort episodes in order.
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

          // Initially select the latest published episode.
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

        const savedVote = getSavedVote(selectedSlug);

        setHasVoted(Boolean(savedVote));
        setVotedRound(savedVote?.round || null);
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

  async function handleVote() {
    if (!selected || !canVote || !story) return;

    try {
      setSubmitting(true);
      setError("");
      setNotice("");

      const voterId = getVoterId();

      const response = await fetch(
        `${API_URL}/stories/${selectedSlug}/vote`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            choiceId: selected,
            voterId,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          setHasVoted(true);
          setVotedRound(activeRound);
          saveVote(selectedSlug, activeRound);
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
      saveVote(selectedSlug, recordedRound);

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
    setSelectedSlug(event.target.value);
  }

  const storyParagraphs = story?.content
    ? story.content.split(/\n\s*\n/)
    : [];

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

        <a className="nav-button" href="#story">
          Enter the story ↗
        </a>
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
            Every decision changes what happens next. Vote with
            everyone else and watch the story take a turn nobody
            can take back.
          </p>

          <a className="primary-button" href="#story">
            Make your choice ↓
          </a>

          <p className="hero-note">
            THE STORY IS SHARED. THE CONSEQUENCES ARE REAL.
          </p>
        </div>

        <div className="hero-art">
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
        <div className="eyebrow">
          THE MESSAGE — PSYCHOLOGICAL THRILLER
        </div>

        <h2>{story?.title || "THE MESSAGE"}</h2>

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

        {listError && (
          <p className="notice" role="alert">
            {listError}
          </p>
        )}

        <div className="story-layout">
          <article className="story-card">
            {loading ? (
              <p>Loading episode...</p>
            ) : story ? (
              <>
                <p className="story-time">
                  EPISODE {story.episode}
                </p>

                {story.description && (
                  <p className="episode-description">
                    {story.description}
                  </p>
                )}

                {storyParagraphs.length > 0 ? (
                  storyParagraphs.map((paragraph, index) => (
                    <p key={index}>{paragraph}</p>
                  ))
                ) : (
                  <>
                    <p>
                      You are home alone when your phone lights up.
                    </p>

                    <div className="message-box">
                      <small>UNKNOWN NUMBER</small>
                      <p>I'm you. Three days from now.</p>
                    </div>

                    <p>
                      You stare at the screen. Another message arrives.
                    </p>

                    <div className="message-box warning">
                      <p>
                        Whatever you do, don't open your bedroom door.
                      </p>
                    </div>

                    <p>
                      Before you can respond, three slow knocks echo
                      through the house.
                    </p>
                  </>
                )}

                <h3>What happens next?</h3>
              </>
            ) : (
              <p>This episode could not be loaded.</p>
            )}
          </article>

          <aside className="vote-panel">
            <p className="eyebrow">COMMUNITY DECISION</p>

            <h3>
              {runoffActive
                ? "The final decision."
                : "Choose what happens next."}
            </h3>

            <p className="muted">
              {runoffActive
                ? "The original vote ended in a tie. Cast your runoff vote to help decide the official story direction."
                : "Your choice counts toward the community's decision about the next official episode."}
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
                  <strong>
                    {totalVotes.toLocaleString()}{" "}
                    {totalVotes === 1 ? "vote" : "votes"}
                  </strong>

                  <span className="muted">
                    {runoffActive
                      ? " in the runoff"
                      : " in the original round"}
                  </span>
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
                  <div className="official-result">
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
                          if (!canVote) return;

                          setSelected(choice.id);
                          setNotice("");
                          setError("");
                        }}
                        disabled={!canVote}
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
                            {getChoiceDescription(index)}
                          </small>

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

                        <span>↗</span>
                      </button>
                    );
                  })}
                </div>

                {canVote ? (
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
                ) : alreadyVotedThisRound ? (
                  <p className="notice">
                    You've already voted in this round in this browser.
                  </p>
                ) : votingClosed ? (
                  <p className="notice">
                    Voting is closed. The result is shown above.
                  </p>
                ) : (
                  <p className="notice">
                    There are currently no choices available for this voting round.
                  </p>
                )}

                {notice && (
                  <p className="notice" role="status">
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

                <button
                  type="button"
                  className="refresh-button"
                  onClick={() => window.location.reload()}
                >
                  Refresh page ↻
                </button>
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
              The winning choice shapes the next chapter.
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
