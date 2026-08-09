from mcp.server.fastmcp import FastMCP
import wikipedia

mcp = FastMCP("wikipedia_tool")

@mcp.tool()
def wikipedia_summary(topic: str, sentences: int = 3) -> str:
    """Retrieves a summary of a topic from Wikipedia."""
    try:
        return wikipedia.summary(topic, sentences=sentences)
    except wikipedia.exceptions.DisambiguationError as e:
        options = ", ".join(e.options[:5])
        return f"Topic is ambiguous. Did you mean one of these? {options}"
    except wikipedia.exceptions.PageError:
        return f"No Wikipedia page found for '{topic}'."
    except Exception as e:
        return f"Error retrieving Wikipedia summary: {str(e)}"

if __name__ == "__main__":
    mcp.run()
