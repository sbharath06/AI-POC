from typing import List, Optional

class Embeddings:
    def __init__(self):
        self.model = None

    def _load_model(self):
        if self.model is None:
            try:
                from sentence_transformers import SentenceTransformer
                self.model = SentenceTransformer("all-MiniLM-L6-v2")
            except ImportError:
                print("Warning: sentence-transformers not available.")
                self.model = None
                
    def embed_text(self, text: str) -> Optional[List[float]]:
        self._load_model()
        if self.model is None:
            return None
        return self.model.encode(text).tolist()

    def embed_batch(self, texts: List[str]) -> Optional[List[List[float]]]:
        self._load_model()
        if self.model is None:
            return None
        return self.model.encode(texts).tolist()

embeddings = Embeddings()
