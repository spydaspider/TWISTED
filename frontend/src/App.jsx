
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
    voterId = crypto.randomUUID();
    localStorage.setItem(storageKey, voterId);
  }

  return voterId;
}

export default function App() {
  const [story, setStory] = useState(null);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Load the story and vote totals from the backend.
  useEffect(() => {
    let cancelled = false;

    async function loadStory() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(`${API_URL}/stories/${STORY_SLUG}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Could not load the story.");
        }

        if (!data.story) {
          throw new Error("The story could not be found.");
        }

        if (cancelled) return;

        setStory(data.story);

        const alreadyVoted =
          localStorage.getItem(`twisted-voted-${STORY_SLUG}`) === "true";

        setHasVoted(alreadyVoted);
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

  const totalVotes =
    story?.choices?.reduce((total, choice) => total + choice.votes, 0) || 0;

  async function handleVote() {
    if (!selected || submitting || hasVoted || !story) return;

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
          localStorage.setItem(`twisted-voted-${STORY_SLUG}`, "true");
        }

        throw new Error(data.message || "Your vote could not be recorded.");
      }

      setStory(data.story);
      setHasVoted(true);

      localStorage.setItem(`twisted-voted-${STORY_SLUG}`, "true");

      setNotice("Your vote has been recorded. The story is in your hands.");
    } catch (err) {
      setError(
        err.message ||
          "Something went wrong while submitting your vote."
      );
    } finally {
      setSubmitting(false);
    }
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
          <p className="eyebrow">ONE STORY. MILLIONS OF POSSIBILITIES.</p>

          <h1>
            YOUR CHOICE.
            <br />
            YOUR <span>CONSEQUENCES.</span>
          </h1>

          <p className="hero-description">
            Every decision changes what happens next. Vote with everyone
            else and watch the story take a turn nobody can take back.
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
        <div className="eyebrow">CHAPTER 01 — PSYCHOLOGICAL THRILLER</div>
        <h2>{story?.title || "THE MESSAGE"}</h2>

        <div className="story-layout">
          <article className="story-card">
            <p className="story-time">11:47 PM</p>

            <p>You are home alone when your phone lights up.</p>

            <div className="message-box">
              <small>UNKNOWN NUMBER</small>
              <p>I'm you. Three days from now.</p>
            </div>

            <p>You stare at the screen. Another message arrives.</p>

            <div className="message-box warning">
              <p>Whatever you do, don't open your bedroom door.</p>
            </div>

            <p>
              Before you can respond, three slow knocks echo through the
              house.
            </p>

            <h3>
              Someone is outside your bedroom.
              <br />
              What do you do?
            </h3>
          </article>

          <aside className="vote-panel">
            <p className="eyebrow">COMMUNITY DECISION</p>
            <h3>Choose what happens next.</h3>

            <p className="muted">
              Your choice counts toward the community's decision about the
              next official episode.
            </p>

            {loading && <p className="notice">Loading story and votes...</p>}

            {error && (
              <p className="notice" role="alert">
                {error}
              </p>
            )}

            {!loading && story && (
              <>
                <div className="vote-summary">
                  <strong>
                    {totalVotes.toLocaleString()}{" "}
                    {totalVotes === 1 ? "vote" : "votes"}
                  </strong>
                  <span className="muted"> recorded so far</span>
                </div>

                <div className="choices">
                  {story.choices.map((choice) => {
                    const details = choiceDetails[choice.id] || {
                      letter: "?",
                      description: "",
                    };

                    const percentage =
                      totalVotes > 0
                        ? Math.round((choice.votes / totalVotes) * 100)
                        : 0;

                    return (
                      <button
                        type="button"
                        key={choice.id}
                        className={`choice ${
                          selected === choice.id ? "selected" : ""
                        }`}
                        onClick={() => {
                          if (hasVoted || submitting) return;

                          setSelected(choice.id);
                          setNotice("");
                          setError("");
                        }}
                        disabled={hasVoted || submitting}
                        aria-pressed={selected === choice.id}
                      >
                        <span className="choice-letter">
                          {details.letter}
                        </span>

                        <span className="choice-copy">
                          <strong>{choice.title}</strong>
                          <small>{details.description}</small>

                          <small>
                            {choice.votes.toLocaleString()}{" "}
                            {choice.votes === 1 ? "vote" : "votes"} ·{" "}
                            {percentage}%
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

                {!hasVoted ? (
                  <button
                    type="button"
                    className="primary-button vote-button"
                    disabled={!selected || submitting || loading}
                    onClick={handleVote}
                  >
                    {submitting ? "Submitting vote..." : "Cast your vote →"}
                  </button>
                ) : (
                  <p className="notice">
                    You've already voted on this story in this browser.
                  </p>
                )}

                {notice && (
                  <p className="notice" role="status">
                    {notice}
                  </p>
                )}

                <button
                  type="button"
                  className="refresh-button"
                  onClick={() => window.location.reload()}
                >
                  Refresh vote totals ↻
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
            <p>Choose the action you want the character to take.</p>
          </article>

          <article>
            <span>03</span>
            <h3>Discover</h3>
            <p>The winning choice shapes the next chapter.</p>
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
