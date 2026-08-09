import os
import json
import re
import asyncio
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from pydantic import BaseModel
import requests
from bs4 import BeautifulSoup
from fastapi.responses import FileResponse
try:
    from tools.converter import convert_file
    from tools.analyzer import analyze_data, predict_data, format_analysis_for_llm
    from config import settings
    from database import get_db, init_db, User, ChatSession, ChatMessage, Document, AsyncSessionLocal
    from auth import router as auth_router, get_current_user
    from llm_engine import get_llm_provider
    from rag.engine import rag_engine
except ImportError:
    from .tools.converter import convert_file
    from .tools.analyzer import analyze_data, predict_data, format_analysis_for_llm
    from .config import settings
    from .database import get_db, init_db, User, ChatSession, ChatMessage, Document, AsyncSessionLocal
    from .auth import router as auth_router, get_current_user
    from .llm_engine import get_llm_provider
    from .rag.engine import rag_engine

app = FastAPI(title="Probot-06 API")

@app.on_event("startup")
async def startup_event():
    await init_db()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)

# ── Web Search (direct, fast & fallback support) ──────────────────────
NEEDS_SEARCH_PATTERNS = re.compile(
    r'\b(latest|current|recent|today|now|2024|2025|2026|2027|news|update|'
    r'price|stock|weather|score|result|who|what|when|where|why|how|trending|'
    r'released|launched|version|event|president|winner|match|game|movie|'
    r'ai|model|tech|status|happening|popular|best|top|versus|vs)\b',
    re.IGNORECASE
)

def web_search(query: str, num_results: int = 5) -> str:
    """Robust multi-engine web search with DDGS library, HTML scraper, and Wikipedia fallbacks."""
    snippets = []
    
    # Clean up common query typos
    query = query.replace('bresident', 'president').replace('oponent', 'opponent')
    
    # Method 1: duckduckgo_search library
    try:
        from duckduckgo_search import DDGS
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=num_results))
            for r in results:
                title = r.get("title", "")
                body = r.get("body", "")
                if title or body:
                    snippets.append(f"• {title}: {body}")
        if snippets:
            return "\n".join(snippets)
    except Exception as e:
        print(f"[WebSearch] DDGS error: {e}")

    # Method 2: HTML Scrape fallback
    try:
        url = f"https://html.duckduckgo.com/html/?q={requests.utils.quote(query)}"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        resp = requests.get(url, headers=headers, timeout=6)
        if resp.status_code == 200:
            soup = BeautifulSoup(resp.text, "html.parser")
            results = soup.select(".result__body")
            for r in results[:num_results]:
                title_el = r.select_one(".result__a")
                snippet_el = r.select_one(".result__snippet")
                title = title_el.get_text(strip=True) if title_el else ""
                snippet = snippet_el.get_text(strip=True) if snippet_el else ""
                if title or snippet:
                    snippets.append(f"• {title}: {snippet}")
        if snippets:
            return "\n".join(snippets)
    except Exception as e:
        print(f"[WebSearch] HTML fallback error: {e}")

    # Method 3: Wikipedia fallback for entity queries
    try:
        import wikipedia
        summary = wikipedia.summary(query, sentences=3)
        if summary:
            return f"• Wikipedia ({query}): {summary}"
    except Exception:
        pass

    return ""

GREETING_PATTERNS = re.compile(
    r'^(hi+|hello|hey+|good\s*(morning|evening|afternoon|day)|howdy|greetings|who\s*are\s*you|what\s*is\s*your\s*name|how\s*are\s*you|thanks|thank\s*you|cool|awesome|ok|okay|bye|goodbye)\b',
    re.IGNORECASE
)

def needs_web_search(query: str) -> bool:
    """Detect if a query needs real-time or external web information."""
    if not query or len(query.strip()) < 3:
        return False
    clean = query.strip().lower()
    if GREETING_PATTERNS.match(clean):
        return False
    if NEEDS_SEARCH_PATTERNS.search(clean):
        return True
    if clean.endswith("?") and len(clean.split()) >= 4:
        return True
    return False

