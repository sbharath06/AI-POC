import uuid
from typing import List, Dict, Any, Tuple
import chromadb
from chromadb.config import Settings as ChromaSettings

try:
    from config import settings
except ImportError:
    try:
        from ..config import settings
    except ImportError:
        from backend.config import settings

try:
    from rag.document_loader import load_document
    from rag.embeddings import embeddings
except ImportError:
    from .document_loader import load_document
    from .embeddings import embeddings

class RAGEngine:
    def __init__(self):
        self.client = chromadb.PersistentClient(path=settings.CHROMA_PATH)
        self.collection = self.client.get_or_create_collection(
            name="probot_documents",
            metadata={"hnsw:space": "cosine"}
        )

    def add_document(self, file_path: str, file_type: str, user_id: int) -> int:
        chunks = load_document(file_path, file_type)
        if not chunks:
            return 0
            
        ids = []
        texts = []
        metadatas = []
        
        for i, chunk in enumerate(chunks):
            doc_id = str(uuid.uuid4())
            ids.append(doc_id)
            texts.append(chunk["text"])
            meta = chunk["metadata"]
            meta["user_id"] = user_id
            metadatas.append(meta)
            
        batch_size = 100
        for i in range(0, len(ids), batch_size):
            batch_texts = texts[i:i+batch_size]
            batch_embeddings = embeddings.embed_batch(batch_texts)
            
            kwargs = {
                "documents": batch_texts,
                "metadatas": metadatas[i:i+batch_size],
                "ids": ids[i:i+batch_size]
            }
            if batch_embeddings:
                kwargs["embeddings"] = batch_embeddings
                
            self.collection.add(**kwargs)
            
        return len(chunks)

    def query(self, query_text: str, user_id: int, n_results: int = 5) -> List[Dict[str, Any]]:
        query_embedding = embeddings.embed_text(query_text)
        
        kwargs = {
            "query_texts": [query_text],
            "n_results": n_results,
            "where": {"user_id": user_id}
        }
        if query_embedding:
            kwargs["query_embeddings"] = [query_embedding]
            
        results = self.collection.query(**kwargs)
        
        formatted_results = []
        if results and "documents" in results and results["documents"]:
            for i, doc in enumerate(results["documents"][0]):
                meta = results["metadatas"][0][i] if results["metadatas"] else {}
                formatted_results.append({
                    "text": doc,
                    "metadata": meta
                })
        return formatted_results

    def delete_document(self, filename: str, user_id: int):
        self.collection.delete(
            where={"$and": [{"user_id": {"$eq": user_id}}, {"source": {"$eq": filename}}]}
        )

    def list_documents(self, user_id: int) -> List[str]:
        results = self.collection.get(where={"user_id": user_id}, include=["metadatas"])
        docs = set()
        if results and "metadatas" in results and results["metadatas"]:
            for meta in results["metadatas"]:
                if "source" in meta:
                    docs.add(meta["source"])
        return list(docs)

    def format_context(self, results: List[Dict[str, Any]]) -> str:
        if not results:
            return ""
        context = []
        for i, res in enumerate(results):
            source = res["metadata"].get("source", "Unknown")
            page = res["metadata"].get("page", "")
            page_info = f" (Page {page})" if page else ""
            context.append(f"--- Document: {source}{page_info} ---\n{res['text']}\n")
        return "\n".join(context)

rag_engine = RAGEngine()
