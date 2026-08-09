from mcp.server.fastmcp import FastMCP
import requests
from bs4 import BeautifulSoup

mcp = FastMCP("web_search")

@mcp.tool()
def web_search(query: str) -> str:
    """Searches the web using DuckDuckGo HTML search and returns top results."""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }
    try:
        url = f"https://html.duckduckgo.com/html/?q={requests.utils.quote(query)}"
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, "html.parser")
        results = soup.find_all("a", class_="result__snippet", limit=3)
        titles = soup.find_all("h2", class_="result__title", limit=3)
        
        if not results:
            return "No results found."
            
        formatted_results = []
        for i, (title, snippet) in enumerate(zip(titles, results)):
            t = title.get_text(strip=True)
            s = snippet.get_text(strip=True)
            formatted_results.append(f"{i+1}. {t}\n{s}")
            
        return "\n\n".join(formatted_results)
    except Exception as e:
        return f"Error performing web search: {str(e)}"

if __name__ == "__main__":
    mcp.run()