def build_search_query(message: str, history: list = None) -> str:
    """Enrich search query with previous conversation context for short follow-up questions."""
    clean_msg = message.strip()
    words = clean_msg.split()
    if len(words) <= 5 and history:
        for msg in reversed(history):
            if msg.get("role") == "user" and msg.get("content") and msg.get("content") != message:
                last_topic = msg.get("content").strip()
                return f"{last_topic} {clean_msg}"
    return clean_msg

def generate_title(message: str) -> str:
    """Generate a short title from the first message."""
    clean = message.strip().replace("\n", " ")
    if len(clean) <= 40:
        return clean
    truncated = clean[:40]
    last_space = truncated.rfind(" ")
    if last_space > 15:
        return truncated[:last_space] + "..."
    return truncated + "..."

# ── Startup ──────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup_event():
    await init_db()

@app.on_event("shutdown")
async def shutdown_event():
    pass

# Pydantic Schemas
class ChatRequest(BaseModel):
    message: str
    session_id: Optional[int] = None

class ChatResponse(BaseModel):
    message: str
    session_id: int
    session_title: Optional[str] = None
    sources: Optional[List[dict]] = None

class SessionResponse(BaseModel):
    id: int
    title: str
    created_at: str
    
class MessageResponse(BaseModel):
    role: str
    content: str
    sources: Optional[str] = None

class DocumentResponse(BaseModel):
    id: int
    filename: str
    file_type: str
    created_at: str

class RenameRequest(BaseModel):
    title: str

# ── Chat Endpoint ────────────────────────────────────────────────────
@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    session_title = None
    
    if request.session_id:
        result = await db.execute(select(ChatSession).where(ChatSession.id == request.session_id, ChatSession.user_id == user.id))
        session = result.scalars().first()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
    else:
        title = generate_title(request.message)
        session = ChatSession(user_id=user.id, title=title)
        db.add(session)
        await db.commit()
        await db.refresh(session)
        session_title = title
        
    result = await db.execute(select(ChatMessage).where(ChatMessage.session_id == session.id).order_by(ChatMessage.created_at))
    history = result.scalars().all()
    messages = [{"role": msg.role, "content": msg.content} for msg in history]
    
    context_str = ""
    sources = []
    
    search_q = build_search_query(request.message, messages)
    if needs_web_search(search_q) or needs_web_search(request.message):
        search_result = web_search(search_q)
        if search_result:
            context_str = f"Latest web search results:\n{search_result}"
    
    if not context_str:
        try:
            rag_results = rag_engine.query(request.message, user.id)
            if rag_results:
                context_str = rag_engine.format_context(rag_results)
                sources = [r["metadata"] for r in rag_results]
        except Exception:
            pass
    
    messages.append({"role": "user", "content": request.message})
    
    user_msg = ChatMessage(session_id=session.id, role="user", content=request.message)
    db.add(user_msg)
    
    llm = get_llm_provider()
    response_text = await llm.generate(messages, context=context_str)
    
    sources_json = json.dumps(sources) if sources else None
    assistant_msg = ChatMessage(session_id=session.id, role="assistant", content=response_text, sources=sources_json)
    db.add(assistant_msg)
    await db.commit()
    
    return ChatResponse(message=response_text, session_id=session.id, session_title=session_title, sources=sources)

# ── Session Endpoints ────────────────────────────────────────────────
@app.get("/api/sessions", response_model=List[SessionResponse])
async def list_sessions(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ChatSession).where(ChatSession.user_id == user.id).order_by(ChatSession.updated_at.desc()))
    sessions = result.scalars().all()
    return [{"id": s.id, "title": s.title, "created_at": str(s.created_at)} for s in sessions]

@app.get("/api/sessions/{session_id}/messages", response_model=List[MessageResponse])
async def get_messages(session_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == user.id))
    if not result.scalars().first():
        raise HTTPException(status_code=404, detail="Session not found")
        
    result = await db.execute(select(ChatMessage).where(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at))
    messages = result.scalars().all()
    return [{"role": m.role, "content": m.content, "sources": m.sources} for m in messages]

