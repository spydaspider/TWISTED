
import { useState } from "react";
import "./ReaderAccount.css";

const API_URL = "http://localhost:5000/api";

export default function ReaderAccount({
  user,
  onUserChange,
  isOpen,
  onOpen,
  onClose,
}) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();

    setError("");
    setNotice("");
    setLoading(true);

    try {
      const endpoint =
        mode === "register" ? "register" : "login";

      const body =
        mode === "register"
          ? { username, email, password }
          : { email, password };

      const response = await fetch(
        `${API_URL}/auth/${endpoint}`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Authentication failed."
        );
      }

      onUserChange(data.user);

      setPassword("");
      setUsername("");
      setEmail("");
      setNotice("");

      onClose();
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory() {
    setShowHistory(true);
    setHistoryLoading(true);
    setError("");

    try {
      const response = await fetch(
        `${API_URL}/auth/voting-history`,
        {
          credentials: "include",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Could not load voting history."
        );
      }

      setHistory(data.history || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function handleLogout() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `${API_URL}/auth/logout`,
        {
          method: "POST",
          credentials: "include",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Logout failed."
        );
      }

      onUserChange(null);
      setShowHistory(false);
      setHistory([]);
      onClose();
    } catch (err) {
      setError(err.message || "Could not log out.");
    } finally {
      setLoading(false);
    }
  }

  function openLogin() {
    setMode("login");
    setError("");
    setNotice("");
    setShowHistory(false);
    onOpen();
  }

  function openRegister() {
    setMode("register");
    setError("");
    setNotice("");
    setShowHistory(false);
    onOpen();
  }

  return (
    <>
      <div className="reader-account">
        {user ? (
          <button
            type="button"
            className="reader-account-button"
            onClick={() => {
              setError("");
              setShowHistory(false);
              onOpen();
            }}
          >
            <span className="reader-avatar">
              {user.username?.charAt(0).toUpperCase()}
            </span>

            <span className="reader-account-name">
              {user.username}
            </span>

            <span>⌄</span>
          </button>
        ) : (
          <button
            type="button"
            className="reader-login-button"
            onClick={openLogin}
          >
            LOG IN / SIGN UP
          </button>
        )}
      </div>

      {isOpen && (
        <div
          className="reader-modal-overlay"
          onClick={onClose}
        >
          <section
            className="reader-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reader-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="reader-modal-close"
              onClick={onClose}
              aria-label="Close"
            >
              ×
            </button>

            {user ? (
              showHistory ? (
                <>
                  <p className="eyebrow">YOUR JOURNEY</p>

                  <h2 id="reader-modal-title">
                    Voting history
                  </h2>

                  <p className="reader-modal-description">
                    Every decision you've made in TWISTED.
                  </p>

                  {historyLoading ? (
                    <p>Loading your voting history...</p>
                  ) : history.length === 0 ? (
                    <p className="reader-empty">
                      You haven't voted on any stories yet.
                    </p>
                  ) : (
                    <div className="reader-history">
                      {history.map((item, index) => (
                        <article
                          className="reader-history-item"
                          key={`${item.story.slug}-${item.round}-${index}`}
                        >
                          <span className="reader-history-round">
                            {item.round.toUpperCase()} ROUND
                          </span>

                          <h3>{item.story.title}</h3>

                          <p>
                            Episode {item.story.episode}
                            {item.story.genre
                              ? ` · ${item.story.genre}`
                              : ""}
                          </p>

                          <div>
                            Your choice:{" "}
                            <strong>{item.selectedChoice}</strong>
                          </div>

                          <div>
                            Result:{" "}
                            <strong>
                              {item.result.replace("_", " ").toUpperCase()}
                            </strong>
                          </div>

                          {item.winningChoice && (
                            <div>
                              Winning choice:{" "}
                              <strong>{item.winningChoice}</strong>
                            </div>
                          )}
                        </article>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    className="reader-secondary-button"
                    onClick={() => setShowHistory(false)}
                  >
                    ← Back to account
                  </button>
                </>
              ) : (
                <>
                  <p className="eyebrow">READER ACCOUNT</p>

                  <h2 id="reader-modal-title">
                    Welcome, {user.username}.
                  </h2>

                  <p className="reader-modal-description">
                    Your identity. Your choices. Your story.
                  </p>

                  <div className="reader-profile">
                    <span className="reader-profile-avatar">
                      {user.username?.charAt(0).toUpperCase()}
                    </span>

                    <div>
                      <strong>{user.username}</strong>
                      <p>{user.email}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="reader-primary-button"
                    onClick={loadHistory}
                  >
                    VIEW VOTING HISTORY →
                  </button>

                  <button
                    type="button"
                    className="reader-secondary-button"
                    disabled={loading}
                    onClick={handleLogout}
                  >
                    {loading ? "Logging out..." : "LOG OUT"}
                  </button>
                </>
              )
            ) : (
              <>
                <p className="eyebrow">JOIN THE STORY</p>

                <h2 id="reader-modal-title">
                  {mode === "register"
                    ? "Create your account."
                    : "Welcome back."}
                </h2>

                <p className="reader-modal-description">
                  {mode === "register"
                    ? "Join the community. Your choices help shape what happens next."
                    : "Sign in to vote and shape the next chapter."}
                </p>

                <div className="reader-auth-tabs">
                  <button
                    type="button"
                    className={
                      mode === "login" ? "active" : ""
                    }
                    onClick={() => {
                      setMode("login");
                      setError("");
                    }}
                  >
                    LOG IN
                  </button>

                  <button
                    type="button"
                    className={
                      mode === "register" ? "active" : ""
                    }
                    onClick={() => {
                      setMode("register");
                      setError("");
                    }}
                  >
                    SIGN UP
                  </button>
                </div>

                <form
                  className="reader-auth-form"
                  onSubmit={handleSubmit}
                >
                  {mode === "register" && (
                    <label>
                      USERNAME

                      <input
                        type="text"
                        value={username}
                        onChange={(event) =>
                          setUsername(event.target.value)
                        }
                        placeholder="Choose a username"
                        minLength={3}
                        maxLength={24}
                        pattern="[a-zA-Z0-9_]+"
                        required
                        autoComplete="username"
                      />
                    </label>
                  )}

                  <label>
                    EMAIL ADDRESS

                    <input
                      type="email"
                      value={email}
                      onChange={(event) =>
                        setEmail(event.target.value)
                      }
                      placeholder="you@example.com"
                      maxLength={254}
                      required
                      autoComplete="email"
                    />
                  </label>

                  <label>
                    PASSWORD

                    <input
                      type="password"
                      value={password}
                      onChange={(event) =>
                        setPassword(event.target.value)
                      }
                      placeholder="Enter your password"
                      minLength={10}
                      maxLength={128}
                      required
                      autoComplete={
                        mode === "register"
                          ? "new-password"
                          : "current-password"
                      }
                    />
                  </label>

                  {error && (
                    <p className="reader-error" role="alert">
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    className="reader-primary-button"
                    disabled={loading}
                  >
                    {loading
                      ? "PLEASE WAIT..."
                      : mode === "register"
                        ? "CREATE ACCOUNT →"
                        : "LOG IN →"}
                  </button>
                </form>

                <p className="reader-switch">
                  {mode === "login"
                    ? "New to TWISTED?"
                    : "Already have an account?"}

                  <button
                    type="button"
                    onClick={() => {
                      setMode(
                        mode === "login" ? "register" : "login"
                      );
                      setError("");
                    }}
                  >
                    {mode === "login"
                      ? " Create an account"
                      : " Log in"}
                  </button>
                </p>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
