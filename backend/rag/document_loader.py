import os
from typing import List, Dict, Any

def chunk_text(text: str, source: str, chunk_size: int = 500, overlap: int = 50) -> List[Dict[str, Any]]:
    chunks = []
    start = 0
    text_len = len(text)
    chunk_idx = 0
    
    while start < text_len:
        end = min(start + chunk_size, text_len)
        chunk = text[start:end]
        chunks.append({
            "text": chunk,
            "metadata": {
                "source": source,
                "chunk_index": chunk_idx
            }
        })
        start += chunk_size - overlap
        chunk_idx += 1
        
    return chunks

def load_pdf(file_path: str) -> List[Dict[str, Any]]:
    try:
        import PyPDF2
        chunks = []
        filename = os.path.basename(file_path)
        with open(file_path, "rb") as f:
            reader = PyPDF2.PdfReader(f)
            for page_num in range(len(reader.pages)):
                text = reader.pages[page_num].extract_text()
                if text:
                    page_chunks = chunk_text(text, filename)
                    for c in page_chunks:
                        c["metadata"]["page"] = page_num + 1
                    chunks.extend(page_chunks)
        return chunks
    except ImportError:
        print("Warning: PyPDF2 not installed.")
        return []

def load_txt(file_path: str) -> List[Dict[str, Any]]:
    filename = os.path.basename(file_path)
    with open(file_path, "r", encoding="utf-8") as f:
        text = f.read()
    return chunk_text(text, filename)

def load_markdown(file_path: str) -> List[Dict[str, Any]]:
    return load_txt(file_path)

def load_document(file_path: str, file_type: str) -> List[Dict[str, Any]]:
    file_type = file_type.lower()
    if file_type == "pdf" or file_path.endswith(".pdf"):
        return load_pdf(file_path)
    elif file_type in ["md", "markdown"] or file_path.endswith(".md"):
        return load_markdown(file_path)
    else:
        return load_txt(file_path)