@app.post("/api/sessions")
async def create_session(title: str = "New Chat", user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    session = ChatSession(user_id=user.id, title=title)
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return {"id": session.id, "title": session.title}

@app.put("/api/sessions/{session_id}/rename")
async def rename_session(session_id: int, body: RenameRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == user.id))
    session = result.scalars().first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session.title = body.title
    await db.commit()
    return {"id": session.id, "title": session.title}

@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == user.id))
    session = result.scalars().first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    await db.delete(session)
    await db.commit()
    return {"status": "deleted"}

# ── Document Endpoints ───────────────────────────────────────────────
@app.post("/api/documents/upload")
async def upload_document(file: UploadFile = File(...), user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    upload_dir = os.path.join(os.path.dirname(__file__), "..", "uploads")
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, file.filename)
    
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)
        
    file_type = file.filename.split(".")[-1] if "." in file.filename else "txt"
    chunk_count = rag_engine.add_document(file_path, file_type, user.id)
    
    doc = Document(user_id=user.id, filename=file.filename, file_type=file_type, chunk_count=chunk_count)
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    
    return {"id": doc.id, "filename": doc.filename, "chunk_count": chunk_count}

@app.get("/api/documents", response_model=List[DocumentResponse])
async def list_documents(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Document).where(Document.user_id == user.id))
    docs = result.scalars().all()
    return [{"id": d.id, "filename": d.filename, "file_type": d.file_type, "created_at": str(d.created_at)} for d in docs]

@app.delete("/api/documents/{doc_id}")
async def delete_document(doc_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Document).where(Document.id == doc_id, Document.user_id == user.id))
    doc = result.scalars().first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    rag_engine.delete_document(doc.filename, user.id)
    await db.delete(doc)
    await db.commit()
    return {"status": "deleted"}

# ── Converter and Analyzer Endpoints ─────────────────────────────────
class ConvertRequest(BaseModel):
    output_format: str

@app.post("/api/convert")
async def convert_document(
    file: UploadFile = File(...),
    output_format: str = "pdf",
    user: User = Depends(get_current_user)
):
    upload_dir = os.path.join(os.path.dirname(__file__), "..", "uploads")
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, file.filename)
    
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)
    
    try:
        output_path, extracted_text = convert_file(file_path, output_format)
        
        summary = ""
        if extracted_text and len(extracted_text.strip()) > 50:
            llm = get_llm_provider()
            summary = await llm.generate(
                [{"role": "user", "content": f"Provide a brief 2-3 sentence summary of this document:\n\n{extracted_text[:3000]}"}]
            )
        
        output_filename = os.path.basename(output_path)
        return {
            "filename": output_filename,
            "summary": summary,
            "download_url": f"/api/convert/download/{output_filename}"
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/convert/download/{filename}")
async def download_converted(filename: str, user: User = Depends(get_current_user)):
    converted_dir = os.path.join(os.path.dirname(__file__), "..", "converted")
    file_path = os.path.join(converted_dir, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path, filename=filename)

@app.post("/api/analyze")
async def analyze_document(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user)
):
    upload_dir = os.path.join(os.path.dirname(__file__), "..", "uploads")
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, file.filename)
    
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)
    
    try:
        analysis = analyze_data(file_path)
        
        llm = get_llm_provider()
        analysis_text = format_analysis_for_llm(analysis)
        interpretation = await llm.generate(
            [{"role": "user", "content": f"Analyze this dataset and provide key insights, patterns, and recommendations:\n\n{analysis_text}"}]
        )
        
        return {
            "analysis": analysis,
            "interpretation": interpretation
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

class PredictRequest(BaseModel):
    target_column: str
    features: list = None

@app.post("/api/predict")
async def predict(
    file: UploadFile = File(...),
    target_column: str = "target",
    user: User = Depends(get_current_user)
):
    upload_dir = os.path.join(os.path.dirname(__file__), "..", "uploads")
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, file.filename)
    
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)
    
    try:
        result = predict_data(file_path, target_column)
        
        llm = get_llm_provider()
        interpretation = await llm.generate(
            [{"role": "user", "content": f"Interpret these ML prediction results in plain language:\n\nModel: {result.get('model_type')}\nScore: {result.get('score')}\nFeature Importances: {result.get('feature_importances', 'N/A')}\n\nProvide insights and recommendations."}]
        )
        
        result["interpretation"] = interpretation
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ── Health ───────────────────────────────────────────────────────────
@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "probot-06-api"}

