# Probot AI Assistant

A production-grade AI assistant with RAG (Retrieval Augmented Generation), MCP (Model Context Protocol), and a premium ChatGPT-like web interface.

![Probot](https://img.shields.io/badge/Probot-AI%20Assistant-7c3aed?style=for-the-badge)

## ✨ Features

- **💬 ChatGPT-like Interface** — Premium dark-mode UI with streaming responses, markdown rendering, and code syntax highlighting
- **🧠 RAG (Retrieval Augmented Generation)** — Upload PDF, TXT, or Markdown documents and ask questions about them
- **🔧 MCP (Model Context Protocol)** — Extensible tool system for web search, Wikipedia, system utilities, and more
- **🎤 Voice Input/Output** — Speak to Probot and hear responses (Chrome)
- **🔐 Authentication** — JWT-based login/register system
- **📱 Responsive** — Works on desktop, tablet, and mobile
- **🚀 Free Deployment** — Frontend on Vercel, Backend on Render

## 🏗️ Architecture

```
Frontend (Vercel)  ←→  Backend (Render)  ←→  LLM (Ollama/Gemini)
     │                      │
     │                      ├── RAG Engine (ChromaDB)
     │                      ├── MCP Client → MCP Servers
     │                      └── SQLite Database
     │
     └── Web Speech API (Voice)
```

## 🚀 Quick Start (Local Development)

### Prerequisites
- Python 3.10+
- [Ollama](https://ollama.com/) installed and running
- Pull a model: `ollama pull gemma3:1b`

### 1. Clone & Setup Backend
```bash
cd probot/backend
pip install -r requirements.txt
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your settings (defaults work for local dev)
```

### 3. Start Backend
```bash
cd probot
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

### 4. Open Frontend
Open `frontend/index.html` in your browser, or serve it:
```bash
cd probot/frontend
python -m http.server 3000
```
Then visit http://localhost:3000

### 5. Register & Start Chatting
1. Create an account on the login screen
2. Start a new chat
3. Upload documents for RAG
4. Use voice input (Chrome only)

## 🌐 Deploy for Free

### Frontend → Vercel
1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com) → Import Project
3. Set root directory to `frontend/`
4. Deploy! You'll get a URL like `probot-ai.vercel.app`

### Backend → Render
1. Go to [render.com](https://render.com) → New Web Service
2. Connect your GitHub repo
3. Set root directory to `backend/`
4. Build command: `pip install -r requirements.txt`
5. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
6. Add environment variables:
   - `LLM_PROVIDER=gemini`
   - `GEMINI_API_KEY=your_key_here`
   - `JWT_SECRET=your_secret_here`

### Get a Free Gemini API Key
1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Click "Get API Key" → Create
3. Copy the key to your Render environment variables

> ⚠️ **Note**: Render free tier sleeps after 15 min of inactivity (1-2 min cold start on next request). Fine for personal use.

## 📁 Project Structure
```
probot/
├── backend/
│   ├── main.py              # FastAPI app + endpoints
│   ├── config.py            # Environment configuration
│   ├── database.py          # SQLite models
│   ├── auth.py              # JWT authentication
│   ├── llm_engine.py        # LLM abstraction (Gemini/Ollama)
│   ├── rag/
│   │   ├── engine.py        # RAG pipeline (ChromaDB)
│   │   ├── document_loader.py  # PDF/TXT/MD parsers
│   │   └── embeddings.py    # Sentence transformers
│   ├── mcp/
│   │   ├── client.py        # MCP tool orchestrator
│   │   └── servers/         # MCP tool servers
│   ├── requirements.txt
│   ├── Dockerfile
│   └── render.yaml
├── frontend/
│   ├── index.html           # Main page
│   ├── css/styles.css       # Premium dark theme
│   └── js/
│       ├── app.js           # App orchestrator
│       ├── chat.js          # Chat UI controller
│       ├── auth.js          # Authentication
│       ├── websocket.js     # WebSocket manager
│       ├── voice.js         # Voice I/O
│       └── upload.js        # Document upload
└── README.md
```

## 🔧 Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_PROVIDER` | `ollama` | `ollama` or `gemini` |
| `GEMINI_API_KEY` | — | Required for Gemini provider |
| `OLLAMA_MODEL` | `gemma3:1b` | Ollama model name |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server URL |
| `JWT_SECRET` | auto-generated | Secret for JWT tokens |
| `DATABASE_URL` | `sqlite+aiosqlite:///./probot.db` | Database connection |
| `CHROMA_PATH` | `./chroma_db` | ChromaDB storage path |

## 📄 License

MIT License — feel free to use, modify, and deploy!
