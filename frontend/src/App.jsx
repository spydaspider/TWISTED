import { useEffect, useState } from "react";
import "./App.css";

const API_URL = "http://localhost:5000/api";
const STORY_SLUG = "the-message";

const choiceDetails = {
  open: {
    letter: "A",
    description: "Face whoever is waiting outside.",
  },
  reply: {
    letter: "B",
    description: "Ask your future self what happens next.",
  },
  keyhole: {
    letter: "C",
    description: "Discover who is standing outside.",
  },
};

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

function getSavedVote() {
  try {
    const saved = localStorage.getItem(
      `twisted-voted-${STORY_SLUG}`
    );

    if (!saved) return null;

    // Supports the previous version, which saved "true".
    if (saved === "true") {
      return { round: "original" };
    }

    return JSON.parse(saved);
  } catch {
    return null;
  }
}

function saveVote(round) {
  localStorage.setItem(
    `twisted-voted-${STORY_SLUG}`,
    JSON.stringify({ round })
  );
}

export default function App() {
  const [story, setStory] = useState(null);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);
  const [votedRound, setVotedRound] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Determine the voting round currently active on the backend.
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

  const officialWinner =
    activeChoices.find((choice) => choice.id === officialWinnerId) ||
    story?.runoffChoices?.find(
      (choice) => choice.id === officialWinnerId
    ) ||
    story?.choices?.find(
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

  // Load the story when the page opens.
  useEffect(() => {
    let cancelled = false;

    async function loadStory() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(
          `${API_URL}/stories/${STORY_SLUG}`
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.message || "Could not load the story."
          );
        }

        if (!data.story) {
          throw new Error("The story could not be found.");
        }

        if (cancelled) return;

        setStory(data.story);

        const savedVote = getSavedVote();

        if (savedVote) {
          setHasVoted(true);
          setVotedRound(savedVote.round || "original");
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err.message ||
              "Could not connect to TWISTED. Please try again."
          );
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
  }, []);

  // Refresh the story and vote totals every five seconds.
  // This does not reset the user's selected choice or voting state.
  useEffect(() => {
    let cancelled = false;

    async function refreshVoteTotals() {
      try {
        const response = await fetch(
          `${API_URL}/stories/${STORY_SLUG}`
        );

        if (!response.ok) return;

        const data = await response.json();

        if (!data.story || cancelled) return;

        setStory(data.story);

        // If the voting round has changed, clear an obsolete selection.
        setSelected((currentSelected) => {
          const choices =
            data.story.runoffStatus === "voting"
              ? data.story.runoffChoices || []
              : data.story.choices || [];

          const stillExists = choices.some(
            (choice) => choice.id === currentSelected
          );

          return stillExists ? currentSelected : "";
        });
      } catch {
        // Keep the last successfully loaded story if refresh fails.
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
  }, []);

  // Clear the previous selection when the voting round changes.
  useEffect(() => {
    setSelected("");
    setNotice("");
    setError("");
  }, [activeRound]);

  async function handleVote() {
    if (!selected || !canVote || !story) return;

    try {
      setSubmitting(true);
      setError("");
      setNotice("");

      const voterId = getVoterId();

      const response = await fetch(
        `${API_URL}/stories/${STORY_SLUG}/vote`,
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
          saveVote(activeRound);
        }

        throw new Error(
          data.message || "Your vote could not be recorded."
        );
      }

      if (data.story) {
        setStory(data.story);
      }

      setHasVoted(true);
      setVotedRound(data.round || activeRound);
      saveVote(data.round || activeRound);

      setNotice(
        data.round === "runoff"
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

  function handleManualRefresh() {
    window.location.reload();
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
          CHAPTER 01 — PSYCHOLOGICAL THRILLER
        </div>

        <h2>{story?.title || "THE MESSAGE"}</h2>

        <div className="story-layout">
          <article className="story-card">
            <p className="story-time">11:47 PM</p>

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

            <h3>
              Someone is outside your bedroom.
              <br />
              What do you do?
            </h3>
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
                      The original vote ended in a tie. The
                      community is choosing between the tied
                      directions.
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
                    {" "}
                    {runoffActive
                      ? "in the runoff"
                      : "in the original round"}
                  </span>
                </div>

                {officialWinner && (
                  <div className="official-result">
                    <p className="eyebrow">OFFICIAL STORY DIRECTION</p>
                    <h3>{officialWinner.title}</h3>
                    <p>
                      The community's winning choice has been
                      confirmed.
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
                      The official story direction has not been
                      selected yet.
                    </p>
                  </div>
                )}

                {!votingClosed && !runoffActive &&
                  story.status === "completed" && (
                    <p className="notice">
                      The original round is complete.
                    </p>
                  )}

                <div className="choices">
                  {activeChoices.map((choice) => {
                    const details = choiceDetails[choice.id] || {
                      letter: "?",
                      description: "",
                    };

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
                          {details.letter}
                        </span>

                        <span className="choice-copy">
                          <strong>
                            {choice.title}
                            {isWinner ? " — WINNER" : ""}
                          </strong>

                          <small>{details.description}</small>

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
                              style={{
                                width: `${percentage}%`,
                              }}
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
                    You've already voted in this round in this
                    browser.
                  </p>
                ) : votingClosed ? (
                  <p className="notice">
                    Voting is closed. The result is shown above.
                  </p>
                ) : (
                  <p className="notice">
                    There are currently no choices available for
                    this voting round.
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
                  onClick={handleManualRefresh}
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