# ── WebSocket Chat ───────────────────────────────────────────────────
@app.websocket("/ws/chat")
async def websocket_endpoint(websocket: WebSocket, token: str):
    await websocket.accept()
    from jose import jwt as jose_jwt
    try:
        payload = jose_jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        username = payload.get("sub")
        if not username:
            await websocket.close(code=1008)
            return
    except Exception:
        await websocket.close(code=1008)
        return
        
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                data = {"message": raw}
            
            # 1. CRITICAL: Handle ping frames gracefully without streaming LLM responses!
            if data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
                continue
                
            message = data.get("message", "")
            if not message or not message.strip():
                continue
                
            session_id = data.get("session_id")
            
            # Fetch user & manage session history in DB
            async with AsyncSessionLocal() as db:
                result = await db.execute(select(User).where(User.username == username))
                user = result.scalars().first()
                if not user:
                    await websocket.send_json({"type": "error", "content": "User not found"})
                    continue
                    
                if session_id:
                    res = await db.execute(select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == user.id))
                    session = res.scalars().first()
                    if not session:
                        session = ChatSession(user_id=user.id, title=generate_title(message))
                        db.add(session)
                        await db.commit()
                        await db.refresh(session)
                else:
                    session = ChatSession(user_id=user.id, title=generate_title(message))
                    db.add(session)
                    await db.commit()
                    await db.refresh(session)

                # Fetch past message history
                res = await db.execute(select(ChatMessage).where(ChatMessage.session_id == session.id).order_by(ChatMessage.created_at))
                history = res.scalars().all()
                messages = [{"role": m.role, "content": m.content} for m in history]
                
                # Context search (Web search or RAG)
                context_str = ""
                sources = []
                
                search_q = build_search_query(message, messages)
                if needs_web_search(search_q) or needs_web_search(message):
                    await websocket.send_json({"type": "tool_use", "content": "Searching the web..."})
                    search_result = web_search(search_q)
                    if search_result:
                        context_str = f"Latest web search results:\n{search_result}"
                
                if not context_str:
                    try:
                        rag_results = rag_engine.query(message, user.id)
                        if rag_results:
                            context_str = rag_engine.format_context(rag_results)
                            sources = [r["metadata"] for r in rag_results]
                            await websocket.send_json({"type": "rag_context", "sources": sources})
                    except Exception:
                        pass

                messages.append({"role": "user", "content": message})
                
                # Save User message to DB
                user_msg = ChatMessage(session_id=session.id, role="user", content=message)
                db.add(user_msg)
                await db.commit()

                # Stream LLM response
                llm = get_llm_provider()
                full_response = ""
                async for chunk in llm.stream(messages, context=context_str):
                    full_response += chunk
                    await websocket.send_json({"type": "chat_token", "content": chunk})
                
                # Save Assistant message to DB
                sources_json = json.dumps(sources) if sources else None
                assistant_msg = ChatMessage(session_id=session.id, role="assistant", content=full_response, sources=sources_json)
                db.add(assistant_msg)
                await db.commit()
                
                await websocket.send_json({
                    "type": "chat_complete",
                    "session_id": session.id,
                    "session_title": session.title
                })
            
    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "content": str(e)})
        except Exception:
            pass

# ── Mount Frontend Static Files ──────────────────────────────────────
from fastapi.staticfiles import StaticFiles
frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))
if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")


