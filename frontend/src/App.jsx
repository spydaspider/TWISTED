import { useState } from "react";
import "./App.css";

const choices = [
  {
    id: "open",
    letter: "A",
    title: "Open the door",
    description: "Face whoever is waiting outside.",
  },
  {
    id: "reply",
    letter: "B",
    title: "Reply to the message",
    description: "Ask your future self what happens next.",
  },
  {
    id: "keyhole",
    letter: "C",
    title: "Look through the keyhole",
    description: "Discover who is standing outside.",
  },
];

export default function App() {
  const [selected, setSelected] = useState("");
  const [submitted, setSubmitted] = useState(false);

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
            Every decision changes what happens next.
            Vote with everyone else and watch the story
            take a turn nobody can take back.
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
        <h2>THE MESSAGE</h2>

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
            <h3>Choose what happens next.</h3>

            <p className="muted">
              Pick one action. In the live version, the
              community's winning choice determines the next
              official episode.
            </p>

            <div className="choices">
              {choices.map((choice) => (
                <button
                  type="button"
                  key={choice.id}
                  className={`choice ${
                    selected === choice.id ? "selected" : ""
                  }`}
                  onClick={() => {
                    setSelected(choice.id);
                    setSubmitted(false);
                  }}
                >
                  <span className="choice-letter">{choice.letter}</span>

                  <span className="choice-copy">
                    <strong>{choice.title}</strong>
                    <small>{choice.description}</small>
                  </span>

                  <span>↗</span>
                </button>
              ))}
            </div>

            <button
              type="button"
              className="primary-button vote-button"
              disabled={!selected}
              onClick={() => setSubmitted(true)}
            >
              Cast your vote →
            </button>

            {submitted && (
              <p className="notice">
                Demo only: your choice has been selected, but
                no vote has been saved to a database yet.
              </p>
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