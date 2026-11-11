# TWISTED 

**Your choices. Your story. Your twist.**

TWISTED is an interactive, community-driven storytelling platform where readers influence how stories unfold. Instead of simply reading a story from beginning to end, users become part of the storytelling experience by voting on decisions that determine what happens next.

From psychological thrillers to horror, romance, mystery and fantasy, every story gives the community a chance to shape its direction.

##  About the Project

TWISTED brings storytelling and community participation together.

Readers explore episodic stories, consider the choices presented at the end of each episode, and vote for the direction they want the story to take. The winning choice becomes the official direction of the next episode.

When the community cannot agree, a runoff voting round can determine the winner.

TWISTED also explores alternative storylines through future **What If?** episodes, allowing readers to discover what might have happened if a different decision had won.

## Key Features

- **Interactive Storytelling:** Readers influence how stories develop through community voting.
- **Multiple Story Genres:** Explore different genres, including horror, psychological thriller, mystery, romance and fantasy.
- **Episodic Stories:** Follow stories across multiple connected episodes.
- **Community Voting:** Vote on the choices that determine the next chapter.
- **Runoff Voting:** Resolve tied votes through an additional voting round.
- **AI-Assisted Story Generation:** Use AI to help generate the next episode based on the community's winning decision.
- **Human Editorial Approval:** Generated episodes remain unpublished drafts until reviewed and approved by an administrator.
- **Story Management:** Administrators can create stories, manage episodes, review drafts and publish approved content.
- **Series Progression:** Track episodes and planned series endings.
- **Alternative Story Possibilities:** Explore losing choices through potential What If? storylines.

##  Technology Stack

### Frontend
- React
- JavaScript
- Vite
- CSS

### Backend
- Node.js
- Express.js
- MongoDB
- Mongoose

### AI Integration
- OpenAI API
- AI-assisted episode generation
- Human review and approval workflow

##  Project Structure

```text
TWISTED/
│
├── frontend/
│   └── src/
│       ├── App.jsx
│       ├── Admin.jsx
│       ├── Admin.css
│       └── ...
│
├── backend/
│   ├── models/
│   ├── routes/
│   ├── middleware/
│   ├── server.js
│   └── ...
│
└── README.md
```

##  Getting Started

Follow these steps to run TWISTED locally.

### Prerequisites

Make sure you have installed:

- Node.js
- npm
- MongoDB database (local or MongoDB Atlas)
- Git

An OpenAI API key is required for AI-assisted episode generation.

### 1. Clone the Repository

```bash
git clone https://github.com/spydaspider/TWISTED.git
```

```bash
cd TWISTED
```

### 2. Set Up the Backend

```bash
cd backend
npm install
```

Create a `.env` file inside the backend directory and configure your environment variables:

```env
PORT=5000
MONGODB_URI=your_mongodb_connection_string
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4.1-mini
ADMIN_SECRET=your_admin_secret
READER_SESSION_SECRET=your_reader_session_secret
```

Use your own secure secrets. Never commit your `.env` file or expose API keys.

Start the backend:

```bash
npm run dev
```

If your project does not have a development script, use:

```bash
node server.js
```

### 3. Set Up the Frontend

Open another terminal:

```bash
cd frontend
npm install
```

Start the frontend:

```bash
npm run dev
```

Open the local URL displayed by Vite in your browser.

##  How TWISTED Works

1. A reader selects a story and reads an episode.
2. At the end of the episode, the reader chooses from the available options.
3. The community votes on the direction of the story.
4. The winning choice determines the next episode's direction.
5. If there is a tie, a runoff vote can be started.
6. AI assists in generating the next episode.
7. An administrator reviews and approves the draft before publication.
8. Readers return to discover what happens next.

##  Administration

TWISTED includes an administration area for managing stories and episodes.

Administrators can:

- Create new story series.
- Manage existing episodes.
- Close voting rounds.
- Start and close runoff voting.
- Generate AI-assisted episode drafts.
- Edit and save drafts.
- Review and publish episodes.
- Monitor series progression.

AI-generated content is not automatically published. Editorial approval remains part of the publishing process.

##  Project Vision

The vision behind TWISTED is to make storytelling more interactive, collaborative and engaging.

Traditional storytelling gives readers a finished narrative. TWISTED gives readers an opportunity to influence the narrative as it develops.

The long-term goal is to build a storytelling community where people can discover stories, participate in decisions, explore alternative outcomes and experience stories together.

##  Project Status

TWISTED is under active development.

Features and functionality are being developed and improved as the platform evolves.

##  Contributions

Contributions, suggestions and ideas are welcome.

If you would like to contribute:

1. Fork the repository.
2. Create a feature branch.
3. Make your changes.
4. Submit a pull request.

##  License

A license has not yet been specified for this project.

---

**TWISTED — Every choice creates a new twist.** 🌀